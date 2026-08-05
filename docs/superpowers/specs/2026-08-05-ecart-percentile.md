# Écart de percentile entre les deux chemins d'analyse

**Date** : 2026-08-05
**Trouvé pendant** : vérification fonctionnelle des deux pipelines après leur déduplication
**Statut** : défaut préexistant, non corrigé, non introduit par le refactor

## Le constat

Le même kill analysé par les deux chemins donne deux percentiles différents.

Cas observé — Jumbaa (Ysondre-EU), Vorasius mythique, log `gjQ47FLB3Vf9XZDp` combat 17 :

| Champ | Chemin personnage | Chemin rapport |
|---|---|---|
| DPS | 105 538 | 105 538 |
| Boss DPS | 96 965 | 96 965 |
| Kill time | 5:26 | 5:26 |
| ilvl | 284,1 | 284,1 |
| **`overallPct`** | **81,1** | **67** |
| **`overallPctOf`** | **2519** | **null** |
| **`todayPct`** | **67,5** | **null** |
| Références | 3, identiques et dans le même ordre | 3, identiques et dans le même ordre |

Tout ce qui provient du log lui-même concorde exactement. Seuls divergent les champs de
classement, et ils proviennent de deux sources WCL différentes :

- `pipeline.ts` lit `characterData.character.encounterRankings` ;
- `report-pipeline.ts` lit `reportData.report.rankings`.

## Pourquoi c'est un problème produit

Les deux valeurs sont affichées sous le même libellé. Un utilisateur qui analyse son combat
par son personnage obtient 81,1 % ; le même combat analysé par le code du rapport donne 67 %.
Rien à l'écran ne dit que ces deux nombres ne mesurent pas la même chose.

`PRODUCT_CONTEXT.md` §7 désigne cette catégorie comme la plus coûteuse : l'utilisateur ne peut
pas distinguer un chiffre fiable d'un chiffre trompeur.

## Piste

Le 67 du chemin rapport est proche du 67,5 que le chemin personnage nomme `todayPercent`.
Hypothèse à vérifier : `report.rankings.rankPercent` correspondrait au classement du jour, et
non au classement historique, auquel cas les deux chemins étiquettent des mesures différentes
sous le même nom.

À confirmer contre la documentation de l'API WCL avant toute correction. Deux chiffres
identiques obtenus par hasard ne prouveraient rien ; il faut savoir ce que chaque champ mesure.

## Ce que la vérification a par ailleurs établi

La déduplication des deux pipelines est **neutre** : sur ce même combat, `fight-data`,
`combatant` et `references` produisent des sorties identiques des deux côtés — mêmes stats,
mêmes talents, mêmes 14 sorts, mêmes cibles aux mêmes pourcentages, mêmes trois références
dans le même ordre. C'est la vérification fonctionnelle que les tests unitaires ne pouvaient
pas fournir.

Note annexe : les trois références retenues ont un ilvl de 292 contre 284 pour le joueur.
Illustration directe du constat C4 — l'ilvl est calculé mais n'entre pas dans la sélection.
