import type { EligibilityProfile } from './eligibility';
import type { ReferenceSample, TopPlayer } from '@/types';
import { scoreCandidate } from './comparability';
import { disqualify } from './eligibility';
import { fetchFightData } from './fight-data';
import { fmtMs } from './parsers';
import {
  fightDataCacheKey,
  readCachedFightData,
  readCachedVerifications,
  verificationCacheKey,
  writeCachedFightData,
} from './reference-cache';

/**
 * Promouvoir un candidat de l'échantillon en référence complète.
 *
 * L'analyse ne récupère dégâts et rotation que pour `TOP_N = 3`. Les neuf autres candidats
 * vérifiés restent dans `sample` avec leurs stats, leur dps et leur kill time — assez pour
 * une distribution, pas pour une comparaison de rotation. Aller chercher le reste pour un
 * quatrième est le seul geste du chat qui coûte des requêtes, et c'est pour ça qu'il est
 * isolé ici plutôt que fondu dans la couche d'outils : ce qui dépense doit se lire d'un seul
 * endroit.
 *
 * **Rien n'est redemandé de ce qui a déjà été payé.** Le `CombatantEvent` et
 * l'`EligibilityProfile` du candidat sont dans le cache de vérification, à une clé que
 * `ReferenceSample` sait former à elle seule — `code`, `fightID`, `name`. Son absence n'est
 * pas un motif pour les refetch : elle veut dire que l'entrée a expiré ou que
 * `externalsFingerprint()` a changé sous un déploiement, et dans les deux cas la bonne
 * réponse est de relancer l'analyse, pas de reconstituer à moitié une vérification dont on
 * ne saurait plus dire si elle disqualifie.
 */

/**
 * Ce que coûte une promotion : les trois requêtes de `fetchFightData` sans contexte de raid
 * — dégâts, rotation, événements de cast. Le contexte n'est pas demandé : il sert à dire ce
 * qui est arrivé au **sujet** pendant sa pull, et une référence n'a pas de bandeau.
 */
export const PROMOTION_WCL_CALLS = 3;

export type PromotionOutcome =
  | { ok: true; player: TopPlayer; wclCalls: number }
  | { ok: false; reason: 'expired' | 'failed' };

/** Ce que le sujet apporte : sa position, pour la distance, et son profil, pour le verdict. */
export interface PromotionSubject {
  ilvl: number;
  killTimeMs: number;
  eligibility: EligibilityProfile;
}

export async function promoteReference(
  token: string,
  sample: ReferenceSample,
  subject: PromotionSubject
): Promise<PromotionOutcome> {
  const { name, code, fightID, actorId, dps, killTimeMs } = sample;

  const [verification] = await readCachedVerifications([
    verificationCacheKey({ code, fightID, name }),
  ]);
  if (!verification) return { ok: false, reason: 'expired' };

  // `actorId` est le `sourceID` du combattant — `references.ts` écrit les deux depuis la même
  // valeur — donc la clé de dégâts se forme sans avoir lu la vérification. Un succès ici rend
  // la promotion gratuite : c'est le cas courant quand une autre analyse a déjà tiré ce combat.
  const dataKey = fightDataCacheKey({ code, fightID, sourceID: actorId });
  const cached = await readCachedFightData(dataKey);

  let wclCalls = 0;
  let data = cached;

  if (!data) {
    try {
      const fetched = await fetchFightData(token, {
        code,
        fightId: fightID,
        combatant: verification.combatant,
        name,
        fightMs: killTimeMs,
        dps,
      });
      wclCalls = PROMOTION_WCL_CALLS;
      data = {
        stats: fetched.stats,
        rotation: fetched.rotation,
        damageEntries: fetched.damageEntries,
        fightTargets: fetched.fightTargets,
      };
      await writeCachedFightData(dataKey, data);
    } catch {
      // Les requêtes sont parties, qu'elles aient abouti ou non : le compteur les porte quand
      // même, sinon un échec répété dépenserait le budget sans jamais le débiter.
      return { ok: false, reason: 'failed' };
    }
  }

  const distance = scoreCandidate(
    { bracketData: sample.stats.avgIlvl, duration: killTimeMs },
    subject.ilvl,
    subject.killTimeMs
  );

  return {
    ok: true,
    wclCalls,
    player: {
      stats: { ...data.stats, dps, killTime: fmtMs(killTimeMs) },
      rotation: data.rotation,
      damageTable: { entries: data.damageEntries },
      fightTargets: data.fightTargets,
      provenance: {
        code,
        fightID,
        actorId,
        name,
        ilvl: sample.stats.avgIlvl,
        killTimeMs,
        dps,
        distance,
        // Recalculé plutôt que déduit du booléen `qualified` : celui-ci dit qu'un critère a
        // écarté le candidat, jamais lequel, et le panel nomme le motif.
        disqualifiedBy: disqualify(verification.profile, subject.eligibility),
        tierPieces: verification.profile.tierPieces,
        externalUptime: verification.profile.externalUptime,
        explored: sample.explored,
      },
    },
  };
}
