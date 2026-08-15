/**
 * `Q_COMBATANT` prend `fightIDs: [Int]!`, mais `findCombatantByActorId` ne lui passe jamais
 * qu'un seul combat : analyser un rapport de N rencontres paie N requêtes pour retrouver le
 * même joueur. Question préalable au dédoublonnage, la même qu'en a5ef11c pour les
 * classements : **quand on demande N combats, chaque ligne de `data` dit-elle de quel combat
 * elle vient ?**
 *
 * Ici la question est plus dure que pour `rankings`. Un `CombatantInfo` est une ligne par
 * joueur et par combat : le même `sourceID` revient N fois, et rien ne distingue deux lignes
 * du même joueur si l'API n'expose pas de discriminant. Attribuer le mauvais combattant, ce
 * n'est pas afficher un chiffre décalé — c'est juger l'éligibilité (set bonus, ilvl) sur
 * l'équipement d'une autre pull. Sans discriminant, on ne fait rien.
 *
 * Le script confronte, sur le même rapport :
 *   1. une requête par combat, comme aujourd'hui ;
 *   2. une seule requête portant tous les combats ;
 * puis cherche une clé qui partitionne les lignes du lot en groupes reproduisant exactement
 * les réponses isolées — mêmes acteurs, même équipement, mêmes stats.
 *
 * Vérifie aussi `nextPageTimestamp` : `events` pagine. Un lot tronqué perdrait des combats
 * en silence, ce qui invaliderait le dédoublonnage même avec un discriminant parfait.
 *
 * Usage: npx tsx scripts/probe-combatant-batch.ts [code]
 *        (sans argument, résout un rapport depuis les classements mondiaux)
 * Requires: WCL_CLIENT_ID et WCL_CLIENT_SECRET dans .env.local
 */
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import process from 'node:process';

process.loadEnvFile(resolve(process.cwd(), '.env.local'));

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

async function getToken(): Promise<string> {
  const id = process.env.WCL_CLIENT_ID;
  const secret = process.env.WCL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('WCL_CLIENT_ID / WCL_CLIENT_SECRET absents de .env.local');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Warcraft Logs n'a pas rendu de jeton");
  return json.access_token;
}

async function gql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(`WCL: ${body.errors[0].message}`);
  return body.data as T;
}

const Q_LATEST_ZONE = `
  query {
    worldData {
      zones { id name encounters { id name } }
    }
  }`;

const Q_TOP_LOG = `
  query($encounterID: Int!) {
    worldData {
      encounter(id: $encounterID) {
        characterRankings(metric: dps, difficulty: 5, leaderboard: LogsOnly, page: 1)
      }
    }
  }`;

const Q_FIGHTS = `
  query($code: String!) {
    reportData {
      report(code: $code) {
        title
        fights(killType: Encounters) { id name encounterID startTime endTime }
      }
    }
  }`;

/**
 * `nextPageTimestamp` en plus de `data` : c'est lui qui dirait qu'un lot est tronqué. La
 * requête de production ne le demande pas — elle n'a jamais tenu qu'un combat.
 */
const Q_COMBATANT_PROBE = `
  query($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) {
        events(dataType: CombatantInfo, fightIDs: $fightIDs) { data nextPageTimestamp }
      }
    }
  }`;

interface Fight {
  id: number;
  name: string;
  encounterID: number;
  startTime: number;
  endTime: number;
}

/** Une ligne `CombatantInfo`, telle que WCL la rend : du JSON non typé. */
type Row = Record<string, unknown> & { sourceID?: number };

interface EventsResponse {
  reportData: {
    report: { events: { data: Row[]; nextPageTimestamp: number | null } | null } | null;
  };
}

/**
 * Ce qui doit être identique entre la ligne isolée et la ligne du lot pour qu'on ait le droit
 * de dire « c'est le même combattant ». L'équipement en fait partie : c'est lui qui décide de
 * l'éligibilité, donc c'est lui qu'un mauvais rattachement corromprait.
 */
function fingerprint(row: Row): string {
  const gear = Array.isArray(row.gear)
    ? (row.gear as { id?: number; itemLevel?: number }[]).map((g) => `${g.id}@${g.itemLevel}`)
    : [];
  return JSON.stringify({
    spec: row.specID,
    gear,
    stats: [row.agility, row.strength, row.intellect, row.critMelee, row.hasteMelee, row.mastery],
  });
}

/** Les clés scalaires d'une ligne : c'est là, et nulle part ailleurs, que serait un discriminant. */
function scalarKeys(row: Row): string[] {
  return Object.keys(row).filter((k) => {
    const v = row[k];
    return v === null || (typeof v !== 'object' && typeof v !== 'undefined');
  });
}

async function fetchEvents(token: string, code: string, fightIDs: number[]) {
  const res = await gql<EventsResponse>(token, Q_COMBATANT_PROBE, { code, fightIDs });
  const events = res.reportData.report?.events;
  return { rows: events?.data ?? [], nextPage: events?.nextPageTimestamp ?? null };
}

