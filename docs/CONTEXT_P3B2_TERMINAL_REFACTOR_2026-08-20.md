# LiveRoute — contexte de reprise P3b2 → refonte terminale

Date de départ du lot : 2026-08-20

## 1. Pourquoi ce document existe

Ce document est un handoff détaillé de la séquence de travail commencée après la refonte solver v5. Il doit permettre de reprendre le chantier dans une nouvelle conversation sans devoir reconstruire le raisonnement depuis les logs, les anciennes discussions ou les patchs.

Il décrit :

- le problème produit d'origine ;
- pourquoi l'ancien modèle s'est progressivement écarté de ce besoin ;
- les invariants désormais admis ;
- la baseline comportementale v1.0.2 ;
- ce qui a été modifié dans P3b2 ;
- les observations des runs réelles du 20 août ;
- le problème terminal P4/P5 restant ;
- les décisions de conception et le plan de développement du lot terminal.

Ce document est un changelog de raisonnement autant qu'un changelog technique. Les valeurs numériques historiques sont conservées lorsqu'elles expliquent un bug, mais elles ne deviennent pas automatiquement des contrats métier.

## 2. Le besoin produit d'origine

LiveRoute n'a jamais été conçu pour maximiser une estimation complète des stats finales de l'Uma.

Le besoin initial était beaucoup plus borné :

1. naviguer correctement les pages de techniques et de songs du Grand Live ;
2. acquérir les songs structurellement importantes au bon moment ;
3. éviter de gaspiller des ressources ou de casser un objectif de section ;
4. utiliser le carryover correctement ;
5. départager intelligemment des choix autrement équivalents.

Le cas typique qui a motivé les estimations de training était un tie-break du type :

- `Speed training +1` ;
- `Power training +1` ;
- `Guts training +1`.

Le solver devait éviter de prendre `Guts +1` arbitrairement alors qu'un bonus Speed/Power était plus utile pour un profil de training courant.

Le but n'était pas de conclure qu'une route complète produirait exactement `+37.4` stats de plus qu'une autre.

## 3. Comment le modèle s'est progressivement perdu

Pour traiter des edge cases, plusieurs estimations ont été ajoutées au fil du temps :

- exposition future aux bonuses de training ;
- exposition Friendship ;
- projection des Skill Points ;
- valeur du stock de tokens ;
- reachability sous zero-income ;
- valeur du gate 18 songs ;
- coûts d'opportunité terminaux ;
- HUNT SP avec seuils de profondeur/miss.

Prises isolément, beaucoup de ces informations sont utiles. Le problème est qu'elles ont fini par être converties dans un même scalaire de pseudo-stat-points. Le solver pouvait donc faire des arbitrages que les données ne justifiaient pas réellement.

Exemple historique :

```text
Friendship +10
× nombre générique de trainings restants
× 0.52
= pseudo valeur en stat-points
```

Cette quantité donne une fausse précision. Friendship est qualitativement le plus gros moteur de valeur du scénario, mais sa valeur réelle dépend des rainbows, placements, supports, trainings effectivement cliqués, énergie, stats de base, etc. LiveRoute ne possède pas assez d'information pour convertir proprement ce bonus en stats finales.

## 4. Invariants désormais admis

La refonte v5/P3b2 repose sur les règles suivantes.

### 4.1 Impossible signifie impossible ; inconnu ne signifie pas zéro

Une action physiquement impossible n'est jamais simulée comme réalisée.

Une information future inconnue doit rester inconnue, ou être exposée comme projection/bound. En particulier, une projection `zero-income` signifie :

> ce que le wallet actuel garantit même si aucun prochain training ne rapporte de tokens.

Elle ne signifie pas :

> ce qui se produira réellement dans la run.

### 4.2 Les tokens n'ont pas d'utilité intrinsèque

`50 Visual` ne valent pas un nombre abstrait de stat-points.

Ils ont de la valeur lorsqu'ils financent une action future utile ou lorsque leur dépense rend une action importante infundable. Le stock terminal n'a aucune valeur en lui-même.

### 4.3 Un gate discret n'est pas une jauge de reward proportionnelle

Un gate est franchi ou non, ou possède une probabilité explicite de franchissement lorsque cette probabilité est réellement la grandeur pertinente.

