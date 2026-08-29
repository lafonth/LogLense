# Le post de méthode `55k → 25k` — étape 5 du plan de saison

Écrit le **2026-08-29**. Artefact de l'étape 5 de [`PLAN_SAISON.md`](PLAN_SAISON.md), acte 3.
Il vit ici et non dans `docs/`, qui décrit le code : ceci est du contenu d'acquisition, et il
resservira si un second canal s'ouvre à l'étape 6.

## Le canal, et pourquoi celui-là

**Dreamgrove (Discord Druide), salon Feral.** Un canal, un seul, conformément à l'étape.

Le choix du Discord n'était pas libre une fois le format retenu. Notre seul exemple public et
vérifiable est une analyse **Feral sur Chimaerus mythique** (`src/lib/demo/boss-result.ts`) :
les chiffres du post ne sont contrôlables que par quelqu'un qui sait ce que vaut un Feral sur
ce boss. Publier la même mesure dans un salon d'une autre classe la rendrait invérifiable,
donc invendable — un raider compétent n'accorde rien à un chiffre qu'il ne peut pas recouper.

Ce que ce choix coûte, et qui est assumé : l'argument du vivier n'est spécifique à aucune
classe, donc il se dépense dans la salle la plus étroite où il tienne debout ; rien n'en sera
indexé ni repartagé ; et l'étape 6 y trouvera plus vraisemblablement trois à cinq montants
hors guilde que dix. La distribution qui remontera au journal sera courte, et l'étape 7 doit
trancher en le sachant.

## Le post

Deux messages. Le premier tient sous la limite de 2 000 caractères de Discord et se suffit à
lui-même ; le second est l'invitation, et **ne se poste que si un modérateur l'a autorisée**.
S'il ne l'autorise pas, le premier message se poste quand même : c'est un constat de méthode,
il ne demande rien.

### Message 1 — la méthode

> Something I measured on my own logs that I haven't seen written down anywhere, and that I
> think costs people real time: the logs you get compared to on a ranking page are wearing
> better gear than you are, and it is worth more DPS than most people assume.
>
> One real Feral kill, Mythic Chimaerus. I computed the gap to the field twice.
>
> **Against the whole ranking pool** — 2 906 logs, median ilvl `289`, me at `281`:
> `−23 574` DPS.
> **Against only the logs that were actually comparable** — item level band, same tier piece
> count (a 2p and a 4p are not the same character), kill time within tolerance, no offensive
> externals received: `−16 507` DPS.
>
> So about 7k of that "gap" — 30% of it — was never mine to close this week. It was gear.
> On a second character, another spec, the same filter took `55k` down to `25k`, so 55%. Both
> pools sat roughly 8 item levels above the player. The mechanism is consistent; the magnitude
> is not, which is exactly why you can't eyeball it.
>
> Two of the four filters you already get for free, and should be using: Warcraft Logs has
> filtered Power Infusion out of Rankings since Feb 2023, and it offers "similar item level"
> percentile brackets — read the bracket, not the global percentile. The two it does not give
> you are **tier set parity** and **kill time**. Set bonuses are not in the rankings payload at
> all: you have to pull each candidate's `CombatantInfo` to find out whether the 99 whose build
> you are copying is 4p while you are 2p.
>
> The honest part, because it cuts against me: 2 906 candidates went in and **3** came out.
> Three logs is a thin distribution to take a median from. A tool that filters that hard and
> doesn't say so out loud is selling you the same false precision as the ranking page — so
> mine says it on the screen, above the number.
>
> Rendered example with the real numbers, no account needed: <URL>/demo

### Message 2 — l'invitation, sous réserve d'accord d'un modérateur

> For what it's worth I built the thing that does this (LogLense). It's in closed beta and
> I've opened it for two weeks, until <DATE_DE_FERMETURE>. Battle.net sign-in, nothing to pay,
> no card, and I'm mostly after whether the comparability filter agrees with what Ferals
> already know: <URL>

## Notes de publication

- **Écrire à un modérateur avant de poster.** Dreamgrove borne l'auto-promotion. Le message 1
  passe partout — c'est une mesure, pas une annonce ; le message 2 est ce qui demande l'accord.
  Le demander après coup est le moyen le plus rapide de brûler le canal, et il ne se brûle
  qu'une fois.
- **Remplacer `<URL>`** par l'origine déployée (`NEXTAUTH_URL_PROD`) et `<DATE_DE_FERMETURE>`
  par la date rendue par `/admin` à l'ouverture — ne pas la calculer à la main, c'est le
  serveur qui la fixe.
- **Ne rien mentionner d'un prix**, ni d'un futur prix, ni d'une gratuité « pour l'instant ».
  Règle permanente du plan de saison jusqu'à l'étape 7 : le premier chiffre annoncé devient
  l'ancre, et l'étape 6 n'a pas encore parlé.
- **Ouvrir la porte avant de poster**, pas après. Un arrivant qui tombe sur un refus ne revient
  pas, et la fenêtre se referme d'elle-même — il n'y a rien à gagner à la retarder.
- **Surveiller la première heure.** Le plafond commun WCL cède à environ 66 analyses à froid
  par heure (`WCL_GLOBAL_UNIT_LIMIT = 6000`, `BOSS_ANALYSIS_UNITS = 90` réservées par analyse).
  Un salon de classe n'en enverra pas autant ; si le seuil mord malgré tout, il mord pour tout
  le monde en même temps, et le message rendu est `Hourly Warcraft Logs quota reached`.

## Ce qui reste à faire, dans cet ordre

1. `/admin` → ouvrir la fenêtre pour **14 jours**, noter la date de fin qu'elle rend.
2. Écrire au modérateur de Dreamgrove pour le message 2.
3. Poster le message 1, puis le message 2 si l'accord est venu.
4. Reporter le lien et la date de fermeture au journal de `PLAN_SAISON.md`.
