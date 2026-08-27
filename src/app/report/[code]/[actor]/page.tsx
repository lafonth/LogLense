import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { ReportResultClient } from '@/components/report/ReportResultClient';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { firstParam, parseReportRoute } from '@/lib/routes';
import { difficultyName, headline, resultMetadata, specLabel } from '@/lib/share-meta';

interface Segments {
  code: string;
  actor: string;
}
type Query = Record<string, string | string[] | undefined>;

interface Props {
  params: Promise<Segments>;
  searchParams: Promise<Query>;
}

/**
 * Comme le chemin par personnage, à un manque près assumé : le nom du joueur n'est pas dans
 * l'URL, et l'apprendre demanderait une requête que `generateMetadata` n'a pas le droit de
 * faire. La carte nomme donc le rapport, pas l'acteur.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const segments = await params;
  const query = await searchParams;
  const route = parseReportRoute(segments);
  if (!route) return resultMetadata('Analysis');

  return resultMetadata(
    headline([
      `Report ${route.code}`,
      difficultyName(firstParam(query.difficulty)),
      specLabel(firstParam(query.spec)),
    ])
  );
}

export default async function Page({ params }: Props) {
  const route = parseReportRoute(await params);
  if (!route) notFound();

  return (
    <Suspense fallback={<LoadingScreen />}>
      <AppShell>
        <ReportResultClient route={route} />
      </AppShell>
    </Suspense>
  );
}