Il ne faut pas transformer un simple compteur de progression en fraction de reward.

### 4.4 Les projections comportementales sont du T2

Les estimations suivantes restent utiles comme départage secondaire :

- `expectedPracticeStatDelta` ;
- `expectedSkillPoints` futurs ;
- les estimations de distribution de trainings.

Elles ne doivent pas battre une différence structurelle, mécanique ou de faisabilité.

### 4.5 Friendship est structurelle

La priorité Friendship vient de faits connus :

- type de song Friendship ;
- magnitude `+5` ou `+10` ;
- moment d'activation ;
- existence ou non d'un horizon de training après activation.

Elle ne vient plus de `friendshipExposure × coefficient`.

### 4.6 STOP immédiat et abandon persistant sont différents

Un HUNT peut rester actif alors que le meilleur choix instantané est `buy-stop`/HOLD.

Ne pas pouvoir financer une cible avec le wallet actuel n'est pas une raison pour abandonner définitivement une cible si de futurs trainings peuvent encore générer des tokens.

## 5. v1.0.2 comme golden standard comportemental

Le tag `v1.0.2` est la baseline empirique de comportement général.

Les runs réelles de cette version ont été particulièrement solides sur C1-C3 et sur une grande partie de C4 : Great Success réguliers, HUNT SP efficaces, bonne utilisation du carryover, progression vers le Grand Live et dépenses terminales généralement cohérentes.

La règle est :

> préserver les décisions v1.0.2 explicitement validées comme bonnes, sans préserver ses anciennes raisons numériques internes.

Le golden corpus ne doit donc pas figer :

- les anciennes utilities ;
- les anciennes exposures ;
- les coefficients de conversion.

Il doit figer des décisions réelles et qualifiées : BUY/HOLD/CARRY, song sélectionnée, HUNT continué, PUSH/STOP lorsque l'état a réellement été validé.

## 6. Golden baseline construit avant P3b2

Un manifest `golden-v1.0.2-checkpoints.json` a été ajouté avec des checkpoints sélectionnés dans les logs v6 historiques.

Principe :

- sélectionner les points discriminants plutôt que toutes les observations ;
- identifier un checkpoint par `sessionId + event + sequence + stateHash` ;
- annoter `accepted`, `suspected-bug`, `confirmed-bug` ou `unknown` ;
- ne jamais promouvoir automatiquement un choix manuel `matchedRecommendation=false` comme oracle du solver.

P3b2 a ensuite été validé sans diff sur le replay P0 existant.

## 7. P3b2 finalisé dans le lot précédent

### 7.1 T1b/T2

Le chemin principal de sélection de songs sépare désormais :

- conséquences déterministes T1b ;
- projections génériques T2.

`FRIENDSHIP_EXPOSURE_STAT_RATE` a disparu du modèle canonique.

### 7.2 Bonus immédiats vs permanents

Les formes du catalogue sont explicitement distinguées :

```text
Speed +26             -> immédiat déterministe
Skill Pts +22         -> immédiat déterministe
Speed training +1     -> projection comportementale
Skill Pt training +2  -> projection comportementale
```

### 7.3 HUNT

Le HUNT a été recentré sur la reachability plutôt que sur la profondeur passée :

- plus de seuil brut `3 misses` comme branche métier ;
- plus de `cycleDepthPenalty` décisionnel ;
- plus de training exposure comme condition de continuation ;
- un STOP de dépense immédiate ne marque plus automatiquement la cible comme abandonnée ;
- le compteur de misses reste diagnostic.

Les premières runs réelles post-P3b2 du 20 août ont validé ce comportement : SP2/SP3 restent actives à travers plusieurs fillers/misses et sont ensuite acquises normalement.

## 8. Runs réelles du 20 août : conclusion

Les logs `grand-live-v8` / app `1.0.3` sont globalement rassurants pour P3b2.

C1-C3 restent proches du golden standard. Le nouveau HUNT se comporte comme attendu.

Le principal problème visible reste C4 et correspond exactement à l'îlot P4/P5 que P3b2 avait volontairement laissé en compatibilité.

### 8.1 Cas C4-742D8FD9

État observé :

```text
4 songs C4
15 songs total
cycle 5, 0/5 techniques
wallet ≈ 53 / 83 / 48 / 45 / 25
Friendship encore dans le pool
```

