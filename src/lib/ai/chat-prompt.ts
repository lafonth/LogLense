import type { AnalysisResult, BossResult, TalentNode } from '@/types';

import { buildBossContext, SCOPE_RULE, TRACEABILITY_RULE } from './prompt';

/**
 * Le prompt système du chat : les mêmes règles que le rapport, une tout autre tâche.
 *
 * Le rapport rédige six points sur commande ; le chat répond à une question posée, et peut
 * changer la cohorte à laquelle le joueur se compare. Ce qui est commun — la traçabilité et
 * le périmètre — est importé de `prompt.ts` plutôt que recopié : deux copies dériveraient, et
 * le périmètre du produit finirait par dépendre de la porte empruntée.
 *
 * Ce fichier ne dit rien des outils qu'il ne pourrait pas tenir : la discipline de dépense
 * n'est pas une consigne de politesse, elle est vérifiée dans `chat-tools.ts`, où un appel
 * sans accord explicite est refusé. Ce qui est écrit ici sert à ce que le modèle demande
 * plutôt qu'à ce qu'il obéisse.
 */

/**
 * Version du prompt de chat, distincte de `PROMPT_VERSION`.
 *
 * Les deux évoluent séparément — une consigne de rapport peut changer sans que le chat bouge —
 * et le corpus doit pouvoir dire lequel des deux a produit un tour donné.
 */
export const CHAT_PROMPT_VERSION = 1;

export const CHAT_SYSTEM_PROMPT = `You are a WarcraftLogs damage coach, answering a player's questions about one boss encounter they have just had analysed. Speak directly to the player, answer the question asked, and stop there — this is a conversation, not a second report.

Two rules govern everything you say.

${TRACEABILITY_RULE}

${SCOPE_RULE}

You have four tools. Use them rather than reasoning around them.

reselect_cohort — the player decides who they are compared to. "Only the four-piece", "only kills under five minutes", "only my item level", "include the ones you threw out": call the tool and read what comes back. Never estimate what a narrower cohort would look like — the distributions are recomputed on the verified pool, and a guessed distribution is an invention. Report the resulting cohort size and comparability level, and say plainly when a filter leaves nobody rather than widening it yourself. The numbers returned by this tool supersede the tables below for the rest of the conversation.

compare_reference — one named reference whose damage and rotation are already fetched, when the player asks how that specific player is doing it.

promote_reference — fetching damage and rotation for a candidate that has none costs up to three Warcraft Logs requests on the player's hourly quota. Never call it with spendApproved true on your own initiative: name the candidate, state the cost, and wait for the player to agree in their next message. Calling it without approval is refused by design and is the way to surface the cost, not a way to trigger the spend.

decline_out_of_scope — survival, defensives, damage taken, interrupts, positioning, boss mechanics. Call the tool instead of answering from memory, however well you know the fight, then tell the player what is measured here.

Cite exact numbers from the tables and the tool results. Where the data is silent, say it is silent.`;

/**
 * Le prompt complet d'une conversation : les consignes, puis les tableaux du boss.
 *
 * Le contexte est reconstruit depuis le seul `BossResult` de l'instantané. Il porte déjà
 * `specId`, `difficulty`, `encounter` et le nom du joueur ; le reste de `AnalysisInput` ne
 * ressort jamais dans la chaîne produite — `serverSlug` vide est le cas normal du chemin
 * rapport, et `region` n'est demandé que par le type.
 *
 * Assemblé une fois par conversation et placé dans le bloc système mis en cache : les
 * tableaux d'un boss pèsent plusieurs milliers de tokens, et un chat les relit à chaque tour.
 */
export function buildChatSystemPrompt(boss: BossResult, talentNodes: TalentNode[] = []): string {
  const result: AnalysisResult = {
    input: {
      characterName: boss.character.stats.name,
      serverSlug: '',
      region: 'EU',
      // Transmise telle quelle : `buildBossContext` sait déjà rendre un palier inconnu, là où
      // le ramener à 5 pour satisfaire le type ferait dire « Mythic » à une analyse qui ne l'est pas.
      difficulty: boss.difficulty as 3 | 4 | 5,
      encounters: [{ id: boss.encounterId, name: boss.encounter }],
      specId: boss.specId,
    },
    bosses: [boss],
    generatedAt: new Date().toISOString(),
  };

  return [CHAT_SYSTEM_PROMPT, '', '---', '', buildBossContext(result, talentNodes)].join('\n');
}
