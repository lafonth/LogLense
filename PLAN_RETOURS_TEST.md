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

Un volet reste **retenu hors plan**, faute d'arbitrage produit : le garde-fou côté
formulaire. Il attend un second tour de retours. Le second — le panneau de filtres utilisateur —
en est sorti le 2026-09-04 et devient l'étape 9 : ses deux questions ouvertes se tranchent sur
une mesure, pas sur un avis.

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

## Étape 9 — Le panneau de filtres, et ce qu'il n'a pas le droit de bouger

Ouverte le 2026-09-04, après coup. Elle était retenue hors plan faute d'arbitrage produit ;
ses deux questions ouvertes se sont révélées tranchables sans second tour de retours, parce
que la mesure les tranche — le vivier est déjà chez le client.

**Le retour** : le testeur veut régler lui-même les seuils de comparabilité plutôt que de
subir `KILL_TIME_TOLERANCE`, `ILVL_TOLERANCE` et `TOP_N`.

**Le panneau n'invente pas ses axes.** `CohortFilter` (`cohort.ts:26-38`) les porte déjà —
pièces de tier, bornes de kill time, écart d'ilvl, plafond d'externals, inclusion des
disqualifiés — parce que le chat pose déjà ces questions-là. L'étape donne une surface à
l'outil de resélection ; elle n'ouvre pas un axe de plus.

**Quatre arbitrages, rendus ici pour que la session d'exécution n'ait pas à les rouvrir** :

1. **Resélection gratuite, dans le navigateur, et rien d'autre.**
   `/api/analyze/[encounterId]` rend le `BossResult` entier au client, `sample` compris — les
   douze candidats de `VERIFICATION_WINDOW`, avec stats, dps, kill time, ilvl, `tierPieces`,
   `externalUptime` et verdict de qualification. `describeCohort` est un module pur qui rejoue
   `selectClosest` et `comparabilityLevel` sur ce vivier. Le panneau l'appelle donc **côté
   client** : pas de route, pas de requête WCL, pas de Redis. Un curseur qui bouge ne déclenche
   jamais une analyse.
2. **L'instantané ne se souvient de rien.** `result-snapshot.ts` est le rendu partagé — ce que
   le second lecteur d'un lien voit du premier — et son TTL est une frontière légale, pas une
   fraîcheur. Y écrire les filtres, ce serait une écriture Redis par coup de curseur, et une
   clé qui ne désigne plus un rendu. Les filtres vivent dans l'état du composant. Aucun champ
   ajouté, donc aucun bump de `SNAPSHOT_CACHE_VERSION`.
3. **Le panneau ne gouverne que ce qu'il peut honnêtement gouverner.** `ReferenceSample` ne
   porte ni rotation ni table de dégâts — seuls les `TOP_N` de `topPlayers` les portent, et les
   récupérer coûte trois requêtes par candidat (`promote.ts`). Un filtre peut donc recalculer
   l'effectif, le niveau, les distributions de stats / dps / kill time et la liste des
   références avec leur distance ; il **ne peut pas** refaire `damage-gap`, `rotation-stats`,
   `ability-table`, `cast-timing` ni `findings`. Il ne fait pas semblant de le pouvoir : ce
   qu'il montre est étiqueté cohorte, et quand le filtre exclut l'une des trois références
   détaillées, il le **dit** — sinon les écrans de sorts continuent de comparer à quelqu'un que
   l'utilisateur vient d'écarter, en silence. La promotion payante existe déjà et reste où elle
   est : dans le chat, qui l'annonce avant de dépenser.
4. **`ComparabilityBanner` ne bouge pas.** Il est monté hors des onglets
   (`BossContentPanel.tsx:172`) et énonce la comparabilité de la sélection **réellement
   utilisée** par le reste de l'écran. Le niveau recalculé s'affiche dans le panneau, comme
   réponse à « qu'est-ce que ça change », jamais en écrasant le bandeau. C'est la divergence
   que l'étape 5 avait déjà refusée : le pourcentage disant une chose et le bandeau une autre.

