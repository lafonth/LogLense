# Plan parqué — le contexte de spec, et peut-être celui du boss

Ouvert le **2026-08-28**, à la suite d'une question posée entre l'étape 3 et l'étape 4 du
[`PLAN_SAISON.md`](PLAN_SAISON.md). **Rien ici n'est décidé et rien n'est à faire cette
saison.** Ce fichier existe pour qu'un brainstorm ultérieur reparte de l'analyse déjà faite
plutôt que de la refaire.

## L'idée, telle qu'elle a été posée

Tenir un contexte par classe et par spécialisation, **peuplé à chaque saison et mis à jour à
chaque patch**, à la main. Peut-être y ajouter la stratégie de chaque boss. Objectif énoncé :
donner de quoi comprendre **si le joueur a bien saisi comment jouer sa spec sur ce combat**,
et en tirer de meilleurs conseils dans le rapport et dans le chat.

## Pourquoi c'est parqué et pas refusé

Hors de la fenêtre de saison : le `PLAN_SAISON.md` se referme vers la semaine 4, et ses
étapes 4 à 7 portent l'ouverture de l'accès et le prix. Aucune n'est bloquée par la qualité
de formulation du rapport. Un corpus de ~40 specs introduit maintenant déplacerait le reste
du plan pour un gain qui ne vend rien.

L'entretien manuel assumé par le propriétaire du produit lève l'objection qui tuait l'idée
lors du premier passage — « qui maintient 40 specs à chaque patch ». Elle est levée par une
personne, pas par un générateur : voir la réserve sur la péremption plus bas.

## Trois choses distinctes sous un seul mot

C'est la distinction qui doit survivre au brainstorm. Elles ne se jugent pas ensemble.

### A — Le guide prescriptif

« Voici la rotation du Mage Feu, voici la priorité. » **Reste refusé**, et pas par prudence :

- Il échoue au critère anti-gadget. Le substitut le moins cher est Icy Veins / Wowhead /
  Method : gratuits, refaits dans les heures qui suivent un patch, adossés à des sims. La
  cible — *le raider confirmé qui plafonne* — les a déjà lus.
- Il est déjà interdit dans le code : `TRACEABILITY_RULE` (`src/lib/ai/prompt.ts`) dit
  littéralement *« no theorycrafted priority list, no simulation result, no remembered
  guide »*.
- Il dilue le positionnement : on ne dit pas la théorie, on montre ce que des joueurs
  comparables ont réellement fait. Un guide écrit par nous nous range parmi les sites de
  guides, où nous sommes le moins bon.

### B — La métadonnée d'interprétation

Une table par spec : **quel sort est la contrepartie AoE de quel autre**, charges, cooldown,
ressource, sort à procs, sort de remplissage. Ce n'est pas un conseil, c'est le vocabulaire
nécessaire pour formuler correctement une mesure qu'on possède déjà.

Le manque est écrit noir sur blanc dans le prompt, `STEP 2` : *« sur beaucoup de specs cela
veut dire qu'une capacité mono-cible est utilisée là où le combat appelle son équivalent
multi-cible — mais pas sur toutes : certaines cleave passivement »*, puis le repli **« traite
la paire de substitution comme une hypothèse et confirme-la à l'étape 3 »**. Cette prudence
est une béquille : faute de savoir, on fait deviner le modèle puis vérifier. Une table
trancherait.

**Implémentation juste : de la donnée, pas de la prose.** `src/data/spells/` sur le modèle de
`src/data/talents/`, généré ou saisi par un script de `scripts/`. Injecter des paragraphes
dans le prompt serait le mauvais outil et le mauvais coût.

### C — Le jugement de compréhension

C'est ce que la question visait réellement : pouvoir dire *« tes chiffres disent que tu joues
ce combat comme du mono-cible alors que c'est un combat de cleave »*. Cela demande B **plus**
une forme d'intention de combat — donc la stratégie de boss. C'est là qu'est la valeur
recherchée, et c'est aussi le point le plus cher et le plus risqué du dossier.

## Les deux collisions à trancher, pas à contourner

1. **`TRACEABILITY_RULE` interdit le souvenir de guide.** Toute connaissance injectée doit
   être réconciliée avec elle explicitement. Si on la modifie, on la modifie en connaissance
   de cause, jamais par effet de bord d'une nouvelle fonctionnalité. Piste à explorer : B
   n'est pas un souvenir de guide mais une propriété du jeu (un sort a deux charges, ou il
   n'en a pas) — la règle pourrait distinguer *fait de jeu vérifiable* et *recommandation
   remémorée*.
2. **La stratégie de boss est la négation frontale de `SCOPE_RULE`.** Le prompt dit *« outgoing
   damage only… never advise on survival, defensives, deaths, interrupts, positioning or boss
   mechanics »*, et l'outil `decline_out_of_scope` du chat existe sur cette base. Le périmètre
   est une **position produit assumée**, pas une limite subie. L'élargir n'est pas une
   extension, c'est un renversement — et le refus du chat cesse d'être un constat honnête
   (« nous n'avons aucune donnée là-dessus ») pour devenir une politique arbitraire. C'est la
   plus grosse décision du fichier ; elle se prend seule, en premier.

## Les réserves à ne pas perdre

- **Une table périmée est pire que pas de table.** Elle produit des affirmations confiantes et
  fausses — exactement ce que `TRACEABILITY_RULE` existe pour empêcher. Toute conception doit
  donc porter un **horodatage de fraîcheur par spec** et **dégrader vers le silence** quand la
  spec n'a pas été revue depuis le dernier patch. Le silence est une réponse acceptable ; une
  correction inventée ne l'est pas.
- **Le prérequis est le cache, pas le contenu.** Mesuré le 2026-08-28 (étape 3) : ~9 400 jetons
  d'entrée neuve par rapport, et **le cache ne prend jamais** — zéro sur les cinq relevés. Un
  contexte de spec est statique et donc parfaitement cachable. Le poser avant d'avoir réparé le
  cache, c'est acheter un multiplicateur sur le poste le plus cher du produit. Réparer le cache
  vaut probablement plus, à soi seul, que la fonctionnalité.
- **Le gain de B seul est étroit.** Il n'ajoute pas une analyse, il rend une analyse existante
  moins hésitante. Réel, mais mince. C'est C qui porte la valeur — et C est cher.

## Questions ouvertes pour le brainstorm

1. Le périmètre s'élargit-il aux mécaniques de boss, oui ou non ? Tout le reste en dépend.
2. B est-il générable depuis une source (SimC, données de jeu) ou saisi à la main ? Si la
   saisie manuelle est le seul chemin, quel est le coût réel d'une passe de patch, mesuré sur
   une spec avant de s'engager sur quarante ?
3. Où le contexte entre-t-il : bloc système caché, ou champs structurés lus par le code sans
   passer par le modèle ? La seconde option est moins chère et moins faillible.
4. Quel est le substitut le moins cher de C, et l'utilisateur le remarquerait-il ? Le test
   anti-gadget n'a pas encore été passé sur C — seulement sur A et B.
5. Y a-t-il un modèle de revenu ? Un corpus entretenu à la main est un coût récurrent, et la
   contrainte communautaire interdit le paywall dur sur l'utilitaire.

## À lire avant de reprendre

`src/lib/ai/prompt.ts` (`TRACEABILITY_RULE`, `SCOPE_RULE`, `STEP 2`), `src/lib/ai/chat-prompt.ts`,
`src/lib/ai/chat-tools.ts` (`decline_out_of_scope`), `src/data/talents/`,
`PRODUCT_CONTEXT.md` §5, `ia-ml-architecture.md` §6.1.
