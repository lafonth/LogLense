import type { CastTimeline, DamageEntry, RotationSummary, TopPlayer } from '@/types';
import { medianOf } from '@/lib/wcl/comparability';
import {
  COOLDOWN_MAX_PER_MIN,
  MAX_TIMING_ROWS,
  MIN_TIMING_DEVIATION_MS,
  MIN_TIMING_REFERENCES,
} from '@/lib/wcl/constants';

/**
 * Un rang d'utilisation d'un sort : mon instant contre celui du champ.
 *
 * Rang et non instant absolu : la troisième Combustion du champ se compare à la mienne, pas
 * au temps qu'il fait sur l'horloge. Deux combats de durées voisines — la sélection les tient
 * déjà dans `KILL_TIME_TOLERANCE` — n'ont pas pour autant les mêmes fenêtres de burst.
 *
 * `mineMs` à `null` n'est pas un zéro : c'est le rang que je n'ai jamais atteint alors que le
 * champ y est. C'est le constat « sort attendu absent », et c'est précisément celui qu'une
 * timeline tronquée fabriquerait de toutes pièces — d'où le silence en amont.
 */
export interface TimingRank {
  /** 1 pour la première utilisation du combat. */
  rank: number;
  mineMs: number | null;
  referenceMinMs: number;
  referenceMedianMs: number;
  referenceMaxMs: number;
  /** Sur combien de références la fourchette est prise. Jamais moins de deux. */
  referenceTotal: number;
}

/** Un sort de cooldown, rang par rang, et le premier rang qui sort de la fourchette. */
export interface CastTiming {
  name: string;
  guid: number;
  ranks: TimingRank[];
  /** Le premier rang hors fourchette, 1-based. `null` quand tout tient dedans. */
  firstOutsideRank: number | null;
  /**
   * De combien je franchis la borne, en millisecondes — positif en retard, négatif en avance.
   * `null` quand le rang est franchi parce que je ne l'ai pas lancé du tout : l'absence n'a
   * pas d'amplitude, et lui en inventer une serait un chiffre de plus qui ne mesure rien.
   */
  deviationMs: number | null;
}

/**
 * Ce que l'axe rend, silence compris.
 *
 * `silenced` est la moitié utile du résultat. Un axe qui ne dit rien parce qu'il n'avait pas
 * la donnée et un axe qui ne dit rien parce que tout était en place se ressemblent une fois
 * rendus — et le second est un constat, le premier une absence de mesure. Le prompt doit
 * pouvoir les séparer, sinon le modèle comblera.
 */
export interface CastTimingResult {
  /** Les sorts hors fourchette, du plus franc au moins franc, bornés à {@link MAX_TIMING_ROWS}. */
  abilities: CastTiming[];
  /** Combien de sorts de cooldown ont pu être comparés — le dénominateur du constat. */
  comparedTotal: number;
  silenced: null | 'no-timeline' | 'truncated' | 'not-enough-references';
}

interface TimingSubject {
  rotation: RotationSummary;
  damageTable: { entries: DamageEntry[] };
}

/** Les instants d'un sort dans une chaîne, dans l'ordre. */
function offsetsOf(timeline: CastTimeline, guid: number): number[] {
  return timeline.casts.filter((c) => c.guid === guid).map((c) => c.offsetMs);
}

/** Une chaîne n'est utilisable que complète : un préfixe ferait passer la borne pour un arrêt. */
function usableTimeline(rotation: RotationSummary): CastTimeline | null {
  const timeline = rotation.timeline;
  return timeline && !timeline.truncated ? timeline : null;
}

/**
 * Les sorts dont l'instant est une décision.
 *
 * Deux filtres, et le premier est une garde de périmètre autant qu'un critère. **Seuls les
 * sorts présents dans ma table de dégâts** sont retenus : c'est la seule garantie, sans
 * métadonnée de spec, qu'il s'agit d'une source de dégâts et non d'une défensive ou d'un
 * déplacement — `SCOPE_RULE` interdit de conseiller sur les seconds. La limite assumée : un
 * cooldown purement offensif qui n'inflige aucun dégât lui-même (un buff de puissance) est
 * invisible à cet axe. Mieux vaut le manquer que conseiller un mur défensif.
 *
 * Le second est un rythme : au-delà de {@link COOLDOWN_MAX_PER_MIN}, ce qui décide de
 * l'instant d'un sort est ce qui vient d'être lancé, pas un plan. Sa cadence est déjà dite
 * par la table agrégée, et son ordre par l'ouverture.
 */
