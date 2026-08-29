# LogLense — revue produit et marché

Revue du **2026-08-22**. Elle **remplace intégralement** la version précédente, écrite avant
la sortie de la saison 2 et avant que le concurrent direct existe. Tout ce que l'ancien
document portait de technique vit désormais dans `docs/` ; ce fichier ne garde que le produit
et le marché.

Trois questions, dans l'ordre : où sommes-nous sur le marché, avons-nous une chance
d'attirer du monde, et le modèle saisonnier individuel + guilde tient-il.

---

## 0. Les trois faits qui déplacent les conclusions

Aucun n'était connu à la revue précédente. Ils sont donnés en premier parce que chacun
invalide un morceau de l'ancien raisonnement.

**1. Le plan que nous décrivions est déjà exécuté par quelqu'un d'autre.**
`WowCoach.gg` tourne aujourd'hui, développeur solo. Gratuit : uploads illimités, parsing,
death recap, DPS/HPS, 10 crédits d'accueil, résumés manuels plafonnés à 20/jour. Payant au
mois : Solo `$5.99` (60 crédits), Pro `$14.99` (200 crédits, « Sim This Pull » illimité,
analyse en direct, parsing prioritaire), Mythic `$24.99` (400 crédits). Crédits à l'unité,
25/`$2.99` à 100/`$10.99`. **Et les abonnements de guilde sont annoncés « coming soon »** :
Small `$89`/mois (5 sièges Pro + 5 Solo), Medium `$159` (10 + 10), Large `$219` (10 + 20),
avec facturation unifiée, intégration Battle.net, gestion des sièges, suivi de présence et
« bulletins hebdomadaires de roster générés par IA ». Aucune date engagée.

**2. Ce concurrent ne dépend ni de l'API WCL ni des CGU de RPGLogs.**
Il livre une application de bureau qui lit le fichier de combat local. Toute notre chaîne de
données passe par l'API WCL et par l'article §2a des CGU. C'est la faiblesse structurelle la
plus lourde du dossier, et elle n'est pas une question de fonctionnalité.

**3. Deux des quatre critères éliminatoires sont devenus des commodités.**
Warcraft Logs filtre **Power Infusion** dans ses Rankings depuis février 2023, et propose des
percentiles par **tranche d'ilvl** (« similar item level »). Ce que nous étions seuls à faire
se réduit donc à : la **parité de set bonus** (un 2p ne se compare pas à un 4p — invisible
dans les rankings, il faut le `CombatantInfo` de chaque candidat), la **proximité de kill
time**, le **composite des quatre**, et le fait de **dire à l'écran quand le filtre échoue**.

Un quatrième fait, favorable celui-là : la **saison 2 de Midnight est ouverte depuis le
2026-08-18 (NA) / 08-19 (EU)** — quatre jours. Raid _The Venomous Abyss_, 8 boss, toutes
difficultés ouvertes ensemble. C'est exactement la fenêtre où l'argument du produit est le
plus fort : aucun savoir expert n'existe encore, les logs sont la seule source de vérité.

---

## 1. Ce qui tourne réellement

Quatre modes en production, tous accessibles derrière la beta fermée (`BETA_ALLOWLIST` en
environnement ; liste absente ou vide = fermé à tous) :

| Mode        | Ce qu'il fait                                             | Passe par la comparabilité |
| ----------- | --------------------------------------------------------- | -------------------------- |
| `character` | nom de personnage → rankings → meilleur parse → rapport   | oui                        |
| `report`    | code de rapport WCL + acteur → rapport                    | oui                        |
| `raid`      | classe les joueurs d'une seule pull                        | non — autre axe            |
| `pull`      | compare deux pulls du **même** joueur                      | non — pas de vivier        |

16 routes d'API, 8 flux de capture, 94 fichiers de test / 915 tests au vert. La sélection de
références comparables, l'exclusion sur externals et set bonus, et le bandeau qui annonce
l'échec du filtre sont **écrits et livrés**. Rien ne lit encore le corpus de labels accumulé.

Ce qui n'existe pas : la vue roster (tâche 11, conditionnée à une infrastructure v2), toute
persistance permanente — tout le stockage est à TTL par choix CGU —, et tout canal
d'acquisition.

---

