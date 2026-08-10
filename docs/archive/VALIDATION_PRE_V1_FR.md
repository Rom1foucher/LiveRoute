## v1.0.0

- Régression moteur inchangée par rapport à v0.25.3 : 186/186 tests.
- Catalogues FR/EN à parité, sans clé morte, fragment visible en dur, entité
  HTML ni explication de prototype : 19/19 tests présentation.
- Scroll du suivi live vérifié pour les transitions techniques → songs et
  songs → techniques, sans déplacement pendant l’hydratation ou en mode manuel.
- Overlay OCR vérifié avec cinq valeurs projetées sur les régions du profil,
  valeur inconnue explicite et conservation des états loading/stale : 63/63
  tests desktop/OCR.
- Build web vérifié à la racine et avec un base path de dépôt GitHub Pages ;
  aucun chemin `/assets/` absolu ne subsiste.
- TypeScript strict, Prettier, bundle web et bundle frontend desktop verts.
- **186 + 19 + 63 = 268/268 tests.** Le bundle Tauri/NSIS est délégué au
  workflow Windows parce que Cargo n’est pas installé dans l’environnement de
  validation local.

## v0.25.3

- Replay pré-patch C1 s5 : la continuation achète une song puis conserve dans
  l'horizon les achats, Friendship, SP et techniques de la section courante ;
  STOP ne gagne plus en comptant seulement leur acquisition différée.
- Le classement de la continuation reste devant STOP avec la composante
  Great Success neutralisée. Une chaîne sans prochaine song finançable reste
  refusée, ce qui exclut une règle fixe propre à C1.
- **186 tests moteur, 14 tests de présentation, 62 tests vision : 262/262**.
  TypeScript strict, Prettier, bundle web et bundle frontend desktop sont verts.

## v0.25.2

- Replays v0.25.1 s49/s70 : après acquisition de SP+2/SP+3 à `2/3`, le plan
  devient `close-checkpoint`, la troisième song sécurise Great Success et le
  post-achat repasse en HOLD.
- Replays de Grand Live s402/s211 : une song terminale abordable convertit
  `+25 SP`; une technique terminale abordable reste recommandée pour `+5 SP`,
  même sans song restante.
- Les valeurs d'entraînement et Live Bonus sont nulles au Grand Live ; les
  réserves futures et les tiers Friendship/Specialty n'interviennent plus.
- **184 tests moteur, 14 tests de présentation, 62 tests vision : 260/260**.
  TypeScript strict, Prettier, bundle web et bundle frontend desktop sont verts.

## v0.25.1

- Régressions issues des deux runs du 9 août : s59 conserve la chasse SP+2,
  s218 sécurise Great Success au lieu de porter Ring Ring, s402 arrête les
  dépenses après le Great Success final.
- HOLD de fin C2/C3 testé sur les chemins song et technique ; les fillers
  abordables mais non stratégiques ne sont plus marqués inachetables.
- **181 tests moteur, 14 tests de présentation, 62 tests vision : 257/257**.
  TypeScript strict, Prettier, bundle web et bundle frontend desktop sont verts.

## v0.25.0

- Fusion des deux branches en monorepo (`packages/core`, `packages/ui`,
  `apps/web`, `apps/desktop`) et branchement du cockpit OCR sur la coquille
  partagée.
- **177 tests moteur, 14 tests de présentation, 62 tests vision** — suite
  complète au vert, depuis un `npm ci` propre sur un lockfile régénéré (couverture
  multi-plateforme vérifiée : `rollup`, `@tauri-apps/cli`, `esbuild` pour
  `linux-x64`, `darwin` et `win32`).
- `tsc --noEmit` et `prettier --check` verts sur les quatre workspaces.
- `npm run build:web` et le build frontend Vite de `apps/desktop` aboutissent ;
  `cargo build` (backend Rust) non vérifié faute de toolchain Rust dans
  l'environnement de développement — reste à confirmer sur une machine Windows.
- Deux gardes de garantie ajoutées (`core-purity`, `engine-has-no-prose`) et
  vérifiées par injection : une violation DOM insérée dans le moteur, un
  littéral français inséré dans un composant partagé, chacune détectée par la
  garde correspondante avant restauration.