Le terminal recommande STOP avec environ :

```text
P(page usable | PUSH) ≈ 88.9 %
Wilson lower ≈ 86.2 %
catastrophe floor = 72 %

U(PUSH) ≈ 87.7
U(STOP) ≈ 107.7
Δ ≈ -20.1
```

La recommandation n'est donc pas causée par le floor de risque : PUSH est largement admissible.

La décomposition montre que l'ancien terminal donne surtout un énorme avantage à STOP via la projection zero-income du gate 18 :

```text
P(gate18 | STOP) ≈ 91.9 %
P(gate18 | PUSH) ≈ 8.6 %
```

Puis il convertit cet écart en reward proportionnel, pendant qu'il convertit Friendship en pseudo-stat-points via l'ancien coefficient 0.52.

C'est exactement le type d'arbitrage que la refonte cherche à supprimer.

### 8.2 Pourquoi le modèle zero-income trompe ici

STOP garde beaucoup de stock, donc le modèle sans revenu futur peut financer davantage de choses après C4.

PUSH dépense le stock, donc la projection sans revenu futur considère la suite beaucoup moins fundable.

Mais les trainings réels après C4 génèrent des tokens. Dans une bonne run, atteindre 18 songs avant la deadline est normalement trivial dès lors que le joueur pense à dépenser ses tokens.

Le modèle zero-income reste utile comme borne pessimiste, mais son `P(gate18)` ne doit pas devenir une reward terminale.

### 8.3 Le basculement STOP -> PUSH après quelques techniques

Dans cette même run, après avoir forcé plusieurs techniques, le solver finit par recommander PUSH.

Ce n'est pas un sunk-cost bug en soi : les coûts passés ne doivent pas être repayés. Mais cela révèle la survalorisation initiale du stock conservé par STOP. Une fois ce stock en partie dépensé, l'avantage artificiel zero-income de STOP s'effondre.

## 9. Règle produit nouvelle pour les 18 songs

Retour utilisateur ferme :

> Une bonne run permet systématiquement l'achat de 18 songs avant la deadline. Les rares échecs observés venaient d'un oubli humain de dépenser les tokens, pas d'une impossibilité économique normale de la run.

Conclusion :

> Le compteur 18 songs est un indicateur de progression et un garde-fou de deadline, pas une économie.

Règle normative proposée :

> **Le compteur 18 songs ne doit jamais départager PUSH et STOP tant que les deux trajectoires permettent encore mécaniquement d'atteindre 18 avant la deadline.**

Le gate peut encore :

- signaler `15/18`, `17/18`, `18/18` ;
- détecter une impossibilité mécanique réelle ;
- déclencher une alerte/obligation au dernier moment.

Il ne doit plus contribuer à `U(PUSH)` ou `U(STOP)` sous la forme `P_zero_income(gate18) × reward`.

## 10. Erreur identifiée dans le golden terminal

Le checkpoint historique `C4-6E60F028` avait été marqué `accepted` comme STOP.

Or le log historique montre qu'immédiatement après cette recommandation, le joueur a utilisé un override PUSH avec `matchedRecommendation=false`.

Ce STOP ne peut donc pas servir d'oracle comportemental. Il doit être reclassé au minimum `unknown`, probablement `suspected-bug`.

`C4-DE3DE5FC` doit également être réaudité avant de rester `accepted`, car le flux de log associé rend ambigu le rapport entre la sous-décision terminale et l'action utilisateur globale.

`C4-068D9CF3` est un meilleur STOP de référence : reachability autour de 63.5 %, borne basse autour de 61 %, clairement sous le catastrophe floor 72 %. Celui-ci repose sur un vrai garde-fou de risque plutôt que sur le scalar gate18/Friendship.

## 11. Le problème technique restant : terminal compatibility island

P3b2 a volontairement conservé `terminal-compat-utility.ts` pour éviter une régression accidentelle P4/P5.

Cet îlot continue à faire approximativement :

```text
expected practice
+ SP × SKILL_POINT_UTILITY
+ Friendship exposure × 0.52
+ Great Success
+ P_zero_income(gate18) × reward
```

Il ne respecte donc pas encore le contrat P3b2.