## 2. Positionnement

| Acteur                  | Rapport à nous                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warcraft Logs**       | Le substrat. Donne un **état**, jamais une trajectoire. Facture `$2`/mois basique, `$5` premium — c'est l'ancre de prix de tout le marché.      |
| **Archon**              | Frontal sur la distribution. **Propriété de RPGLogs** : notre concurrent le plus proche est le licencieur dont nous dépendons.                  |
| **WowCoach.gg**         | **Frontal sur tout le reste**, y compris le modèle de guilde. Voir §0.                                                                          |
| **WoWAnalyzer**         | Frontal sur l'individuel. Règles écrites à la main, gratuit, open source, plus actionnable qu'un percentile. Couverture de specs inégale.       |
| **ParseForge.gg**       | Gratuit, mais **Classic uniquement** — pas de Midnight retail.                                                                                  |
| **Wipefest**            | Mécaniques de raid, timeline. Complémentaire, pas concurrent.                                                                                   |
| **Raidbots/Bloodmallet**| Optimum théorique. Complémentaires.                                                                                                             |

**La position tenable est étroite et elle a un nom** : nous sommes le seul outil qui refuse de
comparer quand la comparaison n'est pas légitime, et qui **le dit**. Tous les autres affichent
un écart sans dire ce que cet écart contient. C'est un argument de méthode, pas de
fonctionnalité — donc difficile à copier vite, et difficile à vendre en une ligne.

**Ce qui n'est pas un argument** : la rédaction du rapport en langue naturelle. Défendabilité
nulle, réplicable en un week-end. L'actif n'est jamais l'algorithme, c'est le jeu de données
labellisé.

---

## 3. Avons-nous une chance d'attirer du monde ?

**La taille du marché n'est pas le problème.** WCL suit plus de `400 000` raiders actifs
uniques par palier. Le raid mythique est à son plus haut depuis dix ans sur Midnight :
`780 000` parses en semaine 10 de la S1 (DPS seuls), contre `259 194` pour TWW S3 et
`150 018` pour Dragonflight S3 sur leurs deux dernières semaines.

**Le problème est le canal, et il n'y en a aucun.** Pas de référencement, pas de présence
Discord, pas de post Reddit, pas de bouche-à-oreille. Un produit derrière une allowlist ne
s'acquiert pas tout seul. C'est la lacune numéro un du dossier — devant la fonctionnalité,
devant le prix, devant les CGU.

**Le message qui peut porter existe, il est mesuré, et il ne sert nulle part.** Sur une
analyse réelle : le vivier de références était à ilvl `292` contre `284` pour le joueur ;
après filtrage sur du matériel comparable, l'écart de DPS présenté est passé de `55k` à
`25k`. **Plus de la moitié de ce qu'on annonçait au joueur comme son retard venait de
l'équipement des références.** Aucun concurrent ne peut dire cela, parce qu'aucun ne mesure
la chose. C'est le seul contenu d'acquisition dont nous disposons qui ne soit pas
interchangeable.

**Fenêtre** : elle est ouverte maintenant, semaine 1 de la saison. Elle se referme quand les
guides de spec se stabilisent, autour de la semaine 4 — le même mur que la rétention.

Verdict : **oui, mais pas sans un canal choisi et une raison de parler de nous.** Le produit
n'est pas le blocage ; l'absence de distribution l'est.

---

## 4. La monétisation saisonnière, individuelle + guilde

### 4.1 Ce que la saisonnalité résout

Elle résout deux choses réelles. Le churn de semaine 4, d'abord : un abonnement mensuel se
résilie dès que le joueur a fini de progresser, un pass de saison est acheté pour la durée du
palier et n'a pas de moment de résiliation. L'objection « encore un abonnement », ensuite —
elle était majoritaire dans le sondage de guilde (~25 raiders) qui a validé la douleur mais
**pas** la disposition à payer, jamais chiffrée.

Le concurrent facture **au mois**. C'est notre seul écart de modèle, et il est du bon côté :
sur un palier de trois mois, un pass de saison est plus cher à l'unité et moins cher au
total, et il ne demande pas au joueur de penser à annuler.

### 4.2 La couche guilde