- Régression corrigée : une capture OCR appliquait l'état sans jamais
  déclencher l'analyse automatique (`dynamicSpending` non forcé), produisant un
  intitulé de repli générique au lieu d'une vraie recommandation.

## v0.24.0

- **87/87** tests ciblés (`live-model`, `technique-dp`, `song-policy`) réussis.
- Suite complète : **220 chargés / 219 réussis / 1 échec**. L'échec unique est le test OCR atlas qui ne peut charger `tesseract.js` dans cette extraction, identique au baseline.
- `tsc --noEmit` ciblé strict des modules solveur modifiés : réussite.
- Fixtures P1 : `fbde s110` → réserve Visual 26 ; `fbde s154` → Fanfare sautée, réserve Visual 32, option `14 Da + 10 Vi` seule sans brèche ; visibilité Fanfare à 46 Visual → coût d'accès nul.
- Replay journal : `fbde s110` conserve `buy-continue:pyoitto`; `s154` conserve `option-3:safe` mais avec le bon diagnostic de faisabilité ; `s155` conserve `buy-stop:harusora`. `e57e s152` reste STOP et demeure une question ouverte.

## v0.23.0

- P0 : fixtures Speed/Wit et invariant `main` ajoutés.
- P1a : réserve de frontière sommée + transition `frontier → single` + replay synthétique `fbde s153`.
- P2 : valeur `N × φ × T_x`, calibration automatique `speed-wit`, fallback statique explicite pour les profils sans distribution mesurée, replay `e57e s161`.
- P3 : confiance du carryover de tarif technique marquée `verified`.
- P4 : audit complet du compteur 18 ; suppression des gates résiduelles dans song-policy, cross-section, forced override et decision-safety ; régression 10/18 vs 17/18.
- Tests fonctionnels ne nécessitant pas `tesseract.js` : **217/217 réussis**. Suite `npm test` : **218 chargés, 217 réussis, 1 échec infrastructurel** (`vision-ocr-atlas.test.ts`, import `tesseract.js` absent).
- `tsc --noEmit` ciblé réussit sur `live-model`, `live-rules`, `strategic-plan`, `cross-section`, `forced-override`, `song-policy` et `decision-safety`.
- Transpilation syntaxique de **79 fichiers TS/TSX** : zéro diagnostic.
- Limite d’environnement inchangée : `vision-ocr-atlas.test.ts` ne peut pas importer `tesseract.js`; `npm ci` échoue sur le miroir interne pour `zlibjs@0.3.1`.

## v0.22.18

- **89/89 tests ciblés** réussis : `live-model`, `song-policy`, `technique-dp`, `terminal-technique`, `strategic-plan`, `decision-safety`.
- Suite complète locale : **207 tests chargés, 206 réussis**. L'unique échec est `tests/vision-ocr-atlas.test.ts` avec `ERR_MODULE_NOT_FOUND: tesseract.js`, dépendance externe absente de cette extraction ; aucun test fonctionnel du solveur n'échoue.
- Régression de réserve : le meilleur tier stratégique reste une frontière de vecteurs complets ; une cible secondaire d'une autre couleur ne peut plus fabriquer un faux plancher dur.
- Replay C4 seq143 : avec `165/136/26/112/84` et `24 Vocal / 30 Visual / 12 Dance + 12 Vocal`, le classement réel préfère le duo `12+12`.
- Contre-régression seq122 : avec `177/185/64/127/140`, `15 Visual` peut rester recommandé contre deux options à 24 lorsque la shadow price Visual n'est pas assez forte pour compenser neuf tokens de coût. Le fix ne hardcode donc pas Visual/Fanfare.
- Régression probabiliste : `jointGoalProbability <= reachProbability`; `reach=0` ou candidat invalide implique `jointGoalProbability=0`. Une song structurelle inachetable ne peut plus produire `goal=1 / hard=1`.
- Régression C4 : `18-totalSongs` n'est plus une dette optimisée avant le Grand Live ; une page de fillers ne devient pas prioritaire uniquement parce qu'elle rapproche du compteur 18.
- `rankReason` est présent dans les diagnostics de candidats techniques et identifie le premier critère décisif du comparateur.
- `tsc --noEmit` ciblé avec `moduleResolution=Bundler` réussit sur `live-model`, `strategic-plan`, `cross-section`, `song-policy`, `technique-dp` et `terminal-technique`.
- Transpilation syntaxique de **79 fichiers TS/TSX** sous `src/` et `tests/` : zéro diagnostic.
- Le build Vite/Tauri complet n'est pas reproductible dans cet environnement sans `node_modules`; il reste à exécuter sur la machine Windows cible via `scripts/build-windows.ps1`.

