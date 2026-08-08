# Vérifications en attente

Ce que le code suppose sans avoir pu le confirmer ici. Rien de ce qui suit ne bloque
l'exécution : chaque point est couvert par un comportement défensif, et l'entrée dit
laquelle des deux hypothèses le retrait de la garde validerait.

Une vérification faite se supprime d'ici, avec le commit qui la fait.

## `table(dataType: Deaths)` — forme de la réponse

**Où** : `src/lib/wcl/fight-context.ts`, `deathEntries()`.

`table` est un scalaire JSON : ni le schéma GraphQL ni le typage TypeScript ne disent ce
qu'il contient. Le parseur accepte les trois enveloppes plausibles — tableau nu,
`{ data: [...] }`, `{ data: { entries: [...] } }` — parce qu'en choisir une et se tromper
ferait disparaître toutes les morts sans erreur, et qu'une capture silencieusement vide
est le seul défaut que le corpus ne rattrape jamais.

**À vérifier** : une requête réelle sur un rapport connu. Si une seule forme est rendue,
les deux autres branches peuvent tomber.

**Bloqué par** : pas de credentials WCL ni de réseau dans les tests.

## `deathTime` — absolu ou relatif au combat ?

**Où** : même fichier, `relativeDeathMs()`.

Le champ est traité comme absolu quand il dépasse le `startTime` du combat, et laissé tel
quel sinon. Soustraire un `startTime` d'une valeur déjà relative donnerait un négatif
qu'on ne saurait plus distinguer d'une absence de donnée.

**À vérifier** : la même requête réelle suffit à trancher — comparer `deathTime` au
`startTime` du combat sur un log dont on connaît la durée.

**Bloqué par** : identique.

## `wipesBefore` — portée d'un seul rapport

**Où** : même fichier, `parseFightContext()`.

Le compte porte sur les pulls du rapport analysé. Une progression étalée sur plusieurs
soirs sous-compte donc, et c'est assumé : élargir demanderait de résoudre les rapports
voisins de la guilde, soit une requête par soir, pour un signal que le modèle peut
recalculer plus tard à partir du pointeur déjà capturé.

**Ce n'est pas une vérification mais une limite connue** — notée ici pour qu'elle ne soit
pas relue comme un bug.
