import type { UsageRecord } from './usage';
import type { UsageData } from '@/lib/ai/provider';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { appendToCorpus } from './corpus';
import { hashUserId } from './identity';
import { usageMonthKey } from './usage';

/**
 * Écrit ce qu'un rendu IA a coûté en jetons.
 *
 * Mêmes invariants que `recordAdvice` et `recordChat` : côté serveur, **attendue** — une
 * promesse laissée en `void` meurt avec la fonction serverless —, **ne jette jamais**, et
 * **échoue fermé sur l'identité**.
 *
 * Appelée dans le `flush` du flux SSE, seul endroit où le compte existe : c'est le dernier
 * instant où une écriture est encore sûre de partir, et le premier où le fournisseur a rendu
 * son relevé.
 *
 * **Ne consomme aucun quota**, contrairement aux deux autres écritures, et c'est délibéré :
 * son frère de `renderId` en a déjà dépensé un pour le même rendu, un second halverait le
 * budget d'exposition sans rien protéger de plus. La dépense chez le fournisseur, elle, est
 * déjà bornée en amont par `consumeAiQuota` — et elle est faite de toute façon au moment où
 * on arrive ici. Refuser de l'écrire ne l'annulerait pas, cela nous rendrait seulement
 * aveugles dessus.
 */
export async function recordUsage(
  renderId: string,
  args: {
    surface: UsageRecord['surface'];
    /** Rang du tour pour le chat, `null` pour le rapport. */
    turn: number | null;
    /** Vrai quand c'est notre clé qui a payé — `!headerKey` côté route. */
    serverKey: boolean;
    provider: string;
    /** Le relevé cumulé du rendu. `null` quand le flux n'a rien facturé : rien à écrire. */
    usage: UsageData | null;
  }
): Promise<void> {
  if (!args.usage) return;

  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.email ?? session?.user?.name ?? '';

    // `hashUserId` jette si le sel manque : rien n'est écrit. Échec fermé, pas oubli.
    const by = userId ? hashUserId(userId) : '';
    if (!by) return;

    const at = new Date().toISOString();

    const record: UsageRecord = {
      v: 1,
      kind: 'usage',
      at,
      by,
      renderId,
      surface: args.surface,
      turn: args.turn,
      serverKey: args.serverKey,
      provider: args.provider,
      // Le modèle que le fournisseur dit avoir servi, pas celui demandé : c'est lui qui a un
      // tarif.
      model: args.usage.model || null,
      promptTokens: args.usage.promptTokens,
      cachedTokens: args.usage.cachedTokens,
      cacheWriteTokens: args.usage.cacheWriteTokens,
      completionTokens: args.usage.completionTokens,
    };

    await appendToCorpus(usageMonthKey(at), JSON.stringify(record));
  } catch {
    // Avalé volontairement : voir l'en-tête.
  }
}
