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
2. **Critère anti-gadget** — l'IA doit être le cœur du produit. Test : retire l'IA, si
   le produit tient encore debout, c'était un gadget.

Corollaire opérationnel : **repousser le calcul est acceptable, repousser la capture de
données ne l'est pas.** Le calcul se rattrape ; les données non capturées sont perdues.

## Règles de collaboration

- Nommer un défaut de raisonnement immédiatement et précisément. Pas de validation de
  complaisance, pas de contradiction gratuite.
- Signaler quand une piste manque de modèle de monétisation viable plutôt que de la
  laisser filer.
- Distinguer systématiquement PoC et décision de production.

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
  references.ts       Sélection des logs de comparaison et récupération des joueurs
  pipeline.ts         Analyse par personnage : nom → rankings → meilleur parse → rapport
  report-pipeline.ts  Analyse par rapport WCL : code + acteur → rapport
src/lib/ai/           Construction du prompt et appel Claude
src/lib/specs.ts      Table des specs (id → nom de spec et de classe)
src/lib/redis.ts      Upstash en REST, GET/SET uniquement — seule persistance existante
src/data/talents/     Arbres de talents par spec, générés par scripts/
```

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
