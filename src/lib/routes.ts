import type { AnalysisInput } from '@/types';

/**
 * La forme des URL, écrite une fois.
 *
 * Frontière : **le chemin dit qui est analysé, la query dit comment on le regarde.**
 * Le chemin est stable — c'est lui que la carte de partage nomme, et lui qu'on colle
 * dans un Discord. La query change à chaque clic (palier, boss, onglet) et s'écrit
 * en `replace` quand elle ne mérite pas une entrée d'historique.
 *
 * `difficulty` et `boss` restent en query alors qu'ils identifient le résultat aussi
 * sûrement que le personnage : en segment, chaque bascule remonterait le composant et
 * viderait le `cacheRef` par palier d'`useAnalysis`, qui est ce qui rend le retour
 * Héroïque → Mythique instantané.
 */

export const HOME_PATH = '/';
export const CHARACTER_FORM_PATH = '/character';
export const REPORT_FORM_PATH = '/report';
export const RAID_FORM_PATH = '/raid';
export const PULL_FORM_PATH = '/pull';

/**
 * Les onglets du panneau de résultat. Ils sont dans l'URL parce qu'un lien collé pour montrer
 * un écart doit ouvrir sur l'onglet Comparison, pas sur l'aperçu.
 *
 * `ai-report` et `chat` en font partie sans danger : ni l'un ni l'autre ne lance quoi que ce
 * soit au montage — ils attendent un clic. Ouvrir un lien sur ces onglets ne dépense rien.
 */
export type TabId = 'overview' | 'comparison' | 'ai-report' | 'chat';

/** Ce qui voyage en query sur les deux routes de résultat. */
export interface ResultQuery {
  difficulty?: number;
  zone?: number;
  spec?: number;
  boss?: number;
  tab?: TabId;
  /**
   * `shared=1` marque un lien collé depuis ailleurs, et vaut préférence pour
   * l'instantané plutôt qu'une salve WCL neuve. Ce n'est pas une frontière de
   * sécurité : la session reste exigée côté route.
   */
  shared?: boolean;
}

export interface CharacterRoute {
  // La région est fermée, pas une chaîne libre : elle sort de `parseRegion`, qui refuse ce
  // qui n'est pas une région WCL. Un `string` ici obligerait chaque appelant à revalider.
  region: AnalysisInput['region'];
  realm: string;
  name: string;
}

export interface ReportRoute {
  code: string;
  actorId: number;
}

function queryString(query: ResultQuery | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  if (query.difficulty !== undefined) params.set('difficulty', String(query.difficulty));
  if (query.zone !== undefined) params.set('zone', String(query.zone));
  if (query.spec !== undefined) params.set('spec', String(query.spec));
  if (query.boss !== undefined) params.set('boss', String(query.boss));
  if (query.tab !== undefined) params.set('tab', query.tab);
  if (query.shared) params.set('shared', '1');
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Un segment de chemin. `encodeURIComponent` laisse passer l'apostrophe telle quelle —
 * légale dans un chemin, et fréquente dans les royaumes francophones ("Conseil des Ombres"
 * est déjà en slug, mais un nom de personnage ne l'est pas).
 */
function segment(value: string): string {
  return encodeURIComponent(value);
}

export function characterResultPath(route: CharacterRoute, query?: ResultQuery): string {
  const { region, realm, name } = route;
  return `/character/${segment(region.toLowerCase())}/${segment(realm)}/${segment(name)}${queryString(query)}`;
}

export function reportResultPath(route: ReportRoute, query?: ResultQuery): string {
  return `/report/${segment(route.code)}/${route.actorId}${queryString(query)}`;
}

/**
 * Réécrit un chemin en conservant la query courante, patch appliqué.
 * `null` supprime la clé — c'est le cas de `boss`, qui ne survit pas à un changement
 * de personnage, d'acteur ou de palier : l'index d'un boss ne veut rien dire ailleurs.
 */
export function withPatchedQuery(
  path: string,
  current: URLSearchParams | string,
  patch: Record<string, string | number | null>
): string {
  const params = new URLSearchParams(typeof current === 'string' ? current : current.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) params.delete(key);
    else params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `${path}?${s}` : path;
}

const REGIONS: readonly AnalysisInput['region'][] = ['US', 'EU', 'KR', 'TW', 'CN'];

export function parseRegion(value: string | undefined | null): AnalysisInput['region'] | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return (REGIONS as readonly string[]).includes(upper) ? (upper as AnalysisInput['region']) : null;
}

export function parseDifficulty(value: string | null | undefined): AnalysisInput['difficulty'] {
  const n = Number(value);
  return n === 3 || n === 4 || n === 5 ? n : 4;
}

const TABS: readonly TabId[] = ['overview', 'comparison', 'ai-report', 'chat'];

export function parseTab(value: string | null | undefined): TabId {
  return (TABS as readonly string[]).includes(value ?? '') ? (value as TabId) : 'overview';
}

/**
 * Les segments d'une route de personnage, décodés et validés.
 * `null` quand la région n'en est pas une : la page rend un 404 plutôt que de lancer
 * une analyse sur une région inventée.
 */
export function parseCharacterRoute(segments: {
  region: string;
  realm: string;
  name: string;
}): CharacterRoute | null {
  const region = parseRegion(decodeURIComponent(segments.region));
  if (!region) return null;
  const realm = decodeURIComponent(segments.realm);
  const name = decodeURIComponent(segments.name);
  if (!realm || !name) return null;
  return { region, realm, name };
}

export function parseReportRoute(segments: { code: string; actor: string }): ReportRoute | null {
  const code = decodeURIComponent(segments.code);
  const actorId = Number(segments.actor);
  if (!code || !Number.isInteger(actorId) || actorId <= 0) return null;
  return { code, actorId };
}

type QueryValues = Record<string, string | string[] | undefined>;

/**
 * La première valeur d'un paramètre de query côté serveur, où `?boss=1&boss=2` arrive en
 * tableau. Toutes nos clés sont scalaires : un doublon est une URL bricolée, on garde la
 * première plutôt que d'échouer.
 */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const first = firstParam;

/**
 * L'ancienne forme d'URL, où tout l'écran tenait dans la query de la racine, traduite vers
 * la nouvelle. `null` quand la racine est simplement la racine.
 *
 * Ces liens ont été partagés avant que les résultats aient un chemin : ils doivent continuer
 * d'ouvrir ce qu'ils ouvraient. La traduction est permanente, pas transitoire — une URL est
 * un contrat, et rien ne garantit qu'un lien collé dans un Discord de guilde soit recliqué
 * dans le mois. La région manquante vaut `EU`, le défaut qu'appliquait l'ancien lecteur.
 */
export function legacyResultPath(params: QueryValues): string | null {
  const query: ResultQuery = {
    difficulty: Number(first(params.difficulty)) || undefined,
    zone: Number(first(params.zone)) || undefined,
    spec: Number(first(params.spec)) || undefined,
    boss: Number(first(params.boss)) || undefined,
    shared: first(params.shared) === '1' || undefined,
  };

  const code = first(params.report);
  const actor = Number(first(params.actor));
  if (code && Number.isInteger(actor) && actor > 0) {
    return reportResultPath({ code, actorId: actor }, query);
  }

  const name = first(params.char);
  const realm = first(params.server);
  if (name && realm) {
    const region = parseRegion(first(params.region)) ?? 'EU';
    return characterResultPath({ region, realm, name }, query);
  }

  return null;
}
