# Comparabilité — ce qui reste après le chantier

**Date** : 2026-08-06
**Origine** : revue finale de branche du chantier « comparabilité légitime et visible »
(9 commits, `60378d6..bbf6990`)

Ce document existe parce que le tri des points reportés vivait dans un espace de travail
temporaire, supprimé une fois le chantier terminé. Il ne consigne que ce qui a été
délibérément laissé en l'état, avec la raison — pas ce qui a été corrigé.

---

## 1. Ce que la revue finale a trouvé, et qui est corrigé

Pour mémoire, parce que ces défauts disent quelque chose sur la manière dont ils sont
apparus.

**La comparaison du joueur avec lui-même.** Le log du joueur se trouve dans le vivier dès
que son parse figure dans les dix pages récupérées. Contre lui-même son écart d'ilvl et son
écart de kill time valent exactement zéro : il obtenait donc la meilleure distance possible
et était retenu comme référence P1, le bandeau annonçant « Comparable » pour une comparaison
d'un joueur avec lui-même.

Ce défaut est **né du chantier**. L'ancien code triait par DPS sur une seule page : se
sélectionner soi-même y était accidentel. Le tri par proximité sur mille candidats le rend
systématique. Une amélioration de la sélection a créé un défaut que la sélection naïve
n'avait pas — aucune des six revues par tâche ne pouvait le voir, chacune ne regardant qu'une
tâche.

**Les tests qui ne testaient rien.** Deux cas passaient indépendamment du code sous test :
`caps the pool at TOP_N` construisait des candidats sans `bracketData`, donc toutes les
distances valaient `Infinity` et l'assertion tenait par le seul `.slice()` — le test aurait
survécu à la suppression complète du calcul de score. Le test structurel de `Sheet` acceptait
`md:relative`, précisément la régression qu'il existe pour attraper.

## 2. Points laissés en l'état

| Point | Raison |
|---|---|
| **`Comparability` et `ComparabilityLevel` n'ont pas le même domicile** — le second est déclaré dans `src/lib/wcl/comparability.ts` et réexporté par `src/types/index.ts`, qui déclare le premier | Cosmétique : aucun cycle aujourd'hui, `comparability.ts` n'important que `./constants`. À traiter en déplaçant `ComparabilityLevel` vers `src/types` le jour où l'un des deux bouge |
| **Deux tests s'appuient sur `container.innerHTML` contenant `text-danger`** | Coupler un test à un nom de classe est fragile, mais jsdom ne sait pas calculer une couleur, et `text-danger` est **la règle testée**, pas un détail d'implémentation : `CLAUDE.md` la réserve aux comparaisons illégitimes. Si on resserre un jour, viser l'élément qui porte le libellé, pas tout le sous-arbre |
| **Le test structurel de `Sheet` vérifie le positionnement, pas l'ordre de peinture** | Un `z-index` posé plus tard sur le fond passerait au travers. jsdom ne peint pas ; seul un navigateur réel le verrait |

## 3. Ce que le chantier n'a pas traité

Inchangé depuis la spec de cadrage, et rappelé ici pour que la suite parte du bon endroit :

- **Les critères éliminatoires** — externals reçus, palier de set bonus — restent absents.
  Ils exigent d'inverser le pipeline : récupérer les buffs et le `CombatantInfo` de dizaines
  de candidats *avant* de choisir, là où tout se récupère aujourd'hui après. Le bloc
  `comparability` est le point d'accroche prévu.
- **La capture d'étiquettes** attend toujours une décision de stockage : le projet n'a
  qu'un Redis en `GET`/`SET`.
- **La boucle sur les logs de référence eux-mêmes reste séquentielle** (C6). Seule la
  constitution du vivier a été parallélisée.
- **Le percentile diverge entre les deux chemins d'analyse** — 81,1 % par le chemin
  personnage contre 67 % par le chemin rapport, pour le même kill, sous le même libellé.
  Consigné en section 7 de `PRODUCT_CONTEXT.md`. À confirmer contre la documentation WCL
  avant toute correction : deux chiffres qui coïncideraient par hasard ne prouveraient rien.

## 4. Ce que la vérification a coûté, et ce qu'elle a rendu

La vérification fonctionnelle — rejouer le cas réel dans un navigateur, aux trois largeurs —
a trouvé un défaut **sans rapport avec le chantier** : le fond du `Sheet` étant en
`absolute` et le panneau un bloc statique, le fond se peignait par-dessus le panneau. Sur
mobile, chaque clic dans le panneau atteignait le fond et refermait la feuille au lieu de
sélectionner. Impossible de choisir un boss à 360 px. Les six tests de `Sheet` passaient :
jsdom ne peint pas et ne fait pas de test de recouvrement.

C'est le troisième défaut de cette famille sur ce projet, après `inert` et la hauteur du
tableau de résultats. **Aucune suite sous jsdom ne les verra**, quel qu'en soit le nombre.
La seule contre-mesure qui fonctionne est de rejouer le parcours dans un vrai navigateur, et
elle est aujourd'hui manuelle.
