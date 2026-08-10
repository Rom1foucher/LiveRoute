# Archive · migration vers le monorepo (v0.25)

> Document historique. La migration est terminée et ne décrit plus l’état
> courant de la V1. Voir `README.md` et `docs/ARCHITECTURE.md`.

Deux branches avaient divergé depuis un ancêtre commun :

| Branche      | Version        | Apport                                         |
| ------------ | -------------- | ---------------------------------------------- |
| Snapshot OCR | `0.24.0`       | 15 versions de moteur, pipeline vision, Tauri  |
| Web          | `0.22.9-web.1` | refonte UI, i18n fr/en, thèmes, tests de garde |

Le web est un fork unidirectionnel du moteur OCR `v0.22.9` et n'a apporté aucune
amélioration algorithmique. Le moteur du monorepo est donc celui de l'OCR, et la
refonte de présentation du web est **réappliquée** dessus plutôt que fusionnée.

---

## Étape 0 · normalisation · **faite**

- `.prettierrc`, `.prettierignore`, `.editorconfig` à la racine, largeur 80.
  Sans ça, `song-transition.ts` affichait 117 lignes de diff entre les deux
  branches pour 39 différences réelles.
- `.gitignore` unifié : `apps/desktop/public/ocr/` (23 Mo, régénéré par
  `prepare:ocr`) et `src-tauri/target/` restent hors du dépôt.
- npm workspaces, `tsconfig.base.json` partagé, scripts agrégés à la racine.

## Étape 1 · `packages/core` · **faite**

- 21 modules moteur repris de la branche OCR `v0.24.0`, verbatim puis formatés.
- **Couplage rompu.** `diagnostics/decision-log.ts` importait
  `vision/desktop.ts`. Remplacé par deux ports, `DecisionSink` et
  `DecisionSession`, et un `configureDecisionLog({ appVersion, sink, session })`
  appelé par l'application. `APP_VERSION` n'est plus une constante du moteur.
- Les implémentations navigateur (localStorage borné à 500 entrées,
  sessionStorage, export NDJSON) vivent dans `src/adapters/browser.ts`, seule
  zone de `core` autorisée à toucher au DOM.
- 8 imports relatifs sans extension corrigés.
- **Correction d'un défaut préexistant** : `resolveStrategicObjective`
  déstructurait `totalSongs` sans l'utiliser, ce qui faisait échouer
  `tsc --noEmit` avec `noUnusedLocals` sur la branche OCR, donc aussi
  `npm run build`. Le champ reste dans le contrat, il n'est plus déstructuré.
- **Garde de non-régression** : `tests/core-purity.test.ts` échoue si un module
  du moteur référence `window`, `document`, `localStorage`, React, Tauri ou
  Tesseract, s'il importe un adaptateur, ou s'il utilise un import relatif sans
  extension. Les commentaires sont ignorés, seul le code est inspecté.

### Vérification

| Contrôle                                   | Résultat                        |
| ------------------------------------------ | ------------------------------- |
| Tests moteur de la branche OCR (référence) | 160 / 160                       |
| Tests `packages/core`                      | **163 / 163** (160 + 3 gardes)  |
| `tsc --noEmit` sur `src`                   | vert (rouge sur la branche OCR) |
| `prettier --check`                         | vert                            |

Un seul test a dû être modifié, `decision-log.test.ts` : il appelle désormais
`configureDecisionLog` avec le sink navigateur, et vérifie le statut retourné au
lieu du `null` que renvoyait l'absence de runtime desktop.

---

## Étape 2 · i18n réappliquée sur le moteur v0.24.0 · **faite**

Le moteur n'émet plus une seule phrase. Toute sortie destinée à l'écran est un
code de message rendu par la couche i18n.

### Modules transformés

| Module                           | Transformation                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `solver/supply-model.ts`         | champ `label` retiré, remplacé par le code `supply.status`                                                                            |
| `domain/live-rules.ts`           | `SongCheckpoint.label` retiré, remplacé par `checkpoint.name`                                                                         |
| `planner/strategic-plan.ts`      | `label` / `exitCondition` / `fallback` retirés du type ; trois fabriques `planLabelMessage`, `planExitMessage`, `planFallbackMessage` |
| `solver/carry.ts`                | repris tel quel de la branche web : la logique y était strictement identique, seul l'habillage différait                              |
| `solver/terminal-technique.ts`   | `meaningfulGain` et le verdict `EXPOSE_AND_CARRY` / `STOP_NOW` passés en messages composés                                            |
| `diagnostics/decision-safety.ts` | `BlockingProof` et le champ `advisory` de la v0.22.15 passés en `Message`                                                             |
| `solver/song-policy.ts`          | les cinq branches converties ; `missingTokens` renvoie `MissingToken[]`                                                               |
| `live-model.ts`                  | messages de réserve v0.24 convertis ; `TokenPressure.reserveReason` typé `Message`                                                    |

### Le catalogue

**78 codes**, couverts intégralement en français et en anglais.

Le chiffrage annoncé à l'étape 1 était faux : **9 codes neufs ont suffi, pas 27**.
L'estimation reposait sur une comparaison textuelle qui classait « nouveau » tout
texte simplement reformulé entre `v0.22.9` et `v0.24.0`, alors que le code
existait déjà. En sens inverse, **7 codes étaient devenus morts** et ont été
retirés : `blocking.blocksGate18.*`, `terminal.gainCheckpoint`,
`terminal.stopNowDegradesCheckpoint` (le 18 est sorti du scoring en `v0.23`),
`reason.finalGateOpen`, et les trois codes de réserve remplacés par l'échelle de
faisabilité `v0.24`.