## v0.22.17

- Régression UI : la review OCR conserve `overflow-y: auto` sous 1120 px de hauteur.
- Configuration desktop : `minHeight = 940`.
- Le mode OCR ajoute/retire `snapshot-modal-open` sur `html` et `body` pour bloquer le scroll arrière-plan.
- 3/3 tests de layout dédiés réussis.
- Suite locale : 201/202 réussis ; seul `vision-ocr-atlas.test.ts` ne charge pas car `tesseract.js` n’est pas installé dans cet environnement.
- 46 fichiers TS/TSX transpilés sans erreur syntaxique.

## v0.22.16

- 19/19 tests ciblés réussis sur terminal C1/C4, règles de transition et journal.
- Suite complète locale : **199 tests chargés, 198 réussis** ; l’unique échec est toujours `vision-ocr-atlas.test.ts` avec `ERR_MODULE_NOT_FOUND: tesseract.js`, dépendance absente de cette extraction.
- Nouvelle régression `decision(7)` seq 23 : le terminal C1 valorise l’achat pré-Live d’une Friendship révélée après une technique Junior à 10 tokens.
- Contre-régression : C1 ne pousse pas automatiquement une chaîne chère lorsque la pool ne contient que des fillers ; la décision reste issue de la projection.
- Régression de transition : une page de songs déjà portée n’empêche plus le concert suivant et peut être portée à nouveau.
- Régression du journal : lorsque le suivi dynamique est désactivé, les balances `stateAfter` restent identiques aux balances réellement conservées par l’UI ; les helpers de reconstruction exacts restent disponibles séparément.
- Transpilation syntaxique : **78 fichiers TS/TSX**, zéro diagnostic.
- Comparaison `tsc --noEmit` avec v0.22.15 dans l’environnement sans dépendances React/Tauri : aucune nouvelle erreur unique ; le build frontend complet doit être exécuté sous Windows avec `npm ci` fonctionnel.

## v0.22.15

- 194/194 tests ne nécessitant pas `tesseract.js` réussissent. Le test `vision-ocr-atlas.test.ts` reste non chargeable localement faute du paquet externe.
- Replays ajoutés : C4 à 10/18 ne porte plus passivement la page ; `74/41/41/50/112` préfère le duo 12+12 à Vocal25 ; `Passion16 / Dance25 / Vocal30` ne paie plus 30 Vocal pour un micro-écart Monte-Carlo.
- Invariant symétrique vérifié : une branche `buy-stop` valide correspond à une politique post-achat effective STOP/invalid (ou abandon HUNT), et une branche `buy-continue` valide correspond à une continuation effective.
- Une technique plus chère sur le même support de couleurs est signalée comme alternative coûteuse, sans être rendue rouge ni invalide : un effet Energy/Hint utile peut justifier l’override utilisateur.
- 78 fichiers TS/TSX transpilés sans diagnostic syntaxique.
- Le `tsc --noEmit` global ne peut pas être conclu sans les dépendances React/Tauri de l’archive ; aucun `TS6133` n’est toutefois présent après la passe de contrôle.

## v0.22.14

- Correctif build TypeScript : suppression de l’import inutilisé `resolveStrategicObjective` dans `src/App.tsx`.
- Aucun changement de logique solveur/OCR par rapport à v0.22.13.

## v0.22.13

