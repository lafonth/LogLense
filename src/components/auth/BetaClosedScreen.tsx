'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

/**
 * Ce qu'on montre à qui s'est connecté correctement et n'entre pas.
 *
 * L'écran dit désormais la suite, parce qu'il y en a une : la tentative elle-même vaut
 * demande. Le rappel `signIn` consigne le battletag refusé dans la file d'attente, que
 * l'administration vide en un clic. Personne n'a plus à envoyer son battletag à la main — et
 * l'écran ne doit donc plus se terminer sur un mur.
 */
export function BetaClosedScreen() {
  return (
    <div className="bg-bg text-text flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-[420px] flex-col gap-4">
        <ErrorBanner message="Accès en bêta fermée — ce compte Battle.net n'est pas sur la liste." />
        <p className="text-dim text-2xs font-sans">
          Cette tentative vaut demande d&apos;accès : inutile de nous envoyer votre battletag, il
          est dans la file. Ressayez la connexion une fois l&apos;accès ouvert.
        </p>
        <Button
          variant="secondary"
          size="xs"
          onClick={() => void signIn('battlenet')}
          className="border-muted text-muted bg-transparent font-mono tracking-wider uppercase"
        >
          Essayer un autre compte
        </Button>
      </div>
    </div>
  );
}
