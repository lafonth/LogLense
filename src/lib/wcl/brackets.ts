import { ILVL_TOLERANCE, MAX_POOL_BRACKETS } from './constants';

/**
 * Le découpage d'ilvl déclaré par un palier, tel que `zone { brackets }` le rend.
 *
 * Jamais codé en dur : `min` et `bucket` changent d'un palier à l'autre — 272 et 3 sur le
 * palier mesuré au spike de l'étape 3 — et une constante figée classerait tout le vivier
 * dans le mauvais bracket au premier palier suivant.
 */
export interface ItemLevelBrackets {
  min: number;
  max: number;
  bucket: number;
}

/**
 * Le libellé du seul découpage exploitable. Une zone qui découpe sur autre chose — et le
 * champ `type` est là pour qu'on puisse le savoir — rend `null` : filtrer sur un axe qu'on
 * prend pour l'ilvl écarterait le vivier au hasard, en silence.
 */
export const ITEM_LEVEL_BRACKET_TYPE = 'Item Level';

interface RawBracket {
  type?: string | null;
  min?: number | null;
  max?: number | null;
  bucket?: number | null;
}

/**
 * Un découpage déjà normalisé — celui que le cache a écrit — revalidé à la relecture.
 *
 * Séparé de `itemLevelBrackets` parce que les deux entrées n'ont pas la même forme : ce qui
 * sort du cache est déjà réduit à `min` / `max` / `bucket`, et le champ `type` de WCL n'y
 * survit pas. Les passer au même validateur rejetterait tout ce qu'on vient d'écrire.
 */
export function parseItemLevelBrackets(raw: unknown): ItemLevelBrackets | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const { min, max, bucket } = raw as Partial<ItemLevelBrackets>;
  if (typeof min !== 'number' || typeof max !== 'number' || typeof bucket !== 'number') return null;
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(bucket)) return null;
  if (bucket <= 0 || max < min) return null;

  return { min, max, bucket };
}

/** Le découpage d'ilvl d'une zone, ou `null` s'il est absent, d'un autre type, ou incohérent. */
export function itemLevelBrackets(raw: RawBracket | null | undefined): ItemLevelBrackets | null {
  if (!raw || raw.type !== ITEM_LEVEL_BRACKET_TYPE) return null;
  return parseItemLevelBrackets(raw);
}

/**
 * Le numéro de bracket d'un ilvl.
 *
 * Formule mesurée au spike, confirmée sur cinq points : le bracket `n` couvre
 * `[min + (n−1)·bucket , min + n·bucket − 1]`. La numérotation part de 1 ; `0` est la valeur
 * que WCL réserve au non-filtré, elle n'est donc jamais rendue ici.
 */
export function bracketOf(ilvl: number, brackets: ItemLevelBrackets): number {
  return Math.floor((ilvl - brackets.min) / brackets.bucket) + 1;
}

/**
 * Les brackets à interroger pour couvrir la tolérance d'ilvl autour d'un joueur.
 *
 * Un bracket est plus étroit que `ILVL_TOLERANCE` — 3 ilvl contre 4 sur le palier mesuré —
 * donc couvrir la tolérance en demande plusieurs. Les interroger tous est ce qui garantit
 * qu'aucun candidat *dans* la tolérance n'est écarté par le filtre : un filtre qui couperait
 * au milieu de la tolérance ferait mentir `scoreCandidate`, qui continue de juger sur la
 * tolérance entière.
 *
 * Rend `[]` — « n'utilise pas le filtre » — dans les trois cas où filtrer ne serait pas
 * défendable : ilvl inconnu, découpage incohérent, ou couverture demandant plus de
 * `MAX_POOL_BRACKETS` brackets. Ce dernier cas est un arbitrage de budget et non de justesse :
 * sur un palier au bucket très fin, filtrer coûterait plus de requêtes que le vivier entier
 * n'en coûte aujourd'hui. On ne réduit alors pas la couverture — ce serait écarter en silence
 * une partie de la tolérance — on renonce au filtre.
 */
export function bracketsCovering(
  ilvl: number,
  brackets: ItemLevelBrackets,
  tolerance: number = ILVL_TOLERANCE
): number[] {
  if (!Number.isFinite(ilvl) || ilvl <= 0) return [];

  const top = Math.max(1, bracketOf(brackets.max, brackets));
  const clamp = (n: number) => Math.min(top, Math.max(1, n));

  const low = clamp(bracketOf(ilvl - tolerance, brackets));
  const high = clamp(bracketOf(ilvl + tolerance, brackets));

  const count = high - low + 1;
  if (count > MAX_POOL_BRACKETS) return [];

  return Array.from({ length: count }, (_, i) => low + i);
}