Autre trou : le terminal ne propage pas encore proprement les flat rewards `Speed +22`, `Power +22`, `Skill Pts +22` dans des métriques immédiates distinctes. Il mélange encore notamment lesson SP et SP-training exposure.

## 12. Design cible de la refonte terminale

La refonte ne doit pas remplacer l'ancien scalar par un nouveau scalar arbitraire.

Ordre conceptuel :

```text
T0  PHYSIQUE
    action possible ?

RISK
    page atteignable avec une sécurité suffisante ?
    le catastrophe floor C4 reste un garde-fou dur dans un premier temps

STRUCTURE
    probabilité de vraie cible structurelle utile
    Friendship +10 utile
    Friendship +5 utile
    target SP lorsque pertinente
    activation Friendship avant un horizon de training utile

MECHANICAL REWARD
    immediate stat
    immediate Skill Pts
    Great Success réellement sécurisé
    autres rewards déterministes explicitement modélisés

RESOURCE CONSEQUENCE
    perte réelle de fundability / opportunité observable
    pas de valeur intrinsèque du token

T2 GENERIC
    bonus permanents de training
    SP-training projection
    seulement comme départage inférieur

TIE
    ordre stable déterministe
```

Important : si une branche améliore une cible structurelle mais exige davantage de ressources sans qu'il existe de taux d'échange justifié, le modèle peut conclure `not-separated` et co-recommander les deux actions.

## 13. Friendship terminale : représentation cible

Ne pas utiliser :

```text
Friendship exposure × coefficient de stat
```

Préférer des événements structurés :

```text
P(Friendship +10 effective)
P(Friendship +5 ou mieux effective)
```

`effective` signifie que le bonus est activé alors qu'il reste encore des trainings capables d'en bénéficier.

Une Friendship acquise au Grand Live peut donc avoir une magnitude réelle mais zéro valeur de training future. Cela doit être distingué sans convertir la Friendship en stats.

## 14. Rôle du zero-income après la refonte

Le rollout zero-income reste conservé.

Sa sémantique devient explicitement :

> garantie sous le scénario pessimiste `aucun revenu de training futur`.

Il peut alimenter :

- diagnostics de funding ;
- funding gaps ;
- robustesse ;
- détection d'une impossibilité garantie.

Il ne doit plus être présenté comme probabilité réelle d'atteindre 18, ni converti en reward.

## 15. Co-recommandations

P4 sait déjà produire `coRecommended` et `coRecommendationReason`, mais cette information est peu ou pas exposée dans l'UI actuelle.

La refonte terminale doit utiliser cette capacité plutôt que forcer un faux gagnant lorsque la comparaison est structurellement indécidable.

Exemple produit cible :

```text
STOP nominal
Alternative solide : PUSH

- ~49 % d'obtenir une Friendship utile
- cycle coûteux : 5 techniques
- aucun risque critique détecté
```

Ou l'inverse lorsque PUSH est nominal mais STOP reste défendable.

## 16. Plan de développement terminal

### P-T0 — Auditer/corriger le golden C4

- reclasser `C4-6E60F028` hors `accepted` ;
- réauditer `C4-DE3DE5FC` ;
- conserver les vrais PUSH validés ;
- conserver `C4-068D9CF3` comme STOP dur si la preuve reste cohérente ;
- ajouter les nouveaux états du 20 août comme `unknown`/fixtures d'étude, pas comme golden arbitraire.

### P-T1 — Retirer le gate18 du scalar terminal

- supprimer `P_zero_income(gate18) × GATE18_STAT_DELTA` du chemin de décision terminal ;
- conserver les métriques gate18 en diagnostic/progression ;
- ajouter un test de propriété : à reachability/sécurité égales, changer uniquement la projection zero-income de 18 ne doit pas inverser PUSH/STOP.

### P-T2 — Propager les rewards immédiates

- `immediate-stat-delta` ;
- `immediate-skill-points` ;
- séparer lesson SP déterministes et SP-training projetés.

### P-T3 — Matérialiser la structure terminale

- effective Friendship +10 ;
- effective Friendship +5-or-better ;
- target SP / structural target lorsque pertinente ;
- comparer les événements structurels sans monnaie universelle.

### P-T4 — Remplacer le scalar par un comparateur apparié par couches

