# v1.0.0 — V1 web et desktop OCR — 2026-08-10

- **Interface recentrée sur l’usage.** L’accueil décrit directement la décision
  prise par le planner ; les formulations de landing page, badges bêta et notes
  de prototype ont été retirés. La note historique « Make Debut! n’est pas
  Run n’ Run! » est remplacée par la seule information encore utile : la song
  est accordée au début du scénario.
- **Copie et traductions assainies.** Les fragments visibles en dur, entités
  HTML, libellés orphelins et incohérences `Grand Concert` / `Grand Live` ont
  été corrigés. Une garde dédiée empêche le retour de ces reliquats.
- **Workflow plus fluide.** En suivi live, l’ouverture d’une sélection de songs
  remonte automatiquement au choix ; l’achat redescend vers les techniques.
  L’hydratation, le mode manuel et les préférences de réduction des animations
  sont respectés.
- **OCR autonome et contrôlable.** Le cockpit reste une surface desktop
  indépendante. L’overlay affiche maintenant les cinq valeurs reconnues juste
  sous les compteurs du jeu, avec un niveau de confiance et `?` en cas d’échec,
  afin qu’une mauvaise lecture soit visible avant la décision.
- **Distribution prête.** Le web supporte les sous-chemins GitHub Pages et se
  déploie depuis `main`. Un tag `v*` compile le desktop Windows et publie son
  installateur NSIS dans GitHub Releases. React est isolé dans un chunk stable
  et le runtime Tesseract n’est chargé qu’au premier warm-up OCR.
- **Validation.** 268/268 tests réussis (186 moteur, 19 présentation, 63
  desktop/OCR), TypeScript strict, Prettier et bundles web/desktop réussis.
  Le backend Rust et l’installateur natif restent validés par le workflow
  Windows, la toolchain Cargo n’étant pas présente dans l’environnement local.

# v0.25.3 — valeur cumulée des continuations C1 — 2026-08-10

- **Composition inter-section corrigée.** Le rollout cumule désormais les
  acquisitions de la section fermée avec celles des sections suivantes. Leur
  coût et leur thinning étaient déjà appliqués au futur état, mais leurs
  Friendship, acquisitions, techniques et SP disparaissaient du vecteur de
  valeur.
- **STOP sans double avantage.** Une song achetée avant le concert ne peut plus
  être retirée de la pool dans la branche de continuation tout en étant
  comptée seulement lorsqu'une branche STOP la rachète plus tard.
- **Replay C1 pré-patch s5.** À `0/2`, `420` tokens et trois songs visibles, le
  solveur poursuit une chaîne rentable au lieu de porter tout le stock. La
  continuation reste meilleure après neutralisation des `35 stats` de Great
  Success : elle gagne aussi par ses acquisitions, ses SP, ses Friendship
  activées tôt et le thinning transmis aux pools suivantes.
- **Pas de quota C1.** Aucun seuil de songs ni règle propre au premier concert
  n'est ajouté. Une contre-régression refuse toujours une chaîne dont aucune
  acquisition future n'est finançable.
- **Validation.** 262/262 tests réussis (186 moteur, 14 présentation, 62
  desktop/OCR), TypeScript strict, Prettier et bundles web/desktop réussis.

# v0.25.2 — Great Success post-SP et conversion terminale — 2026-08-10

- **HOLD corrigé.** Après SP+2 en C2 ou SP+3 en C3, HOLD reste actif pendant
  la section, mais `deadline-now` passe à `close-checkpoint` tant que la jauge
  est à `2/3`. Le troisième achat sécurise les 35 stats, puis le plan rebascule
  immédiatement en HOLD.
- **Replays exacts.** Les états v0.25.1 s49 et s70 recommandent désormais un
  `buy-stop` qui ferme Great Success, au lieu de porter la page ou de demander
  un override utilisateur.
- **Conversion Grand Live.** Une fois au dernier concert, le stock résiduel n'a
  plus de valeur future : chaque technique abordable vaut `+5 SP` et chaque
  song abordable `+25 SP`. Les bonus d'entraînement, Friendship et Specialty
  valent zéro à cet horizon.
- **Fin de run rejouée.** s402 et la run v0.25.1 s211 achètent un filler
  abordable ; Go This Way n'est plus invalidée comme « non stratégique ».
- **Hiérarchie terminale.** Toutes les songs restantes sont des cibles de
  conversion équivalentes ; les techniques sont départagées par faisabilité,
  couverture de la prochaine page puis coût, sans réserve future artificielle.
- **Validation.** 260/260 tests réussis (184 moteur, 14 présentation, 62
  desktop/OCR), TypeScript strict, Prettier et bundles web/desktop réussis.

# v0.25.1 — Contrôleur stratégique post-replay — 2026-08-09

- **HOLD strict après SP.** Après acquisition de SP+2 en C2 ou SP+3 en C3,
  l'écran concert reste en HOLD : aucune Friendship cachée ni chaîne terminale
  de fillers ne peut rouvrir la dépense.
- **Chasse SP prioritaire.** Une continuation HUNT au-dessus du seuil de risque
  est comparée avant les projections Friendship des sections futures. Le replay
  run A s59 poursuit désormais Yume o Kakeru au lieu de l'abandonner.
- **Carry contre Great Success.** Un carry filler ne reçoit plus de tier
  structurel artificiel. Les 35 stats immédiatement sécurisées entrent dans le
  contrefactuel après l'activation d'une cible persistante et avant les
  projections futures ; le replay run B s218 achète Ring Ring.
- **Fin du Grand Live.** Une fois Great Success final sécurisé sans priorité
  restante, STOP est disponible même si la section est encore ouverte. Un
  filler abordable est décrit comme non stratégique, sans faux blocage
  « inachetable » ; un vrai manque de tokens reste bloquant.
- **Régressions de production.** Les états s59, s218 et s402 du journal du
  9 août passent par le builder de production dans la suite moteur.
- **Validation.** 257/257 tests réussis (181 moteur, 14 présentation, 62
  desktop/OCR), TypeScript strict et format réussis sur les quatre workspaces ;
  bundles frontend web et desktop générés sans fichier du prototype Worker.

# Correctifs post-fusion v0.25.0 — 2026-08-09

- **Contexte solveur partagé.** Web et desktop passent désormais par le même
  builder pur : plan stratégique, réserve par faisabilité, offres de techniques
  observées, songs visibles, bonus d'entraînement brut et multiplicateur
  Friendship ne peuvent plus être perdus à la frontière UI/moteur.
- **Carryover des techniques.** Une page héritée conserve son vrai barème dans
  la saisie rapide, la validation OCR et la première simulation ; le barème est
  effacé au premier achat et persisté dans la session, l'historique et le
  journal de décision.
- **Hiérarchie restaurée.** Specialty redevient un simple départage de fillers,
  sans tier structurel. Au Grand Live, un bonus d'entraînement dynamique vaut
  zéro lorsque l'horizon d'entraînement est nul.
- **Solveur plus réactif.** Les candidats d'une même décision partagent les
  offres Monte-Carlo et le mode Express peut converger dès 512 échantillons sur
  les états décisifs (Expert conserve son plancher antérieur). La fixture
  visible de performance passe de 2 304 à 1 536 échantillons.
- **Loading explicite.** Après validation OCR, l'app et l'overlay affichent
  « Analyse en cours… » avec spinner ; aucun ancien verdict ni « Greed risqué »
  par défaut n'est affiché pendant le calcul. Les confirmations d'achat restent
  désactivées jusqu'au résultat.
- **Régressions production.** s110, s154, l'ordre P2 `pyoitto > a-no-ne`, le
  tarif carryover et le cycle de vie du loading passent par les mêmes helpers que
  l'application.
- **Validation.** 253/253 tests réussis, TypeScript strict réussi pour les
  quatre workspaces, bundles Vite web et desktop générés sans erreur.

# v0.25.0 — monorepo

Fusion des deux branches divergentes en un dépôt unique. Le moteur retenu est
celui de la branche Snapshot OCR `v0.24.0`, sur lequel la refonte de
présentation de la branche web a été **réappliquée** plutôt que fusionnée.

## Structure

- `packages/core` — moteur de décision, catalogue i18n, ports. Ni React, ni DOM.
- `packages/ui` — coquille `App.tsx`, 11 composants, 6 thèmes, catalogues fr/en.
- `apps/web` — surface navigateur.
- `apps/desktop` — surface Tauri, pipeline vision et OCR.

## Frontière moteur / présentation

- Le moteur n'émet plus de prose : 78 codes de message rendus par la couche i18n.
  L'égalité de raison devient décidable, les tests assertent sur des codes.
- `StrategicPlan` perd `label`, `exitCondition` et `fallback` au profit de trois
  fabriques de messages ; `SupplyAssessment.label` et `SongCheckpoint.label`
  disparaissent au profit de `supply.status` et `checkpoint.name`.
- `SongPolicyEvaluation.songName` devient `string | null` ; l'absence d'achat est
  rendue par le code `policy.noPurchase`.

## Journal de décision

- **Schéma v3.** Les champs de raison portent des codes de message, plus des
  phrases : le journal redevient diffable entre versions et analysable.
- L'écriture passe par un port `DecisionSink`. Le web écrit dans un stockage
  navigateur borné à 500 entrées, le desktop compose un fichier durable
  au-dessus de ce stockage.
- `APP_VERSION` n'est plus une constante du moteur : l'application l'injecte.

## Correctifs relevés pendant la fusion

- `resolveStrategicObjective` déstructurait `totalSongs` sans l'utiliser, ce qui
  faisait échouer `tsc --noEmit` avec `noUnusedLocals`, donc aussi `npm run build`.
- Le widget de réserve branchait sur `plan.mode === "alternative"`, valeur de la
  `v0.22.9` : depuis la `v0.24` le moteur produit `none | single | frontier`, et
  la branche « plusieurs vecteurs » ne pouvait jamais s'afficher.
- `concertTransitionBlockReason` recevait encore `hasActiveCarryover`, retiré par
  la `v0.22.16`.
