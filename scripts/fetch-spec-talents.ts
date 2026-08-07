// Run: npx tsx scripts/fetch-spec-talents.ts --spec 103
// Reads BLIZZARD_CLIENT_ID_DEV / BLIZZARD_CLIENT_SECRET_DEV from .env.local
// Writes to: src/data/talents/spec-{specId}.json

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
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
} catch { /* .env.local not found */ }

const SPEC_ID = Number(
  process.argv.includes('--spec')
    ? process.argv[process.argv.indexOf('--spec') + 1]
    : (process.argv.find((a) => a.startsWith('--spec='))?.split('=')[1] ?? '0')
);

if (!SPEC_ID || isNaN(SPEC_ID)) {
  console.error('Usage: npx tsx scripts/fetch-spec-talents.ts --spec <specId>');
  process.exit(1);
}

const REGION = 'us';
const NAMESPACE = `static-${REGION}`;

async function getToken(): Promise<string> {
  const id = process.env.BLIZZARD_CLIENT_ID_DEV ?? process.env.BLIZZARD_CLIENT_ID;
  const secret = process.env.BLIZZARD_CLIENT_SECRET_DEV ?? process.env.BLIZZARD_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing BLIZZARD_CLIENT_ID_DEV / BLIZZARD_CLIENT_SECRET_DEV');
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

async function bnet<T>(token: string, path: string): Promise<T> {
  const url = `https://${REGION}.api.blizzard.com${path}?namespace=${NAMESPACE}&locale=en_US`;
  return bnetUrl<T>(token, url, path);
}

/**
 * TraitNodeID → ses TraitNodeEntryID, dans l'ordre de `_Index`.
 *
 * L'ordre n'est pas cosmétique : `talentIds[i]` doit désigner la même option que
 * `choice_of_tooltips[i]`, sans quoi un nœud de choix se retrouve étiqueté avec le nom de
 * l'autre option. `_Index` est la seule colonne qui porte cet ordre — l'ordre des lignes du
 * fichier ne le garantit pas.
 */
function parseCsv(text: string): Map<number, number[]> {
  const ordered = new Map<number, Array<{ entryId: number; index: number }>>();
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return new Map();
  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
  const nodeCol = headers.findIndex((h) => h === 'TraitNodeID');
  const entryCol = headers.findIndex((h) => h === 'TraitNodeEntryID');
  const indexCol = headers.findIndex((h) => h === '_Index' || h === 'Index');
  if (nodeCol === -1 || entryCol === -1) throw new Error('Missing CSV columns');
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const nodeId = Number(cols[nodeCol]);
    const entryId = Number(cols[entryCol]);
    if (!nodeId || !entryId) continue;
    const index = indexCol === -1 ? 0 : Number(cols[indexCol]);
    const existing = ordered.get(nodeId);
    if (existing) { if (!existing.some((e) => e.entryId === entryId)) existing.push({ entryId, index }); }
    else ordered.set(nodeId, [{ entryId, index }]);
  }

  const map = new Map<number, number[]>();
  for (const [nodeId, entries] of ordered) {
    map.set(nodeId, entries.sort((a, b) => a.index - b.index).map((e) => e.entryId));
  }
  return map;
}

async function fetchTraitNodeEntryMap(build: string): Promise<Map<number, number[]>> {
  const localPath = resolve(process.cwd(), 'scripts/TraitNodeXTraitNodeEntry.csv');
  try {
    const text = readFileSync(localPath, 'utf8');
    const map = parseCsv(text);
    if (map.size > 0) { console.log(`  Using local CSV (${map.size} nodes)`); return map; }
  } catch { /* fall through */ }

  const candidates = [
    `https://wago.tools/db2/TraitNodeXTraitNodeEntry.csv?build=${build}`,
    `https://wow.tools/dbc/download/csv/?name=TraitNodeXTraitNodeEntry&build=${build}`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; talent-data-fetcher)', Accept: 'text/csv,*/*' } });
      const text = await res.text();
      if (!res.ok || text.trimStart().startsWith('<')) continue;
      const map = parseCsv(text);
      if (map.size > 0) return map;
    } catch { /* try next */ }
  }
  throw new Error('Could not fetch TraitNodeXTraitNodeEntry CSV. Download it manually from https://wago.tools/db2/TraitNodeXTraitNodeEntry and save to scripts/TraitNodeXTraitNodeEntry.csv');
}

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
    tooltip?: { talent: { id: number; name: string }; spell_tooltip?: { spell: { id: number } } };
    choice_of_tooltips?: Array<{ talent: { id: number; name: string }; spell_tooltip?: { spell: { id: number } } }>;
  }>;
  locked_by?: Array<{ id: number }>;
}
interface TalentNode {
  id: number; talentIds: number[]; name: string; names: string[];
  spellId: number; row: number; col: number; maxRanks: number;
  nodeType: 'single' | 'choice' | 'rankable'; treeType: 'class' | 'spec'; children: number[];
}

