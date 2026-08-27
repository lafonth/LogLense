import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { RaidFormClient } from '@/components/forms/RaidFormClient';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

// Voir `/character` : les routes de formulaire ne s'indexent pas.
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
