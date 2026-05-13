/**
 * Debug script: test different WCL query variants for debuff uptime
 * Usage: npx tsx scripts/debug-debuffs.ts
 * Requires: WCL_CLIENT_ID and WCL_CLIENT_SECRET in .env.local
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const API_URL   = 'https://www.warcraftlogs.com/api/v2/client';
const FERAL_SPEC_ID = 103;
const DIFFICULTY = 5; // Mythic (3=Normal, 4=Heroic, 5=Mythic)

// Character to test with
const CHARACTER = { name: 'Jumbaa', slug: 'ysondre', region: 'EU' };

// Boss name substring to match (case-insensitive)
const BOSS_FILTER = 'Vaelgor';

async function getToken(): Promise<string> {
  const id = process.env.WCL_CLIENT_ID;
  const secret = process.env.WCL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing WCL_CLIENT_ID / WCL_CLIENT_SECRET in .env.local');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const json = await res.json() as { access_token: string };
  return json.access_token;
}

async function gql<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
  });
  const body = await res.json() as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(`WCL error: ${body.errors[0].message}`);
  return body.data as T;
}

const Q_ZONES = `{ worldData { zones { id name encounters { id name } } } }`;

const Q_RANKS = `
  query($name:String!,$slug:String!,$region:String!,$encID:Int!,$diff:Int!) {
    characterData {
      character(name:$name,serverSlug:$slug,serverRegion:$region) {
        dps: encounterRankings(encounterID:$encID,difficulty:$diff,metric:dps,specName:"Feral")
      }
    }
  }
`;

const Q_COMBATANT = `
  query($code:String!,$fightIDs:[Int]!) {
    reportData { report(code:$code) {
      events(dataType:CombatantInfo,fightIDs:$fightIDs){data}
    }}
  }
`;

function makeDebuffQuery(variant: string, extra: string) {
  return `
    query($code:String!,$fightIDs:[Int]!,$sourceID:Int!) {
      reportData { report(code:$code) {
        result: table(dataType:Debuffs,fightIDs:$fightIDs${extra})
      }}
    }
  `;
}

function summariseTable(table: unknown, label: string, fightMs: number) {
  const auras = (table as { data?: { auras?: { name: string; guid: number; totalUptime: number }[] } })?.data?.auras ?? [];
  const entries = (table as { data?: { entries?: { name: string; guid: number; total: number }[] } })?.data?.entries ?? [];
  const ripRake = auras.filter(a => a.name === 'Rip' || a.name === 'Rake');

  console.log(`\n  ── ${label} ──`);
  console.log(`    auras  : ${auras.length} | entries: ${entries.length}`);

  if (ripRake.length > 0) {
    for (const a of ripRake) {
      const pct = fightMs > 0 ? ((a.totalUptime / fightMs) * 100).toFixed(1) : '?';
      console.log(`    ✓ ${a.name} (guid ${a.guid}): ${pct}% uptime (${a.totalUptime}ms / ${fightMs}ms)`);
    }
  } else {
    console.log(`    ✗ No Rip/Rake found`);
    if (auras.length > 0) {
      const sample = auras.slice(0, 5).map(a => `${a.name}(${a.guid})`).join(', ');
      console.log(`    Sample auras  : ${sample}`);
    }
    if (entries.length > 0) {
      const sample = entries.slice(0, 5).map((e: { name: string; guid: number }) => `${e.name}(${e.guid})`).join(', ');
      console.log(`    Sample entries: ${sample}`);
    }
  }
}

async function main() {
  const token = await getToken();
  console.log('✓ Token obtained\n');

  // Find the encounter ID
  console.log(`Looking for "${BOSS_FILTER}" encounter...`);
  const zonesData = await gql<{ worldData: { zones: { id: number; name: string; encounters: { id: number; name: string }[] }[] } }>(token, Q_ZONES);
  let encounterId = 0;
  let encounterName = '';
  for (const zone of zonesData.worldData.zones) {
    const match = zone.encounters.find(e => e.name.toLowerCase().includes(BOSS_FILTER.toLowerCase()));
    if (match) { encounterId = match.id; encounterName = match.name; break; }
  }
  if (!encounterId) { console.error(`No encounter matching "${BOSS_FILTER}" found.`); return; }
  console.log(`✓ Found: "${encounterName}" (ID ${encounterId})\n`);

  // Get best parse
  console.log(`Fetching ${CHARACTER.name}'s best parse...`);
  const rankData = await gql<{ characterData: { character: { dps: { ranks: { amount: number; duration: number; report: { code: string; fightID: number } }[] } } } }>(
    token, Q_RANKS, { name: CHARACTER.name, slug: CHARACTER.slug, region: CHARACTER.region, encID: encounterId, diff: DIFFICULTY }
  );
  const ranks = rankData.characterData.character?.dps?.ranks ?? [];
  if (!ranks.length) { console.error('No parses found.'); return; }
  const best = ranks.reduce((a, b) => a.amount > b.amount ? a : b);
  const { code, fightID } = best.report;
  const fightMs = best.duration;
  console.log(`✓ Best parse: ${Math.round(best.amount)} DPS | code=${code} | fightID=${fightID} | ${(fightMs/1000).toFixed(0)}s\n`);

  // Get sourceID from CombatantInfo
  const combData = await gql<{ reportData: { report: { events: { data: { sourceID: number; specID: number }[] } } } }>(
    token, Q_COMBATANT, { code, fightIDs: [fightID] }
  );
  const feralEvent = combData.reportData.report.events.data.find(e => e.specID === FERAL_SPEC_ID);
  if (!feralEvent) { console.error('No Feral CombatantInfo event.'); return; }
  const sourceID = feralEvent.sourceID;
  console.log(`✓ Feral sourceID: ${sourceID}\n`);
  console.log('Testing debuff query variants (looking for Rip/Rake)...');

  const vars = { code, fightIDs: [fightID], sourceID };

  const variants: [string, string][] = [
    ['withSrc + default hostility',    `, sourceID:$sourceID`],
    ['noSrc  + default hostility',     ``],
    ['withSrc + hostilityType:Enemies',`, sourceID:$sourceID, hostilityType:Enemies`],
    ['noSrc  + hostilityType:Enemies', `, hostilityType:Enemies`],
    ['withSrc + hostilityType:Friendlies', `, sourceID:$sourceID, hostilityType:Friendlies`],
    ['noSrc  + hostilityType:Friendlies',  `, hostilityType:Friendlies`],
  ];

  for (const [label, extra] of variants) {
    try {
      const q = makeDebuffQuery(label, extra);
      const d = await gql<{ reportData: { report: { result: unknown } } }>(token, q, vars);
      summariseTable(d.reportData.report.result, label, fightMs);
    } catch (e) {
      console.log(`\n  ── ${label} ──`);
      console.log(`    ERROR: ${(e as Error).message}`);
    }
  }

  console.log('\n✓ Done');
}

main().catch(err => { console.error(err); process.exit(1); });
