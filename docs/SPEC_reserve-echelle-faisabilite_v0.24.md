# Réserve stratégique et valeur des bonus d'entraînement — spécification v0.24

Remplace `ADDENDUM_2026-08` et `PLAN_IMPLEMENTATION_v0.23`. Complète
`ALGORITHMIC_MODEL.md`. Référence code : v0.23 (P2 actif), RuleSet
`global-grand-live-2026-08-r3`.

Ce document contient trois choses distinctes, dans cet ordre : la
spécification formelle de la réserve (§1–§3), les données de calibration
vérifiées en jeu qui la motivent (§4–§6), et le découpage d'implémentation
(§7). Les questions non tranchées sont regroupées en §8 et ne doivent pas
être traitées comme des défauts.

---

## 1. Le problème que ça remplace

Historique court, pour que la prochaine révision ne refasse pas le chemin :

- **v0.22.17 et avant** — planchers de réserve indépendants par couleur,
  fabriqués depuis des cibles de tiers différents. Une Friendship +5 %
  pouvait créer une contrainte dure sur une couleur qui pré-emptait la
  protection d'une Friendship +10 %.
- **v0.22.18** — frontière vectorielle : seul le meilleur tier fournit la
  réserve dure, les autres passent en pression souple. Corrige la
  contamination inter-tier. **Ce point est clos, ne pas y revenir.**
- **v0.23** — agrégation par `Math.min` au sein de la frontière, plus la
  valorisation P2 des bonus d'entraînement.

Ce qui reste cassé en v0.23, et que ce document corrige :

1. `Math.min` sur la frontière est l'agrégation de **substituts**. La spec
   dit compléments (« posséder les deux F+10 a de la valeur »). Sur
   `daisuki [42 Da, 26 Vi]` / `fanfare [26 Da, 42 Vi]`, `min` donne
   `reserve.visual = 26` alors que Fanfare en coûte 42.
2. La frontière ne contient que le meilleur tier. Quand une F+10 devient
   inatteignable, rien ne prend le relais : les F+5 restantes n'exercent
   qu'une pression souple, alors qu'elles valent encore ~75 unités. On veut
   maximiser le gain, pas jouer en tout-ou-rien.
3. Aucune notion de faisabilité. La réserve peut viser un objectif
   arithmétiquement impossible et continuer à contraindre les dépenses
   autour de lui.

### 1.1 Ce que fait v0.23 en sur-réserve — description exacte

Important pour ne pas se tromper de diagnostic : `techniqueSpendMetrics`
filtre sur `spentKeys`, les couleurs effectivement dépensées. Une réserve
déjà franchie ne rend donc pas toutes les options équivalentes.

Le comportement réel est un **gel de la couleur franchie** : toute dépense
dessus produit `afterMargin < 0`, donc une brèche, donc une défaite sur
`reserveBreachCount` face à toute option qui l'évite.

Deux régimes en découlent :

- **Au moins une option évite la couleur franchie** → gel effectif de
  cette couleur. Observé à `fbde` s110 (`126/76/59/54/50`, réserve Visual
  68 > stock 54, Dance 126 ≥ 68). Le résultat se trouve être bon, mais la
  force du gel dérive d'un objectif impossible, pas d'une évaluation.
- **Toutes les options touchent la couleur franchie** → `reserveBreachCount`
  ne départage plus, repli sur `reserveDeficit`, qui classe par déficit
  croissant, c'est-à-dire par coût croissant dans cette couleur. Observé à
  `fbde` s154 (`187/43/32/44/34`, options `24 Vi` / `25 Vi` /
  `14 Da + 10 Vi`). C'est l'origine exacte du comportement « choisir la
  moins mauvaise rupture » : ce n'est pas une politique, c'est un rang de
  repli.

---

## 2. Spécification : réserve par échelle de faisabilité

### 2.1 Construction

```
cibles  = toutes les songs encore utiles de la pool, ordonnées par valeur
          structurelle décroissante (§5), égalités départagées par
          weightedDemandCost croissant
protégé = ∅

pour t dans cibles :
    si reachAndAfford(protégé ∪ {t}) :
        protégé ∪= {t}
    # sinon : SAUTER t et continuer. Jamais de break.

reserve[c] = Σ_{t ∈ protégé} cost_t[c]
```

