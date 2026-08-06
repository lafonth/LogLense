# Capture d'étiquettes de comparabilité — design

**Date** : 2026-08-06
**Périmètre** : figer les décisions « pas comparable » de l'utilisateur dans un corpus durable
**Hors périmètre** : toute exploitation de ces étiquettes — filtrage, seuils, modèle

---

## 1. Pourquoi maintenant

`PRODUCT_CONTEXT.md` §5 pose la règle : **repousse le calcul, jamais la capture.** Le calcul
se rattrape en une semaine ; une donnée non capturée est perdue définitivement. Le même
document désigne l'actif du produit : ce n'est pas l'algorithme, public, mais **le jeu de
données étiqueté** — les décisions accumulées « comparable / pas comparable ».

Le chantier de comparabilité du 2026-08-06 a livré la pièce qui manquait : `BossResult`
porte désormais un bloc `comparability`, avec la distance de chaque référence et la
composition du vivier. Un bouton « pas comparable » a enfin quelque chose à quoi s'accrocher.

## 2. Le vrai blocage n'est pas le stockage

`PRODUCT_CONTEXT.md` §7 (D2) décrit la capture comme bloquée par l'absence de base de
données : « la seule persistance est Upstash Redis en `GET`/`SET` ». La lecture du code
corrige ce constat sur deux points.

**Redis n'est pas limité à `GET`/`SET`.** `exec()` dans `src/lib/redis.ts` prend un tableau
de commande arbitraire et Upstash REST les accepte toutes. `redisGet` et `redisSet` sont deux
façades sur un client déjà générique. Ajouter un `RPUSH` est un ajout de cinq lignes.

**Le motif d'écriture actuel, lui, est inadapté.** Les routes `favourites` et `recents` font
un read-modify-write d'un blob JSON. Pour des favoris, deux écritures concurrentes qui en
perdent une sont sans conséquence — l'utilisateur reclique. Pour un corpus qu'on ne peut pas
reconstituer, c'est une perte définitive et silencieuse. **La capture doit être append-only.**

**Le blocage réel est ailleurs : rien à l'écran ne peut nommer ce qu'on étiquette.**
`TopPlayer` ne porte que des stats, pas le rapport dont elles viennent ; `BossResult.character`
non plus. Les deux pipelines connaissent ces identifiants et les jettent. C'est le prérequis
de tout le reste.

## 3. Décisions

| Sujet | Décision |
|---|---|
| Nature de l'étiquette | **Rejet motivé, liste fermée de motifs** |
| Charge utile | **Pointeurs + nos propres calculs.** Aucune charge WCL brute recopiée |
| Stockage | **Liste Redis append-only**, découpée par mois |
| Portée du corpus | **Partagé**, pas par utilisateur |
| Exploitation | **Aucune.** On capture, on ne calcule pas |

**Pourquoi une liste fermée de motifs.** Du texte libre demanderait d'être réétiqueté à la
main avant de pouvoir entraîner quoi que ce soit — on aurait déplacé le problème, pas résolu.
Les motifs retenus sont exactement les critères que `PRODUCT_CONTEXT.md` §2 nomme :
`externals`, `set-bonus`, `kill-time`, `ilvl`, plus `other` comme soupape. `other` est
délibérément sans champ texte : sa seule fonction est de ne pas forcer un motif faux.

**Pourquoi pas de charge WCL brute.** Recopier le `CombatantInfo` complet des candidats
appliquerait la règle de capture au pied de la lettre, mais c'est de la redistribution de
données WCL — précisément le point que `PRODUCT_CONTEXT.md` laisse ouvert dans « points à
trancher ». Nos propres grandeurs calculées ne posent pas cette question. Les données de
combat restent re-téléchargeables tant que le rapport existe ; **ce qui ne l'est pas, c'est le
contexte de classement au moment de l'analyse** — la composition du vivier, les `bracketData`
du moment, les distances. Le tier avance, les classements bougent. C'est cela qu'on fige.

**Pourquoi append-only et non un état par utilisateur.** Une étiquette est un événement daté,
pas une préférence. Un utilisateur qui change d'avis produit un second enregistrement ; au
moment de l'entraînement, le plus récent l'emporte pour un triplet donné. L'écriture reste
atomique et sans lecture préalable.

## 4. Le schéma

