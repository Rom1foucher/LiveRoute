# GrandLiveCarryoverPlanner — récapitulatif technique

**Version concernée : v0.15.0**
**État au : 3 août 2026**

> **Addendum v0.16.0** — ce document décrit la base v0.15.0. Les corrections
> issues de l’audit (HUNT→HOLD dans `V_next`, exactitude des capacités,
> réserves consommées, invariance d’ordre, OCR sérialisé et retrait des branches
> automatiques) sont documentées dans
> `docs/AUDIT_IMPLEMENTATION_2026-08-03.md`.

## 1. Objet de cette évolution

Le solveur savait déjà classer correctement une page locale de techniques ou
de songs. Les anomalies observées venaient surtout du regard vers l’avant :
des sous-modèles différents représentaient la même transition avec des coûts,
des priorités ou des horizons incompatibles.

Les symptômes principaux étaient :

- recommander un push puis l’abandonner juste avant la page de songs ;
- placer une Friendship +10 % derrière un filler à cause d’un faible avantage
  probabiliste de continuation ;
- préférer une technique sur une couleur tendue pour économiser un token brut,
  alors qu’une couleur en fort surplus pouvait être dépensée sans détruire de
  branche utile ;
- continuer à pousser C2/C3 après acquisition de SP +2/+3, principalement pour
  Great Success ou pour une Friendship encore cachée ;
- évaluer une future page avec le solde antérieur aux techniques nécessaires
  pour l’ouvrir ;
- ne pas valoriser correctement l’économie C3→C4 et le carry dans l’état réel
  de la section suivante.

La v0.15.0 termine la première refonte de fond : le solveur possède désormais
un kernel transitionnel partagé et une valeur inter-section réelle.

## 2. Contrat mécanique retenu

Les règles suivantes sont centralisées dans
`src/domain/live-rules.ts`, RuleSet `global-grand-live-2026-08-r2` :

- pools cumulées : `8 / 11 / 15 / 21 / 21` ;
- patterns C2–C4 : préfixe `2-2-2`, puis boucle `4-5-2-2` ;
- pattern Grand Live : préfixe `2-2-2`, puis boucle `4-3-2-2` ;
- Make Debut! compte automatiquement en C1 ; GIRLS' LEGEND U compte dans la
  jauge du Grand Live ;
- checkpoints : 16 au quatrième concert, 18 au Grand Live ;
- porte finale : `18 songs ∧ Great Success du Grand Live` ;
- cap initial 200, puis `+50` après chaque Promotional Live C1–C4 ;
- événement **New Supporters!** : après le relèvement du cap, `+10` sur chacun
  des cinq soldes, avec clamp sur le nouveau cap ;
- aucune transition de lesson après le Grand Live.

### Validation du `+50/+10`

Deux captures Global de l’événement `New Supporters!` affichent explicitement :

```text
Dance/Vocals/Passion/Visuals/Composure cap went up by 50
Dance/Vocals/Passion/Visuals/Composure went up by 10
```

L’observation a été faite avec Christmas Oguri Cap, qui n’est pas une trainee
scenario-link. Dans la run documentée, C2 a été terminé avec deux songs
manuelles et sans Great Success, tout en recevant la même injection. Le crédit
n’est donc pas conditionné au Great Success ni au statut scenario-link observé.

Le code applique la transition dans l’ordre présenté par l’événement : nouveau
cap, puis crédit `+10` sous ce cap.

## 3. Politique stratégique retenue

## 3.1 Trois notions qui ne doivent plus être fusionnées

Une song structurelle peut être :

- `chaseTargets` : cible cachée dont l’absence justifie l’ouverture de pages ;
- `visibleOptionalTargets` : bonne opportunité achetable uniquement si elle est
  déjà visible ;
- `reserveTargets` : coût futur que le choix de techniques doit protéger.

Une Friendship peut donc être une réserve importante pour C4 sans être une
raison de la chasser en C2/C3.

