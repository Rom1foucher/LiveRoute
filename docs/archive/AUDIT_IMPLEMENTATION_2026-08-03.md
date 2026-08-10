# GrandLiveCarryoverPlanner — traitement de l’audit v0.15.0

**Version produite : v0.16.0**
**Date : 3 août 2026**

## 1. Méthode de décision

Chaque recommandation de l’audit a été classée avant modification :

1. **bug fonctionnel** : peut modifier une recommandation ou afficher une
   certitude fausse ; correction obligatoire ;
2. **dette technique réelle** : n’altère pas directement le choix mais laisse
   une branche fantôme, une configuration trompeuse ou un risque d’intégration ;
   nettoyage lorsqu’il est borné ;
3. **comportement volontaire** : conséquence explicite du contrat
   algorithmique ; conservé et documenté ;
4. **refactor structurel risqué** : pertinent, mais sans défaut fonctionnel
   isolé ; reporté pour ne pas mélanger une migration massive avec les
   corrections du solveur.

## 2. Anomalies algorithmiques corrigées

### A1 — Transition HUNT → HOLD dans la valeur inter-section

**Verdict : bug réel, corrigé.**

La projection de la section suivante était dérivée comme si elle se trouvait
immédiatement à son échéance. Elle pouvait donc acheter SP +2/+3 puis continuer
à payer des chaînes cachées pour des Specialty ou Friendship, alors que le plan
annonçait explicitement « cible acquise, puis HOLD ».

La v0.16.0 :

- ouvre la nouvelle section avec `timingMode: section-open` ;
- redérive le plan après chaque achat susceptible de satisfaire la cible ;
- transforme immédiatement HUNT en HOLD après SP +2 ou SP +3 ;
- interdit `optionalStructuralWork` sous HOLD ;
- ne permet jamais à une opportunité `visibleOptionalTargets` de financer une
  page qui n’est pas encore visible.

Régressions ajoutées : C2 SP +2, C3 SP +3, Friendship cachée après la cible.

### A2 — Capacité tronquée interprétée comme impossibilité exacte

**Verdict : bug réel, corrigé.**

`maximumAffordablePurchases()` renvoie désormais son couple
`{ count, exact }` jusqu’à l’interface de statut :

- si le minorant tronqué suffit, la faisabilité reste démontrée ;
- s’il ne suffit pas, le statut devient `indeterminate / heuristic` ;
- `impossible / verified` n’est possible qu’après une recherche exacte en mode
  terminal.

Le libellé `finançable hors techniques` reste volontairement une borne fondée
sur les coûts de songs. Il n’est pas transformé en probabilité absolue de fin
de run.

### A3 — Songs achetées encore protégées dans les réserves

**Verdict : bug réel, corrigé.**

Le kernel distingue maintenant :

- les réserves appartenant à la pool courante ;
- les réserves externes de sections futures.

Après chaque achat, les réserves courantes sont filtrées par les identifiants
encore présents. Une SP ou Friendship consommée ne peut donc plus influencer le
choix de techniques des pages suivantes.

### A4 — Dépendance à l’ordre du catalogue

**Verdict : bug réel, corrigé.**

Les pools sont canonisées par identifiant avant :

- l’énumération des combinaisons ;
- l’échantillonnage déterministe au-delà de 160 pages ;
- le calcul des seeds ;
- le tirage Monte-Carlo.

Une régression couvre explicitement le régime approché, et non uniquement les
petites pools énumérées exactement.

## 3. Interface et OCR

### A5 — Run Pulse et itinéraire fixe

**Verdict : incohérence réelle, corrigée.**

Run Pulse ne pilotait pas le solveur principal, mais sa composante de rythme
`[5, 9, 12, 15, 18]` pénalisait visuellement des routes valides comme
`4 / 2 / 3 / 7`. Cette composante a été supprimée. Run Pulse reste un indicateur
beta descriptif fondé sur les observations et la luck, pas un second planificateur.

### A6 — Captures OCR concurrentes

**Verdict : bug réel, corrigé.**

Un gate de capture :

- refuse une seconde hotkey pendant une capture active ;
- attribue un numéro de génération ;
- ignore tout résultat devenu obsolète ;
- invalide la génération lors d’un changement de contexte ou du démontage ;
- sérialise aussi les imports de captures.