- Le test `i18n-catalogue` annonçait une vérification à la compilation qui
  n'existait pas : `SAMPLES` n'était pas annoté et les tests n'étaient pas
  typechequés. Quatre fixtures invalides de longue date ont été révélées, dont un
  `checkpoint18Status` valant une chaîne absente de `CheckpointStatus`.

## Gardes ajoutées

- `core-purity` — aucun module du moteur ne touche au DOM, à React, à Tauri ou à
  Tesseract, n'importe un adaptateur, ni n'utilise d'import sans extension.
- `engine-has-no-prose` — aucun littéral français hors de `src/i18n/`, et la
  couche i18n n'est importée qu'en `import type`.
- `i18n-catalogue` — chaque code a un échantillon, un rendu français et un rendu
  anglais non vides et distincts.

## Cockpit OCR branché

- Le panneau Live OCR est intégré à la coquille partagée via deux points
  d'extension (`topBarActions`, `decisionAside`) plutôt que dupliqué par
  application. `ActionsView` gagne `applyExternalState`, `undoLastAction` et
  `setPipelineTimings` pour que la capture d'écran puisse remplacer la saisie
  manuelle sans que `packages/ui` apprenne ce qu'est un `VisionSnapshot`.
- Indicateurs décisifs, chemin retenu et comparaison complète des candidats
  reconstruits à la même richesse que l'application OCR autonome, sur les
  champs déjà typés du moteur plutôt que sur une prose dupliquée.

## Correctif : une capture appliquait l'état sans jamais déclencher l'analyse

- `applyExternalState` ne forçait pas le suivi dynamique des dépenses
  (`dynamicSpending`), une condition parmi celles qui gardent le déclenchement
  automatique de l'analyse. Une capture OCR mettait donc à jour les tokens et
  les coûts visibles, mais ne produisait jamais de recommandation fraîche : le
  panneau retombait sur un intitulé de repli générique (« Greed risqué »),
  sans qu'aucune analyse ait réellement tourné, et l'overlay ne surlignait
  rien. Capturer un snapshot OCR _est_, par définition, la même confiance que
  ce réglage accorde à la saisie manuelle ; `applyExternalState` l'active
  désormais systématiquement.

## Compatibilité Windows

- Le lockfile généré sans `--package-lock-only` couvre les binaires natifs de
  toutes les plateformes (`rollup`, `@tauri-apps/cli`, `esbuild`) : un
  `npm ci` sur Windows échouait sinon avec l'erreur connue `npm/cli#4828`.
- Les scripts `build` de `apps/web` et `apps/desktop` passent par `npx` :
  `tauri build` invoque `beforeBuildCommand` dans un contexte où le `PATH`
  augmenté par npm n'est pas toujours hérité, rendant `tsc`/`vite` introuvables
  autrement.
