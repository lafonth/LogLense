# Plan des retours de test — exécution, une étape par session

Issu de la session de test avec les camarades de guilde du 2026-09-01. Le plan parapluie
d'origine tenait six chantiers en un seul document : trop gros pour une fenêtre, la session
qui l'a écrit s'est effondrée en compactages successifs. Ce fichier est son découpage.

**Ce fichier est la mémoire du plan.** Chaque session part d'un contexte vide : elle lit son
étape ici, l'exécute, écrit sa ligne de journal, commit. Rien d'autre ne se transmet d'une
session à la suivante.

## Règles d'usage

- **`/clear` avant chaque étape.** Le hook `SessionStart` réinjecte l'état du dépôt : repartir
  de zéro ne coûte rien, garder l'étape précédente en contexte se refacture treize fois.
- **Jamais deux étapes dans la même session.** Une étape qui déborde s'arrête et se reprend
  au `/clear` suivant — elle ne s'enchaîne pas sur la suivante.
- **Le prompt de l'étape se colle tel quel.** Il est écrit pour être lu sans le reste du
  fichier ; il nomme les fichiers et les plages à lire.
- Une étape se termine par une ligne de journal en bas de ce fichier et un commit sur `main`.
  **On ne pousse pas.**
- Les quatre vérifications passent avant tout commit de code : `pnpm typecheck`, `pnpm test`,
  `pnpm lint`, `pnpm format:check`. Sortie filtrée (`pnpm test | grep -E "Tests |FAIL"`).

## Trois prémisses corrigées, valables pour tout le plan

Elles viennent du plan parapluie et évitent de refaire trois fois la même recherche.

1. **Il n'existe pas d'API « compare » chez Warcraft Logs, ni de champ « Match % ».** Ce
   pourcentage est calculé dans leur interface web, au-dessus des filtres de classement. Nous
   avons déjà l'équivalent : `scoreCandidate` (`comparability.ts:24`). Match % n'est qu'un
   rendu de sa distance. Ce que l'API offre vraiment, ce sont des primitives de filtrage —
   `bracket`, `size`, `partition`, `externalBuffs` — et surtout `includeCombatantInfo`, qui
   rendrait le critère de set bonus quasi gratuit.
2. **Un abonnement Claude Pro ne délivre aucune clé API.** Il faut un compte Anthropic Console
   et du crédit prépayé. L'étape 7 est bloquée en amont par une action non-code.
3. **Le modèle demandé est déjà en place.** `CLAUDE_MODEL = 'claude-sonnet-5'`
   (`src/lib/ai/claude.ts:12`), effort par défaut déjà `high`. L'étape 7 n'est pas un choix de
   modèle : c'est la **suppression de la surface BYOK**.

## Ordre et raison de l'ordre

L'étape 0 est la seule qui ne se reporte pas : l'arbre de travail est aujourd'hui dans un
état pire qu'avant la modification en cours. Ensuite viennent les gains de lisibilité qui ne
coûtent aucune requête WCL, puis le spike qui conditionne tout le reste, puis ce qui dépend
de lui. Le chantier IA passe en dernier — c'est le plus incertain, et un arbitrage a déjà été
rendu contre lui une fois.

Deux volets sont **retenus hors plan**, faute d'arbitrage produit : le panneau de filtres
utilisateur et le garde-fou côté formulaire. Ils attendent un second tour de retours.

---

## Étape 0 — La spec du log gagne sur celle du formulaire

**Pourquoi en premier** : une Prêtre Sacré a été comparée à des Prêtres Ombre, et le rapport
rendu était cohérent en surface et entièrement faux. Un rapport faux et confiant est le pire
état possible du produit. Et l'arbre de travail est actuellement à mi-chemin : `specs.ts` est
modifié mais non commité, et cette modification **a désactivé une garde**.

**L'état réel, à vérifier avant de coder** : `src/lib/specs.ts` porte déjà la table élargie —
soins et tanks connus, `role`, `supported`, `ALL_DPS_SPEC_IDS` dérivé du drapeau,
`specLabel` / `roleLabel`. C'est acquis, il n'y a pas à le réécrire. Mais :

