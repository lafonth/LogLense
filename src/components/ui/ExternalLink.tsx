interface ExternalLinkProps {
  /** L'adresse. `null` quand le module qui la fabrique a refusé de la rendre. */
  href: string | null | undefined;
  children: React.ReactNode;
}

/**
 * Un lien qui sort du produit, vers un onglet neuf.
 *
 * Une primitive et non un `<a>` recopié : `rel="noopener noreferrer"` est la partie qu'on
 * oublie, et son oubli donne à la page ouverte une poignée sur la nôtre via `window.opener`.
 * L'anneau de focus et la mention lue à voix haute suivent la même logique que `BackLink` —
 * un cinquième point d'appel en hérite sans y penser.
 *
 * Le `href` accepte `null` et le composant s'efface alors : les helpers d'URL du domaine
 * rendent `null` sur une entrée douteuse, et un lien absent vaut mieux qu'un lien mort.
 *
 * La flèche est un glyphe, pas une image : le dépôt n'embarque aucune bibliothèque
 * d'icônes, et `BackLink` a déjà tranché en faveur du texte. Elle est masquée aux lecteurs
 * d'écran, qui reçoivent la mention explicite à la place.
 */
export function ExternalLink({ href, children }: ExternalLinkProps) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-dim hover:text-text focus-visible:outline-brass-bright inline-flex items-center gap-1 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {children}
      <span aria-hidden="true">↗</span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
