/**
 * Étape 8 du plan de retours : « donner au modèle le log pur du combat — quels sorts, à quel
 * moment ». L'étape prévient elle-même que la faible dépense de `Q_CAST_EVENTS` tient au
 * `limit` — la première page *est* l'ouverture, il n'y a pas de pagination — et qu'un combat
 * entier renonce à cet argument. Reste à savoir ce que « renoncer » coûte réellement.
 *
 * Trois questions, et une seule décide :
 *
 * Q1 — **Un combat entier tient-il en une page ?** Si `limit` suffit à couvrir la pull, la
 *      capture reste une requête et l'argument de l'étape ne porte que sur les octets ; s'il
 *      faut paginer, chaque page est une requête WCL de plus, par référence comprise.
 * Q2 — **Que pèse la timeline compressée ?** À comparer au relevé du 2026-08-28
 *      (`PLAN_CONTEXTE_CLASSES.md`) : ~9 400 jetons d'entrée neuve par rapport. Trois
 *      compressions sont mesurées, de la plus verbeuse à la plus dense.
 * Q3 — **Le côté références triple-t-il la note ?** Le prompt lit trois références ; si leurs
 *      timelines entraient aussi, c'est ×4 qu'il faudrait payer. C'est le chiffre qui rend
 *      concrète la recommandation ferme de l'étape : n'envoyer que l'écart déjà calculé.
 *
 * Usage: node scripts/probe-cast-timeline.ts [code] [fightId] [sourceId]
 * Requires: WCL_CLIENT_ID et WCL_CLIENT_SECRET dans .env.local
 */
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

process.loadEnvFile(resolve(process.cwd(), '.env.local'));

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

/** Le relevé du 2026-08-28 : entrée neuve d'un rapport, hors timeline. */
const BASELINE_PROMPT_TOKENS = 9400;

/** Ce que la production capture aujourd'hui (`OPENING_EVENT_LIMIT`). */
const CURRENT_LIMIT = 40;

type Json = Record<string, unknown>;

interface CastEvent {
  timestamp: number;
  type: string;
  abilityGameID?: number;
  ability?: { name?: string; guid?: number };
}

async function getToken(): Promise<string> {
  const id = process.env.WCL_CLIENT_ID;
  const secret = process.env.WCL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('WCL_CLIENT_ID / WCL_CLIENT_SECRET absents de .env.local');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Warcraft Logs n'a pas rendu de jeton");
  return json.access_token;
}

async function gql<T>(token: string, query: string, variables: Json): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(`WCL: ${body.errors[0].message}`);
  return body.data as T;
}

const Q_ZONES = `query { worldData { zones { id name encounters { id name } } } }`;

const Q_TOP_LOG = `
  query($encounterID: Int!) {
    worldData {
      encounter(id: $encounterID) {
        characterRankings(metric: dps, difficulty: 5, leaderboard: LogsOnly, page: 1)
      }
    }
  }`;

const Q_FIGHTS = `
  query($code: String!) {
    reportData {
      report(code: $code) {
        title
        fights(killType: Encounters) { id name encounterID startTime endTime }
      }
    }
  }`;

const Q_COMBATANT = `
  query($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) { events(dataType: CombatantInfo, fightIDs: $fightIDs) { data } }
    }
  }`;

const Q_CASTS_TABLE = `
  query($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
    reportData {
      report(code: $code) {
        casts: table(dataType: Casts, fightIDs: $fightIDs, sourceID: $sourceID)
      }
    }
  }`;

/**
 * `Q_CAST_EVENTS` de la production, plus `nextPageTimestamp` — c'est ce champ, que la
 * requête de production ne demande pas, qui répond à Q1.
 */
const Q_CAST_EVENTS_PAGED = `
  query($code: String!, $fightIDs: [Int]!, $sourceID: Int!, $limit: Int!, $startTime: Float) {
    reportData {
      report(code: $code) {
        events(
          dataType: Casts
          fightIDs: $fightIDs
          sourceID: $sourceID
          limit: $limit
          startTime: $startTime
        ) { data nextPageTimestamp }
      }
    }
  }`;

interface EventPage {
  reportData: {
    report: { events: { data: CastEvent[]; nextPageTimestamp: number | null } | null } | null;
  };
}

/** Toutes les pages jusqu'à la fin du combat, et combien de requêtes il a fallu. */
async function fetchAllCasts(
  token: string,
  vars: { code: string; fightIDs: number[]; sourceID: number },
  limit: number
): Promise<{ events: CastEvent[]; pages: number }> {
  const events: CastEvent[] = [];
  let startTime: number | undefined;
  let pages = 0;

  for (;;) {
    const page = await gql<EventPage>(token, Q_CAST_EVENTS_PAGED, { ...vars, limit, startTime });
    pages++;
    const block = page.reportData.report?.events;
    events.push(...(block?.data ?? []));
    const next = block?.nextPageTimestamp ?? null;
    if (next === null) return { events, pages };
    startTime = next;
    if (pages >= 20) throw new Error('Plus de 20 pages : la borne du sondage est atteinte.');
  }
}

