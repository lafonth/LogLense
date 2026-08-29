# La question de prix — étape 6 du plan de saison

Écrite le **2026-08-29**. Artefact de l'étape 6 de [`PLAN_SAISON.md`](PLAN_SAISON.md). Elle
vit ici et non dans `docs/`, pour la même raison que [`POST_METHODE.md`](POST_METHODE.md) :
c'est du contenu, pas du code.

Elle ne se pose qu'**après** que l'étape 5 a posté et que des inconnus sont entrés. La poser
avant reviendrait à interroger la guilde une deuxième fois, ce que l'étape refuse
explicitement.

## À qui, et où — pas dans le salon

**En message privé, à ceux qui ont ouvert une analyse.** Pas dans le fil du post, et pas au
salon. Trois raisons, par ordre :

1. Poser une question d'argent dans un salon de classe quelques jours après une
   auto-promotion tolérée est le moyen le plus rapide de perdre le canal. Il ne se brûle
   qu'une fois, et l'étape 5 a déjà dépensé le crédit disponible.
2. Un montant donné en public est un montant donné devant témoins : il se conforme à ce que
   le voisin vient d'écrire. En privé il ne se conforme qu'au portefeuille.
3. Une réponse ne vaut que si elle vient de quelqu'un qui a **vu le résultat**. Un montant
   donné sur une description est une opinion sur une phrase.

**La liste à qui écrire** : ceux qui ont répondu au post ou demandé l'accès. `listMembers()`
rend les battletags admis, pas des identifiants Discord — il n'y a pas d'appariement
automatique, et il n'en faut pas à cette échelle. On écrit à la main aux gens qui se sont
manifestés.

**Cible réaliste : quatre à six, pas dix.** `POST_METHODE.md` l'a déjà acté en choisissant un
salon de classe plutôt qu'un subreddit. L'étape 7 tranchera sur cette taille-là ; la section
finale dit ce qu'elle a le droit d'en conclure.

## La question

Trois points, dans cet ordre. L'ordre porte l'essentiel du dispositif : **la question 1 ne
contient aucun repère de marché, la question 2 les contient tous.** C'est délibéré — voir plus
bas.

### 1 — La dépense réelle, avant tout repère

> Quick one, and there's no pitch attached — I'd rather measure this than guess at it.
>
> Roughly what do you pay per month right now for anything that helps you raid better?
> Warcraft Logs premium, Raider.io, a Patreon for an addon or a guide, a coach — total, all
> in. Zero is a real answer and I'd honestly rather have it than a polite one.

### 2 — Les deux bornes, en euros et par palier

> Second one. Say the thing you used isn't sold monthly but once per tier: comparability
> filtering on every log you pull, the progression history across the whole tier, and the
> coaching report. One purchase, it dies with the tier, there's nothing to cancel and no
> renewal to forget.
>
> For scale: Warcraft Logs itself is $2 basic / $5 premium a month, and WowCoach runs $5.99
> to $24.99 a month with a generous free tier.
>
> - At what price — euros, for the whole tier, not per month — would you buy it without
>   really thinking about it?
> - And at what price would you say no and just use the free single-log view instead?

### 3 — Ce qui n'a pas le droit d'être payant

> Last one, one line: is there anything you saw in it that you'd be annoyed to find behind a
> paid tier?

## Pourquoi cette forme

**Pourquoi deux bornes et non un montant.** Un montant unique ne se lit pas à cinq réponses :
la moyenne de cinq nombres est du bruit avec une décimale. Deux bornes donnent un
**intervalle par personne**. Cinq intervalles se recouvrent ou ne se recouvrent pas, et cette
lecture-là tient à n = 5 quand aucune statistique n'y tient.

**Pourquoi pas un Van Westendorp.** Ses quatre questions produisent deux intersections de
courbes ; il faut une trentaine de réponses pour que les courbes existent. À cinq, il rend un
graphique d'allure sérieuse construit sur rien — exactement la fausse précision que le post de
méthode reproche aux pages de classement. On garde ses deux questions qui portent
l'information (le « bon marché » et le « trop cher ») et on jette les deux qui demandent un
effectif.

**Pourquoi la question 1 sans repère et la question 2 avec.** L'étape demande de poser les
repères de marché dans la question ; c'est juste, un montant donné sans référentiel est
ininterprétable. Mais un repère est un ancrage : les réponses se colleront à `$5`. Les mettre
seulement en question 2 laisse la question 1 mesurer une dépense **déjà consentie**, qui n'est
pas une hypothèse et que rien n'a ancrée. L'écart entre les deux lectures n'est pas un défaut
du protocole : c'est la taille de l'effet d'ancrage, et l'étape 7 la verra au lieu de la
supposer.

