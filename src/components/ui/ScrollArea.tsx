import type { ReactNode } from 'react';

interface ScrollAreaProps {
  /**
   * Ce que la zone contient. Fourni, il en fait une région nommée que les lecteurs d'écran
   * listent et où le focus annonce ce qu'on s'apprête à faire défiler.
   */
  label?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Confines wide content to its own scroller so it can never widen the page.
 *
 * Le conteneur est un arrêt de tabulation : une zone qui défile sans contenir de contrôle
 * focusable est autrement inatteignable au clavier, et le tableau des statistiques déborde
 * horizontalement sur toute largeur d'écran courante.
 */
export function ScrollArea({ label, className = '', children }: ScrollAreaProps) {
  return (
    <div
      role={label ? 'region' : undefined}
      aria-label={label}
      tabIndex={0}
      className={`focus-visible:outline-brass-bright w-full max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
    >
      {children}
    </div>
  );
}
