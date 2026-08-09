# Pré-calcul v2 et vue roster — design

**Date** : 2026-08-08
**Périmètre** : l'infrastructure de calcul en amont de la requête, et la vue roster de guilde
qu'elle rend possible (tâche 11 de [PRODUCT_CONTEXT.md](../../../PRODUCT_CONTEXT.md))
**Hors périmètre** : le mode raid, qui rend une valeur voisine **sans** cette infra — voir
[la spec 01](2026-08-08-01-mode-raid-design.md)

---

## 1. Pourquoi ce chantier arrive tard, et doit arriver tard

C'est le chantier le plus lourd du document et le seul qui change la forme de
l'infrastructure : une base persistante autre que Redis, un ordonnanceur, une file, un coût
mensuel fixe.

Il ne doit pas être entrepris avant que **deux conditions** soient réunies :

1. **Le mode raid a livré et a été utilisé.** Il donne 80 % de la valeur roster pour 5 % du
   coût. S'il suffit, cette spec ne s'ouvre jamais — et c'est le meilleur résultat possible.
2. **Le nombre d'utilisateurs justifie un coût fixe.** Un pré-calcul pour trente personnes
   coûte plus cher qu'il ne fait gagner. La section 6.6 de
   [ia-ml-architecture.md](../../../ia-ml-architecture.md) place déjà le blocage sur le
   nombre d'utilisateurs ; ici, il est aussi le déclencheur.

Ouvrir ce chantier avant ces deux conditions, c'est bâtir l'infrastructure d'un produit qui
n'a pas encore prouvé qu'on y revient.

## 2. Ce que le pré-calcul rend possible, et rien d'autre

| Capacité | Sans pré-calcul | Avec |
|---|---|---|
| Classer un combat | **Oui** — mode raid, une requête | Idem, plus rapide |
| Classer un roster sur un tier entier | Non : n joueurs × m boss requêtes en ligne | Oui |
| Suivre l'évolution d'un roster semaine après semaine | Non : suppose une antériorité stockée | Oui |
| Vivier de références déjà résolu à l'ouverture | Non : résolution à la requête | Oui |

**La deuxième et la troisième lignes sont les seules justifications valables** de ce
chantier. Si le besoin exprimé se satisfait de la première ligne, la réponse est le mode
raid.

## 3. Décisions

| Sujet | Décision |
|---|---|
| Déclencheur | **Mode raid livré et utilisé**, et un nombre d'utilisateurs qui rend le coût fixe défendable |
| Persistance | **Une base relationnelle** en plus de Redis, pas à sa place. Redis garde les quotas et les caches à TTL |
| Contenu stocké | **Pointeurs et nos propres grandeurs.** Jamais de contenu WCL dérivé — §5d, inchangé |
| Ordonnancement | **Périodique, à la semaine de tier.** C'est la granularité utile, déjà retenue par [la capture du vivier](2026-08-08-02-capture-vivier-design.md) |
| Quota WCL | **Le pré-calcul consomme le même budget que les utilisateurs.** `wcl-guard.ts` doit l'arbitrer, pas l'ignorer |
| Chemin en ligne | **Inchangé.** Le pré-calcul accélère, il ne devient jamais le seul chemin |

**Pourquoi le chemin en ligne reste.** Un roster pré-calculé qui ne couvre pas un joueur — un
nouveau, un reroll, une spec changée hier — doit tomber sur l'analyse en ligne, pas afficher
un vide. Un pré-calcul est un cache, jamais une source de vérité.

**Pourquoi le quota WCL est une décision et pas un détail.** C'est le point où le produit
peut se saborder tout seul : un ordonnanceur qui brûle le budget WCL la nuit rend le produit
inutilisable le soir de raid. Le pré-calcul doit être la **priorité basse** face à une
requête utilisateur.

**Pourquoi le §5d ne se relâche pas ici.** La tentation est maximale : une base relationnelle
invite à stocker les charges WCL complètes. C'est exactement la « base permanente de contenu
dérivé » que la clause interdit. La mitigation par pointeurs vaut ici comme ailleurs.

## 4. Ce qui est livré

1. **Un schéma persistant** pour les rosters, les combats connus et les grandeurs calculées,
   en pointeurs.
2. **Un ordonnanceur hebdomadaire**, à priorité basse sur le budget WCL, arbitré par
   `wcl-guard.ts`.
3. **La vue roster** : un roster de guilde sur un tier, chaque joueur avec sa marge, son
   évolution semaine après semaine, ouverture sur l'analyse individuelle.
4. **Le repli en ligne** pour tout joueur absent du pré-calcul, annoncé et non silencieux.

## 5. Ce qui n'est pas livré

- Aucune migration de Redis. Les quotas, les caches à TTL et le corpus y restent.
- Aucun classement de guildes entre elles. Ce serait un autre produit et un autre problème de
  comparabilité.
- Aucune dépendance du classifieur du point 6 : les deux chantiers sont indépendants et ne
  doivent pas être menés ensemble.

## 6. Vérification

- Une requête utilisateur pendant un cycle de pré-calcul n'est jamais refusée à cause de lui.
- Un joueur absent du pré-calcul obtient son analyse en ligne, avec la mention du repli.
- La base ne contient aucune charge WCL brute — vérifiable en lisant le schéma seul.
- Le coût mensuel de l'infra est mesuré et écrit avant l'ouverture au public.
- Les quatre portes passent.
