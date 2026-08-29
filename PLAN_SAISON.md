# Plan de saison — exécution, une étape par session

Écrit le **2026-08-27**, semaine 2 de la saison 2 de Midnight. Il exécute le §6 de
[`PRODUCT_CONTEXT.md`](PRODUCT_CONTEXT.md), dans un ordre qui n'est pas exactement le sien —
la divergence est motivée en fin de fichier.

**Ce fichier est la mémoire du plan.** Chaque session part d'un contexte vide : elle lit son
étape ici, l'exécute, écrit sa ligne de journal, commit. Rien d'autre ne se transmet d'une
session à la suivante.

## Comment on s'en sert

1. `/clear` avant chaque étape. Jamais deux étapes dans une session.
2. Coller le **prompt de l'étape** tel quel. Il contient tout ce qu'il faut lire.
3. Terminer par la ligne de journal et un commit sur `main`. **On ne pousse pas.**
4. Les quatre vérifications passent avant tout commit de code — le hook pre-commit les
   exécute : `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check`.

## Le critère qui ordonne tout

La fenêtre de saison se referme vers la **semaine 4**, quand les guides de spec se
stabilisent. Ce qui ne fait venir personne maintenant, ou ne rend pas le prix décidable
ensuite, est sous la ligne de coupe et **ne se fait pas cette saison**.

## Règle permanente, active dès l'étape 1

**Aucun prix public.** Ni tarif, ni panier, ni bouton d'abonnement sur une page accessible,
tant que l'étape 7 n'a pas tranché. C'est le §5 de `PRODUCT_CONTEXT.md`, et le précédent
Raider.io le rend concret. Le badge `Pro` reste : il ne verrouille rien.

**Amendement du 2026-08-29, à l'étape 7.** L'étape 7 a tranché le modèle mais pas le point de
prix, faute des montants de l'étape 6. La règle reste donc active **au-delà de son commit**, ce
que le plan ne prévoyait pas. Ce qui la lève, et rien d'autre : les réponses de
`QUESTION_PRIX.md` au journal, puis le point de la fourchette `10`–`15 €` écrit en toutes
lettres au §4.4 de `PRODUCT_CONTEXT.md`.

---

## Étape 1 — Une URL profonde et partageable par résultat

**Pourquoi en premier** : il n'y a aujourd'hui qu'un seul `src/app/page.tsx`. Un résultat vit
dans l'état client, donc rien n'est linkable, citable ou indexable. Tout le volet acquisition
est bloqué par cette lacune technique, pas par une décision marketing.

**À lire d'abord** : `src/app/page.tsx`, `src/lib/wcl/result-snapshot.ts`,
`docs/02-ui-flows.md`.

**Fait quand** :

- une analyse rendue a une URL stable qu'on peut coller ailleurs et rouvrir ;
- la page se reconstruit depuis l'instantané `result-snapshot` sans rejouer une requête WCL
  tant que le TTL de 24 h tient ;
- au-delà du TTL, l'URL reste valide et relance l'analyse au lieu de rendre une erreur ;
- les quatre vérifications passent.

**Prompt** :

> Étape 1 de `PLAN_SAISON.md`. Lis l'étape, puis `src/app/page.tsx`,
> `src/lib/wcl/result-snapshot.ts` et `docs/02-ui-flows.md`. Propose un plan de routage —
> pas de code encore — pour donner une URL profonde et partageable à chaque résultat
> d'analyse. Dis explicitement ce que devient l'état client actuel.

---

## Étape 2 — L'écran de partage, et l'aveu d'échec remonté

Deux tâches d'interface, une seule session : chacune seule ne vaut pas un démarrage à froid.

**a. L'écran de partage.** Une carte, lisible sans contexte, qui montre l'ilvl du vivier
contre celui du joueur et l'écart de DPS avant / après filtrage. C'est l'objet que les gens
repartagent — pas l'application. Le chiffre de référence mesuré est `55k → 25k` sur un vivier
à ilvl `292` contre `284`.

**b. L'aveu d'échec du filtre, en tête.** Aujourd'hui c'est un bandeau parmi d'autres. C'est
la seule position que le §2 de `PRODUCT_CONTEXT.md` tient pour défendable : nous sommes le
seul outil qui refuse de comparer quand la comparaison n'est pas légitime, **et qui le dit**.
Un visiteur qui ne le voit pas nous lit comme un Warcraft Logs de plus.

