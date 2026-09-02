import type { BossOutcome, BossRefusal, BossResult } from '@/types';
import { getSpecInfo, specLabel } from '@/lib/specs';

/**
 * Le tri entre un résultat et un refus.
 *
 * Deux gardes plutôt qu'une négation : les appelants sont de deux sortes. Ceux qui rendent
 * quelque chose veulent le refus (`isBossRefusal`) ; ceux qui écrivent — instantané, corpus,
 * prompt — veulent le résultat et rien d'autre (`isBossResult`), et le `null` doit y tomber
 * du même côté que le refus. Écrire un refus dans un instantané le servirait 24 h.
 */
export function isBossRefusal(outcome: BossOutcome | null | undefined): outcome is BossRefusal {
  return outcome != null && 'refused' in outcome;
}

export function isBossResult(outcome: BossOutcome | null | undefined): outcome is BossResult {
  return outcome != null && !('refused' in outcome);
}

/**
 * Le refus commun aux deux pipelines à références.
 *
 * Construit ici et non dans chacun : deux formulations pour le même refus, ce sont deux
 * écrans qui ne disent pas la même chose de la même cause.
 */
export function unsupportedSpecRefusal(
  encounterId: number,
  encounter: string,
  specId: number
): BossRefusal {
  const info = getSpecInfo(specId);
  return {
    refused: 'unsupported-spec',
    encounter,
    encounterId,
    specId,
    specLabel: info ? specLabel(info) : null,
  };
}
