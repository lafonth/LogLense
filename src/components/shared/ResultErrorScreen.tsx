'use client';

import { BackLink } from '@/components/ui/BackLink';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

interface ResultErrorScreenProps {
  message: string;
  onRetry?: () => void;
  onBack: () => void;
  backLabel: string;
}

/**
 * Ce que rend une route de résultat quand elle ne peut pas rendre de résultat.
 *
 * Depuis que le résultat a son URL, il s'ouvre sans le formulaire qui l'a produit : un lien
 * tronqué, une méta de rapport refusée ou une liste de raids en panne arrivent maintenant sur
 * un écran qui n'a rien d'autre à montrer. Sans sortie nommée, il ne resterait que le bouton
 * « précédent » du navigateur, qui ramène chez l'expéditeur du lien et non au formulaire.
 */
export function ResultErrorScreen({ message, onRetry, onBack, backLabel }: ResultErrorScreenProps) {
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center px-4">
      <BackLink onClick={onBack}>{backLabel}</BackLink>
      <ErrorBanner message={message} onRetry={onRetry} />
    </div>
  );
}