- 68/68 tests ciblés réussis sur `song-policy`, `live-model`, `terminal-technique` et `technique-dp`.
- Suite complète : 190 tests chargés, 189 réussis ; l’unique échec est `vision-ocr-atlas.test.ts` avec `ERR_MODULE_NOT_FOUND: tesseract.js`, dépendance absente de cette extraction.
- Replay `decision(5).ndjson` seq 105 : `Fanfare for the Future!` (+10 %) passe devant `The World's at Our Whim` (+5 %) parce que la Friendship déjà acquise reste comptée dans l’état futur.
- Replay Grand Live 17/18 : le mode Expert ne conserve plus un ancien objectif `priority-song`; la conversion finale force `any-song` jusqu’à fermeture de `18 ∧ GS`.
- Fin C4 sous 18 : le terminal technique pousse une trajectoire non nulle vers une nouvelle page au lieu de revenir au vieux seuil STOP.
- À support de couleurs identique, une technique strictement moins chère domine la plus chère avant les métriques Monte-Carlo.
- Vérification TypeScript stricte des modules modifiés réussie ; transpilation syntaxique des 78 fichiers TS/TSX sans diagnostic.

## v0.22.10

- 36/36 tests ciblés réussis sur `song-policy`, carryover et détection de période.
- 171/172 tests de la suite complète réussis dans l’environnement local ; l’unique échec est un `ERR_MODULE_NOT_FOUND` pour `tesseract.js` dans `vision-ocr-atlas.test.ts`, dépendance absente de cette extraction.
- Régression ajoutée : une Friendship +10 visible reste recommandée lorsque son Great Success (`>= 92 %` en profil standard) appartient à la même classe admissible qu’un filler légèrement plus sûr.
- Régressions carryover : aucune période tarifaire héritée ; Classic après C1 → C2 et Senior après C3 → C4 restent validés avec le barème du nouveau concert.

## v0.22.9

- Régression exacte C1 → C2 après carryover : les offres `16 Visual / 15 Vocal / 25 Dance` sont validées avec le barème Classic.
- Invariant source : `App.tsx` ne contient plus de `techniqueCarryoverPeriod` ni de branche de prix hérités.
- Les anciennes données de session portant ce champ sont ignorées puis éliminées à la sauvegarde suivante.
- Le détecteur de décalage reste volontairement strict : trois offres doivent correspondre sans ambiguïté à une autre période.
- 169/169 tests exécutables sans la dépendance externe `tesseract.js` réussissent ; le seul test non lancé localement importe directement ce paquet.
- Transpilation syntaxique des 77 fichiers TS/TSX et vérification sémantique des sources modifiées réussies.

## Validation v0.22.1

- Suite complète : **157/157 tests réussis**.
- Régressions carryover : sélection d’un candidat `carry-page` valide lorsque la recommandation affichée est `stop-and-carry-stock`, et conservation de la cible recommandée lorsqu’un carry est déjà affiché.
- Vérification du journal fourni : aux séquences 302, 352 et 518, les candidats de carry sont valides malgré un verdict STOP ; le nouveau sélecteur les expose comme action manuelle au lieu de désactiver implicitement le carry.
- Régressions OCR : un template appris exact remplace une lecture générique erronée à confiance 1,0 ; le repli Tesseract appris ne remplace pas une meilleure lecture primaire ; le canal `learned-template` gagne le consensus numérique lorsqu’il dépasse le seuil segmenté.
- L’apprentissage réutilise le modèle d’encre précédent, met à jour immédiatement la référence de profil utilisée par le hotkey et corrige le brouillon courant sans nouvelle capture.
- Analyse TypeScript stricte réussie pour les nouveaux modules purs de sélection carryover et de priorité OCR apprise.
- Transpilation syntaxique réussie pour les composants TSX et le recognizer modifiés.
- L’installation npm reste impossible dans l’environnement de génération : le miroir interne retourne 404 pour `zlibjs@0.3.1`. Le build Vite/Tauri complet doit donc être exécuté sur la machine Windows cible.

## Validation v0.22.0

- Suite complète : **152/152 tests réussis**.
- Régressions : localisation par couleur, conservation des exemples précédents, refus qu’un unique template `8` force un `6`, conservation de tous les composants d’un nombre plus long, et import réel de `recognizeAtlas` avec vérification du routage `SPARSE_TEXT`.
- Vérification sur la capture utilisateur : dans la cellule 133×81, le localisateur retrouve un bbox de 37×47 px autour du `8`, avec le libellé et la bordure exclus.
- Analyse TypeScript stricte réussie pour les modules OCR non-UI modifiés via une déclaration locale de `tesseract.js`.
- Transpilation syntaxique réussie pour les **41 fichiers TS/TSX** de `src/`, sans diagnostic.
- L’installation npm reste impossible dans l’environnement de génération : le miroir interne retourne 404 pour `zlibjs@0.3.1`. Le build Vite/Tauri complet doit donc être exécuté sur la machine Windows cible.

