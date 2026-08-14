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
  /**
   * Signé : positif quand j'en place plus que la médiane des références.
   *
   * La bannière ne l'affiche pas — les deux cadences disent la direction sans qu'on ait à
   * la nommer. Il est là pour le second appelant annoncé, le prompt IA, qui a besoin de
   * l'amplitude sans avoir à la recalculer.
   */
  deviationPct: number;
  /** Sur combien de références la médiane est prise. */
  referenceTotal: number;
}

/**
 * L'écart minimal, **en lancers**, pour qu'on nomme un sort.
 *
 * Le raisonnement d'origine est bon — « sur trois minutes, un sort lancé une fois de plus
 * suffit à produire quelques pourcents » — mais il porte sur des comptes, pas sur des
 * pourcentages, et un seuil en pourcentage l'inverse : à 0,7 contre 1,0 lancer par minute,
 * un seul cast d'écart fait +43 % et passerait, tandis qu'à 40 contre 44 douze casts
 * d'écart ne font que +10 % et seraient réduits au silence. Le seuil doit donc vivre dans
 * l'unité de son propre argument.
 *
 * Deux, parce que un est exactement le cas que l'argument décrit. Ça reste un jugement,
 * mais un jugement sur une quantité que le lecteur peut compter dans son propre log.
 */
const MIN_CAST_DELTA = 2;

/**
 * Nommer *le* sort où l'écart se lit est un superlatif sur une distribution. Avec une
 * seule référence il n'y a pas de distribution : `referenceMin`, `referenceMax` et la
 * médiane sont le même point, et rien ne permet de distinguer un vrai écart de la
 * particularité d'un joueur.
 *
 * Ce n'est pas le masquage refusé pour `referenceIlvl`, qui est une valeur que la donnée
 * porte vraiment et qu'on affiche avec son effectif. Ici la donnée ne porte pas la
 * comparaison qu'on lui ferait dire.
 */
const MIN_REFERENCES = 2;

/**
 * Où le retard se lit d'abord, en une ligne, sans ouvrir d'onglet.
 *
 * Rien n'est calculé ici : `compareCasts` trie déjà les sorts par écart pondéré par leur
 * part de dégâts, et sa tête est la réponse. Le module n'existe que pour dire **quand**
 * l'écran a le droit de nommer un sort.
 *
 * Quatre conditions, et aucune n'est un seuil de confort :
 *
 * 1. Le verdict doit chiffrer un écart. `unreliable` et `none` taisent le delta de DPS
 *    précisément parce que le panel ne le porte pas ; désigner un sort responsable de cet
 *    écart-là serait dire par la bande ce que la phrase du dessus refuse de dire. La règle
 *    est vérifiée ici, dans la fonction pure, et non dans le composant, pour qu'un second
 *    appelant ne puisse pas la contourner sans le vouloir.
 * 2. Le panel doit compter au moins {@link MIN_REFERENCES} références.
 * 3. Ma cadence doit tomber **hors** de `[referenceMin, referenceMax]`. C'est le plancher
 *    mesuré, celui qu'aucun réglage à la main ne remplace : si les références se dispersent
 *    entre elles plus que je ne m'écarte d'elles, la donnée ne me sépare pas d'elles. Il
 *    s'adapte par sort et par panel, et il est déjà à l'écran — `RotationCards` dessine
 *    cette bande et ce marqueur, donc la règle se relit dans l'onglet.
 * 4. L'écart doit valoir au moins {@link MIN_CAST_DELTA} lancers sur la durée de ma pull.
 *
 * `null` veut dire « aucune ligne à afficher », jamais « aucun écart » : la liste complète
 * reste dans `ComparisonTab`, où elle se lit avec ses fourchettes. Et quand la tête du tri
 * est réduite au silence, la ligne se tait — on ne retombe pas sur le sort suivant, qui
 * coûte par construction moins cher que celui dont on vient de dire qu'il ne portait rien.
 */
export function leadingGap(result: BossResult): LeadingGap | null {
  const kind = buildVerdict(result).kind;
  if (kind !== 'gap' && kind !== 'ahead') return null;

  const { rotation, damageTable } = result.character;
  const [top] = compareCasts(rotation, result.topPlayers, damageTable.entries);
  if (!top) return null;

  const { name, mine, referenceMin, referenceMax, referenceMedian, deviationPct } = top;
  if (deviationPct === null || referenceMedian === null) return null;
  if (referenceMin === null || referenceMax === null) return null;
  if (top.referenceTotal < MIN_REFERENCES) return null;
  if (mine >= referenceMin && mine <= referenceMax) return null;

  const durationMin = rotation.fightDurationMs / 60_000;
  if (Math.abs(mine - referenceMedian) * durationMin < MIN_CAST_DELTA) return null;

  return {
    ability: name,
    mine: Math.round(mine * 10) / 10,
    reference: Math.round(referenceMedian * 10) / 10,
    deviationPct,
    referenceTotal: top.referenceTotal,
  };
}