- Les gardes de fichiers (`core-purity`, `engine-has-no-prose`, et les trois
  équivalentes de `packages/ui`) normalisent désormais le séparateur de
  chemin : `path.relative()` renvoie des `\` sous Windows, ce qui faisait
  échouer silencieusement leurs exclusions internes.

## Validation

- **177 tests moteur, 14 tests de présentation, 62 tests vision** — suite
  complète au vert depuis un `npm ci` propre.
- `tsc --noEmit` et `prettier --check` verts sur les quatre workspaces.
- `npm run build:web` et le build frontend de `apps/desktop` aboutissent.

---

# v0.24.0 — réserve par échelle de faisabilité

- **P1 refondu.** La réserve dure protège désormais un ensemble de cibles intégralement payable sur au moins une trajectoire réelle. Une cible infaisable est sautée sans interrompre le parcours ; les cibles utiles de tier inférieur peuvent reprendre l'ancre.
- **Aucune réserve fractionnaire.** La proposition `P(apparition) × coût` est supprimée : la probabilité pourra décider ultérieurement si une chasse mérite d'être poursuivie, jamais combien du prix doit être conservé.
- **Trajectoires vectorielles réelles.** Le test de faisabilité conserve des balances Pareto réalisables et n'assemble pas des minima par couleur venant de chemins différents. La page de techniques réellement affichée est imposée comme première dépense lorsque connue.
- **Visibilité.** Une cible visible a un coût d'accès nul et est immédiatement réévaluée, même si elle avait été sautée avant l'ouverture de la page.
- **Replay `fbde s110`.** À `126/76/59/54/50`, Daisuki est protégée et Fanfare sautée : réserve Visual `26`, plutôt qu'une somme impossible `68`.
- **Replay `fbde s154`.** À `187/43/32/44/34`, Fanfare est déclarée infaisable ; Harusora reprend l'ancre à `32 Visual`. Avec les offres `24 Vi / 25 Vi / 14 Da+10 Vi`, la troisième devient la seule sans brèche.
- **P2 inchangé dans son rôle.** `N × φ × T_x` continue de départager les fillers et d'alimenter la shadow price souple ; il ne fabrique jamais une réserve dure.
- **Question `e57e` conservée ouverte.** Le STOP à `165/111/26/82/60` reste produit après P2 ; aucune modification de terminal policy n'est faite sans comparaison chiffrée des deux branches.

## Validation

- Tests ciblés solveur/réserve : **87/87 réussis**.
- Suite complète : **220 tests chargés, 219 réussis** ; l'unique échec reste `vision-ocr-atlas.test.ts` faute de `tesseract.js`, identique au baseline de l'archive.
- TypeScript strict ciblé : succès sur `live-model`, `song-policy`, `song-transition` et `terminal-technique`.
- Replay déterministe des états `fbde s110/s154/s155` et `e57e s152/s161` effectué sur le journal fourni ; les sorties correspondent aux fixtures v0.24.

# v0.23.0 — valeurs d’entraînement, réserve sommée et retrait complet de 18

- **P0 — fixtures de calibration.** Régressions exactes Speed et Wit sur la formule `main_float → total_float`, avec l’invariant qu’une song `Training X Gain` ne modifie jamais le `main` affiché. Le calcul conserve le float pré-arrondi avant d’ajouter le bonus de song.
- **P1a — frontière multi-cibles sommée.** Les cibles du meilleur tier ne sont plus traitées comme des substituts par couleur : la réserve dure somme leurs vecteurs. `Daisuki [42 Da,26 Vi] + Fanfare [26 Da,42 Vi]` protège donc `68 Dance / 68 Visual` tant que les deux restent dans la pool, puis retombe au vecteur simple lorsque l’une disparaît.
- **Régressions replays P1a.** Les états critiques `fbde s153` et la frontière F+10 sont figés ; une dépense Visual qui entame la réserve sommée passe derrière une alternative qui préserve Visual.
- **P2 — valeur structurelle des Training Gains.** `Training X Gain +N` est évalué à `N × φ × T_x`, où `φ` vient des Friendship songs déjà actives et `T_x` compte toutes les facilités qui produisent le stat. Le filler value n’est utilisé qu’à l’intérieur du tier filler et dans la shadow price souple ; il ne promeut jamais une song au-dessus des tiers SP/Friendship.
- **Calibration `speed-wit`.** La distribution vérifiée `20 Speed / 3 Stamina / 4 Power / 3 Guts / 15 Wit` donne les poids relatifs `Speed 1.00 / Power 0.71 / Wit 0.39 / Stamina 0.18 / Guts 0.16`. Les autres profils gardent la valeur statique v0.22.18 tant qu’aucune distribution mesurée n’est fournie ; une distribution exacte peut déjà être injectée explicitement.
- **Replay `e57e s161`.** Le catalogue réel conserve `pyoitto = Stamina training +2`; sa valeur structurelle dépasse `a-no-ne = Guts training +2` dans l’état reproduit et son coût préserve mieux la frontière F+10.
- **P3 — carryover technique vérifié.** Le RuleSet marque désormais explicitement comme `verified` la conservation du tarif de la page de techniques exposée avant un Promotional Live jusqu’au premier achat.
- **P4 — `18` entièrement sorti du scoring.** L’audit a trouvé des chemins résiduels au Grand Live, dans la projection inter-section, l’override et la qualification rouge. Ils sont supprimés : `checkpoint18Status` reste un diagnostic, mais n’entre plus dans les hard gates, `decisionVector`, objectifs `any-song`, overrides ou blocages UI.
- **Great Success final préservé.** Au Grand Live, la song manuelle nécessaire au Great Success reste une vraie contrainte. Une fois la jauge sécurisée, `13/18` et `17/18` sont décisionnellement équivalents à contexte structurel identique.
- **P1b différé conformément au plan.** Aucune pondération par obtenabilité n’est introduite sans replay des journaux complets `e57e/fbde`; les fichiers disponibles ne contiennent que les états décrits dans l’addendum.

## Validation

- Tests fonctionnels ne nécessitant pas `tesseract.js` : **217/217 réussis**.
- Suite `npm test` : **218 tests chargés, 217 réussis** ; l’unique échec est `vision-ocr-atlas.test.ts` avec `ERR_MODULE_NOT_FOUND: tesseract.js`, déjà présent sur le baseline extrait. `npm ci` reste bloqué dans cet environnement par le miroir npm sur `zlibjs@0.3.1`.
- `tsc --noEmit` ciblé réussit sur les modules solveur/planner/règles/sécurité modifiés. **79 fichiers TS/TSX** sous `src/` et `tests/` sont transpilés sans diagnostic syntaxique.
- Le build Vite/Tauri complet reste à exécuter sur la machine Windows cible avec les dépendances installables.

# v0.22.18 — frontière stratégique, shadow prices et probabilités jointes

- **18 sort du scoring C1–C4.** `16/18` restent des indicateurs de trajectoire avant le Grand Live. C4 n'est plus forcé vers `any-song` simplement parce que le compteur est inférieur à 18 : le solveur privilégie la qualité et le timing des Lessons. La seule vraie porte liée au compteur reste `18 songs ∧ Great Success final` au Grand Live.
- **Réserve vectorielle par frontière.** `calculateTokenReservePlan()` conserve les vecteurs complets du meilleur tier stratégique au lieu de fabriquer des seuils indépendants par couleur à partir de cibles de tiers différents. Une F+10 Visual/Dance n'est plus indirectement sacrifiée parce qu'une +5 crée un faux plancher dur Vocal.
- **Shadow price souple pour les autres cibles.** Friendship +5, anciennes SP encore utiles et autres cibles pertinentes influencent le coût marginal des couleurs selon leur valeur et leur timing, sans devenir des gates. Les fillers n'obtiennent aucune réserve autonome.
- **Classement technique explicable.** Le comparateur examine la frontière stratégique et les gains structurels avant les petites différences Monte-Carlo, puis utilise le coût pondéré par la demande future avant le coût brut. Chaque candidat journalise `rankReason`, le premier critère qui a réellement tranché (`reserve-breach`, `terminal-structural-band`, `weighted-demand-cost`, etc.).
- **Replay `decision(9)` seq143.** À `165/136/26/112/84`, l'offre `24 Vocal / 30 Visual / 12 Dance + 12 Vocal` préfère désormais le duo `12+12`. Le cas seq122 peut toujours choisir `15 Visual` contre deux options à 24 lorsque Visual conserve suffisamment de marge : aucune couleur n'est hardcodée.
- **Probabilités séparées.** `AnalysisResult` expose `reachProbability`, `conditionalGoalProbability` et `jointGoalProbability`. L'ancien `goalProbability` devient explicitement l'alias de la probabilité jointe pour compatibilité UI. Le contrat impose `jointGoalProbability <= reachProbability`; une branche inaccessible ou invalide a une probabilité jointe nulle.
- **Branches song invalides assainies.** Une song inachetable n'expose plus `reach=0 / goal=1 / hard=1`; les candidats invalides ont un préfixe dur nul.
- **Docs scoring/algo mises à jour.** `README.md` et `docs/ALGORITHMIC_MODEL.md` décrivent désormais la hiérarchie valeur/timing, la frontière stratégique, les shadow prices, la sémantique jointe des probabilités et le rôle purement indicatif de 16/18 avant le Grand Live.

## Validation

- **89/89 tests ciblés** sur live-model, song-policy, technique-DP, terminal-technique, strategic-plan et decision-safety.
- Suite complète locale : **207 tests chargés, 206 réussis** ; l'unique échec reste `vision-ocr-atlas.test.ts`, qui ne peut pas charger `tesseract.js` absent de cette extraction.
- Analyse TypeScript stricte réussie sur les modules solver/planner modifiés avec `moduleResolution=Bundler`.
- Transpilation syntaxique de **79 fichiers TS/TSX** sous `src/` et `tests/` : zéro diagnostic.

# v0.22.17 — layout OCR et scroll modal

- La fenêtre principale Tauri a maintenant une hauteur minimale de 940 px.
- Le panneau de revue OCR garde toujours sa scrollbar verticale, y compris en mode compact sous 1120 px.
- Ouvrir Live OCR verrouille le scroll de la page principale ; seul le contenu du cockpit OCR défile.
- `scrollbar-gutter: stable` évite les apparitions/disparitions de scrollbar qui décalent le layout.
- Aucun changement du solveur, de l’OCR ou des règles de carryover.

# v0.22.16 — carryover automatique, C1 prospectif et journal cohérent

- **Un seul bouton de transition.** `Concert joué` porte automatiquement la page actuellement affichée : page de songs complète ou page de techniques. Les anciens boutons `Porter la page` / `Passer sans carryover` ont été retirés de l’interface principale et du cockpit OCR.
- **Carryover répétable.** Une page de songs déjà portée peut traverser un concert supplémentaire, comme une page de techniques, tant qu’aucune Lesson n’a rafraîchi l’offre.
- **C1 moins conservateur sans règle spéciale.** Le terminal simule désormais les deux usages d’une page révélée juste avant le Live : acheter immédiatement une song pertinente avant le concert, ou conserver la page pour l’après-Live. Une Friendship révélée en C1 n’est donc plus artificiellement valorisée comme si elle ne pouvait être achetée qu’en C2. Le thinning obtenu en achetant un filler bon marché est également reflété par la pool future ; aucune obligation de push C1 n’a été ajoutée.
- **Régression `decision(7)` seq 23.** Avec `18/123/41/17/19`, une seule technique restante et une Friendship +5 encore dans la pool, `Visual 10` justifie maintenant l’exposition de la page au lieu de `STOP_NOW`. Un cas C1 composé uniquement de fillers et nécessitant une chaîne coûteuse continue de recommander STOP.
- **Journal fidèle au mode de suivi.** Quand `Déduire les achats confirmés` est désactivé, `stateAfter.tokens` ne simule plus un débit ou un `+10` que l’état React n’a pas réellement appliqué. Le coût reste présent dans l’événement pour reconstruction. Les choix utilisent les marqueurs `known-cost-not-applied` / `verified-concert-credit-not-applied`.
- **Chaînage NDJSON réparé.** Les snapshots et choix mettent désormais à jour `previousDecisionId` immédiatement, comme les recommandations ; les événements successifs ne pointent plus vers une ancienne recommandation simplement parce que l’écriture disque est asynchrone.
- **Overlay instantanément masquable.** `Overlay ×` est accessible dans l’en-tête OCR et `Masquer maintenant` reste dans la preview. Le masquage est latched : une mise à jour du solver ne réaffiche pas l’overlay ; seul un nouveau snapshot appliqué le réactive.

# v0.22.15 — conversion C4 cohérente, invariance symétrique et discipline des techniques

- Étend le mode de conversion C4 vers 18 aux **pages de songs** : sous 18 à la fin de C4, un `carry-page`/STOP ne peut plus battre un achat + réévaluation uniquement pour préserver le stock lorsqu’une trajectoire d’achat reste viable. Le replay du log à 10/18 avec `Nanairo / Komorebi / A-No-Ne` achète désormais et poursuit la conversion.
- Rend l’invariance achat → état post-achat **symétrique**. `buy-continue` n’est valide que si le même solveur post-achat prévoit réellement une continuation ; `buy-stop` n’est valide que si l’état effectif post-achat prévoit l’arrêt. L’UI appelle la continuation normale **Acheter puis réévaluer** : aucune décision future n’est verrouillée et les cartes réellement révélées peuvent toujours changer le verdict.
- Réordonne le choix des techniques : une **violation de réserve déterministe** est examinée avant les différences probabilistes du rollout. Les projections Monte-Carlo sont comparées par bandes plutôt qu’au millième, afin qu’un `99 %` contre `100 %` ne fonctionne plus comme une pseudo-gate.
- Rejoue le cas `74/41/41/50/112` : `12 Passion + 12 Vocal` passe devant `25 Vocal`, car le duo ne franchit aucune réserve et coûte moins.
- Rééquilibre la pression couleur face au coût brut : le replay `Passion 16 / Dance 25 / Vocal 30` ne dépense plus 30 Vocal pour un micro-gain prospectif ; Passion 16 gagne.
- Une technique strictement plus chère sur **les mêmes couleurs** reste achetable manuellement, mais devient une **Alternative coûteuse** avec avertissement non bloquant. Cela couvre le cas où un `Vocal 30` peut être volontairement choisi pour un bon Energy/Hint : le solveur déconseille le surcoût pour la progression sans prétendre connaître une valeur gameplay non identifiée par l’OCR.
- Les journaux exportent désormais aussi l’avertissement de surcoût (`advisoryReason`).

## Validation

- **194/194 tests exécutables sans `tesseract.js` passent**.
- Le seul test d’intégration non chargeable localement reste `vision-ocr-atlas.test.ts`, car `tesseract.js` n’est pas installé dans cette extraction.
- **56/56 tests ciblés** song-policy / technique-DP / decision-safety / strategic-plan passent, dont les replays C4 10/18, seq147 et seq96.
- Transpilation syntaxique de **78 fichiers TS/TSX** : zéro diagnostic.
- `tsc --noEmit` ne signale plus d’import/paramètre inutilisé dans les modifications ; le contrôle complet nécessite les dépendances React/Tauri absentes de l’environnement de génération.

---

# v0.22.14 — correctif build TypeScript

- Supprime l’import inutilisé `resolveStrategicObjective` dans `src/App.tsx`, qui faisait échouer `tsc --noEmit` avec `noUnusedLocals`.
- Aucun changement fonctionnel par rapport à v0.22.13.

# v0.22.13 — Friendship acquise, conversion C4/GL et dominance de coût

- Corrige la comptabilité des Friendship déjà achetées avant un Promotional Live : une +10 acquise reste `100 %` sécurisée dans l’état projeté et son bonus est ajouté à la Friendship future attendue. Le solveur ne récompense donc plus artificiellement la branche qui refuse une +10 visible pour conserver la « chance de l’obtenir plus tard ». Le replay C4 `Fanfare +10` contre `The World's at Our Whim +5` recommande maintenant Fanfare.
- Le plan stratégique reprend la main sur l’objectif des techniques lorsque la conversion finale l’exige, même en mode Expert. À `17/18` au Grand Live, un ancien objectif manuel `priority-song` ne peut plus produire `goalProbability = 0` si seules des fillers restent : l’objectif effectif devient `any-song` jusqu’à fermeture de la porte.
- Étend la même logique à la fin de C4 : sous 18 songs, `CLOSE · fin C4` traite une nouvelle song comme objectif de conversion. Le terminal technique ne transforme plus une trajectoire non nulle vers une nouvelle page en `STOP_NOW` uniquement parce qu’elle est sous le seuil de risque standard.
- Ajoute une dominance déterministe sur les offres de techniques : à mêmes couleurs consommées, un vecteur strictement moins cher passe toujours devant le plus cher. Les deux cartes font avancer le pattern d’une technique ; une meilleure projection du coût supérieur ne peut donc plus être du simple bruit Monte-Carlo. Les protections de cible/réserve restent examinées avant cette dominance.
- Ajoute quatre régressions : replay Fanfare/Sekai, objectif Expert à 17/18 C4/GL, replay Grand Live 17/18 avec fillers, et dominance mono/duo du coût le plus faible.

