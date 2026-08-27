import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { CharacterFormClient } from '@/components/forms/CharacterFormClient';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

// Les routes de formulaire rendent la page d'accueil publique à qui n'est pas connecté :
// les indexer créerait autant de doublons de cette page. La seule porte d'entrée est `/`.
export const metadata: Metadata = {
  title: 'Analyse a character — LogLense',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AppShell>
        <CharacterFormClient />
      </AppShell>
    </Suspense>
  );
}
