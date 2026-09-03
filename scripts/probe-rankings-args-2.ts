/**
 * Étape 3 de `PLAN_RETOURS_TEST.md`, second tour — trois trous laissés par la première sonde.
 *
 *   a. `gear` rendu par `includeCombatantInfo` n'a pas de `setID`. Est-il *absent du
 *      contrat* ou absent de ce joueur-là ? On rejoue le MÊME combat par `CombatantInfo`
 *      et on compare les deux gear pièce par pièce.
 *   b. `bracket: 1|5|99` rend zéro entrée. Quelle est la numérotation réelle ? On balaie.
 *   c. `externalBuffs` est un enum `ExternalBuffRankFilter` : quelles valeurs ?
 *
 * Usage: node scripts/probe-rankings-args-2.ts
 */
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
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

async function raw(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<{ bytes: number; json: any }> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  return { bytes: Buffer.byteLength(text), json: JSON.parse(text) };
}

const first = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/spike-rankings-args.raw.json'), 'utf8'));
const encounterID: number = first.encounterID;
const captures: Record<string, unknown> = { probedAt: new Date().toISOString(), encounterID };

const Q_ENUM = `
  query { __type(name: "ExternalBuffRankFilter") { enumValues { name } } }`;

const Q_COMBATANT = `
  query($code: String!, $fightIDs: [Int]!) {
    reportData { report(code: $code) { events(dataType: CombatantInfo, fightIDs: $fightIDs) { data } } }
  }`;

function rankingsQuery(extra: string): string {
  return `
  query($encounterID: Int!, $page: Int!) {
    worldData {
      encounter(id: $encounterID) {
        characterRankings(
          metric: dps, difficulty: 5, leaderboard: LogsOnly, page: $page${extra}
        )
      }
    }
  }`;
}