/**
 * Un rapport de raid réel, sans argument. Les zones récentes sont majoritairement des donjons
 * (pas de difficulté 5, pas de classement), d'où le balayage à rebours : on prend la première
 * qui rend un log classé.
 */
async function resolveCode(token: string): Promise<string> {
  const zones = await gql<{
    worldData: { zones: { id: number; name: string; encounters: { id: number; name: string }[] }[] };
  }>(token, Q_LATEST_ZONE, {});

  // `zones` n'est pas rendu dans l'ordre chronologique : trier par id est ce qui rapproche le
  // plus du palier courant, et c'est lui qu'on veut — un rapport ancien finit archivé, donc
  // illisible sans compte abonné.
  const candidates = [...zones.worldData.zones]
    .filter((z) => (z.encounters?.length ?? 0) >= 6)
    .sort((a, b) => b.id - a.id)
    .slice(0, 8);

  for (const zone of candidates) {
    for (const encounter of zone.encounters.slice(0, 2)) {
      const ranks = await gql<{
        worldData: {
          encounter: { characterRankings: { rankings?: { report?: { code?: string } }[] } } | null;
        };
      }>(token, Q_TOP_LOG, { encounterID: encounter.id }).catch(() => null);

      const code = ranks?.worldData.encounter?.characterRankings?.rankings?.find(
        (r) => r.report?.code
      )?.report?.code;
      if (code) {
        console.log(`Rapport résolu depuis « ${zone.name} / ${encounter.name} » : ${code}\n`);
        return code;
      }
    }
  }
  throw new Error('Aucun rapport classé trouvé ; passe un code de rapport en argument.');
}

