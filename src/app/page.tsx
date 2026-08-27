import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { HomeScreen } from '@/components/HomeScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { legacyResultPath } from '@/lib/routes';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Les anciens liens `/?char=…` et `/?report=…` sont traduits ici, côté serveur : le
  // destinataire arrive directement sur la nouvelle URL, sans voir passer l'ancienne.
  const legacy = legacyResultPath(await searchParams);
  if (legacy) redirect(legacy);

  return (
    // `AppShell` lit les paramètres d'URL : sans repli, la frontière de suspense rend un
    // blanc pendant l'hydratation, indiscernable d'une page en panne.
    <Suspense fallback={<LoadingScreen />}>
      <AppShell>
        <HomeScreen />
      </AppShell>
    </Suspense>
  );
}
