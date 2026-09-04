'use client';

import type { CohortFilter, CohortView } from '@/lib/comparison/cohort';
import type { BossResult, ReferenceSample } from '@/types';
import { useState } from 'react';
import { describeCohort, logKey } from '@/lib/comparison/cohort';

/**
 * L'état de la cohorte, tenu en un seul endroit.
 *
 * `CohortFilterPanel` est la surface de réglage, mais il n'est plus le seul consommateur :
 * depuis que les cases à cocher gouvernent aussi les stats et le build, l'onglet Comparison a
 * besoin du même verdict que le panneau. Deux états séparés se seraient désynchronisés — le
 * panneau annonçant un effectif que la table du dessous ne rendrait pas — donc l'état monte
 * dans `ComparisonTab` et le panneau le reçoit entier.
 *
 * Tout est calculé dans le navigateur, sur `result.sample` : les candidats que l'analyse a
 * déjà vérifiés et rendus au client. Bouger un réglage ou cocher une ligne ne déclenche ni
 * requête WCL, ni écriture d'instantané.
 */

/** `null` ferme l'axe : la dernière position de chaque curseur ne filtre rien. */
export const KILL_TIME_STEPS: (number | null)[] = [0.05, 0.1, 0.15, 0.2, 0.3, 0.5, null];
export const ILVL_STEPS: (number | null)[] = [1, 2, 3, 4, 6, 8, 12, null];
export const EXTERNAL_STEPS: (number | null)[] = [0, 5, 10, 20, 40, null];

/**
 * Combien de matchs sont cochés à l'ouverture.
 *
 * Cinq et non douze : la cohorte par défaut doit être celle qu'on défendrait, et les meilleurs
 * matchs le sont. Cinq et non trois : `TOP_N` compte les références **récupérées en détail**,
 * un coût de requêtes ; ici rien n'est récupéré, donc rien n'oblige à s'aligner sur lui, et
 * une médiane sur cinq est plus stable que sur trois.
 */
export const DEFAULT_CHECKED = 5;

export interface CohortState {
  /** Position des curseurs et des bascules, telle que le panneau la rend. */
  tier: 'any' | number;
  killIdx: number;
  ilvlIdx: number;
  extIdx: number;
  includeDisqualified: boolean;
  setTier: (tier: 'any' | number) => void;
  setKillIdx: (index: number) => void;
  setIlvlIdx: (index: number) => void;
  setExtIdx: (index: number) => void;
  setIncludeDisqualified: (on: boolean) => void;

  /** La valeur courante de chaque axe, `null` quand il est ouvert. */
  killTol: number | null;
  ilvlWithin: number | null;
  maxExternalUptime: number | null;
  filter: CohortFilter;

  /** Le vivier réduit au filtre : ce que la table propose à cocher, du plus proche au plus loin. */
  view: CohortView;
  /** Les cochés, dans le même ordre. */
  selected: ReferenceSample[];
  /**
   * Ce que valent les cochés — niveau, distance médiane, distributions. C'est le verdict que
   * le panneau annonce et que les tables du dessous rendent : une seule cohorte, un seul mot.
   */
  selectedView: CohortView;
  checkedKeys: Set<string>;
  toggle: (key: string) => void;
  /** Cocher ou décocher tout ce que le filtre laisse voir. */
  setAllChecked: (checked: boolean) => void;

  /** Vrai tant que rien n'a bougé : filtre vide et cases jamais touchées. */
  neutral: boolean;
  reset: () => void;
}

export function useCohortState(result: BossResult): CohortState {
  const [tier, setTier] = useState<'any' | number>('any');
  const [killIdx, setKillIdx] = useState(KILL_TIME_STEPS.length - 1);
  const [ilvlIdx, setIlvlIdx] = useState(ILVL_STEPS.length - 1);
  const [extIdx, setExtIdx] = useState(EXTERNAL_STEPS.length - 1);
  const [includeDisqualified, setIncludeDisqualified] = useState(false);
  /**
   * `null` veut dire « jamais touché », pas « rien de coché » : les `DEFAULT_CHECKED`
   * meilleurs matchs suivent alors le filtre d'eux-mêmes. Dès qu'une case est cliquée, la
   * liste devient explicite et cesse de bouger sous le lecteur.
   */
  const [picked, setPicked] = useState<string[] | null>(null);

  const subject = {
    stats: result.character.stats,
    dps: result.character.dps,
    killTimeMs: result.comparability.myKillTimeMs,
  };

  const killTol = KILL_TIME_STEPS[killIdx];
  const ilvlWithin = ILVL_STEPS[ilvlIdx];
  const maxExternalUptime = EXTERNAL_STEPS[extIdx];

  const filter: CohortFilter = {};
  if (tier !== 'any') filter.tierPieces = tier;
  // Un kill time de zéro rendrait deux bornes nulles, donc une cohorte vide sans que le
  // lecteur ait rien demandé : l'axe se ferme plutôt que de mentir.
  if (killTol !== null && subject.killTimeMs > 0) {
    filter.minKillTimeMs = subject.killTimeMs * (1 - killTol);
    filter.maxKillTimeMs = subject.killTimeMs * (1 + killTol);
  }
  if (ilvlWithin !== null) filter.ilvlWithin = ilvlWithin;
  if (maxExternalUptime !== null) filter.maxExternalUptime = maxExternalUptime;
  if (includeDisqualified) filter.includeDisqualified = true;

  const view = describeCohort(subject, result.sample, filter);

  const shownKeys = view.members.map(logKey);
  // Un coché que le filtre vient de masquer sort de la cohorte sans sortir de `picked` :
  // rouvrir l'axe le ramène tel qu'il était, plutôt que de forcer à le recocher.
  const checkedKeys = new Set(
    picked === null
      ? shownKeys.slice(0, DEFAULT_CHECKED)
      : picked.filter((k) => shownKeys.includes(k))
  );

  const byKey = new Map(result.sample.map((entry) => [logKey(entry), entry] as const));
  const selected = view.members.flatMap((member) => {
    const key = logKey(member);
    const entry = byKey.get(key);
    return checkedKeys.has(key) && entry ? [entry] : [];
  });

  // Les cochés se décrivent sans repasser par un filtre : ils ont été désignés un par un,
  // donc `includeDisqualified` — sinon un candidat coché à la main serait écarté par la règle
  // qui protège une sélection automatique.
  const selectedView = describeCohort(subject, selected, { includeDisqualified: true });

  function toggle(key: string) {
    const next = new Set(checkedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked([...next]);
  }

  function setAllChecked(checked: boolean) {
    setPicked(checked ? shownKeys : []);
  }

  function reset() {
    setTier('any');
    setKillIdx(KILL_TIME_STEPS.length - 1);
    setIlvlIdx(ILVL_STEPS.length - 1);
    setExtIdx(EXTERNAL_STEPS.length - 1);
    setIncludeDisqualified(false);
    setPicked(null);
  }

  return {
    tier,
    killIdx,
    ilvlIdx,
    extIdx,
    includeDisqualified,
    setTier,
    setKillIdx,
    setIlvlIdx,
    setExtIdx,
    setIncludeDisqualified,
    killTol,
    ilvlWithin,
    maxExternalUptime,
    filter,
    view,
    selected,
    selectedView,
    checkedKeys,
    toggle,
    setAllChecked,
    neutral: Object.keys(filter).length === 0 && picked === null,
    reset,
  };
}