async function main() {
  const token = await getToken();
  const code = process.argv[2] ?? (await resolveCode(token));

  const meta = await gql<{ reportData: { report: { title: string; fights: Fight[] } | null } }>(
    token,
    Q_FIGHTS,
    { code }
  );
  const report = meta.reportData.report;
  if (!report) throw new Error(`Rapport ${code} introuvable ou privé.`);

  // Un combat par rencontre, comme le fait la route : c'est la forme qu'aurait le lot.
  const byEncounter = new Map<number, Fight>();
  for (const f of report.fights ?? []) {
    if (!byEncounter.has(f.encounterID)) byEncounter.set(f.encounterID, f);
  }
  const fights = [...byEncounter.values()].slice(0, 5);
  if (fights.length < 2) throw new Error('Ce rapport a moins de deux rencontres : lot non testable.');

  console.log(`Rapport « ${report.title} » (${code})`);
  console.log(`Combats retenus : ${fights.map((f) => `#${f.id} ${f.name}`).join(', ')}\n`);

  // 1. Une requête par combat — la référence.
  const solo = new Map<number, Row[]>();
  for (const f of fights) {
    const { rows, nextPage } = await fetchEvents(token, code, [f.id]);
    solo.set(f.id, rows);
    console.log(
      `solo  #${String(f.id).padStart(3)} ${f.name.padEnd(24)} ${String(rows.length).padStart(2)} ligne(s)` +
        `${nextPage === null ? '' : `  PAGINÉ (nextPageTimestamp=${nextPage})`}`
    );
  }

  const ranked = fights.filter((f) => (solo.get(f.id)?.length ?? 0) > 0);
  if (ranked.length < 2) throw new Error('Moins de deux combats rendent des CombatantInfo.');

  // Le discriminant doit aussi être là quand on ne demande qu'un combat : le chemin d'une
  // analyse isolée passera par le même filtre, et une clé qui n'apparaîtrait qu'en lot le
  // ferait rendre `null` sur tout.
  const soloCarries = ranked.every((f) => (solo.get(f.id) ?? []).every((r) => r.fight === f.id));
  console.log(
    `\nRequête à un seul combat : « fight » ${soloCarries ? 'présent et égal à l’id demandé' : 'ABSENT ou incorrect'}`
  );

  // 2. Une seule requête pour tous les combats.
  const { rows: batch, nextPage } = await fetchEvents(
    token,
    code,
    fights.map((f) => f.id)
  );
  const soloTotal = ranked.reduce((n, f) => n + (solo.get(f.id)?.length ?? 0), 0);

  console.log(`\nlot   ${fights.length} combats demandés → ${batch.length} ligne(s)`);
  console.log(`      somme des requêtes isolées → ${soloTotal} ligne(s)`);

  if (nextPage !== null) {
    console.log(
      `\nVERDICT — le lot est paginé (nextPageTimestamp=${nextPage}) : la réponse est tronquée, ` +
        'un dédoublonnage perdrait des combats en silence. Ne rien faire.'
    );
    return;
  }

  console.log('\nClés scalaires de la première ligne du lot :');
  const first = batch[0];
  if (first) {
    console.log(
      '  ' + scalarKeys(first).map((k) => `${k}=${JSON.stringify(first[k])}`).join('  ')
    );
  }

  if (batch.length !== soloTotal) {
    console.log(
      `\nVERDICT — ${soloTotal} lignes attendues, ${batch.length} rendues : l'API n'entretient pas ` +
        'une ligne par joueur et par combat. Dédoublonnage impossible.'
    );
    return;
  }

  // 3. Le discriminant : une clé qui partitionne le lot en groupes reproduisant chaque réponse
  //    isolée — mêmes acteurs, même équipement, mêmes stats. Rien de moins ne suffit : deux
  //    lignes du même joueur sur deux pulls se ressemblent trop pour se départager à l'œil.
  const shared = scalarKeys(first ?? {}).filter((k) => batch.every((r) => k in r));

  const verdicts: string[] = [];
  let winner: { key: string; direct: boolean } | null = null;

  for (const key of shared) {
    const groups = new Map<string, Row[]>();
    for (const row of batch) {
      const v = JSON.stringify(row[key]);
      groups.set(v, [...(groups.get(v) ?? []), row]);
    }
    if (groups.size !== ranked.length) {
      verdicts.push(`  ${key.padEnd(16)} ${groups.size} groupe(s) pour ${ranked.length} combats — non`);
      continue;
    }

    // La clé porte-t-elle directement l'id du combat, ou seulement une valeur qui distingue ?
    const direct = ranked.every((f) => groups.has(JSON.stringify(f.id)));

    // Chaque groupe doit correspondre, empreinte pour empreinte, à un combat isolé.
    const used = new Set<number>();
    let matched = 0;
    for (const rows of groups.values()) {
      const got = rows.map(fingerprint).sort().join('|');
      const hit = ranked.find((f) => {
        if (used.has(f.id)) return false;
        const want = (solo.get(f.id) ?? []).map(fingerprint).sort().join('|');
        return want === got;
      });
      if (hit) {
        used.add(hit.id);
        matched++;
      }
    }

    const ok = matched === ranked.length;
    verdicts.push(
      `  ${key.padEnd(16)} ${matched}/${ranked.length} groupes reproduisent la requête isolée` +
        `${ok ? (direct ? ' — OUI, et la valeur est l’id du combat' : ' — oui, mais la valeur n’est pas l’id du combat') : ' — non'}`
    );
    if (ok && (!winner || (direct && !winner.direct))) winner = { key, direct };
  }

  console.log('\nCandidats :');
  console.log(verdicts.join('\n') || '  (aucune clé scalaire commune)');

  // 4. Repli : à défaut de clé, les intervalles de temps du combat rattacheraient les lignes.
  //    C'est un rattachement dérivé, pas un contrat d'API — on le signale, on ne s'en sert pas.
  if (!winner) {
    const ts = batch.every((r) => typeof r.timestamp === 'number');
    const inRange =
      ts &&
      ranked.every((f) => {
        const n = batch.filter(
          (r) => (r.timestamp as number) >= f.startTime && (r.timestamp as number) <= f.endTime
        ).length;
        return n === (solo.get(f.id)?.length ?? 0);
      });
    console.log(
      `\nRepli par timestamp : ${
        !ts
          ? 'pas de timestamp sur toutes les lignes'
          : inRange
            ? 'les intervalles [startTime, endTime] ventilent correctement — mais c’est une dérivation, pas un discriminant'
            : 'les intervalles ne ventilent pas correctement'
      }`
    );
    console.log(
      '\nVERDICT — aucune clé ne rattache une ligne à son combat. Ne rien dédoublonner.'
    );
    return;
  }

  console.log(
    `\nDiscriminant — « ${winner.key} »${
      winner.direct
        ? ", qui porte l'id du combat : rattachement sûr, à condition de grouper par cette clé et jamais par l'ordre."
        : " — il distingue les combats mais ne porte pas leur id. Utilisable seulement via une correspondance explicite, à vérifier avant d'y aller."
    }`
  );

  // 5. Le plafond réel. `MAX_ENCOUNTERS_PER_REQUEST` vaut 20, et un `CombatantInfo` par joueur
  //    et par combat fait ~20 lignes chacun : le lot maximal frôle les 400 lignes. Si `events`
  //    pagine avant, le discriminant ne sert à rien — la réponse serait tronquée, et les
  //    combats manquants ne se distinguent pas d'un combat sans combattant.
  const all = (report.fights ?? []).slice(0, 20);
  if (all.length > fights.length) {
    const sat = await fetchEvents(
      token,
      code,
      all.map((f) => f.id)
    );
    const covered = new Set(sat.rows.map((r) => r[winner.key] as number));
    console.log(
      `\nSaturation — ${all.length} combats demandés → ${sat.rows.length} ligne(s), ` +
        `${covered.size} combat(s) représenté(s), nextPageTimestamp=${sat.nextPage}`
    );
    if (sat.nextPage !== null) {
      console.log(
        `\nVERDICT — le lot de ${all.length} combats est paginé : au-delà d'environ ` +
          `${sat.rows.length} lignes la réponse est tronquée. Le dédoublonnage n'est sûr que ` +
          "sous ce plafond — il faut découper le lot, ou ne pas le faire."
      );
      return;
    }
  }

  console.log(
    '\nVERDICT — dédoublonnage sûr : une requête pour tous les combats du rapport, groupée ' +
      `par « ${winner.key} », sans pagination au plafond de la route.`
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
