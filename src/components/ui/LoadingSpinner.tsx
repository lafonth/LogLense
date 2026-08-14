interface LoadingSpinnerProps {
  /**
   * Ce que l'attente concerne. Obligatoire, et non plus facultatif : deux appels l'avaient
   * omis, et un disque qui tourne sans texte ne dit rien du tout à un lecteur d'écran —
   * l'attente y était muette alors qu'elle dure une quarantaine de requêtes WCL.
   */
  label: string;
  /**
   * Réserve le libellé aux lecteurs d'écran, là où la place manque pour l'afficher — un
   * rail de boss, une ligne de personnage. Le nom reste porté, seul l'encombrement tombe.
   */
  labelHidden?: boolean;
}

export function LoadingSpinner({ label, labelHidden = false }: LoadingSpinnerProps) {
  return (
    <span className="text-muted inline-flex items-center gap-2 font-mono text-xs">
      <span
        aria-hidden="true"
        className="border-border border-t-brass inline-block h-3.5 w-3.5 animate-spin rounded-full border-2"
      />
      <span className={labelHidden ? 'sr-only' : undefined}>{label}</span>
    </span>
  );
}
