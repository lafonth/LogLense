/**
 * Les icônes de sort, telles que Warcraft Logs les rend déjà.
 *
 * Chaque entrée d'une table WCL — dégâts, casts, auras — porte un champ `abilityIcon` : un
 * nom de fichier nu, `"spell_arcane_blast.jpg"`. Il arrivait dans la charge utile et se
 * perdait au parse, faute d'être déclaré. Le récupérer ne coûte **aucune requête de plus** et
 * **aucun champ GraphQL** : `table()` est un scalaire JSON, tout est déjà là.
 *
 * Piège vérifié sur la charge réelle : sur ces mêmes entrées, `actorIcon` vaut `"Mage"` et
 * `sources[].icon` vaut `"Mage-Arcane"` — la classe et la spec, jamais le sort. Seul
 * `abilityIcon` nomme une icône de capacité.
 */

/** L'hôte d'assets de Warcraft Logs — celui d'où leur propre site sert ces fichiers. */
const ABILITY_ICON_BASE = 'https://assets.rpglogs.com/img/warcraft/abilities/';

/**
 * Nom de capacité → nom de fichier d'icône.
 *
 * La clé est le **nom**, pas le `guid`, parce que c'est le nom qui joint dans toute la
 * couche de comparaison : `AbilityComparison`, `DamageGap` et les talents s'y rangent tous.
 * Un index par guid n'atteindrait ni les uptimes (une aura n'a pas de ligne de dégâts côté
 * écran) ni les talents (un nœud de talent ne porte pas de guid de table).
 */
export type IconIndex = Record<string, string>;

/**
 * L'URL de l'icône, ou `null` quand il n'y a rien à afficher.
 *
 * `null` n'est pas une erreur : une aura de raid, un talent passif ou un instantané écrit
 * avant cette version n'ont pas d'icône, et l'écran doit alors rendre sa pastille neutre.
 * Un nom de fichier qui contient un séparateur de chemin est refusé — il ne vient pas d'une
 * charge WCL et n'a rien à faire dans une URL.
 */
export function abilityIconUrl(icon: string | undefined | null): string | null {
  if (!icon) return null;
  if (icon.includes('/') || icon.includes('\\') || icon.includes('..')) return null;
  return `${ABILITY_ICON_BASE}${icon}`;
}

/**
 * Fusionne plusieurs index, le dernier l'emportant à nom égal.
 *
 * Les écrans de comparaison affichent l'**union** des noms — les miens et ceux des
 * références, ou ceux des deux pulls. Un sort que je n'ai pas lancé n'est pas dans mon
 * index : sans fusion, ces lignes-là seraient les seules en pastille neutre, ce qui se lit
 * comme un rendu cassé plutôt que comme un repli. L'ordre d'appel dit qui gagne, et on
 * passe en dernier l'index du combat qu'on regarde.
 */
export function mergeIcons(...indexes: (IconIndex | undefined)[]): IconIndex {
  return Object.assign({}, ...indexes.map((index) => index ?? {}));
}