- `report-pipeline.ts:39-40` teste `if (!specInfo) return null`. Avec la nouvelle table,
  `getSpecInfo(257)` ne rend plus `null` : **la garde ne se déclenche plus**. Elle doit tester
  `supported`, pas la nullité.
- `pipeline.ts:97` — `getSpecInfo(charEvent.specID) ?? fallbackSpec` — ne retombe plus sur la
  spec du formulaire (c'est le correctif), mais poursuit avec une spec non supportée au lieu
  de refuser.
- `src/lib/__tests__/specs.test.ts` (46 lignes) n'a pas été étendu.

**Le piège** : `runAnalysis` (`pipeline.ts:172-174`) enveloppe chaque boss dans
`.catch(() => null)`. Un refus qui jette redevient `null` avant d'atteindre l'écran, et
l'écran dit « boss non analysé » sans dire pourquoi. Le refus doit être une **valeur typée**,
pas une exception.

**À lire d'abord** : `src/lib/specs.ts:313-368` (les exports seulement),
`src/lib/wcl/report-pipeline.ts:34-48`, `src/lib/wcl/pipeline.ts:88-105` et `:165-180`,
`src/lib/__tests__/specs.test.ts`.

**Fait quand** :

- les deux pipelines à références refusent une spec non supportée **avant** de construire le
  vivier — un refus qui coûte cinquante requêtes WCL est un refus mal placé ;
- le refus est nommé (`{ reason: 'unsupported-spec', specId, specLabel }` ou équivalent) et
  survit à `.catch(() => null)` ;
- `pipeline.ts` ne retombe jamais sur la spec du formulaire quand le `CombatantInfo` en donne
  une que nous ne connaissons pas — le log gagne ;
- un test de régression nommé rejoue le cas exact du retour : `charEvent.specID = 257` avec
  `input.specId` = Shadow doit refuser, jamais construire un vivier Ombre ;
- `getSpecInfo(257)` rend Holy Priest / healer / `supported: false` ;
  `getDpsSpecsForClass('Druid')` exclut Restoration et Guardian ; `ALL_DPS_SPEC_IDS` fait 25 ;
- les quatre vérifications passent, et le commit inclut `specs.ts`.

**Portée** : `pipeline.ts` et `report-pipeline.ts` oui. `pull-pipeline.ts` à trancher dans la
session. `raid-ranking.ts` non — il lit la spec depuis l'icône d'acteur (`:101`) et classe une
pull entière, soins compris : les marquer, pas les exclure.

**Prompt** :

> Étape 0 de `PLAN_RETOURS_TEST.md`. Lis l'étape, puis `src/lib/specs.ts:313-368`,
> `src/lib/wcl/report-pipeline.ts:34-48`, `src/lib/wcl/pipeline.ts:88-105` et `:165-180`, et
> `src/lib/__tests__/specs.test.ts`. `src/lib/specs.ts` est déjà modifié et non commité :
> c'est la table élargie, elle est acquise — ne la réécris pas, vérifie-la. Le travail est de
> rebrancher les deux gardes sur `supported`, de faire du refus une valeur typée qui survit au
> `.catch(() => null)` de `runAnalysis`, et d'étendre le test. Dis-moi ce que tu décides pour
> `pull-pipeline.ts` avant de l'écrire.

---

## Étape 1 — Les icônes de sorts

**Le retour** : les testeurs ne sont pas assez bons pour lire un tableau de noms de sorts. Une
icône par ligne est le gain de lisibilité le moins cher du plan — **aucune requête WCL en
plus, aucun champ GraphQL nouveau**.

**Ce qu'on jette aujourd'hui** : les tables WCL rendent déjà une icône par capacité, et
`WCLTable` (`src/lib/wcl/parsers.ts:7-12`) ne déclare que `{ guid, name, total }`. L'icône est
perdue au parse.

**Première chose à faire, avant tout code** : vérifier en **une** requête le nom exact du
champ dans une entrée de capacité. `abilityIcon` est attendu — attention, `icon` sur une
entrée d'**acteur** porte « Class-Spec » (voir `raid-ranking.ts:101`), ce n'est pas le même
champ.

**À lire d'abord** : `src/lib/wcl/parsers.ts:1-40`, `src/types/index.ts:60-110`,
`src/lib/comparison/rotation-stats.ts:1-20`, `src/components/ui/` (la liste, pour le style des
primitives).

**Fait quand** : l'icône traverse le parse (`WCLTable`, `parseCasts`, parse des dégâts), les
types (`CastEntry`, `DamageEntry`, `AbilityComparison`, lignes de `damage-gap.ts`), et une
primitive `SpellIcon` la rend dans `RotationCards`, `DamageBreakdown`, `TalentDiff` et
`OpeningChain`. **Le repli est obligatoire** : une pastille neutre, jamais une image cassée.
Vérification visuelle clair/sombre, mobile/desktop. Les quatre vérifications passent.

**Portée** : les quatre écrans — le parse est partagé.

**Prompt** :

> Étape 1 de `PLAN_RETOURS_TEST.md`. Lis l'étape, puis `src/lib/wcl/parsers.ts:1-40`,
> `src/types/index.ts:60-110` et `src/lib/comparison/rotation-stats.ts:1-20`. Commence par
> vérifier en une seule requête WCL le nom exact du champ d'icône dans une entrée de capacité
> — ne code rien avant d'avoir la réponse brute. Ensuite fais traverser l'icône du parse
> jusqu'aux quatre composants, avec une primitive `SpellIcon` et un repli en pastille neutre.
> Rappel : aucun `style={{}}`, aucune valeur littérale de couleur, aucune surcharge de taille
> sur une primitive.

---

## Étape 2 — Le lien vers le log Warcraft Logs

**Le retour** : le testeur veut atteindre la source depuis le sélecteur de combat, pour
explorer au-delà de ce que nous rendons. Petit, isolé, sans prérequis.

**Ce qui existe** : aucun lien `warcraftlogs.com` dans l'interface. `API_URL` / `TOKEN_URL`
(`src/lib/wcl/constants.ts:1-2`) sont côté serveur et **ne doivent pas** servir à construire
une URL visible. `code` et `fightID` circulent déjà dans les deux pipelines à références.

**À lire d'abord** : `src/lib/wcl/constants.ts`, `src/components/shared/BossSidebar.tsx:14-59`.

**Fait quand** : une constante d'URL publique et un helper testé `fightUrl(code, fightId)`
vivent dans `src/lib/wcl/` ; une primitive de lien externe (`target="_blank"`,
`rel="noopener noreferrer"`, icône) le rend — pas un `<a>` nu répété ; le lien produit est
ouvert et vérifié sur **trois** combats de rapports différents. Les quatre vérifications
passent.

**Prompt** :

> Étape 2 de `PLAN_RETOURS_TEST.md`. Lis l'étape, puis `src/lib/wcl/constants.ts` et
> `src/components/shared/BossSidebar.tsx:14-59`. Ajoute la constante d'URL publique, le helper
> `fightUrl` avec son test, et la primitive de lien externe. Ne dérive pas l'URL visible de
> `API_URL`.

---

## Étape 3 — Le spike GraphQL, aucun code

**Pourquoi une session entière sans écrire de code** : trois réponses conditionnent les étapes
4, 5 et 6, et la forme finale du tableau côte à côte. Les pages de doc WCL rendent 403 en accès
direct ; la liste d'arguments a été établie par recherche indexée et **doit être confirmée
pour de vrai**.

**Les trois questions, dans l'ordre** :

1. `includeCombatantInfo: true` sur `characterRankings` rend-il vraiment l'équipement de
   chaque entrée ? C'est le verrou de tout le reste — sans lui, le critère de set bonus reste
   payant par candidat.
2. `bracket` accepte-t-il une tranche d'ilvl exploitable, et `size` filtre-t-il la taille de
   raid ?
3. Le volume de réponse reste-t-il tenable avec `includeCombatantInfo` sur dix pages
   (`CANDIDATE_PAGES = 10`) ?

**À lire d'abord** : `src/lib/wcl/queries.ts:97-160`, `src/lib/wcl/constants.ts`,
`src/lib/wcl/eligibility.ts`.

**Fait quand** : les réponses brutes sont **enregistrées** (dans `docs/`, pas seulement lues
en session), chaque question a une réponse oui/non argumentée, et le fichier dit lesquelles des
étapes 5 et 6 sont débloquées et lesquelles ne le sont pas. **Aucune ligne de code produit.**
Commit de doc uniquement.

**Prompt** :

> Étape 3 de `PLAN_RETOURS_TEST.md` — spike, aucun code. Lis l'étape, puis
> `src/lib/wcl/queries.ts:97-160` et `src/lib/wcl/eligibility.ts`. Interroge l'API WCL sur les
> trois questions de l'étape, enregistre les réponses brutes dans `docs/`, et conclus
> explicitement sur ce qui est débloqué. N'écris aucun code applicatif.

---

## Étape 4 — Le tableau côte à côte, façon Warcraft Logs

**Le retour** : reproduire l'interface que WCL utilise dans son compare — colonnes Amount,
Casts, Avg Cast, Hits, Avg Hit, DPS, plus une ligne Total.

**Ce qui existe** : `DamageBreakdown.tsx:8-34` ne montre que le sujet. `AbilityComparison`
porte déjà `mine`, `referenceMin`, `referenceMax`, `referenceMedian`, `deviationPct`,
`damageShare`.

**Deux décisions à tenir** :

- La colonne de droite est la **médiane des références**, avec min–max en filigrane de la
  barre. Une référence nommée unique serait une régression : on perdrait la distribution.
- `avgCast` / `avgHit` ne se dérivent de ce qu'on a **que si** le compte de coups est conservé
  au parse. Sinon la colonne est **abandonnée**, pas inventée.

**À lire d'abord** : `src/components/comparison/DamageBreakdown.tsx`,
`src/lib/comparison/damage-gap.ts`, `src/lib/comparison/rotation-stats.ts`.

**Fait quand** : un type de ligne jointe, pur et testé, est alimenté par `damage-gap.ts` et
`rotation-stats.ts` ; le tableau le rend ; l'écart est en `text-deviation` (bleu) et jamais en
`text-danger` ; tous les chiffres sont en `font-mono` ; les barres restent l'exception
`style={{}}` tolérée. Les quatre vérifications passent.

**Portée** : `pipeline.ts` et `report-pipeline.ts` seulement.

**Prompt** :

> Étape 4 de `PLAN_RETOURS_TEST.md`. Lis l'étape, puis
> `src/components/comparison/DamageBreakdown.tsx`, `src/lib/comparison/damage-gap.ts` et
> `src/lib/comparison/rotation-stats.ts`. Construis le type de ligne jointe et ses tests avant
> le rendu. Colonne de droite = médiane des références, min–max en filigrane. Si le compte de
> coups n'est pas conservé au parse, abandonne `avgCast`/`avgHit` — ne les invente pas.

---

## Étape 5 — Le pourcentage de correspondance à l'écran

**Le retour** : WCL affiche un « Match % » ; le testeur le veut. Nous l'avons déjà — `distance`
existe et est déjà portée sur `ScoredCandidate`. Il manque une transformation monotone vers un
pourcentage, et son rendu.

**Le point qui compte** : l'échelle se **choisit et se documente**, elle ne s'improvise pas. Le
joueur croira ce chiffre. Distance 0 → 100 % ; distance 1, le bord de la tolérance, → un palier
nommé. Écrire la règle dans le code, pas seulement l'appliquer.

**À lire d'abord** : `src/lib/wcl/comparability.ts:1-60`,
`src/components/comparison/ReferenceLabels.tsx:43-183`.

**Fait quand** : la transformation est une fonction pure testée, son échelle est documentée en
commentaire, et le pourcentage apparaît à côté de chaque référence sans contredire le niveau de
comparabilité déjà affiché. Les quatre vérifications passent.

**Prompt** :

> Étape 5 de `PLAN_RETOURS_TEST.md`. Lis l'étape, puis `src/lib/wcl/comparability.ts:1-60` et
> `src/components/comparison/ReferenceLabels.tsx:43-183`. Transforme `distance` en pourcentage
> par une fonction pure testée, documente l'échelle choisie, et rends-la. Ne réinvente pas la
> sélection : la distance existe déjà.

---

## Étape 6 — Filtrer chez WCL, et le set bonus comme critère

**Dépend de l'étape 3.** Si le spike a répondu non à sa question 1, cette étape se réduit ou
tombe — le relire avant de commencer.

**Deux volets, une session** :

- **Filtres côté serveur.** `Q_WORLD_RANKINGS` et `Q_WORLD_RANKINGS_PARTITION`
  (`queries.ts:97,147`) ne passent ni `bracket`, ni `size`, ni `includeCombatantInfo`.
- **Set bonus comme critère de sélection.** `eligibility.ts` lit déjà le set bonus, mais
  seulement **après** avoir payé la vérification par candidat (`VERIFICATION_WINDOW = 12`, deux
  requêtes chacun). Avec `includeCombatantInfo`, il devient lisible au niveau du vivier.

**La règle de conception** : `CandidateMetrics` (`comparability.ts:3-7`) ne porte que
`bracketData` et `duration`. Taille de raid, âge du log et set bonus sont des **filtres durs**
— on garde ou on jette. **Aucun** n'entre dans la distance euclidienne.

**À lire d'abord** : le compte rendu du spike dans `docs/`, `src/lib/wcl/queries.ts:97-160`,
`src/lib/wcl/comparability.ts:1-60`, `src/lib/wcl/eligibility.ts`,
`src/lib/wcl/references.ts:64-106`.

**Fait quand** : les tests de `scoreCandidate` / `selectClosest` couvrent les nouveaux filtres,
et **un vivier filtré ne passe jamais sous `TOP_N` sans que le niveau de comparabilité le
dise**. Les quatre vérifications passent.

**Portée** : `pipeline.ts` et `report-pipeline.ts` seulement — les deux autres écrans ne
bougeront pas, et rien ne le signalera.

**Prompt** :

> Étape 6 de `PLAN_RETOURS_TEST.md`. Relis d'abord le compte rendu du spike de l'étape 3 dans
> `docs/` : si `includeCombatantInfo` ne rend pas l'équipement, dis-le et réduis l'étape. Puis
> `src/lib/wcl/queries.ts:97-160`, `comparability.ts:1-60`, `eligibility.ts` et
> `references.ts:64-106`. Taille de raid, âge du log et set bonus sont des filtres durs, jamais
> des composantes de la distance.

---

## Étape 7 — Notre modèle, et le plafond qui va avec

**Prérequis non-code, à faire en parallèle dès maintenant** : ouvrir un compte Anthropic
Console et provisionner du crédit. Un abonnement Pro ne délivre pas de clé. Le code peut
s'écrire avant, rien n'est déployable sans.

**Trois volets** :

- **Retirer la surface BYOK**, sept points repérés : `src/lib/ai/catalog.ts:32-73`
  (`storageKey` devient sans objet), suppression de `src/hooks/useApiKey.ts` et
  `useProviderKeys()`, les champs de clé dans `AIReportTab.tsx:206-214` et
  `ChatTab.tsx:119-127`, l'en-tête `x-ai-key` dans `useAIReport.ts:35` et `useChat.ts:90-91`,
  et les routes `api/ai-report/route.ts:111-238` et `chat/route.ts:235-384`. **Effet de bord
  favorable** : `ai-report/route.ts:170-173` laisse aujourd'hui le BYOK contourner
  `guardServerKey()` et donc le quota — le retrait ferme cette brèche.
- **Le plafond global d'IA — le point qui coûte de l'argent réel.** `AI_LIMIT = 20` est **par
  compte et par heure**, et il n'existe **aucun** compteur global, contrairement à WCL qui a
  les deux (`WCL_UNIT_LIMIT`, `WCL_GLOBAL_UNIT_LIMIT`). Dix testeurs font 200 rapports/h sur
  notre carte. Ajouter `AI_GLOBAL_LIMIT` et `consumeAiGlobalQuota` sur le modèle de la paire
  WCL, consommé **après** le quota par compte pour la raison écrite en `rate-limit.ts:214-223`.
  Vérifier au passage que la route de chat consomme bien un quota d'IA : agentique, donc
  plusieurs appels par tour, c'est la dépense la moins bornée du produit.
- **Réglage du modèle.** Sur Sonnet 5 : l'effort passe par `output_config: { effort }`
  (imbriqué, pas au premier niveau, défaut déjà `high`) ; `budget_tokens` est **rejeté** (400),
  la réflexion s'active par `thinking: { type: 'adaptive' }` ; les paramètres
  d'échantillonnage (`temperature`, `top_p`, `top_k`) et le préremplissage de la réponse sont
  rejetés ; un `role: "system"` en milieu de conversation n'existe pas. Cache par
  `cache_control: { type: 'ephemeral' }` sur un préfixe stable (outils → système → messages),
  TTL 1 h, vérifié par `usage.cache_read_input_tokens` sur un second appel.

**Recommandation** : pas de choix de fournisseur pour la bêta. `CHAT_PROVIDERS` réduit à
Claude, le reste du catalogue conservé derrière une variable d'environnement.

**À lire d'abord** : `src/lib/ai/catalog.ts`, `src/lib/labels/rate-limit.ts:1-60` et
`:200-240`, `src/lib/api/wcl-guard.ts`, `src/lib/ai/claude.ts`.

**Fait quand** : aucune route n'accepte plus `x-ai-key` ; le quota global se sature en test ;
`cache_read_input_tokens` est non nul au second appel. Les quatre vérifications passent.

**Portée** : aucune — cette étape ne touche pas la comparabilité.

**Prompt** :

> Étape 7 de `PLAN_RETOURS_TEST.md`. Lis l'étape, puis `src/lib/ai/catalog.ts`,
> `src/lib/labels/rate-limit.ts:1-60` et `:200-240`, `src/lib/api/wcl-guard.ts` et
> `src/lib/ai/claude.ts`. Retire la surface BYOK aux sept points listés, ajoute le plafond
> global d'IA sur le modèle de la paire WCL, et vérifie que la route de chat consomme bien un
> quota. Le plafond global n'est pas optionnel une fois le BYOK retiré.

---

## Étape 8 — La séquence réelle donnée au modèle

**En dernier, et c'est délibéré.** C'est le chantier le plus incertain du plan : droits,
maintenance, et un arbitrage déjà rendu contre lui une fois.

**Le retour** : donner au modèle le log pur du combat — quels sorts, à quel moment — et un
guide de la spec, pour qu'il juge l'ordre des sorts.

**Trois volets, et une recommandation ferme sur le deuxième** :

- **La timeline complète.** `Q_CAST_EVENTS` (`queries.ts:216`) rend déjà des événements
  ordonnés, mais sa faible dépense tient au `limit` : la première page **est** l'ouverture, il
  n'y a pas de pagination. Un combat entier renonce à cet argument.
- **N'envoyez pas les timelines brutes des références.** Envoyer la timeline compressée du
  sujet, et à la place de celles des références, un **écart que nous avons déjà calculé** dans
  `src/lib/comparison/` : ordre divergent, sort attendu absent, sort hors fenêtre. Envoyer
  quatre timelines en espérant que le modèle trouve l'écart, c'est exactement le gadget que le
  critère anti-gadget interdit.
- **Les guides de spec.** Données statiques versionnées sur le modèle de `src/data/talents/`,
  un fichier par spec, ordre de priorité et fenêtres de burst, source citée. **Deux
  réserves** : le contenu prescriptif a déjà été refusé une fois
  (`PLAN_CONTEXTE_CLASSES.md`, parqué — un guide qui dicte sort de la position produit, une
  métadonnée de sorts est défendable) ; et recopier Wowhead pose une question de droits et de
  maintenance, un guide expirant à chaque patch. Un guide faux est pire que pas de guide.

**Corollaire opérationnel** : repousser le calcul est acceptable, repousser la capture ne
l'est pas. Si les guides attendent, la timeline peut déjà s'écrire au corpus
(`src/lib/labels/`).

**Note de maintenance, à corriger dans le même commit** : le glossaire de `CLAUDE.md` dit
encore que la chaîne d'ouverture est « non disponible aujourd'hui ». C'est faux depuis
`Q_CAST_EVENTS` / `OPENING_LENGTH` / `OpeningChain.tsx`.

**À lire d'abord** : `src/lib/wcl/queries.ts:210-240`, `src/lib/ai/prompt.ts`,
`src/lib/comparison/findings.ts`, `PLAN_CONTEXTE_CLASSES.md`.

**Fait quand** : `PROMPT_VERSION` (`src/lib/ai/prompt.ts`) est incrémentée — sans quoi le
corpus mélange des conseils issus de deux prompts ; le nombre de jetons du prompt est **mesuré
avant/après** sur un vrai combat via `record-usage.ts`. Les quatre vérifications passent.

**Prompt** :

> Étape 8 de `PLAN_RETOURS_TEST.md`. Lis l'étape, puis `src/lib/wcl/queries.ts:210-240`,
> `src/lib/ai/prompt.ts`, `src/lib/comparison/findings.ts` et `PLAN_CONTEXTE_CLASSES.md`.
> N'envoie pas les timelines brutes des références : envoie l'écart déjà calculé. Incrémente
> `PROMPT_VERSION` et mesure le prompt avant/après. Corrige au passage le glossaire de
> `CLAUDE.md` sur la chaîne d'ouverture.

---

## Retenus hors plan

Les deux volets qui demandent le plus d'arbitrage produit, et le moins de code. Ils attendent
un second tour de retours plutôt qu'une décision prise seul.

- **Le panneau de filtres utilisateur** (exposer `KILL_TIME_TOLERANCE`, `ILVL_TOLERANCE`,
  `TOP_N`). Deux décisions avant d'écrire : un changement de filtre rejoue-t-il la sélection
  sans requête (comme le chat le fait déjà via `cohort.ts`) ou déclenche-t-il une nouvelle
  analyse ? Et l'instantané de 24 h (`result-snapshot.ts`) doit-il se souvenir des filtres
  choisis ? Penchant : resélection gratuite sur le `sample` existant, rien de neuf chez WCL
  sans demande explicite.
- **Le garde-fou au formulaire** (specs non supportées grisées avec leur raison). C'est
  masquer les specs qui a produit le bug : la joueuse Sacré a choisi Ombre parce que c'était la
  seule option offerte. Mais griser demande de décider ce qu'on promet — et l'étape 0 rend déjà
  le refus honnête, ce qui est l'urgence.

## Hors périmètre

- La convergence des quatre pipelines. `PRODUCT_CONTEXT.md` §5 acte qu'il n'y a pas davantage
  de travail de comparabilité à faire.
- Le modèle de prix. L'étape 7 change **qui paie l'IA**, pas ce que l'utilisateur paie. La
  règle « aucun prix public » de `PLAN_SAISON.md` reste en vigueur.

---

## Journal

| Date       | Étape | Ce qui a été fait                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-09-02 | 0     | La spec du log gagne sur celle du formulaire. `BossRefusal` est une valeur rendue, non une exception : elle traverse le `.catch(() => null)` de `runAnalysis`. Les deux pipelines à références refusent avant `fetchCandidatePool`, `pipeline.ts` ne retombe plus sur la spec du formulaire. Ni instantané ni corpus sur un refus ; l'écran le nomme au lieu de conseiller un changement de difficulté. `pull-pipeline` et `raid-ranking` sans garde, décidé en session. |
| 2026-09-02 | 1     | L'icône traverse le parse : `abilityIcon` était déjà dans la charge (`table()` est un scalaire JSON), zéro requête et zéro champ GraphQL de plus. Écart assumé sur la forme : **un `IconIndex` unique par nom** porté par `RotationSummary`, là où l'étape nommait cinq champs par ligne — la couche de comparaison joint sur le nom, et `TalentNode` ne porte ni icône ni guid, donc un champ par ligne n'aurait jamais atteint `TalentDiff`. `SpellIcon` rend les quatre écrans, repli en pastille neutre sur trois chemins (pas d'index, pas d'entrée, image en erreur), testés. Les écrans affichant l'union des noms fusionnent les index (`mergeIcons`) : sans ça, seules les lignes venues des références ou de la pull d'avant restaient nues, ce qui se lit comme un rendu cassé. `icons?` optionnel → les instantanés de 24 h écrits avant cette version rejouent sans art, sans bump de `SNAPSHOT_CACHE_VERSION`. Vérification visuelle : **un seul thème** — aucun `prefers-color-scheme`, `data-theme` ni variante `dark:` dans le dépôt. |
