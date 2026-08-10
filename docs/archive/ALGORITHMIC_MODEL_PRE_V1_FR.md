# Modèle algorithmique V1

La V1 stabilise l’interface, l’OCR et la distribution sans modifier le modèle
de décision validé en v0.25.3. Les références de régression historiques
conservent donc leur numéro d’origine dans ce document.

Ce document fixe les hypothèses exécutées par le solveur. Les règles
mécaniques sont centralisées dans `packages/core/src/domain/live-rules.ts` sous l’identifiant
`global-grand-live-2026-08-r3`.

## Contrat mécanique

- Pools cumulées : `8 / 11 / 15 / 21 / 21`.
- Déblocages par section : `8 / 3 / 4 / 6 / 0`.
- Pattern Junior documenté : `1-2-3-4-4-2-3`, sans extrapolation au-delà.
- Patterns C2–C4 : préfixe `2-2-2`, puis boucle `4-5-2-2`.
- Pattern Grand Live : préfixe `2-2-2`, puis boucle `4-3-2-2`.
- Jauge automatique : Make Debut! en C1 et GIRLS' LEGEND U au Grand Live.
- Checkpoints mécaniques affichés : 16 à C4, 18 au Grand Live ; la récompense finale du jeu reste conditionnée par `18 ∧ GS`. **Dans le solveur v0.23, 16 et 18 sont strictement informatifs ; seul le Great Success final peut imposer un achat.**
- Cap : `200 + 50 × section`, jusqu’à 400.
- Transition C1–C4 : l’événement post-concert **New Supporters!** relève d’abord le cap des cinq performances de `+50`, puis crédite `+10` à chacune, avec clamp sur le nouveau cap. Cette transition est `verified` sur le client Global, y compris sur une trainee non scenario-link et après un Promotional Live sans Great Success.
- Aucune transition ni aucun carry après le Grand Live.
- Une page de songs exposée peut traverser n’importe quel Promotional Live ; son
  achat après le Live compte comme un point du nouveau pattern.
- Une page de techniques déjà affichée peut elle aussi traverser n’importe quel
  Promotional Live : ses trois cartes gardent le tarif de leur période
  d’origine jusqu’au premier achat, puis le refresh utilise la période courante.

## Ordre de décision

Avant le Grand Live, le solveur optimise la **qualité et le timing des
Lessons**, pas le nombre de songs pris isolément. `16/18` sont des diagnostics
de trajectoire sur toute la run et n'entrent jamais dans le ranking. Au Grand
Live, la jauge manuelle nécessaire au **Great Success final** reste prioritaire,
puis l'objectif devient une conversion terminale : chaque technique vaut
immédiatement `+5 SP` et chaque song `+25 SP`. Le stock non dépensé n'a alors
plus de valeur future.

Les actions de songs et de techniques restent comparées lexicographiquement.
Les familles de critères ne sont donc pas converties en un score arbitraire
commun. L’ordre général est :

1. faisabilité mécanique et contraintes réellement dures ;
2. classe de risque du profil ;
3. préservation des cibles stratégiques encore pertinentes ;
4. valeur structurelle et temporelle des gains (HUNT actif, Friendship +10/+5,
   anciennes SP encore rentables, puis valeurs secondaires) ;
5. continuation prospective de la pool et valeur inter-section ;
6. économie de tokens et pression relative des couleurs ;
7. petites différences probabilistes, quantifiées par bandes afin de ne pas
   transformer le bruit Monte-Carlo en pseudo-gate ;
8. identifiant stable.

Great Success C1–C4 n’intervient que comme gain marginal attendu (`+35` stats
versus Success normal). Une Friendship +10 visible et activée avant C4 peut donc
être préférée à une branche ayant quelques points de Great Success de plus.

Les rôles SP +2, SP +3 et Friendship sont structurels. Specialty Priority ne
sert que de départage faible. Les bonus de stats plats ou par entraînement ne
reçoivent aucune valeur stratégique. Les tiers restent ordinaux entre familles
de bonus ; à l’intérieur de Friendship, le `+5/+10 %` et surtout le nombre de
tours pendant lesquels le bonus sera actif restent des informations réelles.

### Départage des techniques

Le classement d’une offre observée suit maintenant le même ordre explicable
dans le solveur et dans les logs :

1. abordabilité ;
2. blocage déterministe immédiat d’une cible stratégique ;
3. dominance sur le même support de couleurs ;
4. classe de risque ;
5. état terminal réellement dur ;
6. nombre de ruptures puis déficit sous la **frontière stratégique** ;
7. bandes de gains structurels terminales ;
8. couverture vectorielle de la page ;
9. coût pondéré par la shadow price des couleurs ;
10. coût total puis drain normalisé de réserve ;
11. `jointGoalProbability` puis `reachProbability`, par bandes de 5 points ;
12. marges post-achat, économie terminale, continuation générique, id stable.

Le champ `rankReason` journalise le premier critère réellement décisif, par
exemple `reserve-breach`, `terminal-structural-band`,
`weighted-demand-cost`, `goal-probability-band` ou `total-cost`. Un choix comme
`30 Visual` ne peut donc plus être expliqué implicitement par un comparateur
opaque.

Une couleur avec un gros stock brut n’est pas automatiquement un surplus. À
l’inverse, un coût faible dans une couleur stratégique n’est pas automatiquement
interdit : la décision dépend de la valeur des cibles qu’il menace et de la
shadow price restante. Le replay `139 Da / 113 Pa / 93 Vo / 8 Vi / 105 Me`
classe toujours `24 Vo / 25 Pa / 30 Da`; le replay C4
`165/136/26/112/84` classe désormais `12 Da + 12 Vo` devant `30 Vi`, car le
faux plancher Vocal issu d’une cible secondaire n’écrase plus la protection de
la F+10.

### Frontière de réserve stratégique

`calculateTokenReservePlan` ne fusionne plus les besoins de songs différentes
dans un pseudo-vecteur par couleur. Il conserve les **vecteurs entiers** du
meilleur tier encore pertinent. Plusieurs cibles de même tier forment une
frontière : les posséder toutes peut avoir de la valeur, elles ne sont pas
considérées comme des substituts interchangeables.

La hiérarchie de protection est temporelle :