- conserver les common random numbers ;
- calculer les différences par couche ;
- une couche supérieure statistiquement séparée décide ;
- si une couche reste non séparée, descendre seulement lorsque le contrat l'autorise ;
- trade-off non commensurable -> co-recommandation plutôt que coefficient inventé.

### P-T5 — Repositionner zero-income

- diagnostics/funding robustness uniquement ;
- aucun reward proportionnel ;
- clarifier noms et UI.

### P-T6 — Diagnostics/UI

- renommer `expectedOpportunityCost` qui représente en réalité la baseline STOP depuis P5 ;
- conserver un alias de compatibilité si nécessaire ;
- afficher `coRecommended` dans l'UI/cockpit ;
- expliquer les raisons : risque, structure, coût, projection générique.

### P-T7 — Validation

Garde-fous :

1. tests de propriétés du nouveau contrat ;
2. corpus P0 ;
3. golden v1.0.2 corrigé ;
4. replays C4 historiques ;
5. logs réels du 20 août (`C4-742D8FD9`, `C4-5F24CE38`, `C4-950F5E32`, `C4-3E9BBB89`) ;
6. build Web/Desktop, typecheck, docs/version consistency.

## 17. Critère de réussite du lot

Le terminal doit pouvoir dire :

> PUSH est safe et offre une vraie chance de Friendship utile ; STOP conserve davantage de stock mais cette conservation n'est pas une reward en soi.

Il ne doit plus dire implicitement :

> STOP vaut +41.6 stats parce que le wallet actuel atteint mieux 18 songs dans un monde sans revenu futur, tandis que PUSH vaut +19.1 stats grâce à Friendship × 0.52.

Le modèle final doit préférer l'incertitude explicite à une précision numérique inventée.

## 18. État au démarrage de l'implémentation de ce lot

Base locale reconstruite : snapshot `f9903db` + golden baseline + patch P3b2 final.

P3b2 est considéré finalisé et ne doit pas être rouvert sauf régression démontrée.

Le chantier actif est désormais exclusivement la migration terminale P4/P5 et ses diagnostics/UI associés.

## 19. Implémentation effective P-T0 -> P-T6

Cette section est un journal d'implémentation, pas seulement le plan initial.

### P-T0 — golden C4 réaudité

Le manifest v1.0.2 contient toujours 25 checkpoints, mais ils ne sont plus tous
présentés comme des oracles :

- 23 `accepted` ;
- `C4-6E60F028` -> `suspected-bug` : le STOP historique a été immédiatement
  refusé par le joueur via PUSH forcé ;
- `C4-DE3DE5FC` -> `unknown` : la sous-décision terminale n'est pas une preuve
  assez forte de l'action utilisateur globale ;
- `C4-068D9CF3` reste un STOP accepté, soutenu par une vraie admission risque
  sous le catastrophe floor.

Le golden conserve donc la trace historique sans transformer les erreurs ou
ambiguïtés en contraintes de non-régression.

### P-T1 — gate 18 retiré de l'économie terminale

`terminalLayeredTrialValue()` ignore `totalSongs` et `checkpointMet` pour le
classement. Un test de propriété construit deux outcomes identiques, l'un à
15/18 et l'autre à 18/18, et exige une valeur terminale par couches identique.

Les métriques 18 restent disponibles dans les diagnostics/replays. Le rollout
zero-income garde sa signification de scénario pessimiste de funding ; il ne
produit plus `P(gate18) x reward`.

### P-T2 — rewards immédiates propagées

Le cross-section terminal transporte désormais séparément :

- `immediateStatPoints` ;
- `immediateSkillPoints` ;
- les projections `practiceTrainingExposure` / `spTrainingExposure`.

Un flat `Speed +26` ou `Skill Pts +22` est donc mécanique/déterministe. Un
`Speed training +1` ou `Skill Pt training +2` reste T2.

Great Success a sa propre couche de gate. Il n'est pas noyé dans le même nombre
que les rewards de lesson.

### P-T3/P-T4 — comparateur terminal par couches

Nouveau module : `packages/core/src/solver/terminal-layered-value.ts`.

Ordre effectif :

```text
risk/admission (extérieur au comparateur)
-> great-success-secured
-> structural-tier-5
-> structural-tier-4
-> structural-tier-3
-> structural-tier-2
-> mechanical-reward
-> t2-practice
-> t2-skill-points
```