```ts
export const LABEL_REASONS = ['externals', 'set-bonus', 'kill-time', 'ilvl', 'other'] as const;
export type LabelReason = (typeof LABEL_REASONS)[number];

export interface ComparabilityLabel {
  /** Version du schéma. Le corpus survivra à plusieurs versions du code. */
  v: 1;
  at: string;
  /** SHA-256 salé de l'identifiant de session. Jamais l'e-mail. */
  by: string;
  reason: LabelReason;

  encounterId: number;
  difficulty: number;
  specId: number;

  subject: { code: string; fightID: number; actorId: number; ilvl: number; killTimeMs: number };
  reference: {
    code: string;
    fightID: number;
    name: string;
    ilvl: number | null;
    killTimeMs: number;
    dps: number;
  };
  /** Ce que LogLense a calculé au moment de l'analyse. Écarts signés : référence − sujet. */
  scores: { distance: number; ilvlGap: number | null; killTimeGapPct: number; rank: number };
  pool: { candidatesConsidered: number; pagesFetched: number; level: ComparabilityLevel };
}
```

`v` n'est pas décoratif : sans lui, on ne saura plus dans un an ce que signifiaient les
enregistrements écrits aujourd'hui. Il se lit avant tout le reste.

**Les écarts sont signés**, comme dans le bandeau : `référence − sujet`. Un joueur mieux équipé
que sa référence n'est pas dans la même situation que l'inverse, et un corpus qui ne garde que
des valeurs absolues perd l'information.

`ilvlGap` est nullable parce que `reference.ilvl` l'est : une entrée de classement peut ne pas
porter de `bracketData`. `rank` est le rang de la référence, à partir de 1.

### L'identité

`by` est `sha256(salt + identifiant de session)`, tronqué à 32 caractères hexadécimaux. Le sel
vit dans `LABEL_SALT`, côté serveur uniquement.

**Si `LABEL_SALT` est absent, la route refuse d'écrire** et renvoie une erreur. Elle n'écrit
jamais une valeur non salée : un corpus qui contient à la fois des identifiants salés et non
salés est un corpus dont on ne peut plus garantir qu'il ne contient pas de données
personnelles, et on ne peut pas revenir en arrière une fois écrit. Échouer fermé.

## 5. Le stockage

```
RPUSH labels:comparability:<YYYY-MM>  <json>
```

Une clé par mois. Cela borne la longueur de chaque liste, rend l'export incrémental, et évite
d'avoir un jour à paginer une liste unique de plusieurs centaines de milliers d'entrées. Le
mois se déduit de `at`, donc de l'horloge serveur.

`src/lib/redis.ts` gagne une fonction, sur le `exec` générique existant :

```ts
export async function redisAppend(key: string, value: string): Promise<number>;
```

Elle renvoie la longueur de la liste après ajout, ce que `RPUSH` rend déjà — utile pour
vérifier qu'une écriture a bien eu lieu sans relire.

Aucune route de lecture n'est écrite. L'export se fera à la main, par `LRANGE`, le jour où il
y aura de quoi entraîner. Écrire un endpoint de lecture maintenant serait exposer un corpus
que rien ne consomme.

## 6. Le prérequis : faire circuler la provenance

Sans cela, l'écran ne peut pas décrire ce qu'il étiquette.

| Type | Ajout |
|---|---|
| `TopPlayer` | `source: { code: string; fightID: number; name: string }` et `distance: number` |
| `BossResult.character` | `source: { code: string; fightID: number; actorId: number }` |

`fetchReferencePlayers` a déjà `candidate.report` sous la main. Pour la distance,
`selectReferences` renvoie désormais ses références **déjà scorées** —
`ScoredCandidate<WorldRanking>[]` au lieu de `WorldRanking[]` — et `fetchReferencePlayers`
consomme cette forme. La distance n'est ainsi calculée qu'une fois et voyage avec sa
référence, au lieu d'être recalculée ou reconstituée par position.

Les deux pipelines fournissent `source` pour le sujet : `pipeline.ts` a `bestCode` et
`bestFightId`, `report-pipeline.ts` a `code` et `fightId`, et l'`actorId` est
`charEvent.sourceID` des deux côtés.

## 7. La route

`POST /api/labels/comparability`, `runtime = 'nodejs'`.

1. Session requise, comme les routes `user/*` existantes. Sinon 401.
2. Corps validé champ par champ contre le schéma. Un motif hors liste, un identifiant
   manquant, un type inattendu : 400. **La validation ne fait pas confiance au client** — le
   corps arrive du navigateur et finit dans un corpus permanent.
3. `LABEL_SALT` absent : 503.
4. Échec Redis : 503, jamais 200.

Les routes `user/*` existantes n'ont aucun `try/catch` autour de Redis : une panne Upstash
leur fait rendre un 500 générique. Cette route-ci ne reproduit pas ce défaut. Le corriger
ailleurs est un chantier séparé, hors périmètre ici.

