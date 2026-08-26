import type { AbilityComparison } from '@/lib/comparison/rotation-stats';
import type { TalentDiffEntry } from '@/lib/comparison/talent-diff';
import type { TrendVerdict } from '@/lib/comparison/trend';
import type { TrajectoryPoint } from '@/lib/wcl/trajectory';
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
import { damageGaps } from '@/lib/comparison/damage-gap';
import { leadingGap } from '@/lib/comparison/leading-gap';
import { diffOpening } from '@/lib/comparison/opening-diff';
import { compareCasts, compareUptimes } from '@/lib/comparison/rotation-stats';
import { describeValues, STAT_AXES, usableSample } from '@/lib/comparison/stat-distribution';
import { diffTalents } from '@/lib/comparison/talent-diff';
import { analyseTrend } from '@/lib/comparison/trend';
import { buildVerdict } from '@/lib/comparison/verdict';
import { getSpecInfo } from '@/lib/specs';
import { fmtMs } from '@/lib/wcl/parsers';

/**
 * Les deux règles qui gouvernent tout ce qu'un modèle dit de ces données, extraites parce
 * que le chat les porte aussi. Recopiées, elles dériveraient : le rapport interdirait un
 * conseil que le chat autorise, et le périmètre du produit dépendrait de la porte empruntée.
 */
export const TRACEABILITY_RULE = `TRACEABILITY — every recommendation must be traceable to something the reference cohort actually did on this boss at this difficulty. \
The cohort is a set of ranked kills of the same encounter, filtered on item level, kill time, tier set and offensive externals; the tables are its numbers. \
If a change is not visible in those numbers, do not recommend it: no theorycrafted priority list, no simulation result, no remembered guide. \
Where the data is silent, say it is silent — that is an acceptable answer, an invented fix is not.`;

export const SCOPE_RULE = `SCOPE — outgoing damage only. Never advise on survival, defensives, deaths, interrupts, positioning or boss mechanics. \
You are given no data on any of them, so anything said there would be invented.`;