/** Le nom d'un cast, en repli sur la table des casts comme le fait `parseOpening`. */
function nameOf(event: CastEvent, names: Map<number, string>): string {
  const guid = event.abilityGameID ?? event.ability?.guid ?? 0;
  return event.ability?.name ?? names.get(guid) ?? `#${guid}`;
}

interface Cast {
  name: string;
  offsetMs: number;
}

/** A — une ligne par cast, la forme la plus verbeuse. */
function renderFlat(casts: Cast[]): string {
  return casts.map((c) => `${(c.offsetMs / 1000).toFixed(1)}s ${c.name}`).join('\n');
}

/** B — les répétitions consécutives repliées en séries. */
function renderRuns(casts: Cast[]): string {
  const lines: string[] = [];
  for (const cast of casts) {
    const last = lines.length - 1;
    const head = `${(cast.offsetMs / 1000).toFixed(1)}s ${cast.name}`;
    const prev = lines[last];
    if (prev?.endsWith(` ${cast.name}`) || /^\d+\.\d+s .* ×\d+$/.test(prev ?? '')) {
      const prevName = prev.replace(/ ×\d+$/, '').replace(/^\d+\.\d+s /, '');
      if (prevName === cast.name) {
        const n = Number(/ ×(\d+)$/.exec(prev)?.[1] ?? '1') + 1;
        lines[last] = `${prev.replace(/ ×\d+$/, '')} ×${n}`;
        continue;
      }
    }
    lines.push(head);
  }
  return lines.join('\n');
}

