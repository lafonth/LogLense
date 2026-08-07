/**
 * Sort le corpus d'étiquettes de Redis, joint, aplati, une ligne JSON par référence montrée.
 *
 * Le corpus était en écriture seule : deux routes y écrivaient, rien ne le relisait. Un jeu
 * d'entraînement qu'on ne peut pas sortir n'existe pas — c'est ce trou-là que ce script
 * ferme, avant toute question de modèle.
 *
 * La jointure se fait sur `renderId`, qui porte l'exposition et le verdict éventuel. Elle
 * produit trois états, et l'étiquette n'est jamais devinée :
 *
 *   negative       — une référence qu'un verdict cite explicitement comme non comparable
 *   weak-positive  — une référence `contestable` qu'aucun verdict ne cite : montrée avec un
 *                    bouton, non contestée. C'est un silence, pas une approbation : d'où
 *                    « faible », et d'où le fait qu'elle soit nommée comme telle et non
 *                    fondue avec les négatifs dans une colonne binaire.
 *   unlabeled      — une entrée de la fenêtre hors panel. Aucun bouton ne la contestait, son
 *                    silence ne dit rien. Sortie quand même : elle porte les mesures du
 *                    vivier, qui ne se reconstituent pas.
 *
 * Les verdicts `v: 1` et `v: 2` n'ont pas de `renderId` — ils sont antérieurs à la capture
 * d'exposition et ne se joignent à rien. Comptés à part sur stderr, jamais silencieusement
 * mélangés aux `v: 3`.
 *
 * Usage: npx tsx scripts/export-corpus.ts [nombre de mois, 6 par défaut] > corpus.jsonl
 * Requires: UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN dans .env.local
 */
import { resolve } from 'node:path';
import process from 'node:process';

process.loadEnvFile(resolve(process.cwd(), '.env.local'));

const MONTHS = Number(process.argv[2] ?? 6);

async function lrange(key: string): Promise<string[]> {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL ?? '', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['LRANGE', key, '0', '-1']),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Redis a répondu ${res.status} sur ${key}`);
  const data = (await res.json()) as { result?: unknown };
  return Array.isArray(data.result) ? data.result.filter((v) => typeof v === 'string') : [];
}

/** Les `count` derniers mois, du plus ancien au plus récent, en `YYYY-MM`. */
function recentMonths(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/**
 * Une entrée illisible est signalée et sautée, pas fatale.
 *
 * Le corpus est append-only et ne se nettoie pas après coup : une seule ligne corrompue ne
 * doit pas rendre inexportables les milliers d'autres.
 */
function parseLines(lines: string[], key: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const [i, line] of lines.entries()) {
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        out.push(value as Record<string, unknown>);
      } else {
        console.error(`${key}[${i}] : entrée non objet, sautée`);
      }
    } catch {
      console.error(`${key}[${i}] : JSON illisible, sauté`);
    }
  }
  return out;
}

/** Le pointeur complet d'une référence : ce sur quoi un verdict et une exposition se recoupent. */
function refKey(code: unknown, fightID: unknown, actorId: unknown): string {
  return `${String(code)}:${String(fightID)}:${String(actorId)}`;
}

interface Verdict {
  reason: string;
  rank: number | null;
}

async function main() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN absents de .env.local');
    process.exit(1);
  }

  const months = recentMonths(MONTHS);
  const [exposureLists, verdictLists] = await Promise.all([
    Promise.all(months.map((m) => lrange(`labels:exposure:${m}`))),
    Promise.all(months.map((m) => lrange(`labels:comparability:${m}`))),
  ]);

  const exposures = months.flatMap((m, i) => parseLines(exposureLists[i], `exposure:${m}`));
  const verdicts = months.flatMap((m, i) => parseLines(verdictLists[i], `comparability:${m}`));

  // `renderId` + pointeur de référence → verdict. Un même rendu peut être contesté sur
  // plusieurs références ; la clé porte donc les deux.
  const contested = new Map<string, Verdict>();
  let legacy = 0;
  for (const v of verdicts) {
    const renderId = v.renderId;
    if (v.kind !== 'verdict' || typeof renderId !== 'string') {
      legacy += 1;
      continue;
    }
    const reference = v.reference as Record<string, unknown> | undefined;
    const scores = v.scores as Record<string, unknown> | undefined;
    if (!reference) continue;
    contested.set(
      `${renderId}|${refKey(reference.code, reference.fightID, reference.actorId)}`,
      {
        reason: String(v.reason),
        rank: typeof scores?.rank === 'number' ? scores.rank : null,
      }
    );
  }

  const counts = { negative: 0, 'weak-positive': 0, unlabeled: 0 };
  let joined = 0;
  let rows = 0;

  for (const e of exposures) {
    if (e.kind !== 'exposure') continue;
    const renderId = typeof e.renderId === 'string' ? e.renderId : null;
    const subject = (e.subject ?? {}) as Record<string, unknown>;
    const comparability = (e.comparability ?? {}) as Record<string, unknown>;
    const references = Array.isArray(e.references) ? e.references : [];
    let hit = false;

    for (const raw of references) {
      const r = raw as Record<string, unknown>;
      const verdict =
        renderId === null
          ? undefined
          : contested.get(`${renderId}|${refKey(r.code, r.fightID, r.actorId)}`);
      if (verdict) hit = true;

      const label = verdict ? 'negative' : r.contestable === true ? 'weak-positive' : 'unlabeled';
      counts[label] += 1;
      rows += 1;

      process.stdout.write(
        `${JSON.stringify({
          at: e.at,
          by: e.by,
          renderId,
          encounterId: e.encounterId,
          difficulty: e.difficulty,
          specId: e.specId,
          subjectCode: subject.code,
          subjectFightID: subject.fightID,
          subjectActorId: subject.actorId,
          dpsSource: subject.dpsSource,
          refCode: r.code,
          refFightID: r.fightID,
          refActorId: r.actorId,
          rank: r.rank,
          contestable: r.contestable === true,
          // Absent des enregistrements écrits avant la fente d'exploration : `false` y est la
          // lecture juste, ils ne contenaient que des candidats sélectionnés par la règle.
          explored: r.explored === true,
          qualified: r.qualified === true,
          disqualifiedBy: Array.isArray(r.disqualifiedBy) ? r.disqualifiedBy : [],
          distance: r.distance ?? null,
          comparabilityLevel: comparability.level,
          referenceIlvl: comparability.referenceIlvl ?? null,
          myIlvl: comparability.myIlvl ?? null,
          referenceKillTimeMs: comparability.referenceKillTimeMs ?? null,
          myKillTimeMs: comparability.myKillTimeMs ?? null,
          candidatesConsidered: comparability.candidatesConsidered ?? null,
          pagesFetched: comparability.pagesFetched ?? null,
          disqualified: comparability.disqualified ?? null,
          substituted: comparability.substituted ?? null,
          label,
          verdictReason: verdict?.reason ?? null,
          verdictRank: verdict?.rank ?? null,
        })}\n`
      );
    }

    if (hit) joined += 1;
  }

  console.error(
    [
      `${exposures.length} expositions, ${verdicts.length} verdicts sur ${MONTHS} mois`,
      `${rows} lignes : ${counts.negative} negative, ${counts['weak-positive']} weak-positive, ${counts.unlabeled} unlabeled`,
      `${joined} expositions contestées, ${legacy} verdicts sans renderId (antérieurs à v: 3)`,
    ].join('\n')
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
