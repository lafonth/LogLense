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
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Blizzard API ${res.status} ${path}\n${body}`);
  }
  return res.json() as Promise<T>;
}

interface BlizzardTalentTree {
  id: number;
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

async function main() {
  const token = await getToken();
  console.log(`Token acquired (length ${token.length})`);

  // Sanity check: a simple static endpoint that always exists
  const realm = await bnet<{ realms: unknown[] }>(token, `/data/wow/realm/index`);
  console.log(`API healthy — ${(realm.realms as unknown[]).length} realms`);

  // Discover talent tree ID from the playable-specialization endpoint
  const spec = await bnet<{
    talent_tree?: { key: { href: string }; id: number };
  }>(token, `/data/wow/playable-specialization/${FERAL_SPEC_ID}`);

  let treeId: number | undefined = spec.talent_tree?.id;

  if (!treeId) {
    // Fallback: parse the href if id isn't directly present
    const href = spec.talent_tree?.key?.href ?? '';
    const match = /talent-tree\/(\d+)/.exec(href);
    if (match) treeId = Number(match[1]);
  }

  if (!treeId) throw new Error(`Could not find talent tree ID for spec ${FERAL_SPEC_ID}. Raw: ${JSON.stringify(spec.talent_tree)}`);

  console.log(`Found talent tree ID: ${treeId}`);

  const tree = await bnet<BlizzardTalentTree>(
    token,
    `/data/wow/talent-tree/${treeId}/playable-spec/${FERAL_SPEC_ID}`
  );

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
      const talentIds: number[] = [];
      const names: string[] = [];
      let spellId = 0;
      let name = '';

      if (isChoice) {
        for (const choice of firstRank?.choice_of_tooltips ?? []) {
          talentIds.push(choice.talent.id);
          names.push(choice.talent.name);
          if (!spellId) spellId = choice.spell_tooltip?.spell.id ?? 0;
        }
        name = names[0] ?? 'Unknown';
      } else {
        for (const rank of node.ranks) {
          const talent = rank.tooltip?.talent;
          if (talent) {
            talentIds.push(talent.id);
            if (!name) name = talent.name;
            if (!spellId) spellId = rank.tooltip?.spell_tooltip?.spell.id ?? 0;
          }
        }
        names.push(name);
      }

      const nodeType: TalentNode['nodeType'] =
        isChoice ? 'choice' : node.ranks.length > 1 ? 'rankable' : 'single';

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