**Aucune réponse ne prétend qu'une écriture a eu lieu si elle n'a pas eu lieu.** C'est la même
discipline que le bandeau de comparabilité : ne jamais afficher un succès qui n'en est pas un.

## 8. L'interface

Un composant `ReferenceLabels`, rendu dans l'onglet Comparaison **juste sous
`ComparabilityBanner`** : le bandeau énonce sur quelle base la comparaison est faite, le
contrôle permet de contester cette base. Les deux se lisent ensemble.

Il liste les références par nom, chacune avec un bouton « Not comparable ». Le clic déplie une
rangée de motifs — cinq boutons, pas de menu, pas de nouvelle primitive. Le choix d'un motif
envoie la requête.

Trois états par référence : au repos, envoi en cours, puis résolu — confirmé, ou en erreur
avec possibilité de réessayer. Un échec est visible : un clic perdu est une donnée perdue.

L'état vit dans le composant et ne survit pas à un rechargement : sans route de lecture, rien
ne peut le restituer. Une étiquette posée deux fois produit deux enregistrements, ce que le
modèle append-only assume — le plus récent l'emporte à l'entraînement.

Contraintes d'interface applicables : aucun `style={{}}`, tous les chiffres en `font-mono`,
aucune surcharge de taille d'une primitive via `className`. `text-danger` est disponible ici
pour l'état d'erreur d'envoi — c'est bien une erreur.

## 9. Fichiers

**Créés**

| Fichier | Rôle |
|---|---|
| `src/lib/labels/schema.ts` | Le type, la liste des motifs, la validation d'un corps entrant |
| `src/lib/labels/identity.ts` | Le hachage salé, et l'échec si le sel manque |
| `src/app/api/labels/comparability/route.ts` | La route |
| `src/components/results/ReferenceLabels.tsx` | Le contrôle |

**Modifiés** — `src/lib/redis.ts` (`redisAppend`), `src/types/index.ts` (`source` et
`distance`), `src/lib/wcl/references.ts` (références scorées, provenance),
`src/lib/wcl/pipeline.ts` et `report-pipeline.ts` (provenance du sujet),
`src/components/results/ComparisonTab.tsx` (rend le contrôle), `.env.example` (`LABEL_SALT`).

## 10. Vérification

Les quatre commandes du hook à chaque commit : `pnpm typecheck`, `pnpm test`, `pnpm lint`,
`pnpm format:check`.

**Tests unitaires**

- Validation : chacun des cinq motifs accepté ; un motif hors liste, un champ manquant, un
  type erroné, un `v` inconnu — tous rejetés. Un corps valide traverse inchangé.
- Identité : hachage stable pour une même entrée, différent pour deux entrées, et **erreur
  levée quand le sel est absent** — jamais de valeur de repli.
- `redisAppend` émet bien `['RPUSH', key, value]` et rend la longueur.
- Écarts signés : une référence mieux équipée donne un `ilvlGap` positif, moins bien équipée
  un négatif ; `ilvlGap` vaut `null` quand la référence n'a pas d'ilvl.
- Route : 401 sans session, 400 sur corps invalide, 503 sans sel, 503 sur échec Redis, 200 et
  écriture effective sur cas nominal. La clé écrite porte bien le mois courant.

**Test de composant** — `ReferenceLabels` : les références sont listées ; le clic déplie les
motifs ; le choix d'un motif déclenche un envoi portant le bon `reason` et la bonne référence ;
un échec réseau affiche une erreur et laisse réessayer ; un succès marque la référence comme
étiquetée.

**Vérification fonctionnelle** — poser une étiquette depuis le navigateur sur le cas de
référence (Jumbaa, Vorasius mythique, rapport `gjQ47FLB3Vf9XZDp`), puis **relire la liste
Redis** et confirmer que l'enregistrement est complet, que `by` est haché et que les écarts
sont signés dans le bon sens. Une étiquette qu'on n'a pas relue n'est pas une étiquette
capturée.

## 11. Ce que ce design ne fait pas

**Rien n'exploite les étiquettes.** Pas de filtrage du vivier, pas de seuil ajusté, pas de
modèle. C'est délibéré et c'est ce qui rend le chantier petit : la règle du produit est de
capturer maintenant et de calculer plus tard.

**Aucune route de lecture ni d'export.** `LRANGE` à la main suffira le jour venu.

**Les CGU de l'API WCL sur le stockage de données dérivées restent non tranchées.** Ce schéma
est l'option qui s'y expose le moins — nos propres calculs et des identifiants publics, aucune
charge WCL recopiée — mais il ne remplace pas la lecture des conditions.

**Les routes `user/*` gardent leur absence de `try/catch` autour de Redis.** Défaut réel,
préexistant, hors périmètre.
