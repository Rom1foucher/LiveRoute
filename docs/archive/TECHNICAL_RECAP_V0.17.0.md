# GrandLiveCarryoverPlanner — récapitulatif technique v0.17.0

**Date : 3 août 2026**
**Base : v0.16.0**

## 1. Objectif de la version

La v0.16.0 avait durci le solveur et nettoyé la pipeline snapshot. La v0.17.0
porte l’effort sur l’utilisation en live et l’observabilité :

- empêcher qu’un choix immédiatement destructeur ressemble à une simple
  alternative ;
- distinguer clairement la recommandation, une alternative réellement sûre et
  un second choix ;
- expliquer le chemin projeté directement dans l’overlay ;
- permettre un push volontaire quand l’utilisateur veut ignorer une politique
  HOLD/STOP, sans contourner les contraintes du moteur ;
- améliorer les lectures OCR de `9` et réduire les appels Tesseract ;
- produire un journal exploitable pour reconstruire une incohérence à partir de
  l’état exact, de la recommandation et du choix réellement effectué.

## 2. Choix bloquants

### 2.1 Sémantique retenue

Le rouge n’est pas un synonyme de « moins bon » ou « plus risqué ».
`hard-blocking` exige une preuve déterministe ou une transition exacte :

1. le coût n’est pas finançable ;
2. une technique rend **toutes** les cibles actives actuellement finançables
   inachetables avant la prochaine sélection ;
3. une politique ferme la porte finale `18 ∧ GS` ;
4. un checkpoint 16/18 devient exactement impossible.

Une baisse de 96 % à 72 %, une réserve moins confortable ou une action
simplement sous-optimale ne sont jamais rouges.

### 2.2 Intégration dans le vrai classement

La fonction `immediateBlockingTargets()` est utilisée par :

- `rankObservedTechniques()` pour classer un choix non bloquant avant un
  bloqueur, même si celui-ci affiche de meilleures probabilités brutes ;
- `assessTechniqueChoices()` pour produire la preuve affichée et journalisée.

L’ordre reste : financement, blocage immédiat, seuil de risque, couverture
vectorielle, objectif, continuation, réserves et coût.

Si tous les choix bloquent, le solveur conserve le meilleur d’entre eux, mais
l’interface l’étiquette **« moins mauvais choix · BLOQUANT »** et ne le repeint
jamais en vert.

## 3. Recommandation, alternative et second choix

La couche UI exploite quatre états :

- `recommended` : décision principale ;
- `safe-alternative` : même classe de contrainte et de risque, sans perte
  structurelle majeure ;
- `secondary` : jouable mais sensiblement inférieur ;
- `hard-blocking` : preuve immédiate décrite ci-dessus.

Cette qualification est produite une seule fois dans le solver/diagnostic et
réutilisée dans l’interface principale, le panneau OCR, l’overlay et le journal.
L’UI ne reconstitue pas une sécurité à partir d’une couleur ou d’un écart de
score.

## 4. Overlay explicatif

Le payload de l’overlay contient désormais :

- un titre d’action ;
- un résumé ;
- jusqu’à trois étapes de chemin ;
- un avertissement ;
- l’état d’override ;
- les rectangles principal, alternatif, secondaire ou bloquant.

Exemples de chemin : nombre de techniques restantes, probabilité d’atteindre la
page, probabilité de financer la cible, action acheter/arrêter/continuer/carry,
états des checkpoints 16 et 18.

Un rectangle bloquant a priorité visuelle sur le rectangle principal. Il ne
peut donc pas recevoir simultanément une bordure rouge et une bordure verte.

## 5. Push forcé / override

Le mode override est une préférence utilisateur, pas une nouvelle politique :

- la recommandation normale est toujours calculée et journalisée ;
- si elle recommande HOLD/STOP, l’application recherche le meilleur push ou
  `buy-continue` encore non bloquant ;
- le classement de l’override utilise le même vecteur lexicographique ;
- l’override ne peut pas franchir un coût impossible, fermer la porte finale,
  rendre 16/18 impossible ou utiliser des données OCR incomplètes ;
- il se réinitialise au passage au concert suivant.

L’overlay et les boutons utilisent un ton distinct afin de ne pas confondre
l’override avec le conseil normal.

## 6. Journal de décision

### 6.1 Format

Chaque ligne de `decision-log.ndjson` est une entrée JSON autonome, versionnée.
Les événements sont :

- `snapshot` : lecture OCR brute, confiance, warnings et timings ;
- `recommendation` : état d’entrée, candidats, classement normal et affiché ;
- `choice` : technique, song, concert ou activation/désactivation de l’override ;
- `pipeline` est réservé aux mesures autonomes futures.

