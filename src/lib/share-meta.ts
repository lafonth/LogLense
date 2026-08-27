import type { Metadata } from 'next';
import { getSpecInfo } from '@/lib/specs';

/**
 * Ce qu'une URL de résultat raconte quand elle est collée dans Discord ou sur Reddit.
 *
 * Deux règles, toutes deux structurantes :
 *
 * 1. **Aucun chiffre dérivé.** La carte ne porte ni dps, ni percentile, ni écart. Un
 *    déballage est mis en cache par la plateforme à la seconde où il est produit et ne se
 *    rappelle pas ; l'enrichir plus tard, une fois la signature de RPGLogs obtenue, est un
 *    changement d'une ligne. L'inverse n'existe pas. Elle n'est pas vide pour autant : elle
 *    porte notre propre position, qui n'appartient qu'à nous.
 * 2. **Aucune requête.** `generateMetadata` s'exécute pour un robot sans session — pas de
 *    WCL, pas de Redis, pas de `fetch`. Seules les tables statiques sont admises, ce qui
 *    borne ce que la carte peut nommer au contenu de l'URL elle-même.
 *
 * `robots: noindex` suit la même frontière que l'instantané : la page derrière est réservée
 * aux utilisateurs authentifiés, elle n'a rien à faire dans un index.
 */
const PITCH =
  'Half the gap you are shown comes from the reference gear, not from your play. LogLense tells the two apart.';

const DIFFICULTY_NAMES: Record<number, string> = { 3: 'Normal', 4: 'Heroic', 5: 'Mythic' };

export function difficultyName(value: string | undefined): string | null {
  return DIFFICULTY_NAMES[Number(value)] ?? null;
}

/** `Fire Mage`, ou `null` si la spec est absente de l'URL ou inconnue de la table. */
export function specLabel(value: string | undefined): string | null {
  const spec = getSpecInfo(Number(value));
  return spec ? `${spec.specName} ${spec.className}` : null;
}

/** Assemble un titre de carte à partir des seuls fragments connus, sans séparateur orphelin. */
export function headline(parts: (string | null)[]): string {
  const kept = parts.filter((p): p is string => Boolean(p));
  return kept.length > 0 ? kept.join(' · ') : 'Analysis';
}

export function resultMetadata(title: string): Metadata {
  const full = `${title} — LogLense`;
  return {
    title: full,
    description: PITCH,
    robots: { index: false, follow: false },
    openGraph: { title: full, description: PITCH, siteName: 'LogLense', type: 'website' },
    twitter: { card: 'summary', title: full, description: PITCH },
  };
}
