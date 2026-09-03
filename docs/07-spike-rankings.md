# Spike : les arguments de `characterRankings`

Étape 3 de `PLAN_RETOURS_TEST.md` — une session sans code applicatif, dont la seule sortie
est ce fichier et les deux captures brutes qu'il cite. Les pages de documentation de
Warcraft Logs rendent 403 à tout accès scripté : rien de ce qui suit n'est lu dans une doc,
tout est mesuré contre l'API.

**Les sondes**, conservées dans le dépôt comme `scripts/probe-fight-url.ts` de l'étape 2 :

| Sonde | Ce qu'elle mesure | Capture brute |
| --- | --- | --- |
| [`scripts/probe-rankings-args.ts`](../scripts/probe-rankings-args.ts) | Introspection des arguments, `includeCombatantInfo` on/off, `bracket`/`size`, octets sur les pages 1, 5 et 10 | `spike-rankings-args.raw.json` |
| [`scripts/probe-rankings-args-2.ts`](../scripts/probe-rankings-args-2.ts) | Le même joueur par les deux chemins (jointure du gear), balayage des brackets, l'enum `ExternalBuffRankFilter` et son effet réel | `spike-rankings-args-2.raw.json` |

**Le banc d'essai** : zone « The Venomous Abyss », rencontre « Nek'zali the Soulcoiler »
(id 3470), `difficulty: 5`, `leaderboard: LogsOnly`, `metric: dps`. Cent entrées par page.
Brackets déclarés par la zone : `{"type":"Item Level","min":272,"max":344,"bucket":3}`.

## La liste d'arguments, confirmée par introspection

`Encounter.characterRankings` accepte dix-huit arguments :

```
bracket, difficulty, filter, page, partition, serverRegion, serverSlug, size,
leaderboard, hardModeLevel, metric, includeCombatantInfo, includeOtherPlayers,
className, specName, externalBuffs, covenantID, soulbindID
```

`queries.ts` en utilise cinq (`metric`, `difficulty`, `leaderboard`, `page`, `partition`,
plus `className`/`specName` selon le chemin). Les quatre qui intéressent le plan —
`bracket`, `size`, `includeCombatantInfo`, `externalBuffs` — existent bien.

Rappel de forme qui commande tout le reste : `characterRankings` rend un **scalaire JSON**.
On ne sélectionne pas de champs, donc `includeCombatantInfo` est tout ou rien.

## Question 1 — `includeCombatantInfo` rend-il l'équipement ?

**Oui pour le gear. Non pour ce qu'on venait y chercher.**

Aucune erreur GraphQL. L'argument ajoute trois clés par entrée :

```
sans : name, class, spec, amount, hardModeLevel, duration, startTime, report,
       guild, server, bracketData, faction
avec : … + talents, gear, externalBuffs
```

Mais le `gear` des rankings n'est pas le `gear` du `CombatantInfo`. Preuve sur **le même
joueur, le même combat** (Ragsharos, rapport `zmjNQtYvhMp6G9r4`, combat 22), les deux gear
joints pièce par pièce sur l'`id` d'objet — 17 pièces appariées sur 18 :

| Chemin | Clés d'une pièce | Le champ qui les sépare |
| --- | --- | --- |
| `CombatantInfo` | `id`, `quality`, `icon`, `itemLevel`, `permanentEnchant`, `bonusIDs`, `setID`, `gems`, `temporaryEnchant` | **`setID`** |
| `characterRankings` | `name`, `quality`, `id`, `icon`, `itemLevel`, `permanentEnchant`, `bonusIDs`, `gems`, `temporaryEnchant` | **`name`** |

WCL **échange `setID` contre `name`**. Ce n'est pas une absence propre à ce joueur : côté
`CombatantInfo` les cinq pièces de set portent bien `setID: 2066`, et les mêmes pièces vues
par les rankings n'ont pas le champ du tout. Dérive de typage à noter au passage : les
rankings rendent `itemLevel: "334"` et `quality: "epic"` (chaînes) là où `CombatantInfo`
rend `334` et `4` (nombres).