## 3.2 Invariant HOLD

Après acquisition de SP +2 en C2 ou SP +3 en C3 :

- le plan passe à `HOLD` ;
- aucune nouvelle chaîne de techniques n’est initiée en milieu de section ;
- Great Success C2/C3 incomplet ne devient pas un objectif `any-song` ;
- une Friendship ou une ancienne SP déjà visible peut produire
  `BUY_AND_STOP` ;
- un filler visible produit normalement `WAIT_RESERVE` ;
- `BUY_AND_CONTINUE` est invalide en `HOLD`.

Une progression déjà acquise dans le pattern ne se perd qu’au concert. Elle ne
crée donc aucune urgence en milieu de section. Le solveur ignore les dépenses
passées et ne termine une chaîne à l’échéance que si les techniques restantes
sont prospectivement rentables.

## 3.3 Great Success intermédiaire

Great Success C2/C3 reste une récompense, mais pas une contrainte dure. Le gain
marginal documenté est inférieur à la valeur que peut produire un transfert de
budget vers les Friendship de C4. Il peut servir de départage ou justifier une
conversion déjà peu coûteuse ; il ne déclenche pas seul une nouvelle chasse.

La porte dure reste exclusivement `18 ∧ GS` au Grand Live.

## 3.4 Aucun itinéraire fixe

Le solveur ne code ni `4/3/3/5/2`, ni un soft cap de trois songs en C2/C3.
Cette trajectoire est un repère, pas une loi. La DP doit choisir où acheter la
song de marge selon :

- les coûts des techniques de la section ;
- le pattern courant ;
- les songs réellement disponibles ;
- la valeur du thinning ;
- les checkpoints 16/18 ;
- le carry ;
- la qualité des bonus achetés.

Cette décision évite de reporter artificiellement tout le volume vers la
cinquième song très chère de C4.

## 4. Architecture décisionnelle

## 4.1 Comparaison lexicographique

Les actions ne sont pas réduites à un score commun. L’ordre est :

1. état de faisabilité de la contrainte dure ;
2. admissibilité au seuil de risque ;
3. rôle structurel de la song ;
4. continuation de la pool et du stock ;
5. réserves par couleur et coût marginal ;
6. identifiant stable.

Une contrainte dure est classée comme `impossible`, `encore faisable` ou
`sécurisée`. Une différence Monte-Carlo minuscule ne peut plus faire passer un
filler devant une Friendship lorsque les deux actions conservent le checkpoint
au même niveau de risque.

Les tiers sont ordinaux entre catégories. Plusieurs Specialty ne peuvent pas
s’additionner pour dépasser une Friendship. À l’intérieur de la famille
Friendship, `+5 %` et `+10 %` restent des valeurs quantitatives réelles dans la
continuation.

## 4.2 Départage des techniques

Après égalité de faisabilité et de couverture :

1. éviter de casser une réserve encore utile ;
2. minimiser le déficit sous les vecteurs nécessaires ;
3. conserver les marges après achat ;
4. dépenser une couleur en surplus réel avant une couleur tendue ;
5. seulement ensuite conserver le plus grand total brut.

Le comparateur `compareTechniqueSpending()` est branché sur le chemin réel
`rankObservedTechniques()` ainsi que sur les offres futures simulées.

Cas de régression :

```text
Tokens : 242 / 64 / 78 / 65 / 98
Offres : Visual 16 / Mental 15 / Dance 16
Attendu : Dance 16
```

Mental ne gagne plus pour la seule économie d’un token si Dance conserve toutes
les branches importantes avec un surplus nettement supérieur.

La proximité du cap n’est pas une prime autonome. Elle n’a de valeur que si un
futur gain est réellement modélisé.

## 4.3 Kernel de transition partagé

`src/solver/song-transition.ts` simule désormais une trajectoire complète :

```text
N techniques adaptatives
→ solde réel
→ tirage de la page
→ sélection et achat d’une song
→ pool restante
→ cycle suivant
```

