# Classifieur de comparabilité — design

> ## ⚠️ CADUQUE — 2026-08-13
>
> **Ce chantier ne sera pas mené.** La décision « 8c-8e sortent du plan » (section 8 de
> [PRODUCT_CONTEXT.md](../../../PRODUCT_CONTEXT.md)) l'a retiré du plan cinq jours après
> l'écriture de cette spec, et rien ici n'avait été commencé.
>
> **Motif** — le test de substitution de
> [ia-ml-architecture.md](../../../ia-ml-architecture.md) §6.1 échoue. Remplace le modèle
> par le substitut le moins cher : les seuils codés en dur de `comparability.ts`.
> L'utilisateur le remarque-t-il ? Non — il ne voit pas la sélection, il voit les
> références retenues. Part-il ? Non. Le gain serait réel sur la qualité du panel et
> invisible à l'écran, pour un coût qui inclut **une migration de persistance** : le seuil
> de mille étiquettes de la section 1 ci-dessous n'est pas atteignable en lecture sur un
> Redis append-only.
>
> **Ce qui rouvrirait le dossier** : un seul signal, que les utilisateurs **contestent les
> références qu'on leur montre**. Le flux `verdict` continue de le mesurer, et c'est pour
> ça que la capture, elle, n'a pas été arrêtée.
>
> **Ce qui reste vrai** — les sections 1 à 3 décrivent correctement le problème, les traits
> disponibles et la nature des trois classes du corpus. Elles se relisent comme un état de
> l'art interne, pas comme un travail à faire.

**Date** : 2026-08-08
**Statut** : **caduque le 2026-08-13** — jamais commencée
**Périmètre** : remplacer les seuils codés en dur de la comparabilité par un modèle appris
sur le corpus capturé (tâches 8c à 8e)
**Hors périmètre** : toute génération de texte, tout LLM. Ce chantier est du ML tabulaire

---

## 1. Le déclencheur, chiffré

Ce chantier **ne commence pas sur une date**, il commence sur un compteur. La section 6.6 de
[ia-ml-architecture.md](../../../ia-ml-architecture.md) pose l'ordre de grandeur :

| Étiquettes | Verdict |
|---|---|
| < 1 000 | Trop peu. Les seuils de `constants.ts` font mieux |
| ~ 1 000 | Utilisable pour un classifieur tabulaire à une quinzaine de traits |
| ~ 10 000 | Confortable, y compris avec validation croisée par spec |

**Seuil retenu : 1 000 étiquettes exploitables**, comptées après déduplication et après
retrait des exemples dont les pointeurs ne se réhydratent plus. Pas 1 000 lignes brutes dans
Redis.

Corollaire assumé : ce chantier dépend de
[la capture du vivier](2026-08-08-02-capture-vivier-design.md) et du
[mode raid](2026-08-08-01-mode-raid-design.md), qui produisent respectivement les
contre-exemples et les positives de haute confiance. **Le lancer avant, c'est entraîner sur
le filtre existant** — le défaut nommé en section 2 de la spec 02.

## 2. Ce que le modèle apprend, et ce qu'il ne remplace pas

Il apprend **une seule chose** : deux logs sont-ils comparables. Pas quoi conseiller, pas
quel sort manque, pas comment formuler. La variable à expliquer est le jugement de
comparabilité — implicite quand une référence a été montrée sans être rejetée, explicite
quand elle a été rejetée avec un motif, de haute confiance quand elle vient d'une même pull.

Les traits sont ceux que le produit calcule déjà : écart de kill time, écart d'ilvl, set
bonus 2p/4p, externals reçus de part et d'autre, difficulté, spec, semaine de tier. Une
quinzaine, tous déjà dans `src/lib/wcl/eligibility.ts` et `fight-context.ts`. **Aucun trait
nouveau n'est à capturer pour ce chantier** — c'est ce qui le rend faisable.

## 3. Décisions

| Sujet | Décision |
|---|---|
| Déclenchement | **1 000 étiquettes exploitables**, vérifiées, pas estimées |
| Famille de modèle | **Tabulaire supervisé** — arbres boostés. Aucun réseau, aucune séquence |
| Entraînement | **Hors ligne**, hors du chemin de requête, versionné avec son jeu |
| Inférence | **En ligne, dans `references.ts` seul** — corollaire de [CLAUDE.md](../../../CLAUDE.md) |
| Repli | **Les seuils actuels restent le chemin par défaut** tant que le modèle ne bat pas la ligne de base |
| Ligne de base | **`constants.ts` tel quel.** Un modèle qui ne la bat pas n'est pas déployé |
| Explicabilité | **Obligatoire** : l'écran doit pouvoir dire pourquoi un candidat a été écarté |

**Pourquoi une ligne de base explicite.** Sans elle, on déploie un modèle parce qu'il existe.
Les seuils codés en dur sont un adversaire honnête et gratuit ; s'ils gagnent, l'information
est utile et le chantier s'arrête là sans regret.

**Pourquoi l'explicabilité est une contrainte et pas un souhait.** Le public vérifie les
chiffres — c'est l'argument de la section 6.4. Un candidat écarté sans motif affichable
détruit la crédibilité que la comparabilité visible a construite. Un modèle par arbres donne
l'importance des traits ; un score nu ne suffit pas.

**Pourquoi l'inférence ne touche que `references.ts`.** Règle du corollaire de la carte du
code : toute évolution de la comparabilité s'y écrit, jamais dans les pipelines. Un modèle
appelé depuis `pipeline.ts` ou `report-pipeline.ts` serait une régression d'architecture,
même s'il donne de bons résultats.

## 4. Ce qui est livré

1. **Un compteur d'étiquettes exploitables**, lisible, qui dit où on en est du seuil. Sans
   lui, le déclenchement reste une impression.
2. **Un jeu d'entraînement reconstruit depuis les pointeurs** — réhydratation WCL au moment
   de l'entraînement, jamais un stockage de contenu dérivé (§5d).
3. **Un modèle entraîné hors ligne**, versionné avec le jeu qui l'a produit, et sa mesure
   contre la ligne de base.
4. **Un point d'inférence dans `references.ts`**, derrière un drapeau, avec repli sur les
   seuils.
5. **Le motif d'écart affiché**, pour chaque candidat, dans le même vocabulaire fermé que la
   capture.

## 5. Ce qui n'est pas livré

- Aucun modèle de langage, aucune génération. Le rapport IA reste ce qu'il est.
- Aucun ré-entraînement automatique. Un modèle qui se ré-entraîne seul sur ses propres
  décisions apprend ses propres biais ; c'est un chantier à part, s'il a jamais lieu.
- Aucun pré-calcul. Il appartient au point 8.

## 6. Vérification

- Le compteur d'étiquettes distingue lignes brutes et exemples exploitables.
- Le modèle est mesuré contre `constants.ts` sur un découpage qui **sépare par spec**, pas
  au hasard : un modèle qui a vu la même spec des deux côtés se note trop bien.
- Le drapeau désactivé rend exactement le comportement actuel, à l'octet.
- Chaque candidat écarté par le modèle porte un motif affichable.
- Les quatre portes passent.
