import type { DamageEntry, TopPlayer } from '@/types';
import { medianOf } from '@/lib/wcl/comparability';

/**
 * Combien de sources de dégâts on garde de chaque côté avant d'en faire l'union.
 *
 * La valeur vient de `damageTable()` dans `ai/prompt.ts`, qui est l'appelant d'origine de
 * cette logique : dix de mon côté, dix du côté du champ, et l'union des deux.
 */
export const TOP_DAMAGE_SOURCES = 10;

/**
 * Un sort, ma part de dégâts dessus, celle du champ, et l'écart des deux — en dps.
 *
 * L'écart est une **soustraction entre deux dps mesurés**, pas un modèle d'attribution :
 * `character.dps` et `TopPlayer.stats.dps` sont tous deux relevés par WCL, et la part de
 * chacun sur un sort sort de sa propre table de dégâts. Ce qui reste une hypothèse, c'est
 * la **cause** de l'écart — elle n'est pas ici, elle est dans `findings.ts`, derrière les
 * portes de `naming-rights.ts`.
 *
 * Corollaire à ne jamais perdre de vue à l'affichage : `gapDps` est l'écart de dégâts
 * produits*, jamais « ce que tu gagnerais en corrigeant ». Et les lignes **ne somment
 * pas** au delta du verdict — une médiane par sort n'est pas additive.
 */
export interface DamageGap {
  name: string;
  guid: number;
  /** Ma part de dégâts sur ce sort, en points de mon total. */
  minePct: number;
  /** Médiane des parts du champ, en points. `null` quand aucune référence n'est lisible. */
  fieldPct: number | null;
  /** `fieldPct − minePct`, en points. `null` avec `fieldPct`. */
  gapPct: number | null;
  mineDps: number;
  /** Médiane, sur les références, de `son dps × sa part sur ce sort`. */
  fieldDps: number | null;
  /** `fieldDps − mineDps` : positif quand le champ en tire plus que moi. */
  gapDps: number | null;
  /** La part de chaque référence, dans l'ordre reçu. `null` pour une table illisible. */
  referencePcts: (number | null)[];
  /** Sur combien de références les deux médianes sont prises. */
  referenceTotal: number;
  /**
   * Rang dans l'union — mes têtes de liste d'abord, celles du champ ensuite.
   *
   * Il n'existe que pour départager deux lignes à égalité de façon déterministe : un
   * appelant qui veut un autre tri que celui d'ici (le prompt IA trie par part de dégâts)
   * retrouve exactement l'ordre stable d'origine en s'en servant comme second critère.
   */
  unionRank: number;
}

interface DamageSubject {
  dps: number;
  damageTable: { entries: DamageEntry[] };
}

/** La part d'un sort dans un total, en points. `null` quand la table est vide. */
function shareIn(entries: DamageEntry[], total: number, name: string): number | null {
  return total > 0 ? ((entries.find((e) => e.name === name)?.total ?? 0) / total) * 100 : null;
}

/**
 * L'union de mes premières sources de dégâts et de celles du champ, chacune chiffrée en dps.
 *
 * L'union est le point : un sort dont les références tirent une part réelle de leurs dégâts
 * et que je n'utilise presque pas n'apparaîtrait dans aucun top 10 pris séparément — et
 * c'est exactement la ligne la plus actionnable de l'écran. Elle entre par la tête de liste
 * du champ, et la colonne d'écart la nomme.
 *
 * Une référence dont la table est vide est écartée de l'effectif plutôt que comptée comme
 * un zéro : un log illisible n'est pas un joueur qui n'a rien fait. Une référence lisible
 * qui n'a pas lancé le sort compte, elle, pour 0 % — c'est un choix de jeu, pas une donnée
 * manquante, et la médiane doit le voir.
 *
 * Tri : `|gapDps|` décroissant, les sorts sans champ en queue.
 */
export function damageGaps(character: DamageSubject, topPlayers: TopPlayer[]): DamageGap[] {
  const charEntries = character.damageTable.entries;
  const charTotal = charEntries.reduce((s, e) => s + e.total, 0);
  const topTotals = topPlayers.map((p) => p.damageTable.entries.reduce((s, e) => s + e.total, 0));
  if (charTotal === 0 && topTotals.every((t) => t === 0)) return [];

  const mineShare = (name: string) => shareIn(charEntries, charTotal, name) ?? 0;
  const refShares = (name: string) =>
    topPlayers.map((p, i) => shareIn(p.damageTable.entries, topTotals[i], name));
  const fieldMedian = (name: string) =>
    medianOf(refShares(name).filter((v): v is number => v !== null));

  const mineTop = [...charEntries]
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_DAMAGE_SOURCES)
    .map((e) => e.name);

  const everyName = [
    ...new Set([
      ...charEntries.map((e) => e.name),
      ...topPlayers.flatMap((p) => p.damageTable.entries.map((e) => e.name)),
    ]),
  ];

  const fieldTop = everyName
    .map((name) => ({ name, median: fieldMedian(name) }))
    .filter((x): x is { name: string; median: number } => x.median !== null)
    .sort((a, b) => b.median - a.median)
    .slice(0, TOP_DAMAGE_SOURCES)
    .map((x) => x.name);

  const names = [...new Set([...mineTop, ...fieldTop])];

  const guidOf = (name: string) =>
    charEntries.find((e) => e.name === name)?.guid ??
    topPlayers.flatMap((p) => p.damageTable.entries).find((e) => e.name === name)?.guid ??
    0;

  const rows: DamageGap[] = names.map((name, unionRank) => {
    const minePct = mineShare(name);
    const referencePcts = refShares(name);
    const fieldPct = fieldMedian(name);
    const mineDps = (character.dps * minePct) / 100;
    const fieldDps = medianOf(
      referencePcts
        .map((pct, i) => (pct === null ? null : (topPlayers[i].stats.dps * pct) / 100))
        .filter((v): v is number => v !== null)
    );

    return {
      name,
      guid: guidOf(name),
      minePct,
      fieldPct,
      gapPct: fieldPct === null ? null : fieldPct - minePct,
      mineDps,
      fieldDps,
      gapDps: fieldDps === null ? null : fieldDps - mineDps,
      referencePcts,
      referenceTotal: referencePcts.filter((v) => v !== null).length,
      unionRank,
    };
  });

  return rows.sort(byGapDps);
}

/**
 * L'écart le plus large en tête, les sorts que le champ ne porte pas en queue.
 *
 * Les ex æquo sont départagés par `unionRank`, pour qu'un même jeu de données rende toujours
 * le même ordre — un tri instable ferait bouger la tête de liste d'un rendu à l'autre.
 */
export function byGapDps(a: DamageGap, b: DamageGap): number {
  if (a.gapDps === null || b.gapDps === null) {
    if (a.gapDps === b.gapDps) return a.unionRank - b.unionRank;
    return a.gapDps === null ? 1 : -1;
  }
  const delta = Math.abs(b.gapDps) - Math.abs(a.gapDps);
  return delta !== 0 ? delta : a.unionRank - b.unionRank;
}
