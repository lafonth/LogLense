/**
 * Après le dédoublonnage des classements (a5ef11c) et des `CombatantInfo` (0271e8f), quatre
 * requêtes de `src/lib/wcl/` restent en une-par-rencontre alors que leur signature accepte
 * `fightIDs: [Int]!` — `Q_DAMAGE`, `Q_ROTATION`, `Q_CAST_EVENTS` et le volet `deaths` de
 * `Q_FIGHT_CONTEXT`. Toutes partent de `fetchFightData`, soit 4×N requêtes par rapport.
 *
 * Elles ne se dédoublonnent pas comme les deux précédentes. `report.rankings` porte `fightID`
 * sur chaque entrée, `events(CombatantInfo)` porte `fight` sur chaque ligne : c'est ce
 * discriminant qui rendait le lot séparable. **`table(...)` n'en a aucun** — WCL agrège les
 * combats demandés en une table unique. Une table de dégâts de deux boss additionnée, ce n'est
 * pas un chiffre décalé : c'est une rotation, un ilvl et un DPS attribués à la mauvaise pull.
 *
 * D'où trois questions, qu'aucune lecture du code ne tranche :
 *
 *   1. **L'agrégation est-elle bien ce que fait `table` ?** À vérifier, pas à supposer : si une
 *      clé par combat existait, tout le reste tomberait.
 *   2. **Combien coûtent N `table` en alias dans un seul document ?** C'est le seul contournement
 *      possible : un aller-retour au lieu de N, mais WCL facture en points par heure, et si N
 *      alias coûtent N points on n'a acheté que de la latence — que ce projet ne paie pas.
 *      Mesuré sur `rateLimitData.pointsSpentThisHour`, avant et après, coût de la lecture déduit.
 *   3. **`events(Casts)` porte-t-il `fight`, et comment se répartit `limit` sur un lot ?**
 *      `limit` vaut pour le document entier : un lot de cinq combats à 40 événements pourrait
 *      rendre les 40 premiers du premier combat et rien des autres — l'ouverture des quatre
 *      autres serait perdue en silence.
 *
 * Usage: node scripts/probe-fight-tables-batch.ts [code]
 *        (sans argument, résout un rapport depuis les classements mondiaux)
 * Requires: WCL_CLIENT_ID et WCL_CLIENT_SECRET dans .env.local
 */
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import process from 'node:process';

process.loadEnvFile(resolve(process.cwd(), '.env.local'));

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

/** Ce que `fetchFightData` demande aujourd'hui pour l'ouverture. */
const OPENING_EVENT_LIMIT = 40;

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

async function gql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
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

/** Le lot de `CombatantInfo` — déjà dédoublonné en production, sert ici à trouver un acteur. */
const Q_COMBATANT = `
  query($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) {
        events(dataType: CombatantInfo, fightIDs: $fightIDs) { data }
      }
    }
  }`;

/** `Q_DAMAGE`, à l'identique de la production. */
const Q_DAMAGE = `
  query($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
    reportData {
      report(code: $code) {
        table(dataType: DamageDone, fightIDs: $fightIDs, sourceID: $sourceID, wipeCutoff: 0)
      }
    }
  }`;

/** Le volet `deaths` de `Q_FIGHT_CONTEXT`, isolé : c'est la table, pas la liste de pulls, qui est en jeu. */
const Q_DEATHS = `
  query($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) {
        table(dataType: Deaths, fightIDs: $fightIDs)
      }
    }
  }`;

/** `Q_DEATHS`, plus `limit` : le plafond de lignes est-il un défaut qu'on relève, ou un mur ? */
const Q_DEATHS_LIMIT = `
  query($code: String!, $fightIDs: [Int]!, $limit: Int!) {
    reportData {
      report(code: $code) {
        table(dataType: Deaths, fightIDs: $fightIDs, limit: $limit)
      }
    }
  }`;

