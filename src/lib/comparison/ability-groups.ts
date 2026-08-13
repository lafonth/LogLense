import type { AbilityComparison } from './rotation-stats';

/**
 * Un bloc de la section rotation. Un `label` vide veut dire « pas d'en-tête » : un titre
 * solitaire au-dessus de la seule liste existante n'apprend rien et coûte une ligne.
 */
export interface AbilityGroup {
  label: string;
  rows: AbilityComparison[];
}

/**
 * Partitionne en préservant l'ordre d'entrée, et ne rend jamais de groupe vide.
 *
 * L'ordre reçu est déjà celui du tri par coût : regrouper ne doit pas le rejouer, sous peine
 * de faire remonter un sort que la pondération avait délibérément relégué.
 */
function partition(
  rows: AbilityComparison[],
  isFirst: (row: AbilityComparison) => boolean,
  firstLabel: string,
  secondLabel: string
): AbilityGroup[] {
  const first = rows.filter(isFirst);
  const second = rows.filter((row) => !isFirst(row));

  if (first.length === 0) return second.length > 0 ? [{ label: '', rows: second }] : [];
  if (second.length === 0) return [{ label: '', rows: first }];
  return [
    { label: firstLabel, rows: first },
    { label: secondLabel, rows: second },
  ];
}

/**
 * Les casts, séparés selon qu'ils portent des dégâts ou non.
 *
 * `Non-damaging` recouvre les défensifs *et* les utilitaires sans prétendre les distinguer :
 * aucune donnée WCL ne porte cette information, et l'inventer demanderait une table curée
 * pour vingt-quatre specs, à remaintenir à chaque patch. Le libellé dit ce qui est mesuré,
 * rien de plus.
 *
 * Sans table de dégâts, la pondération n'a pas eu lieu et tous les `damageShare` valent
 * `null` : trancher reviendrait alors à déclarer toute la rotation non-damageante. Le cas
 * rend donc un groupe unique sans libellé — la même retenue que le libellé `by deviation`,
 * qui refuse d'annoncer un coût qui n'a pas été calculé.
 */
export function groupCasts(casts: AbilityComparison[]): AbilityGroup[] {
  const weighted = casts.some((row) => (row.damageShare ?? 0) > 0);
  if (!weighted) return casts.length > 0 ? [{ label: '', rows: casts }] : [];

  return partition(casts, (row) => (row.damageShare ?? 0) > 0, 'Damaging', 'Non-damaging');
}

/**
 * Les uptimes, séparés selon que l'aura vient d'un sort lancé ou non.
 *
 * Une aura dont le nom ne figure dans aucune table de casts n'a été lancée par personne :
 * c'est un proc ou un passif, et son uptime ne se pilote qu'indirectement. Une aura homonyme
 * d'un cast — un DoT, un buff activé — se pilote directement, elle.
 *
 * `castNames` doit porter l'union de tous les côtés comparés, pas mes seuls casts : une aura
 * que les références activent et que je n'ai jamais lancée reste une aura activée.
 */
export function groupUptimes(uptimes: AbilityComparison[], castNames: Set<string>): AbilityGroup[] {
  return partition(
    uptimes,
    (row) => castNames.has(row.name),
    'From your casts',
    'Procs and passives'
  );
}
