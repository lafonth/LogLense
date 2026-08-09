# LogLense

Outil d'analyse de logs World of Warcraft. Il récupère les combats d'un joueur sur
Warcraft Logs, les compare à des logs de référence, et produit un rapport de progression.

Cible : le raider confirmé qui plafonne — pas le débutant, qui gagne davantage avec un
guide statique. La comparabilité fine ne devient utile qu'une fois les gains faciles
épuisés.

## Contraintes non négociables

Elles précèdent toute décision de conception. Une proposition qui les enfreint est à
écarter, pas à aménager.

1. **Contrainte communautaire** — la communauté WoW rejette les paywalls durs sur les
   outils utilitaires (précédents Details!, WeakAuras). Un gap fonctionnel sans modèle
   de revenu acceptable n'est pas exploitable.
2. **Critère anti-gadget** — l'IA doit créer une valeur marginale qu'aucun substitut bon
   marché n'atteint. Test (reformulé le 2026-08-08, voir `ia-ml-architecture.md` §6.1) :
   remplace ton IA par le substitut le moins cher qui rende le même service — table de
   correspondance, seuils codés en dur, guide statique. L'utilisateur le remarque-t-il ?
   Part-il ?

Corollaire opérationnel : **repousser le calcul est acceptable, repousser la capture de
données ne l'est pas.** Le calcul se rattrape ; les données non capturées sont perdues.

## Règles de collaboration

- Nommer un défaut de raisonnement immédiatement et précisément. Pas de validation de
  complaisance, pas de contradiction gratuite.
- Signaler quand une piste manque de modèle de monétisation viable plutôt que de la
  laisser filer.
- Distinguer systématiquement PoC et décision de production.

## Coût et contexte

Ces règles s'appliquent en permanence, y compris après un `/clear`. Elles viennent d'un
relevé de consommation réel : la dépense vient des sous-agents lancés, du volume brut
laissé en contexte, et de la durée d'une session avant compaction.

- **Filtrer la sortie de chaque commande.** `pnpm test` passe par
  `| grep -E "Tests |FAIL"`, un build par `| tail`. Un dump complet de vitest fait des
  centaines de lignes qui restent en contexte et sont relues à chaque tour suivant.
- **Choisir l'agent, pas le modèle.** Les définitions de `.claude/agents/` épinglent le
  modèle : `implementer` et `task-reviewer` sur Sonnet, `branch-reviewer` sur Opus.
  Ne pas passer par `general-purpose`, dont le défaut est `inherit` — donc Opus.
- **Une seule dispatch de revue, pas une chaîne.** Revue puis correctif puis re-revue,
  c'est trois démarrages à froid. Corriger soi-même les points mineurs et les vérifier ;
  ne déléguer que ce qui a réellement besoin d'un regard neuf.
- **Regrouper les tâches minuscules.** Deux modules de fonctions pures de dix lignes sont
  une tâche, pas deux : chaque lancement reconstruit son contexte depuis zéro.
- **Exécuter en ligne quand le plan contient le code littéral.** La délégation se justifie
  sur du jugement, pas sur de la transcription.
- **Proposer explicitement les points de coupure.** Je ne peux ni compacter ni vider le
  contexte moi-même — mais je dois dire quand le faire. `/clear` au changement de sujet,
  c'est le cas courant et le moins cher : le hook `SessionStart` réinjecte l'état du
  dépôt, donc repartir de zéro ne coûte rien. `/compact` seulement si la suite a besoin
  des conclusions intermédiaires. Toujours proposer un prochain prompt post clear/compact. Make sure that compact is not better than clear in order to have the best ratio between token saving and quality of the output thanks to context. The idea is not to disrupt the flow of implementation neither, propose when it's really necessary. 

## Vocabulaire du domaine

| Terme | Sens |
|---|---|
| **parse** | Un combat classé sur Warcraft Logs, avec son percentile par rapport aux autres joueurs de la même spec sur le même boss |
| **bracket** | Percentile restreint à une tranche d'ilvl, plus juste qu'un percentile global |
| **ilvl** | Item level moyen de l'équipement. Corrélé au DPS, donc un axe de comparabilité |
| **set bonus** | Bonus d'ensemble à 2 ou 4 pièces. Un 2p et un 4p ne sont pas comparables. Invisible dans les rankings WCL — demande le `CombatantInfo` de chaque candidat |
| **external** | Buff offensif reçu d'un autre joueur, Power Infusion en tête. Fausse la comparaison : critère éliminatoire |
| **opening chain** | Séquence ordonnée des premiers sorts d'un combat. Non disponible aujourd'hui : les casts sont requêtés en agrégat, l'ordre est perdu à la source |
| **comparabilité** | Le cœur du produit : deux logs sont comparables si l'écart de DPS s'explique par le jeu et non par le contexte (kill time, ilvl, set bonus, externals) |
| **spec / encounter / difficulty** | Spécialisation (id numérique WCL), boss, et palier de difficulté (3 = Normal, 4 = Heroic, 5 = Mythic) |

## Carte du code

