// Run once: npx tsx scripts/fetch-feral-talents.ts
// Reads BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET from .env.local
// Writes to: src/data/feral-druid-talents.json

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually (tsx doesn't auto-load it)
try {
  const envPath = resolve(process.cwd(), '.env.local');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // .env.local not found — fall back to existing env vars
}

const FERAL_SPEC_ID = 103;
const REGION = 'us';
const NAMESPACE = `static-${REGION}`;

// ── Blizzard API ──────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const id = process.env.BLIZZARD_CLIENT_ID;
  const secret = process.env.BLIZZARD_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET');
  const res = await fetch(`https://${REGION}.battle.net/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function bnet<T>(token: string, path: string, namespace = NAMESPACE): Promise<T> {
  const url = `https://${REGION}.api.blizzard.com${path}?namespace=${namespace}&locale=en_US`;
  return bnetUrl<T>(token, url, path);
}

async function bnetUrl<T>(token: string, url: string, label = url): Promise<T> {
  const u = new URL(url);
  if (!u.searchParams.has('locale')) u.searchParams.set('locale', 'en_US');
  const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Blizzard API ${res.status} ${label}\n${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Wago.tools — TraitNodeXTraitNodeEntry ─────────────────────────────────────
// WCL records TraitNodeEntryIDs (103xxx range), not the IDs returned by the
// Blizzard game data API. wago.tools exposes the raw DB2 table that maps
// TraitNodeID (what Blizzard API gives us) → TraitNodeEntryID (what WCL records).

const WAGO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/csv,application/json,*/*',
};

async function fetchTraitNodeEntryMap(build: string): Promise<Map<number, number[]>> {
  // Node ID → list of entry IDs (one per rank/choice within that node)
  const map = new Map<number, number[]>();

  console.log(`  Fetching TraitNodeXTraitNodeEntry from wago.tools (build ${build})…`);

  // Try CSV first — bypasses Next.js SSR HTML response
  const csvUrl = `https://wago.tools/db2/TraitNodeXTraitNodeEntry.csv?build=${build}`;
  const csvRes = await fetch(csvUrl, { headers: WAGO_HEADERS });
  const csvText = await csvRes.text();
  const firstLine = csvText.trimStart().slice(0, 80);
  console.log(`  CSV response status=${csvRes.status} first80: ${firstLine}`);

  if (csvRes.ok && !csvText.trimStart().startsWith('<')) {
    // CSV format: ID,TraitNodeID,TraitNodeEntryID,... (header on first line)
    const lines = csvText.split('\n').filter((l) => l.trim());
    const headers = lines[0].split(',');
    const nodeCol = headers.findIndex((h) => h.trim() === 'TraitNodeID');
    const entryCol = headers.findIndex((h) => h.trim() === 'TraitNodeEntryID');
    if (nodeCol === -1 || entryCol === -1) {
      throw new Error(`CSV headers not found. Got: ${headers.join(',')}`);
    }
    for (const line of lines.slice(1)) {
      const cols = line.split(',');
      const nodeId = Number(cols[nodeCol]);
      const entryId = Number(cols[entryCol]);
      if (!nodeId || !entryId) continue;
      const existing = map.get(nodeId);
      if (existing) { if (!existing.includes(entryId)) existing.push(entryId); }
      else map.set(nodeId, [entryId]);
    }
    console.log(`  Parsed ${map.size} nodes from CSV`);
    return map;
  }

  // Fallback: JSON API
  console.log(`  CSV failed or returned HTML, trying JSON API…`);
  let page = 1;
  while (true) {
    const url = `https://wago.tools/db2/TraitNodeXTraitNodeEntry?build=${build}&locale=enUS&page=${page}`;
    const res = await fetch(url, { headers: { ...WAGO_HEADERS, Accept: 'application/json' } });
    const text = await res.text();
    if (!res.ok || text.trimStart().startsWith('<')) {
      console.error(`  JSON API failed. status=${res.status} first80=${text.slice(0, 80)}`);
      break;
    }
    const data = JSON.parse(text) as {
      records?: Array<{ TraitNodeID: number; TraitNodeEntryID: number }>;
      data?: Array<{ TraitNodeID: number; TraitNodeEntryID: number }>;
    };
    const records = data.records ?? data.data ?? [];
    if (records.length === 0) break;
    for (const r of records) {
      const existing = map.get(r.TraitNodeID);
      if (existing) { if (!existing.includes(r.TraitNodeEntryID)) existing.push(r.TraitNodeEntryID); }
      else map.set(r.TraitNodeID, [r.TraitNodeEntryID]);
    }
    if (records.length < 100) break;
    page++;
  }

  if (map.size === 0) throw new Error('Could not fetch TraitNodeXTraitNodeEntry from wago.tools — try visiting https://wago.tools/db2/TraitNodeXTraitNodeEntry in a browser to confirm the data exists for this build');

  console.log(`  Got entry map: ${map.size} nodes`);
  return map;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface BlizzardTalentTree {
  id: number;
  _links?: { self?: { href?: string } };
  class_talent_nodes: BlizzardNode[];
  spec_talent_nodes: BlizzardNode[];
}

interface BlizzardNode {
  id: number;
  display_row: number;
  display_col: number;
  node_type: { id: number; type: string };
  ranks: Array<{
    rank: number;
    tooltip?: {
      talent: { id: number; name: string };
      spell_tooltip?: { spell: { id: number } };
    };
    choice_of_tooltips?: Array<{
      talent: { id: number; name: string };
      spell_tooltip?: { spell: { id: number } };
    }>;
  }>;
  locked_by?: Array<{ id: number }>;
}

interface TalentNode {
  id: number;
  talentIds: number[];
  name: string;
  names: string[];
  spellId: number;
  row: number;
  col: number;
  maxRanks: number;
  nodeType: 'single' | 'choice' | 'rankable';
  treeType: 'class' | 'spec';
  children: number[];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const token = await getToken();

  // 1. Get the Feral spec talent tree from Blizzard API
  const spec = await bnet<{ spec_talent_tree?: { key: { href: string } } }>(
    token,
    `/data/wow/playable-specialization/${FERAL_SPEC_ID}`
  );
  const treeHref = spec.spec_talent_tree?.key?.href;
  if (!treeHref) throw new Error('spec_talent_tree href not found');

  const tree = await bnetUrl<BlizzardTalentTree>(token, treeHref, 'talent-tree');

  // Extract the build version from the self-link so we hit the same build on wago.tools
  // e.g. "static-12.0.5_66741-us" → try "12.0.5.66741", fall back to just major version
  const selfHref = tree._links?.self?.href ?? '';
  const nsMatch = /static-([\d.]+)_(\d+)-/.exec(selfHref);
  const wagoBuild = nsMatch ? `${nsMatch[1]}.${nsMatch[2]}` : '12.0.5.57661';
  console.log(`Blizzard build: ${wagoBuild}`);

  // 2. Get TraitNodeID → TraitNodeEntryID mapping from wago.tools
  const entryMap = await fetchTraitNodeEntryMap(wagoBuild);

  // 3. Transform nodes
  function transformNodes(nodes: BlizzardNode[], treeType: 'class' | 'spec'): TalentNode[] {
    const parentToChildren = new Map<number, number[]>();
    for (const node of nodes) {
      for (const parent of node.locked_by ?? []) {
        if (!parentToChildren.has(parent.id)) parentToChildren.set(parent.id, []);
        parentToChildren.get(parent.id)!.push(node.id);
      }
    }

    return nodes.map((node): TalentNode => {
      const isChoice = node.node_type.type === 'SELECTION';
      const firstRank = node.ranks[0];
      const names: string[] = [];
      let spellId = 0;
      let name = '';

      if (isChoice) {
        for (const choice of firstRank?.choice_of_tooltips ?? []) {
          names.push(choice.talent.name);
          if (!spellId) spellId = choice.spell_tooltip?.spell.id ?? 0;
        }
        name = names[0] ?? 'Unknown';
      } else {
        for (const rank of node.ranks) {
          const talent = rank.tooltip?.talent;
          if (talent) {
            if (!name) name = talent.name;
            if (!spellId) spellId = rank.tooltip?.spell_tooltip?.spell.id ?? 0;
          }
        }
        names.push(name);
      }

      const nodeType: TalentNode['nodeType'] =
        isChoice ? 'choice' : node.ranks.length > 1 ? 'rankable' : 'single';

      // Use TraitNodeEntryIDs from wago.tools — these match what WCL records.
      const talentIds = entryMap.get(node.id) ?? [];

      return {
        id: node.id,
        talentIds,
        name,
        names,
        spellId,
        row: node.display_row,
        col: node.display_col,
        maxRanks: isChoice ? 1 : node.ranks.length,
        nodeType,
        treeType,
        children: parentToChildren.get(node.id) ?? [],
      };
    });
  }

  const classNodes = transformNodes(tree.class_talent_nodes, 'class');
  const specNodes = transformNodes(tree.spec_talent_nodes, 'spec');
  const allNodes = [...classNodes, ...specNodes];

  const noMatch = allNodes.filter((n) => n.talentIds.length === 0).length;
  if (noMatch > 0) console.warn(`  Warning: ${noMatch} nodes have no TraitNodeEntryID mapping`);

  const outDir = resolve(process.cwd(), 'src/data');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'feral-druid-talents.json');
  writeFileSync(outPath, JSON.stringify(allNodes, null, 2));
  console.log(`Wrote ${allNodes.length} nodes to ${outPath}`);
  console.log(`  Class: ${classNodes.length}, Spec: ${specNodes.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