**À lire d'abord** : les composants de l'onglet Comparison, `src/lib/comparison/findings.ts`,
`src/app/globals.css` (bloc `@theme`).

**Fait quand** : la carte est atteignable depuis un résultat, tient dans une capture d'écran,
n'utilise aucune valeur littérale de couleur ou d'espacement, et n'affiche aucun prix.
L'avertissement de comparabilité passe au-dessus du résultat. Les quatre vérifications
passent.

**Prompt** :

> Étape 2 de `PLAN_SAISON.md`, les deux volets a et b dans la même session. Lis l'étape puis
> les composants de l'onglet Comparison et `src/lib/comparison/findings.ts`. Rappel : rouge
> réservé aux erreurs, chiffres en `font-mono`, aucun `style={{}}`, aucune surcharge de
> taille sur une primitive.

---

## Étape 3 — Le coût réel d'une analyse, branché et lu

**Pourquoi avant d'ouvrir la vanne** : on n'ouvre pas l'accès à des inconnus sans savoir ce
que coûte un rapport. Le relevé de jetons est déjà capturé et persisté au corpus depuis le
commit `36c72b8` — entrée neuve, cache lu, cache écrit, séparément, `null` disant non mesuré
et jamais zéro. Personne ne l'a encore lu.

**À lire d'abord** : `src/lib/labels/usage.ts`, `src/lib/labels/record-usage.ts`,
`docs/05-capture-de-donnees.md`.

**Fait quand** : une commande rend le coût marginal moyen d'un rapport **en euros**, par
fournisseur, et le nombre d'analyses déjà servies. Le chiffre est reporté dans le journal en
bas de ce fichier — c'est l'intrant des étapes 6 et 7.

**Prompt** :

> Étape 3 de `PLAN_SAISON.md`. Lis l'étape puis `src/lib/labels/usage.ts` et
> `src/lib/labels/record-usage.ts`. Écris un script de lecture qui rend le coût marginal
> moyen d'un rapport en euros par fournisseur. Ne modifie pas la capture, lis-la.

---

## Étape 4 — La page publique et l'entrée en une question

**Le problème traité** : à l'étape 5, des inconnus arrivent. Aujourd'hui ils tombent sur un
mur d'allowlist, et derrière ce mur sur quatre modes (`character`, `report`, `raid`, `pull`)
entre lesquels un nouveau venu ne peut pas choisir.

**Fait quand** : une page publique montre un exemple d'analyse jouable sans compte ; l'entrée
par défaut est une seule question (« ton personnage »), les trois autres modes restant
atteignables sans être proposés à froid ; aucun prix nulle part. Les quatre vérifications
passent.

**Prompt** :

> Étape 4 de `PLAN_SAISON.md`. Lis l'étape puis `src/app/page.tsx` et `docs/02-ui-flows.md`.
> Propose d'abord le découpage de la page publique et de l'entrée par défaut, puis
> implémente. Rappel de la règle permanente : aucun prix, aucun panier, aucun bouton
> d'abonnement.

---

## Étape 5 — Le canal, l'ouverture, la publication

Une session, trois actes indissociables, dans cet ordre. C'est l'étape qui produit le premier
trafic réel — et la seule qu'on ne peut pas rejouer : un canal se brûle une fois.

1. **Choisir un canal, un seul.** r/CompetitiveWoW ou un Discord de classe. Écrire le choix
   et son motif dans le journal.
2. **Ouvrir `BETA_ALLOWLIST`** pour ce canal, sur deux semaines. Le plafond WCL commun livré
   au commit `65c2ec3` est le garde-fou : vérifier qu'il est bien en place avant d'ouvrir.
3. **Publier le `55k → 25k`** — comme un post de méthode, pas comme une annonce produit.
   « Voici pourquoi ton retard est surestimé » se lit ; « voici mon outil » se scrolle. Plus
   de la moitié de ce qu'on annonçait au joueur comme son retard venait de l'équipement des
   références : c'est le seul contenu d'acquisition dont nous disposons qui ne soit pas
   interchangeable.

**Fait quand** : le canal est nommé au journal, l'allowlist est ouverte avec sa date de
fermeture, le post est en ligne, son lien est au journal.

