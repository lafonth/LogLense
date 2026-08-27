import type { BossResult } from '@/types';
import { buildVerdict } from '@/lib/comparison/verdict';
import { difficultyName, specLabel } from '@/lib/share-meta';

/**
 * Ce qu'une carte de partage montre : le même joueur mesuré deux fois, contre le vivier
 * entier puis contre les seuls logs comparables.
 *
 * C'est notre position produit sous forme de chiffres, et rien d'autre. Le vivier est la
 * comparaison que rend n'importe quel classement — la tête du champ, à son ilvl à lui ;
 * les références sont ce qui reste une fois l'équipement et le kill time appariés. L'écart
 * entre les deux écarts est exactement ce que les autres outils annoncent au joueur comme
 * son retard, et qui n'est pas à lui.
 *
 * Les deux écarts sont **signés** (`référence − moi`), là où `Verdict.deltaDps` est absolu :
 * une carte qui montre deux mesures côte à côte doit pouvoir en montrer une de chaque signe
 * sans que le lecteur ait à deviner laquelle.
 */
export interface ShareCard {
  player: string;
  encounter: string;
  /** `Mythic`, ou `null` si le palier n'est pas dans la table. */
  difficulty: string | null;
  /** `Fire Mage`, ou `null` si la spec est inconnue. */
  spec: string | null;
  myDps: number;
  myIlvl: number;
  /** Le vivier entier : son DPS médian, son ilvl médian, son effectif. */
  poolDps: number;
  poolIlvl: number;
  poolCount: number;
  /** Les références retenues : leur DPS médian, leur ilvl médian, leur effectif. */
  referenceDps: number;
  referenceIlvl: number;
  referenceCount: number;
  /** `poolDps − myDps`, signé. */
  poolGapDps: number;
  /** `referenceDps − myDps`, signé. */
  referenceGapDps: number;
}

/**
 * `null` quand la carte n'a pas le droit d'exister.
 *
 * Deux portes, et la première est la même que celle du verdict : **un écart ne se chiffre
 * que si le panel est légitime.** Un repli — `poor`, un panel complété, aucune référence —
 * se dit à l'écran, il ne se publie pas. Une carte est faite pour être sortie de son
 * contexte : elle ne peut pas porter les réserves qui accompagnent le chiffre à l'écran,
 * donc elle ne porte pas les chiffres qui en ont besoin.
 *
 * La seconde porte est l'ilvl du vivier. Sans lui, la carte dirait « l'écart tombe de 55k à
 * 25k » sans pouvoir dire pourquoi — c'est-à-dire l'affirmation sans la démonstration, ce
 * que nous reprochons précisément aux classements.
 */
export function buildShareCard(result: BossResult): ShareCard | null {
  const verdict = buildVerdict(result);
  if (verdict.kind !== 'gap' && verdict.kind !== 'ahead') return null;
  if (verdict.referenceDps === null) return null;

  const { poolDps, poolIlvl, referenceIlvl, candidatesConsidered, myIlvl } = result.comparability;
  if (poolDps === null || poolIlvl === null || referenceIlvl === null) return null;

  return {
    player: result.character.stats.name,
    encounter: result.encounter,
    difficulty: difficultyName(String(result.difficulty)),
    spec: specLabel(String(result.specId)),
    myDps: verdict.myDps,
    myIlvl,
    poolDps,
    poolIlvl,
    poolCount: candidatesConsidered,
    referenceDps: verdict.referenceDps,
    referenceIlvl,
    referenceCount: verdict.referenceCount,
    poolGapDps: poolDps - verdict.myDps,
    referenceGapDps: verdict.referenceDps - verdict.myDps,
  };
}
