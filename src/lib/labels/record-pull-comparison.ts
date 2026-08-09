import type { PullPointer } from '@/lib/wcl/pull-pipeline';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redisAppend } from '@/lib/redis';
import { hasCorpusRoom } from './corpus';
import { hashUserId } from './identity';
import { consumeExposureQuota } from './rate-limit';

/**
 * Une pull comparée, en pointeur seul. Aucun nom de tiers n'entre au corpus (même convention
 * que `IntraRaidPositive`) : ce que capture spec 04 n'est pas le calcul, réhydratable depuis
 * les deux pointeurs, mais le fait qu'un joueur ait choisi de comparer ces deux pulls-là —
 * l'amorce de l'étiquette « le conseil a-t-il fait progresser » (ia-ml-architecture.md §3).
 */
export interface PullComparisonPointer {
  code: string;
  fightID: number;
  actorId: number;
}

export interface PullComparisonCapture {
  v: 1;
  kind: 'pull-comparison';
  at: string;
  by: string | null;
  specId: number;
  before: PullComparisonPointer;
  after: PullComparisonPointer;
}

export function pullComparisonMonthKey(iso: string): string {
  return `labels:pull-comparison:${iso.slice(0, 7)}`;
}

function pointerOf(pull: PullPointer): PullComparisonPointer {
  return { code: pull.code, fightID: pull.fightId, actorId: pull.actorId };
}

/**
 * Même contrat que `recordIntraRaid` : appelée côté serveur et attendue avant la réponse,
 * elle ne jette jamais, et échoue fermé sur l'identité — `hashUserId` jette sans
 * `LABEL_SALT`, l'exception remonte au `catch` et rien n'entre au corpus plutôt qu'un
 * `by: null` menteur.
 */
export async function recordPullComparison(
  before: PullPointer,
  after: PullPointer,
  specId: number
): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.email ?? session?.user?.name ?? '';
    const by: string | null = userId ? hashUserId(userId) : null;

    const at = new Date().toISOString();
    const key = pullComparisonMonthKey(at);
    const atMs = Date.parse(at);

    if (!(await hasCorpusRoom(key))) return;

    if (by) {
      const quota = await consumeExposureQuota(by, atMs);
      if (!quota.allowed) return;
    }

    const item: PullComparisonCapture = {
      v: 1,
      kind: 'pull-comparison',
      at,
      by,
      specId,
      before: pointerOf(before),
      after: pointerOf(after),
    };

    await redisAppend(key, JSON.stringify(item));
  } catch {
    // Avalé volontairement : voir l'en-tête.
  }
}