Conséquence directe : `tierPiecesOf` (`eligibility.ts`), qui regroupe sur `piece.setID`, ne
peut pas être réutilisé sur une entrée de vivier. **Le set bonus n'est pas lisible au niveau
du vivier.**

Les deux replis évidents ont été mesurés, les deux sont faux :

- **Par le suffixe de nom.** Les cinq pièces de set portent deux formes grammaticales —
  « Skull of the Damned Necrolyte », « Spires of the Damned Necrolyte », mais aussi
  « Damned Necrolyte's Rattling Robes », « … Leg Bindings », « … Charred Grasps ». Soit
  quatre suffixes distincts pour cinq pièces. Une règle de suffixe compte 2 pièces là où il
  y en a 5, et bascule le verdict 4p → 2p.
- **Par l'icône.** Les pièces de set sont
  `inv_{helm,shoulder,robe,pant,glove}_cloth_raidwarlockulatek_d_01.jpg`. Mais deux pièces
  **hors set** du même joueur sont `inv_boot_cloth_raidmageulatek_d_01.jpg` et
  `inv_bracer_cloth_raidmageulatek_d_01.jpg` — même famille d'art de palier, jeton de classe
  différent. Un rapprochement naïf compte 7 pièces et annonce un 4p qui n'existe pas.

Il resterait une table `id d'objet → setID` générée par palier, sur le patron de
`src/data/talents/` + `scripts/`. C'est faisable, mais c'est un chantier à soi, pas ce que
l'étape 6 avait budgété.

## Question 2 — `bracket` et `size` filtrent-ils vraiment ?

**`bracket` : oui, et la numérotation est déductible.** Balayage, sans erreur sur aucune
valeur :

| `bracket` | Entrées | Fourchette d'ilvl rendue |
| --- | --- | --- |
| 0 | 100 | 309–324 (non filtré) |
| 1 | 0 | — |
| 10 | 100 | 299–301 |
| 13 | 100 | 308–310 |
| 15 | 100 | 314–316 |
| 17 | 100 | 320–322 |
| 18 | 10 | 323–324 |
| 20, 25, 30 | 0 | — |

Formule confirmée sur cinq points, avec `min` et `bucket` lus dans `zone { brackets }` —
jamais codés en dur, ils changent de palier en palier :

```
bracket n  →  ilvl ∈ [min + (n−1)·bucket , min + n·bucket − 1]
bracket    =  floor((ilvl − min) / bucket) + 1
```

`bracket: 0` est le non-filtré ; au-delà du dernier bucket peuplé, la réponse est vide sans
erreur. Un bracket fait ici **3 ilvl de large contre `ILVL_TOLERANCE = 4`** : couvrir la
tolérance demande d'interroger environ trois brackets, pas un.

Le gain n'est pas seulement un filtre, c'est une **densité** : `bracket: 15` rend 100 entrées
en page 1 *et* 100 en page 2 dans la même tranche de 3 ilvl, `hasMorePages: true`. À budget
de requêtes identique, le vivier obtenu est incomparablement plus proche du sujet.

**`size` : oui, mais peu de valeur ici.** `size: 20` rend le vivier complet, identique au
non-filtré ; `size: 30` rend zéro. Cohérent — mais le Mythique est à 20 joueurs fixes, donc
`size` ne discrimine qu'en Normal et Héroïque.

## Question 3 — le volume tient-il sur `CANDIDATE_PAGES = 10` ?

**Non, pas avec le vivier tel qu'il est construit aujourd'hui.**

| Page | Sans `includeCombatantInfo` | Avec |
| --- | --- | --- |
| 1 | 35,5 Kio | 619,1 Kio |
| 5 | 35,0 Kio | 619,2 Kio |
| 10 | 34,7 Kio | 617,5 Kio |

Facteur **17×**, stable d'une page à l'autre. Or `fetchCandidatePool` tire
`CANDIDATE_PAGES = 10` pages par partition, sur jusqu'à `MAX_SEASON_PARTITIONS = 4`
partitions : jusqu'à 40 pages, soit **≈ 25 Mo** de réponses contre **≈ 1,4 Mo** aujourd'hui.
(Ce n'est pas la taille de l'objet mis en cache — celui-ci est dédoublonné et réduit — mais
c'est le facteur qui s'y applique.)

