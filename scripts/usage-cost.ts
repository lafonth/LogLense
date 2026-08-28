/**
 * Ce qu'un rapport nous coûte réellement, en euros, par fournisseur.
 *
 * Le relevé de jetons est capturé et persisté depuis `record-usage.ts`, et personne ne l'avait
 * encore lu. Or c'est l'intrant du prix du pass : on n'ouvre pas l'accès à des inconnus sans
 * savoir ce que coûte une analyse. Ce script lit `labels:usage` — il n'écrit rien et ne touche
 * pas à la capture.
 *
 * Trois décisions de lecture, qui sont tout le script :
 *
 * 1. **Seul `serverKey` compte.** Un rendu mené sous la clé du joueur consomme exactement les
 *    mêmes jetons et ne nous coûte rien. Le compte BYOK est affiché à part : il dit le volume
 *    servi, pas la dépense.
 * 2. **`promptTokens` est la somme des trois termes d'entrée** (`usage.ts`) : l'entrée neuve se
 *    déduit, elle ne s'additionne pas. `null` dit non mesuré, pas nul — un `cachedTokens` à zéro
 *    chez Groq se lirait à tort comme un cache qui n'a jamais pris. Chez qui ne mesure pas, tout
 *    l'entrant est donc facturé plein : c'est un majorant assumé, pas une estimation.
 * 3. **Un modèle sans tarif connu n'est pas facturé à zéro**, il est compté à part et signalé.
 *    Un euro manquant se voit ; un euro inventé, non.
 *
 * Le rapport et le chat sont séparés : un tour de chat outillé consomme jusqu'à cinq appels au
 * modèle, un rapport en consomme un. Les mêler donnerait une moyenne qui ne décrit ni l'un ni
 * l'autre.
 *
 * Usage: npx tsx scripts/usage-cost.ts [nombre de mois, 6 par défaut]
 * Requires: UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN dans .env.local
 */
import process from 'node:process';
import { lrange, parseLines, recentMonths, requireRedis } from './corpus-io';

/**
 * Dollar vers euro, relevé le 2026-08-28. Recopié plutôt que requêté : un script de lecture qui
 * dépend d'un service de change ne démarre plus le jour où ce service tombe, et le chiffre
 * cherché ne se joue pas à la troisième décimale du taux.
 */
const USD_TO_EUR = 0.858;

/**
 * Tarifs publics en dollars par million de jetons, relevés le 2026-08-28.
 *
 * Recopiés pour la même raison que les plafonds de `corpus-io.ts` : `scripts/` ne résout pas les
 * alias `@/` — et il n'existe de toute façon aucune table de tarifs dans le produit. Le code n'a
 * jamais eu besoin de connaître un prix, seulement de compter des jetons.
 *
 * `write` à `null` désigne un fournisseur qui **ne facture pas** l'écriture de cache : OpenAI et
 * Groq cachent d'office. C'est cohérent avec `provider.ts`, où seul Claude rend
 * `cacheWriteTokens`. Par prudence, si un relevé en portait malgré tout chez eux, ces jetons sont
 * facturés au tarif d'entrée plutôt qu'ignorés.
 *
 * Claude est au tarif standard de Sonnet 5 (3 / 15), pas au tarif d'introduction (2 / 10) qui
 * expire le 2026-08-31 : ce chiffre sert à fixer un prix pour la saison, pas à solder le mois.
 */
const PRICES: Record<string, { in: number; cached: number; write: number | null; out: number }> = {
  'claude-sonnet-5': { in: 3.0, cached: 0.3, write: 3.75, out: 15.0 },
  'gpt-5.1': { in: 1.25, cached: 0.125, write: null, out: 10.0 },
  'gemini-3.5-flash-lite': { in: 0.3, cached: 0.03, write: 0.0833, out: 2.5 },
  'openai/gpt-oss-120b': { in: 0.15, cached: 0.075, write: null, out: 0.6 },
};