/** `Q_CAST_EVENTS`, plus `nextPageTimestamp` : c'est lui qui dirait qu'un lot est tronqué. */
const Q_CAST_EVENTS = `
  query($code: String!, $fightIDs: [Int]!, $sourceID: Int!, $limit: Int!) {
    reportData {
      report(code: $code) {
        events(dataType: Casts, fightIDs: $fightIDs, sourceID: $sourceID, limit: $limit) {
          data
          nextPageTimestamp
        }
      }
    }
  }`;

const Q_RATE_LIMIT = `
  query {
    rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }
  }`;

/**
 * N tables de dégâts en alias dans un seul document, un combat chacune. Construit à la main
 * parce que le nombre d'alias est celui du lot : GraphQL n'a pas de champ variadique.
 * Les identifiants de combat partent en littéraux — ce sont des entiers venant de l'API,
 * jamais d'une entrée utilisateur.
 */
function aliasedDamageQuery(fightIds: number[]): string {
  const fields = fightIds
    .map(
      (id, i) =>
        `        f${i}: table(dataType: DamageDone, fightIDs: [${id}], sourceID: $sourceID, wipeCutoff: 0)`
    )
    .join('\n');
  return `
  query($code: String!, $sourceID: Int!) {
    reportData {
      report(code: $code) {
${fields}
      }
    }
  }`;
}

interface Fight {
  id: number;
  name: string;
  encounterID: number;
  startTime: number;
  endTime: number;
}

type Json = Record<string, unknown>;

interface TableResponse {
  reportData: { report: (Json & { table?: Json }) | null };
}

interface EventsResponse {
  reportData: {
    report: { events: { data: Json[]; nextPageTimestamp: number | null } | null } | null;
  };
}

/** `table` rend du JSON non typé ; seule la couche `data` est stable d'un `dataType` à l'autre. */
function tableData(table: unknown): Json {
  const t = table as { data?: unknown } | null;
  return (t?.data as Json) ?? {};
}

function entriesOf(table: unknown): Json[] {
  const e = tableData(table).entries;
  return Array.isArray(e) ? (e as Json[]) : [];
}

/** Le total de dégâts d'une table : ce qu'un lot agrégé additionnerait. */
function damageTotal(table: unknown): number {
  return entriesOf(table).reduce((sum, e) => sum + (typeof e.total === 'number' ? e.total : 0), 0);
}

/**
 * Ce qui doit être identique pour qu'on ait le droit de dire « c'est la même table ». Les
 * abilités et leurs totaux, triés : c'est exactement ce que `parseCasts` et `DamageBreakdown`
 * lisent, donc c'est ce qu'un alias doit reproduire au chiffre près.
 */
function tableFingerprint(table: unknown): string {
  return entriesOf(table)
    .map((e) => `${String(e.guid ?? e.name)}@${String(e.total)}`)
    .sort()
    .join('|');
}

/** Les clés scalaires d'un objet : c'est là, et nulle part ailleurs, que serait un discriminant. */
function scalarKeys(row: Json): string[] {
  return Object.keys(row).filter((k) => {
    const v = row[k];
    return v === null || (typeof v !== 'object' && typeof v !== 'undefined');
  });
}

async function points(token: string): Promise<number> {
  const res = await gql<{ rateLimitData: { pointsSpentThisHour: number } }>(
    token,
    Q_RATE_LIMIT,
    {}
  );
  return res.rateLimitData.pointsSpentThisHour;
}

/**
 * Le coût réel d'une forme de requête, en points WCL.
 *
 * `rateLimitData` est elle-même une requête : sans déduire son propre coût, toute mesure
 * serait décalée d'autant, et c'est justement l'ordre de grandeur qu'on cherche à départager.
 */
function makeMeter(token: string, overhead: number) {
  return async function costOf<T>(label: string, run: () => Promise<T>): Promise<T> {
    const before = await points(token);
    const value = await run();
    const after = await points(token);
    const cost = after - before - overhead;
    console.log(`  ${label.padEnd(46)} ${cost.toFixed(2).padStart(8)} point(s)`);
    return value;
  };
}

/**
 * Un rapport de raid réel, sans argument. Les zones récentes sont majoritairement des donjons
 * (pas de difficulté 5, pas de classement), d'où le balayage à rebours : on prend la première
 * qui rend un log classé.
 */
