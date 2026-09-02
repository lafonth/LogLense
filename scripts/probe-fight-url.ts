/**
 * Étape 2 de `PLAN_RETOURS_TEST.md` — le lien produit par `fightUrl` mène-t-il vraiment
 * quelque part ? La sonde prend trois combats de trois rapports différents dans le
 * classement mondial et fabrique l'adresse avec le helper lui-même, jamais une copie.
 *
 * Ce qu'un script peut prouver s'arrête à deux choses, et le code dit laquelle est laquelle.
 * Le rendu de la page, lui, se regarde dans un navigateur : `/reports/*` est derrière un
 * filtre anti-robot qui rend 403 à tout client scripté (contrôle mesuré le 2026-09-02 : un
 * chemin inconnu rend 404, un code de rapport inexistant rend 403 comme un vrai).
 *
 * Usage: node scripts/probe-fight-url.ts
 */
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import process from 'node:process';
import { fightUrl } from '../src/lib/wcl/fight-url.ts';

process.loadEnvFile(resolve(process.cwd(), '.env.local'));

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

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

async function gql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(`WCL: ${body.errors[0].message}`);
  if (!body.data) throw new Error('WCL: réponse vide');
  return body.data;
}

const Q_ZONES = `query { worldData { zones { id name encounters { id name } } } }`;

const Q_RANKINGS = `
  query R($encounterID: Int!, $specName: String!, $className: String!) {
    worldData { encounter(id: $encounterID) {
      characterRankings(specName: $specName, className: $className,
        metric: dps, difficulty: 5, leaderboard: LogsOnly, page: 1)
    } }
  }
`;

const Q_FIGHT = `
  query F($code: String!, $id: Int!) {
    reportData { report(code: $code) { title fights(fightIDs: [$id]) { id name } } }
  }
`;

interface Zone {
  id: number;
  name: string;
  encounters: { id: number; name: string }[];
}
interface Ranking {
  name: string;
  report: { code: string; fightID: number };
}

const token = await getToken();

const zones = await gql<{ worldData: { zones: Zone[] } }>(token, Q_ZONES, {});
// Le catalogue mêle raids, donjons et delves, sans ordre garanti : on garde les paliers de
// raid et on prend l'id le plus haut, c'est-à-dire le plus récent.
const raids = zones.worldData.zones.filter(
  (z) => z.encounters?.length >= 6 && !/mythic\+|delves|challenge/i.test(z.name)
);
const zone = raids.reduce((a, b) => (b.id > a.id ? b : a));
if (!zone) throw new Error('aucune zone avec rencontres');
console.log(`Zone : ${zone.name} (${zone.id}) — ${zone.encounters.length} rencontres`);

const seen = new Map<string, Ranking>();
for (const enc of zone.encounters) {
  if (seen.size >= 3) break;
  const data = await gql<{ worldData: { encounter: { characterRankings: { rankings: Ranking[] } } } }>(
    token,
    Q_RANKINGS,
    { encounterID: enc.id, specName: 'Fire', className: 'Mage' }
  );
  const rankings = data.worldData.encounter?.characterRankings?.rankings ?? [];
  for (const r of rankings) {
    if (r.report?.code && !seen.has(r.report.code)) {
      seen.set(r.report.code, r);
      console.log(`  ${enc.name} → ${r.name} (${r.report.code}#${r.report.fightID})`);
      break;
    }
  }
}

if (seen.size < 3) throw new Error(`seulement ${seen.size} rapport(s) distincts trouvés`);

let ok = 0;
for (const r of seen.values()) {
  const url = fightUrl(r.report.code, r.report.fightID);
  if (!url) {
    console.log(`Refusé par fightUrl : ${r.report.code}#${r.report.fightID}`);
    continue;
  }

  // Deux moitiés de l'adresse, deux preuves.
  //
  // La cible : `#fight=…` ne quitte jamais le navigateur, donc aucun GET ne peut prouver que
  // le combat existe. L'API le peut — si le rapport rend un combat portant cet id et ce nom
  // de boss, l'ancre a quelque chose à ouvrir.
  const check = await gql<{
    reportData: { report: { title: string; fights: { id: number; name: string }[] } | null };
  }>(token, Q_FIGHT, { code: r.report.code, id: r.report.fightID });
  const fight = check.reportData.report?.fights?.[0];

  // L'hôte : la page publique est derrière un filtre anti-robot qui rend 403 à tout client
  // scripté, UA de navigateur compris. Un 403 prouve quand même que l'hôte et le chemin sont
  // servis — un domaine ou un préfixe faux rendrait une erreur DNS ou un 404.
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  const served = res.status !== 404;

  console.log(
    `${fight ? `combat ${fight.id} « ${fight.name} » dans « ${check.reportData.report?.title} »` : 'COMBAT INTROUVABLE'} | HTTP ${res.status}${served ? '' : ' (CHEMIN INCONNU)'}
  ${url}`
  );
  if (fight && fight.id === r.report.fightID && served) ok += 1;
}

console.log(`
${ok}/3 combats vérifiés`);
