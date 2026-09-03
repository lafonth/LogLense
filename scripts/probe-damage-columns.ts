/**
 * Étape 4 du plan de retours : le tableau côte à côte veut Amount, Casts, Avg Cast, Hits,
 * Avg Hit, DPS. `DamageEntry` ne garde que `guid`, `name` et `total` — la question n'est pas
 * de savoir si on peut inventer les deux colonnes manquantes, c'est de savoir si WCL les rend
 * déjà dans la charge qu'on paie de toute façon.
 *
 * Une seule question, donc : **quelles clés porte une entrée de `table(DamageDone)` ?** Et la
 * même pour `table(Casts)`, puisque `avgCast` se joint dessus.
 *
 * Usage: node scripts/probe-damage-columns.ts [code]
 * Requires: WCL_CLIENT_ID et WCL_CLIENT_SECRET dans .env.local
 */
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import process from 'node:process';

process.loadEnvFile(resolve(process.cwd(), '.env.local'));

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

type Json = Record<string, unknown>;

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

async function gql<T>(token: string, query: string, variables: Json): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(`WCL: ${body.errors[0].message}`);
  return body.data as T;
}

const Q_ZONES = `query { worldData { zones { id name encounters { id name } } } }`;

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
      report(code: $code) { title fights(killType: Encounters) { id name encounterID } }
    }
  }`;

const Q_COMBATANT = `
  query($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) { events(dataType: CombatantInfo, fightIDs: $fightIDs) { data } }
    }
  }`;

/** `Q_DAMAGE` et `Q_ROTATION`, à l'identique de la production. */
const Q_TABLES = `
  query($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
    reportData {
      report(code: $code) {
        damage: table(dataType: DamageDone, fightIDs: $fightIDs, sourceID: $sourceID, wipeCutoff: 0)
        casts: table(dataType: Casts, fightIDs: $fightIDs, sourceID: $sourceID, wipeCutoff: 0)
      }
    }
  }`;

function entriesOf(table: unknown): Json[] {
  const data = (table as { data?: { entries?: unknown } } | null)?.data;
  return Array.isArray(data?.entries) ? (data.entries as Json[]) : [];
}

/** Les clés et leur type, pour chaque entrée : c'est la seule chose qu'on cherche ici. */
function keyShape(rows: Json[]): Map<string, string> {
  const shape = new Map<string, string>();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (!shape.has(k)) shape.set(k, Array.isArray(v) ? 'array' : typeof v);
    }
  }
  return shape;
}

function report(label: string, rows: Json[]) {
  console.log(`\n=== ${label} — ${rows.length} entrée(s) ===`);
  const shape = keyShape(rows);
  for (const [key, type] of [...shape].sort()) console.log(`  ${key.padEnd(24)} ${type}`);
  console.log('  Par entrée — nom | total | uses | hitCount | tickCount | composite | sous-entrées :');
  for (const row of rows) {
    const sub = Array.isArray(row.subentries) ? (row.subentries as Json[]) : [];
    const cells = [
      String(row.name).slice(0, 26).padEnd(26),
      String(row.total ?? '—').padStart(10),
      String(row.uses ?? '—').padStart(5),
      String(row.hitCount ?? '—').padStart(9),
      String(row.tickCount ?? '—').padStart(10),
      String(row.composite ?? '—').padStart(9),
      String(sub.length).padStart(4),
    ];
    console.log('  ' + cells.join(' | '));
  }
}

async function resolveCode(token: string): Promise<string> {
  const zones = await gql<{
    worldData: { zones: { id: number; name: string; encounters: { id: number; name: string }[] }[] };
  }>(token, Q_ZONES, {});

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
        console.log(`Rapport résolu depuis « ${zone.name} / ${encounter.name} » : ${code}`);
        return code;
      }
    }
  }
  throw new Error('Aucun rapport classé trouvé ; passe un code de rapport en argument.');
}

async function main() {
  const token = await getToken();
  const code = process.argv[2] ?? (await resolveCode(token));

  const meta = await gql<{
    reportData: {
      report: { title: string; fights: { id: number; name: string }[] } | null;
    };
  }>(token, Q_FIGHTS, { code });
  const fight = meta.reportData.report?.fights?.[0];
  if (!fight) throw new Error(`Rapport ${code} sans combat exploitable.`);
  console.log(`Combat : ${fight.name} (#${fight.id}) — ${meta.reportData.report?.title}`);

  const combatants = await gql<{
    reportData: { report: { events: { data: Json[] } | null } | null };
  }>(token, Q_COMBATANT, { code, fightIDs: [fight.id] });
  const sourceID = combatants.reportData.report?.events?.data?.find(
    (r) => typeof r.sourceID === 'number'
  )?.sourceID as number | undefined;
  if (sourceID === undefined) throw new Error('Aucun combattant sur ce combat.');
  console.log(`Acteur : sourceID ${sourceID}`);

  const tables = await gql<{
    reportData: { report: { damage: unknown; casts: unknown } | null };
  }>(token, Q_TABLES, { code, fightIDs: [fight.id], sourceID });

  report('table(DamageDone).data.entries', entriesOf(tables.reportData.report?.damage));
  report('table(Casts).data.entries', entriesOf(tables.reportData.report?.casts));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
