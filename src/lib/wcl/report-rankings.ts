import { gql } from './client';
import { Q_REPORT_RANKINGS_BOSSDPS, Q_REPORT_RANKINGS_DPS } from './queries';

/**
 * Une entrée de `report.rankings`. Les noms sont ceux de l'API, et deux d'entre eux
 * trompent :
 *
 * - `rankPercent` est le percentile **du jour**, recalculé contre la population courante —
 *   pas le percentile verrouillé que le joueur cite. Le chemin personnage lit un champ du
 *   même nom qui, lui, est historique. D'où `fetchHistoricalParse`.
 * - `totalParses` est la population **d'aujourd'hui**, pas celle de la partition. Le code
 *   lisait `rankTotalParses`, qui n'existe pas ici : la valeur était toujours `null`.
 */
export interface RankingChar {
  name: string;
  amount: number;
  rankPercent: number;
  bracketData: number;
  totalParses?: number;
  server?: { name?: string; region?: string };
}

/**
 * Une entrée de `data`, soit un combat. `fightID` est le discriminant : sondé le 2026-08-15
 * (`scripts/probe-report-rankings-batch.ts`), il est présent sur chaque entrée et porte bien
 * l'identifiant du combat demandé.
 */
interface RankingsEntry {
  fightID?: number;
  roles: {
    dps?: { characters: RankingChar[] };
    healers?: { characters: RankingChar[] };
    tanks?: { characters: RankingChar[] };
  };
}

interface RankingsPayload {
  data: RankingsEntry[];
}

interface RankingsResponse {
  reportData: { report: { rankings: unknown } };
}

/**
 * L'entrée du combat demandé, **retrouvée par `fightID` et jamais par son index**.
 *
 * La même sonde a montré que l'ordre de `data` n'est pas celui de `fightIDs` : WCL regroupe
 * par partition et par zone, si bien que demander les combats 1, 2, 15, 18 rend 15, 18, 1, 2.
 * Lire `data[0]` marchait tant qu'on ne demandait qu'un combat ; sur un lot, ça attribuerait
 * le parse d'un boss à un autre — silencieusement, puisque les deux entrées ont la même forme.
 */
function entryOf(payload: unknown, fightId: number): RankingsEntry | null {
  const p = payload as RankingsPayload | null;
  return p?.data?.find((e) => e.fightID === fightId) ?? null;
}

/**
 * Le joueur dans l'entrée d'un combat, quel que soit le rôle sous lequel WCL l'a rangé — un
 * heal ou un tank n'apparaît pas dans `dps`.
 */
function findInEntry(entry: RankingsEntry | null, name: string): RankingChar | null {
  if (!entry) return null;
  const { roles } = entry;
  const all = [
    ...(roles.dps?.characters ?? []),
    ...(roles.healers?.characters ?? []),
    ...(roles.tanks?.characters ?? []),
  ];
  return all.find((c) => c.name === name) ?? null;
}

/** Les classements d'un rapport, déjà en vol, interrogeables combat par combat. */
export interface ReportRankings {
  dps: (fightId: number, name: string) => Promise<RankingChar | null>;
  bossDps: (fightId: number, name: string) => Promise<RankingChar | null>;
}

/**
 * Les classements de plusieurs combats d'un même rapport, en deux requêtes au total.
 *
 * `rankings` prend `fightIDs: [Int]!` depuis toujours, mais chaque rencontre partait avec le
 * sien : analyser un rapport de raid entier payait deux requêtes par boss pour une réponse que
 * WCL sait rendre d'un coup. Un combat sans classement est simplement absent de `data` — la
 * recherche rend `null`, et l'appelant retombe sur la table de dégâts comme avant.
 *
 * **Les deux requêtes partent tout de suite**, pas à la première lecture : le DPS du sujet est
 * attendu avant ses données de combat, et une requête paresseuse ne démarrerait qu'une fois la
 * spec résolue — le dédoublonnage rendrait alors en latence ce qu'il gagne en appels.
 */
export function fetchReportRankings(
  token: string,
  code: string,
  fightIDs: number[]
): ReportRankings {
  const dpsQuery = gql<RankingsResponse>(token, Q_REPORT_RANKINGS_DPS, { code, fightIDs });
  const bossQuery = gql<RankingsResponse>(token, Q_REPORT_RANKINGS_BOSSDPS, { code, fightIDs });

  // Les rejets sont relus par les accesseurs, qui attendent bien ces promesses-ci. Sans ce
  // puits, un rapport dont toutes les rencontres abandonnent avant de lire les classements —
  // acteur introuvable, spec inconnue — laisserait une rejection sans destinataire, et Node
  // termine le processus là-dessus.
  dpsQuery.catch(() => {});
  bossQuery.catch(() => {});

  return {
    async dps(fightId, name) {
      const res = await dpsQuery;
      return findInEntry(entryOf(res.reportData.report.rankings, fightId), name);
    },
    async bossDps(fightId, name) {
      const res = await bossQuery;
      return findInEntry(entryOf(res.reportData.report.rankings, fightId), name);
    },
  };
}