Elle est juste, et pour une raison précise : le raid leader paie une fois, vingt-cinq joueurs
sont couverts. Elle résout l'objection du prix par personne mieux qu'aucune remise.

**Mais son contenu doit être d'une autre nature que l'individuel.** Le risque était identifié
dès la revue précédente et il est aujourd'hui réalisé chez le concurrent : si le produit
individuel gratuit est excellent, il devient _le_ produit dans la perception, et la couche
payante ressemble à une rançon. Une vue guilde qui n'est qu'un écran individuel déverrouillé
sera lue comme telle. Ce qui n'existe qu'au niveau du roster : **qui progresse et qui
stagne** sur le palier, la comparaison entre joueurs du même rôle, la priorisation de
l'attention du RL. Rien de tout cela n'a de sens pour un joueur seul.

### 4.3 Le découpage retenu

|                                 | Contenu                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gratuit**                     | La vue d'un log, à un instant. C'est ce que WCL donne déjà.                                                                                                           |
| **Individuel, pass de saison**  | Comparabilité complète (set bonus, externals, ilvl, kill time) et le signal quand elle échoue ; historique de progression sur tout le palier ; rapport de coaching IA. |
| **Guilde, pass de saison**      | Un achat pour le roster. Qui progresse, qui stagne, comparaison entre joueurs du même rôle, priorisation du RL.                                                       |

Explicitement rejeté, et toujours : « données structurées gratuites, rapport IA payant ».
Cela donne le coûteux à construire et facture le coûteux à servir, et c'est réplicable en un
week-end.

### 4.4 Verdict

Réécrit le **2026-08-29**, étape 7 de [`PLAN_SAISON.md`](PLAN_SAISON.md). Le modèle est
tranché ; le prix ne l'est pas, et la section dit pourquoi il ne pouvait pas l'être ici.

#### Le modèle : pass de saison, pas d'abonnement

Un achat par palier, qui expire avec lui. Trois raisons, dans l'ordre où elles pèsent — et
aucune n'est celle du §4.1.

1. **C'est le seul modèle que l'architecture porte déjà.** Toute la persistance est à TTL
   (§5) : un pass est un droit qui expire à une date, exactement la primitive que `redis.ts`
   expose depuis le premier jour et qu'`access.ts` administre déjà. Un abonnement demande un
   cycle de vie complet — renouvellement, échec de prélèvement, relance, proration,
   résiliation, remboursement — soit une machine à construire et à tenir, pour un développeur
   seul, sur un produit qui n'a pas un utilisateur payant.
2. **Le paiement tombe au pic d'intention.** La valeur du produit est concentrée dans les
   premières semaines du palier, quand aucun guide de spec n'existe encore (§0, quatrième
   fait) — c'est le raisonnement qui ordonne tout `PLAN_SAISON.md`. Un pass encaisse là. Un
   abonnement encaisse surtout après, au moment précis où le joueur cherche à résilier. Ce
   n'est pas le confort du joueur qui décide, c'est la date de l'encaissement.
3. **Le frais fixe du processeur.** Repère de marché, le processeur n'étant pas choisi :
   `1,5 % + 0,25 €` par transaction sur une carte de l'EEE, `5 % + 0,50 €` chez un vendeur de
   référence qui porte la TVA. Facturé au mois, le fixe est prélevé trois fois par palier : à
   `4 €/mois` il mange `6,3 %` du chiffre, contre `3,6 %` en un paiement de `12 €`. Le pass
   rend plus à prix total égal, sans rien demander de plus au joueur.

Ce que le pass coûte, et qui est assumé : **la totalité du renouvellement est à regagner à
chaque palier, visiblement.** C'est le prix du modèle, pas un défaut à corriger — le §4.1
postule de toute façon un churn de semaine 4 sur un abonnement, donc l'alternative n'est pas
une rétention qui dure, c'est la même perte, moins visible.

**Un seul palier de prix individuel.** Pas de crédits, pas de niveaux : la grille du
concurrent (§0.1) est à trois étages plus des crédits à l'unité, et c'est précisément ce qui
fait lire son gratuit comme une rançon. Un pass qui laisse la vue d'un log gratuite et entière
(§4.3) est la forme la plus éloignée du précédent Raider.io.

#### Le prix : la fourchette est écrite, le point ne l'est pas