Les tiers structurels sont des indicateurs cumulatifs et non une moyenne du
numéro de tier. Une incertitude statistique matérielle sur une couche haute
bloque les couches inférieures.

Le module `terminal-compat-utility.ts` a été supprimé. Le terminal ne calcule
plus ni `Friendship exposure x 0.52`, ni `P_zero_income(gate18) x 50`.

Les anciens champs `grossValue`, `expectedOpportunityCost` et `netValue` restent
provisoirement présents pour compatibilité de schéma, toujours à zéro. Ils ne
pilotent plus aucune décision.

### P-T4 — trade-off ressources non commensurable

Si PUSH gagne uniquement via une reward mécanique/T2 mais consomme des
ressources que STOP conserve, le solver ne fabrique pas un taux d'échange.

Comportement choisi :

```text
STOP primaire
PUSH co-recommandé
coRecommendationReason = resource-tradeoff
```

Ce mécanisme est volontairement différent d'un "PUSH perd" : il indique que le
modèle reconnaît le gain mais ne sait pas le convertir honnêtement contre la
ressource consommée.

### Bug découvert pendant la migration : miss et Great Success

Premier jet erroné : un PUSH qui n'atteignait aucune page recevait un outcome
par couches nul. Cela faisait disparaître un Great Success déjà acquis avant le
PUSH.

Correction : un miss conserve tous les faits déjà acquis (Great Success,
techniques réellement achetées, etc.) et n'invente simplement aucune acquisition
structurelle supplémentaire. Les tests Express/Expert convergent de nouveau sur
la même politique après cette correction.

### Ranking des techniques : aucun tableau magique legacy

Le terminal était aussi consommé par le classement des techniques observées.
Pour empêcher l'ancien scalar de revenir indirectement, le tableau positionnel a
été remplacé par un tuple typé `TerminalTechniqueDecisionVector` construit par
`terminalTechniqueDecisionVector()`.

Il transporte explicitement : risque, état layered, Great Success, quatre
frontières structurelles, reward mécanique et deux métriques T2.

Deux vieux tests de technique ranking ont été migrés parce que leurs fixtures
encodaient littéralement l'ancien layout de tableau, pas parce que leur résultat
métier devait changer. Les choix historiques de réserve/couleur restent verts.

### P-T6 — diagnostics et UI

Les replays exposent désormais directement :

- `decisionLayer` ;
- `decisionMetric` ;
- `decisionDelta` ;
- `decisionInterval`.

Le mapping P6 indique `hard-state` pour Great Success, `structural-tier` pour les
cibles structurelles, `utility` pour la reward mécanique et
`generic-projection` pour T2.

Les co-recommandations terminales sont rendues explicitement dans l'UI partagée
et dans le cockpit Desktop (`Alternative défendable : PUSH/STOP`) au lieu d'être
uniquement implicites dans un champ de diagnostic.

## 20. Invariants exécutables ajoutés

Le lot possède notamment des tests pour :

1. absence totale de la gate 18 dans la valeur terminale par couches ;
2. Great Success séparé de la reward mécanique ;
3. structure prioritaire sur T2 ;
4. structure non séparée bloquant les couches inférieures ;
5. flat rewards déterministes distinctes des projections de training ;
6. un gain immédiat ne créant pas un taux d'échange contre des tokens ;
7. une vraie cible structurelle pouvant battre l'ancien verdict scalar ;
8. absence de `terminal-compat-utility`, `FRIENDSHIP_EXPOSURE_STAT_RATE` et
   `GATE18_STAT_DELTA` dans le chemin terminal ;
9. classement des techniques stable sous le nouveau tuple explicite.

## 21. État de validation finale

Le nouveau contrat PUSH/STOP et le classement technique sont fonctionnels et le
lot a été validé sur une copie fraîche reconstruite depuis la baseline P3b2.

Validation exécutée :

- suite core complète : `293 / 293` ;
- noyau terminal/golden ciblé : `41 / 41` ;
- `check:docs` : OK ;
- `check:versions` : OK ;
- `git diff --check` : OK ;
- application du patch via `git am --3way` sur une baseline P3b2 fraîche : OK ;
- tree Git après fresh-apply identique au tree du workspace de développement.