Chaque trial renvoie notamment :

- checkpoint atteint ou non ;
- cible acquise ;
- solde vectoriel terminal ;
- pool restante ;
- coût engagé ;
- nombre de songs structurelles ;
- nombre et pourcentage de Friendship achetées ;
- acquisition d’au moins une Friendship +10 %.

Ce même kernel alimente la prochaine page, les projections multi-pages et la
valeur inter-section. Une cible n’est donc plus testée avec les tokens qui
seront ensuite dépensés pour l’atteindre.

## 4.4 Valeur inter-section

La nouvelle fonction `evaluateCrossSectionReadiness()` implémente :

```text
V_next(T_live(s))
```

Elle enchaîne, trial par trial :

1. la continuation terminale éventuelle de la section courante ;
2. le vrai solde restant ;
3. la transition vérifiée `cap +50`, puis `+10` ;
4. l’achat éventuel d’une song portée ;
5. l’ouverture de la nouvelle pool ;
6. la dérivation du plan suivant ;
7. les cycles de techniques et pages de la nouvelle section ;
8. le checkpoint, les cibles, la Friendship et le stock terminaux.

Les deux Friendship C4 `42 Dance / 26 Visual` et
`26 Dance / 42 Visual` restent des vecteurs croisés complets. Elles ne sont pas
résumées par un proxy scalaire `68/68` ou un score maison de readiness.

### Portée actuelle

La v0.15.0 calcule la branche :

```text
verified-live-transition-no-training-income
```

Elle utilise le stock courant et le `+10` vérifié, sans inventer de futurs gains
d’entraînement. L’interface l’affiche comme **section suivante — stock garanti**.

Cette restriction est volontaire. Les variantes de supply normale ou favorable
ne seront ajoutées qu’avec un modèle absolu calibré par tour. Une heuristique de
supply ne doit pas être présentée comme une probabilité de fin de run.

## 4.5 Carry

Le carry est évalué dans le même état futur :

- l’achat de la song portée se produit après le `+10` ;
- elle est retirée de la pool ;
- elle compte dans la jauge suivante ;
- elle remplit un point du nouveau pattern ;
- son retard d’activation est conservé dans son rôle ;
- les tarifs hérités sont appliqués correctement ;
- aucun carry n’existe après le Grand Live.

Sa valeur provient du futur obtenu, jamais d’un coût déjà payé. Une Friendship
activable immédiatement peut être mauvaise à porter ; un filler ou une song de
volume peut être un bon pont vers la section suivante.

## 5. Validation empirique

## 5.1 Run de calibration

La run fournie suit :

```text
C1 : 4 songs manuelles
C2 : 2 — SP +2, une autre song, puis carry ; Great Success sacrifié
C3 : 3 — achat du carry, SP +3, une autre song, puis nouveau carry
C4 : 7 songs
```

Avant le quatrième concert :

```text
4 + 2 + 3 + 7 = 16 manuelles
+ Make Debut! = 17 total
```

Le screenshot `Concert Info` confirme `Total Songs Learned 17`.

Le bonus Friendship passe de `+15 %` à `+45 %` au quatrième concert, soit
`+30 %` activés sur ce set list de sept songs. Les pochettes visibles sont
compatibles avec :

- deux Friendship +10 % ;
- deux Friendship +5 % ;
- deux Specialty ;
- une Chain.

Cette capture ne supporte pas l’attribution de trois Friendship +5 % au seul C4,
car cela produirait cinq Friendship et huit songs avec les autres bonus. Le
`+15 %` antérieur explique la confusion. GIRLS' LEGEND U ajoute ensuite
`+10 %`, pour `+55 %` sur les derniers tours et l’URA.

## 5.2 Conclusions permises

Cette run démontre la faisabilité et l’intérêt potentiel des décisions
suivantes :