interface Row {
  surface: string;
  serverKey: boolean;
  provider: string;
  model: string | null;
  promptTokens: number;
  cachedTokens: number | null;
  cacheWriteTokens: number | null;
  completionTokens: number;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** `null` dit non mesuré : on ne le confond pas avec zéro, on le laisse passer tel quel. */
function maybeNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Un enregistrement du corpus ramené à la forme que le calcul attend. `null` si ce n'en est pas un. */
function readRow(entry: Record<string, unknown>): Row | null {
  if (entry.kind !== 'usage') return null;
  return {
    surface: entry.surface === 'chat' ? 'chat' : 'report',
    serverKey: entry.serverKey === true,
    provider: typeof entry.provider === 'string' ? entry.provider : '?',
    model: typeof entry.model === 'string' && entry.model ? entry.model : null,
    promptTokens: num(entry.promptTokens),
    cachedTokens: maybeNum(entry.cachedTokens),
    cacheWriteTokens: maybeNum(entry.cacheWriteTokens),
    completionTokens: num(entry.completionTokens),
  };
}

/** Le coût d'un relevé en dollars, ou `null` quand le modèle n'a pas de tarif connu. */
function costUsd(row: Row): number | null {
  const price = row.model ? PRICES[row.model] : undefined;
  if (!price) return null;

  const cached = row.cachedTokens ?? 0;
  const written = row.cacheWriteTokens ?? 0;
  // `promptTokens` porte les trois termes : ce qui reste après le cache est l'entrée neuve.
  const fresh = Math.max(0, row.promptTokens - cached - written);

  const usd =
    fresh * price.in +
    cached * price.cached +
    written * (price.write ?? price.in) +
    row.completionTokens * price.out;

  return usd / 1_000_000;
}

interface Bucket {
  renders: number;
  usd: number;
  unpriced: number;
  byok: number;
  /** Les trois termes d'entrée et la sortie, cumulés : de quoi retarifer sans relire le corpus. */
  prompt: number;
  cached: number;
  written: number;
  completion: number;
  models: Set<string>;
}

function bucketOf(map: Record<string, Bucket>, provider: string): Bucket {
  if (!map[provider]) {
    map[provider] = {
      renders: 0,
      usd: 0,
      unpriced: 0,
      byok: 0,
      prompt: 0,
      cached: 0,
      written: 0,
      completion: 0,
      models: new Set(),
    };
  }
  return map[provider];
}

function eur(usd: number): string {
  return (usd * USD_TO_EUR).toFixed(4);
}

const NAME = 12;
const COL = 13;

function table(title: string, map: Record<string, Bucket>): void {
  console.log(title);

  const providers = Object.keys(map).sort();
  if (providers.length === 0) {
    console.log('  aucun relevé sur la fenêtre.\n');
    return;
  }

  console.log(
    [
      'fournisseur'.padEnd(NAME),
      'notre clé'.padStart(COL),
      'clé joueur'.padStart(COL),
      'sans tarif'.padStart(COL),
      '€ moyen'.padStart(COL),
      '€ total'.padStart(COL),
    ].join('') + '  modèles'
  );

  let renders = 0;
  let usd = 0;
  let byok = 0;
  let unpriced = 0;

  for (const provider of providers) {
    const b = map[provider];
    renders += b.renders;
    usd += b.usd;
    byok += b.byok;
    unpriced += b.unpriced;

    console.log(
      [
        provider.padEnd(NAME),
        String(b.renders).padStart(COL),
        String(b.byok).padStart(COL),
        String(b.unpriced).padStart(COL),
        (b.renders === 0 ? '·' : eur(b.usd / b.renders)).padStart(COL),
        eur(b.usd).padStart(COL),
      ].join('') + `  ${[...b.models].join(', ') || '·'}`
    );
  }

  console.log(
    [
      'ensemble'.padEnd(NAME),
      String(renders).padStart(COL),
      String(byok).padStart(COL),
      String(unpriced).padStart(COL),
      (renders === 0 ? '·' : eur(usd / renders)).padStart(COL),
      eur(usd).padStart(COL),
    ].join('')
  );

  // Le profil de jetons, pour que le chiffre en euros soit retarifable chez un autre fournisseur
  // sans relire le corpus. `promptTokens` porte les trois termes : l'entrée neuve se déduit.
  console.log('');
  console.log('  jetons moyens par rendu — entrée neuve / cache lu / cache écrit / sortie');
  for (const provider of providers) {
    const b = map[provider];
    if (b.renders === 0) continue;
    const per = (n: number) => String(Math.round(n / b.renders)).padStart(9);
    const fresh = Math.max(0, b.prompt - b.cached - b.written);
    console.log(
      `  ${provider.padEnd(NAME)}${per(fresh)}${per(b.cached)}${per(b.written)}${per(b.completion)}`
    );
  }
  console.log('');
}

async function main() {
  requireRedis();

  const asked = Number(process.argv[2] ?? 6);
  const window = recentMonths(Number.isFinite(asked) && asked > 0 ? asked : 6);

  const lists = await Promise.all(window.map((m) => lrange(`labels:usage:${m}`)));

  const report: Record<string, Bucket> = {};
  const chat: Record<string, Bucket> = {};
  const unpriced = new Map<string, number>();
  let total = 0;

  for (const [i, lines] of lists.entries()) {
    for (const entry of parseLines(lines, `labels:usage:${window[i]}`)) {
      const row = readRow(entry);
      if (!row) continue;
      total += 1;

      const b = bucketOf(row.surface === 'chat' ? chat : report, row.provider);

      if (!row.serverKey) {
        b.byok += 1;
        continue;
      }

      const usd = costUsd(row);
      if (usd === null) {
        b.unpriced += 1;
        const model = row.model ?? '(non rendu)';
        unpriced.set(model, (unpriced.get(model) ?? 0) + 1);
        continue;
      }

      b.renders += 1;
      b.usd += usd;
      b.prompt += row.promptTokens;
      b.cached += row.cachedTokens ?? 0;
      b.written += row.cacheWriteTokens ?? 0;
      b.completion += row.completionTokens;
      if (row.model) b.models.add(row.model);
    }
  }

  console.log(`Fenêtre : ${window[0]} → ${window[window.length - 1]}, ${total} relevés.`);
  console.log(`Taux retenu : 1 $ = ${USD_TO_EUR} €. Tarifs relevés le 2026-08-28.`);
  console.log('');

  table('Rapports — le coût marginal d’une analyse', report);
  table('Chat — par tour de modèle, pas par conversation', chat);

  if (unpriced.size > 0) {
    console.error(
      'Modèles sans tarif connu, exclus du coût — à ajouter dans PRICES :\n  ' +
        [...unpriced.entries()].map(([m, n]) => `${m} : ${n} relevés`).join('\n  ')
    );
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