```
src/lib/wcl/
  auth.ts             OAuth client-credentials Warcraft Logs
  client.ts           gql() — un POST sur l'API v2, gestion des erreurs GraphQL
  queries.ts          Toutes les requêtes GraphQL, en constantes
  constants.ts        KILL_TIME_TOLERANCE, TOP_N — les seuils de comparabilité
  parsers.ts          Réponses WCL → types du domaine (stats, casts, uptimes)
  combatant.ts        Type CombatantEvent + recherche par acteur, par nom, par spec
  fight-data.ts       Dégâts + rotation d'un combat → stats, rotation, cibles, dps
  eligibility.ts      Set bonus et externals d'un combattant : les critères éliminatoires
  fight-context.ts    Ce qui est arrivé au raid pendant la pull (morts, wipes, durée)
  pool-cache.ts       Cache à TTL du pool de candidats — jamais un pool incomplet
  references.ts       Sélection des logs de comparaison et récupération des joueurs
  pipeline.ts         Analyse par personnage : nom → rankings → meilleur parse → rapport
  report-pipeline.ts  Analyse par rapport WCL : code + acteur → rapport
src/lib/comparison/
  talent-diff.ts      Écarts de build : toi seul / eux seuls / communs, avec le compte k sur n
  rotation-stats.ts   Par sort : fourchette des références, médiane, écart, tri par écart
src/lib/ai/           Construction du prompt et appel Claude
src/lib/api/
  parse.ts            Validation des corps de requête — un `as` sur `req.json()` ne vérifie rien
  wcl-guard.ts        Ce qu'un compte a le droit de dépenser chez WCL avant d'être refusé
src/lib/labels/
  corpus.ts           Écriture bornée par mois, jamais purgée : le corpus est l'actif
  record-exposure.ts  Capture de ce qui a été rendu, avec la provenance du DPS
  record-advice.ts    Capture des rapports IA rendus
  rate-limit.ts       Quotas : `consumeQuota` échoue ouvert, `consumeStrictQuota` fermé
  schema.ts           Validation des soumissions entrant au corpus (plafonds de corpus)
src/lib/specs.ts      Table des specs (id → nom de spec et de classe)
src/lib/redis.ts      Upstash en REST — seule persistance existante. GET, SET, SETEX,
                      INCRBY, EXPIRE, LLEN, RPUSH. Un refus jette, il ne rend pas `undefined`
src/data/talents/     Arbres de talents par spec, générés par scripts/
src/components/ui/    Les primitives : Button, Card, Input, Select, Tabs, ScrollArea,
                      Sheet, Badge, ErrorBanner, LoadingSpinner, ProgressSteps
```

Les deux modules de `comparison/` sont des fonctions pures, testables sans rendu. Ils sont
séparés des composants parce que le sous-projet 3 les réutilisera quand les références
passeront de trois exemplaires à une distribution.

## Interface : tokens et primitives

**Aucun `style={{}}` dans les composants.** Trois exceptions, toutes des géométries calculées
à l'exécution : la largeur des barres dans `DamageBreakdown` et `TalentDiff`, la position de
la bande et du marqueur dans `RotationCards`. `TrajectoryChart` montre l'alternative quand
elle existe : la géométrie passe par des attributs SVG, pas par un style en ligne.

Les couleurs, tailles, rayons et points de rupture sont déclarés une fois dans
`src/app/globals.css`, dans un bloc `@theme` Tailwind v4, et consommés uniquement par des
classes utilitaires. Aucune valeur littérale de couleur, d'espacement, de taille de police
ou de rayon ne doit apparaître dans un composant.

Trois règles qui ont chacune coûté une ronde de correction :

- **Le rouge (`text-danger`) est réservé aux erreurs.** Un écart par rapport aux références
  s'affiche en bleu (`text-deviation`) : une position dans une distribution n'est pas une
  faute. Le rouge doit rester disponible pour signaler une comparaison illégitime.
- **Tous les chiffres sont en `font-mono`**, y compris à l'intérieur d'une phrase — on
  enveloppe alors le nombre, pas la phrase. Seul le corps du rapport IA fait exception :
  c'est de la prose, il est en `font-sans`.
- **On ne surcharge jamais la taille d'une primitive via son `className`.** Tailwind
  départage deux utilitaires agissant sur la même propriété par leur ordre dans la feuille
  générée, pas par leur position dans la chaîne : la surcharge est silencieusement ignorée.
  Si aucune taille existante ne convient, on étend la primitive.

`Sheet` est le traitement mobile des colonnes latérales : il rend ses enfants directement à
partir de `md`, et derrière un déclencheur plus un panneau glissant en dessous. L'envelopper
suffit — pas de media query à écrire.

Les deux pipelines ne diffèrent que sur deux points : **comment le sujet analysé est
trouvé** (nom de personnage → rankings → meilleur parse, contre `code` + `actorId` déjà
fournis) et **d'où viennent les percentiles** (`encounterRankings` contre
`report.rankings`). Tout le reste passe par `combatant`, `fight-data` et `references`.

**Corollaire** : une évolution de la comparabilité — rendre le fallback visible, filtrer
sur l'ilvl ou le set bonus, paralléliser, passer à une distribution — s'écrit dans
`references.ts` uniquement, jamais dans les pipelines.

## Vérification

Les quatre doivent passer avant tout commit. Le hook pre-commit les exécute.

```
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

## Contexte produit

`PRODUCT_CONTEXT.md` contient le cadrage complet : friction centrale, critères de
comparabilité, modèle de monétisation, architecture v1/v2, état vérifié du code et ordre
des travaux.

`ia-ml-architecture.md` complète le cadrage côté technique : distinction IA gadget /
structurante, familles de modèles, et les architectures v0 / v1 / v2 en diagrammes.

Les lire avant toute décision qui engage la direction du produit — nouvelle feature,
découpage gratuit/payant, choix d'architecture. Inutiles pour une correction localisée.