- cible HUNT active : poids maximal ;
- Friendship +10 : très forte protection ;
- Friendship +5 : forte protection, décroissante avec le retard ;
- SP +3 / +2 manquées : valeur décroissante avec le concert ;
- Specialty : pression faible ;
- fillers : aucune réserve stratégique autonome.

Seule la frontière du meilleur tier crée une réserve dure. Les songs de tiers
inférieurs contribuent à une **pression souple** : pour chaque couleur, leur
coût est pondéré par leur valeur stratégique/timing et mesure le coût
d’opportunité de dépenser un token maintenant. Cette séparation évite le défaut
historique où une +5 Vocal fabriquait un plancher dur Vocal qui faisait brûler
30 Visual alors qu’une F+10 Visual/Dance restait la meilleure cible.

Ce modèle n’utilise pas `18-totalSongs` comme demande future. Avant le Grand
Live, acheter trois fillers tardifs n’est donc jamais valorisé simplement parce
qu’ils rapprochent de 18. Le compteur reste un indicateur ; la pression vient
des songs qui ont encore une vraie valeur.

## Sémantique des cibles du plan

Une song structurelle peut avoir trois rôles distincts, qui ne sont plus
confondus :

- `chaseTargets` : cibles cachées dont l'absence peut justifier l'ouverture
  d'une nouvelle page ;
- `visibleOptionalTargets` : opportunités qui peuvent être achetées si elles
  sont déjà exposées, mais ne déclenchent aucune chasse ;
- `reserveTargets` : vecteurs de coût futurs à protéger dans le départage des
  techniques.

Après acquisition de la SP de C2 ou C3, le plan `HOLD` possède zéro cible de
chasse pendant `section-open`. À `deadline-now`, si la jauge reste à `2/3`, le
plan devient `close-checkpoint` et toute song peut fermer Great Success. Dès le
troisième achat, il rebascule immédiatement en `HOLD`. Une Friendship ou une
ancienne SP encore utile peut rester une opportunité visible sans rouvrir une
chaîne une fois les deux objectifs sécurisés.

## Invariant HOLD

En `section-open`, `HOLD` interdit d'entamer une nouvelle chaîne de techniques.
Une progression de pattern déjà acquise n'est pas urgente : elle reste intacte
jusqu'au concert. Le coût passé n'entre donc jamais dans la justification de la
continuation.

Sur une page de songs déjà ouverte :

- une opportunité structurelle visible et achetable peut produire
  `BUY_AND_STOP` ;
- un filler produit normalement `WAIT_RESERVE` ;
- `BUY_AND_CONTINUE` est invalide.

L'exception terminale n'appartient pas à `HOLD` : au moment du concert, une
jauge C2/C3 incomplète après acquisition de la SP active `CLOSE` avec l'objectif
local `any-song`. Une fois Great Success sécurisé, les chaînes cachées
redeviennent interdites.

## Horizons et lois

- La DP de songs utilise au plus quatre pages dans un plan Hunt, trois dans un
  plan actif de fermeture, et une dans Hold.
- Une petite pool est énumérée exactement. Au-delà de 160 pages possibles ou
  de 3 000 états, un échantillon déterministe ferme l’horizon ; la sortie le
  signale comme non exacte.
- La loi de page par défaut est uniforme et explicitement marquée
  `heuristic`. Une fonction de poids permet d’injecter une loi mesurée sans
  changer la DP.
- Les offres futures de techniques sont simulées avec une graine stable. Les
  profils `safe / standard / greedy` changent uniquement le seuil
  d’admissibilité.
- Toute projection de plusieurs pages alterne désormais explicitement
  `techniques → solde réel → tirage de page → achat de song`. Une page future
  n'est jamais évaluée avec le portefeuille antérieur aux techniques qui
  permettent de l'ouvrir.
- La prochaine page utilise directement les probabilités Monte-Carlo
  `reachAnySongAffordableProbability` et
  `reachPrioritySongAffordableProbability`. La DP de songs seule ne peut plus
  satisfaire une contrainte dure.
- Une page de techniques déjà affichée peut traverser un Live avec ses trois
  cartes et leurs anciens coûts. Comme tout achat rafraîchit immédiatement la
  boutique, une seule technique peut être achetée à cet ancien tarif ; la page
  suivante utilise la période courante. Un carryover de song est distinct et ne
  transporte jamais l'ancien tarif des techniques.
- La valeur terminale compare la faisabilité réelle, les cibles structurelles,
  leur timing, la couverture de page et l’économie de tokens. Les checkpoints
  16/18 restent de la télémétrie avant le Grand Live ; ils n’entrent plus en
  tête du vecteur de décision. À l’approche d’un live, la valeur peut être
  prolongée par la section suivante avec les vrais coûts et la vraie pool.

## Valeur inter-section

À `deadline-now`, une décision C1–C4 peut être évaluée jusque dans la section
suivante sous la forme :

```text
V_next(T_live(s))
```

Le déroulé réutilise le même kernel probabiliste que la section courante :

1. terminer éventuellement la continuation courante, avec les vrais coûts de
   techniques et de songs ;
2. appliquer la transition vérifiée `cap +50`, puis `+10` aux cinq soldes ;
3. acheter éventuellement une song portée après cette injection ;
4. ouvrir la nouvelle pool et reconstruire le plan de la section suivante ;
5. simuler les cycles `techniques → page → achat` avec les nouveaux patterns,
   en conservant l'ancien tarif uniquement pour la première offre lorsqu'une
   page de techniques était réellement déjà affichée avant le Live ;
6. comparer acquisition/timing des cibles, Friendship réellement achetée,
   shadow price des couleurs et stock terminal ; les checkpoints restent
   affichés séparément comme diagnostics de trajectoire.

La valeur de l'horizon est cumulative sur ces étapes. Si `C_current` désigne
la continuation encore jouée avant le concert et `C_next...` les sections
projetées :

```text
V_horizon = V(C_current) + Σ V(C_next...)
```

Les termes cumulés sont les Friendship acquises, les achats structurels, le
nombre total de songs, les techniques payées et leurs SP (`25/song`,
`5/technique`). Le solde et la pool étaient déjà transmis après `C_current` ;
omettre sa valeur créait un contrefactuel asymétrique où la continuation payait
et retirait une song sans en recevoir le gain, tandis que STOP pouvait la
racheter plus tard et la compter. Le thinning n'est pas un bonus ajouté : il
vient directement de la pool réellement amputée qui alimente les tirages
suivants.