## Validation

- 190 tests chargés : **189 passent** ; l’unique échec est toujours `vision-ocr-atlas.test.ts`, qui ne peut charger `tesseract.js` absent de cette extraction.
- **68/68 tests ciblés** `song-policy`, `live-model`, `terminal-technique` et `technique-dp` passent.
- TypeScript strict passe sur les cinq modules solveur/modèle modifiés.
- Transpilation syntaxique de **78 fichiers TS/TSX** : zéro diagnostic.

---

# v0.22.12 — invariants purgés et conversion finale Grand Live

- Supprime les deux derniers retours cachés du checkpoint 16 dur : le rollout inter-section ne force plus des achats pour atteindre 16 et le terminal technique compare encore STOP/PUSH à 15/16.
- L'override forcé n'utilise plus `checkpoint16Status` comme veto. Le statut 16 reste affiché uniquement comme repère de rythme.
- Formalise l'invariance achat → état post-achat : un `buy-continue` normal devient invalide si le même moteur, sur le vrai solde et la vraie pool après achat, conseille `STOP` ou `invalid`. Cela ne verrouille pas l'écran suivant : une nouvelle offre réelle peut toujours modifier le verdict.
- Propage `firstOfferPeriod` aux sous-solveurs et aux analyses UI. Une page de techniques portée garde donc correctement son ancien prix sur toutes les transitions ; un carry de song utilise toujours le nouveau tarif pour la prochaine technique générée.
- Grand Live : avant `18 ∧ GS`, le solveur pousse la conversion dès qu'une trajectoire non nulle vers la prochaine song existe. À 17/18, l'achat qui ferme la porte s'arrête. Après 18 ∧ GS, il économise si aucune vraie priorité structurelle ne reste ; une priorité cachée peut encore justifier l'ouverture d'une page.
- Les +5 Specialty ne rouvrent pas une chaîne après la porte finale ; les cibles structurelles (Friendship / SP) restent les seules raisons de poursuivre.
- Modélise les offres à pool réduite : 2 songs restantes → `2 songs + 1 technique`, 1 → `1 + 2`, 0 → `3 techniques`. L'OCR n'exige plus trois songs inexistantes.
- Ajoute des régressions contractuelles sur 15/16, l'invariance `buy-continue`, le Grand Live 16→17→18, l'économie post-gate, la chasse d'une priorité cachée, le carry de période et les offres mixtes.

## Validation

- 186 tests chargés localement : **185 passent** ; l'unique test non chargeable importe directement `tesseract.js`, absent car le miroir npm retourne toujours 404 sur `zlibjs@0.3.1`.
- Les 90 tests ciblant solveur/carry/Grand Live/offres mixtes passent.
- TypeScript strict passe sur tous les modules solver/domain modifiés.
- Transpilation syntaxique de **78 fichiers TS/TSX** : zéro diagnostic.

---

# v0.22.11 — Great Success marginal, vrai carryover de techniques et Energy/Hint globaux

- Retire Great Success C1–C4 du préfixe lexicographique de viabilité. Il redevient une récompense marginale (+35 stats attendues) située après la valeur structurelle des songs ; une Friendship +10 visible ne peut plus être déclassée parce qu’un filler franchit un seuil arbitraire de probabilité de Great Success.
- Conserve exclusivement la vraie porte dure du Grand Live : `18 songs ∧ Great Success final`.
- Restaure le carryover mécanique des pages de techniques à tous les concerts : une page déjà affichée garde ses coûts de la période d’origine jusqu’au premier achat ; le refresh suivant utilise la période courante.
- Garde le carryover de song séparé : la song portée compte comme un point du nouveau pattern, puis la prochaine technique nouvellement générée utilise le tarif du nouveau concert.
- Energy +20/+30/+40 coûte 25/30/35 à toutes les périodes. Hint Lv.+1/+2/+3 coûte 15/25/35 à toutes les périodes. L’OCR accepte donc 35 dès Junior et n’accepte plus 40 comme coût simple valide.
- Ajoute des régressions sur les quatre transitions C1→C2→C3→C4→GL, le refresh après achat d’une technique portée et la non-transmission du tarif lors d’un carryover de song.
- Le journal distingue maintenant `concertPeriod` (période réelle de la run) et `techniqueOfferPeriod` (période ayant généré une éventuelle page de techniques portée), afin que les prochains diagnostics de prix ne puissent plus confondre les deux.

# v0.22.10 — Friendship +10 et validation du carryover

## Friendship +10

- Corrige un départage encore trop sensible aux décimales de projection : une Friendship +10 visible pouvait devenir simple alternative face à un filler uniquement parce que la projection donnait par exemple `100 %` de Great Success au filler contre `98,4 %` à la +10.
- Great Success garde une classe de viabilité prioritaire (`au-dessus du seuil / partiel / nul`). Tant que deux branches restent dans la même classe, la priorité immédiate d’une Friendship +10 ou de la cible de chasse est désormais examinée avant la probabilité exacte.
- La probabilité exacte reste utilisée juste après comme départage souple. Une +10 qui fait réellement tomber Great Success sous le seuil de risque peut donc toujours perdre : la correction ne force pas aveuglément toutes les +10.

## Carryover et prix des techniques

- Réaudit du chemin complet : le carry conserve la page visible de songs à travers le concert ; l’achat de la song portée crédite une technique (`Techniques 1/N`) ; la prochaine technique réellement affichée utilise le barème de la période courante.
- Aucun tarif de technique de la période précédente n’est restauré ou inféré par l’OCR. Le détecteur de dérive compare uniquement au concert courant.
- Ajout d’une régression C3 → C4 : une page Senior (`24`, duo `12+12`, duo `14+10`) après carryover est acceptée sans faux diagnostic de période.

## Validation

- Ajout d’une régression C4 reproduisant le défaut : `Precious Treasure Box` (+10 %) reste principale face à `Hey, Guess What!` lorsque les deux branches ont un Great Success au-dessus du seuil, même si le filler possède quelques points de probabilité supplémentaires.
- Suite locale : 171 tests passent ; le seul test non exécutable dans cet environnement reste `vision-ocr-atlas.test.ts`, faute du paquet `tesseract.js` installé.

---

# v0.22.9 — Carryover sans tarif hérité

## Correction

- Un carryover de song crédite toujours une technique (`Techniques 1/N`) mais la première technique réellement affichée utilise immédiatement le barème de la période courante.
- L’application ne crée, ne persiste et ne restaure plus de `techniqueCarryoverPeriod`. Les anciennes sessions v0.22.3–v0.22.8 contenant ce champ l’ignorent automatiquement.
- Le validateur OCR compare désormais les coûts uniquement au barème du concert affiché. Le faux diagnostic « tarif hérité probablement terminé » et son bouton de contournement ont été supprimés.
- Le carryover lui-même reste inchangé : la song portée est conservée, son achat ouvre la nouvelle section avec une technique déjà créditée, puis les offres visibles suivent les tarifs de cette nouvelle section.

## Régression couverte

- C1 → C2 avec song portée : après achat de la song, `16 Visual / 15 Vocal / 25 Dance` est reconnu comme une page Classic valide, sans diagnostic de décalage.
- Une sauvegarde historique contenant `techniqueCarryoverPeriod: "junior"` ne peut plus réactiver les tarifs Junior en C2.

---

# v0.22.8 — Distinction entre période du concert et tarif hérité

- Corrige le faux diagnostic « concert en retard » lorsque la run est déjà en Classic mais que l’application conserve encore un barème Junior hérité d’un carryover.
- Le détecteur distingue désormais un véritable décalage de concert d’un marqueur de tarif hérité devenu obsolète.
- Dans ce second cas, l’interface confirme que la run est bien dans la période affichée et propose **Utiliser les tarifs Classic/Senior** sans avancer ni annuler de concert.
- Les trois coûts visibles restent la preuve : la correction n’est proposée que lorsqu’ils correspondent tous sans ambiguïté au barème réel du concert.
- Ajoute deux régressions, dont le cas exact `16 Visual / 15 Vocal / 25 Dance` en C2 Classic avec un tarif Junior hérité.

# v0.22.7 — Avertissement souple sur les ruptures de stock

- Compare chaque nouveau snapshot OCR à l’état de tokens actuellement suivi par l’application, après prise en compte des achats saisis dans l’interface.
- Signale les ruptures extrêmes compatibles avec une lecture tronquée, notamment `128 → 8`, `103 → 3` ou une baisse d’un ordre de grandeur sur une seule couleur.
- Garde volontairement des seuils larges : les variations ordinaires, les achats manuels, les gains de tokens pendant la run et les changements effectués hors OCR ne bloquent jamais la validation.
- Lorsque plusieurs couleurs changent fortement ensemble, le message privilégie l’hypothèse d’une progression ou d’une modification globale de la run plutôt qu’une erreur OCR isolée.
- L’avertissement indique les valeurs avant/après, peut être masqué par **C’est volontaire**, et est ajouté au journal du snapshot lorsqu’il est validé.
- Le premier snapshot OCR établit seulement la référence et ne déclenche aucun avertissement. La référence utilisée pour un snapshot est figée au moment de la capture afin que l’application du snapshot ne fasse pas disparaître immédiatement le diagnostic.
- Ajoute cinq régressions unitaires sur les troncatures, les baisses abruptes, les variations plausibles, l’initialisation et les dérives multi-couleurs. **173/173 tests exécutables sans `tesseract.js` passent**.

# v0.22.2 — Vue OCR 1080p et coût Energy 40

- Compacte automatiquement le panneau des techniques sur les écrans de 1080 px de haut afin d'afficher les trois offres sans scrollbar interne.
- Accepte un coût de technique simple de 40 tokens dès la période Junior. Cela couvre notamment les offres Energy à 40 observées avant le premier concert.
- Ajoute une régression dédiée au validateur OCR des coûts de techniques.

# v0.22.1 — Carryover explicite et application fiable de l’apprentissage OCR