**Prompt** :

> Étape 5 de `PLAN_SAISON.md`. Lis l'étape, puis `PRODUCT_CONTEXT.md` §3 et §0. Aide-moi à
> arbitrer le canal, vérifie que le plafond WCL commun est bien en place avant qu'on ouvre
> l'allowlist, et rédige le post. Ton de méthode, pas d'annonce produit, et aucun prix.

---

## Étape 6 — Chiffrer la disposition à payer

**Le trou du dossier** : le sondage de guilde (~25 raiders) a validé la douleur, jamais le
prix. Aucun raisonnement ne comblera ça, et 25 amis ne chiffrent pas un marché.

**Fait quand** : dix raiders **hors guilde**, issus du canal de l'étape 5, ont donné un
montant en euros pour un pass de saison. La distribution des réponses est au journal, pas sa
moyenne seule.

**Repères de marché à poser dans la question** : Warcraft Logs facture `$2` basique / `$5`
premium par mois — c'est l'ancre de tout le marché. WowCoach.gg va de `$5.99` à `$24.99` par
mois, et son gratuit est généreux : tout ce qui n'est pas IA y est gratuit et illimité.

**La question est écrite** : [`QUESTION_PRIX.md`](QUESTION_PRIX.md) — à qui l'envoyer, les
trois points, et ce que les réponses ont le droit de trancher. Elle corrige au passage l'ordre
posé par le journal de l'étape 3 : le fournisseur d'IA ne se demande pas ici, il se choisit à
l'étape 7 une fois le prix connu.

**Prompt** :

> Étape 6 de `PLAN_SAISON.md`. Lis l'étape puis `PRODUCT_CONTEXT.md` §4. Rédige la question
> de prix à poser aux dix raiders — une question qui donne un montant, pas un « oui je
> paierais ».

---

## Étape 7 — Trancher le modèle, et l'écrire

**La décision** : abonnement mensuel ou pass de saison. C'est le seul écart de modèle avec le
concurrent, et il est du bon côté — sur un palier de trois mois, un pass est plus cher à
l'unité, moins cher au total, et ne demande pas au joueur de penser à annuler. Il se décide
avec le coût de l'étape 3 et les montants de l'étape 6 en main, **pas avant**.

**Fait quand** : le §4 de `PRODUCT_CONTEXT.md` porte la décision, le prix, et la marge par
utilisateur qui en découle. La règle permanente ci-dessus est levée à partir de ce commit.

**Prompt** :

> Étape 7 de `PLAN_SAISON.md`. Lis l'étape, le journal de ce fichier (étapes 3 et 6), et
> `PRODUCT_CONTEXT.md` §4. Tranche mois contre pass de saison, avec le prix, et réécris le
> §4.4.

### État au 2026-08-29 : tranchée à moitié, et c'est l'étape qui l'impose

Le §4.4 est réécrit et porte le modèle, la fourchette, la marge mesurée, le plafond d'usage, le
fournisseur et la couche guilde. **Le point de prix manque**, parce que l'étape 6 n'a produit
que sa question : le post de l'étape 5 n'est pas en ligne, donc personne n'est entré, donc
aucune réponse n'existe. « Il se décide avec les montants de l'étape 6 en main, **pas avant** »
vaut aussi contre l'envie de clore l'étape.

**Reste à faire — étape 7 bis, une demi-session** : exécuter les actes 2 et 3 de l'étape 5,
poser la question de l'étape 6, reporter les réponses **brutes** au journal, puis écrire le
point dans la fourchette en appliquant les trois règles de lecture déjà posées au §4.4. Rien
d'autre n'est à rouvrir — ni le modèle, ni la marge, ni le plafond.

**Prompt (7 bis)** :

> Étape 7 bis de `PLAN_SAISON.md`. Les réponses de `QUESTION_PRIX.md` sont au journal. Lis le
> §4.4 de `PRODUCT_CONTEXT.md`, applique ses trois règles de lecture pour fixer le point dans la
> fourchette `10`–`15 €`, et lève la règle « aucun prix public » dans le même commit.

---

## Sous la ligne de coupe — pas cette saison

Ce n'est pas un retard à rattraper. Ces points sont hiérarchisés, datés, et volontairement non
programmés.

