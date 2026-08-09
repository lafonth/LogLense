# Capture du vivier de références, datée — design

**Date** : 2026-08-08
**Périmètre** : écrire au corpus le vivier de candidats que chaque analyse récupère déjà,
horodaté à la semaine de tier
**Hors périmètre** : toute exploitation — filtrage, seuils, entraînement

---

## 1. Pourquoi maintenant, et pourquoi ce n'est pas optionnel

Chaque analyse récupère une douzaine de candidats vérifiés avec leur `CombatantInfo` complet,
s'en sert pour choisir trois références, et **jette le reste**. `src/lib/wcl/references.ts`
fait ce travail à chaque requête ; `pool-cache.ts` le garde le temps d'un TTL, puis l'oublie.

La justification a changé le 2026-08-08, et il faut le dire précisément. Ce n'est **plus** la
défendabilité : la section 6.2 de [ia-ml-architecture.md](../../../ia-ml-architecture.md)
établit qu'à l'échelle visée personne ne cherche à répliquer quoi que ce soit. C'est la
**péremption**.

> Un concurrent — ou toi-même dans six mois — rebâtit la trajectoire de DPS d'un joueur à
> partir de WCL. Personne ne rebâtit **quel vivier existait en semaine 2 d'un tier**. Cette
> part périme avec la saison.

C'est une capture, pas un calcul. Elle relève donc de la règle non négociable de
[CLAUDE.md](../../../CLAUDE.md) : *repousse le calcul, jamais la capture*. La section 6.6
ajoute l'argument opérationnel : le classifieur du point 6 devient atteignable vers un
millier d'exemples, et ce chantier est ce qui alimente le compteur le plus vite.

## 2. Ce qui manque au corpus aujourd'hui

La capture existante enregistre les **références montrées** et les rejets motivés. Elle
n'enregistre pas ce qui a été **écarté avant l'affichage** : les candidats disqualifiés par
set bonus, par externals, par écart de kill time, par ilvl.

C'est précisément la partie la plus informative pour un classifieur. Un corpus qui ne
contient que ce qui a passé le filtre apprend le filtre, pas la comparabilité. **Sans les
écartés, la variable à expliquer n'a pas de contre-exemples.**

## 3. Décisions

| Sujet | Décision |
|---|---|
| Clé | **`(spec, encounter, difficulty, semaine)`** — la semaine est ce qui périme |
| Contenu | **Pointeurs + nos propres grandeurs calculées.** Aucune charge WCL brute recopiée |
| Écartés | **Capturés, avec le motif d'écart**, à égalité avec les retenus |
| Écriture | **Côté serveur**, à la construction du rapport, append-only |
| Déduplication | **Aucune à l'écriture.** Deux analyses du même vivier écrivent deux lignes |
| Schéma | **Versionné**, comme les étiquettes existantes |

**Pourquoi des pointeurs et pas la charge WCL.** C'est la mitigation identifiée du §5d :
`code`, `fightID`, `actorId`, nos jugements, et les mesures WCL réhydratées au moment de
l'entraînement. Recopier le `CombatantInfo` complet constituerait la base permanente de
contenu dérivé que la clause interdit. La contrainte est la même que pour
[la capture d'étiquettes](2026-08-06-capture-etiquettes-design.md) et la réponse ne change
pas.

**Pourquoi pas de déduplication.** Elle demanderait une lecture avant écriture — donc un
read-modify-write, donc la perte silencieuse que le corpus ne peut pas se permettre. La
redondance se nettoie à l'entraînement, où elle est bon marché ; une ligne perdue ne se
retrouve jamais.

**Pourquoi la semaine et pas la date exacte.** La granularité utile est le palier de
progression d'un tier. Une date à la seconde ne dit rien de plus et alourdit la clé.

**Pourquoi aucun champ de texte libre.** Règle du corpus, déjà établie : de la donnée
personnelle dans un stockage append-only impossible à nettoyer, plus le §5c. Les motifs
d'écart sont une liste fermée.

## 4. Le plafond, à poser avant la première écriture

Une écriture par analyse et par candidat, c'est un ordre de grandeur au-dessus des
étiquettes actuelles. `src/lib/labels/corpus.ts` borne déjà l'écriture par mois ; ce chantier
doit **poser son propre plafond**, distinct de celui des étiquettes, pour qu'une boucle
d'analyses ne remplisse pas Redis en une soirée.

Le plafond doit **échouer ouvert** — refuser d'écrire sans casser l'analyse. Une capture
manquée est un regret ; une analyse cassée par la capture est une régression.

## 5. Ce qui est livré

1. **Schéma de vivier** dans `src/lib/labels/`, versionné, valeurs bornées, aucun texte libre.
2. **Écriture côté serveur** depuis `references.ts` — jamais depuis les pipelines, par le
   corollaire de [CLAUDE.md](../../../CLAUDE.md) : toute évolution de la comparabilité
   s'écrit dans `references.ts` seul.
3. **Motif d'écart sur chaque candidat écarté**, dans le même vocabulaire fermé que les
   rejets utilisateur : `externals`, `set-bonus`, `kill-time`, `ilvl`, `other`.
4. **Plafond mensuel propre**, en échec ouvert.

## 6. Ce qui n'est pas livré

Aucune lecture, aucune statistique, aucun écran. Le corpus se remplit ; on ne le regarde pas
encore. C'est la même discipline que la capture d'étiquettes, et elle a tenu.

## 7. Vérification

- Une analyse écrit autant de lignes que le vivier compte de candidats, retenus et écartés.
- Chaque écarté porte un motif de la liste fermée.
- Aucun champ ne contient de texte libre ni de nom hors des pointeurs prévus.
- Le plafond atteint refuse l'écriture **et laisse l'analyse aboutir**.
- Les quatre portes passent.