`C4Readiness` n’est donc pas un score artisanal du type « Dance + Visual
restants ». Les Friendship et autres cibles sont évaluées dans les pages et
dans l’ordre où elles peuvent être activées. La réserve locale est, elle,
vectorielle : une F+10 `42/26` reste son propre vecteur et n’est jamais fusionnée
avec une +5 d’une autre couleur pour fabriquer un seuil synthétique.

La portée v0.17.1 est volontairement conservatrice : elle utilise le stock
courant et la transition post-live vérifiée, **sans inventer de futurs gains
d’entraînement**. L’interface nomme cette branche `stock garanti`. Les scénarios
de supply normal/favorable ne seront ajoutés qu’après calibration d’un modèle
absolu de génération par tour ; ils ne sont pas remplacés par une probabilité
unique non vérifiée.

Le carry est intégré dans cette même continuation. Une page portée est achetée
après le `+10`, remplit un point du pattern suivant et modifie la pool ; sa
valeur vient de cet état futur exact, jamais des techniques déjà dépensées.

Régression v0.25.3 : sur le replay C1 s5, la chaîne reste préférable à STOP
même lorsque la composante `35 stats` de Great Success est neutralisée. Une
fixture symétrique sans prochaine acquisition finançable conserve au contraire
le carry. Ce comportement découle de la somme d'horizon, sans quota, seuil de
songs ou exception `concertIndex === 0`.

## Invariants ajoutés après audit v0.15

- La section suivante est ouverte avec `timingMode: section-open`, jamais avec un
  `CLOSE` artificiel.
- La cible SP est réévaluée après chaque achat dans la projection. Dès que SP +2
  ou SP +3 est acquise, le plan devient `HOLD` et le kernel n’ouvre plus de page
  cachée pour une Friendship ou une Specialty seulement optionnelle.
- Les réserves de la pool courante sont filtrées par les identifiants encore
  présents après chaque achat. Les réserves d’une section future restent
  séparées et ne peuvent pas ressusciter une song déjà consommée.
- Toutes les pools sont canonisées par identifiant avant combinaison,
  échantillonnage, seed et tirage Monte-Carlo. La décision est invariante à
  l’ordre du catalogue, y compris au-delà du seuil d’énumération exacte.
- `maximumAffordablePurchases` fournit un minorant accompagné de `exact`. Un
  minorant tronqué suffisant peut prouver la faisabilité ; un minorant insuffisant
  ne prouve jamais l’impossibilité.
- Run Pulse est un indicateur descriptif expérimental. Il ne contient plus de
  trajectoire cumulative fixe et n’intervient jamais dans le solveur principal.

## Portée des probabilités

Les probabilités de boutique décrivent uniquement le hasard réellement simulé ;
les futurs gains d’entraînement ne sont jamais transformés en une probabilité
absolue de finir à 16/18.

Trois notions sont maintenant séparées dans `AnalysisResult` :

- `reachProbability = P(atteindre la branche/page)` ;
- `conditionalGoalProbability = P(goal | reach)`, diagnostic seulement ;
- `jointGoalProbability = P(reach ∧ goal)`, également exposée sous l’ancien nom
  `goalProbability` pour compatibilité UI.

Le contrat impose :

```text
0 <= jointGoalProbability <= reachProbability <= 1
reachProbability == 0  => jointGoalProbability == 0
action invalide        => jointGoalProbability == 0
```

Seule la probabilité **jointe** peut intervenir dans le ranking et les états
durs. Une branche inatteignable peut avoir conceptuellement
`conditionalGoalProbability=1`, mais elle ne peut plus afficher le couple
contradictoire `reach=0 / goal=1 / hard=1`.

Les diagnostics de capacité 16/18 restent qualitatifs : garanti, finançable
hors techniques, dépendant de supply, indéterminé après recherche bornée ou
impossible lorsqu’une preuve exacte existe. Ces états sont **informatifs sur
toute la run**, Grand Live inclus : ils ne classent jamais les fillers. Au Grand
Live, l'incomplétude du Great Success final est fermée en priorité, puis tous les
achats abordables sont comparés selon leurs gains SP immédiats et leur capacité
à ouvrir la conversion suivante.

## Entrées décisionnelles

Le solver utilise une temporalité binaire explicite : `section-open` autorise
encore des gains futurs non quantifiés, tandis que `deadline-now` interdit tout
crédit futur avant le concert. L'ancien champ manuel « tours avant concert » a
été supprimé de l'interface de décision car il était transmis puis ignoré. La
détection OCR de la date peut toujours fournir ce nombre comme information de
progression, mais il n'influence pas le classement tant qu'aucun modèle validé
de valeur par tour n'existe.

## Temporalité des rôles

Le plan actif ajoute une prime d'urgence à une cible, mais ne crée plus toute
sa valeur. Une SP +2 ou +3 manquée conserve un tier intrinsèque décroissant
tant qu'il reste une section d'entraînement pour l'exploiter. Les tiers sont
ordinaux : plusieurs Specialty Priority ne s'additionnent jamais pour dépasser
une Friendship ou une SP.

Une probabilité Great Success n'est affichée que lorsqu'elle est exacte dans
l'état courant ou calculable sur la prochaine page. Au-delà, l'interface
affiche une valeur indéterminée plutôt qu'une simple probabilité d'atteindre la
page sous un faux libellé Great Success.

## Carry

La préparation d’un carry correspond à l’objectif de technique « atteindre la
sélection ». La consommation d’une page déjà exposée est évaluée séparément :

- achat après le `+10` et le changement de cap ;
- une seule technique héritée économisée à total de songs identique ;
- retard ordinal du rôle SP/Friendship/Specialty ;
- contrôle du checkpoint et de l’ouverture de la nouvelle pool ;
- interdiction au dernier concert.

L’effet opérationnel exceptionnel d’une technique, notamment une énergie
réellement nécessaire, reste une information utilisateur non déduite par
l’OCR. Il ne doit pas être reconstruit depuis les micro-récompenses de stats.