Le mur n'est pas la bande passante, c'est le cache. `pool-cache.ts` refuse d'écrire au-delà
de `MAX_CACHED_BYTES = 1 200 000` — plafond posé parce qu'au-delà le corps dépasse ce
qu'Upstash accepte en REST, et que l'écriture échouerait *à chaque analyse* au lieu de servir
une fois. **Une seule page enrichie remplit à elle seule la moitié du plafond.** Le vivier
cesserait d'être mis en cache, donc cesserait d'être partagé entre les joueurs d'une même
spec sur un même boss — c'est-à-dire exactement ce qui rend le cache payant.

Il existerait un montage tenable : réduire **avant** l'écriture — ne mettre en cache que ce
qu'on dérive, pas ce que WCL rend, en laissant les 619 Kio transitoires. Mais la question 1
a répondu que l'enrichissement ne livre pas le `setID` pour lequel on le voulait. **Il n'y a
donc plus de raison de payer ce volume au niveau du vivier.**

## Le résultat inattendu, plus gros que celui qu'on cherchait

`externalBuffs` est de type `ExternalBuffRankFilter`, enum à trois valeurs : `Any`,
`Require`, `Exclude`. Les trois rendent 100 entrées — mais 100 est la taille de page, le
compte ne discrimine rien. Mesuré sur le **contenu** des entrées :

| `externalBuffs` | Entrées | Dont porteuses d'un external |
| --- | --- | --- |
| `Any` | 100 | 59 (Power Infusion) |
| `Require` | 100 | 100 |
| `Exclude` | 100 | **0** |

C'est un vrai filtre à la source. L'**autre** critère éliminatoire — aujourd'hui payé par une
table `Buffs` par candidat à l'intérieur de `VERIFICATION_WINDOW = 12` — devient gratuit. Et
il fonctionne **sans** `includeCombatantInfo` : zéro octet de surcoût.

Réserve de conception pour l'étape 6, à ne pas perdre : `disqualify` n'élimine un candidat
que s'il a été aidé **plus** que le joueur. `Exclude` doit donc s'appliquer
**conditionnellement** — si le sujet lui-même porte Power Infusion, exclure tous les
candidats qui en portent supprime précisément les bonnes comparaisons.

## Ce qui est débloqué, ce qui ne l'est pas

**Étape 5 — « Le pourcentage de correspondance à l'écran » : débloquée, et elle ne dépendait
pas du spike.** Elle ne consomme que `distance`, déjà porté par `ScoredCandidate`. Rien de ce
qui précède ne la contraint.

**Étape 6 — « Filtrer chez WCL, et le set bonus comme critère » : coupée en deux.**

- **Volet filtres côté serveur : débloqué, et plus large que prévu.** `bracket` (avec la
  formule ci-dessus, `min`/`bucket` lus dans la zone), `size` en Normal/Héroïque, et le bonus
  `externalBuffs: Exclude` appliqué conditionnellement. Les trois **réduisent** le volume au
  lieu de l'augmenter, et resserrent le vivier là où ça compte. À traiter comme des filtres
  durs, jamais comme des composantes de distance — `CandidateMetrics` ne porte que
  `bracketData` et `duration`, et ce n'est pas à changer ici.
- **Volet « set bonus comme critère de sélection » : bloqué tel que spécifié.** L'étape 6
  prévoyait elle-même le cas : « Si le spike a répondu non à sa question 1, cette étape se
  réduit ou tombe. » Elle se réduit. Le `setID` est absent du contrat des rankings, et les
  deux replis dérivables sont faussés, mesures à l'appui. Deux suites possibles, à trancher à
  l'ouverture de l'étape : garder la vérification par candidat existante dans
  `VERIFICATION_WINDOW`, ou détacher une tâche « table de palier générée » qui n'est pas dans
  le plan aujourd'hui.

Un point du critère de sortie de l'étape 6 survit intact et devra être tenu quoi qu'il
arrive : **un vivier filtré ne doit jamais passer sous `TOP_N` sans que le niveau de
comparabilité le dise.** Avec trois filtres durs cumulables, le risque est plus élevé
qu'avant ce spike, pas moins.
