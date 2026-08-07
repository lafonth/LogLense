/**
 * Vérifie qu'une entrée de `encounterRankings.ranks` porte de quoi bâtir une trajectoire.
 *
 * La tâche 9 repose entièrement sur une hypothèse : le tableau que les deux pipelines
 * récupèrent déjà — et dont ils ne gardent qu'une entrée — contient un **horodatage** par
 * kill. Sans lui il n'y a pas d'axe temporel, et une « trajectoire » ne serait qu'une liste
 * non ordonnée. Ce script imprime les clés brutes d'une entrée plutôt que de les supposer.
 *
 * Usage: npx tsx scripts/probe-trajectory.ts <nom> <serveur> <region> <encounterId> [difficulté]
 * Requires: WCL_CLIENT_ID et WCL_CLIENT_SECRET dans .env.local
 */
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import process from 'node:process';

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

const Q = `
  query($name: String!, $server: String!, $region: String!, $encounterId: Int!, $difficulty: Int!) {
    characterData {
      character(name: $name, serverSlug: $server, serverRegion: $region) {
        encounterRankings(encounterID: $encounterId, difficulty: $difficulty, metric: dps)
      }
    }
  }`;

async function main() {
  const [name, server, region, encounterRaw, difficultyRaw] = process.argv.slice(2);
  if (!name || !server || !region || !encounterRaw) {
    console.error(
      'Usage: npx tsx scripts/probe-trajectory.ts <nom> <serveur> <region> <encounterId> [difficulté]'
    );
    process.exit(1);
  }

  const token = await getToken();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: Q,
      variables: {
        name,
        server,
        region,
        encounterId: Number(encounterRaw),
        difficulty: Number(difficultyRaw ?? 5),
      },
    }),
  });
  const body = (await res.json()) as {
    data?: { characterData: { character: { encounterRankings: { ranks?: unknown[] } } | null } };
    errors?: { message: string }[];
  };
  if (body.errors?.length) throw new Error(`WCL: ${body.errors[0].message}`);

  const ranks = body.data?.characterData.character?.encounterRankings?.ranks ?? [];
  if (ranks.length === 0) {
    console.log('Aucun parse : impossible de conclure. Essayer un autre personnage.');
    return;
  }

  console.log(`${ranks.length} entrée(s).\n`);
  console.log('Clés de la première entrée :');
  console.log(Object.keys(ranks[0] as object).join(', '));
  console.log('\nEntrée complète :');
  console.log(JSON.stringify(ranks[0], null, 2));
  console.log('\nHorodatages lus sur chaque entrée (startTime / report.startTime) :');
  for (const r of ranks as Array<Record<string, unknown>>) {
    const report = r.report as Record<string, unknown> | undefined;
    const own = r.startTime;
    const rep = report?.startTime;
    const fmt = (v: unknown) =>
      typeof v === 'number' ? new Date(v).toISOString() : String(v ?? 'absent');
    console.log(`  own=${fmt(own)}  report=${fmt(rep)}  spec=${String(r.spec ?? '?')}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
