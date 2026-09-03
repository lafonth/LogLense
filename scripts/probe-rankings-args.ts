/**
 * Étape 3 de `PLAN_RETOURS_TEST.md` — spike, aucun code applicatif.
 *
 * Trois questions conditionnent les étapes 4, 5 et 6 :
 *   1. `includeCombatantInfo: true` sur `characterRankings` rend-il l'équipement de chaque
 *      entrée ? (verrou du critère de set bonus au niveau du vivier)
 *   2. `bracket` accepte-t-il une tranche d'ilvl exploitable, et `size` filtre-t-il la
 *      taille de raid ?
 *   3. Le volume tient-il sur `CANDIDATE_PAGES = 10` ?
 *
 * La sonde ne croit pas la doc — les pages WCL rendent 403 en accès direct. Elle
 * introspecte le schéma pour la liste d'arguments, puis mesure de vraies réponses.
 * Les réponses brutes partent dans `docs/spike-rankings-args.raw.json`.
 *
 * Usage: node scripts/probe-rankings-args.ts
 */
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
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

/** Rend le corps brut ET la taille : la question 3 porte sur des octets, pas sur un objet. */
async function raw(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<{ bytes: number; json: any }> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  return { bytes: Buffer.byteLength(text), json: JSON.parse(text) };
}

const captures: Record<string, unknown> = { probedAt: new Date().toISOString() };

const Q_INTROSPECT = `
  query {
    __type(name: "Encounter") {
      fields {
        name
        args { name defaultValue type { kind name ofType { kind name } } }
      }
    }
  }`;

const Q_ZONE_BRACKETS = `
  query($encounterID: Int!) {
    worldData {
      encounter(id: $encounterID) {
        id name
        zone { id name brackets { type min max bucket } }
      }
    }
  }`;

const Q_ZONES = `
  query { worldData { zones { id name encounters { id name } } } }`;

/** Le classement, avec les arguments à éprouver injectés un par un. */
function rankingsQuery(extra: string): string {
  return `
  query($encounterID: Int!, $page: Int!) {
    worldData {
      encounter(id: $encounterID) {
        characterRankings(
          metric: dps, difficulty: 5, leaderboard: LogsOnly, page: $page${extra}
        )
      }
    }
  }`;
}

function argSig(a: any): string {
  const t = a.type?.kind === 'NON_NULL' ? `${a.type.ofType?.name}!` : a.type?.name;
  return `${a.name}: ${t}${a.defaultValue != null ? ` = ${a.defaultValue}` : ''}`;
}

