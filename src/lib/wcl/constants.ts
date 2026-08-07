export const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
export const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

export const KILL_TIME_TOLERANCE = 0.2;
export const TOP_N = 3;

/** Item levels of difference beyond which a reference stops being instructive. */
export const ILVL_TOLERANCE = 4;

/** Ranking pages fetched in parallel to build the candidate pool — 100 entries each. */
export const CANDIDATE_PAGES = 10;

/**
 * How many of the closest candidates are verified against the eliminatory criteria.
 *
 * Set bonus and externals are only visible once a candidate's fight is fetched, so the
 * window is what the check costs: two queries each, all in parallel. Wide enough that
 * TOP_N survivors normally remain after eliminations, narrow enough that the verification
 * stays one round trip.
 */
export const VERIFICATION_WINDOW = 12;

/**
 * Probabilité qu'un rendu tire une référence hors de la fenêtre de vérification.
 *
 * Sans elle, le corpus ne contient que des candidats que l'heuristique de distance avait
 * déjà approuvés : la classe positive est produite par le sélecteur même qu'un modèle
 * devrait remplacer, et aucun contre-factuel n'existe sur ce qu'elle a écarté. Un modèle
 * entraîné là-dessus ne peut au mieux que réapprendre la règle.
 *
 * 10 % : assez pour que le corpus contienne des candidats lointains, assez rare pour qu'un
 * panel sur dix seulement paie un rang moins proche. Le prix est visible et assumé — la
 * bannière de comparabilité voit la référence explorée comme les autres et le dit.
 */
export const EXPLORATION_RATE = 0.1;

/**
 * Casts kept as the opening chain.
 *
 * Long enough to cover a burst window and the ramp into it, short enough that what follows —
 * where the fight, not the plan, decides the next button — stays out. Beyond it the chain
 * stops being a sequence and becomes a priority list, which the aggregate table already says.
 */
export const OPENING_LENGTH = 12;

/**
 * How many raw cast events are fetched to extract the opening. Larger than
 * `OPENING_LENGTH` because `begincast` events are interleaved and then dropped.
 */
export const OPENING_EVENT_LIMIT = 40;

/**
 * Uptime points of offensive externals a reference may hold over the player before it
 * stops being comparable. An incidental Power Infusion clipped onto a candidate is noise;
 * a full-fight Ebon Might they had and the player did not is a different fight.
 */
export const EXTERNAL_TOLERANCE = 10;