L’initialisation rejetée du worker Tesseract remet désormais son cache à `null`,
ce qui permet une tentative ultérieure sans recharger l’application.
`terminateOcr()` est raccordé au cycle de vie du panneau.

## 4. Ancienne automatisation retirée

**Verdict : dette technique réelle, nettoyée.**

Le produit est un snapshot manuel. Les branches automatiques de détection de
page normale, date, concert, progression et achats n’étaient plus atteignables
depuis l’interface.

Le profil passe à `schemaVersion: 3` et ne conserve que :

- hotkey et fenêtre cible ;
- OCR et seuils ;
- overlay ;
- zones des cinq tokens ;
- trois cartes de techniques ;
- trois cartes de songs ;
- alias et hashes de pochettes.

Les anciens profils restent importables : le normaliseur récupère les champs
snapshot utiles et ignore les options supprimées. `screen.ts` et ses tests
isolés ont été retirés.

## 5. Nettoyage et cohérence

Ont également été corrigés :

- ancien doublon des types `SongPolicy*` dans `live-model.ts` ;
- helpers de rôles, fingerprints et paramètres sans appel ;
- invariants de session : `active ⊆ owned`, visible/carry non possédés,
  unicité et maximum trois offres ;
- catalogue des 21 songs extrait d’`App.tsx` ;
- test de cohérence `unlockPhase ↔ RuleSet` ;
- source TypeScript canonique du profil et test d’identité avec le JSON public ;
- CI sur pull request et sur modifications de tests/documentation ;
- `noUnusedLocals` et `noUnusedParameters` activés.

## 6. Recommandations volontairement non transformées en bugs

Les décisions suivantes sont conservées :

- **aucun itinéraire fixe** `4/3/3/5/2` ;
- Great Success C2/C3 reste une récompense souple, pas une contrainte dure ;
- la projection inter-section reste `stock garanti` et n’invente aucun revenu
  d’entraînement ;
- aucune prime de proximité du cap sans futur gain réellement modélisé ;
- les tiers sont ordinaux et la comparaison reste lexicographique ;
- `finançable hors techniques` est un diagnostic de portefeuille, pas une
  promesse de fermeture ;
- la loi de page uniforme reste explicitement `heuristic` tant qu’aucune loi
  mesurée ne la remplace.

Ces points ne sont pas des omissions : ils appartiennent au contrat du solveur.

## 7. Travaux structurels reportés

Trois recommandations restent pertinentes mais ne sont pas incluses dans cette
release :

1. découper davantage `App.tsx`, `SnapshotCompanionPanel.tsx` et
   `live-model.ts` ;
2. déplacer toutes les primitives de domaine dans un module neutre afin de
   supprimer les cycles de types conceptuels ;
3. livrer un `Cargo.lock` et reproduire le build Rust/NSIS dans l’environnement
   de release Windows.

Elles ne correspondent pas à une recommandation fausse, mais leur réalisation
mélangée aux corrections algorithmiques augmenterait fortement le risque de
régression. Le `Cargo.lock` ne doit pas être fabriqué sans toolchain Cargo.

L’OCR de bout en bout sur captures réelles reste également non certifié faute de
corpus anonymisé versionné. Les tests couvrent le parsing, les seuils, les zones,
la validation et la concurrence, pas la précision réelle de Tesseract sur toutes
les résolutions.

## 8. Validation

- 99 tests Node réussis ;
- tests dédiés aux six anomalies A1–A6 ;
- invariance à l’ordre testée dans le régime approché ;
- cohérence catalogue/RuleSet et profil TypeScript/JSON testée ;
- typage strict du noyau métier avec contrôle des symboles inutilisés ;
- analyse syntaxique de tout `src/` ;
- `git diff --check` sans erreur.

Le build Vite/Tauri complet n’a pas été reproduit dans l’environnement de cette
passe, faute de dépendances npm installables et de toolchain Rust. L’audit de la
v0.15.0 avait toutefois validé le build Vite de la base ; la CI Windows de la
v0.16.0 exécute désormais tests, frontend et NSIS sur chaque pull request.
