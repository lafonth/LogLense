import type {
  AnalysisResult,
  BossResult,
  CharacterStats,
  DamageEntry,
  FightTarget,
  RotationSummary,
  TalentNode,
  TopPlayer,
} from '@/types';

export const SYSTEM_PROMPT = `You are a WarcraftLogs performance coach. Speak directly to the player. \
Each ## section is one boss encounter — treat it as a single fight even if the name contains multiple names (council fights).

Follow this exact process for each boss:

STEP 1 — FIGHT TYPE
Read the "Fight targets" line. Count how many Boss and NPC targets appear.
Single Boss = single-target fight. Multiple Boss targets = council/cleave fight. NPC adds = AoE/add-cleave fight.
The fight type determines which abilities should be prioritised.

STEP 2 — FIND THE BIGGEST SPELL USAGE GAP
Scan every row of the Spell Usage table. For each ability, compute the difference between your casts/min and the top players' average.
The row with the largest gap IS the primary issue — lead with it. Read the exact numbers directly from the table; do not estimate.
Look especially for SUBSTITUTION PAIRS: one ability you cast much more than top players, and another ability you cast much less. \
This almost always means you are using a single-target ability where the fight calls for its multi-target equivalent (or vice versa).

STEP 3 — DAMAGE BREAKDOWN
Check whether the damage split reflects the fight type. On multi-target fights, AoE abilities should rank highly for top players. \
If your damage is concentrated on a single-target ability that barely appears in top players' breakdowns, that confirms the substitution.

STEP 4 — STATS
Read exact values from the Gear & Stats table. Flag any secondary stat where the gap between you and the top players' average exceeds 30%.

STEP 5 — TALENTS
Report only meaningful differences — abilities with a direct rotation impact. Skip cosmetic or utility differences.

Output format per boss:
1. Primary issue — the single largest gap, with exact numbers from the table.
2. Secondary issues — other meaningful spell usage or damage split differences.
3. Stats — any gaps over 30% vs top player average.
4. Talents — only if impactful.
5. One thing to fix next raid.

Be concise. Every number you cite must come directly from the data tables.`;

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function fightTargetsLine(targets: FightTarget[]): string {
  if (targets.length === 0) return 'unknown';
  return targets.map((t) => `${t.name} (${t.type}, ${t.damagePct}%)`).join(', ');
}

function mdTable(headers: string[], rows: string[][]): string {
  const cols = headers.length;
  const pad = (s: string) => ` ${s} `;
  const headerRow = `|${headers.map(pad).join('|')}|`;
  const sepRow = `|${Array.from({ length: cols }).fill('---').join('|')}|`;
  const dataRows = rows.map((r) => `|${r.map(pad).join('|')}|`);
  return [headerRow, sepRow, ...dataRows].join('\n');
}

function statsTable(
  char: CharacterStats & {
    dps: number;
    killTime: string;
    overallPct: number | null;
    bossDps: number | null;
    bossDpsPct: number | null;
  },
  topPlayers: TopPlayer[]
): string {
  const youLabel = char.overallPct != null ? `You (${char.overallPct}th pct)` : 'You';
  const headers = ['', youLabel, ...topPlayers.map((_, i) => `P${i + 1}`)];

  const rows: [string, (c: typeof char, p: TopPlayer) => string][] = [
    ['DPS', (c, p) => fmt(p?.stats.dps ?? c.dps)],
    ['Kill time', (c, p) => p?.stats.killTime ?? c.killTime],
    ['ilvl', (c, p) => (p?.stats.avgIlvl ?? c.avgIlvl).toFixed(1)],
    ['Agility', (c, p) => fmt(p?.stats.agility ?? c.agility)],
    ['Crit', (c, p) => fmt(p?.stats.crit ?? c.crit)],
    ['Haste', (c, p) => fmt(p?.stats.haste ?? c.haste)],
    ['Mastery', (c, p) => fmt(p?.stats.mastery ?? c.mastery)],
    ['Vers', (c, p) => fmt(p?.stats.vers ?? c.vers)],
  ];

  const tableRows = rows.map(([label, fn]) => [
    label,
    label === 'DPS' && char.bossDps
      ? `${fmt(char.dps)} (boss: ${fmt(char.bossDps)}, ${char.bossDpsPct}th)`
      : fn(char, topPlayers[0]),
    ...topPlayers.map((p) => fn(char, p)),
  ]);

  // Fix first column (character values use the char object directly)
  const fixedRows = rows.map(([label, fn]) => {
    const charVal =
      label === 'DPS' && char.bossDps
        ? `${fmt(char.dps)} (boss: ${fmt(char.bossDps)}, ${char.bossDpsPct}th)`
        : label === 'DPS'
          ? fmt(char.dps)
          : label === 'Kill time'
            ? char.killTime
            : label === 'ilvl'
              ? char.avgIlvl.toFixed(1)
              : label === 'Agility'
                ? fmt(char.agility)
                : label === 'Crit'
                  ? fmt(char.crit)
                  : label === 'Haste'
                    ? fmt(char.haste)
                    : label === 'Mastery'
                      ? fmt(char.mastery)
                      : fmt(char.vers);
    return [label, charVal, ...topPlayers.map((p) => fn(char, p))];
  });

  void tableRows; // unused after refactor above
  return mdTable(headers, fixedRows);
}

