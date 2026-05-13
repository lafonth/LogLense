import type { AnalysisResult, BossResult, CharacterStats, DamageEntry, FightTarget, RotationSummary, TalentNode } from '@/types';
import talentTree from '@/data/feral-druid-talents.json';

export const SYSTEM_PROMPT = `You are a Feral Druid performance coach analysing WarcraftLogs data. \
Speak directly to the player. Every recommendation must cite specific numbers from the data.

Your job is to reason from the data, not apply a fixed checklist. For each boss:
- Look at which abilities the top players cast significantly more or less than the character. Those gaps are the story.
- Use the fight targets list to determine fight type: multiple Boss targets = council fight, NPC adds = cleave/AoE. \
  Adjust your advice accordingly — on multi-target fights Primal Wrath replaces single-target Rip, Swipe replaces Shred.
- On single-target fights: Tiger's Fury alignment with Berserk, Rip and Rake uptime, Ferocious Bite only with fresh DoTs.
- Compare stats — large Crit, Haste, or Mastery gaps vs top players are worth flagging.
- If talents differ, explain the practical impact.

Be concise. Lead with the single most impactful finding backed by exact numbers.`;

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function pct(entries: DamageEntry[], name: string): string {
  const total = entries.reduce((s, e) => s + e.total, 0);
  const entry = entries.find((e) => e.name === name);
  if (!entry || total === 0) return '—';
  return `${((entry.total / total) * 100).toFixed(1)}%`;
}

function damageBreakdown(entries: DamageEntry[]): string {
  if (entries.length === 0) return '';
  const total = entries.reduce((s, e) => s + e.total, 0);
  if (total === 0) return '';
  return entries
    .slice(0, 10)
    .map((e) => `${e.name} ${((e.total / total) * 100).toFixed(1)}%`)
    .join(', ');
}

function rotationLine(r: RotationSummary): string {
  return Object.entries(r.casts)
    .filter(([, v]) => v.casts > 0)
    .map(([k, v]) => `${k} ${v.perMin.toFixed(2)}/min`)
    .join(' | ');
}

function statsLine(s: CharacterStats & { dps: number; killTime: string }): string {
  return `ilvl ${s.avgIlvl.toFixed(1)} | Agi ${fmt(s.agility)} | Crit ${fmt(s.crit)} | Haste ${fmt(s.haste)} | Mastery ${fmt(s.mastery)} | Vers ${fmt(s.vers)}`;
}

function fightTargetsLine(targets: FightTarget[]): string {
  if (targets.length === 0) return 'unknown';
  return targets.map((t) => `${t.name} (${t.type}, ${t.damagePct}%)`).join(', ');
}

function playerBlock(
  label: string,
  stats: CharacterStats & { dps: number; killTime: string },
  rotation: RotationSummary,
  damageEntries: DamageEntry[],
  bossDps?: number | null,
  bossDpsPct?: number | null,
): string {
  const tfUptime = rotation.buffs["Tiger's Fury"] ?? 0;
  const ripPct = pct(damageEntries, 'Rip');
  const rakePct = pct(damageEntries, 'Rake');

  const dpsLine = bossDps
    ? `DPS: ${fmt(stats.dps)} (boss-only: ${fmt(bossDps)}, ${bossDpsPct}th pct) | Kill time: ${stats.killTime}`
    : `DPS: ${fmt(stats.dps)} | Kill time: ${stats.killTime}`;

  const lines = [
    `### ${label}`,
    dpsLine,
    `Stats: ${statsLine(stats)}`,
    `Rotation (casts/min): ${rotationLine(rotation)}`,
    `Tiger's Fury uptime: ${tfUptime}%`,
    `Damage % of total: ${damageBreakdown(damageEntries)}`,
    `  (Rip: ${ripPct} of damage | Rake: ${rakePct} of damage)`,
  ];
  return lines.join('\n');
}

const nodes = talentTree as TalentNode[];

function talentName(talentId: number): string {
  const node = nodes.find((n) => n.talentIds.includes(talentId));
  if (!node) return `#${talentId}`;
  if (node.nodeType === 'choice') {
    const idx = node.talentIds.indexOf(talentId);
    return node.names[idx] ?? node.name;
  }
  return node.name;
}

function talentDiff(
  myTalents: Record<number, number>,
  topPlayers: BossResult['topPlayers']
): string {
  if (topPlayers.length === 0) return '';

  const lines: string[] = [];

  // IDs only you have (none of the top players have it)
  const topAllIds = new Set(topPlayers.flatMap((p) => Object.keys(p.stats.talents).map(Number)));
  const onlyMe = Object.keys(myTalents)
    .map(Number)
    .filter((id) => !topAllIds.has(id));
  if (onlyMe.length > 0)
    lines.push(`You have, top players don't: ${onlyMe.map(talentName).join(', ')}`);

  // IDs all top players have that you don't
  const myIds = new Set(Object.keys(myTalents).map(Number));
  const topShared = [...topAllIds].filter(
    (id) => !myIds.has(id) && topPlayers.every((p) => p.stats.talents[id] !== undefined)
  );
  if (topShared.length > 0)
    lines.push(`Top players have, you don't: ${topShared.map(talentName).join(', ')}`);

  // Rank differences on shared talents (e.g., you have rank 1, they have rank 2)
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

export function buildAnalysisPrompt(result: AnalysisResult): string {
  const bossSections = result.bosses
    .map((boss, i) => {
      if (!boss) return `## Boss ${i + 1}\nNo data available for this boss.`;

      const topPlayers = boss.topPlayers.slice(0, 3);

      const charStats = {
        ...boss.character.stats,
        dps: boss.character.dps,
        killTime: boss.character.killTime,
      };

      const charBlock = playerBlock(
        `You (${boss.character.overallPct}th percentile)`,
        charStats,
        boss.character.rotation,
        boss.character.damageTable.entries,
        boss.character.bossDps,
        boss.character.bossDpsPct,
      );

      const topBlocks = topPlayers
        .map((p, idx) =>
          playerBlock(`Top Player ${idx + 1}`, p.stats, p.rotation, p.damageTable.entries)
        )
        .join('\n\n');

      return [
        `## ${boss.encounter}`,
        `Fight targets: ${fightTargetsLine(boss.fightTargets)}`,
        '',
        charBlock,
        '',
        topBlocks,
        '',
        '### Talent differences',
        talentDiff(boss.character.stats.talents, topPlayers),
      ].join('\n');
    })
    .join('\n\n---\n\n');

  const difficultyLabel: Record<number, string> = { 3: 'Normal', 4: 'Heroic', 5: 'Mythic' };
  const diff = difficultyLabel[result.input.difficulty] ?? `Difficulty ${result.input.difficulty}`;

  return [
    `# Feral Druid Performance Analysis — ${result.input.characterName}-${result.input.serverSlug} (${diff})`,
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