**Sur `TOP_N`, qui n'est pas un seuil de même nature que les deux autres.** `ILVL_TOLERANCE` et
`KILL_TIME_TOLERANCE` filtrent un vivier déjà en mémoire ; `TOP_N` décide combien de références
ont été **récupérées**, et l'augmenter demande des requêtes. Un curseur qui promettrait une
quatrième référence détaillée serait un mensonge à trois requêtes près. Il n'est donc pas
exposé comme levier : l'écran le nomme comme fixé au moment de l'analyse.

**À lire d'abord** : `src/lib/comparison/cohort.ts` en entier — 166 lignes, c'est le moteur de
l'étape — puis `src/components/results/ComparisonTab.tsx:90-120` et
`src/lib/wcl/constants.ts:23-24` et `:38` pour les valeurs par défaut.

**Fait quand** : un panneau de filtres est rendu dans l'onglet Comparison, à côté de
`ReferenceLabels` ; bouger un réglage ne produit aucune requête réseau ; l'effectif, le niveau
recalculé et les distributions suivent le filtre ; le bandeau hors onglets ne bouge pas ; le
panneau nomme les références détaillées que le filtre exclut ; sa position neutre est le filtre
vide — la cohorte telle que la sélection l'a vue — et un bouton y ramène. Les quatre
vérifications passent.

**Prompt** :

> Étape 9 de `PLAN_RETOURS_TEST.md`. Lis l'étape : elle rend quatre arbitrages, ne les rouvre
> pas. Puis `src/lib/comparison/cohort.ts` en entier et
> `src/components/results/ComparisonTab.tsx:90-120`. Ajoute un panneau de filtres **côté
> client** qui rend les axes de `CohortFilter` et appelle `describeCohort` sur `result.sample` :
> aucune requête, aucune écriture d'instantané, aucun champ de type ajouté. Le niveau recalculé
> s'affiche dans le panneau, jamais dans `ComparabilityBanner`. Quand le filtre exclut l'une des
> références de `topPlayers`, le panneau le dit. Position neutre = filtre vide, avec un bouton
> de retour. N'expose pas `TOP_N` : il coûte des requêtes, les deux autres non.

---

## Retenus hors plan

Le volet qui demande le plus d'arbitrage produit, et le moins de code. Il attend un second tour
de retours plutôt qu'une décision prise seul.

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