Le replay P0 présente deux diffs internes attendus, détaillés en section 23, mais
les recommandations comportementales `accepted` concernées restent inchangées.

Les vérifications TypeScript globales et les builds Web/Desktop n'ont pas pu être
relancés dans l'environnement de packaging final : le registry npm n'était pas
accessible et le cache offline ne contenait pas `zlibjs-0.3.1.tgz`. Elles restent
donc les derniers contrôles à exécuter sur le poste Windows avant push :

```text
npm ci
npm run typecheck
npm run build:web
npm run build:desktop
```

Le patch final est conçu pour être appliqué **après** les deux commits locaux
`golden v1.0.2` et `P3b2 layered utility/HUNT`.

## 22. Replay direct des logs réels du 20 août avec le nouveau terminal

Les états du fichier `decision(20260820-184634).ndjson` ont été reconstruits à
partir du `stateSignature` loggé puis repassés dans `buildSolverStateContext()`
et `evaluateTerminalTechniqueOptions()` avec les mêmes profils/seed conventions
que l'UI.

### `C4-742D8FD9` — le cas déclencheur

Ancien v8 :

```text
option-1 -> STOP
reach ≈ 88.9 %
Wilson low ≈ 86.2 %
```

L'utilisateur a immédiatement activé `push-forced-enabled`, puis acheté
l'option 1. Ce STOP n'était donc pas une décision joueur validée.

Nouveau terminal layered :

```text
option 0 / ancienne option-1
PUSH
layer  = structural
metric = structural-tier-3  (Friendship +5)
delta  ≈ +0.497
95 % CI ≈ [+0.458 ; +0.536]
reach  ≈ 88.9 %
Wilson low ≈ 86.2 % > catastrophe floor 72 %
```

Une autre option physiquement/sûrement jouable produit également PUSH avec
`structural-tier-3 ≈ +0.425`. L'option non fundable reste rejetée par le chemin
de risque/physique.

La correction est donc expliquée par une vraie différence structurelle :
environ 42-50 points de probabilité supplémentaires d'acquérir une cible F+5,
pas par une conversion de Friendship en stats ni par la projection du compteur
18.

### `C4-5F24CE38` — trois techniques plus tard

L'ancien solver était déjà passé à PUSH. Le nouveau modèle reste PUSH :

```text
option 0
layer  = structural
metric = structural-tier-3
delta  ≈ +0.342
95 % CI ≈ [+0.313 ; +0.371]
reach  ≈ 93.5 %
```

Le changement STOP -> PUSH observé dans l'ancien modèle n'est donc plus causé
par l'effondrement progressif d'une baseline stock/gate18 : les deux états sont
lus avec le même motif structurel dès le départ.

### `C4-950F5E32` et `C4-3E9BBB89`

Ces deux hashes correspondent à des pages de songs (`buy-stop:daisuki` et
`carry-page:none`), pas à une décision terminale de technique. La migration
P-T4 ne les réécrit donc pas directement. Ils restent utiles pour valider que
le song-policy/carryover P3b2 n'a pas été contaminé par le nouveau terminal.

## 23. Replay corpus P0 : classification des diffs

Le diff byte/field-level du corpus P0 n'est volontairement plus vide, puisque
les diagnostics scalaires historiques sont remplacés par des diagnostics par
couches. Deux cas `accepted` présentent des diffs internes :

- `P0_C1_TERMINAL_FRIENDSHIP` ;
- `P0_C4_FILLER_STOP`.

Le comportement golden demandé par leurs preuves reste cependant intact :

```text
P0_C1_TERMINAL_FRIENDSHIP
  candidate visual-10 : expose-and-carry -> expose-and-carry

P0_C4_FILLER_STOP
  candidate dance : stop-now -> stop-now
```

Sur C1, une option secondaire (`vocal-10`) devient `STOP` avec PUSH
co-recommandé `resource-tradeoff`; les options Visual qui donnent réellement
accès à la Friendship restent PUSH. Sur C4 filler, le STOP historique reste
STOP mais son explication passe de la calibration/scalar à un trade-off explicite.

Conclusion : le replay diff doit être traité comme un changelog de sémantique
interne pour ce lot, tandis que les assertions comportementales des fixtures
acceptées restent les garde-fous de non-régression.
