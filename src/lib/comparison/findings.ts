import type { DamageGap } from './damage-gap';
import type { AbilityComparison } from './rotation-stats';
import type { TalentDiffEntry } from './talent-diff';
import type { BossResult, TalentNode } from '@/types';
import { damageGaps } from './damage-gap';
import { isNameableGap, MIN_REFERENCES } from './naming-rights';
import { diffOpening } from './opening-diff';
import { compareCasts, compareUptimes, inReferenceBand } from './rotation-stats';
import { usableSample } from './stat-distribution';
import { diffTalents, isMarginal } from './talent-diff';
import { buildVerdict } from './verdict';

/**
 * Ce qui est proposé comme **cause** d'un écart de dégâts : une cadence, ou un maintien.
 *
 * Les deux portent la même forme — ma valeur, la fourchette du champ — parce que l'écran
 * les rend de la même façon : « tu le lances 1,2/min contre 3,4–4,1 ». Ce qui les sépare
 * est l'unité, et `kind` la donne.
 *
 * Une cause n'apparaît que derrière {@link isNameableGap}. Sans elle, la ligne de constat
 * garde son écart de dps et laisse la cause à `null` : l'écart est mesuré, la cause est une
 * hypothèse, et les deux ne se financent pas l'une l'autre.
 */
export interface AbilityCause {
  kind: 'cast' | 'uptime';
  /** Ma valeur — lancers par minute pour un `cast`, points de maintien pour un `uptime`. */
  mine: number;
  referenceMin: number;
  referenceMax: number;
}

/**
 * Une ligne de la liste des constats.
 *
 * `damage` est le seul type chiffré en dps, et c'est voulu : `opening` et `talent` sont des
 * divergences que rien ne permet de convertir en dégâts sans inventer un contrefactuel.
 * Ils se lisent donc à côté, sans chiffre, plutôt que d'être omis — ils gardent leur
 * effectif, qui dit ce que la donnée porte réellement.
 */
export type Finding =
  | {
      kind: 'damage';
      ability: string;
      /**
       * `fieldDps − mineDps` : l'écart de dégâts **produits** sur ce sort, positif quand le
       * champ en tire plus que moi.
       *
       * Jamais « ce que tu gagnerais en corrigeant » : ce second énoncé est un
       * contrefactuel que la donnée ne porte pas. Et les lignes **ne somment pas** au delta
       * du verdict — une médiane par sort n'est pas additive, donc aucun total ne s'affiche.
       */
      gapDps: number;
      /** Ma part de dégâts sur ce sort, en points. */
      minePct: number;
      /** La médiane des parts du champ, en points. */
      fieldPct: number;
      cause: AbilityCause | null;
    }
  | {
      kind: 'opening';
      /** Le rang du premier écart, **à partir de 1** : c'est un libellé, pas un index. */
      divergesAtRank: number;
      /** Ce que j'ai lancé à ce rang, `null` si mon ouverture s'arrête avant. */
      mine: string | null;
      consensus: string;
      consensusCount: number;
      referenceTotal: number;
    }
  | {
      kind: 'talent';
      label: string;
      /** `missed` : le champ le prend et pas moi. `unique` : je le prends et pas le champ. */
      direction: 'missed' | 'unique';
      referenceCount: number;
      referenceTotal: number;
    };

export interface Findings {
  /** Les écarts de dégâts, classés, au plus {@link MAX_OPPORTUNITIES}. */
  opportunities: Finding[];
  /** Ouverture et build : ce qui diverge sans qu'on puisse le chiffrer. */
  diagnostics: Finding[];
  /**
   * Combien de sorts et de maintiens tombent dans la fourchette des références — le compte
   * du bloc replié. Il est ici et non dans le composant pour que la liste de constats et
   * `RotationCards` annoncent le même nombre.
   */
  matching: number;
}

/**
 * Le plancher de bruit, en part du dps total.
 *
 * Sous 1 % du dps du sujet, une ligne dit un arrondi. Les deux médianes qui la composent
 * sont prises sur trois références : leur incertitude propre dépasse largement cet ordre de
 * grandeur, et une liste qui descend là fait passer du bruit d'échantillonnage pour un
 * constat. Le seuil est relatif au dps du sujet, et non absolu, pour valoir autant sur un
 * combat de deux minutes que sur un de huit.
 */
export const MIN_GAP_DPS_SHARE = 0.01;