Trois propriétés à ne pas perdre en implémentant :

- **Saut, pas arrêt.** Une F+10 devenue infaisable n'interrompt pas le
  parcours : les F+5 en dessous sont testées et peuvent devenir l'ancre.
  C'est ce qui fait passer d'une logique tout-ou-rien à une maximisation.
- **Coût intégral.** Une cible protégée compte pour 100 % de son coût.
  Jamais de fraction, jamais de pondération par probabilité (§3).
- **Glouton ordonné, pas optimum.** `protégé` est maximal _sous cet ordre_,
  pas le plus grand ensemble au sens mathématique. C'est une heuristique
  structurée assumée, pas un solveur de sac à dos multidimensionnel. Sa
  limite théorique est réelle mais sans support dans le catalogue (§2.4).

### 2.2 Le prédicat `reachAndAfford`

Formulation à retenir — invariant le long d'une trajectoire réelle, **pas**
une inégalité finale :

```
reachAndAfford(S) ⟺
  ∃ une trajectoire réelle τ permettant jusqu'à |S| acquisitions,
  telle qu'après chaque dépense obligatoire de τ :

      balance(τ, étape) ≥ Σ cost(t)  pour tout t ∈ S non encore acquis
```

Détails qui font la différence entre une spec correcte et une spec
ambiguë :

- On paie les vraies techniques **et** les vraies songs nécessaires pour
  continuer le long de τ.
- Une cible protégée acquise pendant τ **sort immédiatement de `S`** et sa
  réserve disparaît. C'est ce qui évite le double-comptage d'une cible à
  la fois payée sur le chemin et exigée dans le solde final.
- La contrainte est donc naturellement décroissante le long de τ.

**Ce qu'il ne faut surtout pas faire :** calculer cinq minima de coût
indépendants par couleur et les assembler. Si un chemin minimise le Dance
et un autre le Visual, le vecteur composé n'est réalisé par aucun chemin.
C'est le même motif d'erreur que l'effondrement d'une frontière de coûts
en scalaire, déjà rejeté au §5 du modèle algorithmique.

**τ suppose des tirages favorables.** C'est une trajectoire de
_faisabilité_, pas une trajectoire _probable_. Cette distinction est le
cœur de §3 et doit rester explicite : sans elle, quelqu'un reconfondra tôt
ou tard les deux, ce qui est exactement l'erreur que la pondération
fractionnaire incarnait.

Implémentation : petit problème de DP d'état. Le kernel existant est la
bonne base — variante déterministe de faisabilité, sans échantillonnage.

### 2.3 Invariant de visibilité

```
visible(t) ⇒ reachCost(t) = 0
```

Une cible écartée pour infaisabilité doit être réévaluée immédiatement, à
coût de chemin nul, dès qu'elle apparaît réellement sur une page. On ne
refuse jamais une cible visible et abordable au motif qu'elle n'était pas
dans l'ensemble protégé.

Cas concret : à `fbde` s154, `44 Vi` avec un chemin minimal de `10 Vi`
donne `34 < 42`, donc Fanfare est sautée. Si le stock permet d'arriver sur
la page avec `46 Vi`, Fanfare est **directement achetable** — il n'y a plus
de coût de chemin à soustraire à ce stade.

### 2.4 Séparabilité en blocs de couleurs

Structure du catalogue C4, vérifiée sur les coûts réels :

| Bloc Dance / Visual | Coût           | Bloc Passion / Vocal / Mental | Coût           |
| ------------------- | -------------- | ----------------------------- | -------------- |
| Daisuki (F+10)      | `42 Da, 26 Vi` | Present March (F+5)           | `22 Vo, 22 Me` |
| Fanfare (F+10)      | `26 Da, 42 Vi` | Yumezora (F+5)                | `22 Pa, 22 Me` |
| Harusora (F+5)      | `12 Da, 32 Vi` | Sekai (F+5)                   | `32 Pa, 12 Vo` |

**Les deux blocs sont disjoints.** Aucune song Friendship de C4 ne mélange
les deux triplets de couleurs.

Conséquences :

1. La limite théorique du glouton (protéger une F+10 à 150 unités pourrait
   bloquer plusieurs F+5 valant davantage ensemble) **n'a pas de support
   dans ce catalogue** : protéger Fanfare ne peut bloquer que Harusora. La
   seule compétition réelle est Fanfare contre Harusora sur le Visual. À
   documenter comme limitation connue _et_ comme non-problème pour C4.
