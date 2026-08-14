# Rapport de décisions — exécution du plan `melodic-crunching-squid`

Plan source : `C:\Users\lafon\.claude\plans\melodic-crunching-squid.md`
Exécution : 2026-08-13 → 2026-08-14, en autonomie, sur `main`, sans branche.
Consigne appliquée : **à chaque arbitrage, prendre l'option recommandée par le plan.**

Sept commits, tous passés par le hook pre-commit (`typecheck`, `lint`, `format:check`,
`test`). État final : **94 fichiers de test, 915 tests, tout au vert.**

---

## 1. Ce qui a été fait

| Item | Commit | Décision | Motif |
|---|---|---|---|
| C1 | `502b6a7` | fait | recommandation unique du plan : le seul chiffre **faux** à l'écran |
| C2 | `e910cf5` | fait | quota facturé avant contrôle des identifiants + route sans `try/catch` |
| C3 / F2 | `f2e98fe` | fait | même item vu deux fois par le plan ; serveur déjà prêt |
| C4 + C6 | `5e55bbe` | faits ensemble | le plan l'exige : C6 touche exactement les lignes de C4 |
| C5 | `5e55bbe` | fait | l'effectif à côté de `referenceIlvl`, coût nul |
| O1 | `10430fa` | fait, **option 2** | option recommandée en toutes lettres par le plan |
| F1 | `b242281` | fait | « où est le retard », aucune IA, fonctions pures déjà écrites |

## 2. Ce qui a été écarté, et pourquoi