| Point                                | Pourquoi pas maintenant                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Lire le corpus accumulé**          | §6.5. L'actif dort, mais il ne fait venir personne cette saison. Dette, pas urgence         |
| **Le mode `pull` remonté**           | Levier de rétention semaine 4, pas d'acquisition semaine 2                                  |
| **Historique de progression**        | Rouvre l'arbitrage TTL du §5. Ne se lance qu'après l'étape 7                                 |
| **BYOK comme levier de marge**       | Ne compte qu'à un volume que nous n'avons pas                                               |
| **Préventes de pass guilde**         | Engagement de livraison sur une vue qui n'existe pas                                        |
| **La vue roster**                    | Voir ci-dessous                                                                             |

### Où ce plan s'écarte du §6 de `PRODUCT_CONTEXT.md`

Le §6 place la **vue roster** en quatrième position sur cinq ; ce plan la met en dernier, sous
la ligne de coupe. Le motif du document est juste — « le premier qui livre définit ce que
l'abonnement de guilde veut dire », et le concurrent a annoncé sa grille avant nous. Mais
c'est une course que nous ne pouvons pas gagner : il a l'infrastructure et les utilisateurs,
nous n'avons ni l'un ni l'autre, et elle attend une infra v2 qui n'existe pas. La construire
maintenant dépense le seul trimestre où l'argument individuel porte, pour arriver deuxième sur
le terrain d'un autre.

Une deuxième divergence, mineure : le §6 ouvre sur « choisir un canal ». Ce plan le met en
étape 5 parce que le choix ne coûte rien mais ne produit rien tant qu'il n'y a pas de lien à
poster — l'étape 1 le précède techniquement.

**Deux points ne remontent jamais dans ce plan** : plus de comparabilité, et une convergence
des quatre pipelines. Le §5 les a tranchés.

---

## Journal

Une ligne par session terminée : date, étape, ce qui a été livré, ce qui a bougé dans la
décision. Les chiffres des étapes 3 et 6 se posent ici — l'étape 7 les relit.

