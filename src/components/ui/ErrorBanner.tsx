/**
 * Un échec, annoncé.
 *
 * `role="alert"` parce que la bannière apparaît après coup, en réponse à une action : sans
 * lui, un lecteur d'écran ne dit rien du tout et l'utilisateur attend un résultat qui ne
 * viendra pas. Le rôle porte une région live assertive, donc réservé à ce qui interrompt
 * — c'est exactement la règle qui réserve `text-danger` aux erreurs.
 */
interface ErrorBannerProps {
  message: string;
  /** Quand l'échec est passager, une seconde chance sur place vaut mieux qu'un rechargement. */
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="border-danger text-danger bg-danger/10 flex items-center justify-between gap-3 rounded-sm border px-4 py-3 font-mono text-xs"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="border-danger text-danger hover:bg-danger/10 focus-visible:outline-danger shrink-0 cursor-pointer rounded-sm border px-2 py-1 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-1"
        >
          Retry
        </button>
      )}
    </div>
  );
}