**La disposition à payer n'est toujours pas chiffrée, et la fixer ici serait l'inventer.**
`QUESTION_PRIX.md` est écrite mais n'a été posée à personne : le post de l'étape 5 n'est pas en
ligne, donc aucun inconnu n'est entré, donc il n'existe pas une seule réponse. L'étape 7 dit
« pas avant » — elle a raison contre elle-même.

Ce qui est décidable sans le sondage — le coût et le positionnement — donne la fourchette :

| Repère, ramené au palier de trois mois | Montant    |
| -------------------------------------- | ---------- |
| WCL basique `$2`/mois                  | `≈ 5,50 €` |
| WCL premium `$5`/mois                  | `≈ 14 €`   |
| WowCoach Solo `$5,99`/mois             | `≈ 17 €`   |
| WowCoach Pro `$14,99`/mois             | `≈ 42 €`   |

Nous sommes un **complément** de WCL premium, pas un substitut : le raider visé le paie déjà,
et le pass s'ajoute à sa dépense au lieu de la remplacer. Un prix au-dessus de `14 €`
demanderait donc de valoir plus que la source de données elle-même, ce que rien ne soutient
aujourd'hui. En bas, sous `10 €`, le pass ne finance plus grand-chose au-delà de ses frais
fixes. **Fourchette retenue : `10` à `15 €` par palier ; hypothèse de travail `12 €`.**

L'hypothèse n'est pas un prix. Ce qui la fige, et rien d'autre : les bornes de la question 2 de
`QUESTION_PRIX.md`, sur quatre à six réponses hors guilde. La règle de lecture est posée
d'avance, pour qu'elle ne se négocie pas après coup :

- **Le point ne dépasse jamais la plus basse borne « trop cher » recueillie.** À n = 5, on ne
  se place pas au-dessus d'un refus déjà exprimé.
- **Si les bornes « sans réfléchir » tiennent sous `5 €` par palier, le pass individuel ne
  finance rien** et cette section est réécrite, pas ajustée.
- **Une ligne rouge nommée par deux personnes sur cinq à la question 3 sort son contenu du
  pass**, quel que soit le prix.

#### La marge, elle, est mesurée

Sur l'hypothèse à `12 €`, coûts marginaux issus du relevé de l'étape 3 (`0,0036 €` par rapport
et `0,00135 €` par tour de chat sur `gemini-3.5-flash-lite`, `× 8,6` sur Claude Sonnet 5) :

| Par acheteur et par palier               | Gemini       | Claude Sonnet 5 |
| ---------------------------------------- | ------------ | --------------- |
| Processeur de paiement                   | `0,43 €`     | `0,43 €`        |
| IA, usage médian (25 rapports, 40 tours) | `0,14 €`     | `1,24 €`        |
| IA, au plafond posé ci-dessous           | `0,34 €`     | `2,94 €`        |
| **Marge nette, usage médian**            | **`11,4 €`** | **`10,3 €`**    |
| **Marge nette, au plafond**              | **`11,2 €`** | **`8,6 €`**     |

Non mesurée, et volontairement laissée telle : l'infrastructure fixe (Vercel, Upstash), de
l'ordre de `25 €/mois`, soit `75 €` par palier. **Sept acheteurs la couvrent.**

D'où la seule conclusion que ces chiffres autorisent, et elle déplace l'ordre des travaux : **la
marge unitaire ne contraint rien — `72 %` dans le pire cas, aucun choix de prix raisonnable ne
la met en danger. Le nombre d'acheteurs commande tout.** Le §4.4 précédent classait la fenêtre
concurrentielle avant la disposition à payer ; les deux sont des questions d'acquisition, et
c'est la réserve n° 1 ci-dessous qui reste la seule ouverte.

#### Le plafond d'usage, et le fournisseur

**Plafond : `50` rapports IA et `120` tours de chat par pass et par palier**, soit deux fois
l'usage médian supposé. Au-delà, le BYOK, qui existe déjà (`catalog.ts`) — le plafond n'est donc
pas un mur, c'est le point où le joueur atypique paie son propre modèle. Il borne le pire cas à
`2,94 €` sur le fournisseur le plus cher du catalogue.

