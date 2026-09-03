export const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
export const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

/**
 * Ce qu'une requête WCL a le droit de faire attendre avant d'être abandonnée.
 *
 * Sans borne, une requête qui ne revient jamais tient la route ouverte jusqu'au délai de
 * la plateforme : l'analyse ne rend ni résultat ni erreur. Quinze secondes couvrent
 * largement une table de dégâts sur un combat long.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * La politique de reprise d'une requête WCL.
 *
 * Un 429 est le régime normal quand dix pages de classement partent ensemble, pas une
 * panne : le laisser remonter affichait « boss non analysé » pour un simple ralentissement.
 * Trois tentatives, parce qu'au-delà on ne patiente plus, on insiste — et insister est
 * exactement ce que la clé ne peut pas se permettre.
 */
export const RETRY_POLICY = { attempts: 3, baseDelayMs: 500, maxDelayMs: 8_000 };

export const KILL_TIME_TOLERANCE = 0.2;
export const TOP_N = 3;

/**
 * Part du combat qu'une mort du sujet peut lui coûter avant que sa comparaison cesse
 * d'être défendable — 20 % de la pull restant à courir.
 *
 * La magnitude est celle de `KILL_TIME_TOLERANCE` et vient du même raisonnement : au-delà
 * de ce cinquième, deux logs ne couvrent plus la même fenêtre de dégâts. Constante
 * distincte malgré tout, parce que les deux bougeraient pour des raisons différentes —
 * l'une mesure l'écart entre deux kills, l'autre l'amputation d'un seul.
 */
export const EARLY_DEATH_TOLERANCE = 0.2;

/** Item levels of difference beyond which a reference stops being instructive. */
export const ILVL_TOLERANCE = 4;

/** Ranking pages fetched in parallel to build the candidate pool — 100 entries each. */
export const CANDIDATE_PAGES = 10;

/**
 * Pages tirées **par bracket d'ilvl** quand le vivier est filtré à la source.
 *
 * Trois plutôt que `CANDIDATE_PAGES`, et le compte total y gagne quand même. Un bracket ne
 * fait que 3 ilvl de large : le spike de l'étape 3 a mesuré 100 entrées en page 1 *et* 100 en
 * page 2 dans la même tranche, là où dix pages non filtrées balaient tout l'écart d'ilvl du
 * palier pour n'en rendre qu'une poignée dans la tolérance. À budget de requêtes comparable
 * — `MAX_POOL_BRACKETS` × 3 contre 10 — le vivier obtenu est incomparablement plus proche.
 */
export const PAGES_PER_BRACKET = 3;

/**
 * Brackets d'ilvl au plus interrogés pour un vivier.
 *
 * C'est le budget de requêtes, pas la justesse, qui le fixe : au-delà, filtrer coûterait plus
 * cher que le vivier non filtré. `bracketsCovering` renonce alors au filtre entier plutôt que
 * de rogner la couverture — voir son en-tête.
 */
export const MAX_POOL_BRACKETS = 4;

/**
 * Partitions d'une même saison interrogées au plus pour un vivier.
 *
 * Chaque partition coûte `CANDIDATE_PAGES` requêtes. Une saison en compte trois
 * aujourd'hui, mais rien n'empêche un palier d'en accumuler davantage, et le coût est
 * multiplicatif. On garde les plus récentes : ce sont celles dont l'équipement ressemble
 * le plus à celui du joueur.
 */
export const MAX_SEASON_PARTITIONS = 4;

/** Durée de vie du cache de partitions. Une liste de partitions bouge quelques fois par palier. */
export const PARTITION_TTL_SECONDS = 24 * 60 * 60;

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
 * Effectif sous lequel un vivier filtré est complété par le vivier non filtré.
 *
 * Égal à `VERIFICATION_WINDOW` par construction, et pas par coïncidence : un vivier qui ne
 * remplit même pas la fenêtre de vérification ne laissera pas `TOP_N` survivants une fois les
 * critères éliminatoires passés. Les filtres à la source resserrent le vivier ; ce plancher
 * est ce qui les empêche de le vider. Le relâchement est reporté — `PoolFilters.relaxed` —
 * parce qu'un vivier élargi en silence n'est plus celui que la bannière décrit.
 */
export const POOL_FLOOR = VERIFICATION_WINDOW;

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
 * How many raw cast events one page of `Q_CAST_EVENTS` asks for.
 *
 * It was 40 — enough for the opening and nothing else. Measured on 2026-09-03
 * (`scripts/probe-cast-timeline.ts`, three actors of a 512 s Mythic kill): a whole fight is
 * 502 to 779 events, and **one** page holds it. Raising the limit therefore buys the entire
 * cast chain for the query the pipeline already pays — no pagination, no second request, for
 * the subject as for each reference.
 *
 * 2000 is a ceiling, not a target: it covers a twelve-minute kill at the highest cast rate
 * measured (84 casts/min, Shadow Priest) and it bounds what a 24 h snapshot can hold. Beyond
 * it the chain comes back truncated and says so, rather than being silently short.
 */
export const CAST_EVENT_LIMIT = 2000;

/**
 * Au-dessus de ce rythme, la place d'un sort dans la séquence n'est plus une décision.
 *
 * Un sort lancé plus d'une fois toutes les 40 secondes est un remplissage : ce qui décide de
 * son instant, c'est ce qui vient d'être lancé, pas un plan. En dessous, c'est un cooldown —
 * son placement est un choix, et c'est le seul endroit où « hors fenêtre » veut dire quelque
 * chose. Le seuil est un rythme et non un compte d'utilisations, pour valoir autant sur un
 * combat de deux minutes que sur un de huit.
 */
export const COOLDOWN_MAX_PER_MIN = 1.5;

/**
 * Combien de références doivent avoir lancé un sort à un rang donné pour que sa fourchette
 * de timing existe.
 *
 * Deux, sur les trois de `TOP_N` : une seule référence n'est pas une fourchette, c'est un
 * exemple. Même doctrine que le plancher de bruit de `findings.ts` — une médiane prise sur
 * trop peu de valeurs fait passer l'échantillonnage pour un constat.
 */
export const MIN_TIMING_REFERENCES = 2;

/**
 * En deçà de cet écart au bord de la fourchette du champ, on se tait.
 *
 * C'est le plancher de bruit de l'axe, celui de `MIN_GAP_DPS_SHARE` transposé au temps. La
 * fourchette absorbe déjà la gigue — elle va du plus tôt au plus tard des références — donc
 * ce seuil se mesure **au-delà** de ce que le champ lui-même étale : cinq secondes de plus
 * que le plus lent d'entre eux, quand le sort a au moins quarante secondes de recharge.
 * En dessous, ce n'est pas une décision de jeu qu'on lit, c'est un temps de réaction.
 */
export const MIN_TIMING_DEVIATION_MS = 5000;

/**
 * Combien de sorts la comparaison de timing rend au plus.
 *
 * Comme `MAX_OPPORTUNITIES`, la borne est la raison d'être de l'axe et non une limite
 * technique : au-delà de cinq lignes, ce n'est plus un constat, c'est le journal du combat —
 * lequel est déjà là, juste au-dessus, sous sa forme compressée.
 */
export const MAX_TIMING_ROWS = 5;

/**
 * Uptime points of offensive externals a reference may hold over the player before it
 * stops being comparable. An incidental Power Infusion clipped onto a candidate is noise;
 * a full-fight Ebon Might they had and the player did not is a different fight.
 */
export const EXTERNAL_TOLERANCE = 10;

/** Targets below this share of total damage are noise, not fight structure. */
export const MIN_TARGET_PCT = 1;
