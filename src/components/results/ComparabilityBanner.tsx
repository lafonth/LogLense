// src/components/results/ComparabilityBanner.tsx
import type { Comparability, ComparabilityLevel } from '@/types';
import { Card } from '@/components/ui/Card';
import { ilvlGapOf, killTimeGapPctOf } from '@/lib/comparison/comparability-gaps';

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

/** U+2212 minus, not a hyphen — it aligns with digits in a monospace face. */
function signed(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`;
}

export function ComparabilityBanner({
  comparability,
  earlyDeathPct = null,
}: ComparabilityBannerProps) {
  const { level, referenceIlvl, referenceIlvlCount, myIlvl } = comparability;
  const tone = LEVEL_TONE[level];

  // Les deux écarts viennent du même module que `VerdictBanner` : les deux bandeaux sont
  // lus ensemble, un arrondi qui diverge se verrait.
  const ilvlGap = ilvlGapOf(comparability);
  const killTimeGapPct = killTimeGapPctOf(comparability);

  return (
    <Card header="Comparison basis">
      <p className={`font-sans text-sm ${tone}`}>{LEVEL_LABEL[level]}</p>

      {ilvlGap !== null && killTimeGapPct !== null && (
        <p className="text-muted mt-2 font-sans text-xs">
          References sit at <span className="font-mono">{referenceIlvl}</span> item level, a median
          of <span className="font-mono">{referenceIlvlCount}</span>,{' '}
          <span className="font-mono">{signed(ilvlGap)}</span> against your{' '}
          <span className="font-mono">{myIlvl}</span>, and their kills run{' '}
          <span className="font-mono">{signed(killTimeGapPct)}%</span> against yours.
        </p>
      )}

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
