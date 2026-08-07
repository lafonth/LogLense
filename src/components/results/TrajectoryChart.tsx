import type { TrendVerdict } from '@/lib/comparison/trend';
import type { TrajectoryPoint } from '@/lib/wcl/trajectory';
import { analyseTrend, segmentBySpec } from '@/lib/comparison/trend';

/**
 * La trajectoire du joueur sur cette rencontre, et ce qu'elle dit.
 *
 * Trois partis pris, chacun destiné à empêcher une lecture fausse :
 *
 * - **L'axe tracé est le percentile verrouillé**, pas le DPS. Le DPS monte tout seul sur un
 *   palier ; le percentile est déjà normalisé contre la population du moment. Le DPS reste
 *   visible au survol de chaque point, en second.
 * - **La décomposition est annoncée comme une estimation.** Ses deux coefficients sont des
 *   hypothèses (voir `trend.ts`) : elle donne un ordre de grandeur, le verdict donne la
 *   mesure.
 * - **La courbe ne contient que des kills.** Warcraft Logs ne classe pas un wipe : deux
 *   soirées à mourir n'y laissent aucune trace, et l'écran doit le dire lui-même.
 *
 * La géométrie est portée par des attributs SVG et non par `style={{}}` : la règle de
 * l'interface tient, aucune valeur d'interface n'échappe aux tokens.
 */
interface TrajectoryChartProps {
  trajectory: TrajectoryPoint[];
}

/** Boîte du tracé, en unités SVG. Le viewBox rend le graphe fluide sans media query. */
const W = 320;
const H = 96;
const PAD = 8;

const VERDICTS: Record<TrendVerdict, { label: string; tone: string }> = {
  improving: { label: 'Trending up', tone: 'text-positive' },
  plateau: { label: 'Plateau', tone: 'text-deviation' },
  declining: { label: 'Trending down', tone: 'text-warning' },
  insufficient: { label: 'Not enough kills', tone: 'text-dim' },
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toLocaleString('en-US')}`;
}

export function TrajectoryChart({ trajectory }: TrajectoryChartProps) {
  // Un seul kill ne fait pas une trajectoire, et un rapport isolé reste un rapport valide :
  // l'écran se tait plutôt que de tracer un segment entre un point et lui-même.
  const segment = segmentBySpec(trajectory).at(-1) ?? [];
  if (segment.length < 2) return null;

  const trend = analyseTrend(trajectory);
  const verdict = VERDICTS[trend.verdict];

  const span = segment.length - 1;
  const x = (i: number) => PAD + (i / span) * (W - 2 * PAD);
  const y = (pct: number) => PAD + (1 - pct / 100) * (H - 2 * PAD);
  const line = segment.map((p, i) => `${x(i)},${y(p.rankPercent)}`).join(' ');

  const first = segment[0];
  const last = segment[segment.length - 1];

  return (
    <div className="mt-6">
      <h3 className="text-muted mb-2 font-mono text-xs tracking-[0.08em] uppercase">Trajectory</h3>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`font-mono text-xs font-semibold ${verdict.tone}`}>{verdict.label}</span>
        {trend.verdict !== 'insufficient' && (
          <span className="text-muted font-sans text-xs">
            <span className="font-mono">{signed(trend.percentileSlope)}</span> percentile per kill
            over the last <span className="font-mono">{trend.points.length}</span>
          </span>
        )}
        {trend.spec !== null && <span className="text-dim text-2xs font-mono">{trend.spec}</span>}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="text-brass mt-3 h-24 w-full"
        role="img"
        aria-label={`Percentile across ${segment.length} logged kills, from ${first.rankPercent} on ${shortDate(first.at)} to ${last.rankPercent} on ${shortDate(last.at)}`}
      >
        {/* La médiane de la population : le repère qui donne son sens à la hauteur. */}
        <line
          x1={PAD}
          y1={y(50)}
          x2={W - PAD}
          y2={y(50)}
          className="stroke-border"
          strokeDasharray="3 4"
        />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.5} />
        {segment.map((p, i) => (
          <circle
            key={`${p.code}:${p.fightID}`}
            cx={x(i)}
            cy={y(p.rankPercent)}
            r={p.analysed ? 4 : 2.5}
            className={p.analysed ? 'fill-brass-bright' : 'fill-surface stroke-brass'}
            strokeWidth={1.5}
          >
            <title>
              {shortDate(p.at)} — {p.rankPercent} percentile, {p.dps.toLocaleString('en-US')} dps
              {p.bracket !== null ? `, ${p.bracket} ilvl` : ''}
              {p.analysed ? ' — the fight this report analyses' : ''}
            </title>
          </circle>
        ))}
      </svg>

      <div className="text-dim text-2xs mt-1 flex justify-between font-mono">
        <span>{shortDate(first.at)}</span>
        <span>{shortDate(last.at)}</span>
      </div>

      {trend.steps.length > 0 && (
        <p className="text-muted mt-3 font-sans text-xs">
          Over the last <span className="font-mono">{trend.points.length}</span> kills,{' '}
          <span className="font-mono">{signed(dpsSwing(trend.steps))}</span> dps: about{' '}
          <span className="font-mono">{signed(sum(trend.steps, 'ilvlPart'))}</span> from gear,{' '}
          <span className="font-mono">{signed(sum(trend.steps, 'killTimePart'))}</span> from kill
          time, and <span className="font-mono">{signed(trend.remainderTotal)}</span> from you —
          estimated, not measured.
        </p>
      )}

      <p className="text-dim text-2xs mt-2 font-sans">
        Kills only — Warcraft Logs does not rank a wipe, so a failed night leaves no point here.
        {trend.droppedForSpecChange > 0 && (
          <>
            {' '}
            <span className="font-mono">{trend.droppedForSpecChange}</span> earlier kill
            {trend.droppedForSpecChange > 1 ? 's are' : ' is'} left out: another spec does not
            measure the same thing.
          </>
        )}
      </p>
    </div>
  );
}

type Part = 'ilvlPart' | 'killTimePart';

function sum(steps: Array<Record<Part, number>>, part: Part): number {
  return steps.reduce((acc, s) => acc + s[part], 0);
}

function dpsSwing(steps: Array<{ dpsDelta: number }>): number {
  return steps.reduce((acc, s) => acc + s.dpsDelta, 0);
}
