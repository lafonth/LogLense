/**
 * Ce qu'un rendu IA a réellement coûté en jetons.
 *
 * Troisième genre d'enregistrement, à côté du conseil et du tour de chat, plutôt qu'un champ
 * de plus sur l'un d'eux : les deux autres s'écrivent à un instant où le compte n'existe pas
 * encore. `recordAdvice` part **avant** le flux — délibérément, pour que l'empreinte survive à
 * une connexion coupée — et les jetons ne sont connus qu'à sa fermeture. Plutôt que de
 * déplacer une écriture dont le moment est un invariant, on en ajoute une seconde, jointe par
 * `renderId`. C'est le motif déjà retenu ailleurs dans le corpus : deux enregistrements quand
 * ils ne naissent ni au même moment ni du même côté.
 *
 * Il n'y a rien de libre ici, donc rien à filtrer : quatre entiers, un fournisseur, un modèle.
 *
 * Ce qu'il existe pour répondre : ce que coûte une saison d'un joueur, et combien de cette
 * dépense est la nôtre. Sans lui, le prix du pass se fixe au doigt mouillé — le produit calcule
 * déjà ce relevé à chaque appel et le jette à l'arrivée dans le navigateur.
 */
export interface UsageRecord {
  v: 1;
  kind: 'usage';
  at: string;
  /** SHA-256 salé, jamais l'e-mail. Non nullable : un rendu sans session ne s'écrit pas. */
  by: string;
  /** Joint le relevé à son conseil ou à son tour de chat. La seule clé du corpus. */
  renderId: string;
  /** Les deux surfaces n'ont ni le même coût unitaire ni la même fréquence : un tour de chat
   * outillé consomme jusqu'à cinq appels au modèle, un rapport en consomme un. */
  surface: 'report' | 'chat';
  /** Rang du tour pour le chat, `null` pour le rapport. */
  turn: number | null;
  /**
   * Vrai quand c'est notre clé qui a payé.
   *
   * Sans ce champ le corpus ne répond pas à la seule question pour laquelle il existe : une
   * analyse menée sous la clé du joueur consomme exactement les mêmes jetons et ne nous coûte
   * rien. Les additionner ferait passer un budget d'inférence pour le double de ce qu'il est.
   */
  serverKey: boolean;
  provider: string;
  /** Le modèle réellement servi, `null` quand le fournisseur ne le dit pas. */
  model: string | null;
  /** Entrée facturée, cache compris — la somme des trois termes d'entrée. */
  promptTokens: number;
  /**
   * Part de `promptTokens` relue du cache, facturée un dixième. `null` dit non mesuré : la
   * confondre avec zéro surestimerait la facture d'un ordre de grandeur sur un chat outillé.
   */
  cachedTokens: number | null;
  /** Part écrite dans le cache, facturée un quart de plus. `null` chez qui ne facture pas
   * l'écriture. */
  cacheWriteTokens: number | null;
  completionTokens: number;
}

/** `2026-08-24T09:14:22.000Z` → `labels:usage:2026-08`. Une liste par mois, comme le reste. */
export function usageMonthKey(iso: string): string {
  return `labels:usage:${iso.slice(0, 7)}`;
}
