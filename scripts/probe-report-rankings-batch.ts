/**
 * `report.rankings` accepte `fightIDs: [Int]!`, mais `report-pipeline.ts` ne lui passe jamais
 * qu'un seul combat, et `findInRankings` lit `data[0]` sans regarder ce que cette entrée
 * décrit. Question préalable au dédoublonnage : **quand on demande N combats, la réponse
 * porte-t-elle un discriminant qui rattache chaque entrée à son combat ?**
 *
 * Sans discriminant, l'ordre de `data` serait la seule clé — une correspondance implicite
 * qu'aucun contrat d'API ne garantit, et qui attribuerait silencieusement le parse d'un boss
 * à un autre. Le gain (2N requêtes → 2) ne vaut pas ce risque.
 *
 * Le script confronte, sur le même rapport :
 *   1. une requête par combat, comme aujourd'hui ;
 *   2. une seule requête portant tous les combats ;
 * puis dump les clés de chaque entrée de `data` et vérifie que le discriminant, s'il existe,
 * suffit à retrouver le même acteur avec le même montant que la requête isolée.
 *
 * Usage: npx tsx scripts/probe-report-rankings-batch.ts <code>
 *        npx tsx scripts/probe-report-rankings-batch.ts <nom> <serveur> <region> <encounterId> [diff]
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

const Q_FIND_REPORT = `
  query($name: String!, $server: String!, $region: String!, $encounterId: Int!, $difficulty: Int!) {
    characterData {
      character(name: $name, serverSlug: $server, serverRegion: $region) {
        encounterRankings(encounterID: $encounterId, difficulty: $difficulty, metric: dps)
      }
    }
  }`;

const Q_FIGHTS = `
  query($code: String!) {
    reportData {
      report(code: $code) {
        title
        fights(killType: Encounters) { id name encounterID kill difficulty }
      }
    }
  }`;

const Q_RANKINGS = `
  query($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) {
        rankings(fightIDs: $fightIDs, playerMetric: dps)
      }
    }
  }`;

interface RankedPlayer {
  name: string;
  amount?: number;
  rankPercent?: number;
}

interface RankingsEntry {
  roles?: Record<string, { characters?: RankedPlayer[] } | undefined>;
  [key: string]: unknown;
}

interface Fight {
  id: number;
  name: string;
  encounterID: number;
  kill: boolean | null;
  difficulty: number | null;
}

type RankingsResponse = {
  reportData: { report: { rankings: { data?: RankingsEntry[] } } | null };
};

function charactersOf(entry: RankingsEntry | undefined): RankedPlayer[] {
  const roles = entry?.roles ?? {};
  return Object.values(roles).flatMap((bucket) => bucket?.characters ?? []);
}

/** Les clés d'une entrée, hors `roles` : c'est là que se trouverait un discriminant. */
function discriminantKeys(entry: RankingsEntry): string[] {
  return Object.keys(entry).filter((k) => k !== 'roles');
}

function preview(entry: RankingsEntry): string {
  const out: string[] = [];
  for (const key of discriminantKeys(entry)) {
    const value = entry[key];
    const shown =
      value === null || typeof value !== 'object' ? JSON.stringify(value) : `<${typeof value}>`;
    out.push(`${key}=${shown}`);
  }
  return out.join('  ') || '(aucune clé hors roles)';
}

