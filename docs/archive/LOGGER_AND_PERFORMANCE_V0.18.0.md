# v0.18.0 — journal durable et performance du solver

## Symptômes

Deux défauts indépendants ont été confirmés sur la v0.17.1 :

1. le logger était bien appelé et possédait un backend Rust, mais écrivait dans
   le dossier Tauri AppData sans créer le fichier lors de l’affichage du chemin ;
   toutes les erreurs d’append étaient ensuite absorbées côté TypeScript ;
2. le solveur dominait largement la pipeline, surtout sur les pages de songs,
   avec 5 à 10 secondes observées et environ 15 secondes sur une fixture C4 de
   profilage.

## Correction du journal

Le backend tente maintenant en premier :

```text
<dossier de l’exécutable>/logs/decision.ndjson
```

Il crée le dossier et le fichier dès le démarrage. Si le répertoire est protégé,
il bascule vers le dossier de logs Tauri dans AppData. Le panneau affiche le
chemin actif, le mode `portable/app-log`, la taille et toute erreur. Les boutons
permettent d’ouvrir le dossier, exporter ou vider le fichier.

Le schéma v2 est append-only : la recommandation et le choix utilisateur sont
deux événements liés. Il ajoute `sessionId`, `sequence`, `stateHash`,
`stateAfter`, `matchedRecommendation`, les raisons, candidats, vecteurs et
mesures internes. La rotation reste à 8 Mo.

## Profilage du solveur

Avant correction, les postes observés étaient :

- trois `runAnalysis()` indépendants sur les trois songs ;
- rollout multi-pages répété pour des choix déjà dominés ;
- ancienne DP song-only exécutée en plus du rollout tarifé ;
- calcul de capacité checkpoint allocation-heavy ;
- jusqu’à neuf évaluations inter-section à plusieurs centaines de trials ;
- aucune réutilisation d’un résultat strictement identique.

## Corrections de performance

- budgets adaptatifs bornés Express/Expert ;
- suppression du rollout caché lorsqu’une cible active est déjà visible ;
- suppression de la DP gratuite dans le chemin décisionnel actif ;
- capacity search par bitmask et arrêt dès que le seuil 16/18 est prouvé ;
- cross-section limitée aux politiques valides et à un budget de départage ;
- mémoïsation interne des pressions/couvertures de techniques ;
- cache LRU des 24 derniers états song-page ;
- breakdown visible et journalisé.

## Mesures de développement

Sur les mêmes fixtures Node :

| État                        |     Avant | v0.18.0 |
| --------------------------- | --------: | ------: |
| C4 section ouverte          |     ~15 s |  ~1,6 s |
| C4 échéance / transition GL |    ~7,8 s |  ~1,7 s |
| C3 cible SP visible         |    ~6,9 s |  ~1,2 s |
| C3 cible cachée             |      >6 s |  ~1,9 s |
| même état relancé           | même coût |   <1 ms |

Ces valeurs isolent le solver et dépendent du CPU. Elles servent de contrôle de
régression, pas de promesse de latence absolue.

## Validation

- 109 tests Node passent ;
- tests dédiés au hash stable, au lien recommendation→choice, aux budgets bornés,
  au short-circuit d’une cible visible et au cache ;
- benchmarks vérifiés sur les chemins C3/C4 ouverts et terminaux ;
- aucune modification de l’ordre lexicographique ou des décisions explicites
  HOLD/CLOSE/carry.