## Historique de calibration et correction v0.25.2

Une run Global observée sur Christmas Oguri Cap fournit le cas de calibration
suivant :

```text
C1 : 4 songs manuelles
C2 : 2 songs — SP +2 acquise, Great Success sacrifié, page portée
C3 : 3 songs — page portée achetée, SP +3 acquise, nouvelle page portée
C4 : 7 songs
Total avant le 4e concert : 16 manuelles + Make Debut! = 17
```

Le quatrième concert affiche Friendship `+15 % → +45 %`, soit `+30 %` activés
par son set list de sept songs. La décomposition visible est cohérente avec deux
Friendship `+10 %`, deux Friendship `+5 %`, deux Specialty et une Chain ; elle
ne permet pas d’attribuer cinq Friendship à ce seul concert. GIRLS' LEGEND U
ajoute ensuite `+10 %`, pour `+55 %` sur les derniers tours et l’URA.

Cette observation avait initialement conduit à sacrifier Great Success C2 après
SP+2. Les replays v0.25.1 s49/s70 ont montré la limite de cette généralisation :
à `2/3`, des pages et achats immédiatement finançables permettaient de récupérer
les `35 stats`, mais HOLD les masquait. Le contrat courant est donc :

- pendant `section-open`, HOLD continue de protéger le budget après la SP ;
- à `deadline-now`, SP obtenue avec jauge `2/3` active `close-checkpoint` ;
- SP obtenue **et** Great Success sécurisé réactivent HOLD strict ;
- aucun quota `4/3/3/5/2` ni soft cap à trois songs ne doit être codé ; la DP
  choisit où acheter le volume de marge ;
- les carryovers C2→C3 et C3→C4 peuvent être rentables, mais doivent rester
  évalués par la transition future exacte, notamment selon le rôle de la song
  portée et son retard d’activation.

Les captures `New Supporters!` montrent en outre `cap +50` et `solde +10` pour
les cinq performances. Le nombre de supporters affichés varie, tandis que la
transition monétaire reste identique ; aucune dépendance à une trainee
scenario-link n’a été observée.

## 18. Qualification de sécurité et observabilité (v0.17.0)

Le classement principal reste lexicographique. La couche de diagnostic ne
recalcule pas la décision et ne transforme pas une différence de score en
blocage. Elle attribue `hard-blocking` seulement lorsqu’une preuve déterministe
ou une transition exacte montre qu’un choix :

- n’est pas finançable ;
- rend toutes les cibles actives actuellement finançables inachetables avant la
  prochaine page ;
- ferme la porte finale ;
- ou rend un checkpoint 16/18 impossible.

Une option moins probable ou moins rentable reste `secondary`, jamais rouge.
Les bloqueurs sont classés derrière les choix non bloquants dans le chemin réel
de `rankObservedTechniques`. Si tous les choix bloquent, le premier reste le
moins mauvais mais conserve son état rouge.

Le mode override est une vue alternative de la politique : il sélectionne le
meilleur `buy-continue` / push non bloquant admissible lorsque la recommandation
normale est HOLD/STOP. Il ne modifie pas le RuleSet et ne peut pas affaiblir une
contrainte dure.

Chaque recommandation est journalisée avec l’état d’entrée, les candidats, le
vecteur de décision, l’override, les timings et le choix utilisateur ultérieur.
Le journal est une trace d’audit ; il ne participe jamais au classement.

## 19. Décision terminale avant une page non exposée (v0.17.1)

Le mode `CLOSE` ne transforme plus automatiquement une page atteignable en
continuation rentable. Tant que la page de songs n'est pas exposée, le solveur
compare explicitement deux branches prospectives :

```text
STOP_NOW
contre
techniques restantes → page tirée → meilleure song portée → T_live → V_next
```

Cette comparaison utilise le même kernel de techniques, le même tirage de page,
la transition vérifiée `+50/+10` et la même simulation de section suivante que
les politiques de songs. Les techniques déjà achetées ne donnent aucune prime :
seuls les coûts et bénéfices encore futurs participent au verdict.

`EXPOSE_AND_CARRY` n'est recommandé que si :

- la page portée est atteinte au seuil de risque actif ;
- le Great Success final, s'il est encore ouvert, n'est pas dégradé ;
- et la branche améliore réellement un objectif structurel en aval : cible de
  plan, Friendship +10, Friendship attendue ou achats structurels.

Une song supplémentaire ou un point de pattern ne suffisent donc plus à eux
seuls à justifier quatre techniques coûteuses. Le repère 16 ne court-circuite
plus cette comparaison : même à `15/16`, `STOP_NOW` et la continuation sont
évalués prospectivement. Seule la jauge du Great Success final peut encore
créer une obligation dure d'achat ; `18` reste un compteur cosmétique pour la
décision.

Le bug corrigé provenait d'une rupture entre deux sous-modèles : `runAnalysis`
mesurait seulement la faisabilité `techniques → page achetable`, tandis que
`V_next` n'était appelé qu'une fois la page déjà ouverte. Le solver concluait
donc à tort qu'un carry était rentable avant de l'avoir évalué.

## 21. Budget de calcul et déterminisme opérationnel (v0.18.0)

Les probabilités restent déterministes pour un état et une seed donnés, mais le
nombre de trials est désormais borné par le contexte UI :

- analyse locale d’une continuation : 1 536 trials maximum en Express, 3 072 en Expert ;
- rollout multi-pages réellement tarifé : 384 / 768 ;
- continuation inter-section utilisée comme départage : 128 / 224.

L’arrêt adaptatif peut conclure plus tôt lorsque les intervalles ne croisent
plus les seuils décisionnels. Les diagnostics exposent le nombre réel
d’échantillons et les durées par sous-moteur. Ces bornes ne changent pas l’ordre
lexicographique du modèle ; elles limitent la précision d’une estimation
heuristique qui n’est jamais présentée comme une probabilité officielle.

Lorsqu’une cible de chasse est déjà visible et achetable, les rollouts destinés
à chercher cette même cible sur des pages cachées sont dominés et supprimés.
Pour une cible cachée, la continuation vient exclusivement du kernel qui paie les
techniques ; l’ancienne DP song-only ne participe plus au départage actif.

