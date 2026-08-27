import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { CharacterResultClient } from '@/components/character/CharacterResultClient';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { firstParam, parseCharacterRoute } from '@/lib/routes';
import { difficultyName, headline, resultMetadata, specLabel } from '@/lib/share-meta';

interface Segments {
  region: string;
  realm: string;
  name: string;
}
type Query = Record<string, string | string[] | undefined>;

interface Props {
  params: Promise<Segments>;
  searchParams: Promise<Query>;
}

/**
 * La carte que Discord ou Reddit affiche pour ce lien. Elle ne lit que l'URL et la table des
 * specs — voir `share-meta.ts` : le robot qui la demande n'a pas de session, donc aucune
 * requête ne part d'ici.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const segments = await params;
  const query = await searchParams;
  const route = parseCharacterRoute(segments);
  if (!route) return resultMetadata('Analysis');

  return resultMetadata(
    headline([
      `${route.name}-${route.realm}`,
      difficultyName(firstParam(query.difficulty)),
      specLabel(firstParam(query.spec)),
    ])
  );
}

export default async function Page({ params }: Props) {
  const route = parseCharacterRoute(await params);
  if (!route) notFound();

  return (
    <Suspense fallback={<LoadingScreen />}>
      <AppShell>
        <CharacterResultClient route={route} />
      </AppShell>
    </Suspense>
  );
}
