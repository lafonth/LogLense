/**
 * Confronte les deux sources de percentile, sur le même kill.
 *
 * Constat ouvert : 81,1 % par le chemin personnage contre 67 % par le chemin rapport, pour
 * ce qui semblait être le même combat. Hypothèse lisible dans le code : `pipeline.ts` réduit
 * `dpsParses` au **meilleur** parse du joueur (`reduce((a, b) => a.amount > b.amount ? a : b)`)
 * alors que `report-pipeline.ts` mesure **le combat demandé**. Les deux nombres ne
 * porteraient donc pas sur le même kill, et l'écart ne serait pas un bug d'API.
 *
 * Ce script imprime, côte à côte, le percentile de chaque chemin **et le `code`/`fightID`
 * que chacun a réellement mesuré** — c'est cette colonne-là qui tranche. Si les deux chemins
 * nomment le même combat et divergent quand même, l'hypothèse tombe et il faut lire la
 * documentation WCL sur `rankings(playerMetric:)`.
 *
 * Usage: npx tsx scripts/probe-percentile.ts <nom> <serveur> <region> <encounterId> [difficulté]
 * Exemple: npx tsx scripts/probe-percentile.ts Jumbaa ysondre EU 3306 5
 * Requires: WCL_CLIENT_ID et WCL_CLIENT_SECRET dans .env.local
 */
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import process from 'node:process';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });

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

const Q_CHARACTER = `
  query($name: String!, $server: String!, $region: String!, $encounterId: Int!, $difficulty: Int!) {
    characterData {
      character(name: $name, serverSlug: $server, serverRegion: $region) {
        encounterRankings(encounterID: $encounterId, difficulty: $difficulty, metric: dps)
      }
    }
  }`;

const Q_REPORT = `
  query($code: String!, $fightIDs: [Int]!) {
    reportData { report(code: $code) { rankings(fightIDs: $fightIDs, playerMetric: dps) } }
  }`;

interface Parse {
  amount: number;
  rankPercent: number;
  rankTotalParses: number;
  duration: number;
  report: { code: string; fightID: number };
}

interface RankedPlayer {
  name: string;
  amount?: number;
  rankPercent?: number;
  rankTotalParses?: number;
}

function pct(value: number | undefined): string {
  return typeof value === 'number' ? `${(Math.round(value * 10) / 10).toFixed(1)}%` : '—';
}

async function main() {
  const [name, server, region, encounterRaw, difficultyRaw] = process.argv.slice(2);
  if (!name || !server || !region || !encounterRaw) {
    console.error(
      'Usage: npx tsx scripts/probe-percentile.ts <nom> <serveur> <region> <encounterId> [difficulté]'
    );
    process.exit(1);
  }
  const encounterId = Number(encounterRaw);
  const difficulty = Number(difficultyRaw ?? 5);

  const token = await getToken();

  const characterPayload = await gql<{
    characterData: { character: { encounterRankings: { ranks: Parse[] } } | null };
  }>(token, Q_CHARACTER, { name, server, region, encounterId, difficulty });

  const ranks = characterPayload.characterData.character?.encounterRankings?.ranks ?? [];
  if (ranks.length === 0) {
    console.log('Aucun parse pour ce personnage sur cette rencontre.');
    return;
  }

  // Exactement la réduction de pipeline.ts : le meilleur parse, pas le dernier.
  const best = ranks.reduce((a, b) => (a.amount > b.amount ? a : b));

  console.log(`${ranks.length} kill(s) classés. Le chemin personnage en retient un seul :\n`);
  for (const r of ranks) {
    const flag = r === best ? '→' : ' ';
    console.log(
      `${flag} ${r.report.code}#${r.report.fightID}  ${Math.round(r.amount)
        .toString()
        .padStart(8)} dps  ${pct(r.rankPercent).padStart(7)}  ${(r.duration / 1000).toFixed(1)}s`
    );
  }

  const reportPayload = await gql<{
    reportData: {
      report: {
        rankings: { data: { roles: Record<string, { characters: RankedPlayer[] }> }[] };
      } | null;
    };
  }>(token, Q_REPORT, { code: best.report.code, fightIDs: [best.report.fightID] });

  const entry = reportPayload.reportData.report?.rankings?.data?.[0];
  const mine = Object.values(entry?.roles ?? {})
    .flatMap((role) => role.characters ?? [])
    .find((c) => c.name === name);

  console.log('\nMême combat, les deux chemins :\n');
  console.log(`  chemin personnage  ${pct(best.rankPercent).padStart(7)}  sur ${best.report.code}#${best.report.fightID}  (n=${best.rankTotalParses})`);
  console.log(
    `  chemin rapport     ${pct(mine?.rankPercent).padStart(7)}  sur ${best.report.code}#${best.report.fightID}  (n=${mine?.rankTotalParses ?? '—'})`
  );
  console.log(
    `\n  dps personnage ${Math.round(best.amount)} / dps rapport ${mine?.amount ? Math.round(mine.amount) : '—'}`
  );
  console.log(
    "\nUn écart ici, sur un combat unique et nommé, écarte l'hypothèse « meilleur parse vs\n" +
      'combat demandé » et renvoie à la documentation WCL. Un accord la confirme : la\n' +
      "divergence observée venait alors de deux kills différents, et c'est l'affichage qui\n" +
      'doit dire lequel il mesure.'
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
