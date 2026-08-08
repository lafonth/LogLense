# Mode raid — design

**Date** : 2026-08-08
**Périmètre** : depuis un code de rapport WCL, classer les joueurs d'un combat par marge de
progression, et ouvrir l'analyse complète sur celui qu'on choisit
**Hors périmètre** : la vue roster de la tâche 11, qui agrège un tier entier et suppose le
pré-calcul de la v2

---

## 1. Pourquoi celui-ci d'abord

C'est le seul candidat sérieux de **canal d'acquisition**. Un rapport individuel ne se
partage pas ; un lien qui classe un raid entier se colle dans un Discord de guilde. La
section 6.6 de [ia-ml-architecture.md](../../../ia-ml-architecture.md) a déplacé le blocage
de la v2 : ce n'est pas la donnée, c'est le nombre d'utilisateurs. Ce chantier attaque
exactement ce blocage.

Il donne aussi la valeur guilde — le persona payeur tranché en section 4 de
[PRODUCT_CONTEXT.md](../../../PRODUCT_CONTEXT.md) — **sans attendre l'infra v2**, parce qu'il
ne résout aucune référence.

## 2. L'idée qui rend la chose bon marché

Le pipeline individuel coûte cher parce qu'il va chercher un vivier de candidats comparables
chez WCL. Le classement du raid n'en a pas besoin : `report.rankings` porte déjà un
percentile par joueur, et **un percentile est une position dans une distribution, donc
déjà une mesure de marge**. Le coût du classement est celui d'une requête, pas de douze.

L'analyse complète — références, éligibilité, rapport — ne part que sur le joueur qu'on
ouvre. On paie le pipeline cher une fois, à la demande, au lieu de vingt-cinq fois d'avance.

## 3. Le prérequis à vérifier avant tout code

**`report.rankings` porte-t-il tous les acteurs du combat, ou seulement celui demandé ?**

`src/lib/wcl/report-pipeline.ts` interroge aujourd'hui cette donnée pour un acteur connu.
Rien dans le code actuel ne prouve que la réponse couvre le raid entier. Deux issues :

- **Elle couvre le raid** — le classement est une requête, le chantier est petit.
- **Elle ne couvre qu'un acteur** — il faut passer par la table de dégâts du combat et
  classer sur le DPS, sans percentile. Le classement reste possible mais **change de nature** :
  il ordonne par DPS brut et non par position dans une distribution, ce qui pénalise
  mécaniquement les specs faibles du tier. Dans ce cas, l'écran doit le dire.

**Cette vérification est la première tâche, et son résultat conditionne le reste de la
spec.** Écrire l'interface avant de connaître la réponse serait construire sur une hypothèse.

## 4. Le bonus exact, à ne pas manquer

**Deux joueurs de la même pull ont la comparabilité résolue par construction.** Même kill
time, même composition de raid, mêmes buffs de groupe, même pull. Les critères éliminatoires
de `src/lib/wcl/eligibility.ts` — écart de kill time, externals reçus, set bonus — deviennent
**exacts** au lieu d'approchés, et gratuits : le `CombatantInfo` de tous les acteurs vient
avec le rapport.

Corollaire : la comparaison entre deux joueurs de même spec dans le même raid est le
verdict de comparabilité le plus solide que le produit sache produire. Il mérite d'être
étiqueté au corpus comme classe positive de haute confiance, distincte des positives
implicites déjà capturées.

## 5. Décisions

| Sujet | Décision |
|---|---|
| Entrée | **Code de rapport seul.** Le combat se choisit ensuite, pas dans l'URL |
| Critère de classement | **Percentile** si `report.rankings` le donne pour tous ; **DPS** sinon, et l'écran le nomme |
| Coût du classement | **Une requête.** Aucune résolution de références, aucun appel par joueur |
| Analyse individuelle | **À la demande**, sur le joueur ouvert, par le pipeline rapport existant |
| Éligibilité intra-raid | **Calculée sur les acteurs du combat**, sans vivier externe |
| Rapport IA | **Absent de la vue raid.** Il reste sur l'analyse individuelle |

**Pourquoi pas de rapport IA sur la vue raid.** Un rapport par joueur, c'est vingt-cinq
appels LLM sur un écran qu'on ouvre pour trier. Le tri doit être gratuit ; la prose se paie
sur le joueur qu'on a choisi.

**Pourquoi le code seul en entrée.** Un raid leader colle ce qu'il a — l'URL du rapport.
Lui demander en plus un combat et un acteur, c'est lui demander de faire le travail que
l'écran doit faire.

## 6. Ce qui est livré

1. **Récupération du classement d'un combat** dans `src/lib/wcl/`, à côté de
   `report-pipeline.ts` et sans le modifier : entrée `code` + `fightID`, sortie une liste de
   joueurs avec nom, spec, DPS, et percentile quand il existe.
2. **Éligibilité intra-raid** dans `eligibility.ts` : la variante exacte, qui prend les
   acteurs d'une même pull et n'a besoin d'aucun vivier.
3. **Écran de raid** : la liste triée par marge, la spec de chacun, et la provenance du
   critère de tri énoncée en clair — jamais un classement dont on ignore l'axe.
4. **Ouverture d'un joueur** vers l'analyse existante, en réutilisant le pipeline rapport
   avec le `code`, le `fightID` et l'`actorId` déjà connus.
5. **Capture au corpus** d'une comparaison intra-raid comme classe positive de haute
   confiance, schéma versionné, pointeurs seuls, cohérente avec
   [la capture d'étiquettes](2026-08-06-capture-etiquettes-design.md).

## 7. Ce qui n'est pas livré

- Aucune agrégation sur plusieurs boss : c'est le point 8.
- Aucun suivi dans le temps du raid : il suppose la même antériorité que la tâche 11.
- Aucun classement des soigneurs ni des tanks. Le produit mesure le DPS ; élargir
  demanderait d'autres critères de comparabilité, et ce n'est pas ce chantier.

## 8. Vérification

- Le classement d'un rapport connu produit l'ordre attendu, et **nomme son critère**.
- Un rapport dont `report.rankings` ne couvre pas tout le raid tombe sur le classement DPS
  et l'annonce, sans repli silencieux — la règle posée par
  [comparabilité légitime](2026-08-05-comparabilite-legitime-design.md).
- Ouvrir un joueur produit la même analyse que le chemin rapport actuel pour ce joueur.
- L'éligibilité intra-raid rend un écart de kill time nul entre deux acteurs d'une même pull.
- Les quatre portes passent.