async function resolveCode(token: string): Promise<string> {
  const zones = await gql<{
    worldData: {
      zones: { id: number; name: string; encounters: { id: number; name: string }[] }[];
    };
  }>(token, Q_LATEST_ZONE, {});

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

/**
 * Un acteur présent sur **tous** les combats retenus. Sans lui, une table vide se lirait comme
 * une agrégation ratée alors que le joueur n'était simplement pas là.
 */
async function resolveActor(token: string, code: string, fightIds: number[]): Promise<number> {
  const res = await gql<EventsResponse>(token, Q_COMBATANT, { code, fightIDs: fightIds });
  const rows = res.reportData.report?.events?.data ?? [];

  const seen = new Map<number, Set<number>>();
  for (const row of rows) {
    const src = row.sourceID;
    const fight = row.fight;
    if (typeof src !== 'number' || typeof fight !== 'number') continue;
    seen.set(src, (seen.get(src) ?? new Set()).add(fight));
  }

  for (const [src, fights] of seen) {
    if (fightIds.every((id) => fights.has(id))) return src;
  }
  throw new Error("Aucun joueur n'est présent sur tous les combats retenus.");
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
  const fights = [...byEncounter.values()].slice(0, 4);
  if (fights.length < 2) {
    throw new Error('Ce rapport a moins de deux rencontres : lot non testable.');
  }

  const ids = fights.map((f) => f.id);
  const sourceID = await resolveActor(token, code, ids);

  console.log(`Rapport « ${report.title} » (${code})`);
  console.log(`Combats retenus : ${fights.map((f) => `#${f.id} ${f.name}`).join(', ')}`);
  console.log(`Acteur commun : sourceID=${sourceID}\n`);

  // Le coût propre de `rateLimitData`, à déduire de chaque mesure.
  const p0 = await points(token);
  const p1 = await points(token);
  const overhead = p1 - p0;
  const meter = makeMeter(token, overhead);
  console.log(`Coût propre d'une lecture de rateLimitData : ${overhead.toFixed(2)} point(s)\n`);

  // ─── 1. table(DamageDone) ────────────────────────────────────────────────────────────────
  console.log('1. Table de dégâts — coût des trois formes\n');

  const solo = new Map<number, unknown>();
  await meter(`${ids.length} documents, un combat chacun (production)`, async () => {
    for (const f of fights) {
      const res = await gql<TableResponse>(token, Q_DAMAGE, {
        code,
        fightIDs: [f.id],
        sourceID,
      });
      solo.set(f.id, res.reportData.report?.table);
    }
  });

  const batch = await meter('1 document, fightIDs: [tous les combats]', async () => {
    const res = await gql<TableResponse>(token, Q_DAMAGE, { code, fightIDs: ids, sourceID });
    return res.reportData.report?.table;
  });

  const aliased = await meter(`1 document, ${ids.length} table(...) en alias`, async () => {
    const res = await gql<Json & { reportData: { report: Json | null } }>(
      token,
      aliasedDamageQuery(ids),
      { code, sourceID }
    );
    return res.reportData.report ?? {};
  });

  // ─── 2. Le lot agrège-t-il, ou porte-t-il un discriminant ? ──────────────────────────────
  console.log('\n2. Le lot `fightIDs` est-il séparable ?\n');

  const soloTotals = fights.map((f) => damageTotal(solo.get(f.id)));
  const sum = soloTotals.reduce((a, b) => a + b, 0);
  const batchTotal = damageTotal(batch);

  for (const [i, f] of fights.entries()) {
    console.log(`  solo #${String(f.id).padStart(3)} ${f.name.padEnd(24)} ${soloTotals[i]}`);
  }
  console.log(`  somme des requêtes isolées                    ${sum}`);
  console.log(`  lot fightIDs                                  ${batchTotal}`);

  const batchKeys = scalarKeys(tableData(batch));
  const entryKeys = scalarKeys(entriesOf(batch)[0] ?? {});
  console.log(`\n  Clés scalaires de la table du lot   : ${batchKeys.join(', ') || '(aucune)'}`);
  console.log(`  Clés scalaires d'une entrée du lot  : ${entryKeys.join(', ') || '(aucune)'}`);

  // Un discriminant serait une clé dont les valeurs partitionnent les entrées en autant de
  // groupes que de combats demandés. Sur une table agrégée, il n'y en a pas — mais c'est
  // l'hypothèse à réfuter, pas à affirmer.
  const rows = entriesOf(batch);
  const discriminant = entryKeys.find((k) => {
    const values = new Set(rows.map((r) => JSON.stringify(r[k])));
    return values.size === fights.length && ids.every((id) => values.has(JSON.stringify(id)));
  });

  console.log(
    `\n  VERDICT — ${
      discriminant
        ? `une clé « ${discriminant} » porte l'id du combat : le lot serait séparable, à vérifier entrée par entrée.`
        : batchTotal === sum
          ? 'aucun discriminant, et le total du lot vaut la somme des combats : `table` agrège. Un lot `fightIDs` est inutilisable ici.'
          : `aucun discriminant, et le total du lot (${batchTotal}) ne vaut pas la somme (${sum}) : la table du lot n'est ni séparable ni reconstituable.`
    }`
  );

  // ─── 3. Les alias reproduisent-ils les requêtes isolées ? ────────────────────────────────
  console.log('\n3. Les alias reproduisent-ils, au chiffre près, les requêtes isolées ?\n');

  let allMatch = true;
  for (const [i, f] of fights.entries()) {
    const got = tableFingerprint((aliased as Json)[`f${i}`]);
    const want = tableFingerprint(solo.get(f.id));
    const ok = got === want && want !== '';
    if (!ok) allMatch = false;
    console.log(
      `  f${i} → #${String(f.id).padStart(3)} ${f.name.padEnd(24)} ${
        ok ? 'identique' : got === want ? 'identiques mais VIDES' : 'DIVERGENT'
      }`
    );
  }
  console.log(
    `\n  VERDICT — les alias ${allMatch ? 'rendent exactement les tables isolées.' : 'NE reproduisent PAS les tables isolées : forme inutilisable.'}`
  );

  // ─── 4. table(Deaths) ────────────────────────────────────────────────────────────────────
  console.log('\n4. Table des morts — même question, autre dataType\n');

  const soloDeaths = new Map<number, Json[]>();
  for (const f of fights) {
    const res = await gql<TableResponse>(token, Q_DEATHS, { code, fightIDs: [f.id] });
    soloDeaths.set(f.id, entriesOf(res.reportData.report?.table));
  }
  const batchDeaths = await gql<TableResponse>(token, Q_DEATHS, { code, fightIDs: ids }).then((r) =>
    entriesOf(r.reportData.report?.table)
  );

  const deathSum = fights.reduce((n, f) => n + (soloDeaths.get(f.id)?.length ?? 0), 0);
  for (const f of fights) {
    console.log(
      `  solo #${String(f.id).padStart(3)} ${f.name.padEnd(24)} ${soloDeaths.get(f.id)?.length ?? 0} mort(s)`
    );
  }
  console.log(`  somme des requêtes isolées                    ${deathSum}`);
  console.log(`  lot fightIDs                                  ${batchDeaths.length}`);

  const deathKeys = scalarKeys(batchDeaths[0] ?? {});
  console.log(`\n  Clés scalaires d'une entrée du lot  : ${deathKeys.join(', ') || '(aucune)'}`);
  const deathDiscriminant = deathKeys.find((k) => {
    const values = new Set(batchDeaths.map((r) => JSON.stringify(r[k])));
    return ids.every((id) => values.has(JSON.stringify(id)));
  });

  if (!deathDiscriminant) {
    console.log(
      "  VERDICT — aucune clé ne porte l'id du combat. `parseFightContext` cherche l'acteur par " +
        "`id` : sur un lot, il prendrait la mort d'un autre boss."
    );
  } else {
    // Le discriminant doit aussi être là quand on ne demande qu'un combat : le chemin d'une
    // analyse isolée passera par le même filtre, et une clé qui n'apparaîtrait qu'en lot le
    // ferait rendre zéro mort sur tout.
    const soloCarries = fights.every((f) =>
      (soloDeaths.get(f.id) ?? []).every((r) => r[deathDiscriminant] === f.id)
    );

    // Le compte ne suffit pas : il faut que le groupe d'un combat soit *le* groupe de ce combat.
    // Deux boss peuvent avoir le même nombre de morts.
    const regrouped = fights.every((f) => {
      const want = (soloDeaths.get(f.id) ?? [])
        .map((r) => `${String(r.id)}@${String(r.timestamp)}`)
        .sort()
        .join('|');
      const got = batchDeaths
        .filter((r) => r[deathDiscriminant] === f.id)
        .map((r) => `${String(r.id)}@${String(r.timestamp)}`)
        .sort()
        .join('|');
      return want === got;
    });

    console.log(
      `  Requête à un seul combat : « ${deathDiscriminant} » ${soloCarries ? 'présent et égal à l’id demandé' : 'ABSENT ou incorrect'}`
    );
    console.log(
      `  Regroupement par « ${deathDiscriminant} » : ${regrouped ? 'reproduit chaque requête isolée, mort pour mort' : 'DIVERGE des requêtes isolées'}`
    );

    // Le plafond réel. La route accepte 20 rencontres ; une table agrégée de 20 pulls peut
    // dépasser plusieurs centaines de lignes, et une table tronquée perdrait des morts en
    // silence — indistinguable d'un raid qui n'est pas mort.
    const all = (report.fights ?? []).slice(0, 20);
    if (all.length > fights.length) {
      const sat = await gql<TableResponse>(token, Q_DEATHS, {
        code,
        fightIDs: all.map((f) => f.id),
      }).then((r) => entriesOf(r.reportData.report?.table));
      const covered = new Set(sat.map((r) => r[deathDiscriminant] as number));

      // « Tous les combats représentés » ne prouve rien : une table plafonnée à N lignes peut
      // très bien garder une mort de chacun et jeter le reste. La seule preuve est la somme des
      // requêtes isolées — d'où ces N requêtes, payées une fois ici pour ne plus l'être ensuite.
      let expected = 0;
      for (const f of all) {
        const one = await gql<TableResponse>(token, Q_DEATHS, { code, fightIDs: [f.id] });
        expected += entriesOf(one.reportData.report?.table).length;
      }

      console.log(
        `  Saturation — ${all.length} combats demandés → ${sat.length} ligne(s), ` +
          `${covered.size} combat(s) représenté(s), ${expected} attendue(s) — ` +
          `${sat.length === expected ? 'complet' : 'TRONQUÉ'}`
      );
      if (sat.length !== expected) {
        // Un plafond rond — 200 — ressemble davantage à un `limit` par défaut qu'à un mur. La
        // distinction décide de tout : un défaut se relève par argument, un mur impose de
        // découper le lot et de tenir un seuil qu'aucune réponse ne déclare.
        const lifted = await gql<TableResponse>(token, Q_DEATHS_LIMIT, {
          code,
          fightIDs: all.map((f) => f.id),
          limit: 10000,
        })
          .then((r) => entriesOf(r.reportData.report?.table).length)
          .catch((e: unknown) => `refusé (${e instanceof Error ? e.message : String(e)})`);

        console.log(`  Avec limit: 10000 → ${String(lifted)} ligne(s), ${expected} attendue(s)`);
        console.log(
          lifted === expected
            ? '  VERDICT — le plafond est le `limit` par défaut, pas un mur : passé explicitement, ' +
                'le lot est complet. Le dédoublonnage tient, à condition de porter `limit` et de ' +
                'vérifier que chaque combat demandé est représenté.'
            : `  VERDICT — la table plafonne à ~${sat.length} lignes et \`limit\` n'y change rien. ` +
                'Une mort absente ne se distingue pas d’un raid qui n’est pas mort : le ' +
                'dédoublonnage imposerait de découper le lot sous un seuil que rien ne déclare.'
        );
        return;
      }
    }

    console.log(
      `  VERDICT — ${
        soloCarries && regrouped
          ? `« ${deathDiscriminant} » porte l'id du combat, en lot comme isolé : la table des morts se dédoublonne, une requête pour tout le rapport.`
          : `« ${deathDiscriminant} » porte l'id du combat mais ne reproduit pas les requêtes isolées : ne rien dédoublonner.`
      }`
    );
  }

  // ─── 5. events(Casts) : discriminant et répartition de `limit` ───────────────────────────
  console.log("\n5. Événements de cast — discriminant, et ce que `limit` fait d'un lot\n");

  async function casts(fightIDs: number[], limit: number) {
    const res = await gql<EventsResponse>(token, Q_CAST_EVENTS, {
      code,
      fightIDs,
      sourceID,
      limit,
    });
    const events = res.reportData.report?.events;
    return { rows: events?.data ?? [], nextPage: events?.nextPageTimestamp ?? null };
  }

  const soloCasts = new Map<number, Json[]>();
  for (const f of fights) {
    const { rows: r } = await casts([f.id], OPENING_EVENT_LIMIT);
    soloCasts.set(f.id, r);
    console.log(
      `  solo #${String(f.id).padStart(3)} ${f.name.padEnd(24)} ${r.length} événement(s)`
    );
  }

  const naive = await casts(ids, OPENING_EVENT_LIMIT);
  const scaled = await casts(ids, OPENING_EVENT_LIMIT * ids.length);

  const castKeys = scalarKeys(naive.rows[0] ?? {});
  console.log(`\n  Clés scalaires d'un événement du lot : ${castKeys.join(', ') || '(aucune)'}`);

  // `fight` sur un événement de cast n'est pas documenté ; s'il manque, seul le timestamp
  // rattacherait — une dérivation, pas un contrat.
  const hasFight = naive.rows.length > 0 && naive.rows.every((r) => typeof r.fight === 'number');
  console.log(`  Champ « fight » sur chaque événement : ${hasFight ? 'présent' : 'ABSENT'}`);

  function spread(label: string, res: { rows: Json[]; nextPage: number | null }) {
    const per = new Map<number, number>();
    for (const r of res.rows) {
      const key = typeof r.fight === 'number' ? r.fight : -1;
      per.set(key, (per.get(key) ?? 0) + 1);
    }
    const detail = ids.map((id) => `#${id}:${per.get(id) ?? 0}`).join(' ');
    console.log(
      `  ${label.padEnd(34)} ${String(res.rows.length).padStart(4)} événement(s)  ${detail}` +
        `${res.nextPage === null ? '' : `  nextPage=${res.nextPage}`}`
    );
  }

  console.log('');
  spread(`lot, limit=${OPENING_EVENT_LIMIT}`, naive);
  spread(`lot, limit=${OPENING_EVENT_LIMIT * ids.length}`, scaled);

  // L'ouverture, c'est le début de chaque combat : un lot qui rend bien N×40 événements mais
  // en manque les premiers d'un combat est aussi inutilisable qu'un lot tronqué.
  const complete =
    hasFight &&
    fights.every((f) => {
      const want = soloCasts.get(f.id) ?? [];
      const got = scaled.rows.filter((r) => r.fight === f.id);
      if (want.length === 0) return got.length === 0;
      return got.length > 0 && got[0].timestamp === want[0].timestamp;
    });

  console.log(
    `\n  VERDICT — ${
      !hasFight
        ? "les événements ne portent pas leur combat : le lot n'est pas séparable."
        : complete
          ? `séparable par « fight », à condition de demander limit = ${OPENING_EVENT_LIMIT}×N et de vérifier nextPageTimestamp.`
          : 'le champ « fight » est là, mais le lot ne rend pas le début de chaque combat : `limit` tronque avant.'
    }`
  );

  console.log(
    `\nPoints dépensés par la sonde : ${(await points(token)) - p0} sur ${
      (await gql<{ rateLimitData: { limitPerHour: number } }>(token, Q_RATE_LIMIT, {}))
        .rateLimitData.limitPerHour
    } par heure.`
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