## Validation v0.21.3

- Régression pure : un atlas de 23 variantes numériques est routé vers `SPARSE_TEXT`; un crop appris isolé conserve `SINGLE_WORD` ou `SINGLE_CHAR`.
- Reproduction sur la capture fournie avec Tesseract natif : le même atlas renvoie une chaîne vide en mode `SINGLE_WORD`, tandis que `SPARSE_TEXT` détecte le glyphe `8` dans les sous-zones alignées à droite.
- `npm test` exécuté dans l’environnement de génération sans dépendances externes requises par ces tests.
- Le bundle Vite/Tauri complet ne peut pas être relancé ici : le miroir npm retourne toujours 404 pour `zlibjs@0.3.1`.

## Validation v0.21.2

- `npm test` : 146/146 tests réussis.
- Régression ajoutée pour la découverte d’une sous-zone numérique alignée à droite depuis une cellule logique large.
- Le build frontend complet n’a pas été relancé dans l’environnement de génération faute de dépendances npm installées ; la modification est isolée au modèle de variantes OCR et au texte UI.

# Validation v0.21.1

Validated in the modification environment:

- `npm test`: **145/145 tests passed**.
- Added an exact regression replay of the reported C3 cycle-4 state: `57/59/33/47/46`, visible `Nigekiri / Tachiichi / Komorebi`, `Grow Up and Shine!` still hidden, and a five-technique next cycle. The policy is now `wait-reserve`, buys no filler, marks HUNT abandoned and makes `komorebi:buy-continue` invalid.
- Added/kept regressions for persistent HOLD after an abandoned SP target, risk-profile probability floors, the C4 `10/16` pacing state and mechanically valid terminal actions below 16.
- The reported technique state `139/113/93/8/105` now ranks the three safe payments as `24 Vocal`, then `25 Passion`, then `30 Dance`.
- Numeric OCR profile migration to schema 4, local crop generation and exact user-confirmed candidate selection are covered by tests. An exact confirmed reading outranks a higher-confidence wrong reading; no profile change is accepted without an exact match.
- Strict TypeScript analysis passed for the modified solver/planner modules.
- Strict TypeScript analysis passed for the non-UI OCR modules using a local declaration stub for the unavailable `tesseract.js` package.
- Syntax transpilation passed for all **65 TypeScript/TSX files** under `src/` and `tests/` with zero diagnostics.
- Verified that the source archive contains no stale `dist/`, `node_modules/` or `src-tauri/target/` output.

A full Vite/Tauri bundle was not regenerated in this environment. The configured npm mirror returns 404 for `zlibjs@0.3.1`, and the Rust/Cargo toolchain is not installed. The source archive therefore does not contain a newly built installer or `dist/` directory.

## v0.22.2

- Le validateur OCR accepte une technique simple à 40 tokens en Junior.
- La vue Live OCR applique un mode compact sous 1120 px de hauteur pour garder les trois techniques visibles sans défilement interne.

### Détection de décalage de concert

- 3 tests dédiés passent : Classic→Senior, Senior→Classic et page ambiguë.
- Les 4 tests de plausibilité des coûts, dont Energy 40 en Junior, passent.

## v0.22.5

- 5 tests dédiés couvrent le cycle de vie du tarif hérité : activation au concert avec carryover, conservation après achat de la song portée, suppression au premier achat de technique et migration d'une session v0.22.4 déjà affectée.
- Les 3 tests de détection de décalage de période restent valides : aucune alerte n'est émise lorsque le contexte OCR utilise correctement le barème hérité.
- 165/165 tests ne nécessitant pas le module externe `tesseract.js` passent dans cet environnement.
- Le test d'intégration OCR direct restant n'a pas pu être exécuté ici, car `npm ci` est bloqué par le miroir interne sur `zlibjs@0.3.1` et `tesseract.js` n'est donc pas installé.

## v0.22.6