La capacité checkpoint s’arrête dès qu’un sous-ensemble prouve le nombre
d’achats requis. Le résultat est alors un minorant suffisant, marqué non exact,
qui peut prouver la faisabilité mais jamais l’impossibilité.

Enfin, les 24 derniers états de page de songs sont mis en cache par une clé
canonique complète. Le cache n’altère aucune décision : il restitue le résultat
déterministe du même état et signale explicitement `cacheHit` dans les timings.

## 22. Contrat du journal de décision v2

Le journal desktop est append-only. Une recommandation et le choix utilisateur
sont deux lignes distinctes reliées par `previousDecisionId`; aucune ancienne
ligne NDJSON n’est réécrite. Chaque entrée contient :

- `sessionId`, `sequence`, `stateHash` et timestamp ;
- état complet avant décision, et `stateAfter` pour un choix confirmé ;
- recommandation normale, recommandation affichée et override ;
- candidats, vecteurs lexicographiques, preuves de blocage et raisons ;
- timings OCR/solver et breakdown du solveur de songs ;
- `matchedRecommendation` sur le choix réel.

Le chemin prioritaire est `logs/decision.ndjson` à côté de l’exécutable. Si ce
dossier n’est pas inscriptible, le backend utilise le dossier de logs Tauri.
Toute erreur d’initialisation ou d’append est affichée dans l’interface au lieu
d’être absorbée silencieusement.

## 23. STOP terminal, horizon C2→C4 et comptabilité v0.18.2

Une page de songs ouverte à `deadline-now` possède désormais une branche
terminale autonome :

```text
STOP_AND_CARRY_STOCK
= aucune song achetée
+ page abandonnée
+ stock complet transféré après le crédit +10
```

Cette branche n’est ni `WAIT_RESERVE` (la section ne reste pas ouverte), ni
`carry-page` (aucune song de la page n’est achetée après le concert). Elle est
comparée aux achats et au carry avec le même vecteur de contraintes et la même
simulation tarifée.

Depuis C2, la valeur terminale déroule deux sections : C2→C3, acquisition
éventuelle de SP +3 puis passage strict en HOLD, C3→C4, ouverture des six
Friendship et fermeture bornée du checkpoint 16. Les deux crédits +10 sont
appliqués et chaque technique/song est payée. Le budget de ce départage est
borné à 64 trials avec des tirages communs aux alternatives.

Le résultat conserve des axes séparés au lieu d’un score artificiel : état des
contraintes, Friendship +10, Friendship attendue, SP de lessons (25/song et
5/technique), Great Success marginal, bonus d’entraînement, stock final et coût
engagé. Un troisième achat qui sécurise Great Success reste donc distinct d’un
quatrième filler sans effet de jauge.

Dans le journal v2, `stateAfter` est comptable même si le tracker visuel ne
déduit pas les achats : tous les coûts confirmés sont retirés et toute
transition C1–C4 reçoit +10. `stateAfterHash` permet de vérifier la chaîne, et
les politiques STOP, wait, carry et buy sont toutes exportées avec leurs
résultats de valeur et leur horizon.

## 24. Frontière OCR et consensus numérique v0.20.1

La refonte OCR ne modifie aucun axe du solveur. Un snapshot n’entre dans le
modèle que lorsque ses cinq soldes et ses trois offres satisfont le même contrat
de complétude qu’une saisie manuelle. La progression, l’annulation et le passage
au concert invoquent toujours les fonctions d’état canoniques de l’application ;
le cockpit OCR n’entretient aucune copie parallèle de la run.

Chaque solde de token est maintenant confronté à plusieurs lectures groupées :

1. OCR général de l’atlas complet ;
2. OCR d’un mot numérique entier après Otsu ;
3. pour une lecture faible ou contenant 0/6/9, mot numérique brut ;
4. pour un seul chiffre, caractères Otsu et brut ;
5. pour 0/6/9 seul, position du trou du glyphe comme contre-signal.

Un conflit de longueur est séparé d’un conflit de forme. Si les passes
entières produisent `6/62` ou `9/91`, le moteur relit le nombre sur le crop
exact, en Otsu et en brut. La valeur longue n’est acceptée que si les crops
large et serré la confirment indépendamment. Dès qu’une passe entière contient
deux ou trois chiffres, le mode `SINGLE_CHAR` est interdit sur le crop complet :
il ne peut plus transformer le premier glyphe répété en majorité artificielle.

Les sources sont regroupées par prétraitement. Un vote répété provenant du même
prétraitement ne suffit pas à écraser un contre-signal brut 0/6/9. En cas de
conflit non résolu, `value = null` : le solveur reste bloqué, le journal conserve
les alternatives et l’utilisateur confirme explicitement la bonne valeur.
Cette abstention est intentionnelle ; une correction manuelle visible est moins
coûteuse qu’une recommandation calculée sur un faux solde à haute confiance.

## 25. Invariance de la décision avant/après achat v0.20.1

Pour toute song visible `s`, la projection est construite depuis l’état exact
qui sera affiché après confirmation :

```text
balance' = balance - coût(s)
pool'    = pool sans s
plan'    = deriveStrategicPlan(pool', timing)
objectif'= resolveStrategicObjective(plan', jauge', total')
```

`runAnalysis`, les réserves de tokens et la continuation inter-sectionnelle
reçoivent tous `plan'` et `objectif'`. Le panneau de techniques appelle le même
résolveur d’objectif ; une cible SP acquise ne peut donc plus rester en HUNT
dans la projection alors que l’écran réel passe en HOLD.

Historique v0.20.1 : pour corriger un cas C1 où l’écran conseillait d’abord
`buy-stop` puis poussait après achat, la probabilité de compléter Great Success
a été promue dans le préfixe commun de décision. Cette généralisation a recréé
une sur-priorisation déjà rejetée : à `deadline-now`, un filler pouvait battre
une Friendship +10 simplement en franchissant le seuil Great Success.

Depuis v0.22.11, ce préfixe est supprimé pour C1–C4. Great Success intermédiaire
reste journalisé et valorisé par son gain marginal attendu, après la valeur
structurelle des songs. Depuis v0.23.0, le Grand Live sépare à son tour les deux
notions : **Great Success final** reste une contrainte dure tant que sa jauge est
ouverte, tandis que le compteur `18` est purement diagnostique.

