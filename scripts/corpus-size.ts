/**
 * Compte les verdicts de comparabilité capturés, mois par mois.
 *
 * La tâche 8 (ML sur les libellés) est conditionnée au volume du corpus. Sans mesure, ce
 * seuil se devine ; avec elle, il s'observe. `LLEN` donne la taille sans lire les entrées —
 * on compte le corpus sans le sortir de Redis.
 *
 * Usage: npx tsx scripts/corpus-size.ts [nombre de mois, 6 par défaut]
 * Requires: UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN dans .env.local
 */
import { resolve } from 'node:path';
import process from 'node:process';

// Node charge lui-même le fichier depuis la 20.12 : pas de dotenv, qui n'est de toute façon
// pas une dépendance de ce dépôt.
process.loadEnvFile(resolve(process.cwd(), '.env.local'));

const MONTHS = Number(process.argv[2] ?? 6);

async function llen(key: string): Promise<number> {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL ?? '', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['LLEN', key]),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Redis a répondu ${res.status} sur ${key}`);
  const data = (await res.json()) as { result?: unknown };
  return typeof data.result === 'number' ? data.result : 0;
}

/** Les `MONTHS` derniers mois, du plus ancien au plus récent, en `YYYY-MM`. */
function recentMonths(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

async function main() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN absents de .env.local');
    process.exit(1);
  }

  const months = recentMonths(MONTHS);
  const counts = await Promise.all(months.map((m) => llen(`labels:comparability:${m}`)));

  let total = 0;
  for (const [i, month] of months.entries()) {
    total += counts[i];
    console.log(`${month}  ${String(counts[i]).padStart(6)}`);
  }
  console.log(`${'total'.padEnd(7)}${String(total).padStart(6)} verdicts sur ${MONTHS} mois`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
