import { Suspense } from 'react';
import { HomeClient } from '@/components/HomeClient';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function Page() {
  return (
    // `HomeClient` lit les paramètres d'URL : sans repli, la frontière de suspense rend un
    // blanc pendant l'hydratation, indiscernable d'une page en panne. Le repli est celui que
    // `HomeClient` affiche lui-même juste après, donc rien ne saute au raccord.
    <Suspense fallback={<LoadingScreen />}>
      <HomeClient />
    </Suspense>
  );
}