/**
 * Combien de lignes chiffrées l'écran montre au plus.
 *
 * La borne n'est pas une limite technique mais la raison d'être de l'écran : une liste de
 * vingt constats classés est le catalogue qu'on remplace. Au-delà, le reste est déjà lisible
 * dans `RotationCards`, avec ses fourchettes.
 */
export const MAX_OPPORTUNITIES = 5;

/**
 * Un écart de dégâts qui a passé toutes les portes : son `gapDps` et son `fieldPct` sont
 * acquis, et le typage le dit.
 */
export type RankedGap = DamageGap & { gapDps: number; fieldPct: number };

/**
 * Les écarts de dégâts qui ont le droit d'être dits, classés par impact décroissant.
 *
 * C'est **le** classement du produit : `damage-gap.ts` trie par `|fieldDps − mineDps|`, une
 * quantité symétrique et dans l'unité que l'écran affiche. Un sort que le champ convertit et
 * que je ne lance pas y remonte, là où une pondération par *ma* part de dégâts l'enfoncerait
 * — ma part y est petite précisément parce que je le sous-utilise.
 *
 * Exportée parce que `leading-gap.ts` doit nommer **le même sort en tête** que la liste de
 * constats : prendre la tête brute de `damageGaps` ne suffirait pas — les filtres ci-dessous
 * peuvent écarter cette tête-là — et redéclarer la chaîne de filtres ailleurs finirait par
 * diverger. Un classement, un filtrage, une tête.
 */
export function rankedGaps(result: BossResult): RankedGap[] {
  const { damageTable, dps } = result.character;
  const kind = buildVerdict(result).kind;
  // Le verdict doit chiffrer : sur `unreliable` et `none`, rien n'est publiable en dps.
  if (kind !== 'gap' && kind !== 'ahead') return [];

  const floor = MIN_GAP_DPS_SHARE * dps;

  return damageGaps({ dps, damageTable }, result.topPlayers)
    .filter(
      (gap): gap is RankedGap =>
        gap.gapDps !== null &&
        gap.fieldPct !== null &&
        gap.referenceTotal >= MIN_REFERENCES &&
        Math.abs(gap.gapDps) >= floor
    )
    .slice(0, MAX_OPPORTUNITIES);
}

/**
 * La ligne de cast d'un écart de dégâts, quand il y en a une.
 *
 * La jointure se fait par `guid` d'abord, par nom ensuite : les tables de dégâts et de casts
 * ne portent pas toujours le même libellé pour un sort, et c'est précisément la raison
 * d'être de `CastEntry.guid`.
 *
 * Exportée parce que `leading-gap.ts` fait exactement la même jointure sur la même tête de
 * classement : deux copies finiraient par diverger, et la bannière nommerait une cadence que
 * la ligne de constat n'attribue pas au même sort.
 */
export function castRowFor(
  gap: DamageGap,
  casts: Record<string, { guid: number }>,
  castRows: AbilityComparison[]
): AbilityComparison | undefined {
  const castName =
    Object.entries(casts).find(([, entry]) => entry.guid === gap.guid)?.[0] ??
    (casts[gap.name] ? gap.name : null);

  return castName === null ? undefined : castRows.find((r) => r.name === castName);
}

/**
 * Retrouve la cadence — ou le maintien — qui expliquerait cet écart de dégâts.
 *
 * Les maintiens n'ont que leur nom pour se joindre — `RotationSummary.buffs` est indexé par
 * libellé ; les cadences passent par {@link castRowFor}.
 *
 * La cadence l'emporte sur le maintien quand les deux existent : un sort qu'on lance moins
 * explique ses propres dégâts plus directement qu'un buff qui se trouve porter le même nom.
 */
function causeFor(
  gap: DamageGap,
  casts: Record<string, { guid: number }>,
  castRows: AbilityComparison[],
  uptimeRows: AbilityComparison[],
  fightDurationMs: number
): AbilityCause | null {
  const castRow = castRowFor(gap, casts, castRows);
  const uptimeRow = uptimeRows.find((r) => r.name === gap.name);

  for (const [kind, row] of [
    ['cast', castRow],
    ['uptime', uptimeRow],
  ] as const) {
    if (!row || !isNameableGap(row, fightDurationMs)) continue;
    // `isNameableGap` a déjà écarté les fourchettes absentes ; la garde qui suit ne redit
    // pas la règle, elle la donne au typage.
    if (row.referenceMin === null || row.referenceMax === null) continue;
    return {
      kind,
      mine: row.mine,
      referenceMin: row.referenceMin,
      referenceMax: row.referenceMax,
    };
  }

  return null;
}