2. `reachAndAfford` peut se calculer **par bloc**, indépendamment : deux
   problèmes à trois cibles sur des espaces de couleurs disjoints, au lieu
   d'un problème à six.
3. La discipline de couleur sur les techniques devrait s'évaluer
   relativement à la demande restante **de son propre bloc**. Le shadow
   price global compare aujourd'hui Visual à Passion alors que ces deux
   couleurs ne se substituent jamais pour une cible donnée. C'est une
   justification structurelle, pas un réglage.

Fait observé cohérent : les deux runs complètes du log terminent avec le
bloc Pa/Vo/Me excédentaire et le bloc Da/Vi à sec — `e57e` finit à
`[75, 75, 26, 19, 45]`, `fbde` à `[98, 43, 32, 2, 34]`.

---

## 3. Séparation faisabilité / probabilité

Invariant du modèle, à traiter comme non négociable :

```
probabilité, valeur  →  est-ce que cette chasse mérite d'être poursuivie ?
réserve              →  si on la poursuit, le coût complet reste-t-il payable ?
```

Et **jamais** :

```
probabilité → quel pourcentage du prix vais-je prétendre conserver ?
```

Une réserve est un seuil de faisabilité. Les seuils de faisabilité ne se
moyennent pas : une cible à 30 % de probabilité coûte toujours 42 Visual
si elle apparaît, pas 12,6. Une réserve fractionnaire n'achète aucune song.

La probabilité intervient dans une seconde phase, comme comparaison
d'espérances :

```
abandonner la chasse de t  si  P(apparition de t) × V(t)
                               <  V(meilleur usage alternatif des tokens réservés)
```

`V(t)` et `V(alternative)` sont exprimables dans la même unité depuis P2
(§5), ce qui rend cette comparaison légitime. Une fois `t` explicitement
abandonnée, sa réserve tombe à zéro ; si elle apparaît malgré tout et est
abordable, l'invariant §2.3 permet évidemment de l'acheter.

Cette phase 2 est **hors périmètre de la présente révision** : à livrer et
mesurer seulement après l'échelle.

---

## 4. Cas de référence issus du log

`decision.ndjson`, v0.22.17, sessions `e57e…` et `fbde…`. Ces états
servent de fixtures d'acceptation.

### 4.1 `fbde` s110 — frontière à deux cibles, déjà contraignante

```
tokens 126 Da / 76 Pa / 59 Vo / 54 Vi / 50 Me
Daisuki et Fanfare toutes deux dans la pool (Daisuki achetée seulement à s132)
```

- v0.23 (`min`) : `reserve.visual = 26`, ne protège rien d'utile.
- P1a somme inconditionnelle : `reserve.visual = 68 > 54`, objectif
  impossible, gel du Visual sur toute la fenêtre s109→s120.
- **Échelle** : `{daisuki}` faisable → protégée. `{daisuki, fanfare}`
  demande 68 Vi contre 54 → sautée. `reserve.visual = 26`, discriminant et
  atteignable.

Ce cas est l'argument décisif contre la somme inconditionnelle : l'échelle
s'auto-limite exactement là où la somme vise l'impossible.

### 4.2 `fbde` s154 — bascule d'ancre

```
tokens 187 Da / 43 Pa / 32 Vo / 44 Vi / 34 Me
Pool restante : Fanfare, Harusora, Sekai + fillers
(Yumezora achetée s117, Daisuki s132, Present March s141, Pyoitto s111)
Options : 24 Vi  |  25 Vi  |  14 Da + 10 Vi
```

Fanfare : aucun chemin d'ouverture de page ne préserve 42 Vi, le meilleur
donne `44 − 10 = 34`. `reachAndAfford({fanfare}) = false` **avant** toute
comparaison d'options. L'échelle saute Fanfare et teste Harusora
(`32 Vi ≤ 34`) puis Sekai, dans l'ordre de valeur avec départage par
shadow price.

Attendu : au moins une cible du bloc Da/Vi protégée à 32 Vi, donc
`14 Da + 10 Vi` devient la seule option **sans brèche** — au lieu d'être
la moins mauvaise brèche. `rankReason` attendu :
`Fanfare : chasse infaisable — aucun chemin d'ouverture ne préserve son coût`.

