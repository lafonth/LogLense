import type { BossResult } from '@/types';
import { compareCasts } from './rotation-stats';
import { buildVerdict } from './verdict';

/**
 * Le sort qui porte l'écart, tel que l'écran a le droit de le nommer.
 *
 * `mine` et `reference` sont des lancers par minute, arrondis au dixième — la même unité
 * que la colonne de `ComparisonTab`, pour qu'un lecteur qui ouvre l'onglet retrouve le
 * chiffre qu'on vient de lui annoncer.
 */
export interface LeadingGap {
  ability: string;
  mine: number;
  reference: number;
  /** Signé : positif quand j'en place plus que la médiane des références. */
  deviationPct: number;
  /** Sur combien de références la médiane est prise. */
  referenceTotal: number;
}

/**
 * Sous ce seuil, on ne nomme rien.
 *
 * Un écart de cadence de quelques pourcents tient dans le bruit d'une seule pull : sur
 * trois minutes, un sort lancé une fois de plus le produit. Le désigner comme *l'*endroit
 * du retard serait une affirmation que les données ne portent pas — et c'est exactement la
 * hiérarchisation, pas le calcul, qui fait la valeur de cette ligne.
 */
const NOISE_FLOOR_PCT = 10;

/**
 * Où le retard se lit d'abord, en une ligne, sans ouvrir d'onglet.
 *
 * Rien n'est calculé ici : `compareCasts` trie déjà les sorts par écart pondéré par leur
 * part de dégâts, et sa tête est la réponse. Le module n'existe que pour dire **quand**
 * l'écran a le droit de nommer un sort.
 *
 * Deux conditions, et elles viennent d'ailleurs dans le code :
 *
 * 1. Le verdict doit chiffrer un écart. `unreliable` et `none` taisent le delta de DPS
 *    précisément parce que le panel ne le porte pas ; désigner un sort responsable de cet
 *    écart-là serait dire par la bande ce que la phrase du dessus refuse de dire. La règle
 *    est vérifiée ici, dans la fonction pure, et non dans le composant, pour qu'un second
 *    appelant ne puisse pas la contourner sans le vouloir.
 * 2. L'écart du sort de tête doit dépasser {@link NOISE_FLOOR_PCT}.
 *
 * `null` veut dire « aucune ligne à afficher », jamais « aucun écart » : la liste complète
 * reste dans `ComparisonTab`, où elle se lit avec ses fourchettes.
 */
export function leadingGap(result: BossResult): LeadingGap | null {
  const kind = buildVerdict(result).kind;
  if (kind !== 'gap' && kind !== 'ahead') return null;

  const [top] = compareCasts(
    result.character.rotation,
    result.topPlayers,
    result.character.damageTable.entries
  );
  if (!top || top.deviationPct === null || top.referenceMedian === null) return null;
  if (Math.abs(top.deviationPct) < NOISE_FLOOR_PCT) return null;

  return {
    ability: top.name,
    mine: Math.round(top.mine * 10) / 10,
    reference: Math.round(top.referenceMedian * 10) / 10,
    deviationPct: top.deviationPct,
    referenceTotal: top.referenceTotal,
  };
}