/** Un nœud de build en constat, du côté où il diverge. */
function talentFinding(entry: TalentDiffEntry, direction: 'missed' | 'unique'): Finding {
  return {
    kind: 'talent',
    label: entry.label,
    direction,
    referenceCount: entry.referenceCount,
    referenceTotal: entry.referenceTotal,
  };
}

/**
 * La liste classée des constats, en dps, telle que l'onglet la rend.
 *
 * **Rien n'est calculé ici.** La décomposition en dps vit dans `damage-gap.ts`, le droit de
 * nommer un sort dans `naming-rights.ts`, l'écart de build dans `talent-diff.ts`, l'ouverture
 * dans `opening-diff.ts`. Ce module choisit **ce qui a le droit d'être dit**, et rien d'autre
 * — c'est aussi pourquoi il est pur et testable sans rendu.
 *
 * Quatre portes, toutes reprises de règles déjà en vigueur ailleurs. Les trois premières sont
 * dans {@link rankedGaps}, parce que la bannière les partage :
 *
 * 1. **Le verdict doit chiffrer.** Sur `unreliable` et `none`, `opportunities` est vide.
 *    Ces deux verdicts taisent le delta de dps précisément parce que le panel ne le porte
 *    pas ; publier une décomposition en dps du même écart dirait par la bande ce que la
 *    phrase du dessus refuse de dire. Les `diagnostics`, eux, restent : une divergence
 *    d'ouverture ou de build est un fait sur les logs qu'on a, pas une quantité dérivée
 *    d'un écart de dps qu'on s'interdit d'énoncer.
 * 2. **Effectif** — au moins {@link MIN_REFERENCES} références portent la ligne.
 * 3. **Plancher de bruit** — {@link MIN_GAP_DPS_SHARE} du dps du sujet.
 * 4. **La cause n'est affirmée que derrière {@link isNameableGap}.** Sinon la ligne montre
 *    son écart de dégâts sans nommer de cause. C'est la distinction qui tient tout l'écran.
 */
export function buildFindings(result: BossResult, talentNodes: TalentNode[]): Findings {
  const { rotation, damageTable, stats } = result.character;
  const { topPlayers } = result;

  const castRows = compareCasts(rotation, topPlayers, damageTable.entries);
  const uptimeRows = compareUptimes(rotation, topPlayers);
  // Le `mine > 0` reproduit le filtre de `RotationCards` : le compte annoncé ici est celui du
  // repli là-bas, et deux nombres différents pour la même phrase seraient un défaut visible.
  // Un buff que je n'ai jamais eu, face à une référence qui ne l'a pas non plus, n'est de
  // toute façon pas un sort « qui colle aux références ».
  const matching = [...castRows, ...uptimeRows.filter((row) => row.mine > 0)].filter(
    inReferenceBand
  ).length;

  const opportunities: Finding[] = rankedGaps(result).map((gap) => ({
    kind: 'damage' as const,
    ability: gap.name,
    gapDps: gap.gapDps,
    minePct: gap.minePct,
    fieldPct: gap.fieldPct,
    cause: causeFor(gap, rotation.casts, castRows, uptimeRows, rotation.fightDurationMs),
  }));

  const diagnostics: Finding[] = [];

  const opening = diffOpening(rotation.opening, topPlayers);
  if (opening.referenceTotal >= MIN_REFERENCES && opening.firstDivergence !== null) {
    const step = opening.steps[opening.firstDivergence];
    // Sans consensus il n'y a pas de divergence à raconter : personne ne se rejoint à ce rang.
    if (step !== undefined && step.consensus !== null) {
      diagnostics.push({
        kind: 'opening',
        divergesAtRank: step.index + 1,
        mine: step.mine,
        consensus: step.consensus,
        consensusCount: step.consensusCount,
        referenceTotal: step.referenceTotal,
      });
    }
  }

  const talents = diffTalents(talentNodes, stats.talents, usableSample(result.sample).entries);
  if (talents.referenceTotal >= MIN_REFERENCES) {
    diagnostics.push(
      ...talents.theirsOnly
        .filter((entry) => !isMarginal(entry, 'theirs'))
        .map((entry) => talentFinding(entry, 'missed')),
      ...talents.mineOnly
        .filter((entry) => !isMarginal(entry, 'mine'))
        .map((entry) => talentFinding(entry, 'unique'))
    );
  }

  return { opportunities, diagnostics, matching };
}
