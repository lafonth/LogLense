import type { BossResult } from '@/types';
import { castRowFor, rankedGaps } from './findings';
import { isNameableGap } from './naming-rights';
import { compareCasts } from './rotation-stats';

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
 * Où le retard se lit d'abord, en une ligne, sans ouvrir d'onglet.
 *
 * Rien n'est classé ici : la bannière nomme **le sort de tête de la liste de constats**,
 * `rankedGaps`, et rien d'autre. C'est ce qui l'empêche d'annoncer un sort pendant que
 * l'onglet en met un autre en premier — la même phrase et la première ligne de la liste
 * doivent porter le même nom, sinon l'écran se contredit sur un seul log. Le classement par
 * écart de dps vit donc dans `damage-gap.ts`, ses filtres dans `findings.ts`, et ce module ne
 * garde qu'une décision : **quand** l'écran a le droit de nommer une cadence.
 *
 * Deux conditions, et aucune n'est un seuil de confort :
 *
 * 1. La liste de constats doit avoir une tête. Elle est vide quand le verdict ne chiffre pas
 *    — `unreliable` et `none` taisent le delta de DPS précisément parce que le panel ne le
 *    porte pas, et désigner un sort responsable de cet écart-là serait dire par la bande ce
 *    que la phrase du dessus refuse de dire. Elle l'est aussi sous le plancher de bruit et
 *    sous l'effectif minimal. La règle est vérifiée dans la fonction pure, et non dans le
 *    composant, pour qu'un second appelant ne puisse pas la contourner sans le vouloir.
 * 2. Ce sort-là doit passer {@link isNameableGap} sur **sa ligne de cadence** — effectif,
 *    hors-bande, et amplitude en lancers. La bannière parle en lancers par minute : sans ce
 *    droit-là, elle n'a rien à dire, même si l'écart de dégâts, lui, est bien mesuré.
 *
 * `null` veut dire « aucune ligne à afficher », jamais « aucun écart » : la liste complète
 * reste dans `ComparisonTab`, où elle se lit avec ses fourchettes. Et quand la tête du
 * classement est réduite au silence, la ligne se tait — on ne retombe pas sur le sort
 * suivant, qui coûte par construction moins cher que celui dont on vient de dire qu'il ne
 * portait rien.
 */
export function leadingGap(result: BossResult): LeadingGap | null {
  const [head] = rankedGaps(result);
  if (!head) return null;

  const { rotation, damageTable } = result.character;
  const castRows = compareCasts(rotation, result.topPlayers, damageTable.entries);
  const row = castRowFor(head, rotation.casts, castRows);
  if (!row) return null;

  if (!isNameableGap(row, rotation.fightDurationMs)) return null;

  // `isNameableGap` a déjà écarté les `null`, mais il rend un booléen : les deux gardes qui
  // suivent ne redisent pas la règle, elles la donnent au typage.
  const { mine, referenceMedian, deviationPct } = row;
  if (deviationPct === null || referenceMedian === null) return null;

  return {
    // Le libellé rendu est celui de la table de dégâts, pas celui de la ligne de cadence :
    // c'est le nom que la liste de constats affiche, et la jointure par `guid` autorise les
    // deux à différer.
    ability: head.name,
    mine: Math.round(mine * 10) / 10,
    reference: Math.round(referenceMedian * 10) / 10,
    deviationPct,
    referenceTotal: row.referenceTotal,
  };
}