Les logs de chaque politique d’achat conservent désormais
`postPurchasePlanId`, `postPurchaseObjective` et
`continuationRecommendation`. Un `buy-stop` qui reste optimal mais dont le
prochain écran pourrait rationnellement pousser est présenté comme « acheter
puis réévaluer », et non comme un engagement contradictoire à arrêter.

## 26. Checkpoints immédiats et override Push v0.20.2

Un checkpoint « finançable » n'est jamais assimilé à un checkpoint acquis. Le moteur expose désormais les états suivants :

- `secured-now` : le total requis est déjà possédé ; une action terminale peut franchir le concert ;
- `closable-before-deadline` : le stock courant permet encore de fermer le checkpoint, mais le solveur doit continuer les achats ;
- `reachable-with-future-supply` : des gains futurs sont encore nécessaires et restent possibles uniquement tant que la section est ouverte ;
- `impossible` : le checkpoint ne peut plus être fermé dans l'horizon considéré ;
- `indeterminate` : la recherche de capacité a été bornée sans preuve suffisante.

La v0.20.2 invalidait toute politique terminale sous le checkpoint actif. Cette règle est historique et a été retirée en v0.21.0 : le total 16 est un diagnostic de rythme, pas une condition de validité. Depuis v0.23.0, le total 18 suit la même règle. La seule fermeture dure liée aux songs est désormais la jauge du **Great Success final**.

Le bouton **Concert joué** n'appartient pas à cette politique : il synchronise le tracker avec un événement déjà survenu dans le jeu. Il reste donc toujours enregistrable lorsque les seules conditions mécaniques de session sont satisfaites, même si l'objectif de rythme 16 n'a pas été atteint. Le déficit est affiché comme avertissement ; il ne déclenche aucun rattrapage automatique vers 18.

L'override Push est une politique d'affichage distincte du verdict normal :

- sur une page de songs, il sélectionne le meilleur `buy-continue` valide, éligible et non bloquant ;
- sur une page de techniques, il sélectionne la meilleure option achetable, valide et non `hard-blocking`, même si son verdict prospectif normal reste STOP/HOLD ;
- l'activation ou la désactivation déclenche immédiatement un nouveau calcul et une nouvelle ligne `recommendation` ;
- le journal conserve `normal`, `displayed` et `overrideActive` séparément.

L'état de session sépare enfin `visibleSongIds` — les trois cartes réellement visibles — de `carryoverSongIds`, limité à la song explicitement portée.

## 27. Transition de concert non bloquante v0.20.3

Historique : les checkpoints `16/18` ont d’abord été décrits comme objectifs stratégiques du solveur. v0.22.18 avait retiré cette logique avant le Grand Live ; v0.23.0 l’achève au Grand Live également. Ce sont désormais des indicateurs de trajectoire sur toute la run, pas des fonctions objectif ni des portes de décision. L'application sépare :

- l'admissibilité d'une recommandation terminale avant le concert ;
- la capacité à enregistrer le concert réellement joué.

Un état C4 à `14/16` continue donc d'afficher un retard sur la trajectoire 18, mais le bouton de transition vers le Grand Live reste actif. Seules les incohérences de session indépendantes du checkpoint peuvent encore désactiver la transition, par exemple une page à porter dont les trois songs n'ont pas été identifiées.

## 28. Abandon HUNT, pacing 16 et calibrage appris v0.21.0

Une chasse SP +2/+3 n'est plus dérivée uniquement de la présence de la cible
dans la pool. La session conserve `abandonedChaseTargetIds`. Une cible marquée
abandonnée reste une opportunité visible éventuelle, mais ne peut plus recréer
un plan `HUNT` après achat, changement de page, restauration ou annulation.

En profil standard, une continuation profonde est abandonnée lorsque la
probabilité bornée de **trouver et financer** la cible tombe sous `25 %` ; les
profils safe/greedy utilisent respectivement `35 %` et `15 %`. Ce seuil ne
s'applique qu'avant un cycle déjà profond (`>= 4` techniques), afin qu'un
`WAIT_RESERVE` précoce puisse encore protéger une cible momentanément
infinançable. L'entrée dans un cycle à cinq techniques est toujours refusée en
C2/C3. Sur une section ouverte, l'action gagnante devient alors
`WAIT_RESERVE` sans achat de filler ; au concert, `STOP_AND_CARRY_STOCK`
matérialise l'abandon et fait persister `HOLD`.

Historique v0.21.0 : le checkpoint 16 utilisait encore un préfixe de pacing.
Ce préfixe a depuis été supprimé : sous 16, aucune continuation ne gagne
simplement parce qu’elle augmente le compteur. `buy-stop`, carry, attente et
conservation du stock sont classés sur la valeur/timing des cibles et le coût. La valeur inter-sectionnelle est évaluée avant le tier structurel
fixe, avec une priorité explicite pour une cible SP déjà visible ou une
Friendship +10 immédiatement activée.

La v0.21.0 introduisait `numericFieldTuning` au schéma 4 sous la forme d’un
meilleur triplet `(crop, seuil, zoom)` choisi sur une valeur confirmée. Ce
mécanisme est désormais historique : il surajustait le champ à un échantillon
unique et pouvait améliorer `8` tout en dégradant les valeurs suivantes.

## 29. Localisation dynamique et apprentissage de glyphes v0.22.0

Le profil OCR passe à `schemaVersion: 5`. La région dessinée reste une zone
logique immuable ; aucune confirmation ne la remplace par le bbox de la valeur
courante. La chrominance, la luminance ou une distance RGB servent uniquement
à localiser les composants numériques à chaque capture. Le crop donné à
Tesseract est repris dans l’image source, en niveaux de gris bruts, avec une
marge égale à environ 50 % de la hauteur du glyphe.

Une confirmation ajoute un modèle binaire normalisé `16×24` pour chaque
composant, à condition que le nombre de composants corresponde au nombre de
chiffres indiqué. Les exemples existants sont conservés ; la couleur d’encre
est moyennée entre confirmations. Le classifieur par templates n’est accepté
que si la similarité et la marge de séparation sont suffisantes. Lorsqu’un
seul chiffre est couvert, le seuil est volontairement très strict : un modèle
`8` ne peut pas imposer `8` à une forme de `6` ou `9`. En cas de doute,
Tesseract relit un unique crop serré avec `SINGLE_CHAR` ou `SINGLE_WORD`.