**Pourquoi la question 3, qui ne rend pas de montant.** Elle ne teste pas le prix mais la
contrainte non négociable n° 1 — le rejet communautaire des paywalls durs, dont le précédent
Raider.io est documenté au §4.4 de `PRODUCT_CONTEXT.md`. Cette contrainte n'a jamais été
confrontée à quelqu'un d'extérieur à la guilde. À cinq réponses, elle vaut plus cher qu'un
cinquième montant : un montant de plus affine une décision, une ligne rouge la renverse.

**Ce que la question ne doit jamais faire** : avancer un chiffre de notre part, même en essai,
même sous la forme « ça tournerait autour de X, ça te paraît juste ? ». Le premier chiffre
énoncé devient l'ancre et la réponse ne mesure plus que lui. La règle permanente du plan
interdit un prix public ; ici c'est en plus une erreur de mesure.

## Le fournisseur d'IA : pourquoi il ne se demande pas

Le journal de l'étape 3 conclut que « l'étape 6 doit dire quel fournisseur le pass finance
avant que l'étape 7 puisse fixer un prix ». **L'ordre est inverse, et le chiffrer le montre.**

Le relevé de l'étape 3 donne, par rendu : `0,0036 €` sur `gemini-3.5-flash-lite`, `~0,015 €`
sur ChatGPT, `~0,031 €` sur Claude Sonnet 5 ; et `0,00135 €` par tour de chat sur Gemini, que
le même facteur `8,6` porte à `~0,0116 €` sur Claude. Reste à poser un volume par joueur et
par palier — inconnu, donc encadré :

| Par joueur et par palier               | Gemini   | Claude Sonnet 5 |
| -------------------------------------- | -------- | --------------- |
| Médian — 25 rapports, 40 tours de chat | `0,14 €` | `1,24 €`        |
| Queue — 100 rapports, 200 tours        | `0,63 €` | `5,42 €`        |

Deux lectures, et elles ne commandent pas la même chose :

- **Au médian, le fournisseur pèse `1,10 €` par joueur et par palier.** Contre un pass ancré
  entre `5` et `15 €`, il ne déplace aucun prix. Ce n'est pas un plancher de coût, c'est un
  arbitrage de qualité qu'on tranche **à l'intérieur** du prix, une fois le prix connu.
- **En queue, Claude coûte `5,42 €`** — là, oui, la marge est mangée. Mais la réponse à une
  queue est un plafond d'usage ou le BYOK, jamais un prix plus bas pour tout le monde.

Donc la question de prix ne comporte pas de volet fournisseur, et l'étape 7 n'attend rien de
l'étape 6 sur ce point. Elle attend un plafond d'usage, qu'elle pourra poser seule.

Réserve, la même qu'à l'étape 3 : ces coûts unitaires reposent sur **3 rapports et 2 tours de
chat**. Ce qui les sauve ici n'est pas leur précision mais leur insensibilité — il faudrait que
le volume réel dépasse la ligne « queue » d'un facteur trois pour que la conclusion change.

## Comment les réponses reviennent au journal

Une ligne par personne, brute, **avant** toute agrégation. L'étape 7 relit les lignes, pas un
résumé.

```
#  dépense actuelle /mois   sans réfléchir   trop cher   ligne rouge citée
1  0 €                      8 €              20 €        —
2  5 € (WCL premium)        15 €             30 €        « le filtre, non »
```

Puis, au journal de `PLAN_SAISON.md`, la **distribution** — les intervalles, pas leur moyenne.
L'étape le dit déjà ; c'est répété ici parce que c'est la seule consigne du protocole qu'on
enfreint sans s'en apercevoir.

## Ce que ces réponses peuvent trancher, et ce qu'elles ne peuvent pas

**Elles peuvent** : falsifier. Si les bornes basses tiennent sous `5 €` par palier, le pass
individuel ne finance rien et le §4.4 doit être réécrit — cette conclusion-là tient à quatre
réponses, parce qu'un plancher se réfute par l'exemple. De même pour la question 3 : une seule
ligne rouge nommée par deux personnes sur cinq suffit à sortir un contenu du pass.

**Elles ne peuvent pas** : fixer le prix. Cinq intervalles ne rendent ni une élasticité ni un
optimum, et l'étape 7 qui écrirait « `12 €` parce que c'est la médiane des cinq » ferait
exactement ce que ce document refuse depuis le début. Ce que l'étape 7 en tire est une
**fourchette et son sens** : au-dessus de quoi personne ne suit, en dessous de quoi on laisse
de l'argent. Le point dans la fourchette se choisit sur le coût et le positionnement, pas sur
le sondage.