L’état contient : concert, cycle, progression du pattern, songs de section et
totales, mode temporel, cinq tokens, page/carry visibles, mode solver, profils
de risque/génération, objectif, plan actif et signature d’état.

Chaque candidat peut contenir : coût vectoriel, probabilités reach/objectif,
action, qualification de sécurité, preuve de blocage et vecteur de décision.
Le choix utilisateur référence l’identifiant de la recommandation précédente.

### 6.2 Persistance

- Desktop : dossier de logs Tauri, fichier `decision-log.ndjson`.
- Rotation : au-delà de 8 Mo, l’ancien fichier devient
  `decision-log.previous.ndjson`.
- Export : concatène le fichier précédent puis le fichier courant.
- Écritures : sérialisées dans une file Promise pour conserver l’ordre des
  événements malgré les appels asynchrones Tauri.
- Navigateur : les 500 dernières entrées restent dans `localStorage`.

Le journal est exportable et effaçable depuis les paramètres OCR. Il ne
participe jamais au calcul de la recommandation.

## 7. OCR des `9` et pipeline

### 7.1 Reconnaissance

Les champs numériques normalisent `g/G/q/Q` en `9`. Les crops de tokens sont
élargis et davantage agrandis afin de préserver la boucle et la queue du
glyphe.

Les reprises ne sont plus exécutées token par token. Tous les compteurs
incertains ou à un chiffre sont regroupés dans :

1. un atlas Otsu ;
2. un atlas niveaux de gris.

Un atlas supplémentaire peut être utilisé pour les coûts de techniques
incohérents. Le pire cas courant passe ainsi d’environ douze appels Tesseract
séquentiels à un OCR principal plus deux retries numériques groupés, et au plus
un retry technique.

### 7.2 Timings

Le panneau et le journal séparent :

- capture Windows ;
- décodage ;
- OCR principal ;
- retries OCR ;
- solver ;
- total.

Le worker Tesseract est préchauffé à l’ouverture du panneau. Son initialisation
WASM explique encore la lenteur du premier snapshot ; les suivants doivent
principalement refléter les temps OCR mesurés.

## 8. Validation

Tests ajoutés ou étendus :

- une technique qui détruit déterministement la cible est rouge ;
- une option légèrement inférieure reste non bloquante si la cible demeure
  finançable ;
- le vrai classement place un choix sûr avant un bloqueur affichant pourtant de
  meilleures probabilités ;
- les confusions OCR `g/q` sont converties en `9` dans les champs numériques ;
- HOLD conserve `buy-continue` comme override éligible sans le rendre valide en
  politique normale.

Résultat : **103/103 tests Node réussis**. Le noyau TypeScript passe le contrôle
strict des symboles inutilisés ; toute la source TS/TSX passe l’analyse
syntaxique.

Le build Vite/Tauri complet n’a pas été reproduit dans l’environnement de
travail, faute du jeu complet de dépendances npm et de Cargo. Les commandes
Tauri de log ont été vérifiées statiquement et restent couvertes par la CI
Windows du projet.

## 9. Fichiers principaux

| Fichier                                 | Rôle                                            |
| --------------------------------------- | ----------------------------------------------- |
| `src/diagnostics/decision-safety.ts`    | qualification et preuves de blocage             |
| `src/diagnostics/decision-log.ts`       | schéma NDJSON, file d’écriture, export/clear    |
| `src/solver/technique-dp.ts`            | blocage immédiat intégré au classement réel     |
| `src/solver/song-policy.ts`             | éligibilité de `buy-continue` pour override     |
| `src/App.tsx`                           | sélection normale/override, logs et diagnostics |
| `src/vision/recognizer.ts`              | retries numériques groupés et timings OCR       |
| `src/vision/token-candidates.ts`        | correction numérique des `9`                    |
| `src/vision/SnapshotCompanionPanel.tsx` | UI, timings, log et confirmations               |
| `src/vision/OverlayView.tsx`            | chemin et états visuels                         |
| `src-tauri/src/lib.rs`                  | fichier NDJSON, rotation, lecture et purge      |

## 10. Conclusion

La version ne cherche pas seulement à donner un meilleur choix. Elle rend la
décision inspectable : ce qui est recommandé, ce qui reste une vraie
alternative, ce qui est immédiatement destructeur, ce que l’utilisateur a
forcé et ce qu’il a finalement acheté sont conservés dans une même chaîne de
preuve.
