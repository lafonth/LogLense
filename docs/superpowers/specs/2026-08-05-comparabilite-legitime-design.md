# Comparabilité légitime et visible — design

**Date** : 2026-08-05
**Périmètre** : sélection des logs de référence et affichage du niveau de confiance
**Hors périmètre** : critères éliminatoires (externals, set bonus), capture d'étiquettes

---

## 1. Le problème, mesuré

`PRODUCT_CONTEXT.md` §2 pose la friction centrale : trouver des logs **comparables**. Le code
ne filtre que sur le kill time, à ±20 %, et retombe en silence sur le top 3 mondial quand
aucun candidat ne tombe dans la fenêtre.

Une mesure sur un cas réel — Jumbaa, Feral, Vorasius mythique, ilvl 284,1, kill 5:26 — donne
l'ampleur du défaut :

| Mesure | Valeur |
|---|---|
| ilvl des 100 premiers candidats | **291 à 293** (médiane 293) |
| Candidats à ilvl ≤ 284,1 en page 1 | **0** |
| Références effectivement retenues | 292,1 · 292,7 · 292,7 |
| DPS des références | 158 à 164 k, contre 105 k |

**Aucun des cent premiers candidats n'est comparable en équipement.** Le classement mondial
est par construction celui des meilleurs parses, donc des mieux équipés. Une partie de l'écart
de DPS présenté au joueur comme le sien vient de leur stuff.

Deux découvertes rendent le problème soluble à faible coût :

1. **L'ilvl est déjà dans la réponse.** Chaque entrée du classement porte `bracketData`, qui
   vaut l'ilvl (292 pour un joueur dont `avgIlvl` calculé vaut 292,1). Il n'a jamais été lu.
2. **Le vivier est déjà payé.** L'API renvoie 100 entrées par appel ; le code en garde 3. Le
   classement complet fait environ 29 pages, soit ~2900 entrées.

Profondeur nécessaire, mesurée sur le même cas : page 5 descend à 283, page 15 couvre 272 à
293 avec quatre candidats à 284 ou moins. **Les pairs existent, ils sont plus bas dans le
classement.**

Une piste écartée : l'argument `bracket` de `characterRankings` est accepté par le schéma mais
renvoie zéro entrée pour `bracket: 284` — c'est un index de tranche, pas un ilvl, et le
mapping n'est pas documenté. La pagination est la voie retenue.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Sans référence comparable | **Comparer quand même, en énonçant l'écart.** Ne jamais retomber en silence |
| Constitution du vivier | **Budget fixe, pages en parallèle** — les N premières pages, toujours |
| Choix des références | **Score de comparabilité, tri par proximité** — pas par performance |
| Pondération | ilvl et kill time à poids égal, chacun ramené à sa tolérance |

**Pourquoi comparer malgré tout.** Un joueur sous-équipé — précisément celui que le produit
vise, « le confirmé qui plafonne » — se retrouverait sans rien la plupart du temps si l'on
refusait de comparer. L'information reste utile tant que son écart est énoncé.

**Pourquoi un budget fixe plutôt qu'adaptatif.** Une pagination adaptative s'arrête tôt pour
un joueur bien équipé et enchaîne les pages en série pour un joueur sous-équipé : elle serait
la plus lente pour celui qui en a le plus besoin. Un budget fixe parallélisé a une latence
prévisible et un code simple.

**Pourquoi un score plutôt que des fenêtres.** Deux fenêtres strictes rendent zéro candidat
dans le cas mesuré ci-dessus, y compris sur mille candidats. Un score dégrade continûment,
ne rend jamais l'ensemble vide, et fournit directement le niveau de confiance à afficher.
`PRODUCT_CONTEXT.md` §2 classe d'ailleurs l'ilvl et le kill time comme **pondérables**, par
opposition aux critères éliminatoires que sont les externals et le set bonus.

**Pourquoi trier par proximité et non par DPS.** Trier les survivants par performance
reproduit « voici le meilleur joueur, copie-le », que le document produit écarte explicitement
au profit de « où se situe mon build dans la distribution des joueurs comparables ».

## 3. Constitution du vivier

`Q_WORLD_RANKINGS` gagne un argument `page`. Le pipeline récupère les `CANDIDATE_PAGES`
premières pages **en parallèle**, en un seul aller-retour, et concatène les résultats.

- Les doublons sont écartés sur la clé `${code}:${fightID}` — un même log peut réapparaître.
- Une page qui échoue n'annule pas les autres : elle est ignorée, et le nombre de pages
  effectivement obtenues est remonté.
- `CANDIDATE_PAGES = 10`, soit environ mille candidats. La mesure montre que cette profondeur
  couvre l'ilvl 272 à 293 sur le cas testé.

## 4. Le score de comparabilité

Fonction pure, sans réseau, dans `src/lib/wcl/references.ts`.

```
écartIlvl     = |candidat.bracketData − monIlvl| / ILVL_TOLERANCE
écartKillTime = |candidat.duration − maDurée| / maDurée / KILL_TIME_TOLERANCE
distance      = √(écartIlvl² + écartKillTime²)
```

`ILVL_TOLERANCE = 4` et `KILL_TIME_TOLERANCE = 0.2` (inchangé). Une distance de 1 signifie
« à la limite de la tolérance, tous critères confondus ». La forme euclidienne fait qu'un
candidat excellent sur un critère ne rachète pas entièrement un écart sur l'autre.