- Découple le bouton de carryover de la recommandation actuellement affichée. Lorsqu’une page visible possède au moins un candidat `carry-page` valide, l’utilisateur peut désormais la porter explicitement même si la politique normale recommande `stop-and-carry-stock`.
- Ajoute deux actions distinctes dans l’interface principale et le cockpit OCR : suivre la recommandation, ou choisir explicitement l’alternative **Porter la page / Passer sans carryover**. La cible de carry est le meilleur candidat valide de la page ; si la recommandation est déjà un carry, sa cible reste prioritaire.
- Corrige le cas observé dans le journal aux séquences 302, 352 et 518 : les trois candidats de carry étaient valides, mais le bouton appelait `advanceConcert(false)` parce que `displayed.action` valait `stop-and-carry-stock`.
- Conserve la provenance des lectures apprises. Un résultat issu des templates segmentés n’est plus fusionné comme une simple lecture OCR et peut remplacer une lecture générique erronée annoncée à 100 % de confiance.
- Donne aux templates appris un canal de consensus dédié pour les compteurs de tokens. Une correspondance segmentée suffisamment forte devient la valeur retenue au lieu de perdre face aux passes génériques/Otsu.
- Lors de l’apprentissage, le localisateur réutilise d’abord la couleur d’encre déjà apprise, puis compare cette segmentation à la découverte générique. Les confirmations successives renforcent donc le même champ au lieu de repartir systématiquement de zéro.
- Synchronise immédiatement le profil utilisé par le raccourci de capture avant le prochain rendu React. Un snapshot lancé juste après **Ajouter cet exemple** ne peut plus relire l’ancien profil.
- Applique aussi la valeur confirmée au brouillon du snapshot courant : token ou cellule de coût correspondante. L’utilisateur voit immédiatement la correction et peut valider l’analyse sans reprendre une capture.
- Corrige `APP_VERSION`, resté par erreur à `0.21.1` dans la v0.22.0 ; les prochains journaux indiqueront correctement `0.22.1`.
- 157 tests passent, dont des régressions sur le carry manuel sous recommandation STOP et sur la priorité d’un template appris exact face à une lecture générique trop confiante.

# v0.22.0 — Apprentissage numérique sans surajustement

- Remplace l’auto-calibrage v0.21.x fondé sur un unique meilleur `(crop, seuil, zoom)`. Une confirmation ne modifie plus le rectangle logique du champ et ne peut plus optimiser un `8` au détriment des valeurs suivantes.
- La couleur sert uniquement à localiser les glyphes à chaque capture. Les masques de chrominance isolent notamment le chiffre violet d’une cellule `Lessons` sans transformer l’image donnée à Tesseract.
- Le crop OCR est reconstruit dynamiquement depuis la source originale, en niveaux de gris bruts, avec une marge proportionnelle à la hauteur des glyphes. Les crops numériques ne sont plus réduits sous leur résolution native.
- Chaque confirmation ajoute des modèles de glyphes 16×24 étiquetés. Une valeur `203` fournit trois échantillons ; les modèles précédents sont conservés et la couleur d’encre est moyennée entre confirmations.
- Un seul chiffre couvert n’est jamais considéré comme un classifieur universel : un modèle appris sur `8` doit dépasser un seuil strict pour reconnaître un autre `8`; une forme différente repasse par Tesseract au lieu d’être forcée à `8`.
- La segmentation privilégie le groupe complet de composants alignés, ce qui protège les nombres multi-chiffres contre les troncatures `6/62`, `9/91` et `8/18`.
- Ajoute un test qui importe réellement `recognizeAtlas` avec un moteur injecté et vérifie la réattribution `SPARSE_TEXT` d’un atlas multi-crops.
- Profil OCR migré en schéma 5. Lors de l’import d’un profil v0.21, seuls les champs touchés par l’ancien auto-calibrage voient leur crop surajusté remis à la zone par défaut ; leurs anciens hyperparamètres sont supprimés. Les autres zones manuelles restent intactes.
- 152 tests passent. La segmentation a également été vérifiée sur la capture fournie : la cellule 133×81 produit un bbox numérique serré de 37×47 px, au lieu du crop pollué par le libellé et la bordure.

# v0.21.3 — Correctif du moteur d’auto-calibrage OCR

- Corrige le mode de segmentation utilisé pendant **Tester et apprendre**. Les 23 variantes étaient empilées dans un même atlas, puis envoyées à Tesseract avec `SINGLE_WORD` ou `SINGLE_CHAR`, deux modes qui décrivent l’image entière et non chaque variante. Cela expliquait les séries de 65/115 lectures vides malgré un chiffre net.
- Tout atlas numérique contenant plusieurs crops utilise désormais `SPARSE_TEXT`, afin que chaque variante soit détectée et réattribuée à sa propre zone.
- Une fois un crop appris et isolé, les modes stricts `SINGLE_WORD` / `SINGLE_CHAR` restent utilisés pour les snapshots suivants.
- Ajoute des régressions sur le routage de segmentation multi-crops et mono-crop.

# v0.21.2 — Auto-calibrage des cellules numériques larges

- Le calibrage assisté teste désormais des sous-zones alignées à droite dans une région large.
- Une zone de coût contenant à la fois le libellé `Lessons · mental` et la valeur peut donc apprendre uniquement le glyphe numérique.
- Les variantes locales historiques restent testées pour les compteurs déjà serrés.
- Ajout d’une régression dédiée ; 146 tests passent.

# v0.21.1 — Correctif de compilation TypeScript

- Corrige le narrowing nullable de `stopNextSectionReadiness` dans `src/solver/song-policy.ts`.
- La branche est déjà limitée à `deadline-now && concertIndex < 4`; une assertion d’invariant explicite rend désormais ce contrat visible au compilateur et détectable à l’exécution.
- Aucun changement de politique ou de calibration OCR par rapport à v0.21.0.

# v0.21.0 — HUNT abandonment, colour discipline and learned OCR calibration

- Added a persistent HUNT outcome. SP +2/+3 targets can now be marked as deliberately abandoned and may no longer reopen the chase on the next page, after a session restore or after undo/redo state reconstruction.
- Added risk-profile HUNT floors (`35 %` safe, `25 %` standard, `15 %` greedy) before deep cycles, plus a hard veto on entering a five-technique cycle in C2/C3. When that veto fires on an open section, `WAIT_RESERVE` now abandons the chase without buying a filler.
- Replayed the reported C3 cycle-4 state (`57/59/33/47/46`, Komorebi/Tachiichi/Nigekiri): the solver now recommends no purchase and preserving the stock instead of `buy-continue:komorebi` at roughly 11 % target probability.
- Reordered technique-colour tie-breaking. After affordability and actual reserve breaches, remaining demand pressure and total cost now precede raw absolute margin. The reported `139/113/93/8/105` state ranks `24 Vocal`, then `25 Passion`, then `30 Dance`.
- Reclassified the 16-song C4 checkpoint as a pacing objective throughout the song policy. Terminal actions remain mechanically valid below 16; continuation is strongly preferred while it can reduce the debt. The final `18 songs ∧ Grand Live Great Success` condition remains the true hard gate.
- Promoted future-section readiness ahead of fixed filler tiers, so `STOP_AND_CARRY_STOCK` and `WAIT_RESERVE` can win when preserving the balance has better costed Friendship/SP prospects. Visible SP targets and Friendship +10 retain explicit immediate-activation priority.
- Added per-field learned numeric OCR calibration (`schemaVersion: 4`). For any token counter or technique-cost cell, the user can enter the true value and run **Tester et apprendre**. The app tries 13 local crop variants across Otsu/raw, multiple OCR scales and whole-number/single-number modes, and stores a setting only when it exactly reproduces the confirmed value.
- Learned readings are reused as an independent consensus source on later snapshots. Settings are persisted/exported with the vision profile and can be forgotten one field at a time.
- Added regression coverage for the exact reported C3 cycle-4 replay, the C4 10/16 state, five-technique HUNT veto, probability-floor abandonment, persistent HOLD, the reported colour-pressure ordering, profile migration and numeric calibration candidate selection. The full suite now contains 145 passing tests.

# v0.20.3 — Advisory checkpoints and taller OCR workspace

- Removed the erroneous UI-level checkpoint gate introduced in v0.20.2. **Concert joué** is a state-synchronization action and can be recorded below the strategic 16-song pacing target.
- Kept the solver-side deadline discipline: while C4 is still actionable, STOP/buy-stop/carry recommendations remain inadmissible below 16 when a continuation can still close the target. This affects advice, not the user's ability to record what happened in-game.
- Replaced the blocking “checkpoint non sécurisé” message with a non-blocking pacing warning. At 14/16, the OCR cockpit now states that the run continues and that the target becomes 18 at Grand Live.
- Increased the desktop window from 1680×1000 to 1680×1160 and the OCR modal ceiling from 1020 px / 97 vh to 1160 px / 98.5 vh, so the three technique cards fit without scrolling on a sufficiently tall display.

# v0.20.2 — Hard checkpoint gates, functional Push override and complete calibration

- Split checkpoint diagnostics into four non-equivalent states: `secured-now`, `closable-before-deadline`, `reachable-with-future-supply` and `impossible` (plus bounded-search `indeterminate`).
- Made every terminal song policy respect the active deadline checkpoint. `STOP_AND_CARRY_STOCK` and `buy-stop` are invalid while the required total is merely affordable rather than already acquired.
- Added a UI-level concert guard using the same section checkpoint, so no button or OCR action can advance C4 below 16 songs.
- Added the exact C4 regression case from the decision log: 10/16 songs, 200/186/183/205/178 tokens and three affordable visible songs now selects a valid `buy-continue`; all terminal exits remain invalid.
- Centralized forced Push selection. Song pages choose the best valid non-blocking `buy-continue`; technique pages derive eligibility from purchasability, solver validity and hard-block safety instead of an optional `overrideEligible` field.
- Recompute immediately after enabling or disabling forced Push. Recommendation logs now keep `normal` and `displayed` separately and encode a forced technique as `option-N:force-buy`.
- Made the main diagnostic, OCR overlay, candidate action and metrics display the forced purchase rather than simultaneously showing the normal STOP verdict.
- Separated the visible three-song page from the single explicitly carried song in persisted state and decision logs. Legacy sessions are sanitized to at most one carried song without losing the full visible page.
- Exposed all 35 OCR calibration targets: five token counters, three technique cards, three technique text regions, fifteen technique cost cells and nine song card/cover/title regions. Fixed the former Tokens group label mismatch that rendered the group empty.
- Removed the live preview scrollbar feedback loop and reserved stable scrollbar space in the calibration viewport to prevent rapid scrollbar appearance/disappearance.
- Kept the numerical OCR algorithm unchanged: existing one-digit and 0/6/9 consensus coverage remains in place; no additional heuristic was introduced without an observed reproducible defect.
- 134 regression tests pass. Core modified TypeScript modules and the complete App source pass strict type analysis; a full Vite/Tauri bundle was not regenerated in this environment because package installation was unavailable.