**Le fournisseur ne se choisit pas ici, et `QUESTION_PRIX.md` a tort de le renvoyer à l'étape 7
comme une question de prix.** Le plafond posé, l'écart Gemini → Claude vaut `2,60 €` par
acheteur dans le pire cas, `1,10 €` au médian : payable, donc non contraignant. Ce qui reste est
une question de qualité, et la trancher sur le prix serait exactement la faute que le critère
anti-gadget nous fait reprocher aux autres — payer neuf fois plus pour un gain que trois rendus
mesurés ne démontrent pas. **Le défaut reste Gemini jusqu'à ce qu'une comparaison à l'aveugle de
rendus sur le même combat dise autre chose.** Le prix ne bloque pas cette comparaison ; personne
ne l'a faite.

#### La couche guilde : aucun prix cette saison

Le §4.3 lui donne un contenu — qui progresse, qui stagne, comparaison entre joueurs du même rôle
— dont **rien n'est construit** : c'est la vue roster, que `PLAN_SAISON.md` place sous la ligne
de coupe. Annoncer une grille de guilde sans la vue serait un engagement de livraison sur un
écran qui n'existe pas. Le pass individuel est le seul objet vendable de cette saison.

#### Ce qui reste ouvert, et ce qui ne l'est plus

Des trois réserves de la version précédente, une seule survit intacte : **le concurrent a
annoncé sa grille de guilde avant nous**, et nous n'y répondons pas cette saison — c'est assumé
en fin de `PLAN_SAISON.md`, pas oublié. Le **précédent de rejet** (campagne « Blizzard needs to
ban Raider IO », plus de `50 000` mises à jour en file pour les non-abonnés) n'est plus une
réserve mais une contrainte de forme, satisfaite par un pass à palier unique posé au-dessus
d'une vue de log gratuite et entière. La **disposition à payer** n'est plus une réserve non
plus : c'est une mesure programmée, dont l'instrument est écrit et le protocole de lecture fixé
ci-dessus.

**La règle « aucun prix public » de `PLAN_SAISON.md` n'est pas levée par ce commit.** Le plan
prévoyait qu'elle le soit ; il supposait que l'étape 7 disposerait des montants. Ce qui la lève :
les réponses de `QUESTION_PRIX.md` au journal, et le point de la fourchette écrit ici en toutes
lettres. D'ici là, ni le badge `Pro`, ni cette section, ni aucune page ne porte de montant.
---

## 5. Ce qui est tranché, et ne se rediscute pas

- **Pas de travail de comparabilité supplémentaire.** Le §0.3 le renforce plutôt qu'il ne
  l'affaiblit : le seul terrain qui nous reste en propre — parité de set bonus, kill time,
  composite, aveu d'échec du filtre — est **déjà écrit**. En ajouter ne creuse aucun écart.
  Faire converger les quatre pipelines n'est pas au programme non plus.
- **Le badge `Pro`** sur la carte du rapport IA reste, bien qu'il ne verrouille rien : il fait
  lire l'écran comme le découpage du §4.3 plutôt que comme un outil gratuit complet. Tenable
  tant que la page publique ne porte **ni prix, ni panier, ni bouton d'abonnement**.
- **Aucun courrier d'approbation à RPGLogs** (décidé le 2026-08-21). On construit comme si
  l'accord était acquis.
- **Toute la persistance reste à TTL**, sauf le corpus de labels, borné par mois et jamais
  purgé. Repousser le calcul est acceptable ; repousser la capture ne l'est pas.

## 6. Ce qui reste ouvert, par ordre

1. **Choisir un canal d'acquisition.** Un seul, cette saison, pendant que la fenêtre est
   ouverte. Sans lui, le reste ne se pose pas.
2. **Publier le chiffre `55k → 25k`** — c'est le contenu, pas un détail de communication.
3. **Chiffrer la disposition à payer** auprès de la guilde beta, en euros, sur un pass de
   saison.
4. **La vue roster** — le seul manque fonctionnel qui compte pour la couche guilde.
5. **Lire le corpus accumulé.** Rien ne le fait aujourd'hui ; c'est l'actif, et il dort.

Ce qui **ne** figure pas dans cette liste et ne doit pas y remonter : plus de comparabilité,
un meilleur rapport IA, une convergence des pipelines.