function spellUsageTable(charRotation: RotationSummary, topPlayers: TopPlayer[]): string {
  const allAbilities = [
    ...new Set([
      ...Object.keys(charRotation.casts),
      ...topPlayers.flatMap((p) => Object.keys(p.rotation.casts)),
    ]),
  ]
    .filter((name) => {
      const charCasts = charRotation.casts[name]?.casts ?? 0;
      const topCasts = topPlayers.reduce((s, p) => s + (p.rotation.casts[name]?.casts ?? 0), 0);
      return charCasts + topCasts > 0;
    })
    .sort((a, b) => (charRotation.casts[b]?.casts ?? 0) - (charRotation.casts[a]?.casts ?? 0));

  if (allAbilities.length === 0) return '';

  const headers = ['Ability (casts/min)', 'You', ...topPlayers.map((_, i) => `P${i + 1}`)];
  const rows = allAbilities.map((name) => [
    name,
    charRotation.casts[name]?.perMin.toFixed(2) ?? '0',
    ...topPlayers.map((p) => p.rotation.casts[name]?.perMin.toFixed(2) ?? '0'),
  ]);

  return mdTable(headers, rows);
}

function uptimeTable(charRotation: RotationSummary, topPlayers: TopPlayer[]): string {
  const allBuffs = [
    ...new Set([
      ...Object.keys(charRotation.buffs),
      ...topPlayers.flatMap((p) => Object.keys(p.rotation.buffs)),
    ]),
  ].filter((name) => {
    const charPct = charRotation.buffs[name] ?? 0;
    const topPct = topPlayers.reduce((s, p) => s + (p.rotation.buffs[name] ?? 0), 0);
    return charPct + topPct > 0;
  });

  if (allBuffs.length === 0) return '';

  const headers = ['Buff uptime (%)', 'You', ...topPlayers.map((_, i) => `P${i + 1}`)];
  const rows = allBuffs.map((name) => [
    name,
    String(charRotation.buffs[name] ?? 0),
    ...topPlayers.map((p) => String(p.rotation.buffs[name] ?? 0)),
  ]);

  return mdTable(headers, rows);
}

function damageTable(charEntries: DamageEntry[], topPlayers: TopPlayer[]): string {
  const charTotal = charEntries.reduce((s, e) => s + e.total, 0);
  if (charTotal === 0) return '';

  const topTotals = topPlayers.map((p) => p.damageTable.entries.reduce((s, e) => s + e.total, 0));

  const topAbilities = charEntries.slice(0, 10).map((e) => e.name);

  const headers = ['Damage source', 'You %', ...topPlayers.map((_, i) => `P${i + 1} %`)];
  const rows = topAbilities.map((name) => {
    const charPct = (
      ((charEntries.find((e) => e.name === name)?.total ?? 0) / charTotal) *
      100
    ).toFixed(1);
    const topPcts = topPlayers.map((p, i) => {
      const entry = p.damageTable.entries.find((e) => e.name === name);
      return topTotals[i] > 0 ? (((entry?.total ?? 0) / topTotals[i]) * 100).toFixed(1) : '—';
    });
    return [name, charPct, ...topPcts];
  });

  return mdTable(headers, rows);
}