### Deux défauts préexistants trouvés en chemin

Le test `i18n-catalogue` hérité annonçait en commentaire qu'ajouter un membre à
`Message` sans échantillon serait une erreur de compilation. **C'était faux** :
`SAMPLES` n'avait aucune annotation de type, et les tests n'étaient de toute
façon pas typechequés. `reserve.noNearbyTarget` n'a donc jamais été couvert.
`SAMPLES` est désormais annoté `Record<MessageCode, Message>` et `include`
couvre `tests`, ce qui rend la promesse réelle.

Ce typecheck élargi a révélé quatre fixtures de test invalides de longue date,
dont un `checkpoint18Status = "reachable-current-stock"` qui n'a jamais existé
dans `CheckpointStatus` : le test passait en assertant sur une valeur que le
moteur ne peut pas produire.

### Conversion des tests

40 sites d'assertion convertis selon une règle explicite : **le code** quand
l'assertion porte sur _quelle_ raison a été émise, **le rendu français** quand
elle porte sur une valeur interpolée (un nombre de tokens, un nom de song). Le
helper `tests/helpers/messages.ts` porte `codes`, `hasCode`, `fr` et `frAll`.

### Garde ajoutée

`tests/engine-has-no-prose.test.ts` échoue si un module hors `src/i18n/`
contient un littéral français, ou s'il importe la couche i18n autrement qu'en
`import type`. Elle a immédiatement attrapé un `songName: "Aucun achat"` :
`songName` est désormais `string | null`, l'UI rendant `policy.noPurchase`.

### Vérification

| Contrôle                                | Résultat      |
| --------------------------------------- | ------------- |
| Tests `packages/core`                   | **172 / 172** |
| `tsc --noEmit` sur `src` **et** `tests` | vert          |
| `prettier --check`                      | vert          |
| Codes déclarés / rendus fr / rendus en  | 78 / 78 / 78  |

### Contrat exposé à `packages/ui`

- `reasons` et `huntAbandonReason` sont des `Message`
- `supplyLabel` et `SupplyAssessment.label` remplacés par `supply.status`
- `SongCheckpoint.label` remplacé par `checkpoint.name`
- `StrategicPlan` n'a plus ni `label`, ni `exitCondition`, ni `fallback`
- `AnalysisResult.planLabel` / `exitCondition` / `fallback` typés `Message`
- `SongPolicyEvaluation.songName` est `string | null`

## Étape 3 · `packages/ui` · **faite**

### Contenu

- 11 composants, `constants.tsx`, `view-model.ts`, `styles.css` (6 thèmes),
  `LanguageContext.tsx` et les catalogues `ui-fr` / `ui-en`.
- **La coquille `App.tsx` vit ici**, pas dans les applications (correction §7 bis
  de `ARCHITECTURE.md`). Elle prend `appVersion`, `surfaceName`,
  `onExportDecisionLog` et `slots` en props : aucune identité applicative.
- `slots.tsx` câblé aux quatre points d'extension : `topBarActions`,
  `workflowActions`, `decisionAside`, `overlay`.
- `AppFooter` agnostique : plus de `APP_VERSION` importé du moteur, plus de
  `exportDecisionLog` couplé au desktop.

### Delta OCR porté

- **Transition de concert unique (`v0.22.16`).** `advanceConcert` ne prend plus
  de paramètre `withCarryover` : la page ouverte au moment du concert est celle
  qui est portée. Une page de songs conserve toutes les songs visibles, avec une
  song retenue comme ancre de projection ; une page de techniques conserve la
  période et les prix avec lesquels elle a été générée, jusqu'au premier achat.
  Le second bouton est supprimé : il ne pouvait que proposer de jeter une
  information que le jeu ne jette pas.
- **Carryover de page de techniques.** État `techniqueOfferPeriod` ajouté à la
  coquille, alimenté par `techniqueOfferPeriodAfterConcert` du moteur. Quand une
  page survit au concert, ses coûts et builders capturés ne sont plus effacés :
  seule l'analyse est invalidée.
- **Comptabilité de transition.** `loggedTrackedBalanceAfterConcert` remplace
  `loggedBalanceAfterConcert` : le crédit +10 n'est journalisé comme appliqué
  que si le suivi dynamique des dépenses est actif.
- **Avertissement non bloquant (`v0.22.15`).** Le « surcoût de progression »
  s'affiche pour une option plus chère à couleurs identiques. Il reste
  volontairement typé sur les seuls choix de technique, plutôt que d'élargir le
  type moteur pour la commodité de l'affichage.
- **Classes CSS** `carryover-chip`, `pulse-dot` et `choice-advisory-warning`
  reprises, avec leur point de rupture responsive.
- Libellés obsolètes retirés du catalogue : `carryThePage`, `carryTo`,
  `withoutCarryTo`, `passerSansCarryover`, `concertAvecCarryoverDeLa`,
  `concertSansCarryover`. Ils décrivaient le modèle à deux boutons.

### Trois corrections de fond

**Le journal de décision portait de la prose.** Son schéma déclarait
`reasons: string[]`, `blockingReason?: string`, `huntAbandonReason?: string`.
Un log rempli de phrases n'est ni diffable entre versions ni analysable, ce qui
annulait le bénéfice du passage aux codes. Ces champs sont des `Message` et le
schéma passe en **version 3**.

