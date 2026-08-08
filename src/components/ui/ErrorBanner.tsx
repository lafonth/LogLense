/**
 * Un échec, annoncé.
 *
 * `role="alert"` parce que la bannière apparaît après coup, en réponse à une action : sans
 * lui, un lecteur d'écran ne dit rien du tout et l'utilisateur attend un résultat qui ne
 * viendra pas. Le rôle porte une région live assertive, donc réservé à ce qui interrompt
 * — c'est exactement la règle qui réserve `text-danger` aux erreurs.
 */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="border-danger text-danger bg-danger/10 rounded-sm border px-4 py-3 font-mono text-xs"
    >
      {message}
    </div>
  );
}