| Date | Étape | Livré | Chiffre ou décision |
| ---- | ----- | ----- | ------------------- |
| 2026-08-27 | 1 | URL profonde par résultat : `/character/[region]/[realm]/[name]` et `/report/[code]/[actor]`, `generateMetadata` sans requête, `shared=1` → instantané, onglet dans l'URL. `HomeClient` et `useRouteSync` supprimés. | Le chemin dit qui est analysé, la query dit comment on le regarde. `difficulty` et `boss` restent en query : un segment remonterait le composant et viderait le cache par palier. Les routes de résultat restent derrière la session — le partage public attend la signature RPGLogs. |
| 2026-08-27 | 2 | Carte de partage (`share-card.ts` + `ShareCard.tsx`), repliée sous le DPS et atteignable depuis tout résultat chiffrable. `ComparabilityBanner` quitte l'onglet Comparison pour la tête du bloc, au-dessus du verdict et hors des onglets. | La carte montre le même joueur mesuré deux fois : `+55 000` dps contre le vivier entier à `292` d'ilvl, `+25 000` contre les logs comparables — plus de la moitié du retard annoncé venait de l'équipement des références. Deux verrous : pas de carte si le verdict refuse de chiffrer, pas de carte sans ilvl de vivier — l'affirmation sans la démonstration est ce que nous reprochons aux classements. Aucun prix. |
| 2026-08-28 | 3 | `scripts/usage-cost.ts` : lecture de `labels:usage`, coût marginal en euros par fournisseur, rapport et chat séparés. Capture inchangée. `usage` était le huitième flux absent de `scripts/corpus-io.ts` et de la table de `docs/05-capture-de-donnees.md` — ajouté aux deux. | **0,0036 € par rapport, sur 3 analyses servies** — plus 2 tours de chat à 0,0027 €. Tout en `gemini-3.5-flash-lite`, tout sous notre clé, aucun BYOK. Le chiffre est vrai et presque vide : trois rendus ne fondent pas un prix, et il ne vaut que pour le fournisseur le moins cher du catalogue. Ce qui est reportable, c'est le profil : ~9 400 jetons d'entrée neuve et ~550 de sortie par rapport, jamais de cache. À ce profil, Claude Sonnet 5 coûterait ~0,031 € et ChatGPT ~0,015 €, soit un facteur 9 entre Claude et Gemini — 21 si l'on descend jusqu'à Groq. L'étape 6 doit dire quel fournisseur le pass finance avant que l'étape 7 puisse fixer un prix. |
| 2026-08-28 | 4 | `/demo` : une analyse réelle, anonymisée, figée dans le dépôt (`src/lib/demo/boss-result.ts`, produite par `scripts/build-demo-fixture.ts`) et rendue par les composants de production — seule route hors d'`AppShell`, seule route indexable. `/` **est** désormais la question du personnage : la grille de quatre modes (`HomeScreen`, `ModeSelector`) est supprimée, `/character` redirige vers `/`, et les trois autres modes tiennent dans `OtherModesLine` sous le formulaire. Lien vers la démo sous les deux appels à se connecter de la page publique. | La frontière WCL porte sur les analyses **vivantes**, pas sur un exemple : `/demo` est prérendu statiquement, sans une requête à WCL ni à Redis, donc il ne fait pas de nous une publication concurrente. Les chiffres sont ceux d'un vrai `analyzeBoss` — vivier à `289` d'ilvl, écart `23 574` dps ramené à `16 507` contre les logs comparables — parce qu'un exemple fabriqué contredirait ce que le produit exige des autres. Les onglets IA et chat s'ouvrent et disent en une ligne qu'ils appellent un modèle en direct, plutôt que d'être cachés. Aucun prix. |
| 2026-08-29 | 5 | `POST_METHODE.md` : le canal est **Dreamgrove (Discord Druide), salon Feral**, et le post est écrit en deux messages, le second conditionné à l'accord d'un modérateur. | Le canal n'était pas libre : notre seul exemple public est un Feral sur Chimaerus mythique, et un chiffre invérifiable par la salle où il est posté est invendable. Coût assumé : rien d'indexé, et trois à cinq montants hors guilde plutôt que dix. **L'étape n'est pas close** — actes 2 et 3 non faits : l'allowlist n'est pas ouverte, le post n'est pas en ligne, aucun lien au journal. |
| 2026-08-29 | 6 | `QUESTION_PRIX.md` : à qui, où, les trois points, et ce que les réponses ont le droit de trancher. Deux bornes par personne plutôt qu'un montant ; Van Westendorp écarté ; repères de marché en question 2 seulement, la question 1 mesurant une dépense déjà consentie que rien n'a ancrée. | Cible ramenée de dix à **quatre à six** réponses, conséquence du canal de l'étape 5. Le fournisseur d'IA sort de la question : il pèse `1,10 €` par joueur et par palier entre Gemini et Claude au médian, ce qui ne déplace aucun prix. **Aucune réponse recueillie** — la question n'a été posée à personne, l'étape 5 n'ayant pas posté. |
| 2026-08-29 | 7 | §4.4 de `PRODUCT_CONTEXT.md` réécrit : modèle, fourchette de prix et sa règle de lecture, marge mesurée, plafond d'usage, fournisseur, couche guilde. Règle permanente amendée ci-dessus. | **Pass de saison, palier unique, pas d'abonnement** — pour trois raisons dont aucune n'était au §4.1 : c'est le seul modèle que la persistance à TTL porte déjà, il encaisse au pic d'intention plutôt qu'au moment de la résiliation, et il ne paie le fixe du processeur qu'une fois (`3,6 %` d'un pass à `12 €` contre `6,3 %` de trois mensualités à `4 €`). **Prix non fixé** : fourchette `10`–`15 €`, hypothèse de travail `12 €`, point suspendu aux réponses de l'étape 6 — la règle « aucun prix public » n'est donc **pas** levée. Marge nette par acheteur `11,4 €` au médian, `8,6 €` au pire cas plafonné ; **sept acheteurs couvrent l'infrastructure fixe**, donc la marge unitaire ne contraint rien et le nombre d'acheteurs commande tout. Plafond `50` rapports / `120` tours par pass, BYOK au-delà. Fournisseur : reste Gemini, l'écart de prix étant payable — le choix est une question de qualité, non de monétisation, et personne n'a comparé les rendus. Aucun prix de guilde cette saison : la vue roster n'existe pas. |
