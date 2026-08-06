import type {
  AnalysisResult,
  BossResult,
  CharacterStats,
  DamageEntry,
  FightTarget,
  ReferenceSample,
  RotationSummary,
  TalentNode,
  TopPlayer,
} from '@/types';
import { describeValues, STAT_AXES, usableSample } from '@/lib/comparison/stat-distribution';
import { fmtMs } from '@/lib/wcl/parsers';

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
The Gear & Stats table gives, for each axis, your value and the comparable field's min, median, max and your percentile within it. \
Read it as a position, not as a duel: report where the player sits (below p25, around the median, above p75) and by how much against the MEDIAN. \
A value inside the field's min–max range is normal even when it is not the highest — do not call it a problem. \
Flag an axis only when the player sits at or beyond the edge of the field, and say how many logs the field contains.

STEP 5 — TALENTS
Every talent line carries an adoption count k/n over the field. Weight your advice by it: n−1 out of n is a standard the player is missing, \
2 out of 12 is a niche pick and not a mistake. Report only differences with a direct rotation impact, and always cite the count.

Output format per boss:
1. Primary issue — the single largest gap, with exact numbers from the table.
2. Secondary issues — other meaningful spell usage or damage split differences.
3. Stats — where the player sits in the field, with the percentile and the gap to the median.
4. Talents — only if impactful, with the adoption count.
5. One thing to fix next raid.

Be concise. Every number you cite must come directly from the data tables.`;

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

const COMPARABILITY_LABEL: Record<BossResult['comparability']['level'], string> = {
  close: 'Comparable',
  approximate: 'Roughly comparable',
  poor: 'Not comparable',
  none: 'No comparable logs',
};

/** Same arithmetic as ComparabilityBanner: gap = reference − mine. */
function comparabilitySection(comparability: BossResult['comparability']): string {
  const { level, referenceIlvl, myIlvl, referenceKillTimeMs, myKillTimeMs } = comparability;

  const lines = [`### Comparison basis`, `${COMPARABILITY_LABEL[level]}.`];

  if (referenceIlvl !== null && referenceKillTimeMs !== null && myKillTimeMs !== 0) {
    const ilvlGap = referenceIlvl - myIlvl;
    const killTimeGapPct = ((referenceKillTimeMs - myKillTimeMs) / myKillTimeMs) * 100;
    const sign = (n: number) => (n < 0 ? '' : '+');
    lines.push(
      `References sit at ${referenceIlvl} item level (${sign(ilvlGap)}${ilvlGap.toFixed(1)} against your ${myIlvl}), ` +
        `kill time ${sign(killTimeGapPct)}${killTimeGapPct.toFixed(1)}% against yours.`
    );
  }

  if (level === 'poor' || level === 'none') {
    lines.push(
      'The comparison basis is weak — attribute the DPS gap to the difference in context ' +
        '(kill time, item level) rather than to the player, and say so explicitly.'
    );
  }

  return lines.join('\n');
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

type PromptCharStats = CharacterStats & {
  dps: number;
  killTime: string;
  overallPct: number | null;
  bossDps: number | null;
  bossDpsPct: number | null;
};

/** Un axe chiffré : ma valeur, celles du champ, et comment les écrire. */
interface StatAxis {
  label: string;
  mine: number;
  values: number[];
  format: (v: number) => string;
  /** Rendu de ma cellule quand elle porte plus que le nombre (le DPS boss, par exemple). */
  mineCell?: string;
}

function promptAxes(
  char: PromptCharStats,
  myKillTimeMs: number,
  entries: ReferenceSample[]
): StatAxis[] {
  const statAxes = STAT_AXES.map(({ key, label }) => ({
    label,
    mine: char[key],
    values: entries.map((e) => e.stats[key]),
    format: key === 'avgIlvl' ? (v: number) => v.toFixed(1) : fmt,
  }));

  return [
    {
      label: 'DPS',
      mine: char.dps,
      values: entries.map((e) => e.dps),
      format: fmt,
      mineCell: char.bossDps
        ? `${fmt(char.dps)} (boss: ${fmt(char.bossDps)}, ${char.bossDpsPct}th)`
        : undefined,
    },
    {
      label: 'Kill time',
      mine: myKillTimeMs,
      values: entries.map((e) => e.killTimeMs),
      format: fmtMs,
      mineCell: char.killTime,
    },
    ...statAxes,
  ];
}

/**
 * La distribution du champ comparable, pas trois colonnes juxtaposées.
 *
 * L'échantillon vient de toute la fenêtre vérifiée : le modèle doit répondre « où se situe
 * ce joueur », question à laquelle trois exemples ne répondent pas. Le percentile est un
 * rang moyen — 50 veut dire médian, pas « moitié moins bien ».
 */
