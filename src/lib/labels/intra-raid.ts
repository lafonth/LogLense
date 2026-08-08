import type { DisqualificationReason, IntraRaidMeasured } from '@/lib/wcl/eligibility';
import type { RaidRanking, RankedRaider } from '@/lib/wcl/raid-ranking';
import { comparePiecesWithinPull } from '@/lib/wcl/eligibility';

/**
 * La classe positive de haute confiance du corpus.
 *
 * Deux joueurs de la même spec dans la même pull ont la comparabilité résolue par
 * construction : même kill time, même composition, mêmes buffs de groupe. C'est le verdict
 * le plus solide que le produit sache produire, et il est distinct des positives implicites
 * déjà capturées — celles-là viennent d'une heuristique de distance, celle-ci d'un fait.
 *
 * Pointeurs seuls : `code`, `fightID`, `actorId`. Aucun nom de tiers n'entre au corpus.
 */
export interface IntraRaidSide {
  actorId: number;
  dps: number;
  percentile: number | null;
  tierPieces: number | null;
}

export interface IntraRaidPositive {
  v: 1;
  kind: 'intra-raid';
  at: string;
  by: string | null;
  encounterId: number;
  difficulty: number | null;
  specId: number;
  fight: { code: string; fightID: number };
  /** Celui des deux qui a le plus de marge — le plus bas sur l'axe du classement. */
  subject: IntraRaidSide;
  reference: IntraRaidSide;
  /** Ce qui a réellement été mesuré : les externals n'y sont pas, et ne sont pas supposés. */
  measured: IntraRaidMeasured;
  disqualifiedBy: DisqualificationReason[];
  killTimeGapPct: 0;
  /** Écart de DPS de la référence au sujet, en points de pourcentage du sujet. */
  dpsGapPct: number;
  confidence: 'high';
}

export function intraRaidMonthKey(iso: string): string {
  return `labels:intra-raid:${iso.slice(0, 7)}`;
}

function sideOf(player: RankedRaider): IntraRaidSide {
  return {
    actorId: player.actorId,
    dps: player.dps,
    percentile: player.percentile,
    tierPieces: player.tierPieces,
  };
}

/**
 * Toutes les paires de même spec d'une pull, sujet = celui qui a le plus de marge.
 *
 * Une spec jouée par un seul joueur ne produit rien : la classe positive vient de la paire,
 * pas du joueur. Une spec inconnue non plus — un couple (classe, spec) que la table ne
 * connaît pas n'est pas une spec sur laquelle un modèle apprendra quoi que ce soit.
 */
export function buildIntraRaidPairs(
  ranking: RaidRanking,
  meta: { by: string | null; at: string }
): IntraRaidPositive[] {
  const bySpec = new Map<number, RankedRaider[]>();
  for (const player of ranking.players) {
    if (player.specId === null) continue;
    const bucket = bySpec.get(player.specId);
    if (bucket) bucket.push(player);
    else bySpec.set(player.specId, [player]);
  }

  const out: IntraRaidPositive[] = [];
  for (const [specId, players] of bySpec) {
    if (players.length < 2) continue;
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        // `players` est déjà trié par marge décroissante : le premier des deux est le sujet.
        const subject = players[i];
        const reference = players[j];
        const verdict = comparePiecesWithinPull(reference.tierPieces, subject.tierPieces);
        out.push({
          v: 1,
          kind: 'intra-raid',
          at: meta.at,
          by: meta.by,
          encounterId: ranking.encounterID,
          difficulty: ranking.difficulty,
          specId,
          fight: { code: ranking.code, fightID: ranking.fightID },
          subject: sideOf(subject),
          reference: sideOf(reference),
          measured: verdict.measured,
          disqualifiedBy: verdict.disqualifiedBy,
          killTimeGapPct: 0,
          dpsGapPct:
            subject.dps > 0
              ? Math.round(((reference.dps - subject.dps) / subject.dps) * 1000) / 10
              : 0,
          confidence: 'high',
        });
      }
    }
  }
  return out;
}