**Le widget de réserve branchait sur un mode disparu**, `plan.mode === "alternative"`
de la `v0.22.9`, quand la v0.24 produit `"none" | "single" | "frontier"` : la
branche « plusieurs vecteurs » ne pouvait jamais s'afficher.

**La transition passait un argument mort**, `hasActiveCarryover`, retiré par la
`v0.22.16`.

### Vérification

| Contrôle                             | Résultat      |
| ------------------------------------ | ------------- |
| Tests `packages/core`                | **172 / 172** |
| Tests `packages/ui`                  | **14 / 14**   |
| `tsc --noEmit` sur les deux packages | vert          |
| `prettier --check` sur le dépôt      | vert          |

## Étape 4 · `apps/web` et `apps/desktop` · **faite**

### `apps/web`

Une quarantaine de lignes en tout. `main.tsx` configure le journal sur le sink
navigateur, fournit l'export NDJSON et monte la coquille partagée avec
`surfaceName="Web"`. Aucun écran n'y est redéfini.

### `apps/desktop`

- `src/vision/` (23 fichiers), `src-tauri/`, `scripts/prepare-ocr-assets.mjs`
  et les 14 suites vision déplacés ici.
- Les imports du pipeline vision vers le moteur pointent désormais sur
  `@glcp/core` ; les imports internes ont tous une extension explicite.
- `src/adapters/tauri-decision-sink.ts` **compose** le fichier durable et le
  stockage navigateur au lieu de le remplacer. Chaque appel Tauri peut renvoyer
  `null`, qui signifie « pas de runtime desktop » et non une erreur : le mode
  `vite dev` en navigateur simple continue donc de journaliser.
- La fenêtre d'overlay de capture court-circuite la coquille, comme avant.

### Slots typés sur l'état de la coquille

Un slot ne peut pas être un simple `ReactNode` : le cockpit a besoin de lire la
run. `UiSlots` accepte donc aussi une fonction recevant un `SlotContext`, qui
expose **exactement les mêmes groupes que les composants partagés** (`actions`,
`diagnostics`, `display`, `run`, `settings`, `solver`). Un slot est un pair de
`DecisionColumn`, pas un observateur privilégié avec son canal privé vers l'état.

### Le cockpit OCR n'était pas encore branché à ce stade

`SnapshotCompanionPanel` demande treize props. Neuf sont dérivables du
`SlotContext`, quatre ne le sont pas : appliquer un snapshot capturé, confirmer
un achat de technique, confirmer un achat de song, et la ligne de base de
continuité des tokens. Ce sont des **mutations** que la coquille détient.

Les brancher demandait d'élargir `ActionsView` avec ces capacités, ce qui est un
vrai choix de conception : l'OCR automatise ce qu'un utilisateur fait à la main,
donc ces actions ont leur place dans le contrat public de la coquille. Laissé de
côté à cette étape plutôt que bâclé avec des props factices — **fait à l'étape 6**
ci-dessous, avec la richesse complète (métriques, chemin, candidats) restaurée
à l'étape 7.

### Assets

`public/assets/` dupliqué dans les deux applications, `vision-profile.json`
seulement dans le desktop. `public/ocr/` reste généré par `prepare:ocr` et
gitignoré, comme `src-tauri/target/`.

### CI

Trois workflows : `core` sans installation, `quality` (format, types, toutes les
suites), `web` (build Vite + artefact). Le build Windows est isolé dans
`build-windows.yml`, sur tag ou déclenchement manuel : il n'est pas sur le
chemin critique d'une contribution moteur.

### Vérification

| Contrôle                            | Résultat      |
| ----------------------------------- | ------------- |
| Tests `packages/core`               | **172 / 172** |
| Tests `packages/ui`                 | **14 / 14**   |
| Tests `apps/desktop` (vision)       | **60 / 60**   |
| `tsc --noEmit` sur les 4 workspaces | vert          |
| `prettier --check` sur le dépôt     | vert          |

Les 60 tests vision passent tous, y compris `vision-ocr-atlas` qui échouait sur
la branche d'origine faute de Tesseract installé.

## Étape 5 · finitions · **faite**

- `RELEASE_NOTES.md` fusionné : la lignée Snapshot OCR sert de tronc (28 versions,
  de `v0.17.0` à `v0.24.0`), la branche web y figure comme fork parallèle
  clairement marqué, et une entrée `v0.25.0` ouvre l'historique avec le détail de
  la fusion.
- Documentation de la branche OCR reprise, plus complète que celle de la web :
  `ALGORITHMIC_MODEL.md` (864 lignes contre 486), la spec de la réserve par
  échelle de faisabilité `v0.24`, `VISION_PROFILE.md`, `VALIDATION.md`. Les
  audits et récapitulatifs historiques sont regroupés dans `docs/archive/`.
- `README.md` réécrit : les deux surfaces, les deux règles d'architecture, le
  démarrage, et un index de toute la documentation.
- `CONTRIBUTING.md` ajouté. C'est le document qui répond à l'objectif initial :
  travailler sur une surface, sur le moteur, ou sur les deux, sans reformer la
  divergence. Il donne la règle de placement d'un changement, les trois scénarios
  de travail, les cinq gardes et ce qu'elles refusent, et la procédure d'ajout
  d'un message.
- `ARCHITECTURE.md` réaligné sur l'état livré : arborescence réelle, `SlotContext`
  tel qu'implémenté, scripts et workflows CI effectifs.
- `.prettierignore` complété des ressources binaires et de `src-tauri/`.

### Vérification finale

