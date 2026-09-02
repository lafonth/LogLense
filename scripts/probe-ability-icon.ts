/**
 * Étape 1 de `PLAN_RETOURS_TEST.md` — quel est le nom exact du champ d'icône dans une entrée
 * de capacité ? `table(...)` rend un scalaire JSON : le champ est déjà dans la réponse, il
 * n'y a rien à ajouter à la requête, seulement à nommer.
 *
 * Piège écarté ici : `icon` sur une entrée d'**acteur** porte « Class-Spec »
 * (`raid-ranking.ts:101`). Ce n'est pas le même champ. La sonde vide donc les clés brutes de
 * la première entrée de chaque table — dégâts, casts, buffs — sans rien présumer.
 *
 * Usage: node scripts/probe-ability-icon.ts [code]
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
  query { worldData { zones { id name encounters { id name } } } }`;

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
      report(code: $code) { fights(killType: Encounters) { id name } }
    }
  }`;

const Q_COMBATANT = `
  query($code: String!, $fightIDs: [Int]!) {
    reportData { report(code: $code) { events(dataType: CombatantInfo, fightIDs: $fightIDs) { data } } }
  }`;

/** Les trois tables de production en un seul document : une requête, trois réponses. */
const Q_TABLES = `
  query($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
    reportData {
      report(code: $code) {
        damage: table(dataType: DamageDone, fightIDs: $fightIDs, sourceID: $sourceID, wipeCutoff: 0)
        casts: table(dataType: Casts, fightIDs: $fightIDs, sourceID: $sourceID)
        buffs: table(dataType: Buffs, fightIDs: $fightIDs, sourceID: $sourceID)
      }
    }
  }`;

type Entry = Record<string, unknown>;
type Table = { data?: { entries?: Entry[]; auras?: Entry[] } };

async function resolveCode(token: string): Promise<string> {
  const zones = await gql<{
    worldData: { zones: { id: number; name: string; encounters: { id: number; name: string }[] }[] };
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

function dump(label: string, rows: Entry[] | undefined) {
  console.log(`\n### ${label} — ${rows?.length ?? 0} entrées`);
  const first = rows?.[0];
  if (!first) return console.log('  (vide)');
  console.log('  clés :', Object.keys(first).join(', '));
  for (const row of rows.slice(0, 4)) {
    const icons = Object.entries(row).filter(([k]) => /icon|abilityIcon|type/i.test(k));
    console.log(`  ${String(row.name)} (guid ${String(row.guid)}) →`, JSON.stringify(Object.fromEntries(icons)));
  }
}

async function main() {
  const token = await getToken();
  const code = process.argv[2] ?? (await resolveCode(token));

  const fightsRes = await gql<{
    reportData: { report: { fights: { id: number; name: string }[] } | null };
  }>(token, Q_FIGHTS, { code });
  const fight = fightsRes.reportData.report?.fights?.[0];
  if (!fight) throw new Error('Aucun combat dans ce rapport.');
  console.log(`Combat : ${fight.name} (id ${fight.id})`);

  const cinfo = await gql<{
    reportData: { report: { events: { data: { sourceID?: number }[] } | null } | null };
  }>(token, Q_COMBATANT, { code, fightIDs: [fight.id] });
  const sourceID = cinfo.reportData.report?.events?.data?.find((r) => typeof r.sourceID === 'number')
    ?.sourceID;
  if (typeof sourceID !== 'number') throw new Error('Aucun acteur trouvé.');
  console.log(`Acteur : ${sourceID}`);

  // La requête qui répond à la question : une seule, trois tables.
  const tables = await gql<{
    reportData: { report: { damage: Table; casts: Table; buffs: Table } | null };
  }>(token, Q_TABLES, { code, fightIDs: [fight.id], sourceID });
  const report = tables.reportData.report;
  if (!report) throw new Error('Rapport vide.');

  dump('DamageDone.entries', report.damage.data?.entries);
  dump('Casts.entries', report.casts.data?.entries);
  dump('Buffs.auras', report.buffs.data?.auras);

  console.log('\n--- entrée de dégâts brute, en entier ---');
  console.log(JSON.stringify(report.damage.data?.entries?.[0], null, 2));
  console.log('\n--- entrée de cast brute, en entier ---');
  console.log(JSON.stringify(report.casts.data?.entries?.[0], null, 2));
  console.log('\n--- aura brute, en entier ---');
  console.log(JSON.stringify(report.buffs.data?.auras?.[0], null, 2));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
