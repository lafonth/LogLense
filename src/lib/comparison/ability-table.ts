import type { DamageEntry, TopPlayer } from '@/types';
import { medianOf } from '@/lib/wcl/comparability';
import { damageGaps } from './damage-gap';

/**
 * Les six colonnes de la table de dégâts de Warcraft Logs, pour un joueur et un sort.
 *
 * `null` dit **non mesuré**, jamais zéro : un proc que WCL ne rattache à aucun cast n'a pas
 * de dénominateur, et une moyenne sans dénominateur ne s'invente pas. Un sort qu'un joueur
 * lisible n'a simplement pas posé, lui, vaut bien zéro — c'est un choix de jeu, pas une
 * donnée manquante, exactement comme la part nulle de `damage-gap.ts`.
 */
export interface AbilityMetrics {
  amount: number;
  /** `uses` de la table de dégâts — cf. {@link DamageEntry.uses}, jamais `CastEntry.casts`. */
  casts: number | null;
  avgCast: number | null;
  /** Coups directs et ticks confondus : un canalisé ne produit que des seconds. */
  hits: number | null;
  avgHit: number | null;
  dps: number;
}

/**
 * Une ligne de la table côte à côte : mes six colonnes, celles du champ, et de quoi dessiner
 * la barre.
 *
 * `field` est la **médiane des références**, colonne par colonne — pas une référence nommée.
 * Une seule référence rendrait la table plus lisible et la comparaison fausse : on perdrait
 * la dispersion, qui est ce qui dit si mon écart sort de l'ordinaire. Le min–max des parts
 * la rend visible en filigrane sous la barre.
 *
 * Conséquence à assumer : les colonnes ne se recomposent pas entre elles. `avgCast` est la
 * médiane des moyennes de chacun, pas la médiane des montants divisée par celle des casts —
 * et les lignes ne somment pas au total. Une médiane n'est pas additive.
 */
export interface AbilityRow {
  name: string;
  guid: number;
  mine: AbilityMetrics;
  /** `null` quand aucune référence n'a de table lisible. */
  field: AbilityMetrics | null;
  /** Part de ce sort dans mes dégâts, en points : la largeur de la barre. */
  minePct: number;
  /** Médiane des parts du champ, et sa dispersion — le filigrane. */
  fieldPct: number | null;
  fieldPctMin: number | null;
  fieldPctMax: number | null;
  /** Mon dps sur ce sort contre celui du champ, en %. `null` sans champ. */
  deviationPct: number | null;
  referenceTotal: number;
}

export interface AbilityTable {
  rows: AbilityRow[];
  /**
   * Toute la table, pas seulement les lignes rendues : c'est le total du combat, et son dps
   * est celui du joueur. La somme des lignes visibles ne l'atteint pas — l'union n'en garde
   * qu'une vingtaine.
   */
  total: { mine: AbilityMetrics; field: AbilityMetrics | null; deviationPct: number | null };
  /**
   * Les compteurs existent-ils quelque part dans ce jeu de données ?
   *
   * Faux sur un instantané écrit avant que le parse ne les garde : les colonnes sont alors
   * mises à `null` partout plutôt que remplies de zéros vraisemblables. La règle du plan est
   * qu'une colonne sans données s'abandonne — elle ne s'invente pas.
   */
  hasCasts: boolean;
  hasHits: boolean;
  referenceTotal: number;
}

interface AbilitySubject {
  dps: number;
  damageTable: { entries: DamageEntry[] };
}

function round1(value: number): number {
  return (Math.sign(value) * Math.round(Math.abs(value) * 10)) / 10;
}

function totalOf(entries: DamageEntry[]): number {
  return entries.reduce((sum, e) => sum + e.total, 0);
}

/** Somme d'un compteur sur les lignes d'un sort. `null` quand aucune ne le porte. */
function sumCount(
  matching: DamageEntry[],
  of: (e: DamageEntry) => number | undefined
): number | null {
  const values = matching.map(of).filter((v): v is number => v !== undefined);
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0);
}

function hitsOf(matching: DamageEntry[]): number | null {
  const direct = sumCount(matching, (e) => e.hitCount);
  const ticks = sumCount(matching, (e) => e.tickCount);
  return direct === null && ticks === null ? null : (direct ?? 0) + (ticks ?? 0);
}

const ratio = (amount: number, count: number | null) =>
  count === null || count === 0 ? null : amount / count;

