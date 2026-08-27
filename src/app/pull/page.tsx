import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { PullFormClient } from '@/components/forms/PullFormClient';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

// Voir `/character` : les routes de formulaire ne s'indexent pas.
export const metadata: Metadata = {
  title: 'Compare two pulls — LogLense',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AppShell>
        <PullFormClient />
      </AppShell>
    </Suspense>
  );
}
