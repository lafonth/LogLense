import type { ReportMeta } from '@/types';

/**
 * La méta d'un rapport, retenue le temps de la navigation.
 *
 * Elle existe pour une raison précise : depuis que le formulaire et le résultat sont deux
 * routes, l'état d'un composant ne franchit plus la frontière. Sans ce cache, ouvrir un joueur
 * depuis le formulaire de rapport ou depuis le classement de raid relancerait
 * `/api/report/[code]` — donc une requête WCL et une ponction de quota — pour redemander ce que
 * l'écran précédent venait de recevoir.
 *
 * En mémoire du module, jamais persistée : la liste des acteurs et des pulls d'un rapport ne
 * bouge pas pendant qu'on le regarde, et un rechargement complet de la page a le droit de la
 * redemander.
 */
const cache = new Map<string, ReportMeta>();

/** Borne basse et assumée : on ne consulte pas trente rapports dans une même navigation. */
const MAX_ENTRIES = 8;

export function getCachedReportMeta(code: string): ReportMeta | null {
  return cache.get(code) ?? null;
}

export function setCachedReportMeta(code: string, meta: ReportMeta): void {
  // `Map` conserve l'ordre d'insertion : la première clé est la plus ancienne écriture.
  if (!cache.has(code) && cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(code, meta);
}

export function clearReportMetaCache(): void {
  cache.clear();
}