| Contrôle                            | Résultat      |
| ----------------------------------- | ------------- |
| Tests `packages/core`               | **172 / 172** |
| Tests `packages/ui`                 | **14 / 14**   |
| Tests `apps/desktop` (vision)       | **60 / 60**   |
| `tsc --noEmit` sur les 4 workspaces | vert          |
| `prettier --check` sur le dépôt     | vert          |

## Étape 6 · cockpit OCR branché · **faite**

### Ce que la coquille publie désormais

Le cockpit n'est pas un panneau : c'est une méthode de saisie alternative pour
toute la run. Il lui fallait donc des capacités que `SlotContext` n'exposait pas.
Plutôt que d'ouvrir un canal privé vers l'état, elles ont rejoint le vocabulaire
commun.

`ActionsView` gagne :

| Membre                        | Rôle                                                     |
| ----------------------------- | -------------------------------------------------------- |
| `applyExternalState(intake)`  | remplace la saisie manuelle par un état capturé ailleurs |
| `undoLastAction()`            | annule la dernière action de run                         |
| `setPipelineTimings(timings)` | mesures du dernier pipeline de capture                   |

`buySong` et `recordTechniquePurchase` renvoient maintenant un booléen : le
cockpit doit savoir si l'achat a réellement été appliqué.

`RunView` gagne `techniqueOfferPeriod` et `canUndo` ; `DiagnosticsView` gagne
`pipelineTimings`, `decisionLogStatus`, `decisionLogError` et leurs setters.

### La frontière tient

`ExternalStateIntake` est exprimé **dans le vocabulaire de la coquille**, pas
dans celui du pipeline de capture : `packages/ui` n'apprend jamais ce qu'est un
`VisionSnapshot`. La surface qui capture traduit son propre format. La capacité
est donc réutilisable telle quelle par un futur import manuel d'état.

La traduction vit dans `apps/desktop/src/SnapshotSlot.tsx` : il lit tout via
`SlotContext`, écrit tout via `context.actions`, et projette la sortie du
solveur dans la forme `VisionDecision` que le cockpit attend. Les messages sont
rendus à cette frontière, puisque `VisionDecision` porte des chaînes.

Deux détails y sont assumés : la ligne de base de continuité des tokens est un
état **local au desktop**, parce qu'elle n'a de sens qu'une fois qu'une capture
a réellement lu les tokens ; et les titres et dates de concert viennent du
catalogue partagé, pas de la constante `CONCERTS`, puisque ce sont des libellés
utilisateur.

### Builds vérifiés

| Build                           | Résultat                                     |
| ------------------------------- | -------------------------------------------- |
| `vite build` sur `apps/web`     | ✓ 78 modules, 424 kB (127 kB gzip)           |
| `vite build` sur `apps/desktop` | ✓ 545 kB (168 kB gzip), chunks Tauri séparés |

Le bundle desktop dépasse le seuil d'avertissement de 500 kB de Rollup. C'est
attendu pour un binaire local qui embarque le pipeline OCR, et sans conséquence
hors contexte réseau.

### Vérification

| Contrôle                            | Résultat      |
| ----------------------------------- | ------------- |
| Tests `packages/core`               | **172 / 172** |
| Tests `packages/ui`                 | **14 / 14**   |
| Tests `apps/desktop` (vision)       | **60 / 60**   |
| `tsc --noEmit` sur les 4 workspaces | vert          |
| `prettier --check` sur le dépôt     | vert          |
| Builds Vite des deux surfaces       | vert          |

## Étape 7 · corrections post-livraison (retour de test Windows)

Un premier test réel sur Windows a trouvé trois bugs que Linux ne pouvait pas
révéler.

### `npm ci` était impossible

Le dépôt n'avait jamais de `package-lock.json` committé, alors que `README.md`
et la CI prescrivaient `npm ci`, qui **exige** un lockfile existant. Généré et
committé. `npm ci` installe maintenant proprement et crée les binaires locaux
(`tsc`, `prettier`, `vite`) que `npm run typecheck` / `format:check` appellent.

En le générant, une dépendance manquante est apparue : `apps/desktop/package.json`
ne déclarait pas `@tauri-apps/plugin-global-shortcut`, installée à la main dans
mon environnement de vérification sans jamais être persistée. Ajoutée.

### Les gardes de fichiers cassaient sous Windows

`core-purity`, `engine-has-no-prose`, et les trois gardes de `packages/ui`
(`i18n-catalogue-parity`, `no-hardcoded-copy`, `theme-coverage`) calculaient
leur racine avec `new URL("../src/", import.meta.url).pathname`.

Sur Windows, `.pathname` d'un `file://` URL renvoie un chemin de la forme
`/C:/Users/...` — avec un `/` en tête. Un chemin qui commence par `/` est
interprété par Windows comme la racine du lecteur courant, donc une lecture de
répertoire sur ce chemin résout vers un chemin doublé et inexistant. `.pathname`
n'a jamais été le bon outil pour convertir une URL de fichier en chemin
filesystem ; `node:url` fournit exactement cette fonction, `fileURLToPath()`.
Les cinq fichiers sont corrigés, revérifiés sous Linux (172 + 14 + 60 tests
toujours au vert) — le correctif est correct par construction, pas un
contournement spécifique à une plateforme.

### Vérification, depuis un `npm ci` propre cette fois