| Item | Décision | Motif |
|---|---|---|
| O2 (26 requêtes de vérification) | **écarté** | le plan prescrit lui-même « mesurer d'abord (les refus de `guardWclSpend` sous charge), optimiser ensuite ». Rien à mesurer sans trafic beta. |
| O3 (buffs payés deux fois) | **écarté** | 3 requêtes sur 41, zéro latence, **écran : rien**. Le plan le liste explicitement « pour qu'il soit écarté, pas fait ». |
| O4 (résultats au fil de l'eau) | **écarté** | supprime `MAX_ENCOUNTERS_PER_REQUEST = 20` comme borne serveur ; il faudrait reconstituer la borne autrement. Le plan le range derrière O1 et demande de mesurer la dispersion d'abord. |
| O5 (vivier) | **rien à faire** | vérifié et clos par le plan lui-même. |
| F3 (comparaison de deux pulls) | **existe déjà** | `PullComparisonDashboard.tsx`, `/api/pull-comparison`. |
| F4 (distribution de références) | **écarté par décision datée** | PRODUCT_CONTEXT §9 : « pas davantage de travail de comparabilité ». |
| F5 (addon in-game) | **non lancé** | second produit : Lua, format d'upload, persistance permanente qui n'existe pas (tout le stockage est à TTL par choix CGU). |

---

## 3. Les arbitrages que j'ai tranchés seul

Le plan ne descendait pas jusqu'à ces choix. Ce sont ceux à relire en priorité.

### C1 — la provenance du DPS suit le correctif

Le plan signalait le piège : `recordExposure` écrivait `dpsSource` **affirmé par la route**
(`'damage-table'` côté rapport, `'ranking'` côté personnage). Corriger la source du DPS sans
toucher au drapeau aurait rendu le corpus déjà écrit inanalysable.

**Décision** : le drapeau ne vient plus de l'appelant mais de **chaque résultat**
(`character.dpsSource`). Deux boss d'une même requête peuvent ne pas l'avoir mesuré pareil —
un boss dont les rankings manquent retombe sur la table de dégâts. Une route qui uniformise
la provenance ment sur son propre corpus.

Le schéma d'exposition **n'a pas changé de version** (`v4`, inchangé depuis `fce2e3b`) : la
forme de l'enregistrement est la même, seule la valeur du champ `dpsSource` devient fiable.

### C4 — la forme de la clé de cache

Le plan proposait `bossIdx:spec:fightId`. **Retenu tel quel**, mais avec deux précisions :

- la clé retombe sur `default` quand la spec ou la pull n'est pas surchargée, pour que le
  premier résultat (celui de l'analyse initiale) soit réutilisé au retour en arrière ;
- le cache reste invalidé sur changement de personnage/serveur/difficulté, comme avant. Un
  cache qui survivrait à un changement de personnage servirait le résultat d'un autre joueur.

### C6 — dédupliqué, sans extraire de hook

Les trois blocs `fetch`/erreur/commit de `useAnalysis.ts` passent par une seule fonction
interne. **Je n'ai pas extrait de hook séparé** : le plan dit « coût nul si couplé à C4,
gaspillé sinon », et un hook `useBossAnalysis` aurait été un chantier autonome, pas un
couplage. 282 lignes touchées, 167 supprimées.

### C5 — `referenceIlvlCount` plutôt qu'un seuil de masquage

Le plan laissait le choix : « l'effectif à côté du chiffre, **ou** le chiffre masqué en
dessous d'un seuil ». **Retenu : l'effectif affiché**, jamais le masquage.

Masquer aurait demandé d'inventer un seuil ; afficher « sur 1 référence » dit exactement ce
que la donnée porte et laisse le lecteur juger. C'est aussi la règle qui a servi ensuite
pour F1 (voir plus bas).

Effet de bord assumé : `referenceIlvlCount` est un champ obligatoire de `Comparability`, donc
onze fixtures de test ont dû l'apprendre.

### O1 — option 2, et deux choix en dessous

Le plan recommandait explicitement l'option 2 : **paralléliser les `RPUSH`, garder les
décomptes de quota séquentiels**. Grouper les quotas aurait demandé d'ajouter un paramètre de
coût à `consumeQuota` — et un plafond franchi par un lot compté en bloc n'est plus un
plafond.

Deux décisions non couvertes par le plan :

- **`Promise.allSettled`, pas `Promise.all`.** Sur un rejet, `all` rend la main pendant que
  les autres `RPUSH` sont encore en vol, et la fonction serverless les emporte. Le refus
  d'une écriture ne doit pas coûter les autres. Un test le fige (`landed === 2` sur trois
  écritures dont une refusée) — il échoue sous `Promise.all`.
- **`break`, pas `return`, sur quota épuisé.** Les payloads déjà accumulés partent quand
  même ; seule la suite est abandonnée.

L'`await` avant la réponse reste non négociable et documenté : une promesse laissée en `void`
meurt avec la fonction serverless.

### F1 — la règle vit dans une fonction pure, pas dans le composant

Trois décisions ici, toutes discutables, toutes à relire.

**1. Nouveau module `src/lib/comparison/leading-gap.ts`, pas de logique dans le composant.**
La règle « quand l'écran a le droit de nommer un sort » est vérifiée dans la fonction pure
pour qu'un second appelant — le prompt IA, par exemple — ne puisse pas la contourner sans le
vouloir.

**2. La ligne se tait quand le verdict se tait.** `unreliable` et `none` refusent
délibérément de chiffrer le delta de DPS parce que le panel ne le porte pas. Nommer un sort
*responsable de cet écart* dirait par la bande ce que la phrase du dessus refuse de dire.
C'est l'invariant de `verdict.ts` étendu d'un cran.

**3. Un plancher de bruit codé en dur à 10 %.** Sur trois minutes, un sort lancé une fois de
plus produit déjà quelques pourcents. Désigner cela comme *l'*endroit du retard serait
affirmer plus que les données ne portent. **C'est un seuil que je n'ai pas mesuré** — c'est
le point le plus arbitraire de tout le lot, et celui que je remonterais en premier si la
ligne se révélait bavarde en usage réel.

Deux choix de rendu :

- **Même `Card` que le verdict, pas un second bandeau.** Ce n'est pas un second message :
  c'est la fin de la phrase du dessus.
- **L'effectif des références dans la phrase** (« across 3 references »), par application
  directe de la leçon C5 : une médiane sur une référence ne doit pas se lire comme une
  médiane sur trois.

Aucun calcul nouveau : `compareCasts` triait déjà les sorts par écart **pondéré par leur part
de dégâts**, et sa tête est la réponse. Cette pondération est ce qui empêche la ligne de
nommer un Barkskin à +200 % qui ne coûte rien — un test le fige explicitement.

---

## 4. Points de vigilance pour la relecture

1. ~~**`NOISE_FLOOR_PCT = 10`**~~ — **relu et remplacé**, voir §6.
2. ~~**Formulation anglaise de la ligne F1**~~ — **relue et réécrite**, voir §6.
3. **Corpus d'exposition** — le schéma reste en `v4`, mais les enregistrements écrits avant
   `502b6a7` portent une provenance **affirmée par la route**, pas mesurée. Ils restent
   lisibles ; leur `dpsSource` est moins fiable que celui des enregistrements postérieurs, et
   rien dans l'enregistrement ne permet de les distinguer autrement que par leur date.
4. **O2 et O4 attendent une mesure, pas un arbitrage.** Ils redeviennent des candidats dès
   que la beta de guilde produit du trafic : refus de `guardWclSpend` pour O2, dispersion
   entre boss concurrents pour O4.

---

## 5. Ce que la contrainte anti-gadget a donné

Aucun des sept items n'a introduit d'IA, et F1 est le cas intéressant : le substitut bon
marché prescrit par la contrainte 2 — « le sort au plus grand écart normalisé » — **gagne**
contre n'importe quel modèle. La valeur ajoutée est de la hiérarchisation, pas du calcul.
Le plan le formulait déjà ainsi : « c'est la bonne nouvelle, pas un obstacle ».

---

## 6. Suites données à la relecture (2026-08-14, après revue)

Les deux premiers points de vigilance ont été repris. Le reste du §4 tient toujours.

### Le seuil de bruit ne mesurait pas ce que son propre commentaire défendait

`NOISE_FLOOR_PCT = 10` argumentait en **lancers** (« un sort lancé une fois de plus sur
trois minutes ») et filtrait en **pourcentage** — ce qui inverse l'intention : à 0,7 contre
1,0 lancer par minute, un cast d'écart fait +43 % et passait ; à 40 contre 44, douze casts
d'écart ne font que +10 % et étaient réduits au silence. Second défaut, plus discret : le
tri de `compareCasts` classe par écart **pondéré par la part de dégâts**, et le filtre
lisait le `deviationPct` nu — il taisait donc le sort principal que la pondération venait
de promouvoir.

Le seuil unique est remplacé par trois conditions, dont deux sortent de la donnée :

- **hors de `[referenceMin, referenceMax]`** — le plancher est la dispersion des références
  entre elles. Il s'adapte par sort et par panel, ne se règle pas à la main, et il est déjà
  dessiné à l'écran par `RotationCards` : la règle se relit dans l'onglet.
- **au moins `MIN_CAST_DELTA = 2` lancers** sur la durée réelle de la pull, via
  `fightDurationMs`. Le seuil subsiste, mais dans l'unité de son propre argument — une
  quantité que le lecteur peut compter dans son log.
- **au moins `MIN_REFERENCES = 2` références.** Nommer *le* sort où l'écart se lit est un
  superlatif sur une distribution ; sur une seule référence, min, max et médiane sont le
  même point. Ce n'est **pas** le masquage refusé en C5 : là, la donnée portait la valeur et
  seul son effectif manquait ; ici la donnée ne porte pas la comparaison qu'on lui ferait
  dire.

Quand la tête du tri est réduite au silence, la ligne se tait — on ne retombe pas sur le
sort suivant, qui coûte par construction moins cher.

### La formulation affirmait une direction que la donnée ne porte pas

Le sort de tête est celui dont l'écart **coûte** le plus, et son signe est libre : on peut
être en retard de DPS sur un sort qu'on lance *plus* que les références. « It reads first on
X » dans un verdict `gap` faisait donc lire l'inverse des chiffres affichés juste en dessous.
Le branchement `gap` / `ahead` est supprimé : une seule phrase, neutre en direction, et ce
sont les deux cadences qui disent le sens.

> Your rotation diverges most on **Rip**: `2` casts a minute against `4`, across `2`
> references.

Deux corrections au passage : « land » n'est plus employé deux fois pour deux choses dans la
même carte, et le pluriel de `reference` n'est plus écrit en dur — « across 1 references »
était rendu tel quel, et le test existant ne l'attrapait pas parce qu'il n'assertait que sur
l'amorce de la phrase.
