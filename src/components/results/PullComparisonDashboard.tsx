import type { PullComparisonResult } from '@/lib/wcl/pull-pipeline';
import { Card } from '@/components/ui/Card';
import { DamageBreakdown } from './DamageBreakdown';
import { PullContextCard } from './PullContextCard';
import { PullVerdictBanner } from './PullVerdictBanner';
import { RotationComparisonCards } from './RotationCards';
import { TalentDiffCard } from './TalentDiff';

interface PullComparisonDashboardProps {
  result: PullComparisonResult;
  onBack: () => void;
}

/**
 * L'écran de spec 04 : verdict décomposé en tête, puis contexte, dégâts, rotation et
 * talents. Chaque section reçoit une comparaison déjà calculée par `comparePulls` — aucune
 * n'appelle `compareCasts`/`diffTalents`/etc. elle-même (spec 04 §3, §6).
 */
export function PullComparisonDashboard({ result, onBack }: PullComparisonDashboardProps) {
  const { before, after, comparison } = result;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-10">
      <div className="mx-auto w-full max-w-[1100px]">
        <button
          type="button"
          onClick={onBack}
          className="text-dim hover:text-text mb-6 cursor-pointer border-none bg-transparent p-0 font-mono text-xs"
        >
          ← Back
        </button>

        <h2 className="text-text mb-6 font-sans text-sm">
          <span className="font-mono">{before.name}</span> — {before.code}#{before.fightId} vs{' '}
          {after.code}#{after.fightId}
        </h2>

        <div className="flex flex-col gap-4">
          <PullVerdictBanner comparison={comparison} before={before} after={after} />

          <PullContextCard
            before={{ label: 'Before', context: before.context, fightMs: before.fightMs }}
            after={{ label: 'After', context: after.context, fightMs: after.fightMs }}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card header="Damage · before">
              <DamageBreakdown entries={before.damageEntries} />
            </Card>
            <Card header="Damage · after">
              <DamageBreakdown entries={after.damageEntries} />
            </Card>
          </div>

          <RotationComparisonCards casts={comparison.rotation} uptimes={comparison.uptimes} />

          <TalentDiffCard {...comparison.talents} />
        </div>
      </div>
    </div>
  );
}
