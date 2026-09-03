// src/components/results/ComparabilityBanner.tsx
import type { Comparability, ComparabilityLevel } from '@/types';
import { Card } from '@/components/ui/Card';

interface ComparabilityBannerProps {
  comparability: Comparability;
  /**
   * Part du combat jouée avant la mort du sujet, quand elle est assez basse pour que la
   * comparaison en souffre — `earlyDeathPctOf` a déjà tranché le seuil. Optionnel : les
   * écrans qui ne portent pas de contexte de pull n'ont rien à en dire.
   */
  earlyDeathPct?: number | null;
}

const LEVEL_TONE: Record<ComparabilityLevel, string> = {
  close: 'text-positive',
  approximate: 'text-warning',
  poor: 'text-danger',
  none: 'text-muted',
};

const LEVEL_LABEL: Record<ComparabilityLevel, string> = {
  close: 'Comparable',
  approximate: 'Roughly comparable',
  poor: 'Not comparable',
  none: 'No comparable logs',
};

/**
 * Le bandeau de légitimité, et rien de plus. Il ouvre le bloc au-dessus des onglets, donc
 * il précède tout ce que l'écran affirme : dire qu'une comparaison ne tient pas après avoir
 * montré le chiffre qu'elle produit, c'est la montrer d'abord et la retirer ensuite.
 *
 * L'ilvl et le kill time ne sont **pas** répétés ici : `VerdictBanner`, juste en dessous,
 * les énonce déjà, et les deux bandeaux sont lus d'un seul regard. Ce qui reste est ce que
 * lui ne dit pas — le niveau, les deux avertissements de légitimité, et d'où sort le panel.
 */
export function ComparabilityBanner({
  comparability,
  earlyDeathPct = null,
}: ComparabilityBannerProps) {
  const { level, poolFilters } = comparability;
  const tone = LEVEL_TONE[level];
  // Absent des instantanés écrits avant le filtrage à la source : on se tait alors sur la
  // provenance du vivier plutôt que d'en inventer une.
  const narrowed = poolFilters !== undefined && poolFilters.brackets.length > 0;

  return (
    <Card header="Comparison basis">
      <p className={`font-sans text-sm ${tone}`}>{LEVEL_LABEL[level]}</p>

      {earlyDeathPct !== null && (
        <p className="text-danger mt-2 font-sans text-xs">
          You died <span className="font-mono">{earlyDeathPct}%</span> into the fight — your total
          covers less of the pull than the references&apos; do, and the comparison below is hard to
          defend.
        </p>
      )}

      {comparability.substituted > 0 && (
        <p className="text-danger mt-2 font-sans text-xs">
          Not enough comparable logs. <span className="font-mono">{comparability.substituted}</span>{' '}
          of the references below were kept despite a better set bonus or externals you did not have
          — what they gained from it is not something you can play for.
        </p>
      )}

      <p className="text-dim text-2xs mt-2 font-sans">
        Closest of <span className="font-mono">{comparability.candidatesConsidered}</span>{' '}
        candidates over <span className="font-mono">{comparability.pagesFetched}</span> ranking
        pages
        {narrowed && (
          <>
            , drawn from <span className="font-mono">{poolFilters.brackets.length}</span> item level
            brackets around yours
          </>
        )}
        {poolFilters?.externalBuffs === 'Exclude' && (
          <>, none of them handed an offensive external</>
        )}
        {poolFilters?.relaxed && <>, widened back to the full rankings for lack of logs near you</>}
        {comparability.disqualified > 0 && (
          <>
            , <span className="font-mono">{comparability.disqualified}</span> eliminated on set
            bonus or externals
          </>
        )}
        {comparability.unverifiable > 0 && (
          <>
            , <span className="font-mono">{comparability.unverifiable}</span> unreadable
          </>
        )}
        .
      </p>
    </Card>
  );
}