Le localisateur privilégie le plus long groupe cohérent de composants alignés
jusqu’à la limite du champ. Cette contrainte protège les nombres multi-chiffres
contre la troncature d’un premier ou dernier glyphe. Lors de la migration d’un profil v0.21, les anciens paramètres
`threshold/scale/mode` sont supprimés et les seuls rectangles qu’ils avaient
surajustés sont remis à leur zone par défaut. Les autres calibrations manuelles
restent intactes.

## 22. Invariants v0.22.12 : rythme 16, cohérence post-achat et conversion finale

- `16 songs` est un diagnostic de rythme uniquement. Il est absent des achats
  obligatoires de `cross-section`, du hard-close terminal et de l'override.
- un candidat normal `buy-continue` n'est valide que si l'analyse exacte du vrai
  solde post-achat ne répond pas `STOP`/`invalid`. L'interface peut toujours
  afficher « acheter puis réévaluer » sans verrouiller artificiellement l'état
  suivant ; les nouvelles cartes révélées restent libres de changer le verdict.
- une page de techniques portée conserve `firstOfferPeriod` dans tous les
  sous-solveurs. Un carry de song, lui, ouvre des techniques au tarif courant.
- au Grand Live, tant que la jauge nécessaire au **Great Success final** reste
  ouverte, une trajectoire finançable vers la song manuelle manquante est
  poussée. Une fois la jauge sécurisée, le solveur continue tant qu'une
  technique abordable (`+5 SP`) ou une song abordable (`+25 SP`) peut convertir
  le stock terminal. Le total `18` ne change aucun de ces verdicts.
- une offre contient toujours trois cartes, mais seulement `min(3, songsRestantes)`
  slots song. Les autres slots sont des techniques ; l'OCR n'invente donc plus
  de troisième song lorsque la pool n'en contient que une ou deux.

## 30. Comptabilité d’opportunité et conversion finale v0.22.13

Une song structurelle achetée avant un Promotional Live fait partie de l’état
futur acquis. Lorsqu’une Friendship +10 est achetée maintenant, la projection
inter-section ne doit pas la faire disparaître sous prétexte qu’elle n’est plus
dans la pool : `P(F+10 sécurisée)=1` sur les trajectoires qui atteignent la
section suivante, et son bonus est ajouté à la Friendship déjà acquise. Cette
règle évite de valoriser deux fois la branche « attendre » (bonus futur possible
et conservation du stock) tout en donnant zéro à l’activation immédiate.

Historique v0.22.13 : C4 avait été temporairement aligné sur le Grand Live avec
un objectif `any-song` sous 18. Cette généralisation est retirée en v0.22.18 :
**C4 optimise encore la qualité et le timing des songs**. En v0.23.0, le même
nettoyage est achevé au Grand Live : `18` n'est plus jamais un objectif. Depuis
v0.25.2, `any-song` reste ensuite actif comme objectif de conversion terminale,
indépendamment du compteur 18.

Enfin, deux techniques qui consomment exactement les mêmes couleurs sont
ordonnées par dominance composante par composante avant les probabilités
simulées : si A coûte au plus autant que B sur chaque couleur et strictement
moins sur au moins une, A domine B. Les blocages déterministes de réserve/cible
restent prioritaires.

## 31. Frontière stratégique, shadow prices et sémantique jointe v0.22.18

Cette version consolide les corrections issues des replays C4 où Visual devenait
le goulot final alors qu’une F+10 restait pertinente. Le défaut n’était pas
l’absence de logique couleur : le solveur possédait déjà des réserves, mais il
construisait des seuils indépendants par couleur à partir de cibles de tiers
différents. Une +5 Vocal pouvait ainsi créer une rupture « dure » et faire
préférer `30 Visual`, même lorsqu’une F+10 Visual/Dance avait davantage de
valeur stratégique.

Le contrat v0.22.18 est donc :

1. le plan fournit une valeur de **protection**, distincte du tier d’achat ;
2. les cibles du meilleur niveau forment une frontière de vecteurs complets ;
3. seule cette frontière produit des ruptures/déficits durs ;
4. toutes les autres bonnes songs alimentent une shadow price souple par couleur ;
5. cette pression couleur est comparée avant les écarts Monte-Carlo de faible
   amplitude, mais après les vraies contraintes mécaniques et les gains
   structurels matériels ;
6. `rankReason` expose le premier critère qui tranche chaque offre ;
7. `goalProbability` est désormais explicitement une probabilité jointe et ne
   peut jamais dépasser `reachProbability`.

Replay de référence : en C4 avec `165/136/26/112/84` et les techniques
`24 Vocal / 30 Visual / 12 Dance + 12 Vocal`, la nouvelle frontière F+10 ne
fabrique plus de plancher Vocal à partir d’une +5. Le duo `12+12` passe devant
`30 Visual`, tandis que le cas antérieur `177/185/64/127/140` peut encore
préférer `15 Visual` à deux options coûtant 24 lorsque la pression Visual reste
suffisamment faible. Le modèle corrige donc la cause sans hardcoder une couleur.

Enfin, aucune section n’utilise désormais `18` comme dette optimisée. Une F+10
achetée tôt peut valoir plus que plusieurs fillers tardifs, même si ces fillers
rendent 18 trivial. Au Grand Live, 13/18 et 17/18 sont décisionnellement
équivalents à stock et offres identiques ; une fois Great Success sécurisé, le
classement dépend uniquement de la conversion immédiate `+5/+25 SP`.

## 32. Calibration v0.23.0 — training value, réserve de frontière et retrait de 18

### 32.1 Formule vérifiée des bonus `Training X Gain`

Les captures avant/après de l'addendum fixent le contrat suivant :

```text
main_float    = (base_facility + statBonus_cartes) × M_cartes
main_affiché  = floor(main_float)
total_affiché = floor((main_float + statBonus_songs) × φ)
badge         = total_affiché - main_affiché
φ             = 1 + Friendship Training Effectiveness des songs
```

