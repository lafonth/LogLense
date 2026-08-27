'use client';

import type { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { BetaClosedScreen } from '@/components/auth/BetaClosedScreen';
import { MarketingLanding } from '@/components/landing/MarketingLanding';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

/**
 * La porte de session, commune à toutes les pages.
 *
 * Elle vaut pour les routes de résultat sans exception : l'instantané de `result-snapshot.ts`
 * n'est lisible que par un utilisateur authentifié, et une page publique rendant une analyse
 * dérivée de Warcraft Logs ferait de LogLense une publication concurrente d'Archon. Un lien
 * partagé s'ouvre donc sur la page d'accueil tant que le destinataire n'est pas connecté —
 * c'est le comportement voulu, pas une lacune.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const searchParams = useSearchParams();

  // Rendre `null` laissait une page blanche le temps que la session revienne, indiscernable
  // d'une panne : le spinner dit au moins qu'il se passe quelque chose.
  if (status === 'loading') return <LoadingScreen />;

  if (status === 'unauthenticated') {
    // NextAuth redirige ici avec `?error=AccessDenied` quand `signIn` refuse un compte non
    // listé dans `BETA_ALLOWLIST` — jamais de page blanche ni d'erreur d'authentification
    // trompeuse pour un simple refus de bêta.
    if (searchParams.get('error') === 'AccessDenied') return <BetaClosedScreen />;
    return <MarketingLanding />;
  }

  return <>{children}</>;
}
