import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { ReportFormClient } from '@/components/forms/ReportFormClient';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

// Voir `/character` : les routes de formulaire ne s'indexent pas.
export const metadata: Metadata = {
  title: 'Analyse a report — LogLense',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AppShell>
        <ReportFormClient />
      </AppShell>
    </Suspense>
  );
}