async function resolveCode(token: string, argv: string[]): Promise<string> {
  if (argv.length < 4) return argv[0];
  const [name, server, region, encounterRaw, difficultyRaw] = argv;
  const payload = await gql<{
    characterData: {
      character: {
        encounterRankings: { ranks: { amount: number; report: { code: string } }[] };
      } | null;
    };
  }>(token, Q_FIND_REPORT, {
    name,
    server,
    region,
    encounterId: Number(encounterRaw),
    difficulty: Number(difficultyRaw ?? 5),
  });
  const ranks = payload.characterData.character?.encounterRankings?.ranks ?? [];
  if (ranks.length === 0) throw new Error('Aucun parse pour ce personnage sur cette rencontre.');
  const best = ranks.reduce((a, b) => (a.amount > b.amount ? a : b));
  console.log(`Rapport retenu depuis le meilleur parse : ${best.report.code}\n`);
  return best.report.code;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error(
      'Usage: npx tsx scripts/probe-report-rankings-batch.ts <code>\n' +
        '       npx tsx scripts/probe-report-rankings-batch.ts <nom> <serveur> <region> <encounterId> [diff]'
    );
    process.exit(1);
  }

  const token = await getToken();
  const code = await resolveCode(token, argv);

  const meta = await gql<{
    reportData: { report: { title: string; fights: Fight[] } | null };
  }>(token, Q_FIGHTS, { code });

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
  const solo = new Map<number, RankingsEntry[]>();
  for (const f of fights) {
    const res = await gql<RankingsResponse>(token, Q_RANKINGS, { code, fightIDs: [f.id] });
    const data = res.reportData.report?.rankings?.data ?? [];
    solo.set(f.id, data);
    console.log(
      `solo  #${String(f.id).padStart(3)} ${f.name.padEnd(22)} data.length=${data.length}  ` +
        `${charactersOf(data[0]).length} joueur(s)  ${data[0] ? preview(data[0]) : ''}`
    );
  }

  // 2. Une seule requête pour tous les combats.
  const batchRes = await gql<RankingsResponse>(token, Q_RANKINGS, {
    code,
    fightIDs: fights.map((f) => f.id),
  });
  const batch = batchRes.reportData.report?.rankings?.data ?? [];

  console.log(`\nlot   ${fights.length} combats demandés → data.length=${batch.length}`);
  batch.forEach((entry, i) => {
    console.log(`  [${i}] ${charactersOf(entry).length} joueur(s)  ${preview(entry)}`);
  });

  console.log('\nJSON brut de la première entrée du lot, hors roles :');
  const first = batch[0];
  if (first) {
    const stripped: Record<string, unknown> = {};
    for (const k of discriminantKeys(first)) stripped[k] = first[k];
    console.log(JSON.stringify(stripped, null, 2).slice(0, 2000));
  }

  // 3. Verdict : le discriminant existe-t-il, et rattache-t-il chaque entrée à son combat ?
  const keySets = batch.map((e) => discriminantKeys(e));
  const shared = keySets[0]?.filter((k) => keySets.every((ks) => ks.includes(k))) ?? [];
  const candidates = shared.filter((k) => {
    const values = batch.map((e) => JSON.stringify(e[k]));
    return new Set(values).size === batch.length;
  });

  console.log(`\nClés présentes sur toutes les entrées : ${shared.join(', ') || '—'}`);
  console.log(`Clés dont la valeur distingue les entrées : ${candidates.join(', ') || '—'}`);

  // Un combat sans classement ne rend rien, seul comme en lot : le lot doit être comparé à la
  // liste des combats qui ont réellement une entrée, pas à celle des combats demandés. Compter
  // les absents comme une agrégation ferait échouer la sonde sur un rapport parfaitement ventilé.
  const ranked = fights.filter((f) => (solo.get(f.id)?.length ?? 0) > 0);
  const unranked = fights.filter((f) => (solo.get(f.id)?.length ?? 0) === 0);
  if (unranked.length > 0) {
    console.log(
      `\nSans classement, seuls comme en lot : ${unranked.map((f) => `#${f.id} ${f.name}`).join(', ')}`
    );
  }

  if (batch.length !== ranked.length) {
    console.log(
      `\nVERDICT — ${ranked.length} combats classés, ${batch.length} entrée(s) rendue(s) en lot : ` +
        "l'API n'entretient pas une entrée par combat. Dédoublonnage impossible."
    );
    return;
  }

  // Le discriminant ne vaut que s'il retrouve les mêmes montants que la requête isolée.
  const fightIdKey = candidates.find((k) => ranked.every((f) => batch.some((e) => e[k] === f.id)));

  if (!fightIdKey) {
    console.log(
      '\nVERDICT — aucune clé ne porte un identifiant de combat exploitable. ' +
        "Seul l'ordre de `data` correspondrait, ce qui n'est pas un contrat. Ne rien faire."
    );
    return;
  }

  let mismatches = 0;
  for (const f of ranked) {
    const entry = batch.find((e) => e[fightIdKey] === f.id);
    const expected = charactersOf(solo.get(f.id)?.[0]);
    const got = charactersOf(entry);
    const same =
      entry !== undefined &&
      expected.length === got.length &&
      expected.every((c) => {
        const match = got.find((g) => g.name === c.name);
        return match !== undefined && Math.round(match.amount ?? 0) === Math.round(c.amount ?? 0);
      });
    if (!same) mismatches++;
    console.log(
      `  #${String(f.id).padStart(3)} ${f.name.padEnd(22)} solo=${expected.length} lot=${got.length} ${
        same ? 'identique' : 'DIVERGENT'
      }`
    );
  }

  // L'ordre du lot est-il celui de la demande ? S'il ne l'est pas, `data[0]` est un bug latent.
  const batchOrder = batch.map((e) => e[fightIdKey]);
  const askedOrder = ranked.map((f) => f.id);
  const orderPreserved = JSON.stringify(batchOrder) === JSON.stringify(askedOrder);
  console.log(
    `\nOrdre demandé  : ${askedOrder.join(', ')}\nOrdre rendu    : ${batchOrder.join(', ')}  ` +
      `→ ${orderPreserved ? 'préservé' : "NON préservé : l'index est inutilisable, le discriminant est obligatoire"}`
  );

  console.log(
    `\nVERDICT — discriminant « ${fightIdKey} », ${
      mismatches === 0
        ? 'toutes les entrées reproduisent la requête isolée : dédoublonnage sûr.'
        : `${ranked.length - mismatches}/${ranked.length} entrées concordent : NE PAS dédoublonner.`
    }`
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
