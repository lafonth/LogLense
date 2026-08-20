import { gql } from './client';
import { Q_FIGHT_CONTEXT } from './queries';

/**
 * Ce qui est arrivé pendant la pull, par opposition à ce que le joueur y a fait.
 *
 * Le modèle de domaine ne portait jusqu'ici que la seconde moitié : des dégâts, une
 * rotation, des talents. Un DPS mesuré sur un raid qui perd trois joueurs à mi-combat et
 * un DPS mesuré sur un kill propre ne sont pas le même nombre, et rien ne permettait de
 * les distinguer après coup. C'est la capture, pas le calcul, qui manquait — et une pull
 * non capturée ne se retrouve pas.
 */
export interface FightContext {
  /** Morts côté raid dans la pull. Le sujet compris s'il est du nombre. */
  deaths: number;
  /**
   * Vrai si le sujet lui-même est mort. Distinct de `deaths > 0` : mourir soi-même ampute
   * son propre DPS, voir mourir les autres allonge le combat.
   */
  subjectDied: boolean;
  /** Ms écoulées depuis le début du combat avant la mort du sujet ; `null` s'il survit. */
  subjectDeathMs: number | null;
  /**
   * Pulls perdues sur ce boss, à cette difficulté, avant celle-ci — **dans ce rapport
   * seulement**. Un raid qui étale sa progression sur plusieurs soirs compte donc bas, et
   * `null` dit que la liste des pulls n'a pas pu être lue, ce qui n'est pas zéro.
   */
  wipesBefore: number | null;
}

/** Une mort telle que la table `Deaths` la rend. Le reste des champs ne nous sert pas. */
interface DeathEntry {
  id?: number;
  deathTime?: number;
  timestamp?: number;
}

interface ContextFight {
  id: number;
  kill: boolean;
  startTime: number;
  difficulty: number;
}

interface FightContextResponse {
  reportData: {
    report: {
      // `table` est un scalaire JSON côté WCL : sa forme se vérifie ici, pas au typage.
      deaths?: unknown;
      fights?: ContextFight[] | null;
    } | null;
  } | null;
}

export interface FightContextArgs {
  code: string;
  fightId: number;
  encounterId: number;
  difficulty: number;
  /** `sourceID` du sujet, celui que la table des morts nomme `id`. */
  actorId: number;
}

/**
 * Les entrées de la table des morts, quelle que soit la forme rendue.
 *
 * Forme observée sur données réelles — sonde `scripts/probe-fight-tables-batch.ts` (e00c944),
 * qui lit cette table et en rend le compte : `{ data: { entries: [...] } }`. Les deux autres
 * branches n'ont jamais été vues. Elles restent parce qu'elles coûtent six lignes et qu'une
 * forme mal devinée ferait disparaître toutes les morts d'un rendu sans lever d'erreur — le
 * seul défaut que le corpus ne rattrape jamais.
 */
function deathEntries(deaths: unknown): DeathEntry[] {
  if (Array.isArray(deaths)) return deaths as DeathEntry[];
  if (deaths && typeof deaths === 'object') {
    const data = (deaths as { data?: unknown }).data;
    if (Array.isArray(data)) return data as DeathEntry[];
    if (data && typeof data === 'object') {
      const entries = (data as { entries?: unknown }).entries;
      if (Array.isArray(entries)) return entries as DeathEntry[];
    }
  }
  return [];
}

/**
 * L'instant de mort ramené au début du combat.
 *
 * L'horodatage de la table est celui du rapport, pas du combat. Mais une valeur déjà
 * relative est plus petite que le départ du combat : la soustraire donnerait un négatif,
 * qu'on ne peut pas distinguer d'une donnée absente. On la garde telle quelle dans ce cas.
 *
 * **Non vérifié** : que `deathTime` soit bien absolu. Les deux lectures sont traitées faute
 * d'une observation, et une seule suffirait à trancher — `scripts/probe-fight-tables-batch.ts`
 * demande déjà cette table sur des données réelles ; y comparer `deathTime` au `startTime` du
 * combat répondrait. Tant que ce n'est pas fait, la branche de repli n'est pas de la prudence,
 * c'est une ignorance assumée.
 */
function relativeDeathMs(raw: number | undefined, fightStart: number | null): number | null {
  if (raw === undefined || !Number.isFinite(raw)) return null;
  if (fightStart !== null && raw >= fightStart) return raw - fightStart;
  return raw >= 0 ? raw : null;
}

export function parseFightContext(
  response: FightContextResponse,
  args: FightContextArgs
): FightContext {
  const report = response.reportData?.report ?? null;
  const fights = report?.fights ?? null;

  const thisFight = fights?.find((f) => f.id === args.fightId) ?? null;

  // Sans la liste des pulls, on ne sait pas si le raid a wipé : `null`, pas zéro. Zéro se
  // lirait « kill du premier coup », ce qui est une affirmation qu'on n'a pas.
  const wipesBefore =
    fights && thisFight
      ? fights.filter(
          (f) => !f.kill && f.difficulty === args.difficulty && f.startTime < thisFight.startTime
        ).length
      : null;

  const entries = deathEntries(report?.deaths);
  const mine = entries.find((e) => e.id === args.actorId);

  return {
    deaths: entries.length,
    subjectDied: mine !== undefined,
    subjectDeathMs: mine
      ? relativeDeathMs(mine.deathTime ?? mine.timestamp, thisFight?.startTime ?? null)
      : null,
    wipesBefore,
  };
}

/**
 * Échoue en douceur : le contexte enrichit un rapport, il ne le conditionne pas. Une pull
 * dont les morts sont illisibles doit produire un rapport sans contexte, pas une erreur —
 * le reste de l'analyse, lui, a déjà été payé.
 */
export async function fetchFightContext(
  token: string,
  args: FightContextArgs
): Promise<FightContext | null> {
  try {
    const data = await gql<FightContextResponse>(token, Q_FIGHT_CONTEXT, {
      code: args.code,
      fightIDs: [args.fightId],
      encounterID: args.encounterId,
    });
    return parseFightContext(data, args);
  } catch {
    return null;
  }
}
