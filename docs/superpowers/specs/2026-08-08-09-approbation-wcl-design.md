# Demande d'approbation §2a auprès de RPGLogs — note d'exécution

**Date** : 2026-08-08
**Nature** : action externe, à déclencher sur condition
**Périmètre** : quand envoyer la demande d'approbation écrite, et ce qu'elle contient
**Hors périmètre** : la conformité §5c et §5d, déjà traitée par les schémas en pointeurs

---

## 1. La clause, et son déclencheur exact

Le §2a des ToS de RPGLogs exige une **approbation écrite pour tout usage commercial** de
l'API. La décision datée du dépôt le rappelle : la recherche a été faite, le résultat est
défavorable, et le mail a été **volontairement reporté à la fin du projet, en construisant
comme s'il était accordé**.

Cette spec ne revient pas sur cette décision. Elle en fixe la sortie.

Le point qui compte, et qui a déjà été établi :

> **§2a se déclenche sur le revenu, pas sur le montant, et pas sur l'apprentissage.**

Conséquences directes :

- Une **beta gratuite**, fermée ou ouverte, ne le déclenche pas.
- Entraîner un modèle sur de la donnée récupérée légitimement ne le déclenche pas.
- **Le premier euro le déclenche**, quel qu'en soit le montant et quel qu'en soit le prétexte
  — abonnement, don lié à une fonctionnalité, palier Patreon débloquant quoi que ce soit.

## 2. Le calendrier, et pourquoi il est celui-là

**Envoyer quand le premier euro devient probable, pas avant, et pas après.**

- **Pas avant.** Une demande d'approbation pour un produit sans utilisateurs se répond par
  un « non » ou par un silence, et un « non » écrit est plus difficile à faire réviser
  qu'une absence de demande. Un produit qui tourne, avec des utilisateurs réels et un usage
  d'API mesuré, est un dossier ; une idée n'en est pas un.
- **Pas après.** Encaisser d'abord et demander ensuite, c'est demander la régularisation
  d'une violation. C'est le scénario où l'accès API est coupé, ce qui met fin au produit,
  pas seulement au revenu.

Fenêtre concrète : **entre la beta ouverte et la mise en place du paiement**, avec assez de
marge pour qu'une réponse arrive. Le paiement ne s'ouvre pas sur une demande envoyée ; il
s'ouvre sur une réponse.

## 3. Ce que le dossier doit contenir

Un mail court, factuel, qui répond aux questions que RPGLogs se pose réellement.

| Élément | Contenu |
|---|---|
| Ce que fait le produit | Analyse de comparabilité pour un joueur, à partir de ses propres logs |
| Volume d'appels | Mesuré, pas estimé. `wcl-guard.ts` connaît déjà le chiffre |
| Ce qui est stocké | **Des pointeurs**, `code` / `fightID` / `actorId`, et nos propres jugements. Aucune charge dérivée persistée — la réponse au §5d, énoncée avant qu'on la demande |
| Exposition à des tiers | Aucune donnée de joueur tiers exposée sans opt-in — la réponse au §5c |
| Modèle de revenu | Ce qui est payant, ce qui reste gratuit, et l'ordre de grandeur |
| Ce qui est demandé | L'approbation écrite du §2a, formulée explicitement |

**Pourquoi énoncer §5c et §5d sans qu'on les demande.** Ce sont les deux clauses qu'un
produit de ce type enfreint par défaut. Montrer que la conception les a anticipées change la
nature de l'échange : ce n'est plus une demande à évaluer, c'est un dossier à valider.

## 4. Décisions

| Sujet | Décision |
|---|---|
| Déclencheur | **Le premier euro devient probable.** Ni plus tôt ni plus tard |
| Forme | **Écrit**, et la réponse conservée. Un accord oral ne vaut rien ici |
| Avant réponse | **Aucun encaissement.** Pas de pré-vente, pas de liste payante |
| Si refus | Le produit reste **gratuit** et le modèle de revenu est à repenser hors API WCL |
| Si silence | Un silence n'est **pas** un accord. Traiter comme un refus |

**Pourquoi « silence = refus ».** C'est la lecture inconfortable, et c'est la seule qui
protège. Un accès API coupé après encaissement termine le produit ; renoncer au revenu ne le
termine pas.

## 5. L'articulation avec la contrainte communautaire

La contrainte n° 1 de [CLAUDE.md](../../../CLAUDE.md) — la communauté WoW rejette les
paywalls durs — et le §2a pointent dans la même direction sans le savoir. Les deux rendent le
revenu difficile ; les deux se satisfont d'un produit dont **le cœur reste gratuit**.

Ce n'est pas une consolation, c'est une contrainte de conception à intégrer **avant** de
rédiger le mail : la section « modèle de revenu » du dossier doit décrire un découpage qui
tienne devant les deux, pas seulement devant RPGLogs.

## 6. Ce qui est livré

Un mail envoyé, sa date, et sa réponse — archivée dans le dépôt à côté de la décision qui
avait reporté l'envoi.

## 7. Ce qui n'est pas livré

Aucun changement de code. Ce chantier ne touche rien ; il autorise ou interdit un chantier
ultérieur.