| Date       | Étape | Ce qui a été fait                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | 0     | La spec du log gagne sur celle du formulaire. `BossRefusal` est une valeur rendue, non une exception : elle traverse le `.catch(() => null)` de `runAnalysis`. Les deux pipelines à références refusent avant `fetchCandidatePool`, `pipeline.ts` ne retombe plus sur la spec du formulaire. Ni instantané ni corpus sur un refus ; l'écran le nomme au lieu de conseiller un changement de difficulté. `pull-pipeline` et `raid-ranking` sans garde, décidé en session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-09-02 | 1     | L'icône traverse le parse : `abilityIcon` était déjà dans la charge (`table()` est un scalaire JSON), zéro requête et zéro champ GraphQL de plus. Écart assumé sur la forme : **un `IconIndex` unique par nom** porté par `RotationSummary`, là où l'étape nommait cinq champs par ligne — la couche de comparaison joint sur le nom, et `TalentNode` ne porte ni icône ni guid, donc un champ par ligne n'aurait jamais atteint `TalentDiff`. `SpellIcon` rend les quatre écrans, repli en pastille neutre sur trois chemins (pas d'index, pas d'entrée, image en erreur), testés. Les écrans affichant l'union des noms fusionnent les index (`mergeIcons`) : sans ça, seules les lignes venues des références ou de la pull d'avant restaient nues, ce qui se lit comme un rendu cassé. `icons?` optionnel → les instantanés de 24 h écrits avant cette version rejouent sans art, sans bump de `SNAPSHOT_CACHE_VERSION`. Vérification visuelle : **un seul thème** — aucun `prefers-color-scheme`, `data-theme` ni variante `dark:` dans le dépôt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-09-02 | 2     | L'adresse publique est une constante à elle (`fight-url.ts`), pas une dérivée d'`API_URL` : le site et l'API partagent un domaine, pas un contrat. `fightUrl` **valide** le code au lieu de l'encoder — échapper un code aberrant fabriquerait une URL bien formée vers un rapport qui n'existe pas — et rend `null` plutôt que de lever, l'appelant étant un rendu. `&source=<actorId>` en plus de l'ancre : le lien ouvre le joueur analysé, pas le rapport seul ; un `actorId` aberrant tombe sans emporter le lien. Primitive `ExternalLink` (`target`, `rel="noopener noreferrer"`, glyphe `↗` + `sr-only`) — glyphe et non SVG, le dépôt n'a pas de librairie d'icônes et `BackLink` a déjà tranché. Posé **sous** les deux sélecteurs de `BossContentPanel` : il suit le combat analysé et s'affiche même quand aucun sélecteur ne se rend. Étendu hors lettre de l'étape au tableau de comparaison de pulls, où `code#fightId` était déjà à l'écran en texte inerte — via un `PullRef` local, parce que la primitive s'efface sur une adresse refusée et que cet identifiant-là doit rester lisible sans lien. Vérification : `scripts/probe-fight-url.ts`, trois combats de trois rapports différents, adresse fabriquée par le helper lui-même. Le script prouve la cible (l'API rend le combat portant cet id, nommé, dans son rapport), pas le rendu : `/reports/*` est derrière un filtre anti-robot qui rend 403 à tout client scripté — contrôle mesuré, un chemin inconnu rend 404, un code inexistant rend 403 comme un vrai. Les trois liens ont donc été ouverts au navigateur pour la moitié restante.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-09-03 | 3     | Spike, aucun code applicatif — deux sondes (`scripts/probe-rankings-args*.ts`), réponses brutes dans `docs/spike-rankings-args*.raw.json`, conclusions dans `docs/07-spike-rankings.md`. **Q1 : oui pour le gear, non pour ce qu'on y cherchait.** `includeCombatantInfo: true` ajoute `talents`, `gear`, `externalBuffs` sans erreur, mais WCL **échange `setID` contre `name`** — prouvé sur le même joueur, le même combat, 17 pièces jointes par id d'objet, `setID: 2066` côté `CombatantInfo` et champ absent côté rankings. `tierPiecesOf` est donc inutilisable au niveau du vivier. Les deux replis mesurés et faux : le suffixe de nom (4 suffixes pour 5 pièces de set → compte 2 au lieu de 5), l'icône (deux pièces hors set en `raidmageulatek` contre `raidwarlockulatek` → compte 7 et annonce un 4p inexistant). **Q2 : oui.** `bracket n → [min + (n−1)·bucket, min + n·bucket − 1]`, confirmé sur cinq points, `min`/`bucket` lus dans `zone { brackets }` ; 3 ilvl de large contre `ILVL_TOLERANCE = 4`, donc ~3 brackets pour couvrir la tolérance, et une densité bien supérieure à budget de requêtes égal. `size` filtre, mais ne discrimine qu'en Normal/Héroïque. **Q3 : non.** 619 Kio contre 35 Kio par page, facteur 17, stable ; jusqu'à 40 pages ≈ 25 Mo, contre un plafond d'écriture `MAX_CACHED_BYTES = 1 200 000` — le vivier cesserait d'être mis en cache, donc d'être partagé. Sans le `setID`, ce volume n'a plus de raison d'être payé. **Trouvaille plus grosse que celle visée** : `externalBuffs` est l'enum `Any                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Require | Exclude`, et c'est un vrai filtre à la source — mesuré sur le contenu, pas sur le compte (100 = taille de page) : 59/100 porteuses en `Any`, 100/100 en `Require`, **0/100 en `Exclude`**. Le second critère éliminatoire, aujourd'hui payé par une table `Buffs`par candidat dans`VERIFICATION_WINDOW`, devient gratuit et sans surcoût d'octets. Réserve notée : appliquer `Exclude`**conditionnellement**,`disqualify`n'éliminant que le candidat aidé *plus* que le joueur. **Verdict** : étape 5 débloquée (elle ne dépendait pas du spike,`distance` existe déjà) ; étape 6 coupée en deux — volet filtres serveur débloqué et élargi, volet set bonus **réduit** comme l'étape le prévoyait elle-même, à trancher entre garder la vérification par candidat ou détacher une tâche de table de palier générée. |
| 2026-09-03 | 4     | La question binaire de l'étape avait une troisième réponse : les compteurs n'étaient **pas** conservés au parse, mais ils étaient **gratuits** à conserver — `table(DamageDone)` est un scalaire JSON, `uses`, `hitCount` et `tickCount` arrivent déjà dans la charge payée (sonde `scripts/probe-damage-columns.ts`). Le corollaire de `CLAUDE.md` — repousser le calcul est acceptable, repousser la capture ne l'est pas — tranche : on capture, on n'abandonne pas. Écart assumé sur l'alimentation : le dénominateur d'`avgCast` est `DamageEntry.uses`, **jamais** `CastEntry.casts`, donc `rotation-stats.ts`, nommé par l'étape comme second alimenteur, n'est pas utilisé — mesuré, la table des casts compte double un sort empouvoiré (Fire Breath 24 contre 11, Eternity Surge 27 contre 13) et fabriquerait une moyenne fausse de moitié. Doctrine `null` contre zéro reprise telle quelle de `damage-gap.ts` : une entrée absente d'une table **lisible** vaut 0 (un choix de jeu, la médiane doit le voir), une entrée présente sans compteur vaut `null` (non mesuré, hors médiane) et se rend en tiret, jamais en zéro. Champs optionnels, donc les instantanés de 24 h écrits avant cette version rejouent sans bump de `SNAPSHOT_CACHE_VERSION` : `hasCasts` / `hasHits` faux masquent la paire de colonnes entière — la colonne s'abandonne, elle ne s'invente pas. Colonne de droite = **médiane des références colonne par colonne**, min–max des parts en filigrane derrière la barre ; conséquence assumée et documentée dans le module comme dans le composant : les colonnes ne se recomposent pas entre elles et les lignes ne somment pas au Total, une médiane n'est pas additive. Écart assumé sur le lieu de rendu : le tableau va dans `ComparisonTab`, pas dans `OverviewTab` où vit `DamageBreakdown` — l'onglet Overview est le combat seul (`StatsTable` y reçoit `sample={[]}`), et la vue `compare` de WCL est par construction une vue contre le champ ; `DamageBreakdown` reste en place, il montre autre chose (mes parts seules, en barres). Quatrième exception `style={{}}` inscrite dans `CLAUDE.md` : la barre de part et son filigrane. 10 tests purs sur `ability-table.ts`, dont le proc sans `uses`, l'instantané d'avant la capture, la référence lisible qui n'a jamais lancé le sort, et la référence illisible écartée de l'effectif.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-09-03 | 5     | `matchPercent` vit dans `comparability.ts`, **pas** dans `comparison/` : ses deux ancres sont les seuils de `comparabilityLevel` (1 et 2), et les séparer les laisserait dériver — le pourcentage dirait une chose, le bandeau une autre. Échelle choisie et écrite dans le module, pas seulement appliquée : **0 → 100 %**, linéaire à 25 points par unité de tolérance jusqu'à 2, donc **distance 1 → 75 %** (plancher d'un panel `close`) et **distance 2 → 50 %** (plancher d'`approximate`) — sous 50 %, une médiane de panel est `poor`, les deux lectures partagent la même graduation. Au-delà, queue en `100/d` : elle rejoint la droite en 2 avec la même valeur _et_ la même pente (−25/unité, dérivée de `100/d` en 2), donc aucune cassure à la jointure, et elle tend vers 0 sans l'atteindre — un candidat scoré loin est mauvais, pas non scoré. Plancher à 1 %, `null` réservé au non-finite : un `0 %` arrondi se lirait comme une absence de mesure. Rendu dans `ReferenceLabels` — seul écran qui liste les références par nom — avec « not scored » en toutes lettres sur l'infini, doctrine `null` contre zéro reprise des étapes 4 et de `damage-gap`. Légende sous la liste : elle nomme les deux ancres et dit que le bandeau tranche sur la **médiane** du panel, pas sur une référence seule — sans elle, un « 62 % » isolé paraît contredire un « Comparable » affiché juste au-dessus. Non fait, hors lettre de l'étape : aucun pourcentage médian dans `ComparabilityBanner` (il ne reçoit pas les distances, `Comparability` ne les porte pas) et rien dans le prompt IA. 7 tests purs dont la monotonie sur dix points et l'absence de saut à la jointure, 2 tests de rendu.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-09-03 | 6     | Étape réduite d'un côté et élargie de l'autre, comme le spike de l'étape 3 le prévoyait. **Volet set bonus : abandonné au niveau du vivier**, il reste payé par candidat dans `VERIFICATION_WINDOW` — `characterRankings` échange `setID` contre `name`, et les deux replis dérivables sont mesurés faux. **Volet filtres serveur : deux filtres au lieu d'un.** `bracket`, et `externalBuffs: Exclude` — la trouvaille du spike, gratuite en octets — **conditionnel**, armé seulement quand le sujet n'a porté aucun external : `disqualify` n'élimine qu'un candidat aidé _plus_ que le joueur, donc l'exclure pour un joueur qui reçoit Power Infusion à chaque pull supprimerait précisément ses bonnes comparaisons et le laisserait flatté face à un champ non buffé. **`size` écarté**, et pour une raison produit : le Mythique est à 20 joueurs fixes, donc le filtre est inerte exactement là où le produit sert, et l'armer en Normal/Héroïque coûterait une requête pour connaître la taille du raid du sujet. `brackets.ts` porte l'arithmétique du spike (`bracket n → [min + (n−1)·bucket, min + n·bucket − 1]`) et rend **`[]` — « ne filtre pas » — plutôt que de rogner** : ilvl inconnu, découpage incohérent, ou couverture demandant plus de `MAX_POOL_BRACKETS` (4) tranches ; rogner écarterait en silence une partie de `ILVL_TOLERANCE`, que `scoreCandidate` continue de juger entière. `PAGES_PER_BRACKET = 3` contre `CANDIDATE_PAGES = 10` : budget de requêtes comparable, vivier incomparablement plus proche. Le découpage arrive par `zone { brackets }` **sur la requête de partitions déjà payée** — zéro requête de plus — mais dans une **clé Redis séparée** (`zoneBracketsKey`), le corps de `zonePartitionsKey` étant une liste d'entiers depuis l'origine ; une entrée de partitions sans son découpage est traitée comme absente, donc une génération de cache antérieure se recharge une fois, d'elle-même. Deux validateurs et non un (`itemLevelBrackets` sur la forme WCL, `parseItemLevelBrackets` sur la forme normalisée) : le champ `type` ne survit pas au cache, et un validateur unique aurait rejeté à la relecture tout ce qu'on venait d'écrire. Cache de vivier en `v3`, **clé par bracket et jamais par fenêtre de brackets** — c'est ce qui le garde payant : ilvl 320 et 322 partagent trois tranches sur quatre, une clé portant la fenêtre entière ne leur laisserait rien. Aucun repli entre `anyext` et `noext`, les deux ne répondent pas à la même question. **Clause de sortie tenue par deux mécanismes** : `POOL_FLOOR = VERIFICATION_WINDOW` complète un vivier filtré trop maigre par le vivier non filtré et le **dit** (`PoolFilters.relaxed`), et `levelWithPanelSize` refuse d'annoncer mieux que `poor` un panel plus court que `TOP_N` — le plancher limite le cas, il ne le supprime pas (un rapport privé réduit le panel après coup). Fonction à part et non règle glissée dans `comparabilityLevel` : la resélection du chat (`cohort.ts`) l'appelle et n'est pas dans la portée. Ce n'est pas une pénalité — `comparabilityLevel` tranche sur une **médiane**, choisie pour sa robustesse, laquelle n'existe pas à une ou deux valeurs. Écart assumé sur la lettre du « fait quand » : `scoreCandidate` et `selectClosest` ne changent pas d'une ligne, les filtres étant **durs** et appliqués à la source — `CandidateMetrics` ne porte toujours que `bracketData` et `duration`, aucun filtre n'entre dans la distance ; la couverture est donc dans `brackets.test.ts`, dans la suite `fetchCandidatePool` (brackets demandés, valeurs neutres, external conditionnel, dédoublonnage, relâchement) et sur `levelWithPanelSize`. `poolFilters` optionnel sur `Comparability` → les instantanés de 24 h rejouent sans lui, pas de bump de `SNAPSHOT_CACHE_VERSION` ; rendu et non déductible — le bandeau dit la couverture, l'exclusion et l'élargissement, un écran qui les recalculerait décrirait un vivier que personne n'a interrogé. **Deux coûts assumés** : le vivier part désormais **après** `fetchFightData` dans les deux pipelines (ni l'ilvl ni les externals du sujet ne sont connus plus tôt) — de la latence, jamais une requête, et la règle du projet fait passer la qualité de donnée avant le temps au premier résultat ; et un cache de vivier chaud ne suffit plus seul à tenir zéro requête, la clé ne pouvant se former sans le découpage du palier — lequel est en cache et mémoïsé par conteneur. Portée respectée : `pull-pipeline` et `raid-ranking` inchangés. |
| 2026-09-03 | 7     | Le BYOK retiré aux sept points, et deux choses tombent avec lui. D'abord une brèche : le rapport laissait une clé apportée court-circuiter `guardServerKey()`, donc le quota — plus d'en-tête, plus de contournement, et deux tests posent que `x-ai-key` est ignoré tout en étant facturé. Ensuite le choix de fournisseur, qui n'avait plus de raison d'être côté client : `offeredProviders()` lit `AI_PROVIDERS` (défaut `claude` seul), `servableProviders()` le croise avec les clés réellement posées, les deux `GET` rendent `{ providers }` et le sélecteur disparaît en dessous de deux. C'est le « pas de choix de fournisseur pour la bêta » du plan, sans figer le catalogue dans le code. Le plafond global suit la paire WCL : `AI_GLOBAL_LIMIT = 60` (3× `AI_LIMIT`), sujet `all` — il ne peut pas entrer en collision avec un compte, `hashUserId` rendant 32 hexadécimaux. Il se consomme **après** le compteur de compte et seulement si celui-ci a laissé passer : un appelant déjà refusé n'a pas à brûler le compteur partagé, et un test le vérifie en comptant les `redisIncrBy`. `consumeStrictQuota`, donc échec fermé. La paire vit dans un seul module (`src/lib/api/ai-guard.ts`) pour que le rapport et le chat ne divergent pas ; les tests des deux routes passent désormais par un double de Redis, seule façon de voir tourner la paire plutôt qu'un verdict qu'on aurait posé soi-même. Le chat consommait bien un quota de compte, jamais de global — c'est réparé, et un instantané périmé (410) ne facture rien. Cache : `ttl: '1h'` sur les deux points de coupure du prompt système de `claude.ts` ; celui de la queue mouvante reste volontairement à 5 min, il se déplace à chaque tour. **Non vérifié** : `cache_read_input_tokens` non nul au second appel, bloqué sur le prérequis hors code — compte Anthropic Console et crédit, qu'un abonnement Pro ne donne pas. |
| 2026-09-03 | 8     | La prémisse du volet 1 était fausse, et la mesure la corrige : un combat entier **tient en une page**. `scripts/probe-cast-timeline.ts` sur un kill Mythic de 512 s — 502 à 779 événements selon l'acteur, `limit: 1000` les rend en **une** requête, celle que `fetchFightData` payait déjà. Ce que « renoncer au `limit` » coûtait n'était pas des requêtes mais des octets. `OPENING_EVENT_LIMIT = 40` devient donc `CAST_EVENT_LIMIT = 2000` (douze minutes au rythme le plus rapide mesuré, 84 casts/min), `Q_CAST_EVENTS` sélectionne `nextPageTimestamp` **pour ce que sa présence dit, jamais pour le suivre**, et `parseOpening` s'exprime sur `parseCastChain` : une seule lecture, des offsets partagés, l'ouverture est la tête de la chaîne. `OpeningCast` renommé `TimedCast`, `RotationSummary.timeline` **facultative** — un instantané de 24 h écrit avant la capture se relit tel quel, pas de bump de `SNAPSHOT_CACHE_VERSION`. **Volet 2, arbitré : timeline du sujet + écart calculé.** Les chaînes des références n'entrent pas dans le prompt — mesuré +59 à +100 % de jetons pour espérer que le modèle y trouve l'écart lui-même, soit exactement le gadget de la contrainte 2. `comparison/cast-timing.ts` calcule « sort hors fenêtre » : par cooldown, mon instant contre la fourchette min/médiane/max du champ, **rang par rang** et non à l'horloge. Trois silences : pas de chaîne, chaîne tronquée, moins de deux références à ce rang. Plancher de bruit `MIN_TIMING_DEVIATION_MS = 5 s` **au-delà du bord** de la fourchette, qui absorbe déjà la gigue. Un rang jamais atteint est rendu sans chiffre — l'absence n'a pas d'amplitude — et passe devant tout retard chiffré. **Garde de périmètre à retenir** : l'axe ne retient que les sorts présents dans ma table de dégâts, seule garantie sans métadonnée de spec qu'il ne s'agit pas d'une défensive (`SCOPE_RULE`). Limite assumée et payée : un cooldown offensif qui n'inflige aucun dégât lui-même est invisible à l'axe. **Volet 3 (guides de spec) : abandonné**, et le motif d'origine était faux. L'idée était d'éviter de « charger les guides depuis une ressource externe » — or aucune ressource externe n'est chargée aujourd'hui, le prompt ne porte aucun guide. Une table `src/data/spells/` **ajouterait** ~9 400 jetons d'entrée neuve par rapport au lieu d'en retirer, et l'espoir du cache est déjà mesuré négatif (zéro sur cinq relevés, 2026-08-28), avec ~40 specs donc autant de préfixes distincts. §A de `PLAN_CONTEXTE_CLASSES.md` reste refusé, le dossier reste parqué. **Capture au corpus : rien à écrire, et c'est motivé.** `ExposureRecord` porte déjà `code` / `fightID` / `actorId` du sujet **et de chaque référence** ; la chaîne se refetche intégralement depuis ces pointeurs, les rapports WCL étant permanents. La seule chose non dérivable est `truncated`, qui est une fonction de `CAST_EVENT_LIMIT`, une constante du dépôt. Écrire 400 casts par enregistrement dans un corpus append-only jamais purgé achèterait zéro donnée nouvelle. **Mesure avant/après** (`PROMPT_VERSION` 3 → 4), sur le `BossResult` de démo et la chaîne réelle du kill de 512 s (392 casts) : contexte boss 4 113 → 5 699 jetons estimés (+1 586), prompt système 1 646 → 2 061 (+415, une fois par rapport). Total ~5 759 → ~7 760, soit **+35 %** sur ce rapport à un boss, ou **+21 %** rapporté au relevé de production de 9 400 jetons. Estimation à 3,6 car./jeton et **annoncée comme telle** : le compteur d'Anthropic demande une clé que le dépôt n'a pas, même « non vérifié » qu'à l'étape 7. Glossaire de `CLAUDE.md` corrigé — l'ouverture n'est plus « non disponible », et **cast chain** y entre à côté d'elle. |
| 2026-09-04 | 9     | Le panneau de filtres est entièrement client : `describeCohort` rejoue `selectClosest` et `comparabilityLevel` sur le `sample` déjà rendu, donc bouger un réglage ne coûte ni requête WCL ni écriture Redis — un test le vérifie en assertant que `fetch` n'est jamais appelé. Position neutre = filtre vide, et le bouton de retour n'est actif que lorsqu'un réglage l'a quittée. Les quatre arbitrages de l'étape ont tenu, et un cinquième s'est présenté à l'exécution : la dernière position de chaque curseur est **Any**, parce qu'un axe qu'on ne peut qu'ouvrir ou fermer demandait sinon une bascule de plus par axe. Deux constats non prévus par l'étape. D'abord le panneau ne peut que **restreindre** : le vivier est celui de l'analyse, et le dire est plus honnête que de laisser croire qu'élargir l'ilvl ramènera quelqu'un. Ensuite l'avertissement sur les références détaillées écartées ne s'affiche qu'hors position neutre — au neutre, une référence substituée serait signalée comme exclue par le filtre alors que c'est la sélection qui l'a jugée, et `ReferenceLabels` le dit déjà juste au-dessus. Deux modules partagés extraits pour ne pas dupliquer le vocabulaire : `comparability-labels.ts` (le niveau doit se dire avec les mêmes mots dans le bandeau et dans le panneau) et `stat-format.ts` (un ilvl arrondi ici et à la décimale là se lirait comme un écart). `TOP_N` n'est pas exposé, et l'écran le nomme comme fixé au moment de l'analyse. |
| 2026-09-04 | 9 (E) | **La table de match devient la cohorte.** Chaque ligne porte une case, les `DEFAULT_CHECKED = 5` meilleurs matchs sont cochés à l'ouverture, et `StatsTable` comme `TalentDiff` rendent exactement les cochés — calcul client, `fetch` jamais appelé, un test l'asserte. Cinq et non trois : `TOP_N` compte les références **récupérées**, un coût de requêtes, alors qu'ici rien n'est récupéré ; une médiane sur cinq est plus stable que sur trois. **Deux gestes qui ne font pas la même chose** — les curseurs réduisent la liste proposée, les cases désignent la cohorte — et c'est le deuxième qui commande : le niveau, la distance médiane et les distributions annoncés par le panneau portent désormais sur les cochés (`selectedView`), pas sur les filtrés, sinon le panneau annoncerait un effectif que la table du dessous ne rendrait pas. **L'état monte dans `ComparisonTab`** (`useCohortState`, `src/hooks/`) parce qu'il a deux consommateurs : le laisser dans le panneau aurait demandé un `useEffect` pour le remonter, donc un rendu de retard et une divergence possible. `ComparisonTab` se scinde en gardes et `ComparisonBody` — un hook ne se place pas derrière un retour anticipé. **Trois écarts assumés.** D'abord `describeStats` prend un drapeau `chosen` : le repli `usableSample` écarterait en silence un disqualifié coché à la main, et un réglage qui ne change rien serait un réglage qui ment — c'est déjà la doctrine de `describeCohort`, qui ne passe pas par lui non plus. Ensuite la table de distributions du panneau perd ses axes d'équipement et ne garde que DPS et kill time : `StatsTable` les rend plus bas sur exactement la même cohorte, et deux tableaux identiques à comparer valent moins qu'un seul à lire. Enfin `CohortMember` gagne le pointeur de log (`logKey`, remonté dans `cohort.ts`) : le nom seul ne prouve pas qu'une case cochée et une référence détaillée désignent le même combat, et le chat n'en voit rien — `chat-tools` recopie les membres champ par champ. **L'avertissement change de mesure** : il nomme les références détaillées absentes de la cohorte **cochée**, décochées ou filtrées, la cause important moins que le fait qu'elles gouvernent encore les écrans de sorts ; toujours muet en position neutre, laquelle exige maintenant filtre vide **et** cases jamais touchées. Un coché que le filtre masque reste dans `picked` et revient si l'axe se rouvre. Le pied du panneau écrit la frontière : ce que les cases gouvernent (stats, build), ce qu'elles ne gouvernent pas (rotation, table de dégâts, ouverture — les `TOP_N` références détaillées, fixées à l'analyse). `ComparabilityBanner` et l'instantané n'ont toujours pas bougé. |