Les candidats sont triés par distance croissante ; on retient les `TOP_N` premiers.

Cas limites, tous à couvrir par des tests :
- `bracketData` absent ou nul sur une entrée → l'écart d'ilvl est traité comme inconnu et le
  candidat est classé après tout candidat scorable, plutôt qu'écarté ;
- `maDurée` de zéro → l'écart de kill time vaut zéro plutôt que de diviser par zéro ;
- vivier vide → aucune référence, et le niveau de comparabilité vaut `none`.

## 5. Ce que l'écran dit

`BossResult` gagne un bloc, non optionnel :

```ts
export interface Comparability {
  level: 'close' | 'approximate' | 'poor' | 'none';
  /** Médiane des références retenues, et la valeur du joueur, pour énoncer l'écart. */
  referenceIlvl: number | null;
  myIlvl: number;
  referenceKillTimeMs: number | null;
  myKillTimeMs: number;
  candidatesConsidered: number;
  pagesFetched: number;
}
```

Le niveau se déduit de la distance médiane des références retenues :

| Distance médiane | Niveau | Couleur |
|---|---|---|
| ≤ 1 | `close` | `text-positive` |
| ≤ 2 | `approximate` | `text-warning` |
| > 2 | `poor` | `text-danger` |
| aucune référence | `none` | `text-muted` |

`text-danger` sert enfin à ce pour quoi il a été réservé pendant le sous-projet 1 : signaler
une comparaison illégitime, et non un écart de performance.

**Les écarts sont signés**, jamais absolus. « Références à 292 d'ilvl, 8 de plus que toi ;
kills 30 % plus rapides » dit autre chose que « écart de 8 ». Un joueur mieux équipé que ses
références n'est pas dans la même situation que l'inverse.

Un composant `ComparabilityBanner` rend ce bloc au-dessus de la comparaison. Il est affiché
dans l'onglet Comparaison ; l'onglet Vue d'ensemble ne montre pas de références et n'en a
donc pas besoin.

## 6. Fichiers

**Modifiés**

| Fichier | Changement |
|---|---|
| `src/lib/wcl/queries.ts` | `Q_WORLD_RANKINGS` accepte `page` |
| `src/lib/wcl/constants.ts` | `ILVL_TOLERANCE = 4`, `CANDIDATE_PAGES = 10` |
| `src/lib/wcl/references.ts` | `fetchCandidatePool`, `scoreCandidates`, `selectReferencePool` réécrit ; `WorldRanking` gagne `bracketData` |
| `src/types/index.ts` | `Comparability`, porté par `BossResult` |
| `src/lib/wcl/pipeline.ts`, `report-pipeline.ts` | passent l'ilvl du joueur à la sélection, assemblent le bloc |
| `src/components/results/ComparisonTab.tsx` | rend le bandeau |

**Créé** — `src/components/results/ComparabilityBanner.tsx`.

Le commentaire de `selectReferencePool` qui documente aujourd'hui le fallback silencieux
disparaît : le défaut qu'il décrit n'existe plus.

## 7. Vérification

Les quatre commandes du hook à chaque commit : `pnpm typecheck`, `pnpm test`, `pnpm lint`,
`pnpm format:check`.

**Tests unitaires** — le score et la sélection sont purs :
- distance correcte sur des écarts connus, dans les deux sens ;
- tri par proximité et non par DPS : un candidat au DPS le plus élevé mais à l'ilvl le plus
  éloigné ne doit pas être retenu en premier ;
- les quatre niveaux de comparabilité, aux bornes exactes ;
- les trois cas limites de la section 4 ;
- déduplication du vivier sur `code:fightID` ;
- une page en échec n'annule pas les autres et `pagesFetched` le reflète.

**Test de composant** — `ComparabilityBanner` : les quatre niveaux, le signe des écarts, et
l'absence de `text-danger` pour autre chose que `poor`.

**Vérification fonctionnelle** — rejouer le cas mesuré, Jumbaa sur Vorasius mythique, par les
deux chemins. Attendu : des références nettement plus proches de 284 que les 292 actuels, un
niveau de comparabilité cohérent avec l'écart restant, et le même bloc `comparability` des
deux côtés. Le log `gjQ47FLB3Vf9XZDp`, combat 17, sert de cas de référence.

**Contrôle de non-régression** — le nombre de requêtes par boss passe de 1 à `CANDIDATE_PAGES`
pour le classement. Mesurer la latence avant et après sur le même boss et la consigner : si
elle dépasse le double, revoir `CANDIDATE_PAGES` avant d'aller plus loin.

## 8. Ce que ce design ne fait pas

Les **critères éliminatoires** — externals reçus, palier de set bonus — restent absents. Ils
exigent d'inverser le pipeline : récupérer les buffs et le `CombatantInfo` de dizaines de
candidats *avant* de choisir, là où tout se récupère aujourd'hui après. C'est un changement
d'architecture et un coût d'API d'un autre ordre, qui mérite son propre cadrage.

La **capture d'étiquettes** reste absente. Elle demande une décision de stockage que le projet
n'a jamais prise : il n'existe qu'un Redis en `GET`/`SET`.

Ce design est le prérequis des deux : il fournit le bloc `comparability` sur lequel un bouton
« pas comparable » viendra se greffer, et la structure de vivier qu'un filtre éliminatoire
viendra restreindre.
