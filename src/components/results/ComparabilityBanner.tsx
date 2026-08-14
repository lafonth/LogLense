// src/components/results/ComparabilityBanner.tsx
import type { Comparability, ComparabilityLevel } from '@/types';
import { Card } from '@/components/ui/Card';

interface ComparabilityBannerProps {
  comparability: Comparability;
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

function round1(value: number): number {
  return Math.sign(value) * (Math.round(Math.abs(value) * 10) / 10);
}

export function ComparabilityBanner({ comparability }: ComparabilityBannerProps) {
  const { level, referenceIlvl, referenceIlvlCount, myIlvl, referenceKillTimeMs, myKillTimeMs } =
    comparability;
  const tone = LEVEL_TONE[level];

  const ilvlGap = referenceIlvl === null ? null : round1(referenceIlvl - myIlvl);
  const killTimeGapPct =
    referenceKillTimeMs === null || myKillTimeMs === 0
      ? null
      : round1(((referenceKillTimeMs - myKillTimeMs) / myKillTimeMs) * 100);

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