- sacrifier Great Success C2 après SP +2 peut être extrêmement rentable ;
- les économies peuvent être converties en plusieurs Friendship C4 à effet
  durable ;
- les carryovers successifs peuvent améliorer la transition ;
- une route non conventionnelle `4/2/3/7` peut être en avance sur la porte 18 ;
- aucune route fixe ne doit être imposée.

Elle ne démontre pas que `4/2/3/7` est universellement optimal. Elle sert de cas
de calibration et de test de non-régression contre une politique qui pousserait
systématiquement C2/C3.

## 5.3 Validation automatisée

La v0.15.0 ajoute des tests dédiés à :

- l’application déterministe de `+50/+10` ;
- la valeur inter-section avec coûts croisés complets ;
- l’absence de futur revenu d’entraînement inventé ;
- la valeur du carry par le point de pattern futur ;
- le checkpoint et la Friendship attendue dans la nouvelle section.

État de validation :

- `89/89` tests Node réussis ;
- typage TypeScript strict du noyau métier réussi ;
- analyse syntaxique TSX des composants modifiés réussie ;
- patch v0.14.0 → v0.15.0 vérifié sur une source propre.

Le build Vite/Tauri complet n’a pas été reproduit dans l’environnement de
travail faute d’installation complète des dépendances frontend. Cette limite ne
concerne pas les tests du solver ni le typage du noyau.

## 6. Cartographie des fichiers

| Fichier                                 | Responsabilité                                       |
| --------------------------------------- | ---------------------------------------------------- |
| `src/domain/live-rules.ts`              | RuleSet, caps, `+10`, checkpoints et patterns        |
| `src/planner/strategic-plan.ts`         | Plans et séparation chase/visible/reserve            |
| `src/live-model.ts`                     | Simulation de techniques et départage des dépenses   |
| `src/solver/technique-dp.ts`            | Classement réel des techniques observées             |
| `src/solver/song-transition.ts`         | Kernel trial par trial techniques/pages/songs        |
| `src/solver/cross-section.ts`           | `V_next(T_live(s))` et valeur de la section suivante |
| `src/solver/song-policy.ts`             | Politiques buy/stop/continue/carry/wait et vecteurs  |
| `src/solver/carry.ts`                   | Faisabilité locale et explications du carry          |
| `src/App.tsx`                           | Diagnostic et métriques de readiness                 |
| `src/vision/SnapshotCompanionPanel.tsx` | Flux OCR et contrôles de progression                 |
| `tests/cross-section.test.ts`           | Régressions inter-section                            |

## 7. Limites et prochaines étapes

1. **Supply future** : calibrer un modèle par tour avant d’ajouter les branches
   normale/favorable à `V_next`.
2. **Dynamique des couleurs** : mesurer Light Hello, second token de rainbow et
   ciblage de l’argmin avant de modifier les ratios de génération.
3. **Loi de page** : la loi par défaut reste uniforme/heuristique ; elle peut
   être remplacée par une loi mesurée sans changer l’architecture.
4. **Corpus de runs** : enregistrer les états C2/C3/C4, les pushes après SP,
   les stocks au début de C4 et le résultat final 18/GS.
5. **Build desktop** : refaire le build Tauri complet dans un environnement npm
   disposant de toutes les dépendances.

## 8. Conclusion

La correction centrale n’est pas une nouvelle heuristique « économiser C2/C3 ».
Le solveur distingue maintenant :

- ce qu’il faut activement chasser ;
- ce qui mérite d’être acheté seulement s’il est déjà visible ;
- ce qu’il faut protéger pour la section suivante ;
- et la valeur exacte de la transition vers cette section.

La politique peut donc sacrifier une récompense intermédiaire faible lorsque la
continuation montre une conversion supérieure en C4, sans imposer une route
fixe ni inventer de supply. Le `+10` post-live est désormais une mécanique
vérifiée et intégrée au même kernel que les coûts de techniques, les pages de
songs et le carry.
