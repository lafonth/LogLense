import type { PullComparison, PullSnapshot } from '@/lib/comparison/pull-comparison';
import { Card } from '@/components/ui/Card';

interface PullVerdictBannerProps {
  comparison: PullComparison;
  before: PullSnapshot;
  after: PullSnapshot;
}

/** U+2212 minus, not a hyphen — it aligns with digits in a monospace face. */
function signed(value: number): string {
  return value < 0
    ? `−${Math.abs(value).toLocaleString('en-US')}`
    : `+${value.toLocaleString('en-US')}`;
}

function Figure({ children }: { children: number | string }) {
  return <span className="font-mono">{children}</span>;
}

function externalName(pull: PullSnapshot): string {
  return pull.eligibility.externals[0] ?? 'an external';
}

/**
 * Le verdict d'une comparaison de pulls, au-dessus des onglets — même position que
 * `VerdictBanner`. Deux branches, jamais un simple delta de DPS (spec 04 §3) :
 *
 * - une disqualification (`text-danger`, seul cas légitime pour ce rouge) quand l'une des
 *   deux pulls a reçu plus de tier ou d'external que l'autre — le gain ou la perte affichés
 *   ne parlent alors pas du joueur ;
 * - sinon la décomposition (`text-deviation`) : matériel, kill time, reste, comme
 *   `TrajectoryChart` le fait sur une saison entière.
 */
export function PullVerdictBanner({ comparison, before, after }: PullVerdictBannerProps) {
  const { delta, disqualifiedAfter, disqualifiedBefore } = comparison;

  if (disqualifiedAfter.length > 0) {
    return (
      <Card>
        <p className="text-danger font-sans text-sm">
          The later pull{' '}
          {disqualifiedAfter.includes('external') && (
            <>
              received <Figure>{externalName(after)}</Figure>
            </>
          )}
          {disqualifiedAfter.includes('external') &&
            disqualifiedAfter.includes('set-bonus') &&
            ' and '}
          {disqualifiedAfter.includes('set-bonus') && 'gained a higher tier bonus'} that the earlier
          one did not have — the gain shown here is not something you can play for.
        </p>
      </Card>
    );
  }

  if (disqualifiedBefore.length > 0) {
    return (
      <Card>
        <p className="text-danger font-sans text-sm">
          The earlier pull{' '}
          {disqualifiedBefore.includes('external') && (
            <>
              received <Figure>{externalName(before)}</Figure>
            </>
          )}
          {disqualifiedBefore.includes('external') &&
            disqualifiedBefore.includes('set-bonus') &&
            ' and '}
          {disqualifiedBefore.includes('set-bonus') && 'held a higher tier bonus'} that the later
          one did not have — any drop shown here is not something you can play for either.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-deviation font-sans text-sm">
        <Figure>{signed(delta.dpsDelta)}</Figure> dps between the two pulls: about{' '}
        <Figure>{signed(delta.ilvlPart)}</Figure> from gear,{' '}
        <Figure>{signed(delta.killTimePart)}</Figure> from kill time, and{' '}
        <Figure>{signed(delta.remainder)}</Figure> from you — estimated, not measured.
      </p>
    </Card>
  );
}