Note d'honnêteté : lequel de Harusora ou Sekai est protégé dépend du
départage par shadow price et n'est pas déterminé a priori. Affirmer que
« l'échelle prédit Harusora, qui est effectivement achetée à s158 » serait
rétrospectif — le log confirme seulement que Harusora est offerte et
achetée ensuite.

### 4.3 `e57e` s162 — filler de valeur nulle payé dans la couleur critique

```
tokens 132 / 75 / 26 / 40 / 60
Page : Nigekiri | A-No-Ne (Guts +2) | Pyoitto (Stamina +3)
v0.22.17 : achète A-No-Ne → 21 Visual consommés → 19 Visual
v0.23     : carry Pyoitto → 0 Visual consommé
```

Corrigé par P2 seul (§5) : A-No-Ne a le poids de facilité le plus faible du
catalogue (0,16) et paie dans la couleur contestée ; Pyoitto vaut plus
(0,54) et paie hors bloc. Les deux correctifs se renforcent — la réserve
empêche la dépense, la valeur choisit l'alternative.

### 4.4 `fbde` — contrefactuel complet

En appliquant les choix v0.23 sur les offres réellement observées, les
12 Visual économisés à un choix de technique antérieur propagent jusqu'à
`46 Vi` sur la page `Fanfare / Harusora / Nigekiri`, où Fanfare est alors
recommandée avec 4 de marge, au lieu de `34 Vi` et Fanfare inachetable.

Ce contrefactuel est solide malgré la limite habituelle des replays à
offres fixes : le seul changement est un choix de **technique**, et les
techniques ne retirent rien de la pool de songs. Les tirages de pages sont
donc inchangés par construction.

---

## 5. Calibration vérifiée : bonus d'entraînement de song

### 5.1 Formule exacte

Vérifiée par trois captures in-game, dont deux avec transition
avant/achat/après contrôlée.

```
main_float   = (base_facility + Σ statBonus_cartes) × M_cartes
main_affiché = floor(main_float)

total_float   = (main_float + Σ statBonus_songs) × (1 + FB_songs)
total_affiché = floor(total_float)

badge = total_affiché − main_affiché
```

`M_cartes = Friendship_cartes × Mood × TrainingEff × CharCount × Growth`,
tous liés aux cartes et à l'entraînement, jamais aux songs. `FB_songs` est
le _Friendship Training Effectiveness_ de l'écran Active Concert Bonuses.

Points d'implémentation critiques :

- `main_float` n'est **pas** ré-arrondi avant d'entrer dans le total.
- Le bonus de **carte** est pré-multiplicateur (il croît avec bond, mood,
  TE, nombre de cartes). Le bonus de **song** est post-multiplicateur
  cartes mais reste multiplié par `FB_songs`. Les deux ne sont pas
  interchangeables et ne doivent pas partager un champ unique en amont.

### 5.2 Fixtures à figer en régression

**A — Speed, transition contrôlée.**

```
base=12, cardSB=+1, M_cartes = 1.799 × 1.26 × 1.2 × 1.15 × 1.15 = 3.5973
main_float = 13 × 3.5973 = 46.77 → main = 46            (jeu : 46 ✓)
avant, FB=10 %, songSB=0 : floor(46.77 × 1.10) = 51 → badge +5   (jeu : +5 ✓)
après « Speed Training Gain +1 », songSB=1 :
        floor((46.77+1) × 1.10) = 52 → badge +6                  (jeu : +6 ✓)
```

**B — Wit, transition contrôlée.**

```
base=10, cardSB=+1, M_cartes = 1.375 × 1.26 × 1.25 × 1.15 = 2.4905
main_float = 11 × 2.4905 = 27.40 → main = 27            (jeu : 27 ✓)
avant, FB=10 %, songSB=1 : floor((27.40+1) × 1.10) = 31 → badge +4  (jeu : +4 ✓)
après « Wit Training Gain +2 », songSB=3 :
        floor((27.40+3) × 1.10) = 33 → badge +6                     (jeu : +6 ✓)
```

