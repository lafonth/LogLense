import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { RaidFormClient } from '@/components/forms/RaidFormClient';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

// Un formulaire vide ne vaut pas un résultat de recherche : ce qui s'indexe, c'est `/` et
// la démo. Ces trois routes supposent un code de rapport déjà en main, donc elles n'ont
// rien à dire à qui arrive de nulle part.
export const metadata: Metadata = {
  title: 'Rank a raid — LogLense',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AppShell>
        <RaidFormClient />
      </AppShell>
    </Suspense>
  );
}
