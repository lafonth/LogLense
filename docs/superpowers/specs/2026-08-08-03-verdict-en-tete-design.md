# Le verdict en tête d'écran — design

**Date** : 2026-08-08
**Périmètre** : remonter au-dessus des onglets la conclusion que l'analyse produit déjà
**Hors périmètre** : tout nouveau calcul, toute nouvelle requête WCL

---

## 1. Pourquoi ce chantier existe

Rien n'est à calculer. Le percentile figé, la décomposition matériel / kill time / reste de
`src/lib/wcl/trajectory.ts`, le niveau de comparabilité et les écarts signés de
`ComparabilityBanner` : tout est déjà produit et déjà rendu. Le défaut est de **placement**.

L'écran ouvre sur une grille d'onglets. Le lecteur doit choisir un onglet avant de savoir
s'il y a quelque chose à apprendre. Sur un outil qu'on découvre par un lien collé dans un
Discord — le mode d'arrivée que le point 1 rend probable — c'est là que l'attention se perd.

La section 7 de [PRODUCT_CONTEXT.md](../../../PRODUCT_CONTEXT.md) contient déjà l'exemple
qui le prouve : ilvl 292 contre 284, écart ramené de 55 k à 25 k, *plus de la moitié de ce
qui était présenté au joueur comme son retard venait de l'équipement des références*. C'est
la meilleure phrase du produit, et elle est enterrée.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Contenu | **Une phrase et un chiffre.** Pas un tableau de plus |
| Source | **Grandeurs déjà calculées.** Zéro requête supplémentaire |
| Emplacement | **Au-dessus des onglets**, visible sans défilement |
| Comparabilité | **Énoncée dans le verdict**, pas reléguée sous un onglet |
| Ton | **Position, pas faute.** `text-deviation`, jamais `text-danger` |

**Pourquoi une seule phrase.** Un résumé qui liste cinq chiffres n'est pas un résumé, c'est
le sixième écran à lire. Le verdict doit répondre à une question : *sur quoi ai-je de la
marge, et combien*.

**Pourquoi la comparabilité est dans le verdict.** Un écart chiffré sans son niveau de
confiance est une affirmation qu'on ne peut pas contester. Le public cible vérifie ; c'est
même ce qui rend le produit crédible face à de la prose générée — argument développé en
section 6.4 de [ia-ml-architecture.md](../../../ia-ml-architecture.md). Le verdict porte
donc sa propre réserve.

**Le rouge reste interdit ici.** Règle établie de [CLAUDE.md](../../../CLAUDE.md) : le rouge
signale une comparaison illégitime, jamais un écart. Un verdict rouge à chaque analyse
détruirait le seul signal d'alarme du produit.

## 3. Ce qui est livré

1. **Un composant de verdict**, dans les primitives ou à côté d'elles, qui prend les
   grandeurs existantes et rend une phrase avec ses nombres en `font-mono` — le nombre
   enveloppé, pas la phrase.
2. **Son placement** au-dessus de `BossContentPanel`, sur les deux chemins — analyse par
   personnage et analyse par rapport — puisque les deux produisent le même `BossResult`.
3. **La formulation du repli** : quand la comparabilité est faible ou nulle, le verdict le
   dit au lieu d'annoncer un écart trompeur. Un repli est admis, jamais silencieux.

## 4. Ce qui n'est pas livré

- Aucun nouveau calcul, aucune requête. Si une phrase demande une grandeur absente, elle
  n'est pas dans ce chantier.
- Aucun rapport IA en tête d'écran : il coûte un appel fournisseur, il ne peut pas être ce
  qui s'affiche par défaut.

## 5. Vérification

- Le verdict rend la même conclusion que les onglets, sur des fixtures où les deux sont
  lisibles.
- Comparabilité faible : le verdict le dit, et n'annonce aucun écart chiffré comme certain.
- Aucune classe `text-danger` sur un écart.
- Aucun `style={{}}` introduit, aucune valeur littérale de couleur ou de taille.
- Les quatre portes passent.
