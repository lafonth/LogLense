/**
 * Le prérequis de la spec « mode raid » §3 : **`report.rankings` porte-t-il tous les acteurs
 * du combat, ou seulement celui demandé ?**
 *
 * Le code actuel (`report-pipeline.ts`) n'interroge cette donnée que pour un acteur connu,
 * et cherche son nom dedans. Rien ne prouve que la réponse couvre le raid entier. Les deux
 * issues n'aboutissent pas au même produit : classement par percentile si le raid est
 * couvert, classement par DPS brut — et l'écran doit alors le dire — sinon.
 *
 * Ce script confronte trois sources sur le **même combat** :
 *   1. `report.rankings` : combien de joueurs, et lesquels ;
 *   2. la table `DamageDone` du combat : qui a réellement tapé ;
 *   3. `masterData.actors` : le nom des joueurs du rapport.
 * Si (1) ≈ (2), `report.rankings` couvre le raid. Si (1) vaut un seul joueur, non.
 *
 * Usage: npx tsx scripts/probe-raid-rankings.ts <code> [fightID]
 *        npx tsx scripts/probe-raid-rankings.ts <nom> <serveur> <region> <encounterId> [diff]
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
        masterData { actors(type: "Player") { id name subType } }
      }
    }
  }`;

const Q_PROBE = `
  query($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) {
        rankings(fightIDs: $fightIDs, playerMetric: dps)
        table(dataType: DamageDone, fightIDs: $fightIDs)
      }
    }
  }`;

interface RankedPlayer {
  name: string;
  id?: number;
  amount?: number;
  rankPercent?: number;
  bracketData?: number;
  spec?: string;
  class?: string;
}

interface Fight {
  id: number;
  name: string;
  encounterID: number;
  kill: boolean | null;
  difficulty: number | null;
}

function pct(value: number | undefined): string {
  return typeof value === 'number' ? `${(Math.round(value * 10) / 10).toFixed(1)}%` : '—';
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
      'Usage: npx tsx scripts/probe-raid-rankings.ts <code> [fightID]\n' +
        '       npx tsx scripts/probe-raid-rankings.ts <nom> <serveur> <region> <encounterId> [diff]'
    );
    process.exit(1);
  }

  const token = await getToken();
  const code = await resolveCode(token, argv);
  const wantedFight = argv.length === 2 ? Number(argv[1]) : null;

  const meta = await gql<{
    reportData: {
      report: {
        title: string;
        fights: Fight[];
        masterData: { actors: { id: number; name: string; subType: string }[] };
      } | null;
    };
  }>(token, Q_FIGHTS, { code });

  const report = meta.reportData.report;
  if (!report) throw new Error(`Rapport ${code} introuvable ou privé.`);

  const fights = report.fights ?? [];
  const fight = wantedFight
    ? fights.find((f) => f.id === wantedFight)
    : (fights.find((f) => f.kill) ?? fights[0]);
  if (!fight) throw new Error('Aucun combat de boss dans ce rapport.');

  console.log(`Rapport « ${report.title} » (${code})`);
  console.log(
    `Combat #${fight.id} — ${fight.name} (encounter ${fight.encounterID}, diff ${fight.difficulty}, ${fight.kill ? 'kill' : 'wipe'})`
  );
  console.log(`masterData.actors de type Player : ${report.masterData?.actors?.length ?? 0}\n`);

  const probe = await gql<{
    reportData: {
      report: {
        rankings: { data?: { roles?: Record<string, { characters?: RankedPlayer[] }> }[] };
        table: { data?: { entries?: { name: string; total: number; icon?: string }[] } };
      } | null;
    };
  }>(token, Q_PROBE, { code, fightIDs: [fight.id] });

  const entry = probe.reportData.report?.rankings?.data?.[0];
  const roles = entry?.roles ?? {};

  console.log('report.rankings, par rôle :');
  let ranked: RankedPlayer[] = [];
  for (const [role, bucket] of Object.entries(roles)) {
    const chars = bucket?.characters ?? [];
    console.log(`  ${role.padEnd(8)} ${chars.length} joueur(s)`);
    ranked = ranked.concat(chars);
  }
  console.log(`  TOTAL    ${ranked.length} joueur(s)\n`);

  const damageEntries = probe.reportData.report?.table?.data?.entries ?? [];
  const damagers = damageEntries.filter((e) => e.total > 0);
  console.log(`table DamageDone du combat : ${damagers.length} acteur(s) avec des dégâts\n`);

  console.log('Détail de report.rankings :');
  for (const c of ranked.slice(0, 40)) {
    console.log(
      `  ${(c.name ?? '?').padEnd(16)} ${(c.spec ?? '?').padEnd(14)} ${Math.round(
        c.amount ?? 0
      )
        .toString()
        .padStart(8)} dps  parse ${pct(c.rankPercent).padStart(7)}  bracket ${pct(
        c.bracketData
      ).padStart(7)}  id=${c.id ?? '—'}`
    );
  }

  const rankedNames = new Set(ranked.map((c) => c.name));
  const missing = damagers.map((e) => e.name).filter((n) => !rankedNames.has(n));
  console.log(
    `\nDans la table de dégâts mais absents des rankings (${missing.length}) : ${
      missing.slice(0, 20).join(', ') || '—'
    }`
  );

  console.log(
    `\nVERDICT — ${
      ranked.length <= 1
        ? 'report.rankings ne rend QU’UN acteur : branche DPS brut (spec §3, deuxième issue).'
        : 'report.rankings couvre plusieurs acteurs : branche percentile (spec §3, première issue).'
    }`
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