function cooldownGuids(subject: TimingSubject): { guid: number; name: string }[] {
  const damaging = new Set(subject.damageTable.entries.map((e) => e.guid));
  return Object.entries(subject.rotation.casts)
    .filter(([, entry]) => damaging.has(entry.guid) && entry.perMin <= COOLDOWN_MAX_PER_MIN)
    .map(([name, entry]) => ({ guid: entry.guid, name }));
}

/**
 * L'écart de placement des cooldowns : « sort hors fenêtre ».
 *
 * Ce module existe pour que les timelines des références **n'entrent pas** dans le prompt.
 * Quatre chaînes brutes envoyées au modèle en espérant qu'il y trouve l'écart, c'est le
 * gadget que la contrainte 2 interdit — et c'était mesuré à +59 à +100 % de jetons le
 * 2026-09-03. L'écart se calcule ici ; seule la chaîne du sujet est rendue.
 *
 * Trois silences, tous délibérés. Pas de chaîne, chaîne tronquée, ou moins de
 * {@link MIN_TIMING_REFERENCES} références à un rang : dans les trois cas la ligne disparaît
 * au lieu de sortir affaiblie. Une médiane de timing sur une seule référence n'est pas une
 * fourchette, c'est un exemple — même doctrine que le plancher de bruit de `findings.ts`.
 */
export function castTimings(subject: TimingSubject, references: TopPlayer[]): CastTimingResult {
  const mine = subject.rotation.timeline;
  if (!mine) return { abilities: [], comparedTotal: 0, silenced: 'no-timeline' };
  if (mine.truncated) return { abilities: [], comparedTotal: 0, silenced: 'truncated' };

  const fields = references
    .map((r) => usableTimeline(r.rotation))
    .filter((t): t is CastTimeline => t !== null);
  if (fields.length < MIN_TIMING_REFERENCES) {
    return { abilities: [], comparedTotal: 0, silenced: 'not-enough-references' };
  }

  const timings: CastTiming[] = [];
  for (const { guid, name } of cooldownGuids(subject)) {
    const mineOffsets = offsetsOf(mine, guid);
    const fieldOffsets = fields.map((t) => offsetsOf(t, guid)).filter((o) => o.length > 0);
    if (fieldOffsets.length < MIN_TIMING_REFERENCES) continue;

    const ranks: TimingRank[] = [];
    let firstOutsideRank: number | null = null;
    let deviationMs: number | null = null;

    const deepest = Math.max(...fieldOffsets.map((o) => o.length));
    for (let i = 0; i < deepest; i++) {
      const atRank = fieldOffsets.filter((o) => o.length > i).map((o) => o[i]);
      // Le compte est décroissant avec le rang : dès qu'il passe sous le seuil, aucun rang
      // plus profond ne le repassera. On s'arrête plutôt que de tourner à vide.
      if (atRank.length < MIN_TIMING_REFERENCES) break;

      const referenceMinMs = Math.min(...atRank);
      const referenceMaxMs = Math.max(...atRank);
      const mineMs = i < mineOffsets.length ? mineOffsets[i] : null;
      ranks.push({
        rank: i + 1,
        mineMs,
        referenceMinMs,
        referenceMedianMs: medianOf(atRank)!,
        referenceMaxMs,
        referenceTotal: atRank.length,
      });

      if (firstOutsideRank !== null) continue;
      if (mineMs === null) {
        firstOutsideRank = i + 1;
      } else if (mineMs > referenceMaxMs + MIN_TIMING_DEVIATION_MS) {
        firstOutsideRank = i + 1;
        deviationMs = mineMs - referenceMaxMs;
      } else if (mineMs < referenceMinMs - MIN_TIMING_DEVIATION_MS) {
        firstOutsideRank = i + 1;
        deviationMs = mineMs - referenceMinMs;
      }
    }

    if (ranks.length > 0) timings.push({ name, guid, ranks, firstOutsideRank, deviationMs });
  }

  const outside = timings
    .filter((t) => t.firstOutsideRank !== null)
    // Un rang jamais atteint passe devant tout écart chiffré : « tu ne l'as pas relancé » est
    // un fait plus gros que « tu l'as relancé huit secondes trop tard ».
    .sort((a, b) => Math.abs(b.deviationMs ?? Infinity) - Math.abs(a.deviationMs ?? Infinity))
    .slice(0, MAX_TIMING_ROWS);

  return { abilities: outside, comparedTotal: timings.length, silenced: null };
}
