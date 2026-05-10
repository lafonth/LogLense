import type { AnalysisResult, BossResult, CharacterStats, RotationSummary } from '@/types';

export const SYSTEM_PROMPT = `You are a Feral Druid performance coach analysing WarcraftLogs data. \
Speak directly to the player. Every recommendation must cite specific numbers from the data. \
You know Feral Druid rotation theory: Tiger's Fury alignment with Berserk and openers, \
Rip and Rake uptime targets (95%+), Ferocious Bite only with fresh DoTs, \
Berserk + Tiger's Fury alignment, Convoke the Spirits opener timing. \
Be concise. Lead with the most impactful improvement.`;

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function talentDiff(
  myTalents: Record<number, number>,
  topPlayers: BossResult['topPlayers']
): string {
  if (topPlayers.length === 0) return '';

  const topTalentSets = topPlayers.map((p) => new Set(Object.keys(p.stats.talents)));
  const mySet = new Set(Object.keys(myTalents));

  const topHasAll = (id: string) => topTalentSets.every((s) => s.has(id));
  const topHasAny = (id: string) => topTalentSets.some((s) => s.has(id));

  const onlyMe = [...mySet].filter((id) => !topHasAny(id));
  const onlyTop = topTalentSets
    .flatMap((s) => [...s])
    .filter((id) => !mySet.has(id) && topHasAll(id))
    .filter((id, i, arr) => arr.indexOf(id) === i);

  const lines: string[] = [];
  if (onlyMe.length > 0) lines.push(`You have, top players don't: talent IDs ${onlyMe.join(', ')}`);
  if (onlyTop.length > 0)
    lines.push(`Top players have, you don't: talent IDs ${onlyTop.join(', ')}`);
  return lines.join('\n') || 'Talent builds are identical.';
}

function rotationTable(me: RotationSummary, tops: BossResult['topPlayers']): string {
  const sections: {
    label: string;
    key: keyof Pick<RotationSummary, 'cooldowns' | 'generators' | 'finishers'>;
  }[] = [
    { label: 'Cooldowns (casts/min)', key: 'cooldowns' },
    { label: 'Generators (casts/min)', key: 'generators' },
    { label: 'Finishers (casts/min)', key: 'finishers' },
  ];

  return sections
    .map(({ label, key }) => {
      const abilities = Object.keys(me[key]);
      const header = ['Ability', 'You', ...tops.map((_, i) => `P${i + 1}`)].join(' | ');
      const sep = header
        .split(' | ')
        .map(() => '---')
        .join(' | ');
      const rows = abilities.map((ab) => {
        const myVal = me[key][ab]?.perMin.toFixed(2) ?? '0';
        const topVals = tops.map((p) => p.rotation[key]?.[ab]?.perMin.toFixed(2) ?? '0');
        return [ab, myVal, ...topVals].join(' | ');
      });
      return `### ${label}\n| ${header} |\n| ${sep} |\n${rows.map((r) => `| ${r} |`).join('\n')}`;
    })
    .join('\n\n');
}

function statsTable(
  me: CharacterStats & { dps: number; killTime: string },
  tops: BossResult['topPlayers']
): string {
  const stats: {
    label: string;
    getValue: (s: CharacterStats & { dps: number; killTime: string }) => string;
  }[] = [
    { label: 'DPS', getValue: (s) => fmt(s.dps) },
    { label: 'Kill time', getValue: (s) => s.killTime },
    { label: 'Avg ilvl', getValue: (s) => s.avgIlvl.toFixed(1) },
    { label: 'Agility', getValue: (s) => fmt(s.agility) },
    { label: 'Crit', getValue: (s) => fmt(s.crit) },
    { label: 'Haste', getValue: (s) => fmt(s.haste) },
    { label: 'Mastery', getValue: (s) => fmt(s.mastery) },
    { label: 'Versatility', getValue: (s) => fmt(s.vers) },
  ];

  const header = ['Stat', 'You', ...tops.map((_, i) => `P${i + 1}`)].join(' | ');
  const sep = header
    .split(' | ')
    .map(() => '---')
    .join(' | ');
  const rows = stats.map(({ label, getValue }) => {
    const myVal = getValue(me);
    const topVals = tops.map((p) => getValue({ ...p.stats }));
    return [label, myVal, ...topVals].join(' | ');
  });

  return `### Stats\n| ${header} |\n| ${sep} |\n${rows.map((r) => `| ${r} |`).join('\n')}`;
}

function uptimeTable(me: RotationSummary, tops: BossResult['topPlayers']): string {
  const keys = Object.keys(me.uptime);
  const header = ['Buff/Debuff', 'You', ...tops.map((_, i) => `P${i + 1}`)].join(' | ');
  const sep = header
    .split(' | ')
    .map(() => '---')
    .join(' | ');
  const rows = keys.map((k) => {
    const myVal = `${me.uptime[k]}%`;
    const topVals = tops.map((p) => `${p.rotation.uptime?.[k] ?? 0}%`);
    return [k, myVal, ...topVals].join(' | ');
  });

  return `### Uptime\n| ${header} |\n| ${sep} |\n${rows.map((r) => `| ${r} |`).join('\n')}`;
}

export function buildAnalysisPrompt(result: AnalysisResult): string {
  const bossSections = result.bosses
    .map((boss, i) => {
      if (!boss) return `## Boss ${i + 1}\nNo data available for this boss.`;

      const charWithMeta = {
        ...boss.character.stats,
        dps: boss.character.dps,
        killTime: boss.character.killTime,
      };

      return [
        `## ${boss.encounter}`,
        `Kill time: ${boss.character.killTime} | Your DPS: ${fmt(boss.character.dps)} (${boss.character.overallPct}th percentile)`,
        '',
        statsTable(charWithMeta, boss.topPlayers),
        '',
        rotationTable(boss.character.rotation, boss.topPlayers),
        '',
        uptimeTable(boss.character.rotation, boss.topPlayers),
        '',
        '### Talent differences',
        talentDiff(boss.character.stats.talents, boss.topPlayers),
      ].join('\n');
    })
    .join('\n\n---\n\n');

  return [
    `# Feral Druid Performance Analysis — ${result.input.characterName}-${result.input.serverSlug}`,
    '',
    bossSections,
    '',
    '---',
    '',
    'For each boss with data, provide:',
    '1. The single most impactful rotation fix with exact numbers.',
    '2. Any secondary rotation issues (uptime, cast frequency).',
    '3. Stat observations vs top players.',
    '4. Talent notes if differences exist.',
    '5. One thing to focus on next raid.',
    '',
    'Be concise. Cite exact numbers. Skip bosses marked "No data available".',
  ].join('\n');
}