**Test de non-régression essentiel :** `main` ne change **jamais** après
l'achat d'une song de training, seul `badge` bouge. C'est ce qui distingue
la formule correcte de l'hypothèse pré-multiplicateur, qui a été
sérieusement envisagée avant vérification et qui surestime la valeur d'un
facteur ≈ `M_cartes` (≈ 3,6).

**C — Wit, capture isolée : ne pas encoder.** Une troisième capture
(`base=8, cardSB=+2, FB=15 %`, badge observé +10 contre +8 prédit) ne se
reconstruit pas. Aucune transition avant/après n'a été faite dessus,
contrairement à A et B. Écart non résolu, laissé ouvert (§8).

### 5.3 Valeur et poids de facilité

Dérivée de §5.1 : un `statBonus_songs` supplémentaire de `+N` vaut
exactement `N × (1 + FB_songs)` par entraînement produisant ce stat.

```
V(Training X Gain +N) = N × φ × T_x        φ = 1 + FB_songs
V(SP bonus +N)        = N × φ × T          (toutes les facilités produisent du SP)
V(friendship +Δ)      = Δ × brut_restant   (somme des main_float sur rainbows restants)
```

Table de production par facilité (source vidéo Berb, cohérente avec les
captures) :

| Facilité | Produit                  |
| -------- | ------------------------ |
| Speed    | 8 Speed, 4 Power         |
| Stamina  | 8 Stamina, 6 Guts        |
| Power    | 9 Power, 4 Stamina       |
| Guts     | 7 Guts, 2 Speed, 2 Power |
| Wit      | 6 Wit, 2 Speed           |

Poids `T_x` normalisés sur Speed, répartition `speed-wit` type
(20 speed / 15 wit / 4 power / 3 stamina / 3 guts) :

| Bonus        | Entraînements produisant ce stat |    Poids |
| ------------ | -------------------------------: | -------: |
| Speed gain   |                               38 | **1,00** |
| Power gain   |                               27 | **0,71** |
| Wit gain     |                               15 | **0,39** |
| Stamina gain |                                7 | **0,18** |
| Guts gain    |                                6 | **0,16** |

À dériver de `generationProfile` comme `GENERATION_SUPPLY`, pas à coder en
dur : un deck `speed-stamina-wit` a une autre répartition de clics.

Attention au piège de nommage : `Training Power Gain` ne concerne pas la
facilité Power mais tout entraînement produisant du **power** — donc aussi
Speed (4–6 power) et Guts. D'où son poids de 0,71 et non 0,09.

### 5.4 Recoupement indépendant

`Yume o Kakeru` (SP +2, C2, ~30 entraînements restants, φ≈1,30) et
`Grow Up and Shine!` (SP +3, C3, ~22 restants, φ≈1,40) donnent **≈ 170 SP
cumulés**. La vidéo Berb annonce indépendamment « close to 150 to 200 skill
points over the course of a run » pour ces deux songs et « close to 100 on
its own » pour la +2 seule. Deux chemins de calcul indépendants convergent.

### 5.5 La hiérarchie de tiers ne change pas

|                             | Valeur approx. en C4 (~15 rainbows restants, φ≈1,45) |
| --------------------------- | ---------------------------------------------------: |
| Friendship +10 %            |                              ~150 unités, stats + SP |
| Friendship +5 %             |                                                  ~75 |
| **Speed gain +2**           |                                     **~60–70 speed** |
| SP bonus +2 résiduel tardif |                                               ~70 SP |
| Power gain +2               |                                            ~45 power |
| Wit gain +2                 |                                              ~25 wit |
| Guts / Stamina gain +2      |                                                  ~10 |

**SP > Friendship > reste reste correct.** Ce qui manquait est la
discrimination _à l'intérieur_ du tier filler : Speed gain et Guts gain
partagent aujourd'hui `policyValue = 40` alors qu'ils diffèrent d'un
facteur ~6. Ce n'est pas une promotion de tier, c'est un classement interne
qui alimente aussi la pression souple des couleurs.

---

## 6. Autres points de calibration confirmés

**Friendship — décroissance marginale.** `φ = 1 + FB_songs` étant un
multiplicateur global unique, un `+5 %` vaut `+4,35 %` au palier 15→20,
`+3,85 %` à 30→35, `+3,45 %` à 45→50. Effet mineur, documenté pour
mémoire, ne justifie aucune correction.

