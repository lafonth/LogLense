/**
 * Compte les huit flux du corpus, mois par mois, contre leurs plafonds.
 *
 * Ce script comptait les seuls verdicts, pour arbitrer la tâche 8 (ML sur les libellés). Cette
 * tâche est morte le 2026-08-13 : sa mesure n'a plus d'objet, mais le compte, lui, en a gagné
 * un autre. Les clés du corpus sont plafonnées au mois (`CORPUS_MONTH_CAP` et ses variantes) et
 * **dépasser ferme le mois en cours en silence** — `appendToCorpus` rend `'full'` et
 * l'appelant continue. Rien ne le signale à l'exécution. Compter est donc la seule manière de
 * l'apprendre autrement qu'en constatant un trou dans le corpus, six mois plus tard, quand il
 * est irréparable.
 *
 * D'où les deux changements de forme : les huit flux au lieu d'un, et le pourcentage du plafond
 * plutôt que le total brut. Un total ne se lit pas sans son plafond, et les plafonds diffèrent
 * — `pool` et `demand` sont à 150 000 là où les autres sont à 50 000.
 *
 * `LLEN` donne la taille sans lire les entrées : on compte le corpus sans le sortir de Redis.
 * Pour le sortir, voir `dump-corpus.ts`.
 *
 * Usage: npx tsx scripts/corpus-size.ts [nombre de mois, 6 par défaut]
 * Requires: UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN dans .env.local
 */
import process from 'node:process';
import { FLOWS, FLOW_NAMES, llen, recentMonths, requireRedis } from './corpus-io';

/** Au-delà, le mois mérite un regard : il reste peu de marge avant la fermeture silencieuse. */
const WARN_RATIO = 0.8;

/**
 * Large de deux caractères de plus que le plus long nom de flux tronqué.
 *
 * `pull-comparison` et `comparability` dépassent, donc les en-têtes sont coupés — mais coupés
 * à une largeur qui laisse toujours un blanc entre deux colonnes, faute de quoi la ligne
 * d'en-tête se lit comme un seul mot.
 */
const COL = 11;
const NAME = COL - 2;

function cell(count: number, cap: number): string {
  if (count === 0) return '·'.padStart(COL);
  const flag = count >= cap ? '!' : count >= cap * WARN_RATIO ? '~' : ' ';
  return `${String(count)}${flag}`.padStart(COL);
}

async function main() {
  const months = Number(process.argv[2] ?? 6);
  if (!Number.isInteger(months) || months < 1) {
    console.error(`Nombre de mois invalide : ${process.argv[2]}`);
    process.exit(1);
  }

  requireRedis();

  const window = recentMonths(months);

  // Une seule salve : sept clés sur six mois font quarante-deux `LLEN`, séquentiellement
  // c'est une minute d'attente pour des compteurs.
  const counts = await Promise.all(
    FLOW_NAMES.map((name) => Promise.all(window.map((m) => llen(`${FLOWS[name].key}:${m}`))))
  );

  console.log(['mois'.padEnd(9), ...FLOW_NAMES.map((n) => n.slice(0, NAME).padStart(COL))].join(''));

  for (const [i, month] of window.entries()) {
    const row = FLOW_NAMES.map((name, f) => cell(counts[f][i], FLOWS[name].cap));
    console.log([month.padEnd(9), ...row].join(''));
  }

  const totals = counts.map((perMonth) => perMonth.reduce((a, b) => a + b, 0));
  console.log(['total'.padEnd(9), ...totals.map((t) => String(t).padStart(COL))].join(''));

  const saturated: string[] = [];
  for (const [f, name] of FLOW_NAMES.entries()) {
    const { cap } = FLOWS[name];
    for (const [i, month] of window.entries()) {
      if (counts[f][i] >= cap * WARN_RATIO) saturated.push(`${name} ${month} : ${counts[f][i]} / ${cap}`);
    }
  }

  console.error(
    saturated.length === 0
      ? `Aucun mois au-dessus de ${WARN_RATIO * 100}% de son plafond.`
      : `Mois proches ou au-delà de leur plafond :\n  ${saturated.join('\n  ')}`
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