/** C — une ligne par fenêtre de 10 s, les sorts dans l'ordre, répétitions comptées. */
function renderWindows(casts: Cast[], windowMs = 10_000): string {
  const buckets = new Map<number, string[]>();
  for (const cast of casts) {
    const bucket = Math.floor(cast.offsetMs / windowMs);
    const list = buckets.get(bucket) ?? [];
    const last = list.length - 1;
    const prevName = list[last]?.replace(/×\d+$/, '');
    if (prevName === cast.name) {
      const n = Number(/×(\d+)$/.exec(list[last])?.[1] ?? '1') + 1;
      list[last] = `${cast.name}×${n}`;
    } else {
      list.push(cast.name);
    }
    buckets.set(bucket, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([b, list]) => `${b * (windowMs / 1000)}s: ${list.join(', ')}`)
    .join('\n');
}

/**
 * Une estimation, et elle est annoncée comme telle : le compteur de jetons d'Anthropic
 * demande une clé d'API, que le dépôt n'a pas (voir le « non vérifié » de l'étape 7). Le
 * ratio 3,6 caractères par jeton est celui d'un texte anglais dense en ponctuation et en
 * chiffres — il majore un peu le compte réel sur des noms de sorts répétés.
 */
function estTokens(text: string): number {
  return Math.round(text.length / 3.6);
}

function measure(label: string, text: string, refCount: number) {
  const tokens = estTokens(text);
  const lines = text ? text.split('\n').length : 0;
  console.log(
    `  ${label.padEnd(22)} ${String(lines).padStart(4)} lignes  ` +
      `${String(text.length).padStart(6)} car.  ~${String(tokens).padStart(5)} jetons est.  ` +
      `sujet seul +${((tokens / BASELINE_PROMPT_TOKENS) * 100).toFixed(0)} %  ` +
      `avec ${refCount} réf. +${(((tokens * (refCount + 1)) / BASELINE_PROMPT_TOKENS) * 100).toFixed(0)} %`
  );
}

async function resolveCode(token: string): Promise<string> {
  const zones = await gql<{
    worldData: { zones: { id: number; name: string; encounters: { id: number; name: string }[] }[] };
  }>(token, Q_ZONES, {});

  const candidates = [...zones.worldData.zones]
    .filter((z) => (z.encounters?.length ?? 0) >= 6)
    .sort((a, b) => b.id - a.id)
    .slice(0, 8);

  for (const zone of candidates) {
    for (const encounter of zone.encounters.slice(0, 2)) {
      const ranks = await gql<{
        worldData: {
          encounter: { characterRankings: { rankings?: { report?: { code?: string } }[] } } | null;
        };
      }>(token, Q_TOP_LOG, { encounterID: encounter.id }).catch(() => null);
      const code = ranks?.worldData.encounter?.characterRankings?.rankings?.find(
        (r) => r.report?.code
      )?.report?.code;
      if (code) {
        console.log(`Rapport résolu depuis « ${zone.name} / ${encounter.name} » : ${code}`);
        return code;
      }
    }
  }
  throw new Error('Aucun rapport classé trouvé ; passe un code de rapport en argument.');
}

async function main() {
  const token = await getToken();
  const code = process.argv[2] ?? (await resolveCode(token));
  const wanted = process.argv[3] ? Number(process.argv[3]) : null;

  const meta = await gql<{
    reportData: {
      report: {
        title: string;
        fights: { id: number; name: string; startTime: number; endTime: number }[];
      } | null;
    };
  }>(token, Q_FIGHTS, { code });
  const fights = meta.reportData.report?.fights ?? [];
  const fight = wanted ? fights.find((f) => f.id === wanted) : fights[0];
  if (!fight) throw new Error(`Rapport ${code} sans combat exploitable.`);
  const fightMs = fight.endTime - fight.startTime;
  console.log(
    `Combat : ${fight.name} (#${fight.id}) — ${(fightMs / 1000).toFixed(0)} s — ${meta.reportData.report?.title}`
  );

  const combatants = await gql<{
    reportData: { report: { events: { data: Json[] } | null } | null };
  }>(token, Q_COMBATANT, { code, fightIDs: [fight.id] });
  const roster = (combatants.reportData.report?.events?.data ?? []).filter(
    (r) => typeof r.sourceID === 'number'
  );
  console.log(
    `Roster : ${roster.map((r) => `${r.sourceID}/${(r.specID as number) ?? '?'}`).join(' ')}`
  );
  const asked = process.argv[4] ? Number(process.argv[4]) : null;
  const sourceID = (asked ?? (roster[0]?.sourceID as number | undefined)) as number | undefined;
  if (sourceID === undefined) throw new Error('Aucun combattant sur ce combat.');
  console.log(`Acteur : sourceID ${sourceID}`);

  const vars = { code, fightIDs: [fight.id], sourceID };

  const table = await gql<{ reportData: { report: { casts: unknown } | null } }>(
    token,
    Q_CASTS_TABLE,
    vars
  );
  const names = new Map<number, string>();
  const entries =
    ((table.reportData.report?.casts as { data?: { entries?: { guid: number; name: string }[] } })
      ?.data?.entries ?? []);
  for (const entry of entries) names.set(entry.guid, entry.name);

  // Q1 — le combat entier, page par page, contre ce que la production capture aujourd'hui.
  console.log('\n=== Q1 — pagination ===');
  for (const limit of [CURRENT_LIMIT, 300, 1000, 10_000]) {
    const { events, pages } = await fetchAllCasts(token, vars, limit);
    const casts = events.filter((e) => e.type === 'cast');
    console.log(
      `  limit ${String(limit).padStart(5)} → ${String(pages).padStart(2)} requête(s), ` +
        `${String(events.length).padStart(4)} événements, ${String(casts.length).padStart(4)} casts`
    );
  }

  const { events } = await fetchAllCasts(token, vars, 10_000);
  const raw = events.filter((e) => e.type === 'cast');
  if (raw.length === 0) throw new Error('Aucun cast sur ce combat.');
  const start = raw[0].timestamp;
  const casts: Cast[] = raw.map((e) => ({ name: nameOf(e, names), offsetMs: e.timestamp - start }));
  const distinct = new Set(casts.map((c) => c.name));
  console.log(
    `\n  Combat entier : ${casts.length} casts, ${distinct.size} sorts distincts, ` +
      `${(casts.length / (fightMs / 60_000)).toFixed(1)} casts/min`
  );

  // Le dépôt de la chaîne réelle : la mesure avant/après du prompt la relit hors ligne,
  // pour ne pas repayer une requête WCL à chaque exécution.
  const dump = process.env.CAST_DUMP;
  if (dump) {
    writeFileSync(dump, JSON.stringify({ code, fightId: fight.id, sourceID, fightMs, casts }));
    console.log(`
  Chaîne écrite dans ${dump}`);
  }

  // Q2 et Q3 — le poids des trois compressions, sujet seul puis avec les trois références.
  console.log(`\n=== Q2 / Q3 — poids contre ${BASELINE_PROMPT_TOKENS} jetons d'entrée neuve ===`);
  measure('A — un cast/ligne', renderFlat(casts), 3);
  measure('B — séries repliées', renderRuns(casts), 3);
  measure('C — fenêtres de 10 s', renderWindows(casts), 3);

  console.log("\n  Pour mémoire, l'ouverture seule telle qu'elle entre aujourd'hui :");
  measure('  12 casts', renderFlat(casts.slice(0, 12)), 3);

  console.log('\n--- Extrait de C, 8 premières lignes ---');
  console.log(renderWindows(casts).split('\n').slice(0, 8).join('\n'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