# v0.20.1 — Readability, full-number OCR and post-purchase consistency

- Increased the desktop OCR window from 1380×900 to 1680×1000, with a 1120×760 minimum and responsive single-column fallback.
- Raised the OCR cockpit, balance, diagnostic and Decision-tab typography from the former 6–10 px micro-scale to a readable 10–17 px scale.
- Prevented `SINGLE_CHAR` passes from running on a complete crop once any whole-number pass has found two or three digits.
- Added a dedicated length-conflict branch: `6/62` and `9/91` trigger Otsu/raw whole-number rereads on the exact token crop; the longer value is accepted only when wide and tight crops confirm it independently.
- Kept unresolved truncation conflicts manual, with explicit `truncated` diagnostics and ranked alternatives.
- Re-derived the plan, protected reserves and simple-mode objective from the exact post-purchase pool before projecting a song continuation.
- Added one canonical `resolveStrategicObjective` used by both song-page projections and the real technique screen after purchase.
- Promoted deadline Great Success completion into the common continuation prefix, fixing the observed C1 recommendation from `buy-stop` to `buy-continue` when the push secures the second manual song.
- Reworded conditional stops as **Acheter puis réévaluer** when the projected post-purchase technique state recommends a push; corrected terminal `STOP_NOW` to **Ne pas acheter · arrêter maintenant**.
- Logs now include `postPurchasePlanId`, `postPurchaseObjective` and `continuationRecommendation` for every buy policy.
- 127 regression tests pass; strict TypeScript/Vite production build and browser rendering at 1680×1000 and 1280×800 pass without horizontal overflow.

# v0.20.0 — OCR cockpit, decision inspector and 0/6/9 consensus

- Rebuilt the OCR modal around a persistent run cockpit: C1→GL timeline, current song/pattern/gauge/18-song progress, undo and concert transition remain available without returning to the main interface.
- Promoted the concert action to a first-class control and kept the exact existing transition semantics: terminal balance, cap increase, verified `+10`, optional carried page, inherited pricing and next pool.
- Added an in-panel **Decision** tab with the active plan, exit/fallback, full reasons, checkpoint/probability metrics, retained stock and a comparison of every visible choice plus the no-purchase policy.
- Kept capture, manual correction and purchase confirmation in the same modal; switching to decision details never closes or resets the OCR workflow.
- Replaced the four/five-card control wall with compact timing, spending, override and Auto/Expert controls while preserving all previous settings.
- Added a grouped whole-number OCR pass for all five token counters. Multi-digit values containing `0`, `6` or `9` now receive an independent raw pass instead of being trusted from sparse-text OCR alone.
- Added character-level Otsu/raw passes for short values and a conservative glyph-hole classifier that distinguishes `9` (upper hole), `0` (central hole) and `6` (lower hole).
- Changed lowercase `b` normalization from `8` to `6`; retained `o/O → 0` and `g/G/q/Q → 9` normalization.
- A conflicting 0/6/9 ensemble now produces a blank manual-review field with ranked one-click alternatives instead of a high-confidence wrong balance. These alternatives and the diagnostic are kept in snapshot logs.
- Added OCR unit coverage for multi-digit ambiguity, independent-preprocessing requirements and synthetic 0/6/9 glyph topology.
- 121 regression tests pass; strict TypeScript and Vite production builds pass.

# v0.18.2 — Terminal stock carry and C2→C4 value

- Added the explicit `STOP_AND_CARRY_STOCK` song-page policy. At a terminal page the solver can now buy, carry the page, or buy nothing and transfer the complete stock through the verified `+10` transition.
- Extended the C2 terminal horizon through C3 to the C4 Friendship pool. Both live transitions, all technique costs and all song costs are paid; no future training income is invented.
- Kept `HUNT → HOLD` strict inside both projections: after SP +2/+3, hidden filler chains remain forbidden.
- Added separate path outcomes for lesson SP (25 per song, 5 per simulated technique), marginal Great Success (+35 stats versus normal success), immediate practice bonus and Live Bonus value.
- Corrected `WAIT_RESERVE` explanations so an affordable visible song now names the protected target it would make unaffordable.
- Fixed choice logging independently of the UI spending toggle: `stateAfter` always deducts confirmed technique/song costs and every C1–C4 concert transition always records the verified `+10` balance.
- Added `stateAfterHash` and now logs every evaluated song policy, including STOP/carry/wait branches, per-policy reasons, value outcomes and one/two-section readiness.
- Uses common deterministic draws across terminal alternatives, a shared transition memo and a 64-trial C2→C4 comparison budget.
- Replayed the reported decisions: the fourth C3 filler now resolves to full-stock STOP; third songs that secure Great Success remain purchases, with a cheaper valid filler preferred when available.
- 114 regression tests pass; the strict TypeScript build and Vite production build pass.

# v0.18.1 — Frontend build fix

- Fixed the TypeScript build failure in `src/solver/song-policy.ts`: the song-policy cache key referenced raw catalogue fields that are not part of `SongTarget`.
- The cache key now uses the canonical decision fields actually carried by `SongTarget`: sorted `roles`, `immediateValue` and `liveValue`.
- This preserves cache separation between structurally different songs without widening the solver transport type with redundant catalogue metadata.
- 109 solver/OCR tests pass. The exact `tsc` errors reported by the Windows build are removed.

# v0.18.0 — Durable diagnostics and bounded song-page solver

- Rebuilt the desktop decision log as a durable append-only NDJSON stream. The file is created at startup under `logs/decision.ndjson` next to the executable when writable, with an automatic AppData fallback.
- Logging failures are no longer swallowed: the OCR panel shows the active path, storage mode, file size and any write error, and can open the containing folder directly.
- Upgraded the log to schema v2 with session id, monotonic sequence, stable state hash, linked recommendation/choice events, pre/post-choice state, candidate vectors, reasons, safety proofs and detailed solver timings.
- Kept 8 MB rotation as `decision.previous.ndjson`; browser mode retains the latest 500 v2 entries.
- Profiled the reported 5–10 second song-page latency and exposed the internal breakdown for technique simulation, paid future pages, cross-section value and cache status.
- Added bounded adaptive budgets for local technique Monte-Carlo, transition-aware page rollout and cross-section evaluation.
- Removed the remaining free-technique song-only DP tie-break from the active policy; paid transition rollout is now the source for hidden-target continuation.
- A visible affordable chase target suppresses dominated hidden-page rollouts.
- Replaced allocation-heavy checkpoint capacity recursion with a bitmask branch-and-bound that may stop as soon as the required 16/18 lower bound is proved.
- Added a 24-state LRU cache for identical song-page analyses; repeated validation of the same snapshot is effectively immediate.
- On the benchmark states used during this pass, first song-page analysis fell from roughly 7–15 seconds to about 1.2–1.9 seconds; an unchanged repeated state resolves in under 1 ms.
- Added regression tests for state-hash stability, linked v2 log entries, bounded rollout budgets, visible-target short-circuiting and cache identity.
- 109 regression tests pass.

# v0.17.1 — Prospective terminal carry decision

- Fixed the terminal `CLOSE` regression where the technique solver equated “the next page is reachable and contains an affordable song” with “paying the remaining techniques for carry is profitable”.
- Added an explicit `STOP_NOW` versus `EXPOSE_AND_CARRY` comparison before a song page is exposed.
- The push branch now simulates the observed technique, remaining adaptive techniques, actual page draw, best valid carried song, verified `+50/+10` transition and bounded next-section value.
- Existing technique spending is never treated as sunk-cost justification; only future techniques and future state are compared.
- A terminal carry push now requires threshold-safe page exposure, no degradation of the next hard checkpoint and a measurable structural gain in checkpoint, target, Friendship +10, expected Friendship or structural purchases.
- Current checkpoint debt remains owned by the hard-close path: exposing a page for carry cannot repair `15/16`.
- Express `CLOSE` uses `any-song` only while the current checkpoint is actually missing; otherwise its local objective is `carryover`, with profitability decided by the prospective evaluator.
- Decision logs and the OCR overlay now include the terminal branch, expected terminal technique cost and the exact reason why STOP or carry wins.
- Added regressions for the reported “four techniques / ~80 tokens / only filler carry” case and the symmetric real-debt case.
- 105 regression tests pass.

# v0.17.0 — Decision safety, force-push override and diagnostic log

