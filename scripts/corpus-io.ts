/**
 * Ce que les scripts de corpus partagent : l'accès Redis, la fenêtre de mois, et la liste des
 * flux.
 *
 * Extrait parce que `corpus-size.ts` et `export-corpus.ts` portaient chacun leur copie de
 * `lrange`/`llen` et de `recentMonths`, et qu'un troisième lecteur en aurait porté une
 * troisième. Le vrai enjeu n'est pas la duplication : c'est `FLOWS`. Tant que la liste des
 * flux vit dans chaque script, en ajouter un au produit laisse les lecteurs derrière sans que
 * rien ne le signale — ce qui est exactement comment `demand` et `pull-comparison` ont été
 * écrits pendant des mois sans que personne puisse les relire.
 *
 * `scripts/` est hors du `tsconfig` et hors de `pnpm lint` : ce module n'est pas typecheck.
 * D'où le style volontairement pauvre — pas d'import applicatif, pas de générique.
 */
import { resolve } from 'node:path';
import process from 'node:process';

/**
 * Les huit clés du corpus, et ce que chacune contient.
 *
 * `cap` reprend les plafonds de `src/lib/labels/corpus.ts`. Ils sont recopiés plutôt
 * qu'importés : `scripts/` ne résout pas les alias `@/`, et un script de lecture qui ne
 * démarre pas faute d'import est pire qu'un chiffre à resynchroniser. Le test
 * `corpus.test.ts` garde les valeurs de référence.
 *
 * `kinds` liste les discriminants qu'une clé peut porter — `report` en mêle deux, ce qui est
 * la raison d'être du champ `kind` dans chaque enregistrement.
 */
export const FLOWS = {
  comparability: {
    key: 'labels:comparability',
    kinds: ['verdict'],
    cap: 50_000,
    what: 'Verdicts humains : une référence déclarée non comparable, avec son motif',
  },
  exposure: {
    key: 'labels:exposure',
    kinds: ['exposure'],
    cap: 50_000,
    what: 'Ce qui a été montré à l’écran, avec la provenance du DPS',
  },
  report: {
    key: 'labels:report',
    kinds: ['advice', 'feedback'],
    cap: 50_000,
    what: 'Rapports IA rendus, et le retour éventuel du lecteur',
  },
  pool: {
    key: 'labels:pool',
    kinds: ['pool'],
    cap: 150_000,
    what: 'Le vivier de candidats, écartés compris — les contre-exemples',
  },
  'intra-raid': {
    key: 'labels:intra-raid',
    kinds: ['intra-raid'],
    cap: 50_000,
    what: 'Comparaisons entre joueurs d’un même raid',
  },
  'pull-comparison': {
    key: 'labels:pull-comparison',
    kinds: ['pull-comparison'],
    cap: 50_000,
    what: 'Comparaisons entre deux pulls du même joueur',
  },
  demand: {
    key: 'labels:demand',
    kinds: ['demand'],
    cap: 150_000,
    // Les lignes d'avant le 2026-08-16 n'ont ni `v` ni `kind` : voir `record-demand.ts`.
    what: 'Ce que chaque requête a demandé au budget Warcraft Logs, refus compris',
  },
  usage: {
    key: 'labels:usage',
    kinds: ['usage'],
    cap: 50_000,
    what: 'Ce qu’un rendu IA a coûté en jetons, et si c’est notre clé qui a payé',
  },
};

export const FLOW_NAMES = Object.keys(FLOWS);

/** Charge `.env.local` et sort si les identifiants Redis manquent. */
export function requireRedis() {
  process.loadEnvFile(resolve(process.cwd(), '.env.local'));

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN absents de .env.local');
    process.exit(1);
  }
}

async function command(args: string[]) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL ?? '', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Redis a répondu ${res.status} sur ${args[1]}`);
  const data = (await res.json()) as { result?: unknown };
  return data.result;
}

/** La taille d'une clé, sans lire les entrées. */
export async function llen(key: string): Promise<number> {
  const result = await command(['LLEN', key]);
  return typeof result === 'number' ? result : 0;
}

/** Toutes les entrées d'une clé, brutes. */
export async function lrange(key: string): Promise<string[]> {
  const result = await command(['LRANGE', key, '0', '-1']);
  return Array.isArray(result) ? result.filter((v) => typeof v === 'string') : [];
}

/** Les `count` derniers mois, du plus ancien au plus récent, en `YYYY-MM`. */
export function recentMonths(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/**
 * Une entrée illisible est signalée et sautée, pas fatale.
 *
 * Le corpus est append-only et ne se nettoie pas après coup : une seule ligne corrompue ne doit
 * pas rendre inexportables les milliers d'autres.
 */
export function parseLines(lines: string[], label: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const [i, line] of lines.entries()) {
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        out.push(value as Record<string, unknown>);
      } else {
        console.error(`${label}[${i}] : entrée non objet, sautée`);
      }
    } catch {
      console.error(`${label}[${i}] : JSON illisible, sauté`);
    }
  }
  return out;
}
