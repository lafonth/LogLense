/**
 * L'adresse publique d'un combat sur Warcraft Logs.
 *
 * Volontairement séparée de `constants.ts` : `API_URL` et `TOKEN_URL` sont des points
 * d'entrée serveur, jamais rendus à un navigateur. Dériver le lien visible de l'un
 * d'eux ferait dépendre l'interface d'une adresse qui peut changer de version (`/v2/`)
 * sans que la page publique bouge. Le site et l'API partagent un domaine, pas un
 * contrat.
 */
const WCL_SITE_URL = 'https://www.warcraftlogs.com';

/** Un code de rapport WCL : alphanumérique, rien d'autre. */
const REPORT_CODE = /^[a-z0-9]+$/i;

/**
 * L'URL du combat `fightId` du rapport `code`, ou `null` si l'un des deux ne tient pas.
 *
 * Rend `null` plutôt que de lever : l'appelant est un rendu, et un lien manquant vaut
 * mieux qu'un écran qui casse. C'est la même règle que `abilityIconUrl` — la valeur
 * douteuse ne sort pas du module.
 *
 * Le code est validé au lieu d'être encodé : un code n'est jamais qu'alphanumérique, et
 * échapper ce qui ne l'est pas fabriquerait une URL bien formée vers un rapport qui
 * n'existe pas. Mieux vaut ne rien rendre.
 *
 * `actorId` cible le joueur analysé dans la vue WCL. Optionnel, et une valeur aberrante
 * le retire sans emporter le lien : l'adresse reste vraie, seulement moins précise.
 */
export function fightUrl(
  code: string | undefined | null,
  fightId: number | undefined | null,
  actorId?: number | null
): string | null {
  if (!code || !REPORT_CODE.test(code)) return null;
  if (!Number.isInteger(fightId) || (fightId as number) < 1) return null;

  const source = Number.isInteger(actorId) && (actorId as number) > 0 ? `&source=${actorId}` : '';

  return `${WCL_SITE_URL}/reports/${code}#fight=${fightId}${source}`;
}