function metricsOf(
  entries: DamageEntry[],
  tableTotal: number,
  dps: number,
  name: string,
  keep: { casts: boolean; hits: boolean }
): AbilityMetrics {
  const matching = entries.filter((e) => e.name === name);
  const amount = totalOf(matching);
  // Une ligne absente d'une table lisible vaut zéro coup ; une ligne présente dont WCL ne
  // rattache pas le compte vaut `null`. Les deux se ressemblent à l'écran, pas dans la
  // médiane : le premier la tire vers le bas, le second n'y entre pas.
  const casts = !keep.casts ? null : matching.length === 0 ? 0 : sumCount(matching, (e) => e.uses);
  const hits = !keep.hits ? null : matching.length === 0 ? 0 : hitsOf(matching);

  return {
    amount,
    casts,
    avgCast: ratio(amount, casts),
    hits,
    avgHit: ratio(amount, hits),
    dps: tableTotal > 0 ? (amount / tableTotal) * dps : 0,
  };
}

function tableMetrics(
  entries: DamageEntry[],
  dps: number,
  keep: { casts: boolean; hits: boolean }
): AbilityMetrics {
  const amount = totalOf(entries);
  const casts = keep.casts ? sumCount(entries, (e) => e.uses) : null;
  const hits = keep.hits ? hitsOf(entries) : null;
  return { amount, casts, avgCast: ratio(amount, casts), hits, avgHit: ratio(amount, hits), dps };
}

/** Médiane colonne par colonne. Une colonne dont personne ne porte la valeur reste `null`. */
function medianMetrics(sides: AbilityMetrics[]): AbilityMetrics | null {
  if (sides.length === 0) return null;
  const col = (of: (m: AbilityMetrics) => number | null) =>
    medianOf(sides.map(of).filter((v): v is number => v !== null));

  return {
    amount: col((m) => m.amount) ?? 0,
    casts: col((m) => m.casts),
    avgCast: col((m) => m.avgCast),
    hits: col((m) => m.hits),
    avgHit: col((m) => m.avgHit),
    dps: col((m) => m.dps) ?? 0,
  };
}

const deviation = (mine: number, field: number | null) =>
  field === null || field === 0 ? null : round1(((mine - field) / field) * 100);

/**
 * La table côte à côte : mes sorts et ceux du champ, six colonnes chacun, plus le total.
 *
 * L'ensemble des lignes et les parts viennent de `damageGaps` — c'est la même union et le
 * même effectif, pour que l'écran ne puisse pas contredire la bannière sur ce qui compte.
 * Ce module n'ajoute que les compteurs, que WCL livre dans la même charge utile.
 *
 * Une référence dont la table est vide est écartée de l'effectif ; les autres comptent,
 * y compris à zéro. Tri : la plus grosse part des deux côtés d'abord, pour qu'un sort que
 * le champ convertit et que je ne pose pas reste en haut de l'écran.
 */
export function abilityTable(character: AbilitySubject, topPlayers: TopPlayer[]): AbilityTable {
  const gaps = damageGaps(character, topPlayers);
  const mineEntries = character.damageTable.entries;
  const everyEntry = [...mineEntries, ...topPlayers.flatMap((p) => p.damageTable.entries)];
  const keep = {
    casts: everyEntry.some((e) => e.uses !== undefined),
    hits: everyEntry.some((e) => e.hitCount !== undefined || e.tickCount !== undefined),
  };

  const mineTotal = totalOf(mineEntries);
  const readable = topPlayers
    .map((p) => ({ player: p, total: totalOf(p.damageTable.entries) }))
    .filter((r) => r.total > 0);

  const rows = gaps.map((gap): AbilityRow => {
    const pcts = gap.referencePcts.filter((v): v is number => v !== null);
    const sides = readable.map((r) =>
      metricsOf(r.player.damageTable.entries, r.total, r.player.stats.dps, gap.name, keep)
    );
    const mine = metricsOf(mineEntries, mineTotal, character.dps, gap.name, keep);
    const field = medianMetrics(sides);

    return {
      name: gap.name,
      guid: gap.guid,
      mine,
      field,
      minePct: gap.minePct,
      fieldPct: gap.fieldPct,
      fieldPctMin: pcts.length > 0 ? Math.min(...pcts) : null,
      fieldPctMax: pcts.length > 0 ? Math.max(...pcts) : null,
      deviationPct: deviation(mine.dps, field?.dps ?? null),
      referenceTotal: gap.referenceTotal,
    };
  });

  const mineWhole = tableMetrics(mineEntries, character.dps, keep);
  const fieldWhole = medianMetrics(
    readable.map((r) => tableMetrics(r.player.damageTable.entries, r.player.stats.dps, keep))
  );

  const weight = (row: AbilityRow) => Math.max(row.minePct, row.fieldPct ?? 0);

  return {
    rows: rows.sort((a, b) => weight(b) - weight(a)),
    total: {
      mine: mineWhole,
      field: fieldWhole,
      deviationPct: deviation(mineWhole.dps, fieldWhole?.dps ?? null),
    },
    hasCasts: keep.casts,
    hasHits: keep.hits,
    referenceTotal: readable.length,
  };
}
