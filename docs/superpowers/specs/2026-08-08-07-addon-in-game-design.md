# Addon in-game — évaluer puis trancher

**Date** : 2026-08-08
**Nature** : évaluation à conclure par une décision écrite, pas un chantier lancé
**Périmètre** : décider si LogLense capte de la donnée dans le jeu
**Hors périmètre** : écrire une seule ligne de Lua avant que la décision soit prise

---

## 1. Pourquoi cette question existe

La section 6.3 de [ia-ml-architecture.md](../../../ia-ml-architecture.md) identifie trois
fossés que le document d'origine n'avait pas envisagés. Deux — l'habitude et la caution
communautaire — sont adressés par les points 1 et 4. Le troisième est d'une autre nature :

> **Un addon in-game capte ce que le combat log ne contient pas** : les décisions, les cibles
> disponibles au moment du choix, ce que le joueur voyait. Cette donnée n'appartient pas à
> RPGLogs, elle est à toi.

C'est **le seul chemin qui contourne entièrement les ToS de WCL**. Tout le reste du produit —
§2a, §5c, §5d, la mitigation par pointeurs, le mail d'approbation du point 9 — existe parce
que la donnée appartient à quelqu'un d'autre. Un addon supprime la question à la racine pour
la donnée qu'il capte.

Cela ne rend pas la décision évidente. Cela la rend digne d'être prise **explicitement**.

## 2. Ce qui doit être établi avant de trancher

Quatre points, dans cet ordre. Chacun peut à lui seul conclure « non ».

| # | Question | Ce qui conclut « non » |
|---|---|---|
| 1 | **L'API addon donne-t-elle réellement ce qui manque ?** Cibles disponibles, cooldowns prêts, position, ce qui était castable à l'instant du choix | Si l'API restreinte ne donne rien de plus que le combat log, tout le raisonnement tombe |
| 2 | **Quel coût d'entretien ?** Un addon casse à chaque patch majeur, sur 39 specs | C'est la même charge que la critique knowledge-driven de 6.5, transposée |
| 3 | **Quelle adoption ?** Un addon suppose une installation, donc une friction avant le premier usage | Le produit vit aujourd'hui d'un lien collé. L'addon inverse ce modèle |
| 4 | **Quelle politique Blizzard ?** Ce qu'un addon a le droit de transmettre hors du jeu | Une interdiction de téléversement rend le point sans objet |

**Le point 1 est celui à vérifier en premier**, parce qu'il est le moins cher à vérifier et
le plus décisif. La documentation de l'API addon suffit ; aucun prototype n'est nécessaire
pour savoir si la donnée existe.

## 3. Le pronostic honnête

**C'est probablement un « non ».** Le point 3 le tue quasiment à lui seul : le produit se
partage par un lien dans un Discord, et le point 1 du plan court terme mise entièrement sur
ce mode de diffusion. Exiger une installation avant le premier écran contredit frontalement
le canal d'acquisition qu'on est en train de construire.

Mais un « non » par omission et un « non » motivé ne valent pas la même chose. Le second se
révise quand une des quatre réponses change — par exemple si le produit atteint une base
installée qui rend la friction acceptable. Le premier se re-découvre dans six mois, à neuf.

## 4. Décisions déjà prises ici

| Sujet | Décision |
|---|---|
| Statut | **Évaluation**, pas chantier. Rien n'est planifié tant que la décision n'est pas écrite |
| Ordre | **Question 1 d'abord**, sur documentation, sans prototype |
| Sortie | **Une décision datée et motivée** dans [ia-ml-architecture.md](../../../ia-ml-architecture.md), section 6 |
| Si « oui » | Alors c'est un produit **distinct**, avec sa propre spec, pas une feature de plus |
| Si « non » | Alors le motif est écrit, et les conditions de révision avec lui |

**Pourquoi un « oui » ferait un produit distinct.** Un addon a son cycle de publication, sa
distribution CurseForge, sa maintenance par patch, son support. Le traiter comme une feature
de LogLense sous-estime tout cela d'un ordre de grandeur.

## 5. Ce qui est livré

Un paragraphe. La réponse aux quatre questions, la décision, sa date, et — si c'est « non » —
ce qui la ferait changer.

## 6. Quand

**Après la beta guilde**, jamais avant. Les questions 2 et 3 se répondent mal dans le vide :
savoir combien de personnes utilisent réellement le produit change ce que « friction
d'installation » veut dire. Évaluer maintenant, c'est deviner.
