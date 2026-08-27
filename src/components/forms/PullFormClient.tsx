'use client';

import type { PullPointer } from '@/lib/wcl/pull-pipeline';
import { useRouter } from 'next/navigation';
import { PullComparisonForm } from '@/components/forms/PullComparisonForm';
import { PullComparisonDashboard } from '@/components/results/PullComparisonDashboard';
import { usePullComparison } from '@/hooks/usePullComparison';
import { HOME_PATH } from '@/lib/routes';

/**
 * La comparaison de deux pulls, formulaire et résultat sur la même route.
 *
 * C'est le seul écran de résultat qui ne devient pas linkable, et c'est délibéré : il compare
 * deux pulls désignées par leur rapport et leur numéro de combat, sans référence ni
 * instantané. Lui donner une URL profonde reviendrait à rejouer les deux analyses à chaque
 * ouverture, pour un écran que personne ne partage — il compare un joueur à lui-même.
 */
export function PullFormClient() {
  const router = useRouter();
  const { result, loading, error, start, reset } = usePullComparison();

  if (result) return <PullComparisonDashboard result={result} onBack={reset} />;

  return (
    <PullComparisonForm
      onSubmit={(before: PullPointer, after: PullPointer, specId: number) =>
        void start({ specId, before, after })
      }
      loading={loading}
      error={error}
      onBack={() => router.push(HOME_PATH)}
    />
  );
}