/** Cherche récursivement une clé dans un objet, et rend le premier chemin trouvé. */
function findKey(node: unknown, key: string, path = ''): string | null {
  if (Array.isArray(node)) {
    for (let i = 0; i < Math.min(node.length, 3); i++) {
      const hit = findKey(node[i], key, `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) return `${path}.${k}`;
      const hit = findKey(v, key, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

async function main() {
  const token = await getToken();

  const intro = await raw(token, Q_INTROSPECT, {});
  const fields = intro.json?.data?.__type?.fields ?? [];
  const cr = fields.find((f: any) => f.name === 'characterRankings');
  captures.introspection = { characterRankings: cr, allFields: fields.map((f: any) => f.name) };
  console.log('=== Arguments de Encounter.characterRankings ===');
  if (!cr) console.log('  introspection refusée ou champ absent');
  else for (const a of cr.args) console.log('  ' + argSig(a));

  const zones = await raw(token, Q_ZONES, {});
  const zoneList: any[] = zones.json?.data?.worldData?.zones ?? [];
  const candidates = zoneList
    .filter((z) => (z.encounters?.length ?? 0) >= 6)
    .sort((a, b) => b.id - a.id)
    .slice(0, 6);

  let encounterID: number | null = null;
  let baseline: { bytes: number; json: any } | null = null;
  for (const z of candidates) {
    for (const e of z.encounters.slice(0, 2)) {
      const r = await raw(token, rankingsQuery(''), { encounterID: e.id, page: 1 });
      const n = r.json?.data?.worldData?.encounter?.characterRankings?.rankings?.length ?? 0;
      if (n > 0) {
        encounterID = e.id;
        baseline = r;
        console.log(`\nRencontre : ${z.name} / ${e.name} (id ${e.id}) — ${n} entrées page 1`);
        break;
      }
    }
    if (encounterID) break;
  }
  if (!encounterID || !baseline) throw new Error('aucune rencontre avec classement trouvée');
  captures.encounterID = encounterID;

  const brackets = await raw(token, Q_ZONE_BRACKETS, { encounterID });
  captures.brackets = brackets.json;
  console.log('\n=== Q2 — brackets déclarés par la zone ===');
  console.log('  ' + JSON.stringify(brackets.json?.data?.worldData?.encounter?.zone?.brackets));

  const withInfo = await raw(token, rankingsQuery(', includeCombatantInfo: true'), {
    encounterID,
    page: 1,
  });
  const e0 = withInfo.json?.data?.worldData?.encounter?.characterRankings?.rankings?.[0];
  const b0 = baseline.json?.data?.worldData?.encounter?.characterRankings?.rankings?.[0];
  captures.q1 = {
    errors: withInfo.json?.errors ?? null,
    bytesWithout: baseline.bytes,
    bytesWith: withInfo.bytes,
    sampleEntryWithout: b0,
    sampleEntryWith: e0,
  };
  console.log('\n=== Q1 — includeCombatantInfo: true ===');
  console.log('  erreurs GraphQL :', JSON.stringify(withInfo.json?.errors ?? null));
  console.log('  clés sans      :', b0 ? Object.keys(b0).join(', ') : '—');
  console.log('  clés avec      :', e0 ? Object.keys(e0).join(', ') : '—');
  console.log('  gear trouvé à  :', findKey(e0, 'gear') ?? 'ABSENT');
  console.log('  setID trouvé à :', findKey(e0, 'setID') ?? 'ABSENT');
  console.log('  talents        :', findKey(e0, 'talents') ?? 'ABSENT');
  console.log(`  octets page 1  : sans ${baseline.bytes} / avec ${withInfo.bytes}`);

  console.log('\n=== Q2 — bracket / size ===');
  const q2: Record<string, unknown> = {};
  const trials: [string, string][] = [
    ['bracket: 1', ', bracket: 1'],
    ['bracket: 5', ', bracket: 5'],
    ['bracket: 99', ', bracket: 99'],
    ['size: 20', ', size: 20'],
    ['size: 30', ', size: 30'],
  ];
  for (const [label, extra] of trials) {
    const r = await raw(token, rankingsQuery(extra), { encounterID, page: 1 });
    const cr2 = r.json?.data?.worldData?.encounter?.characterRankings;
    const n = cr2?.rankings?.length ?? 0;
    const err = r.json?.errors?.[0]?.message ?? null;
    const ilvls = (cr2?.rankings ?? []).map((x: any) => x.bracketData).filter((x: any) => x != null);
    const span = ilvls.length ? `${Math.min(...ilvls)}–${Math.max(...ilvls)}` : '—';
    q2[label] = {
      errors: r.json?.errors ?? null,
      count: n,
      bracketDataSpan: span,
      sample: cr2?.rankings?.[0],
    };
    console.log(`  ${label.padEnd(11)} → ${err ? `ERREUR ${err}` : `${n} entrées, ilvl ${span}`}`);
  }
  const bBase = (baseline.json?.data?.worldData?.encounter?.characterRankings?.rankings ?? [])
    .map((x: any) => x.bracketData)
    .filter((x: any) => x != null);
  const baseSpan = bBase.length ? `${Math.min(...bBase)}–${Math.max(...bBase)}` : '—';
  console.log(`  (référence) → ${bBase.length} entrées, ilvl ${baseSpan}`);
  q2['(référence)'] = { count: bBase.length, bracketDataSpan: baseSpan };
  captures.q2 = q2;

  console.log('\n=== Q3 — volume sur CANDIDATE_PAGES = 10 ===');
  const vol: Record<string, unknown> = {};
  for (const p of [1, 5, 10]) {
    const wo = await raw(token, rankingsQuery(''), { encounterID, page: p });
    const wi = await raw(token, rankingsQuery(', includeCombatantInfo: true'), {
      encounterID,
      page: p,
    });
    vol[`page ${p}`] = { bytesWithout: wo.bytes, bytesWith: wi.bytes };
    console.log(
      `  page ${String(p).padEnd(2)} : sans ${(wo.bytes / 1024).toFixed(1)} Kio / avec ${(wi.bytes / 1024).toFixed(1)} Kio`
    );
  }
  captures.q3 = vol;

  const out = resolve(process.cwd(), 'docs/spike-rankings-args.raw.json');
  writeFileSync(out, JSON.stringify(captures, null, 2));
  console.log(`\nRéponses brutes : ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