- **168/168 tests exécutables sans `tesseract.js` réussis** dans l'environnement de génération.
- Deux replays exacts du journal `decision(3).ndjson` sont couverts :
  - séquence 97 : à 11 songs, `Precious Treasure Box` (+10 % Friendship) passe devant `A-No-Ne` et est recommandée en `buy-continue` pour compléter la jauge ;
  - séquence 123 : à 13 songs, `Fanfare for the Future!` est recommandée en `buy-stop`, sans faux blocage lié au total 16.
- Régression dédiée : le plan terminal C4 a `checkpointRequired = null`, conserve les Friendship comme cibles structurelles et décrit explicitement 16 comme un repère, pas une porte.
- Les actions de carry et de sortie sous 16 restent mécaniquement valides ; leur classement dépend de Great Success et de la trajectoire vers 18.
- `npm ci` reste bloqué par le miroir interne sur `zlibjs@0.3.1`, donc le test d'intégration important directement `tesseract.js` et le build Vite/Tauri complet ne peuvent pas être exécutés ici.

## v0.22.7

- **173/173 tests exécutables sans `tesseract.js` réussis**. Le seul test non exécutable importe directement le module externe absent de cet environnement.
- Régression exacte `Dance 128 → 8` : détectée comme probable troncature OCR.
- Une variation plausible `28 → 8` et des achats/revenus ordinaires ne déclenchent aucun avertissement.
- Une baisse `103 → 13` reste détectée sans dépendre d’un suffixe décimal exact.
- Le premier snapshot sur un état local vide établit seulement la référence.
- Plusieurs ruptures simultanées sont classées comme dérive globale possible et restent non bloquantes.
- Le diagnostic est figé sur l’état présent au moment de la capture, journalisé avec le snapshot et peut être masqué localement sans empêcher l’analyse.

## v0.22.8

- 5/5 tests de détection de période réussissent.
- Régression exacte : une page `16 Visual / 15 Vocal / 25 Dance` en C2 est reconnue comme Classic même si un marqueur Junior hérité est encore actif.
- Le même écart sans marqueur de carryover reste classé comme véritable décalage d’état.
- La correction de tarif ne modifie ni le concert courant ni l’historique de la run.

## v0.22.11

- Great Success intermédiaire n'est plus un préfixe lexicographique de décision : C1–C4 le valorisent uniquement comme gain marginal attendu de `35 × P(GS)` stats. La porte finale `18 songs ∧ Great Success du Grand Live` reste dure.
- Régression dédiée : une Friendship +10 reste prioritaire face à un filler même lorsque son achat fait passer la probabilité de Great Success intermédiaire de `98,4 %` à `90,6 %`, donc sous l'ancien seuil standard de `92 %`.
- `resolveExpressObjective` et `resolveStrategicObjective` ne rouvrent plus indirectement une chaîne uniquement pour compléter la jauge Great Success d'un Promotional Live. La jauge du Grand Live final conserve son rôle de contrainte.
- Carryover testé sur toutes les transitions C1→C2, C2→C3, C3→C4 et C4→GL : une page de techniques déjà affichée conserve son ancienne période jusqu'au premier achat ; le refresh suivant utilise la période du concert courant. Une page de songs portée ne transporte jamais l'ancien tarif des techniques.
- Le journal expose désormais séparément `concertPeriod` et `techniqueOfferPeriod`, ce qui permet de distinguer explicitement la période réelle de la run de la période ayant généré une page de techniques portée.
- Energy +20/+30/+40 utilise `25/30/35` à toutes les périodes ; Hint Lv.+1/+2/+3 utilise `15/25/35` à toutes les périodes. Le coût simple `40` n'est plus accepté comme pseudo-Energy +40.
- Suite locale hors test important directement `tesseract.js` : **175/175 réussis**. Le test restant ne peut pas être chargé dans cet environnement faute de dépendances npm installées.
- Analyse TypeScript stricte réussie pour les modules non-UI modifiés ; transpilation syntaxique de l'intégration TSX réussie.
- `npm ci` reste bloqué dans l'environnement de génération par le miroir interne (`zlibjs@0.3.1` retourne 404), donc le bundle Vite/Tauri complet doit être généré sur la machine Windows cible.