**Specialty Priority — poids faible confirmé.** Sur une carte à
`specialtyRate = 100` : `200/600 = 33,3 %` → `205/605 = 33,9 %`, soit
`+0,55 pp` et `+1,7 %` relatif. Ratio ≈ 1:6 à 1:8 en faveur d'une
Friendship +5 %, et le gain _décroît_ avec le `specialtyRate` déjà présent.
Départage faible, jamais un tier. Ordonnancement actuel correct, aucune
action.

**Carryover de page de techniques à tarif hérité — vérifié in-game.**
Passe de « affirmé dans le contrat mécanique » à « vérifié ». Mettre à jour
le commentaire de confiance dans `live-rules.ts`, à l'image de ce qui
existe pour le `+10` post-concert. Aucun changement de logique.

**Checkpoint 18 songs — hors scoring, définitivement.** La contrainte
mécanique `18 ∧ Great Success final` reste vraie dans le jeu, mais elle est
trivialement atteinte dans l'usage réel et l'outil est arrêté avant. Elle
ne doit plus apparaître comme facteur d'arbitrage, y compris comme
départage de dernier recours, y compris au Grand Live. Historique à
surveiller : retirée v0.22.11, réintroduite v0.22.13, retirée v0.22.18 —
un troisième aller-retour est le risque principal.

---

## 7. Découpage d'implémentation

Ordre de livraison. Chaque étape doit passer la suite existante avant la
suivante.

### P0 — Fixtures, aucun changement de comportement

Nouveau `tests/training-song-value.test.ts` : fixtures A et B de §5.2
intégralement, plus le test « `main` invariant après achat d'une song de
training ». Rouge avant P2, vert après. ~30 lignes, aucun code de
production requis.

### P1 — Échelle de faisabilité

Remplace intégralement `Math.min(...frontierRequiring…)` dans
`calculateTokenPressure` (`packages/core/src/live-model.ts`).

**P1.1** — `reachAndAfford` comme variante déterministe du kernel DP
existant, avec l'invariant de trajectoire de §2.2. C'est le seul vrai
morceau nouveau. Aucun échantillonnage : faisabilité pure.

**P1.2** — Construction de l'ensemble protégé (§2.1), parcours par valeur
structurelle décroissante, saut sur infaisable, départage par
`weightedDemandCost`.

**P1.3** — Somme sur l'ensemble protégé, coût intégral. Le bloc
`anchorNames` / `reserveReason` gère déjà l'affichage multi-cibles ; seul
le montant change. Ajouter le `rankReason` de §4.2 pour les cibles sautées.

**P1.4** — Invariant de visibilité (§2.3) : `reachCost = 0` sur une cible
affichée.

**P1.5** — Calcul par bloc de couleurs (§2.4), si le profilage montre que
`reachAndAfford` sur six cibles est coûteux. Optionnel, purement une
optimisation — le résultat doit être identique.

**Tests d'acceptation :** les quatre cas de §4. Le test existant « la
réserve C3 protège les deux vecteurs Friendship +10 alternatifs » vérifie
actuellement `reserveTarget = 26` et doit être réécrit.

### P2 — Valeur des bonus d'entraînement

Déjà présent en v0.23 sous la forme `N × φ × T_x`. À vérifier :

**P2.1** — La table de poids est bien dérivée de `generationProfile` et
non codée en dur pour `speed-wit`.

**P2.2** — `φ` est dérivé de l'état de session (songs Friendship déjà
actives) plutôt que d'un champ OCR. Préférer cette source de vérité ;
l'écran Active Concert Bonuses ne sert que de validation croisée
optionnelle.

**P2.3** — La valeur calculée alimente le départage entre fillers **et** la
pression souple des couleurs, jamais `policyValue` ni l'ordre de tier.

**Test d'acceptation :** l'arbitrage `Pyoitto` vs `A-No-Ne` de §4.3.

### P3 — Invariant de monotonie

L'échelle introduit une non-monotonie potentielle : plus de tokens → une
cible de plus protégée → réserve plus haute → une dépense auparavant
admissible devient une brèche. `stock − réserve` n'est donc pas monotone
en stock.