async function main() {
  const token = await getToken();

  // ── a. Le même joueur, le même combat, par les deux chemins ────────────────
  const entry = first.q1.sampleEntryWith;
  const { code, fightID } = entry.report;
  console.log(`=== a. setID — ${entry.name}, rapport ${code} combat ${fightID} ===`);

  const ci = await raw(token, Q_COMBATANT, { code, fightIDs: [fightID] });
  const events: any[] = ci.json?.data?.reportData?.report?.events?.data ?? [];
  // Le CombatantInfo ne porte pas le nom du joueur : on retrouve l'acteur par son gear.
  const rankIds = new Set<number>(entry.gear.map((g: any) => Number(g.id)).filter(Boolean));
  let match: any = null;
  let bestOverlap = 0;
  for (const ev of events) {
    const ids = (ev.gear ?? []).map((g: any) => Number(g.id));
    const overlap = ids.filter((i: number) => rankIds.has(i)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      match = ev;
    }
  }
  console.log(`  ${events.length} CombatantInfo dans la pull, meilleur recouvrement : ${bestOverlap}/${rankIds.size} pièces`);
  const ciKeys = match ? [...new Set((match.gear ?? []).flatMap((g: any) => Object.keys(g)))] : [];
  console.log('  clés du gear CombatantInfo :', ciKeys.join(', '));
  console.log('  clés du gear rankings      :', [...new Set(entry.gear.flatMap((g: any) => Object.keys(g)))].join(', '));
  const setIds = (match?.gear ?? []).map((g: any) => g.setID).filter((s: any) => s != null);
  console.log('  setID présents côté CombatantInfo :', JSON.stringify(setIds));
  console.log('  exemple de pièce CombatantInfo    :', JSON.stringify((match?.gear ?? [])[0]));
  // Le setID manque côté rankings. Reste-t-il un signal dérivable ? On joint les deux gear
  // par `id` (identique des deux côtés) et on regarde ce que portent les pièces de set.
  const ciById = new Map<number, any>((match?.gear ?? []).map((g: any) => [Number(g.id), g]));
  const join = entry.gear.map((g: any) => {
    const ci = ciById.get(Number(g.id));
    return { id: Number(g.id), name: g.name, icon: g.icon, setID: ci?.setID ?? null };
  });
  console.log('\n  — jointure par id : ce que porte une pièce de set contre une pièce hors set —');
  for (const p of join) {
    console.log(
      `  ${p.setID != null ? 'SET ' + p.setID : '  — '} | ${String(p.name).padEnd(42)} | ${p.icon}`
    );
  }
  const setNames = join.filter((p: any) => p.setID != null).map((p: any) => p.name);
  const offNames = join.filter((p: any) => p.setID == null).map((p: any) => p.name);
  const suffix = (n: string) => n.replace(/^[^ ]+ /, '');
  const setSuffixes = [...new Set(setNames.map(suffix))];
  console.log(`\n  suffixes des pièces de set : ${JSON.stringify(setSuffixes)}`);
  console.log(
    `  un suffixe de set porté par une pièce hors set ? ${offNames.some((n: string) => setSuffixes.includes(suffix(n))) ? 'OUI' : 'NON'}`
  );

  captures.a = {
    gearJoin: join,
    setSuffixes,
    suffixCollision: offNames.some((n: string) => setSuffixes.includes(suffix(n))),
    rankingsGearKeys: [...new Set(entry.gear.flatMap((g: any) => Object.keys(g)))],
    combatantInfoGearKeys: ciKeys,
    overlap: bestOverlap,
    gearCountRankings: entry.gear.length,
    gearCountCombatantInfo: match?.gear?.length ?? 0,
    setIdsCombatantInfo: setIds,
    sampleCombatantInfoPiece: (match?.gear ?? [])[0] ?? null,
    sampleRankingsPiece: entry.gear[0],
  };

  // ── b. La numérotation des brackets ────────────────────────────────────────
  console.log('\n=== b. bracket — balayage ===');
  const bres: Record<string, unknown> = {};
  for (const b of [0, 1, 10, 13, 15, 17, 18, 20, 25, 30]) {
    const r = await raw(token, rankingsQuery(`, bracket: ${b}`), { encounterID, page: 1 });
    const rk = r.json?.data?.worldData?.encounter?.characterRankings?.rankings ?? [];
    const ilvls = rk.map((x: any) => x.bracketData).filter((x: any) => x != null);
    const span = ilvls.length ? `${Math.min(...ilvls)}–${Math.max(...ilvls)}` : '—';
    const err = r.json?.errors?.[0]?.message ?? null;
    bres[`bracket ${b}`] = { count: rk.length, span, errors: r.json?.errors ?? null };
    console.log(`  bracket ${String(b).padEnd(2)} → ${err ? `ERREUR ${err}` : `${rk.length} entrées, ilvl ${span}`}`);
  }
  captures.b = bres;

  // ── c. externalBuffs ───────────────────────────────────────────────────────
  console.log('\n=== c. externalBuffs ===');
  const en = await raw(token, Q_ENUM, {});
  const values = (en.json?.data?.__type?.enumValues ?? []).map((v: any) => v.name);
  console.log('  valeurs de ExternalBuffRankFilter :', values.join(', ') || '—');
  const cres: Record<string, unknown> = { enumValues: values };
  for (const v of values) {
    const r = await raw(token, rankingsQuery(`, externalBuffs: ${v}`), { encounterID, page: 1 });
    const rk = r.json?.data?.worldData?.encounter?.characterRankings?.rankings ?? [];
    const err = r.json?.errors?.[0]?.message ?? null;
    cres[v] = { count: rk.length, errors: r.json?.errors ?? null };
    console.log(`  ${String(v).padEnd(12)} → ${err ? `ERREUR ${err}` : `${rk.length} entrées`}`);
  }
  captures.c = cres;

  // ── d. externalBuffs filtre-t-il vraiment ? ────────────────────────────────
  // Les trois valeurs rendent 100 entrées, mais 100 est la taille de page : le compte ne
  // discrimine rien. On regarde le contenu — combien d'entrées portent un external.
  console.log('\n=== d. externalBuffs — le contenu, pas le compte ===');
  const dres: Record<string, unknown> = {};
  for (const v of values) {
    const r = await raw(
      token,
      rankingsQuery(`, externalBuffs: ${v}, includeCombatantInfo: true`),
      { encounterID, page: 1 }
    );
    const rk: any[] = r.json?.data?.worldData?.encounter?.characterRankings?.rankings ?? [];
    const withBuff = rk.filter((x) => (x.externalBuffs ?? []).length > 0);
    const names = [...new Set(withBuff.flatMap((x: any) => x.externalBuffs.map((b: any) => b.name)))];
    dres[v] = {
      count: rk.length,
      withExternal: withBuff.length,
      buffNames: names,
      firstThree: rk.slice(0, 3).map((x: any) => x.name),
    };
    console.log(
      `  ${String(v).padEnd(8)} → ${rk.length} entrées, dont ${withBuff.length} avec external ${names.length ? `(${names.join(', ')})` : ''}`
    );
  }
  captures.d = dres;

  // ── e. bracket + includeCombatantInfo : le vivier dense coûte-t-il plus ? ───
  console.log('\n=== e. bracket 15 + includeCombatantInfo ===');
  const eres: Record<string, unknown> = {};
  for (const p of [1, 2]) {
    const r = await raw(token, rankingsQuery(', bracket: 15, includeCombatantInfo: true'), {
      encounterID,
      page: p,
    });
    const rk: any[] = r.json?.data?.worldData?.encounter?.characterRankings?.rankings ?? [];
    const ilvls = rk.map((x: any) => x.bracketData).filter((x: any) => x != null);
    eres[`page ${p}`] = {
      bytes: r.bytes,
      count: rk.length,
      span: ilvls.length ? `${Math.min(...ilvls)}–${Math.max(...ilvls)}` : '—',
      hasMorePages: r.json?.data?.worldData?.encounter?.characterRankings?.hasMorePages ?? null,
    };
    console.log(
      `  page ${p} : ${rk.length} entrées, ${(r.bytes / 1024).toFixed(1)} Kio, ilvl ${(eres[`page ${p}`] as any).span}`
    );
  }
  captures.e = eres;

  const out = resolve(process.cwd(), 'docs/spike-rankings-args-2.raw.json');
  writeFileSync(out, JSON.stringify(captures, null, 2));
  console.log(`\nRéponses brutes : ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
