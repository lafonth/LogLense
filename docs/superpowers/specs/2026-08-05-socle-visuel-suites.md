# Socle visuel — ce qui reste après le sous-projet 1

**Date** : 2026-08-05
**Origine** : revue finale de branche du sous-projet 1 (31 commits, puis 4 de correction)

Ce document existe parce que le tri des points reportés vivait dans un espace de travail
temporaire, supprimé une fois le chantier terminé. Il ne consigne que ce qui a été
délibérément laissé en l'état, avec la raison — pas ce qui a été corrigé.

---

## 1. Dette de cohérence visuelle

Ces points ne sont pas des défauts fonctionnels. Ce sont des divergences que la relecture
finale a vues parce qu'elle regardait les dix-sept tâches ensemble, et qu'aucun test ne peut
voir par construction.

| Point | État |
|---|---|
| **Deux rayons pour le même objet** — `Card` est en `rounded-md` (10px), six surfaces réimplémentent une carte en `rounded-sm` (6px). `RotationCards` imbrique même du 6px dans du 10px | À trancher : un seul rayon de carte |
| **Trois polices pour les eyebrows** — `font-sans` sur ~12 sites, `font-mono` sur ~9, `font-display` sur 2. Le spec réserve `IM Fell English` aux eyebrows : appliqué à 2 sites sur 22 |
| **Neuf valeurs d'interlettrage** — de `0.04em` à `0.2em`, toutes en valeurs arbitraires, aucun token |
| **Trois encodages de l'écart** — `StatsTable` code le signe (positif en gris, négatif en bleu), `RotationCards` colore tout écart en bleu, `TalentDiff` oppose bleu et laiton. Les trois s'affichent simultanément sur l'onglet Comparaison |
| **Sept largeurs maximales arbitraires** — 480 à 900px, aucun token de largeur |
| **Deux points de rupture pour le même geste** — certaines surfaces s'effondrent à `sm`, d'autres à `md`. Entre 640 et 767px, une sidebar en panneau glissant cohabite avec une grille déjà sur deux colonnes |
| **`border-muted` sur `AuthHeader`** — sixième orthographe de l'idée « bordure atténuée », le token `border-brass-dim` existe désormais |

**La cause commune** : le bloc `@theme` est additif et ne réinitialise pas les espaces de noms
(`--color-*: initial`, `--text-*: initial`). Toute la palette Tailwind par défaut reste
atteignable, donc la règle « aucune valeur littérale » est une intention, pas une contrainte.
Ajouter ces réinitialisations supprimerait une classe entière de dérive à la source.

## 2. Lacunes du jeu de primitives

- **`ScrollArea` est horizontal uniquement** (`w-full max-w-full overflow-x-auto`). Quatre
  défilements verticaux restent écrits à la main. Une prop d'axe réglerait le problème.
- **`SidebarSwitcher` dans un `Sheet` mobile** reste une colonne de 180px dans un panneau
  pleine largeur, avec une bordure droite orpheline et un titre affiché deux fois.
  `BossSidebar` a le bon traitement (`w-full md:w-[200px]`) ; l'autre consommateur non.
- **`StatTile` n'a aucun consommateur.** Une des huit primitives imposées n'a jamais servi.
  `text-positive` et `text-warning` sont également inutilisés.
- **`Tabs` n'implémente que l'activation au clic** — pas de `tabindex` glissant ni de
  navigation aux flèches. Trois onglets, tous atteignables au clavier ; acceptable, à revoir
  si le nombre augmente.
- **Les couleurs des primitives sont surchargées par `className` sur six sites.** Le même
  mécanisme d'ordre de feuille de style qui rendait les surcharges de taille inopérantes
  s'applique aux couleurs. La réponse systémique est une variante `outline` et un état
  `selected` sur `Button`, pas des surcharges au cas par cas.

## 3. Ce que les tests ne peuvent pas voir

La suite compte 215 tests sous jsdom, qui n'implémente **ni les media queries, ni `inert`, ni
le focus réel**. Une passe Playwright a couvert la page marketing à 360, 768 et 1280 :
aucun débordement horizontal, aucun texte tronqué, anneaux de focus visibles.

**Rien derrière l'authentification Battle.net n'a jamais été rendu dans un navigateur** — le
sélecteur de mode, les deux formulaires de personnage, le formulaire de rapport, le tableau de
résultats, ses trois onglets, et les deux colonnes latérales en panneaux glissants. C'est la
majeure partie de la refonte.

**Ce qui débloquerait ce point** : un stub de session en développement, ou un fournisseur
`next-auth` simulé, pour que Playwright atteigne l'arbre authentifié aux trois largeurs. Le
sous-projet 2 en aura besoin de toute façon.

Deux conséquences directes de cet angle mort :
- La raison d'être de `Sheet` — le basculement au point de rupture — n'est vérifiée par aucun
  test. Ceux qui existent s'exécutent tous contre la branche mobile, que jsdom rend
  inconditionnellement.
- `AIReportTab`, le plus gros composant du projet, n'a **aucun test de composant** et a subi
  trois changements de comportement pendant la migration.

## 4. Points mineurs assumés

`Sheet` rend ses enfants deux fois, une copie par branche de point de rupture — d'où les
`getAllByRole(...)[0]` dans ses tests. `compareUptimes` écarte les buffs que seules les
références maintiennent, alors que la moitié « casts » conserve délibérément ce cas à −100 % :
les deux moitiés du même composant divergent sur un principe. La barre de navigation du
landing a perdu son bouton de connexion en résolvant le doublon, donc rien ne rappelle
l'inscription entre le hero et le pied de page. `rankIn` traite un rang de 0 comme « pris »,
hypothèse non documentée sur les données Blizzard.

## 5. Enchaînement

Le **sous-projet 2** (routes Next.js réelles, état d'onglet dans l'URL, modèle unique de
sélection boss/spec) devrait commencer par le stub de session : il en a besoin, et il
transforme le plus grand angle mort du projet en surface couverte.

Le **sous-projet 3** (distribution, niveau de confiance, capture d'étiquettes) reste
conditionné à ses prérequis hors UX, inchangés : `selectReferencePool` doit remonter son mode
de sélection, `BossResult` doit le porter, et la capture d'étiquettes n'a toujours aucun
stockage.
