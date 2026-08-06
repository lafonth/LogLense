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
 * Uptime points of offensive externals a reference may hold over the player before it
 * stops being comparable. An incidental Power Infusion clipped onto a candidate is noise;
 * a full-fight Ebon Might they had and the player did not is a different fight.
 */
export const EXTERNAL_TOLERANCE = 10;