async function main() {
  console.log(`Fetching talent tree for spec ${SPEC_ID}...`);
  const token = await getToken();

  const spec = await bnet<{ spec_talent_tree?: { key: { href: string } } }>(
    token, `/data/wow/playable-specialization/${SPEC_ID}`
  );
  const treeHref = spec.spec_talent_tree?.key?.href;
  if (!treeHref) throw new Error(`spec_talent_tree href not found for spec ${SPEC_ID}`);

  const tree = await bnetUrl<BlizzardTalentTree>(token, treeHref, 'talent-tree');

  const selfHref = tree._links?.self?.href ?? '';
  const nsMatch = /static-([\d.]+)_(\d+)-/.exec(selfHref);
  const wagoBuild = nsMatch ? `${nsMatch[1]}.${nsMatch[2]}` : '12.0.5.57661';
  console.log(`Blizzard build: ${wagoBuild}`);

  const entryMap = await fetchTraitNodeEntryMap(wagoBuild);

  function transformNodes(nodes: BlizzardNode[], treeType: 'class' | 'spec'): TalentNode[] {
    const parentToChildren = new Map<number, number[]>();
    for (const node of nodes) {
      for (const parent of node.locked_by ?? []) {
        if (!parentToChildren.has(parent.id)) parentToChildren.set(parent.id, []);
        parentToChildren.get(parent.id)!.push(node.id);
      }
    }
    return nodes.map((node): TalentNode => {
      // Détecté sur la forme des données, pas sur `node_type.type` : Blizzard n'a jamais rendu
      // la valeur qu'on y cherchait, et le nœud de choix repartait donc sans nom. Ce qu'on
      // exploite ici, ce sont les `choice_of_tooltips` — c'est donc leur présence qui décide.
      const firstRank = (node.ranks ?? [])[0];
      const isChoice = Boolean(firstRank?.choice_of_tooltips?.length);
      const names: string[] = [];
      let spellId = 0, name = '';
      if (isChoice) {
        for (const choice of firstRank?.choice_of_tooltips ?? []) {
          names.push(choice.talent.name);
          if (!spellId) spellId = choice.spell_tooltip?.spell.id ?? 0;
        }
        name = names[0] ?? 'Unknown';
      } else {
        for (const rank of node.ranks ?? []) {
          const talent = rank.tooltip?.talent;
          if (talent) { if (!name) name = talent.name; if (!spellId) spellId = rank.tooltip?.spell_tooltip?.spell.id ?? 0; }
        }
        names.push(name);
      }
      const nodeType: TalentNode['nodeType'] = isChoice ? 'choice' : (node.ranks?.length ?? 0) > 1 ? 'rankable' : 'single';
      const talentIds = entryMap.get(node.id) ?? [];
      return { id: node.id, talentIds, name, names, spellId, row: node.display_row, col: node.display_col, maxRanks: isChoice ? 1 : (node.ranks?.length ?? 1), nodeType, treeType, children: parentToChildren.get(node.id) ?? [] };
    });
  }

  const classNodes = transformNodes(tree.class_talent_nodes, 'class');
  const specNodes = transformNodes(tree.spec_talent_nodes, 'spec');
  const allNodes = [...classNodes, ...specNodes];

  const noMatch = allNodes.filter((n) => n.talentIds.length === 0).length;
  if (noMatch > 0) console.warn(`  Warning: ${noMatch} nodes have no TraitNodeEntryID mapping`);

  // Un nœud sans nom s'affiche `#<id>` dans le panneau Build et arrive tel quel dans le
  // prompt IA. Le script est resté muet là-dessus pendant vingt-cinq générations : c'est ce
  // silence qui a coûté le bug, pas la ligne qui le produisait.
  const unnamed = allNodes.filter((n) => !n.name || n.names.some((x) => !x));
  if (unnamed.length > 0) {
    console.warn(`  Warning: ${unnamed.length} nodes have no name — they will render as #id`);
    for (const n of unnamed.slice(0, 5)) console.warn(`    node ${n.id} (${n.treeType} ${n.row}/${n.col}, ${n.nodeType})`);
  }

  const choiceCount = allNodes.filter((n) => n.nodeType === 'choice').length;
  console.log(`  Choice nodes: ${choiceCount}`);

  const outDir = resolve(process.cwd(), 'src/data/talents');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `spec-${SPEC_ID}.json`);
  writeFileSync(outPath, JSON.stringify(allNodes, null, 2));

  // `JSON.stringify` et Prettier ne sont pas d'accord sur les tableaux courts : sans ce
  // passage, toute régénération fait échouer `pnpm format:check`, donc le hook pre-commit.
  try {
    // `execSync` et non `execFileSync` : sous Windows `npx` est un script, il exige un shell,
    // et `execFileSync` + `shell: true` déclenche un avertissement de dépréciation Node.
    execSync(`npx prettier --write "${outPath}"`, { stdio: 'ignore' });
  } catch {
    console.warn('  Warning: prettier failed — run `pnpm format:write` before committing');
  }

  console.log(`Wrote ${allNodes.length} nodes → ${outPath}`);
  console.log(`  Class: ${classNodes.length}, Spec: ${specNodes.length}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
