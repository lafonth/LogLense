# Comparer deux de ses propres pulls — design

**Date** : 2026-08-08
**Périmètre** : mettre deux combats du même joueur face à face, sans référence externe
**Hors périmètre** : la trajectoire agrégée sur une saison, déjà livrée par la tâche 9

---

## 1. Pourquoi

C'est le seul écran du produit **sans problème de comparabilité**. Même joueur, même spec,
souvent le même équipement à quelques pièces près. Aucun vivier à récupérer, aucun candidat
à disqualifier, aucun repli à expliquer. Le coût est deux fois le chemin rapport, et rien
d'autre.

Et il répond à la question que le raider se pose réellement après une soirée : *est-ce que
ce que j'ai changé a marché*. Le percentile répond à *où je me situe*, ce qui n'est pas la
même question et ne se substitue pas.

Enfin il donne au produit un usage **hebdomadaire** — la reconduction que la section 6.3 de
[ia-ml-architecture.md](../../../ia-ml-architecture.md) identifie comme un fossé à part
entière, l'habitude. Le percentile ne bouge pas assez vite pour justifier une visite chaque
semaine ; deux pulls comparées, si.

## 2. La difficulté réelle

Elle n'est pas dans la comparabilité, elle est dans **ce qui change et qui n'est pas le jeu**.
Deux pulls du même joueur diffèrent par le kill time, par les externals reçus, par la
composition du raid ce soir-là, et parfois par l'équipement. `src/lib/wcl/eligibility.ts` et
`fight-context.ts` savent déjà mesurer ces quatre choses.

L'écran doit donc **décomposer avant de conclure**, exactement comme `trajectory.ts` le fait
sur la saison : matériel, kill time, reste. Sans cette décomposition, l'écran affirmerait
qu'un joueur a progressé alors qu'il a reçu une Power Infusion.

## 3. Décisions

| Sujet | Décision |
|---|---|
| Sélection | **Deux combats du même personnage**, choisis explicitement |
| Références externes | **Aucune.** C'est ce qui rend l'écran bon marché |
| Conclusion | **Décomposée** — matériel, kill time, reste — jamais un simple delta de DPS |
| Contexte de raid | **Affiché**, pas seulement pris en compte : morts, durée, externals |
| Rotation | **Écart par sort**, réutilisation de `rotation-stats.ts` |
| Talents | **Diff**, réutilisation de `talent-diff.ts` |

**Pourquoi la décomposition est obligatoire.** Un écran qui annonce « +12 k DPS » sur deux
pulls dont l'une dure 20 % de moins ment. La décomposition est ce qui distingue cet écran
d'un tableur, et c'est déjà écrit — la réutiliser coûte moins que de l'expliquer.

**Pourquoi la sélection est explicite.** Deviner quelles pulls comparer demanderait de
récupérer l'historique du joueur, donc des requêtes, donc le coût qu'on cherche à éviter. Le
joueur sait quelles deux soirées il veut opposer.

**Pourquoi `rotation-stats.ts` et `talent-diff.ts` sans modification.** Ce sont des fonctions
pures qui prennent une distribution de références. Une distribution à un élément est une
distribution. Si l'un des deux résiste à ce cas, c'est un défaut à corriger là-bas, pas à
contourner ici.

## 4. Ce qui est livré

1. **Sélection de deux combats** d'un même personnage, par code de rapport et combat.
2. **Récupération** par le chemin rapport existant, deux fois, sans nouveau pipeline.
3. **Écran de comparaison** : verdict décomposé en tête — cohérent avec
   [le verdict en tête d'écran](2026-08-08-03-verdict-en-tete-design.md) —, puis rotation,
   talents, dégâts, et le contexte de chaque pull.
4. **Capture au corpus** de la paire comparée, en pointeurs. C'est l'amorce de l'étiquette
   *le conseil a-t-il fait progresser*, nommée comme troisième trou dans
   [ia-ml-architecture.md](../../../ia-ml-architecture.md) §3.

## 5. Ce qui n'est pas livré

- Aucune comparaison entre deux joueurs différents : c'est le mode raid, point 1.
- Aucune agrégation sur plus de deux pulls : c'est la trajectoire, déjà livrée.
- Aucun rapport IA sur la paire, tant que la question du coût LLM n'est pas tranchée.

## 6. Vérification

- Deux pulls identiques rendent un écart nul sur chaque axe, y compris la décomposition.
- Deux pulls dont seul le kill time diffère attribuent l'écart au kill time, pas au reste.
- Une pull où le joueur a reçu un external le signale, et ne compte pas le gain comme du jeu.
- `rotation-stats.ts` et `talent-diff.ts` sont appelés sans modification de leur signature.
- Les quatre portes passent.
