/**
 * Ce qu'une réponse d'API en échec dit au client — le délai compris.
 *
 * Six hooks recopiaient la même lecture : corps JSON, champ `error`, repli sur le code HTTP.
 * Tous jetaient la même chose au passage, l'en-tête `Retry-After`. `wcl-guard` calcule
 * pourtant le délai exact jusqu'à la prochaine fenêtre de quota et le pose sur son 429 :
 * le serveur disait « dans 14 minutes », l'écran affichait « réessayez ». Un refus sans
 * échéance se lit comme une panne, et l'utilisateur relance — ce qui est précisément ce que
 * le quota cherche à éviter.
 *
 * La lecture est ici en un seul endroit pour que le prochain hook en hérite sans y penser.
 */

/**
 * Le `Retry-After` en clair, ou `null` quand l'en-tête est absent ou illisible.
 *
 * Seule la forme « nombre de secondes » est lue. C'est la seule que nos routes posent, et
 * une date HTTP mal interprétée annoncerait une échéance fausse — pire qu'une échéance tue.
 * L'arrondi se fait vers le haut : revenir un peu trop tard ne coûte rien, revenir trop tôt
 * redonne un 429.
 */
export function retryAfterOf(res: Response): string | null {
  const raw = res.headers.get('Retry-After');
  if (raw === null) return null;

  const seconds = Number(raw.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  if (seconds < 60) {
    const rounded = Math.ceil(seconds);
    return `${rounded} second${rounded > 1 ? 's' : ''}`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

/** Le message à afficher pour une réponse `!res.ok`, échéance comprise quand il y en a une. */
export async function readApiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  const message = body.error ?? `HTTP ${res.status}`;

  const wait = retryAfterOf(res);
  return wait === null ? message : `${message} — retry in ${wait}.`;
}
