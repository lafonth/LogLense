interface BackLinkProps {
  onClick: () => void;
  /** Ce qu'on quitte, quand « Back » seul ne dit pas où l'on retombe. */
  children?: string;
}

/**
 * Le retour vers l'écran précédent.
 *
 * Quatre écrans recopiaient le même `<button>` déguisé en lien, à la classe près — et tous
 * les quatre sans anneau de focus : le seul moyen de sortir d'un formulaire au clavier était
 * invisible pour qui navigue au clavier. Une primitive, parce qu'un cinquième écran héritera
 * de l'anneau sans avoir à y penser.
 *
 * `mb-6` est porté ici plutôt qu'au point d'appel : les quatre copies le posaient déjà, et
 * une marge passée en `className` se ferait départager par l'ordre de la feuille générée.
 */
export function BackLink({ onClick, children = 'Back' }: BackLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-dim hover:text-text focus-visible:outline-brass-bright mb-6 cursor-pointer border-none bg-transparent p-0 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      ← {children}
    </button>
  );
}
