import type { BossResult } from '@/types';
import { Card } from '@/components/ui/Card';
import { leadingGap } from '@/lib/comparison/leading-gap';
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
 * « 1 casts a minute » se rencontre : une cadence arrondie au dixième tombe sur l'unité, et
 * un effectif de références n'est pas garanti pluriel par le type qui le porte.
 */
function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

/**
 * Le verdict, au-dessus des onglets.
 *
 * Une phrase, ses nombres enveloppés un à un. L'écart s'affiche en `text-deviation` :
 * une position dans une distribution n'est pas une faute, et le rouge doit rester
 * disponible pour ce qu'il signale seul — une comparaison illégitime, cas `unreliable`
 * ci-dessous, où précisément aucun écart n'est chiffré.
 *
 * La seconde ligne dit *où* l'écart se lit. Elle tient dans la même carte parce qu'elle
 * n'est pas un second message : c'est la fin de la phrase du dessus, celle que le lecteur
 * allait chercher dans l'onglet Comparison — et n'ouvrait pas. Elle se tait d'elle-même
 * quand le verdict ne chiffre rien ; voir {@link leadingGap}.
 *
 * Elle ne se branche pas sur `gap` / `ahead`, et le verbe est neutre en direction, pour une
 * raison de fond : le sort de tête est celui dont l'écart *coûte* le plus, et son signe est
 * libre. On peut parfaitement être en retard de DPS sur un sort qu'on lance **plus** que les
 * références. Une amorce qui affirme un manque ferait alors lire l'inverse de la donnée ;
 * les deux cadences, elles, disent la direction sans se tromper.
 */
export function VerdictBanner({ result }: VerdictBannerProps) {
  const verdict = buildVerdict(result);
  const { referenceDps, myDps, deltaDps, ilvlGap, myIlvl, approximate } = verdict;
  const lead = leadingGap(result);

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

      {lead && (
        <p className="text-muted mt-3 font-sans text-sm">
          Your rotation diverges most on <span className="text-text">{lead.ability}</span>:{' '}
          <Figure>{lead.mine}</Figure> {plural(lead.mine, 'cast')} a minute against{' '}
          <Figure>{lead.reference}</Figure>, across <Figure>{lead.referenceTotal}</Figure>{' '}
          {plural(lead.referenceTotal, 'reference')}.
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
