# Socle visuel — design

**Date** : 2026-08-03
**Sous-projet** : 1 sur 3 de la refonte UX
**Suivants** : 2 — navigation et architecture de l'information · 3 — contenu produit
(distribution, confiance, capture d'étiquettes)

---

## 1. Problème

L'UI a été écrite sans système. Constats relevés sur le working tree :

- **229 objets `style={{}}` en dur** sur 33 composants. Tailwind v4 est installé et importé
  dans `globals.css`, aucun fichier de config n'existe, et une seule `className` figure dans
  tout l'arbre. Les styles de boutons sont recopiés à l'identique dans six fichiers.
- **Aucune primitive** — pas de `Button`, `Card`, `Input`, `Select`, `Tabs`.
- **Zéro media query.** Largeurs fixes, sidebars de 200px et 180px, et un
  `paddingRight: '170px'` codé en dur dans `DashboardHeader` pour contourner le header d'auth.
  L'app est inutilisable sur téléphone — là où se lit un lien partagé sur Discord.
- **Aucune échelle** — treize valeurs d'espacement distinctes, des tailles de police de
  `0.62rem` à `3rem` sans progression.

Objectif : un socle sur lequel les sous-projets 2 et 3 s'écrivent, au lieu d'empiler des
styles inline qu'il faudrait réécrire ensuite.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Identité | Même famille — sombre à accent métallique — valeurs retravaillées, pas figées |
| Direction | Fond encre plutôt que quasi-noir, laiton plutôt qu'or vif, écarts en **bleu** |
| Chiffres | Monospace partout |
| Responsive | Mobile dès **360px, sans exception** |
| Arbre de talents | Remplacé par une vue « écarts de build », **représentation unique** |
| Rotation | Une carte par sort, **fourchette** des références, tri par écart |
| Page marketing | Retokenisée et responsive, discours et structure inchangés |
| Technique | Tailwind v4 adopté, tokens en `@theme` |

**Les écarts en bleu, pas en rouge.** Le cramoisi actuel transforme une position dans une
distribution en faute. Le produit dit « voici où tu te situes ». Le rouge reste réservé aux
erreurs et, pour le sous-projet 3, au signalement d'une comparaison illégitime
(`PRODUCT_CONTEXT.md` §7, C2).

**Les chiffres en monospace.** Un serif proportionnel empêche les chiffres de s'aligner en
colonne. Comparer des valeurs est la fonction du produit.

**Une seule représentation des talents.** La topologie d'un arbre sert à construire un build
en jeu, pas à comparer deux builds faits. Maintenir deux vues reproduirait dans l'UI la
duplication qui vient d'être supprimée dans le pipeline WCL.

## 3. Tokens

Déclarés une fois dans `src/app/globals.css` via `@theme`, consommés uniquement par des
classes Tailwind. Les variables actuelles (`--gold`, `--crimson`, `--bg`…) sont supprimées.

**Surfaces** — `bg` `#101019` · `surface` `#16161f` · `surface-raised` `#1c1c26` ·
`border` `#262633` · `border-strong` `#34343f`

**Texte** — `text` `#f2efe9` · `text-muted` `#9d97a8` · `text-dim` `#6b6577`

**Accent** — `brass` `#b08d57` · `brass-bright` `#d7b988`

**Données** — `deviation` `#6ea8c9` · `positive` `#7fc98f` · `warning` `#d9a441` ·
`danger` `#d9636f` (réservé : erreur ou comparaison illégitime)

**Qualité d'objet** — les classes `.pct-legendary` / `.pct-epic` / `.pct-rare` /
`.pct-uncommon` / `.pct-common` de `globals.css` sont **conservées telles quelles**. C'est une
convention du domaine que les joueurs lisent sans légende.

**Typographie** — `IM Fell English` réservé aux eyebrows et titres de section, en lettrage
espacé · corps en sans-serif système · **tous les chiffres** en `Fira Code` / `ui-monospace`.
Échelle : `0.6875` `0.75` `0.875` `1` `1.25` `1.5` `2` `2.5` rem.

**Espacement** — `4` `8` `12` `16` `24` `32` `48` `64`
**Rayons** — `2` `6` `10` `999`
**Ruptures** — base 360 · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280

## 4. Primitives — `src/components/ui/`

`Button` · `Card` · `Input` · `Select` · `Tabs` · `StatTile` · `ScrollArea` · `Sheet`

`Badge`, `ErrorBanner` et `LoadingSpinner` existent déjà et sont migrés vers les tokens sans
changer d'API.

**`Sheet`** est le comportement mobile des sidebars. Sous `md`, `BossSidebar` et
`SidebarSwitcher` ne sont plus des colonnes : un bouton affiche la sélection courante — le nom
du boss, ou celui du personnage — et l'ouvre dans un panneau glissant depuis le bas, qui se
ferme à la sélection. Au-dessus de `md`, la colonne latérale est conservée.

## 5. Nouveaux composants

### `TalentDiff.tsx` — remplace `TalentTree.tsx`

**Entrée** : les talents du joueur et ceux des références, tels que fournis aujourd'hui —
`CharacterStats.talents`, un `Record<nodeId, rank>` — plus les libellés résolus depuis
`src/data/talents/spec-*.json`.

**Trois groupes** :

- **Toi seul** — nœuds présents chez le joueur, absents de *toutes* les références.
- **Eux seuls** — nœuds présents chez au moins une référence, absents chez le joueur.
- **Communs** — masqués, remplacés par un compteur « N nœuds identiques ».

Chaque entrée porte le nombre de références concernées, sous la forme `k / n` — deux
références sur trois l'ont pris. C'est la lecture en distribution que vise le sous-projet 3,
disponible dès maintenant sans changement du pipeline.

**Zéro référence** : les groupes de comparaison disparaissent ; seule la liste des talents du
joueur est affichée, avec une mention explicite qu'aucune comparaison n'est disponible.

### `RotationCards.tsx` — remplace `RotationTable.tsx`

**Entrée** : `RotationSummary.casts` du joueur et des références —
`Record<nomDuSort, { casts, perMin }>`.

Une carte par sort, contenant : le nom, ta valeur en `perMin`, la **fourchette** des
références (min et max de leurs `perMin`), une barre situant ta position par rapport à cette
fourchette, et l'écart en pourcentage.

**Définition de l'écart**, pour lever toute ambiguïté :

```
médiane      = médiane des perMin des références pour ce sort
écart (%)    = (perMin du joueur − médiane) / médiane × 100
tri          = |écart| décroissant
```

Un sort absent chez le joueur mais présent chez les références compte comme `perMin = 0`, donc
un écart de −100 % : c'est une information, pas une ligne à masquer. Un sort absent de toutes
les références est affiché sans fourchette ni écart.

**Zéro référence** : les valeurs du joueur sont affichées seules, sans barre ni écart, triées
par `perMin` décroissant.

## 6. Migration

**Approche** : primitives et tokens d'abord, puis migration surface par surface, un commit par
surface.

Écartés — la bascule globale des tokens en une fois : 33 composants cassés simultanément,
revue impossible. La construction d'une UI parallèle puis bascule : c'est dupliquer le travail
qu'on vient de dédupliquer ailleurs.

Pendant le chantier, les surfaces migrées et non migrées coexistent. C'est accepté : la
coexistence est visible et bornée dans le temps.

**Ordre** :

1. Tokens `@theme` + primitives `ui/` + tests.
2. `TalentDiff` et `RotationCards` + tests, avant toute migration.
3. Résultats — `OverviewTab`, `ComparisonTab`, `DpsBanner`, `StatsTable`, `DamageBreakdown`,
   `BossContentPanel`, `BossSidebar`.
4. Coquilles — `CharacterDashboard`, `ReportDashboard`, `DashboardHeader`, `SidebarSwitcher`,
   `UserCharacterSwitcher`, `CharacterSwitcher`.
5. Formulaires — `CharacterForm`, `LoggedInCharacterForm`, `ReportForm`, `SpecSelector`,
   `RealmAutocomplete`, `EncounterSelector`, `DifficultyRegionFields`. `formStyles.ts` est
   supprimé à la fin de cette étape.
6. `AIReportTab`, `ModeSelector`, `AuthHeader`.
7. `MarketingLanding`.

**Délégation** : les étapes 3 à 7 sont mécaniques une fois le système posé — appliquer des
tokens et des primitives existants à un composant dont le comportement ne change pas. Elles
vont à des agents **Sonnet**, une surface par agent. Restent en session principale : les
étapes 1 et 2, la revue de chaque retour, et les arbitrages de mise en page mobile.

## 7. Vérification

Après chaque commit, les quatre commandes du hook pre-commit :

```
pnpm typecheck   pnpm test   pnpm lint   pnpm format:check
```

**Les tests existants restent verts sans être réécrits.**
`DifficultyRegionFields.test.tsx` et les tests d'intégration `ReportForm`,
`LoggedInCharacterForm` et `preferences-toggle` interrogent le DOM par rôle et par texte, pas
par classe. Une migration de style qui les casse signale une régression de comportement, pas
un faux positif.

**`TalentDiff` et `RotationCards`** arrivent avec leurs tests, écrits avant l'implémentation :
répartition en trois groupes, compteur `k / n`, masquage des nœuds identiques, calcul et tri
de l'écart, sort absent chez le joueur, cas à zéro référence.

**Vérification visuelle** avec la skill `webapp-testing` (Playwright) sur `pnpm dev`, à
**360**, **768** et **1280** pour chaque surface migrée. Critères explicites :

- aucun débordement horizontal du `body` ;
- aucun texte tronqué ni chevauché ;
- tous les contrôles atteignables au clavier, avec un focus visible.

**Contrôle de fin de sous-projet** : parcourir le flux complet aux trois largeurs — formulaire
→ résultats → onglets → rapport IA — en mode personnage et en mode rapport.

## 8. Hors périmètre

Les sous-projets 2 et 3 ne sont pas traités ici. Le 3 a des prérequis hors UX :
`selectReferencePool` doit remonter son mode de sélection, `BossResult` doit le porter, et la
capture d'étiquettes n'a aujourd'hui aucun stockage (`PRODUCT_CONTEXT.md` §7, D2).

La monétisation n'est pas engagée par ce sous-projet : aucun élément du socle ne dépend d'un
découpage gratuit/payant.