export const SYSTEM_PROMPT = `You are a WarcraftLogs damage coach. Speak directly to the player. \
Each ## section is one boss encounter — treat it as a single fight even if the name contains multiple names (council fights).

Two rules govern everything below.

${TRACEABILITY_RULE}

${SCOPE_RULE}

Follow this exact process for each boss:

STEP 1 — WHERE THE DAMAGE WENT
Read the "Damage by Target" table: your damage split by target, and the same split for each reference. \
Count the Boss and NPC targets — one Boss target is a single-target fight, several are a council/cleave fight, NPC adds make it an add-cleave fight.
Then compare the splits. When you and the references hit the same targets in roughly the same proportions, the fight type is settled and you move on. \
When you diverge on WHAT you hit rather than on HOW you hit it — adds you ignored, a target they left alone — that is a difference in assignment, not a mistake. \
Name it as such and do not correct it: a rotation fix derived from a target split the player was never assigned is wrong advice.

STEP 2 — THE RANKED ROTATION GAPS
The Spell Usage table is ALREADY ordered by damage impact: the deviation from the reference median, weighted by the share of damage the ability carries. \
The top row is therefore the gap that costs the most, and you must not re-rank the table by raw casts/min difference — a cast missed on a filler is not a cast missed on the main damage source.
Each row gives your rate, the field min, median and max, your deviation and that damage share. \
A value inside the field's min–max range is not a gap whatever its deviation: the references disagree with each other there. Read the numbers off the table, never estimate them.
Look for SUBSTITUTION PAIRS among the top rows: one ability you cast much more than the field, another much less. \
On many specs this means a single-target ability is used where the fight calls for its multi-target equivalent (or vice versa) — but not on all of them: \
some specs cleave passively, or press the same buttons at every target count. Treat a substitution pair as a hypothesis and confirm it in STEP 3 before reporting it as the primary issue.

STEP 3 — DAMAGE BREAKDOWN
The table holds the union of your biggest damage sources and the field's, so an ability you barely press still appears when the field draws real damage from it. \
The Gap column is the field median minus you, in points of total damage.
A large positive gap is the strongest single finding available: the references convert something into damage that you do not. Name the ability, quote both shares, and tie it to its cast rate in STEP 2.
A large negative gap on a single-target ability in a multi-target fight confirms a substitution. If the breakdown does not corroborate the hypothesis, drop it and lead with the next ranked gap instead.

STEP 4 — STATS
The Gear & Stats table gives, for each axis, your value and the comparable field's min, median, max and your percentile within it. \
Read it as a position, not as a duel: report where the player sits (below p25, around the median, above p75) and by how much against the MEDIAN. \
A value inside the field's min–max range is normal even when it is not the highest — do not call it a problem. \
Flag an axis only when the player sits at or beyond the edge of the field, and say how many logs the field contains.

STEP 5 — TALENTS
Every talent line carries an adoption count k/n over the field. Weight your advice by it: n−1 out of n is a standard the player is missing, \
2 out of 12 is a niche pick and not a mistake. Report only differences with a direct rotation impact, and always cite the count.

STEP 6 — OPENING
The Opening table is the only ordered data you have: rank, what you cast, and what the majority of references cast at that rank. \
Judge it only on the FIRST rank where you leave the majority — every later rank is shifted by that one divergence, so listing them all invents mistakes. \
Say nothing about the opening when the section is absent, when it states no reference opening is available, or when you follow the majority throughout.

STEP 7 — TRAJECTORY
The Trajectory section, when present, lists this player's previous kills on this boss. Read the verdict on the PERCENTILE column, never on the DPS column: \
the DPS of a whole raid rises across a tier as item level rises and kills get shorter, so a rising DPS curve on its own says nothing about the player. \
The section also splits the DPS swing into an item-level part, a kill-time part and a remainder. That split comes from fixed coefficients, not from measurement: \
use it as an order of magnitude — "most of the gain came from gear" — and never quote its numbers as if they were measured. \
Only the remainder speaks about the player. A plateau is the finding worth stating plainly: the player is holding position while their gear improves. \
The list contains ranked kills only, so say nothing about consistency, wipes or failed nights from it. Say nothing at all when the section is absent.

Output format per boss:
1. Trajectory — the verdict on the percentile and what it means, only if the section is present.
2. Primary issue — the top row of the ranked table, or the largest damage-breakdown gap when the two disagree, with exact numbers.
3. Secondary issues — the next gaps in the same order: damage impact first, raw casts/min difference only as a tie-breaker.
4. Target split — only when it diverges, and stated as a difference in assignment.
5. Opening — the first divergence rank and the two abilities involved, only if there is one.
6. Stats — where the player sits in the field, with the percentile and the gap to the median.
7. Talents — only if impactful, with the adoption count.
8. One thing to fix next raid.

Be concise. Every number you cite must come directly from the data tables, and every fix you name must be something a reference already does.`;

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function signedPct(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

const COMPARABILITY_LABEL: Record<BossResult['comparability']['level'], string> = {
  close: 'Comparable',
  approximate: 'Roughly comparable',
  poor: 'Not comparable',
  none: 'No comparable logs',
};

/**
 * Ce sur quoi la comparaison repose — et ce qu'elle autorise à chiffrer.
 *
 * Le verdict et l'écart de tête sont déjà calculés pour l'écran. Les recopier ici évite que
 * le modèle refasse l'arithmétique à sa façon et annonce un déficit là où l'écran a
 * précisément décidé qu'aucun chiffre ne tenait.
 *
 * `character.context` n'entre pas, et l'`earlyDeathPct` du verdict est délibérément laissé
 * de côté : une mort précoce est un avertissement de comparabilité rendu à l'écran, pas une
 * matière à conseil. C'est ce qui tient la règle de périmètre du prompt par construction —
 * faute de la moindre donnée de survie, le modèle ne peut pas en parler.
 *
 * Same arithmetic as ComparabilityBanner: gap = reference − mine.
 */
function comparabilitySection(boss: BossResult): string {
  const { level, referenceIlvl, myIlvl, referenceKillTimeMs, myKillTimeMs } = boss.comparability;

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

  const verdict = buildVerdict(boss);
  if (verdict.kind === 'gap' || verdict.kind === 'ahead') {
    lines.push(
      `Reference DPS ${fmt(verdict.referenceDps ?? 0)} over ${verdict.referenceCount} logs against your ` +
        `${fmt(verdict.myDps)} — ${fmt(verdict.deltaDps ?? 0)} ${verdict.kind === 'gap' ? 'behind them' : 'ahead of them'}. ` +
        `That is the only DPS gap you may quote.${
          verdict.kind === 'ahead'
            ? ' The player is already in front: look for what they can still convert, not for a deficit to explain.'
            : ''
        }`
    );
  } else if (verdict.kind === 'unreliable') {
    lines.push(
      'The field is not solid enough to carry a figure — describe the differences in behaviour ' +
        'and state no DPS deficit at all.'
    );
  } else {
    lines.push(
      'No usable reference DPS: say the comparison is missing rather than naming a target to reach.'
    );
  }

  if (!verdict.allEligible && verdict.referenceCount > 0) {
    lines.push(
      'Some of these references were kept although they failed an eliminatory criterion — ' +
        'say the panel is patched whenever you lean on it.'
    );
  }

  const { tierPieces, externalUptime, externals } = boss.character.eligibility;
  const tier = tierPieces === null ? 'tier set unknown' : `${tierPieces} tier set pieces`;
  const external =
    externals.length === 0
      ? 'no offensive external received'
      : `offensive externals received (${externals.join(', ')}) over ${externalUptime.toFixed(1)}% of the fight — ` +
        'that share of the damage is not the player alone';
  lines.push(`Player's own side of the eliminatory criteria: ${tier}, ${external}.`);

  const gap = leadingGap(boss);
  if (gap !== null) {
    lines.push(
      `Largest damage-weighted gap already computed: ${gap.ability} — you ${gap.mine.toFixed(2)} casts/min against ` +
        `a reference median of ${gap.reference.toFixed(2)} (${signedPct(gap.deviationPct)}) over ${gap.referenceTotal} references. ` +
        'Start there unless the damage breakdown contradicts it.'
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

function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${fmt(n)}`;
}

const VERDICT_SENTENCE: Record<TrendVerdict, string> = {
  improving: 'The locked-in percentile is rising.',
  plateau: 'The locked-in percentile is flat — a plateau.',
  declining: 'The locked-in percentile is falling.',
  insufficient:
    'Too few kills in this spec to read a trend — describe the points, do not judge them.',
};

/**
 * L'historique du joueur sur cette rencontre — ce qui manque au rapport isolé.
 *
 * Le percentile de chaque ligne est celui **verrouillé au moment du kill**, pas un percentile
 * recalculé aujourd'hui : c'est le chiffre que le joueur a vu, et le seul déjà normalisé
 * contre la population du moment. Le DPS reste dans le tableau parce que la décomposition en
 * dépend, jamais comme axe de jugement — il monte tout seul à mesure que le palier avance.
 *
 * La décomposition est annoncée comme une estimation dans le prompt lui-même : ses deux
 * coefficients sont des hypothèses, et un modèle qui citerait leurs sorties comme des mesures
 * fabriquerait une précision qui n'existe pas.
 */
function trajectorySection(trajectory: TrajectoryPoint[]): string {
  const trend = analyseTrend(trajectory);
  if (trend.points.length < 2) return '';

  const rows = trend.points.map((p) => [
    new Date(p.at).toISOString().slice(0, 10),
    String(p.rankPercent),
    fmt(p.dps),
    p.bracket === null ? '—' : String(p.bracket),
    fmtMs(p.killTimeMs),
    p.analysed ? 'analysed above' : '',
  ]);

  const playedAs = trend.spec === null ? '.' : `, played as ${trend.spec}.`;
  const lines = [
    mdTable(['Kill date', 'Percentile', 'DPS', 'ilvl', 'Kill time', ''], rows),
    '',
    `${VERDICT_SENTENCE[trend.verdict]} Slope ${signed(trend.percentileSlope)} percentile per kill over these ${trend.points.length} kills, spread ${trend.percentileSpread} percentile${playedAs}`,
  ];

  const dpsSwing = trend.steps.reduce((a, s) => a + s.dpsDelta, 0);
  const ilvlPart = trend.steps.reduce((a, s) => a + s.ilvlPart, 0);
  const killTimePart = trend.steps.reduce((a, s) => a + s.killTimePart, 0);
  lines.push(
    `Across those kills the DPS moved ${signed(dpsSwing)}: roughly ${signed(ilvlPart)} attributable to item level, ` +
      `${signed(killTimePart)} to kill time, leaving ${signed(trend.remainderTotal)} unexplained by context. ` +
      'Those attributions are estimates from fixed coefficients, not measurements — treat them as an order of ' +
      'magnitude and do not quote them as figures. Only the unexplained remainder speaks about the player.'
  );

  lines.push(
    'Ranked kills only — Warcraft Logs does not rank a wipe, so this list says nothing about consistency.'
  );

  if (trend.droppedForSpecChange > 0) {
    lines.push(
      `${trend.droppedForSpecChange} earlier kill(s) on another spec are excluded: they do not measure the same player.`
    );
  }

  return lines.join('\n');
}

/**
 * Où sont partis les dégâts, des deux côtés.
 *
 * Une ligne « 4 % sur les adds » ne dit rien seule : elle peut être une faute de priorité
 * comme l'assignation exacte que le raid a donnée au joueur. Seule la colonne des références
 * départage les deux, et c'est ce qui distingue une divergence de cible — qui se nomme — d'un
 * écart de rotation — qui se corrige. Les cibles des références sont déjà en cache : le
 * tableau ne coûte aucune requête supplémentaire.
 */
function targetTable(mine: FightTarget[], topPlayers: TopPlayer[]): string {
  const all = [...mine, ...topPlayers.flatMap((p) => p.fightTargets)];
  const names = [...new Set(all.map((t) => t.name))];
  if (names.length === 0) return '';

  const typeOf = (name: string) => all.find((t) => t.name === name)?.type ?? '?';
  const shareIn = (list: FightTarget[], name: string) =>
    list.length === 0 ? null : (list.find((t) => t.name === name)?.damagePct ?? 0);
  const cell = (list: FightTarget[], name: string) => {
    const share = shareIn(list, name);
    return share === null ? '—' : share.toFixed(1);
  };

  const weight = (name: string) =>
    Math.max(
      shareIn(mine, name) ?? 0,
      ...topPlayers.map((p) => shareIn(p.fightTargets, name) ?? 0),
      0
    );
  const ordered = [...names].sort((a, b) => weight(b) - weight(a));

  const headers = ['Target', 'Type', 'You %', ...topPlayers.map((_, i) => `P${i + 1} %`)];
  const rows = ordered.map((name) => [
    name,
    typeOf(name),
    cell(mine, name),
    ...topPlayers.map((p) => cell(p.fightTargets, name)),
  ]);

  const withTargets = topPlayers.filter((p) => p.fightTargets.length > 0).length;
  const note =
    withTargets === 0
      ? 'No reference target split available — read the fight type from your own row, and do not call any divergence.'
      : `Reference splits available for ${withTargets} of ${topPlayers.length} references. ` +
        'A dash means that reference reported no split at all; 0.0 means it reported one and put nothing on this target. ' +
        'A divergence on WHICH targets take damage is a difference in assignment, not a mistake — name it, do not correct it.';

  return [mdTable(headers, rows), '', note].join('\n');
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

/** Une ligne de comparaison, fourchette du champ comprise. `—` quand la source se tait. */
function abilityRow(c: AbilityComparison, withShare: boolean): string[] {
  const num = (v: number | null) => (v === null ? '—' : v.toFixed(2));
  const row = [
    c.name,
    c.mine.toFixed(2),
    num(c.referenceMin),
    num(c.referenceMedian),
    num(c.referenceMax),
    c.deviationPct === null ? '—' : signedPct(c.deviationPct),
  ];
  if (withShare) {
    row.push(c.damageShare === null ? '—' : `${(c.damageShare * 100).toFixed(1)}%`);
  }
  return row;
}

/**
 * La cadence des sorts, déjà classée par ce qu'elle coûte.
 *
 * `compareCasts` rend ses lignes triées par |déviation| × part de dégâts. Le tableau entre
 * dans le prompt **dans cet ordre**, et le prompt dit que l'ordre est celui de l'impact :
 * sans quoi le modèle refait le tri à sa façon, sur l'écart brut de casts/min, et met en
 * tête un filler manqué plutôt que la source de dégâts principale. La fourchette du champ
 * part avec : un écart à la médiane qui reste dans le min–max n'est pas un écart, c'est un
 * désaccord entre références.
 */
function spellUsageTable(
  charRotation: RotationSummary,
  topPlayers: TopPlayer[],
  charDamage: DamageEntry[]
): string {
  const rows = compareCasts(charRotation, topPlayers, charDamage);
  if (rows.length === 0) return '';

  const headers = [
    'Ability (casts/min)',
    'You',
    'Field min',
    'Field median',
    'Field max',
    'Deviation',
    'Damage share',
  ];

  return [
    mdTable(
      headers,
      rows.map((c) => abilityRow(c, true))
    ),
    '',
    'Rows are ordered by damage impact — deviation from the reference median weighted by the share of damage ' +
      'the ability carries — not by raw cast difference. The top row is the finding; do not re-rank the table. ' +
      'Damage share is taken as the larger of yours and the references’, so an ability the field converts ' +
      'and you never press still weighs its true cost.',
  ].join('\n');
}

/**
 * L'ouverture, rang par rang — le seul tableau du prompt où l'ordre porte l'information.
 *
 * Les agrégats disent combien de fois un sort est lancé ; ils ne disent pas dans quel ordre.
 * Une séquence identique en fréquences peut être fausse au premier bouton, et c'est
 * précisément la faute que le joueur qui plafonne ne voit plus.
 */
function openingSection(charRotation: RotationSummary, topPlayers: TopPlayer[]): string {
  const { steps, referenceTotal, firstDivergence } = diffOpening(charRotation.opening, topPlayers);
  if (steps.length === 0) return '';

  const rows = steps.map((step) => [
    String(step.index + 1),
    step.mine ?? '—',
    charRotation.opening[step.index]
      ? `+${(charRotation.opening[step.index].offsetMs / 1000).toFixed(1)}s`
      : '—',
    step.consensus === null
      ? '—'
      : `${step.consensus} (${step.consensusCount}/${step.referenceTotal})`,
  ]);

  const table = mdTable(['#', 'You', 'Offset', 'References (majority)'], rows);

  if (referenceTotal === 0) {
    return [table, '', 'No reference opening available — do not judge this sequence.'].join('\n');
  }

  const note =
    firstDivergence === null
      ? 'Your opening follows the reference majority at every rank.'
      : `Your opening leaves the reference majority at cast ${firstDivergence + 1}. ` +
        'Ranks after it are shifted, so treat that first divergence as the finding rather than ' +
        'listing every later mismatch.';

  return [table, '', `Openings compared against ${referenceTotal} references. ${note}`].join('\n');
}

function uptimeTable(charRotation: RotationSummary, topPlayers: TopPlayer[]): string {
  const rows = compareUptimes(charRotation, topPlayers);
  if (rows.length === 0) return '';

  const headers = ['Buff uptime (%)', 'You', 'Field min', 'Field median', 'Field max', 'Deviation'];

  return [
    mdTable(
      headers,
      rows.map((c) => abilityRow(c, false))
    ),
    '',
    'Ordered by deviation from the reference median. No damage share applies here — an uptime is ' +
      'a state, not a damage source — so read these rows as support for a rotation gap, never as the finding itself.',
  ].join('\n');
}

/**
 * La répartition des dégâts, dans les deux sens.
 *
 * Ancrer le tableau sur mes seules dix premières sources rendait structurellement invisible
 * le cas le plus actionnable : un sort dont les références tirent une part réelle de leurs
 * dégâts et que je n'utilise presque pas n'apparaissait nulle part, faute de figurer dans ma
 * propre tête de liste. L'union des deux têtes de liste le fait entrer, et la colonne d'écart
 * le nomme — c'est le cœur de la question « où passent les dégâts qui me manquent ».
 *
 * L'union elle-même vit dans `comparison/damage-gap.ts`, parce que l'écran la montre
 * désormais aussi : deux implémentations de la même arithmétique finiraient par diverger, et
 * le lecteur verrait le rapport et l'onglet se contredire sur le même log.
 *
 * Le tri, lui, reste ici : `damageGaps` classe par écart de dps, ce qui est la question de
 * l'écran. Le tableau du prompt classe par part de dégâts — la plus grosse source d'abord,
 * qu'elle soit un écart ou non — pour que le modèle lise d'abord de quoi le combat est fait.
 * `unionRank` départage les ex æquo, à l'identique de l'ordre d'union.
 */
function damageTable(character: BossResult['character'], topPlayers: TopPlayer[]): string {
  const rows = [...damageGaps(character, topPlayers)].sort((a, b) => {
    const delta = Math.max(b.minePct, b.fieldPct ?? 0) - Math.max(a.minePct, a.fieldPct ?? 0);
    return delta !== 0 ? delta : a.unionRank - b.unionRank;
  });
  if (rows.length === 0) return '';

  const headers = [
    'Damage source',
    'You %',
    'Field median %',
    'Gap (pts)',
    ...topPlayers.map((_, i) => `P${i + 1} %`),
  ];

  const body = rows.map((row) => [
    row.name,
    row.minePct.toFixed(1),
    row.fieldPct === null ? '—' : row.fieldPct.toFixed(1),
    row.gapPct === null ? '—' : signedPct(row.gapPct).replace('%', ''),
    ...row.referencePcts.map((pct) => (pct === null ? '—' : pct.toFixed(1))),
  ]);

  return [
    mdTable(headers, body),
    '',
    'The union of your biggest damage sources and the field’s, so an ability you barely use still appears ' +
      'when the references draw real damage from it. Gap = field median − you, in points of total damage: ' +
      'a large positive gap is damage the field converts and you do not.',
  ].join('\n');
}

function talentSection(
  nodes: TalentNode[],
  myTalents: Record<number, number>,
  sample: ReferenceSample[]
): string {
  const { entries } = usableSample(sample);
  if (entries.length === 0) return '';

  const lines = [`Field size: ${entries.length} comparable logs.`];

  // L'arbre est une donnée statique par spec : quand il manque, les ids de talents ne se
  // traduisent pas en noms. Le dire vaut mieux que rendre une liste de `#123456`.
  if (nodes.length === 0) {
    lines.push(
      'Talent tree unavailable for this spec — the builds cannot be compared here, so say nothing about them.'
    );
    return lines.join('\n');
  }

  const { mineOnly, theirsOnly, sharedCount } = diffTalents(nodes, myTalents, entries);
  const describe = (e: TalentDiffEntry) => `${e.label} (${e.referenceCount}/${e.referenceTotal})`;

  if (mineOnly.length > 0) {
    lines.push(`Your picks the field does not share: ${mineOnly.map(describe).join(', ')}`);
  }
  if (theirsOnly.length > 0) {
    lines.push(`Taken by the field, not by you: ${theirsOnly.map(describe).join(', ')}`);
  }
  if (mineOnly.length === 0 && theirsOnly.length === 0) {
    lines.push(`Your build matches the field on all ${sharedCount} shared nodes.`);
  }

  return lines.join('\n');
}

/**
 * Version du prompt. À incrémenter dès qu'une consigne change ce que le modèle produit.
 *
 * Sans elle, le corpus de retours mélangerait des jugements portés sur deux conseils
 * différents sous une seule étiquette : « inutile » ne dirait plus de quel rapport on parle.
 */
export const PROMPT_VERSION = 3;

/**
 * Les axes que le rapport peut couvrir — le vocabulaire commun de l'empreinte du conseil
 * et du retour du lecteur.
 *
 * Un seul vocabulaire pour les deux, volontairement : c'est ce qui rend détectable le cas
 * où un lecteur juge inutile un axe que le prompt n'avait pas couvert. Deux listes
 * distinctes rendraient cette confrontation impossible.
 */
export const PROMPT_AXES = [
  'targets',
  'trajectory',
  'stats',
  'spell-usage',
  'opening',
  'uptimes',
  'damage',
  'talents',
] as const;
export type PromptAxis = (typeof PROMPT_AXES)[number];

const AXIS_HEADINGS: Record<PromptAxis, string> = {
  targets: '### Damage by Target',
  trajectory: '### Trajectory',
  stats: '### Gear & Stats',
  'spell-usage': '### Spell Usage',
  opening: '### Opening',
  uptimes: '### Buff Uptimes',
  damage: '### Damage Breakdown',
  talents: '### Talent Differences',
};

/** Le corps de chaque axe, vide quand l'axe n'a rien à dire. Source unique du prompt et de l'empreinte. */
function axisBodies(boss: BossResult, talentNodes: TalentNode[]): Record<PromptAxis, string> {
  const topPlayers = boss.topPlayers.slice(0, 3);
  const charStats = {
    ...boss.character.stats,
    dps: boss.character.dps,
    killTime: boss.character.killTime,
    overallPct: boss.character.overallPct,
    bossDps: boss.character.bossDps,
    bossDpsPct: boss.character.bossDpsPct,
  };

  return {
    targets: targetTable(boss.fightTargets, topPlayers),
    trajectory: trajectorySection(boss.character.trajectory),
    stats: statsTable(charStats, boss.comparability.myKillTimeMs, boss.sample),
    'spell-usage': spellUsageTable(
      boss.character.rotation,
      topPlayers,
      boss.character.damageTable.entries
    ),
    opening: openingSection(boss.character.rotation, topPlayers),
    uptimes: uptimeTable(boss.character.rotation, topPlayers),
    damage: damageTable(boss.character, topPlayers),
    talents: talentSection(talentNodes, boss.character.stats.talents, boss.sample),
  };
}

/**
 * Les axes que le rapport a réellement couverts — l'empreinte du conseil, sans sa prose.
 *
 * C'est ce qui manquait pour exploiter un retour de lecteur : « inutile » ne veut rien dire
 * si l'on ignore ce qui avait été dit. On garde les axes, pas le texte : le texte est du
 * dérivé du modèle, il ne se compare pas d'un rapport à l'autre et n'a pas sa place dans un
 * corpus permanent.
 *
 * Un titre de section rendu au-dessus d'un tableau vide n'est pas une couverture : seuls les
 * axes au corps non vide sont comptés.
 */
export function coveredAxes(boss: BossResult, talentNodes: TalentNode[] = []): PromptAxis[] {
  const bodies = axisBodies(boss, talentNodes);
  return PROMPT_AXES.filter((axis) => bodies[axis].trim().length > 0);
}

/**
 * Les données d'un boss mises en tableaux, sans la moindre consigne de sortie.
 *
 * Séparé du prompt de rapport parce que le chat lit les mêmes tableaux pour une tout autre
 * tâche : il répond à une question posée, il ne rédige pas les six points d'un rapport. Ce
 * qui est commun est le contexte ; ce qui diffère est la consigne, et elle reste chez
 * l'appelant.
 */
export function buildBossContext(result: AnalysisResult, talentNodes: TalentNode[] = []): string {
  const difficultyLabel: Record<number, string> = { 3: 'Normal', 4: 'Heroic', 5: 'Mythic' };
  const diff = difficultyLabel[result.input.difficulty] ?? `Difficulty ${result.input.difficulty}`;

  // Sans cette ligne, le modèle déduit la spec des noms de sorts des tableaux. Ça marche le
  // plus souvent, et ça se dégrade exactement là où ça compte : deux specs d'une même classe
  // qui partagent l'essentiel de leur kit. Une spec inconnue se dit, elle ne se devine pas.
  const spec = getSpecInfo(result.input.specId);
  const specLine = spec
    ? `Spec: ${spec.specName} ${spec.className}.`
    : `Spec: unknown (id ${result.input.specId}) — infer it from the ability names in the tables, and do not state it as fact.`;

  const bossSections = result.bosses
    .map((boss, i) => {
      if (!boss) return `## Boss ${i + 1}\nNo data available for this boss.`;

      const topPlayers = boss.topPlayers.slice(0, 3);
      // Le champ, c'est l'échantillon retenu — pas la fenêtre brute. Annoncer `sample.length`
      // alors que les tableaux se lisent sur les seuls qualifiés donnerait deux effectifs
      // différents pour la même chose.
      const fieldSize = usableSample(boss.sample).entries.length;
      const bodies = axisBodies(boss, talentNodes);

      const sections: string[] = [
        `## ${boss.encounter}`,
        '',
        comparabilitySection(boss),
        '',
        // Les deux échantillons n'ont pas le même prix : stats et talents sortent d'un
        // `CombatantInfo` déjà récupéré, dégâts et rotation coûtent une requête par référence.
        // Le modèle doit savoir sur combien de logs chaque tableau repose, sans quoi il
        // parlera d'une tendance là où il n'y a que trois joueurs.
        `Stats and talents are compared against the full comparable field (${fieldSize} logs). ` +
          `Spell usage, buff uptimes, damage breakdown and target split are compared against the ${topPlayers.length} closest of them only — ` +
          'do not present those as the behaviour of a whole population.',
        '',
      ];

      // Premier, parce que la première question est « quel combat ». Une divergence de cible
      // change la lecture de tous les tableaux qui suivent : un écart de rotation lu sans
      // elle attribue au joueur ce qui était son assignation.
      if (bodies.targets) {
        sections.push(AXIS_HEADINGS.targets, bodies.targets, '');
      }

      // Avant les tableaux du soir : ils décrivent un combat, la trajectoire dit s'il
      // s'inscrit dans une progression ou dans un palier. Un rapport isolé — source illisible
      // ou premier kill — n'ouvre pas la section du tout.
      if (bodies.trajectory) {
        sections.push(AXIS_HEADINGS.trajectory, bodies.trajectory, '');
      }

      sections.push(
        AXIS_HEADINGS.stats,
        bodies.stats,
        '',
        AXIS_HEADINGS['spell-usage'],
        bodies['spell-usage'],
        ''
      );

      if (bodies.opening) {
        sections.push(AXIS_HEADINGS.opening, bodies.opening, '');
      }

      if (bodies.uptimes) {
        sections.push(AXIS_HEADINGS.uptimes, bodies.uptimes, '');
      }

      sections.push(AXIS_HEADINGS.damage, bodies.damage, '', AXIS_HEADINGS.talents, bodies.talents);

      return sections.join('\n');
    })
    .join('\n\n---\n\n');

  return [
    // Le chemin rapport ne connaît pas le royaume du sujet : il part d'un `code` et d'un
    // acteur, pas d'un personnage nommé. Le trait d'union pendait alors dans le titre.
    `# WarcraftLogs Performance Analysis — ${result.input.serverSlug ? `${result.input.characterName}-${result.input.serverSlug}` : result.input.characterName} (${diff})`,
    specLine,
    '',
    bossSections,
  ].join('\n');
}

export function buildAnalysisPrompt(
  result: AnalysisResult,
  talentNodes: TalentNode[] = []
): string {
  return [
    buildBossContext(result, talentNodes),
    '',
    '---',
    '',
    'For each boss with data, provide:',
    '1. The most impactful rotation fix — the top of the ranked table, or the largest damage-breakdown gap, with exact numbers.',
    '2. The next gaps in the same order: damage impact first, raw cast difference only as a tie-breaker.',
    '3. The target split, only when it diverges, and named as a difference in assignment.',
    '4. Where the player sits in the comparable field on stats.',
    '5. Talent notes if differences exist, with their adoption count.',
    '6. One thing to focus on next raid.',
    '',
    'Be concise. Cite exact numbers from the tables, recommend only what a reference already does, ' +
      'and skip bosses marked "No data available".',
  ].join('\n');
}