`V(x + δ) ≥ V(x)` devrait rester vrai — si la réserve monte, c'est qu'il y
a mieux à protéger. Mais c'est précisément le mécanisme qui casserait
l'élagage des états dominés du §18 s'il était mal branché. Test de
traversée requis : un état juste sous le seuil d'ajout d'une cible, le même
plus `δ` tokens, vérification que la valeur ne recule pas.

### P4 — Confiance RuleSet et audit `18`

Commentaire de confiance du carryover de techniques (§6). Puis
`grep -n "18" src/solver/*.ts src/planner/*.ts`, lecture manuelle de chaque
occurrence non triviale, et régression qui construit un état pauvre en
songs en fin de C4 et vérifie que le classement préfère le filler de plus
haute valeur structurelle, pas celui qui rapproche le plus de 18.

### P5 — Mesure sur corpus

Rejouer les sessions `e57e` et `fbde` en simulation pure. Métriques :

- couverture des deux F+10 en fin de C4 (référence : 1/2 sur les deux runs) ;
- soldes terminaux par bloc de couleurs — un excédent Pa/Vo/Me persistant
  indiquerait que §2.4.3 n'est pas appliqué ;
- non-régression sur les décisions déjà correctes : cibles SP,
  `stop-and-carry-stock`, carry C2→C3→C4.

### Dépendances

```
P0 ─────────────────────────────► P2 (rouge/vert)
P1.1 ──► P1.2 ──► P1.3 ──► P1.4 ──► P1.5 (optionnel)
                    │
                    └──► P3 (dès que l'échelle est branchée)
P4 indépendant, à grouper avec n'importe quelle étape
P1 + P2 ──► P5
```

P1 et P2 touchent des fonctions différentes mais leurs effets se recoupent
sur les mêmes états (frontière F+10 en C4). Mesurer P1 seule avant
d'activer P2 permet d'attribuer la correction au bon patch.

---

## 8. Questions ouvertes — ne pas traiter comme des défauts

**8.1 — `e57e` s152, STOP à 82 Visual.**

```
tokens 165 Da / 111 Pa / 26 Vo / 82 Vi / 60 Me
Page : Ring Ring | Bluebird (Speed +2, 21 Da / 42 Vi) | Tachiichi (Speed +1, 21 Da / 21 Vi)
v0.22.17 : achète Bluebird et continue
v0.23    : STOP_AND_CARRY_STOCK  (99,1 % sur objectif futur, 8,7 % Friendship section suivante)
```

Tachiichi laisserait 61 Visual, donc ne franchit pas la réserve Fanfare à
42 : le STOP ne vient pas de la réserve mais de la politique terminale. P2
étant déjà actif en v0.23, ce n'est pas un cas « à revoir après P2 ».

**Mais rien ne montre que le STOP est faux.** Tachiichi sous P2 vaut
`1 × φ × T_speed ≈ 17 speed` en C4 terminal. La branche STOP conserve
42 tokens qui traversent le concert **plus** `+10` par couleur, dans une
section dont le pattern de queue est le moins cher du scénario
(`2-2-2-4-3-2-2`). Environ 52 tokens au tarif Grand Live contre 17 speed :
l'arbitrage n'est pas tranché.

Action : chiffrer explicitement les deux branches avant de toucher à la
politique terminale. Risque à éviter — « corriger » un comportement
correct. Le solveur devrait produire un `rankReason` chiffré des deux
côtés plutôt qu'un verdict.

**8.2 — Fixture C non reconstruite (§5.2).** Écart de 2 sur le badge. Deux
hypothèses non tranchées : source de bonus non identifiée dans cette run,
ou `songSB` réel de 2 plutôt que 1. Refaire la capture avec transition
avant/après contrôlée.

**8.3 — `statBonus × (1 + FB)` contre `statBonus × 1`.** Indiscernable sur
les fixtures A et B : à `+3` et `FB = 10 %`, l'écart de 0,3 est absorbé par
la troncature. Il faudrait un `+3` à `FB = 55 %` pour séparer les deux
formes, écart d'environ 1,5. Sans conséquence pratique — retenir la forme
`(main_float + N) × (1 + FB)`.

**8.4 — Hystérésis d'abandon.** Avec l'échelle, les transitions sont des
glissements d'un cran (42 → 32) plutôt que des ruptures (42 → 0), donc le
risque d'oscillation entre deux tours est faible. À vérifier sur corpus en
P5 plutôt qu'à traiter par anticipation.