| Contrôle                                | Résultat                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm ci`                                | installe 102 paquets, aucune erreur                                                              |
| Tests `packages/core`                   | **172 / 172**                                                                                    |
| Tests `packages/ui`                     | **14 / 14**                                                                                      |
| Tests `apps/desktop`                    | **60 / 60**                                                                                      |
| `npm run typecheck`                     | vert sur les 4 workspaces                                                                        |
| `npm run format:check`                  | vert                                                                                             |
| `npm run build:web`                     | reussi                                                                                           |
| `npm run build:desktop` (frontend Vite) | reussi, echoue ensuite sur `cargo metadata` -- ce bac a sable n'a pas Rust : attendu, pas un bug |

### Deuxième bug Windows : `path.relative()` dans les gardes elles-mêmes

Premier test réel avec toutes les dépendances installées (`npm ci` fonctionnel
cette fois) : `core-purity` et `engine-has-no-prose` échouaient tous les deux,
en signalant comme fautifs des fichiers qu'ils sont censés exclure explicitement
— `adapters/browser.ts` (la zone DOM sanctionnée) et `i18n/fr.ts` (le catalogue
français lui-même).

Cause : `path.relative()` renvoie un chemin avec le séparateur du systeme —
`adapters\browser.ts` sous Windows — alors que les exclusions étaient écrites
avec `/` : `!relative(SRC, path).startsWith("adapters/")`. Sous Windows, cette
comparaison ne matche jamais, donc rien n'est exclu, et les deux zones
volontairement exemptées se retrouvent scannées comme n'importe quel autre
fichier moteur. Les échecs rapportés étaient donc corrects sur le principe
(ces fichiers touchent bien au DOM / contiennent bien du français) mais faux
sur le fond : ce sont exactement les deux endroits où c'est autorisé.

Un utilitaire `relPosix()` normalise le résultat de `relative()` avant toute
comparaison ou affichage, dans les deux fichiers. Revérifié sous Linux (172
tests toujours au vert, aucune régression) et simulé avec un séparateur `\\`
en dur pour confirmer que la normalisation résout bien le cas Windows.

### Troisième et quatrième bugs : lockfile mono-plateforme, et un chemin repris tel quel

Un test qui a poussé plus loin que les tests automatisés — `npm run dev:web`,
`dev:desktop`, `prepare:ocr` — a trouvé deux bugs que les suites ne pouvaient
pas voir, puisqu'aucune des deux ne construit ni n'exécute réellement les
binaires natifs.

**Le lockfile ne listait que les binaires Linux.** `rollup` et `@tauri-apps/cli`
distribuent un paquet natif par plateforme comme dépendance optionnelle.
Mon premier lockfile avait été généré avec `npm install --package-lock-only`,
qui ne résout que les optionnels correspondant à la machine qui génère —
la mienne, Linux. `npm ci` suit le lockfile à la lettre : sans entrée
`win32-x64-msvc`, il ne peut rien installer pour Windows, et signale
exactement le bug connu `npm/cli#4828`. Un `npm install` complet (sans
`--package-lock-only`) interroge le registre pour la totalité des variantes
et les écrit toutes dans le lockfile, même celles qui ne s'exécuteront jamais
sur la machine qui génère — c'est le fonctionnement normal du format
lockfile v3. Vérifié après régénération : `rollup` et `@tauri-apps/cli`
comptent chacun leurs variantes `win32-arm64-msvc`, `win32-ia32-msvc` et
`win32-x64-msvc` dans le lockfile livré.

**`prepare-ocr-assets.mjs` cherchait dans le mauvais `node_modules`.** Le
script vient de la branche autonome d'origine, où le projet n'était pas dans
un workspace : `node_modules` était local. Dans ce monorepo, npm hoiste tout
à la racine — `apps/desktop/node_modules/` n'existe même pas — donc
`join(projectRoot, "node_modules", "tesseract.js", ...)` ne pouvait rien
trouver, indépendamment de l'OS. Réécrit pour résoudre les paquets via
`import.meta.resolve()`, la résolution de modules native de Node, qui
retrouve un paquet hoisté où qu'il se trouve plutôt que de deviner un chemin.

Au passage, deux dépendances mal reprises lors de l'étape 4 sont corrigées :
`apps/desktop/package.json` déclarait `tesseract.js@^5.1.1` sans
`@tesseract.js-data/eng`, alors que la branche OCR d'origine dépendait de
`tesseract.js@^7.0.0` et de ce paquet de données explicitement — c'est lui qui
fournit `eng.traineddata.gz`, que le script copie. Sans lui, `prepare:ocr`
ne pouvait pas aboutir même une fois le chemin corrigé.

### Vérification, cette fois jusqu'au build frontend des deux apps