- Added a solver-owned safety classification for every visible technique/song: recommended, safe alternative, secondary or hard-blocking.
- Hard-blocking is conservative and proof-based: unaffordable actions, deterministic loss of every currently affordable active target, exact checkpoint impossibility or final-gate failure. A mere probability decrease is never shown in red.
- Integrated immediate blockers into the real observed-technique ranking before risk/probability. A non-blocking choice outranks a deterministic blocker even when the blocker has better raw Monte-Carlo values.
- Added explicit red cards/overlay boxes. If all choices block, the UI labels the selected one as the least-bad blocking choice instead of painting it green.
- Distinguished the primary recommendation, safe alternative and generic second choices across the main UI, OCR panel and overlay.
- Expanded the overlay with a compact forward path: remaining techniques, next-page/target probabilities, planned action and checkpoint states.
- Added a user-controlled force-push override. It exposes the best non-blocking continuation when normal policy says HOLD/STOP without modifying the RuleSet or bypassing hard constraints; it resets at the next concert.
- Added a persistent NDJSON decision log containing the full pre-decision state, all evaluated candidates, normal/displayed recommendation, safety proofs, user-confirmed choice, timing data and previous-decision linkage.
- Desktop logs are written to the Tauri app log directory as `decision-log.ndjson`, rotate at 8 MB and can be exported or cleared from the OCR panel. Browser mode retains the latest 500 entries.
- Instrumented capture, primary OCR, OCR retries, solver and total pipeline time in the panel and log.
- Pre-warms the recoverable Tesseract worker when the panel opens.
- Groups all uncertain/single-digit token retries into at most two OCR atlases instead of retrying each counter separately; numeric `g/G/q/Q` confusions normalize to `9`, and token crops receive extra padding/scale.
- Added regression coverage for deterministic blocker ranking and OCR 9 normalization.
- 103 regression tests pass.

# v0.16.0 — Audit hardening and snapshot-only cleanup

- Fixed the cross-section HUNT → HOLD transition. After acquiring SP +2 or SP +3 inside `V_next`, the plan is re-derived immediately and no hidden optional chain is opened under HOLD.
- Separated current-pool reserves from future-section reserves. A purchased song disappears from technique pressure as soon as it leaves the pool.
- Propagated bounded-search exactness through checkpoint supply. A truncated lower bound can prove reachability, but can never produce `impossible · verified`; insufficient truncated results are now `indeterminate · heuristic`.
- Canonicalized song pools by stable id before exact/approximated DP sampling, Monte-Carlo page draws and seed construction. Results no longer depend on catalog insertion order in the sampled regime.
- Removed the fixed `[5, 9, 12, 15, 18]` pace route from Run Pulse. The beta indicator remains descriptive and no longer penalizes valid non-standard song distributions.
- Serialized OCR captures with a generation gate, rejected stale results, prevented double-hotkey execution and made Tesseract worker initialization recoverable after failure.
- Reduced the vision profile to the actual manual snapshot product (`schemaVersion: 3`): tokens, three technique cards, three song cards, hotkey and overlay only. Removed unreachable automatic page/run/concert detection and legacy automation settings.
- Added session hydration invariants for owned, active, visible and carried songs.
- Extracted the 21-song catalog from `App.tsx`; added tests linking real `unlockPhase` counts to the RuleSet and linking the public vision profile to the TypeScript canonical profile.
- Removed orphaned policy types, role helpers, image fingerprints, unused supply variants and stale parameters.
- CI now runs on pull requests and reacts to tests/documentation changes. TypeScript now enables `noUnusedLocals` and `noUnusedParameters`.
- Added an audit disposition document explaining accepted fixes, preserved explicit decisions and deferred structural work.
- 99 regression tests pass. Strict core TypeScript and full-source syntax validation pass.

# v0.15.0 — Verified live transition and cross-section value

- Promoted the Global post-live transition to a verified RuleSet mechanic: after C1–C4, `New Supporters!` raises every Performance Point cap by `+50`, then credits `+10` to all five balances under the new cap.
- Added `evaluateCrossSectionReadiness`, a real `V_next(T_live(s))` rollout chaining the terminal current-section choice, verified live transition, optional carried song, next pool, next plan and bounded next-section technique/song cycles.
- Cross-section readiness uses full crossed song costs and the shared transition kernel. No hand-written Dance/Visual proxy is used for the two C4 Friendship +10 songs.
- Terminal buy, continue and carry policies now compare the following section as part of their continuation vector. Carry value comes from the pattern point and future state, never from sunk costs.
- The current implementation exposes the conservative `verified-live-transition-no-training-income` branch: it credits the verified `+10` but invents no future training supply.
- Added diagnostic metrics for the guaranteed-stock next-section checkpoint and projected Friendship bonus.
- Added per-trial terminal state output to the shared transition-aware kernel, including retained vector, structural purchases and actual Friendship percentage.
- Added empirical calibration notes for the observed `4 / 2 / 3 / 7` route: C2 Great Success sacrificed after SP +2, chained carries, 17 total songs before the fourth concert, and Friendship `+15 % → +45 %`.
- Added a comprehensive technical recap in `docs/TECHNICAL_RECAP_2026-08-03.md`.
- 89 regression tests pass; strict core TypeScript and TSX syntax validation pass.

# v0.14.0 — Strict HOLD policy

- Split strategic song semantics into `chaseTargets`, `visibleOptionalTargets`, and `reserveTargets`. Hidden targets, visible opportunities, and future token reserves no longer share one flag.
- After SP +2 / SP +3 is acquired, `HOLD` has no hidden chase target. Friendship and still-relevant SP songs may be bought only when already visible.
- `BUY_AND_CONTINUE` is invalid in `HOLD`; a visible structural opportunity becomes `BUY_AND_STOP`, while a filler defaults to `WAIT_RESERVE`.
- Great Success C2/C3 no longer turns `HOLD` into an `any-song` objective. It remains informational and may only act as a tie-break, not as a reason to open a new chain.
- Mid-section pattern progress never creates urgency. Even the final remaining technique is ignored under `HOLD`; only terminal `CLOSE` may justify finishing it from prospective value.
- Reserve-aware technique pressure now consumes only `reserveTargets`, so a visible optional song does not silently become a future-page chase target.
- The configured post-live `+10` token transition is now explicitly marked `unverified`. It remains in the legacy carry model but is blocked conceptually from the future C3→C4 value function until measured in game.
- Added end-to-end regressions for strict HOLD, visible Friendship `BUY_AND_STOP`, filler `WAIT_RESERVE`, and the no-sunk-cost mid-section invariant.
- 85 regression tests pass.

# v0.13.1 — Reserve-aware technique ranking

- Reconnected the reserve-aware `compareTechniqueSpending` policy to the actual observed-technique ranking used by the main UI and OCR overlay.
- The shared Monte-Carlo transition kernel now uses the same reserve-aware tie-break for generated future offers.
- Generation profile and current/next-section song vectors now affect the recommendation itself instead of remaining diagnostic-only inputs.
- Added an end-to-end regression for `242 / 64 / 78 / 65 / 98` with `Visual 16 / Mental 15 / Dance 16`: Dance is selected after continuation equivalence.
- Crossed `42/42` and `50/50` cases are now tested through the real user ranking path, while coverage remains strictly prior to surplus spending.
- Removed the manual `turns before concert` decision control and dead session plumbing: it was displayed but had no effect. The operative timing input remains `section-open / deadline-now`.
- 80 regression tests pass.

# v0.13.0 — CLOSE ordering and OCR workflow

- CLOSE now compares hard objectives as feasibility states instead of raw Monte-Carlo values. Once the checkpoint remains feasible, a visible Friendship outranks a filler; exact continuation probability only breaks ties between equivalent structural roles.
- Added a regression test reproducing the C4 `Our Blue Bird Days` versus `Precious Treasure Box` / `Fanfare for the Future!` case.
- Snapshot OCR now auto-applies and analyzes a capture only when page, five tokens and all expected offers satisfy their confidence and validity thresholds.
- Incomplete or uncertain captures retain the recognized values, block analysis, and turn the Snapshot button into `Valider et analyser` after manual correction.
- Manual confirmation promotes the corrected readings to trusted values instead of leaving stale OCR confidence in the overlay.
- The OCR panel now includes the remaining decision controls: tracked spending, section timing, Auto/Expert mode, risk, generation profile, turns before concert, technique objective and next-concert/carryover progression.
- 75 regression tests pass.

# v0.12.0 — Transition-aware song planning

- Added a shared technique transition kernel used by both `runAnalysis` and forward song projections.
- Future song pages now pay the actual adaptive technique costs before evaluating affordability.
- Hard checkpoint probabilities no longer use the song-only DP as if transitions were free.
- The next-page target probability now comes directly from the Monte-Carlo post-technique balance.
- Song policy now propagates the inherited first-offer pricing after a concert.
- Multi-page Great Success is shown as unknown instead of reusing page reach under the wrong label.
- Missed SP +2/+3 songs retain a time-decaying intrinsic tier instead of becoming filler immediately.
- Structural tiers remain ordinal across multiple pages; low tiers are no longer summed into higher roles.
- Raw checkpoint capacity is labelled `finançable hors techniques` to expose that it is only a song-cost upper bound.
- Added eight regression tests; 71 tests pass.

# v0.11.1 — Recommendation consistency fix

- A final technique purchase no longer falls back to **Stop** when it deterministically opens the song page and at least one song remains affordable.
- An affordable **Friendship +10%** song is now a primary buy recommendation instead of being demoted behind **Wait / reserve**.
- Added regression tests for both cases.

# Live Route Snapshot OCR v0.11.0

## Contrat mécanique Grand Live

- Pool cumulée `8/11/15/21`, patterns C1–Grand Live et préfixe Junior fermé.
- Make Debut! et GIRLS' LEGEND U comptent automatiquement dans leur jauge :
  deux achats manuels suffisent en C1 et au Grand Live.
- Checkpoints 16/18, porte finale conjointe `18 ∧ Great Success`, cap dynamique
  de 200 à 400 et crédit `+10` aux cinq tokens après C1–C4.
- Le carry final est interdit et l’OCR accepte désormais les stocks jusqu’à 400.

## Nouveau moteur de décision

- Plans explicites `ACCUMULATE/HUNT/HOLD/CLOSE/CONVERT`, avec condition de
  sortie et repli affichés dans le diagnostic.
- Rôles structurels SP +2, SP +3, Friendship +10/+5 et Specialty Priority ;
  les micro-bonus de stats ne reçoivent plus de valeur stratégique.
- Comparaison lexicographique : contrainte dure, seuil de risque, objectif du
  plan, continuation vectorielle, coût marginal et identifiant stable.
- Couverture exacte d’une page et DP multi-pages déterministe, sous loi uniforme
  ou pondérée déclarée.
