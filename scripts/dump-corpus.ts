/**
 * Sort n'importe lequel des sept flux du corpus, brut, une ligne JSON par enregistrement.
 *
 * `export-corpus.ts` répond à une question précise — le jeu d'entraînement étiqueté, joint sur
 * `renderId` — et ne lit que les deux flux dont il a besoin. Les cinq autres (`report`, `pool`,
 * `intra-raid`, `pull-comparison`, `demand`) n'avaient aucun lecteur : ils étaient capturés
 * correctement et illisibles en pratique, ce qui revient à ne pas les avoir pour tout usage
 * qu'on n'avait pas prévu en les écrivant.
 *
 * D'où un dumper qui ne comprend rien à ce qu'il sort. Il ne joint pas, n'étiquette pas et ne
 * projette pas : la moindre interprétation ici deviendrait un second endroit à tenir à jour
 * quand la forme d'un enregistrement change, et le premier — `export-corpus.ts` — a déjà cette
 * charge. Ce qui sort est ce qui a été écrit, `jq` fait le reste.
 *
 * Usage:
 *   npx tsx scripts/dump-corpus.ts <flux> [nombre de mois, 6 par défaut] > flux.jsonl
 *   npx tsx scripts/dump-corpus.ts --list
 *
 * Requires: UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN dans .env.local
 */
import process from 'node:process';
import { FLOWS, FLOW_NAMES, lrange, parseLines, recentMonths, requireRedis } from './corpus-io';

function listFlows() {
  console.log('Flux du corpus :\n');
  for (const name of FLOW_NAMES) {
    const flow = FLOWS[name];
    console.log(`  ${name.padEnd(16)} ${flow.what}`);
    console.log(`  ${''.padEnd(16)} ${flow.key}:YYYY-MM · kind ${flow.kinds.join(', ')}\n`);
  }
}

async function main() {
  const flowName = process.argv[2];

  if (!flowName || flowName === '--list' || flowName === '-l') {
    listFlows();
    // Sans argument, c'est une erreur d'usage ; `--list` est une demande satisfaite.
    process.exit(flowName ? 0 : 1);
  }

  const flow = FLOWS[flowName];
  if (!flow) {
    console.error(`Flux inconnu : ${flowName}\nAttendu : ${FLOW_NAMES.join(', ')}`);
    process.exit(1);
  }

  const months = Number(process.argv[3] ?? 6);
  if (!Number.isInteger(months) || months < 1) {
    console.error(`Nombre de mois invalide : ${process.argv[3]}`);
    process.exit(1);
  }

  requireRedis();

  const window = recentMonths(months);
  const lists = await Promise.all(window.map((m) => lrange(`${flow.key}:${m}`)));

  // Comptés par `kind` plutôt que globalement : `labels:report` en mêle deux, et une clé dont
  // la répartition surprend est le premier signe qu'un flux écrit autre chose que ce qu'on
  // croit. `sans kind` compte les lignes antérieures au discriminant, jamais fondues avec les
  // autres — c'est la mesure exacte de ce qu'on a écrit avant de savoir le relire.
  const byKind = new Map<string, number>();
  let total = 0;

  for (const [i, month] of window.entries()) {
    for (const record of parseLines(lists[i], `${flowName}:${month}`)) {
      const kind = typeof record.kind === 'string' ? record.kind : 'sans kind';
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
      total += 1;
      process.stdout.write(`${JSON.stringify(record)}\n`);
    }
  }

  const breakdown = [...byKind.entries()].map(([kind, n]) => `${n} ${kind}`).join(', ');
  console.error(
    `${total} enregistrements sur ${months} mois (${window[0]} → ${window[window.length - 1]})` +
      (breakdown ? `\n${breakdown}` : '')
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