`main_float` n'est jamais arrondi avant l'ajout du bonus de song. Deux fixtures
de régression verrouillent les transitions contrôlées Speed (`46/+5 → 46/+6`)
et Wit (`27/+4 → 27/+6`), ainsi que l'invariant : acheter une song de training
ne modifie pas `main`, seulement le badge.

La valeur structurelle d'un bonus est donc calculée par :

```text
V(Training X Gain +N) = N × φ × T_x
```

avec `T_x` égal au nombre d'entraînements restants qui **produisent** le stat.
La topologie utilisée est : Speed→Speed+Power, Stamina→Stamina+Guts,
Power→Power+Stamina, Guts→Guts+Speed+Power, Wit→Wit+Speed.

Le profil `speed-wit` est le seul dont la distribution de clics soit calibrée
dans les données fournies (`20 Speed / 3 Stamina / 4 Power / 3 Guts / 15 Wit`
sur l'horizon de référence). Il donne les poids relatifs
Speed/Power/Wit/Stamina/Guts = `1.00/0.71/0.39/0.18/0.16`. Comme le tracker ne
collecte pas chaque entraînement joué, `T_x` utilise provisoirement les horizons
de section donnés par l'addendum (`~45 / ~30 / ~22 / ~15`). Une distribution
exacte fournie par l'appelant prend priorité. Pour les autres
`GenerationProfile`, v0.23.0 **n'invente pas** de répartition : la valeur statique
v0.22.18 reste utilisée tant qu'aucune distribution exacte n'est fournie.

Cette valeur dynamique ne promeut jamais un filler au-dessus des tiers SP ou
Friendship ; elle ne sert qu'aux départages internes au tier filler et à la
pression souple des couleurs. `φ` est dérivé des Friendship songs déjà actives.

### 32.2 Frontière multi-cibles : les compléments se somment _(historique v0.23, remplacé par §33)_

Dans `calculateTokenPressure`, les cibles du meilleur tier sont des
**compléments**, pas des substituts. La réserve dure par couleur est désormais :

```text
reserve[c] = Σ cost_i[c]
```

Tant que `Daisuki [42 Da,26 Vi]` et `Fanfare [26 Da,42 Vi]` restent toutes deux
dans la frontière, la réserve vaut donc `68 Dance / 68 Visual`. Si une cible
sort de la pool, la réserve retombe immédiatement sur le vecteur de la cible
restante. Les autres songs continuent d'alimenter uniquement la shadow price
souple.

La pondération probabiliste par obtenabilité (P1b) n'est **pas** activée dans
cette version : elle nécessite d'abord le replay corpus P5 sur les journaux
complets, afin de mesurer un éventuel sur-blocage de la somme inconditionnelle.

### 32.3 Carryover de page de techniques

La conservation du tarif de la page de techniques exposée avant un Promotional
Live jusqu'au premier achat est désormais marquée `verified` dans le RuleSet,
suite à la vérification in-game du 2026-08-08. Aucun changement de mécanique.

### 32.4 `18 songs` : télémétrie uniquement

L'audit v0.23.0 a trouvé des chemins résiduels qui réinjectaient encore 18 dans
le hard-close Grand Live et la projection inter-section. Ils sont supprimés.
Le compteur peut toujours alimenter `checkpoint18Status`, les warnings et le
diagnostic mécanique de la récompense `18 ∧ GS`, mais il est absent des
`decisionVector`, hard gates, overrides et objectifs `any-song`.

Régression canonique : un même état de fin C4 à `10/18` puis `17/18`, avec les
mêmes fillers et le même stock, produit le même ranking. La différence entre
les fillers est déterminée par leur valeur structurelle, pas par la proximité de 18.

## 33. v0.24.0 — réserve par échelle de faisabilité

La réserve dure ne somme plus inconditionnellement toutes les cibles d'une
frontière. Elle construit un ensemble protégé glouton, ordonné par valeur
structurelle décroissante (égalité : `weightedDemandCost` croissant). Pour
chaque cible, le solveur tente de l'ajouter ; si l'ensemble résultant n'est pas
faisable, la cible est **sautée** et le parcours continue vers les cibles utiles
suivantes. Les coûts des cibles retenues sont toujours réservés intégralement.

Le prédicat est existentiel sur des trajectoires vectorielles réelles :

```text
reachAndAfford(S) ⇔
  ∃ trajectoire τ permettant les acquisitions protégées,
  telle qu'après chaque dépense obligatoire de τ,
  le solde couvre encore intégralement les cibles de S non acquises.
```

Les techniques et songs réellement payées sur la trajectoire sont débitées. Une
cible protégée déjà acquise sort immédiatement de la réserve. Les minima par
couleur provenant de trajectoires différentes ne sont jamais assemblés en un
faux vecteur. Quand la page de techniques est connue, sa première dépense doit
être l'une des offres réellement affichées ; les refreshs encore inconnus sont
traités comme un test de faisabilité favorable, sans Monte-Carlo.

Invariant de visibilité : `visible(t) ⇒ reachCost(t)=0`. Une cible auparavant
sautée pour infaisabilité est donc réévaluée immédiatement si elle apparaît et
reste achetable.

La probabilité est strictement séparée de la faisabilité. Elle pourra plus tard
décider si une chasse faisable mérite d'être poursuivie par comparaison
d'espérance ; elle ne réduit jamais le prix réservé (`P × coût` est interdit).
Cette phase EV est hors périmètre de v0.24.0.

Régressions de référence :

- `fbde s110`, `126/76/59/54/50` : Daisuki reste protégée, Fanfare est sautée ;
  réserve Visual = `26`, au lieu d'un objectif impossible à `68`.
- `fbde s154`, `187/43/32/44/34`, offres `24 Vi / 25 Vi / 14 Da+10 Vi` :
  Fanfare est infaisable, Harusora reprend l'ancre Da/Vi ; réserve Visual =
  `32`, et `14 Da+10 Vi` est la seule offre sans brèche.
- une cible Fanfare visible avec `46 Vi` est évaluée à coût d'accès nul et peut
  être achetée directement.

La valorisation P2 (`N × φ × T_x`) reste une pression **souple** et un
départage à l'intérieur du tier filler ; elle ne crée aucune réserve dure.