- `WAIT_RESERVE` est séparé du carry ; la page exposée est simulée après le
  live, avec le +10, le retard d’activation et une seule technique héritée
  économisée.

## Interface et explicabilité

- Nouveau signal « section ouverte / concert maintenant ».
- Jauge manuelle et crédit automatique sont affichés séparément.
- Les seuils 16/18 utilisent les statuts garanti, atteignable sur stock, dépend
  de la supply ou impossible.
- Les probabilités de pages sont explicitement annoncées comme conditionnelles
  au hasard de boutique ; aucun taux absolu vers 18 n’est inventé.

## Validation

- Scénarios croisés `42/42` et `50/50`, gros surplus, SP +2/+3,
  `WAIT_RESERVE`, carry rendu faisable par +10, invariance de solde, carry final,
  porte finale et déterminisme.
- Tests de monotonie, d’invariance à l’ordre, de loi pondérée et de
  non-régression OCR/Run Pulse.

# Live Route Snapshot OCR v0.10.2

## Fiabilité OCR et prévisualisation

- Chaque token potentiellement à un chiffre est relu en `SINGLE_CHAR`.
- Deux prétraitements spécialisés, Otsu et niveaux de gris, sont comparés à la
  lecture générale.
- L’accord entre pipelines prime sur une confiance isolée ; un désaccord trop
  proche reste à confirmer.
- La capture et ses rectangles partagent désormais le même cadre au ratio
  natif : le letterboxing ne décale plus visuellement la calibration.

## Arbitrages du solver

- À probabilités équivalentes, le choix de technique protège d’abord la
  réserve après achat et dépense le token au plus gros surplus réel.
- L’exemple `203 / 18 / 27 / 97 / 19` classe désormais `Dance 25`, puis
  `Visual 30`, puis `Vocal 24`.
- `Skill Pt training +2/+3` possède une valeur propre, supérieure à un bonus
  de stat du même nombre.
- Une song prioritaire déjà affichée reçoit une prime immédiate. Sur l’offre
  observée, **Run for Our Dream!** passe devant **Hey, Guess What!**.

## Validation

- Tests dédiés aux chiffres `1`, `6`, `8`, `9` et aux conflits de lecture.
- Test de prévisualisation 16:9 letterboxée.
- Tests de non-régression sur les deux arbitrages observés.

# Live Route Snapshot OCR v0.10.1

## Progression depuis le panneau OCR

- Chaque technique et song reconnue expose désormais un bouton
  **J’ai acheté** après l’analyse.
- La recommandation et l’alternative sont identifiées directement dans la
  liste OCR.
- La confirmation réutilise les actions du solver : historique, progression
  du cycle, ownership des songs, Run Pulse et dépense dynamique.
- Une offre inabordable est bloquée avant confirmation.
- Après l’achat, le panneau est réinitialisé et suit automatiquement la
  prochaine page attendue.

## Tokens à un chiffre

- Second passage OCR par compteur lorsque la première lecture échoue.
- Segmentation Tesseract `SINGLE_CHAR` avec whitelist numérique.
- Seuil adapté aux chiffres isolés, tout en conservant leur confiance réelle
  dans l’interface de validation.

# Live Route Snapshot OCR v0.10.0

## Nouveau périmètre

- Acquisition OCR exclusivement sur snapshot manuel.
- Raccourci global configurable, actif même lorsque le panneau est fermé.
- Deux modes ciblés : trois techniques ou trois songs.
- Lecture des cinq tokens sur chaque snapshot.
- Relecture et correction de chaque valeur avant envoi au solver.
- Overlay passif : recommandation en vert, alternative en jaune.

## Fiabilité

- Les techniques sont reconnues par leurs cinq coûts fixes, sans classification
  fragile du texte d’effet.
- Les duos sont validés comme vecteurs à deux tokens.
- Les songs combinent OCR du titre et empreinte de pochette.
- La page peut suivre l’état du solver ou être forcée explicitement.
- Les zones de calibration sont limitées à celles réellement utilisées.
- La vue de calibration est large et zoomable de 25 % à 300 %.

## Simplification

Suppression de l’acquisition continue, de la détection de la page Career, du
suivi de date, de la progression automatique, du journal de run et de la
détection d’achats. La progression reste confirmée dans le solver.

## Solver

Synchronisation sur la dernière version fournie du solver :

- coûts hérités de techniques après concert ;
- règle cohérente acheter-puis-pousser ;
- Run Pulse bêta ;
- suite de tests actualisée.

## Configuration

- Profil local automatiquement sauvegardé.
- Import/export JSON.
- Réglages OCR et géométrie d’overlay accessibles dans l’interface.
- Profil par défaut calibré sur la disposition Steam globale 2048×1152.

## v0.22.4

- Corrige l'inversion du tarif hérité après un concert : les prix de la période précédente ne sont conservés que lorsqu'une page est réellement portée.
- Une transition normale C3 → C4 valide immédiatement les coûts Senior (24, 25, 30, 35, 40) au lieu de les contrôler avec la table Classic.

### Détection de décalage de concert

- Les trois coûts OCR sont comparés aux barèmes Junior, Classic et Senior.
- Un avertissement n'apparaît que si les trois offres correspondent sans ambiguïté à une autre période.
- Si l'état est probablement un concert en avance, le cockpit propose d'annuler le dernier concert.
- Les pages de coûts compatibles avec plusieurs périodes ne déclenchent aucun diagnostic.

## v0.22.5

- Corrige la validation OCR du refresh de techniques hérité après un carryover : acheter la song portée ne supprime plus prématurément le barème de la période précédente.
- Le barème hérité reste actif jusqu'au premier achat de technique, puis la page suivante utilise normalement le barème courant.
- Migre automatiquement les sessions v0.22.3-v0.22.4 déjà enregistrées dans l'état post-carryover concerné.

## v0.22.6

### C4 : le total 16 redevient un simple repère

- La fin de C4 utilise désormais le plan `CLOSE · fin C4` au lieu de `CLOSE · checkpoint 16`.
- Le total 16 n'est plus injecté dans le vecteur lexicographique comme une cible à fermer avant le concert.
- Une action sous 16 reste évaluée selon sa valeur immédiate, Great Success, la Friendship visible et la trajectoire réelle vers 18 au Grand Live.
- Le statut 16 ne peut plus produire un faux blocage rouge ni le message « fermeture 16/18 impossible ».
- L'interface affiche `Repère de rythme 16` avec des libellés non mécaniques (`Atteint`, `Finançable maintenant`, `Rattrapable plus tard`).

### Friendship +10 visible

- Le replay C4 à 11 songs recommande désormais `Precious Treasure Box` en `buy-continue` devant le filler, au lieu de la reléguer en alternative à cause d'un écart probabiliste infinitésimal vers 16.
- Le replay C4 à 13 songs recommande `Fanfare for the Future!` en `buy-stop`, sans la qualifier de politique bloquante.
- La seule porte dure reste `18 songs ∧ Great Success final` au Grand Live.

---

# v0.22.9-web.1 — branche web (fork parallèle)

> Branche partie de `v0.22.9`, développée en parallèle de la ligne Snapshot OCR
> et réintégrée en `v0.25.0`. Son moteur a été abandonné au profit de la
> `v0.24.0` ; seule sa refonte de présentation a été conservée.

## Base fonctionnelle

- Synchronise le frontend web sur le moteur Snapshot OCR v0.22.9.
- Retire intégralement Tauri, la capture Windows, Tesseract, les profils OCR,
  l’overlay, les raccourcis globaux, les assets OCR et les tests associés.
- Conserve uniquement React, ReactDOM, TypeScript et Vite comme dépendances.
- Remplace le journal desktop par un journal navigateur borné à 500 entrées,
  exportable et effaçable depuis le footer.
- Remplace tous les libellés de capture par un flux de saisie web explicite.

## Correctifs moteur repris

- **v0.22.9** : un carryover crédite une technique, sans conserver un tarif de
  concert précédent ; les sessions historiques contenant
  `techniqueCarryoverPeriod` l’ignorent.
- **v0.22.6** : 16 songs est un repère de rythme et non une porte dure ; les
  actions mécaniquement valides restent disponibles sous 16.
- **v0.22.1** : la page peut être portée manuellement même lorsque la politique
  normale recommande `stop-and-carry-stock`.
- **v0.21.0** : abandon HUNT persistant, seuils de chasse par profil de risque,
  veto sur les chaînes profondes faibles et meilleure discipline de couleur.
- **v0.20.3** : les transitions de concert enregistrent la run sans bloquer sur
  un checkpoint stratégique manqué.
- **v0.20.2** : Push forcé distinct du verdict normal et affichage cohérent du
  candidat forcé.
- **v0.20.1** : la décision post-achat est recalculée depuis l’état réellement
  projeté ; les bonus SP, Great Success, entraînement immédiat et Live Bonus
  restent séparés.
- **v0.18.2** : STOP terminal explicite, horizon C2→C4 coûté, comptabilité exacte
  des achats et transition `+10` vérifiée.

## Interface et données

- Conserve les modes **Suivi live** et **Reconstitution manuelle**.
- Conserve Auto/Expert, les profils de risque et de génération, Run Pulse,
  l’historique annulable, le suivi du solde et les contrôles de carryover.
- Vérifie les 21 songs, leurs phases `8/3/4/6`, leurs coûts, leurs identifiants
  uniques et la présence de chaque asset local.
- Met à jour les textes de checkpoint : 16 est informatif, 18 reste la porte
  finale conjointe avec Great Success.

## Validation de cette archive

- 115/115 tests web et solveur réussissent.
- Analyse TypeScript stricte des sources applicatives réussie avec déclarations
  React locales de validation ; aucun import OCR/Tauri ne subsiste.
- Le build Vite complet n’a pas été régénéré dans l’environnement de production
  de l’archive, car son miroir npm interne ne fournit pas les dépendances React.
  La CI incluse exécute `npm ci`, `npm test` et `npm run build` sur GitHub Actions.
