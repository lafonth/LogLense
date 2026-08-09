# Trancher la contrainte n° 2 — note de décision

**Date** : 2026-08-08
**Nature** : décision de cadrage, pas d'implémentation
**Périmètre** : arrêter le statut de la contrainte « l'IA doit être le cœur du produit »
**Hors périmètre** : tout choix technique qui en découlerait

---

## 1. L'état actuel est intenable

[CLAUDE.md](../../../CLAUDE.md) pose deux contraintes non négociables. La seconde :

> **Critère anti-gadget** — l'IA doit être le cœur du produit. Test : retire l'IA, si le
> produit tient encore debout, c'était un gadget.

Elle est **enfreinte, sciemment, et depuis la décision datée du 2026-08-07** qui sort le ML
de la v1. [ia-ml-architecture.md](../../../ia-ml-architecture.md) §1 le constate en toutes
lettres — *« Retire l'IA de la v1 : elle tient encore debout »* — et
[PRODUCT_CONTEXT.md](../../../PRODUCT_CONTEXT.md) le répète.

Une contrainte déclarée non négociable et enfreinte à chaque section n'arbitre plus rien.
Elle produit du remords, pas des décisions.

## 2. Ce que le contre-argument a établi

La section 6.1 de [ia-ml-architecture.md](../../../ia-ml-architecture.md) montre que le test
est **mal formé** : il mesure la nécessité fonctionnelle, pas la valeur. Presque aucun
produit qui marche ne le passe.

La section 6.4 va plus loin et mérite d'être regardée en face : dans ce domaine précis, un
produit **déterministe et auditable** est un avantage. Le public vérifie les chiffres. Une
prose générée qui hallucine une interaction de sort coûte plus que ne rapporte une jolie
phrase. **Mettre l'IA au cœur n'est peut-être pas souhaitable ici** — question que le
document d'origine n'a jamais posée.

## 3. Les trois issues

| Issue | Contenu | Conséquence |
|---|---|---|
| **A — Reformuler** | *L'IA doit créer de la valeur marginale que le substitut le moins cher ne crée pas.* Test de substitution de 6.1 | La v1 redevient jugeable ; le rapport LLM doit prouver sa valeur, pas sa nécessité |
| **B — Retirer** | La contrainte disparaît, avec date et motif | Assume que le produit est un outil d'analyse déterministe dont le LLM est une commodité |
| **C — Maintenir** | On la garde telle quelle | Alors la v1 n'est pas livrable, et le ML redevient bloquant — position cohérente mais qui contredit la décision du 2026-08-07 |

**Recommandation : A.** Elle garde l'intention d'origine — refuser le vernis IA — sans exiger
une nécessité fonctionnelle que rien de bon ne satisfait. Et elle rend le rapport LLM
mesurable : les verdicts capturés au corpus disent déjà si le lecteur y trouve quelque chose
que le tableau ne lui donnait pas.

**C est défendable**, mais alors il faut le dire et remettre le ML dans le chemin critique,
pas laisser les deux positions cohabiter.

## 4. Ce qui doit être produit

Une seule chose, et elle tient en un paragraphe : **la contrainte n° 2 de
[CLAUDE.md](../../../CLAUDE.md) réécrite ou barrée, avec la date et le motif**, plus la mise
en cohérence des deux passages qui la citent comme enfreinte —
[ia-ml-architecture.md](../../../ia-ml-architecture.md) §1 et la section 8 de
[PRODUCT_CONTEXT.md](../../../PRODUCT_CONTEXT.md).

## 5. Quand

**Avant tout travail du moyen terme**, et si possible avant la beta. Chaque chantier des
points 6 à 9 se justifie ou s'écarte différemment selon l'issue retenue, et les arbitrer un
par un contre un critère auquel personne n'adhère plus est le meilleur moyen de les arbitrer
mal.

Coût : une décision, dix minutes de rédaction. C'est le meilleur rapport du document.
