# Beta fermée avec une guilde — design

**Date** : 2026-08-08
**Périmètre** : rendre l'application joignable par une guilde réelle, sur un domaine public,
sans ouvrir l'accès au monde
**Hors périmètre** : toute facturation, toute inscription libre, toute page marketing

---

## 1. Pourquoi maintenant

Il ne manque rien de fonctionnel. L'authentification Battle.net via NextAuth est en place
(`src/app/api/auth/[...nextauth]`), la persistance Upstash aussi, les identifiants WCL sont
déjà consommés par `src/lib/wcl/auth.ts`, et le rapport IA fonctionne en BYOK — donc à coût
LLM nul. Ce qui reste est de l'exploitation, pas du développement.

Deux raisons de ne pas attendre. D'abord le corpus : une beta de vingt-cinq raiders sur une
saison produit l'ordre de grandeur d'étiquettes que la section 6.6 de
[ia-ml-architecture.md](../../../ia-ml-architecture.md) identifie comme exploitable. Ensuite
le quota : `src/lib/api/wcl-guard.ts` n'a jamais vu d'utilisateurs concurrents. Un soir de
raid est le premier test réel, et il vaut mieux le passer sur un cercle qui pardonne.

## 2. Le point juridique, tranché

**§2a se déclenche sur le revenu, pas sur l'usage.** Une beta gratuite ne le déclenche pas.
La décision du 2026-08-07 — demander l'approbation en fin de projet, développer comme si elle
était acquise — reste valable, et cette beta ne l'entame pas.

**§5c** — pas d'exposition de contenu à des tiers sans opt-in — est le point à surveiller.
L'application montre le nom des joueurs de référence. Dans un cercle fermé de guilde,
l'exposition est du même ordre que celle de warcraftlogs.com lui-même, que ces joueurs ont
déjà acceptée. **Ce raisonnement ne survit pas à une ouverture publique** : il devra être
repris à ce moment-là, pas ignoré.

## 3. Décisions

| Sujet | Décision |
|---|---|
| Hébergement | **Vercel**, plan gratuit. Aucune infra à écrire, `next.config.ts` suffit |
| Fermeture de l'accès | **Liste blanche d'identifiants Battle.net**, vérifiée côté serveur |
| Emplacement de la liste | **Variable d'environnement**, pas Redis — elle change trois fois par saison |
| Rapport IA | **BYOK conservé.** Aucune clé serveur en beta : coût nul et pas de quota à défendre |
| Étiquettes | **Actives dès le premier jour.** C'est la raison d'être de la beta |

**Pourquoi une liste blanche et pas un simple login.** Le login Battle.net authentifie, il
ne restreint pas : n'importe qui possédant un compte Blizzard passe. Tant que le quota WCL
n'a pas été observé sous charge, l'accès doit être borné par une liste que l'on contrôle.

**Pourquoi pas Redis pour la liste.** Une liste de vingt-cinq entrées modifiée trois fois par
saison ne justifie ni une écriture, ni un cache, ni une interface d'administration. Une
variable d'environnement se relit à chaque démarrage et se corrige en trente secondes.

## 4. Ce qui est livré

1. **Garde de liste blanche** — un point unique, appliqué côté serveur, qui refuse une session
   dont l'identifiant Battle.net n'est pas dans `BETA_ALLOWLIST`. Le refus doit être explicite
   à l'écran (« accès en beta fermée »), jamais une page blanche ni une erreur d'authentification
   trompeuse.
2. **`BETA_ALLOWLIST` documentée dans `.env.example`**, avec la mention que la liste vide
   signifie **fermé à tous**, jamais ouvert à tous. Un défaut ouvert sur une variable oubliée
   est la faute classique de ce motif.
3. **Vérification des variables au démarrage** : `WCL_CLIENT_ID`, `WCL_CLIENT_SECRET`,
   `NEXTAUTH_SECRET`, `BLIZZARD_CLIENT_ID_PROD`, `BLIZZARD_CLIENT_SECRET_PROD`,
   `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `LABEL_SALT`. Une absence doit tomber
   au démarrage, pas au premier clic d'un raider.
4. **Un contrôle explicite que `ENABLE_DEV_SESSION` est absent en production.** Le
   `.env.example` l'interdit déjà en commentaire ; un commentaire n'est pas une garantie.

## 5. Ce qui n'est pas livré, et pourquoi

- **Aucune clé LLM serveur.** Elle transformerait la beta en centre de coût et masquerait la
  question que le point 9 devra trancher.
- **Aucune page d'accueil publique, aucun tarif.** La beta se rejoint par un lien.
- **Aucune télémétrie tierce.** Ce qu'il faut mesurer — analyses lancées, étiquettes produites,
  rapports notés — passe déjà par le corpus.

## 6. Vérification

- La garde refuse un identifiant absent de la liste, et l'accepte quand il y est.
- `BETA_ALLOWLIST` vide ferme l'accès à tout le monde.
- Le démarrage échoue quand `LABEL_SALT` manque, plutôt que d'écrire un corpus incertifiable.
- Les quatre portes du projet passent : `pnpm typecheck`, `pnpm test`, `pnpm lint`,
  `pnpm format:check`.

## 7. À observer pendant la beta

Trois mesures, aucune n'exige d'outillage nouveau :

| Mesure | Source | Ce qu'elle décide |
|---|---|---|
| Refus du garde WCL sous charge | `wcl-guard.ts` | Si le quota tient un soir de raid |
| Étiquettes par utilisateur et par semaine | Corpus | La date d'atteinte du seuil du point 6 |
| Verdicts sur le rapport IA | Corpus | Si le rapport LLM mérite d'être conservé |
