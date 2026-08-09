import type { BossResult } from '@/types';
import { Card } from '@/components/ui/Card';
import { buildVerdict } from '@/lib/comparison/verdict';

interface VerdictBannerProps {
  result: BossResult;
}

/** U+2212 minus, not a hyphen — it aligns with digits in a monospace face. */
function signed(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`;
}

function Figure({ children }: { children: number | string }) {
  return <span className="font-mono">{children}</span>;
}

/**
 * Le verdict, au-dessus des onglets.
 *
 * Une phrase, ses nombres enveloppés un à un. L'écart s'affiche en `text-deviation` :
 * une position dans une distribution n'est pas une faute, et le rouge doit rester
 * disponible pour ce qu'il signale seul — une comparaison illégitime, cas `unreliable`
 * ci-dessous, où précisément aucun écart n'est chiffré.
 */
export function VerdictBanner({ result }: VerdictBannerProps) {
  const verdict = buildVerdict(result);
  const { referenceDps, myDps, deltaDps, ilvlGap, myIlvl, approximate } = verdict;

  const reserve = approximate ? (
    <span className="text-muted">
      {' '}
      Their gear and kill time only roughly match yours — read the figure as an order of magnitude.
    </span>
  ) : null;

  return (
    <Card>
      {verdict.kind === 'gap' && referenceDps !== null && deltaDps !== null && (
        <p className="text-deviation font-sans text-sm">
          Comparable logs land at <Figure>{referenceDps.toLocaleString('en-US')}</Figure> dps,{' '}
          <Figure>{deltaDps.toLocaleString('en-US')}</Figure> above your{' '}
          <Figure>{myDps.toLocaleString('en-US')}</Figure> — that is your margin on this pull.
          {reserve}
        </p>
      )}

      {verdict.kind === 'ahead' && referenceDps !== null && deltaDps !== null && (
        <p className="text-deviation font-sans text-sm">
          Comparable logs land at <Figure>{referenceDps.toLocaleString('en-US')}</Figure> dps,{' '}
          <Figure>{deltaDps.toLocaleString('en-US')}</Figure> below your{' '}
          <Figure>{myDps.toLocaleString('en-US')}</Figure> — your margin on this pull is not in raw
          damage.
          {reserve}
        </p>
      )}

      {verdict.kind === 'unreliable' && (
        <p className="text-danger font-sans text-sm">
          No log close enough to yours qualified
          {ilvlGap !== null && (
            <>
              : the closest sit <Figure>{signed(ilvlGap)}</Figure> item levels from your{' '}
              <Figure>{myIlvl}</Figure>
            </>
          )}
          . What separates you from them is not something you can play for — read the tabs as
          context, not as a gap.
        </p>
      )}

      {verdict.kind === 'none' && (
        <p className="text-muted font-sans text-sm">
          No comparable log was found for this kill. The tabs below describe your pull alone — there
          is no gap to state.
        </p>
      )}
    </Card>
  );
}