function makeTalentNameFn(nodes: TalentNode[]) {
  return function talentName(talentId: number): string {
    const node = nodes.find((n) => n.talentIds.includes(talentId));
    if (!node) return `#${talentId}`;
    if (node.nodeType === 'choice') {
      const idx = node.talentIds.indexOf(talentId);
      return node.names[idx] ?? node.name;
    }
    return node.name;
  };
}

function talentDiff(
  myTalents: Record<number, number>,
  topPlayers: BossResult['topPlayers'],
  talentName: (id: number) => string
): string {
  if (topPlayers.length === 0) return '';

  const lines: string[] = [];

  const topAllIds = new Set(topPlayers.flatMap((p) => Object.keys(p.stats.talents).map(Number)));
  const onlyMe = Object.keys(myTalents)
    .map(Number)
    .filter((id) => !topAllIds.has(id));
  if (onlyMe.length > 0)
    lines.push(`You have, top players don't: ${onlyMe.map(talentName).join(', ')}`);

  const myIds = new Set(Object.keys(myTalents).map(Number));
  const topShared = [...topAllIds].filter(
    (id) => !myIds.has(id) && topPlayers.every((p) => p.stats.talents[id] !== undefined)
  );
  if (topShared.length > 0)
    lines.push(`Top players have, you don't: ${topShared.map(talentName).join(', ')}`);

  const rankDiffs: string[] = [];
  for (const id of myIds) {
    if (!topAllIds.has(id)) continue;
    const myRank = myTalents[id];
    for (let pi = 0; pi < topPlayers.length; pi++) {
      const topRank = topPlayers[pi].stats.talents[id];
      if (topRank !== undefined && topRank !== myRank) {
        rankDiffs.push(`${talentName(id)}: you rank ${myRank}, P${pi + 1} rank ${topRank}`);
      }
    }
  }
  if (rankDiffs.length > 0) lines.push(`Rank differences: ${rankDiffs.join('; ')}`);

  return lines.join('\n') || 'Talent builds are identical.';
}

export function buildAnalysisPrompt(
  result: AnalysisResult,
  talentNodes: TalentNode[] = []
): string {
  const talentName = makeTalentNameFn(talentNodes);
  const difficultyLabel: Record<number, string> = { 3: 'Normal', 4: 'Heroic', 5: 'Mythic' };
  const diff = difficultyLabel[result.input.difficulty] ?? `Difficulty ${result.input.difficulty}`;

  const bossSections = result.bosses
    .map((boss, i) => {
      if (!boss) return `## Boss ${i + 1}\nNo data available for this boss.`;

      const topPlayers = boss.topPlayers.slice(0, 3);
      const charStats = {
        ...boss.character.stats,
        dps: boss.character.dps,
        killTime: boss.character.killTime,
        overallPct: boss.character.overallPct,
        bossDps: boss.character.bossDps,
        bossDpsPct: boss.character.bossDpsPct,
      };

      const sections: string[] = [
        `## ${boss.encounter}`,
        `Fight targets: ${fightTargetsLine(boss.fightTargets)}`,
        '',
        '### Gear & Stats',
        statsTable(charStats, topPlayers),
        '',
        '### Spell Usage',
        spellUsageTable(boss.character.rotation, topPlayers),
        '',
      ];

      const uptimes = uptimeTable(boss.character.rotation, topPlayers);
      if (uptimes) {
        sections.push('### Buff Uptimes', uptimes, '');
      }

      sections.push(
        '### Damage Breakdown',
        damageTable(boss.character.damageTable.entries, topPlayers),
        '',
        '### Talent Differences',
        talentDiff(boss.character.stats.talents, topPlayers, talentName)
      );

      return sections.join('\n');
    })
    .join('\n\n---\n\n');

  return [
    `# WarcraftLogs Performance Analysis — ${result.input.characterName}-${result.input.serverSlug} (${diff})`,
    '',
    bossSections,
    '',
    '---',
    '',
    'For each boss with data, provide:',
    '1. The single most impactful rotation fix with exact numbers.',
    '2. Any secondary rotation issues (cast frequency, damage contribution of key abilities).',
    '3. Stat observations vs top players.',
    '4. Talent notes if differences exist.',
    '5. One thing to focus on next raid.',
    '',
    'Be concise. Cite exact numbers. Skip bosses marked "No data available".',
  ].join('\n');
}