function statsTable(
  char: PromptCharStats,
  myKillTimeMs: number,
  sample: ReferenceSample[]
): string {
  const youLabel = char.overallPct != null ? `You (${char.overallPct}th pct)` : 'You';
  const { entries, includesDisqualified } = usableSample(sample);
  const axes = promptAxes(char, myKillTimeMs, entries);

  if (entries.length === 0) {
    return mdTable(
      ['', youLabel],
      axes.map((a) => [a.label, a.mineCell ?? a.format(a.mine)])
    );
  }

  const headers = ['', youLabel, 'Field min', 'Field median', 'Field max', 'Your percentile'];
  const rows = axes.flatMap((a) => {
    const d = describeValues(a.mine, a.values);
    if (!d) return [];
    return [
      [
        a.label,
        a.mineCell ?? a.format(d.mine),
        a.format(d.min),
        a.format(d.median),
        a.format(d.max),
        `p${d.percentile}`,
      ],
    ];
  });

  const notes = [
    `Field = ${entries.length} comparable logs. Percentile is your rank within that field; ` +
      'on the kill time row a low percentile means a faster kill, which is better.',
  ];
  if (includesDisqualified) {
    notes.push(
      'None of these logs passed the eliminatory criteria — every one of them was helped ' +
        'more than the player. Treat the whole field as unreliable and say so.'
    );
  }

  return [mdTable(headers, rows), '', ...notes].join('\n');
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

/**
 * L'écart de build en taux d'adoption, pas en trois avis.
 *
 * « Deux références sur trois prennent X » et « onze sur douze prennent X » n'appellent pas
 * la même conclusion, et seule la seconde formulation permet au modèle de distinguer un
 * choix de niche d'un standard. Le dénominateur est donc toujours écrit.
 */
function talentDiff(
  myTalents: Record<number, number>,
  sample: ReferenceSample[],
  talentName: (id: number) => string
): string {
  const { entries } = usableSample(sample);
  if (entries.length === 0) return '';

  const total = entries.length;
  const takenBy = (id: number) => entries.filter((e) => e.stats.talents[id] !== undefined).length;

  const myIds = new Set(Object.keys(myTalents).map(Number));
  const fieldIds = new Set(entries.flatMap((e) => Object.keys(e.stats.talents).map(Number)));

  const lines: string[] = [`Field size: ${total} comparable logs.`];

  const mine = [...myIds]
    .map((id) => ({ id, count: takenBy(id) }))
    .filter(({ count }) => count < total)
    .sort((a, b) => a.count - b.count);
  if (mine.length > 0) {
    lines.push(
      `Your picks the field does not share: ${mine
        .map(({ id, count }) => `${talentName(id)} (${count}/${total})`)
        .join(', ')}`
    );
  }

  const theirs = [...fieldIds]
    .filter((id) => !myIds.has(id))
    .map((id) => ({ id, count: takenBy(id) }))
    .sort((a, b) => b.count - a.count);
  if (theirs.length > 0) {
    lines.push(
      `Taken by the field, not by you: ${theirs
        .map(({ id, count }) => `${talentName(id)} (${count}/${total})`)
        .join(', ')}`
    );
  }

  const rankDiffs = [...myIds].flatMap((id) => {
    const ranks = entries
      .map((e) => e.stats.talents[id])
      .filter((r): r is number => r !== undefined);
    const d = ranks.length > 0 ? describeValues(myTalents[id], ranks) : null;
    if (!d || d.median === d.mine) return [];
    return [
      `${talentName(id)}: you rank ${d.mine}, field median ${d.median} (${ranks.length}/${total})`,
    ];
  });
  if (rankDiffs.length > 0) lines.push(`Rank differences: ${rankDiffs.join('; ')}`);

  return lines.length === 1 ? 'Your build matches the field on every node.' : lines.join('\n');
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
      // Le champ, c'est l'échantillon retenu — pas la fenêtre brute. Annoncer `sample.length`
      // alors que les tableaux se lisent sur les seuls qualifiés donnerait deux effectifs
      // différents pour la même chose.
      const fieldSize = usableSample(boss.sample).entries.length;
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
        comparabilitySection(boss.comparability),
        '',
        // Les deux échantillons n'ont pas le même prix : stats et talents sortent d'un
        // `CombatantInfo` déjà payé, dégâts et rotation coûtent une requête par référence.
        // Le modèle doit savoir sur combien de logs chaque tableau repose, sans quoi il
        // parlera d'une tendance là où il n'y a que trois joueurs.
        `Stats and talents are compared against the full comparable field (${fieldSize} logs). ` +
          `Spell usage, buff uptimes and damage breakdown are compared against the ${topPlayers.length} closest of them only — ` +
          'do not present those as the behaviour of a whole population.',
        '',
        '### Gear & Stats',
        statsTable(charStats, boss.comparability.myKillTimeMs, boss.sample),
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
        talentDiff(boss.character.stats.talents, boss.sample, talentName)
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
    '3. Where the player sits in the comparable field on stats.',
    '4. Talent notes if differences exist, with their adoption count.',
    '5. One thing to focus on next raid.',
    '',
    'Be concise. Cite exact numbers. Skip bosses marked "No data available".',
  ].join('\n');
}