| Contrôle                                     | Résultat                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm install` depuis zéro, lockfile régénéré | 100 paquets, variantes multi-plateformes confirmées                                |
| Tests (`core` + `ui` + `desktop`)            | 172 + 14 + 60, tous verts                                                          |
| `npm run typecheck`                          | vert sur les 4 workspaces                                                          |
| `npm run format:check`                       | vert                                                                               |
| `npm run prepare:ocr`                        | réussi, 8 fichiers générés                                                         |
| `npm run build:web`                          | réussi                                                                             |
| `npm run build:desktop` (frontend)           | réussi, échoue ensuite sur `cargo metadata` — ce bac à sable n'a pas Rust, attendu |

### Le bouton d'ouverture du cockpit OCR manquait

Retour terrain sur l'exe compilé : aucun moyen de cliquer pour ouvrir le
panneau Live OCR.

Cause : `SnapshotCompanionPanel` retourne `null` tant que sa prop `open` est
fausse (`if (!open) return null`), et son `onOpen` n'est appelé qu'en interne,
par le raccourci clavier global qui déclenche une capture. Dans l'app OCR
d'origine, un bouton manuel dédié — « Live OCR » — vivait dans la barre
supérieure, séparément du panneau, et pilotait le même état `snapshotOpen` que
`App.tsx` possédait. À l'étape 6, seul le panneau a été branché dans le slot
`decisionAside` ; ce bouton n'a jamais été porté, et l'état d'ouverture était
resté piégé localement dans `SnapshotSlot`, invisible depuis un autre slot.

Deux changements :

- **`TopBar` gagne une prop `actions`**, rendue à l'intérieur de
  `.topbar-actions` — un slot est un pair des sélecteurs de langue et de
  thème, pas une div ajoutée après le `<header>`. La CSS héritée de la branche
  OCR pour `.snapshot-launch-button` supposait déjà cet emplacement.
- **`apps/desktop/src/DesktopShell.tsx`** possède désormais l'état
  `snapshotOpen` que les deux slots partagent : le bouton (`topBarActions`)
  et le panneau (`decisionAside`) sont deux instances de composants distinctes
  rendues séparément par la coquille, donc l'état ne pouvait pas rester local
  à l'une des deux.

Le libellé « Live OCR » reste volontairement non traduit, comme dans l'app
d'origine : c'est un nom de fonctionnalité, pas une phrase, et le module
`vision/` n'est de toute façon pas couvert par la garde `no-hardcoded-copy`
(scopée à `packages/ui`).

### Vérification

| Contrôle                                | Résultat                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| Tests (`core` + `ui` + `desktop`)       | 172 + 14 + 60, tous verts                                                          |
| `npm run typecheck`                     | vert sur les 4 workspaces                                                          |
| `npm run format:check`                  | vert                                                                               |
| `npm run build:web`                     | réussi                                                                             |
| `npm run build:desktop` (frontend Vite) | réussi, échoue ensuite sur `cargo metadata` — attendu, ce bac à sable n'a pas Rust |

### Le bouton était collé au reste de la barre — et l'overlay avait perdu du contenu réel

Deux retours après un premier essai concluant du cockpit.

**Espacement du bouton.** `TopBar` rend `{actions}` comme premier enfant de
`.topbar-actions`, sur le même `gap: 8px` que les autres contrôles — sans
séparation visuelle dédiée entre le bouton d'action et le duo langue/thème
qui suit. Le bouton lui-même empilait icône, libellé en gras et badge minuscule
(8px) sur une seule ligne flex, sans grouper label et sous-titre. Corrigé :
label et sous-titre sont désormais empilés verticalement dans le bouton, et un
séparateur vertical marque la frontière avec les contrôles de langue/thème
(`.snapshot-launch-button + .lang-switch`).

**L'overlay affichait moins que l'original.** Vérification en comparant
`buildDecision()` champ par champ avec la construction d'origine de
`snapshotDecision` dans l'App OCR : `path` avait été laissé vide dès l'étape 6,
et `warning` pointait par erreur vers un champ sans rapport
(`run.patternUnsupported` / `run.nextSongCover`, une donnée de couverture de
song, pas de blocage). `path` alimente directement la liste à puces de
l'overlay (`OverlayView.tsx`) — la laisser vide explique la perte de contenu
constatée.

Plutôt que recopier la prose française écrite à la main dans l'ancien
`App.tsx` (avec ses tables `RHYTHM_16_STATUS_LABELS` / `CHECKPOINT_STATUS_LABELS`
locales, jamais migrées), `path` est reconstruit à partir des champs déjà
typés du moteur : `checkpoint16Status` / `checkpoint18Status` rendus via les
codes `checkpoint.name` / `supply.status` existants pour les songs,
`reachProbability` / `goalProbability` / `terminalDecision.reason` pour les
techniques. Cela reste fidèle à l'esprit de l'étape 2 : une seule source de
vérité, pas une deuxième description en anglais/français à la main qui
dérivera silencieusement de l'original.

Corrections associées :

- `warning` reproduit la logique d'origine — détail du blocage affiché en
  priorité, sinon un décompte des choix bloquants s'il y en a, jamais un champ
  sans rapport.
- `headline` inclut désormais le nom de la song ou le numéro d'option ciblée
  (`Achat conseillé · Grow-up Shine!`), pas seulement le ton générique.
- `metrics` (utilisé par le panneau, pas l'overlay) reçoit un sous-ensemble
  réel — probabilités d'atteinte et d'objectif — construit sur les mêmes
  champs, plutôt que de rester vide. Ce n'est **pas** une parité complète avec
  l'original, qui affichait aussi le coût engagé, les tokens conservés, la
  Friendship attendue par section et le détail de blocage immédiat ; ces
  éléments resteraient à porter si le panneau (pas seulement l'overlay) doit
  retrouver une richesse identique.

### Vérification

| Contrôle                                | Résultat                  |
| --------------------------------------- | ------------------------- |
| Tests (`core` + `ui` + `desktop`)       | 172 + 14 + 60, tous verts |
| `npm run typecheck`                     | vert sur les 4 workspaces |
| `npm run format:check`                  | vert                      |
| `npm run build:web`                     | réussi                    |
| `npm run build:desktop` (frontend Vite) | réussi                    |

### `metrics` et `candidates` portés à la même richesse que l'original

Suite du correctif précédent. Comparaison champ par champ de la construction
complète de `snapshotDecision` dans l'ancien `App.tsx` (indicateurs, grille de
comparaison des candidats, chemin, en-tête, résumé) avec `buildDecision()`,
pour combler ce qui restait volontairement partiel.

**`metrics` (panneau, section « Indicateurs décisifs »)** — désormais complet
pour les deux pages :

- Songs : prochaine sélection / sélection préservée, cible conditionnelle,
  repère de rythme 16, checkpoint 18, Friendship attendue de la section
  suivante (si `nextSectionReadiness` existe), coût engagé. Tous construits sur
  les champs déjà typés de `SongPolicyEvaluation` — `decisionVector`,
  `nextSectionReadiness`, `checkpoint16/18Status`.
- Techniques : atteindre la sélection, objectif choisi, blocage immédiat, coût
  si réussite, puis soit la décision terminale (STOP_NOW / EXPOSE_AND_CARRY)
  soit l'override actif — sur les champs de `AnalysisResult`.

**Le repère 16 récupère son cadrage propre.** L'original distinguait
volontairement le vocabulaire du 16 (« Atteint », un simple repère de rythme)
de celui du 18 (« Déjà sécurisé », une vraie porte) — même statut technique,
deux lectures différentes pour ne pas alarmer sur le 16 comme s'il bloquait
quoi que ce soit. Le code partagé `supply.status` ne porte qu'un seul
cadrage (celui du 18). Plutôt que d'aplatir cette nuance, une petite table
bilingue locale à `SnapshotSlot.tsx` restaure le cadrage « rythme » — elle
n'a pas sa place dans le catalogue partagé puisqu'aucun autre appelant n'en a
besoin.

**`candidates` distingue enfin songs et techniques.** Il ne renvoyait que les
candidats song, même sur la page technique (où il tombait à vide, faute de
`solver.songPolicy`). Réparti sur `solver.optionAnalyses` (déjà exposé par
`SolverView`, jamais branché) pour les techniques, `solver.songPolicy.policies`
pour les songs — avec le candidat « passif » (conserver/porter la page/ne rien
acheter) et le même tri recommandé-d'abord que l'original
(`compareDecisionVectors`, réexporté par `@glcp/core`).

**`headline` et `summary`** répliquent maintenant les branches complètes de
l'original : choix bloquant, action de song avec son nom, push forcé, repli
générique, et le message d'invite initial.

Aucun nouveau texte fabriqué : chaque chaîne vient soit d'un code de message
existant (`t()`), soit d'un champ numérique réel du moteur formaté avec les
`percent()`/`number()` déjà partagés par `packages/ui`, soit d'un littéral
bilingue local là où l'original en avait un et où le catalogue partagé n'a pas
vocation à en porter un (`policyActionLabel` a lui bien été réutilisé tel
quel, pas dupliqué).

### Vérification

| Contrôle                                | Résultat                                   |
| --------------------------------------- | ------------------------------------------ |
| Tests (`core` + `ui` + `desktop`)       | 172 + 14 + 60, tous verts                  |
| `npm run typecheck`                     | vert sur les 4 workspaces, sans ajustement |
| `npm run format:check`                  | vert                                       |
| `npm run build:web`                     | réussi                                     |
| `npm run build:desktop` (frontend Vite) | réussi                                     |

Le cockpit OCR est maintenant à parité fonctionnelle complète avec l'app
autonome d'origine, aux libellés informatifs près qui n'existaient que dans
ce fichier hérité et n'ont pas vocation à rejoindre le catalogue partagé.

### `tsc` introuvable sous `tauri build`, alors qu'il l'était partout ailleurs

`npm run desktop:build` échouait sur `'tsc' is not recognized`, alors que
`npm run typecheck` (le même `tsc --noEmit`, orchestré depuis la racine)
fonctionnait déjà.

La différence est dans qui lance la commande. `tauri build` exécute
`beforeBuildCommand` (`npm run build`) via son propre mécanisme de spawn côté
Rust, pas depuis un shell interactif normal. npm augmente en temps normal le
`PATH` pour exposer `node_modules/.bin` (y compris celui, hoisté, de la racine
du workspace) avant de lancer un script — mais dans ce contexte précis sous
Windows, cette augmentation ne parvient pas au process enfant que Tauri
lance : `tsc`, résolu d'ordinaire via ce `PATH` étendu, redevient introuvable.

`npx` contourne le problème : il résout le binaire local en remontant
l'arborescence des `node_modules`, indépendamment du `PATH` hérité du parent.
Les scripts `build` de `apps/web` et `apps/desktop` passent donc de
`"tsc --noEmit && vite build"` à `"npx tsc --noEmit && npx vite build"` —
`vite` étant soumis au même risque de résolution que `tsc`, et pas seulement
dans ce contexte Tauri : tout outil tiers qui invoque `npm run build` en
dehors d'un shell interactif normal (CI compris) peut retomber sur le même
problème.

### Vérification

| Contrôle                                         | Résultat                  |
| ------------------------------------------------ | ------------------------- |
| Tests (`core` + `ui` + `desktop`)                | 172 + 14 + 60, tous verts |
| `npm run typecheck`                              | vert                      |
| `npm run format:check`                           | vert                      |
| `npm run build:web` (avec `npx`)                 | réussi                    |
| `npm run build` dans `apps/desktop` (avec `npx`) | réussi                    |

### La capture appliquait l'état, mais ne déclenchait jamais l'analyse

Retour avec capture d'écran : décision affichée (« Greed risqué »), mais
« Indicateurs décisifs », « Pourquoi », « Chemin retenu » et la comparaison
des candidats tous vides, et rien de surligné sur l'overlay.

Le vrai bug n'était pas dans `buildDecision()` — il était en amont. La
coquille ne calcule pas l'analyse à chaque rendu : un `useEffect` déclenche
`runCurrentAnalysis()` automatiquement, mais seulement si **quatre**
conditions tiennent à la fois, dont `dynamicSpending` — le réglage qui
autorise l'app à suivre automatiquement les soldes plutôt que d'exiger une
saisie manuelle. Il vaut `false` par défaut. `applyExternalState` ne le
forçait jamais à `true`, donc après chaque capture OCR, l'effet
d'auto-analyse ne se déclenchait tout simplement jamais.

Sans analyse fraîche, `result` reste `null` après la capture (mon
`applyExternalState` l'y remet explicitement, en attendant justement le
recalcul automatique). Et c'est là qu'un repli générique du calcul de ton de
recommandation, `resultTone = ... : (result?.recommendation ?? "risky")`,
produit malgré tout un intitulé plausible — « Greed risqué » — **sans qu'une
seule analyse ait réellement tourné**. C'est ce repli, pas une vraie
recommandation, qui s'affichait sur la capture d'écran.

`display.displayedTechniqueResult` (= `result`, en l'absence d'override) étant
null, tout ce qui en dépend dans `buildDecision()` — `metrics`, `path`,
`candidates`, et `bestTechniqueIndex` (qui pilote le surlignage sur l'overlay)
— se calculait correctement... sur une absence de données. `buildDecision()`
elle-même n'avait pas de défaut ; elle reflétait fidèlement un état où rien
n'avait encore été analysé.

**Correctif** : `applyExternalState` force `dynamicSpending` à `true` dès
qu'un état externe est appliqué. Ce n'est pas un contournement : capturer un
snapshot OCR _est_, par définition, la même confiance que ce réglage accorde
à la saisie manuelle — l'app peut croire les soldes qu'elle lit à l'écran et
suivre les deltas automatiquement. Sans lui, l'automatisation OCR ne pouvait
structurellement jamais boucler jusqu'à une vraie analyse.

### Vérification

| Contrôle                            | Résultat                  |
| ----------------------------------- | ------------------------- |
| Tests (`core` + `ui` + `desktop`)   | 172 + 14 + 60, tous verts |
| `npm run typecheck`                 | vert                      |
| `npm run format:check`              | vert                      |
| `npm run build:web`                 | réussi                    |
| `npm run build` dans `apps/desktop` | réussi                    |

Cette correction résout à la fois le panneau vide et l'absence de
surlignage sur l'overlay : les deux dépendaient du même `result` jamais
recalculé.

### Audit complet de livrabilité

Passe exhaustive plutôt qu'une simple relance des suites : lockfile
multi-plateforme reconfirmé, gardes vérifiées par injection de violation
(DOM dans le moteur, français en dur dans un composant, toutes deux détectées
puis fichiers restaurés à l'identique), cohérence des versions sur les 4
`package.json` + `tauri.conf.json` + `Cargo.toml`, dépendances de chaque
workspace vérifiées une à une, `.gitignore`/`.prettierignore` confrontés à
l'arborescence réelle, config Tauri (icônes, capabilities, bundle) relue.

Deux défauts réels trouvés et corrigés :

- **`@tauri-apps/plugin-opener` était une dépendance morte.** Jamais importée
  côté JS, et le vrai code Rust ouvre le dossier du journal via
  `std::process::Command` sans passer par ce plugin. Absente de la branche OCR
  d'origine — un reliquat de scaffold que j'avais laissé traîner depuis
  l'étape 4. Retirée, lockfile régénéré et revérifié multi-plateforme.
- **La documentation avait pris du retard sur le code.** `docs/MIGRATION.md`
  affirmait encore que `metrics`/`path` étaient vides, corrigés depuis
  plusieurs étapes ; l'étape 4 gardait un « reste à faire » local jamais
  nettoyé après résolution à l'étape 6 ; `RELEASE_NOTES.md` et
  `docs/VALIDATION.md` s'arrêtaient tous deux avant le cockpit OCR et les
  correctifs post-livraison ; deux chemins de fichier (`src/domain/live-rules.ts`,
  `src/live-model.ts`) et un libellé d'onglet (« Paramètres » au lieu de
  « Réglages ») dataient d'avant la fusion en monorepo. Tout corrigé.

### Vérification

| Contrôle                            | Résultat                                                                |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `npm ci` depuis zéro                | 97 paquets, aucune erreur                                               |
| Tests (`core` + `ui` + `desktop`)   | 177 + 14 + 62, tous verts                                               |
| Gardes vérifiées par injection      | `core-purity` et `no-hardcoded-copy` détectent réellement une violation |
| `npm run typecheck`                 | vert                                                                    |
| `npm run format:check`              | vert                                                                    |
| `npm run build:web`                 | réussi                                                                  |
| `npm run build` dans `apps/desktop` | réussi                                                                  |
| `npm run prepare:ocr`               | réussi, 8 fichiers                                                      |
| Versions (5 manifestes + Tauri)     | cohérentes à 0.25.0                                                     |

## Ce qui reste, et pourquoi

**Compiler le backend Rust.** Les deux builds Vite passent, `tsc`/`vite` se
résolvent maintenant correctement sous l'invocation de `tauri build` (voir
« `tsc` introuvable sous `tauri build` » ci-dessus). Reste à voir un
`cargo build` aboutir sur une machine Windows avec la toolchain Rust
installée : `src-tauri/` n'a pas été recompilé depuis son déplacement dans le
monorepo, et rien dans ce dépôt ne peut le vérifier sans cette toolchain.
