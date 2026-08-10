# GrandLiveCarryoverPlanner — correctif terminal v0.17.1

**Date : 3 août 2026**

## Problème observé

À l'échéance d'une section, le solveur pouvait recommander quatre techniques
coûtant environ 80–90 tokens uniquement pour exposer une page de songs et la
porter au concert suivant, alors que :

- la SP cible était déjà acquise ;
- les Friendship utiles étaient déjà acquises ;
- le checkpoint courant était sécurisé ;
- la pool restante ne contenait plus qu'une faible valeur structurelle.

Ce comportement contredisait directement le contrat de la v0.15–v0.17 : un
carry doit être valorisé par l'état futur qu'il produit, jamais par le fait que
la chaîne est atteignable ou déjà partiellement engagée.

## Cause exacte

Le chemin technique et le chemin song n'utilisaient pas la valeur inter-section
au même moment :

```text
Écran techniques
runAnalysis : techniques → page atteignable → une song achetable

Écran songs déjà ouvert
evaluateCrossSectionReadiness : achat/carry → +50/+10 → section suivante
```

En `CLOSE`, l'interface imposait en plus `objective = any-song`. Une forte
probabilité d'atteindre une page achetable suffisait donc à produire `PUSH`,
avant que la rentabilité réelle du carry ne soit calculée. La v0.17 possédait
le bon kernel futur, mais ne le branchait qu'après l'exposition de la page.

## Correction

La v0.17.1 ajoute `evaluateTerminalTechniqueOptions()` et compare :

```text
STOP_NOW
versus
EXPOSE_AND_CARRY
  = technique observée
  + techniques restantes adaptatives
  + tirage réel de la page
  + meilleure song portée valide
  + transition vérifiée cap +50 / solde +10
  + V_next de la section suivante
```

La simulation trial par trial réutilise :

- `simulateTechniqueTransition()` ;
- la même loi de tirage canonique que `song-transition.ts` ;
- `evaluateExposedCarry()` ;
- `simulateCrossSectionReadinessTrial()` extrait du kernel inter-section.

Aucun coût déjà payé ne participe au verdict.

## Condition de push terminal

`EXPOSE_AND_CARRY` doit simultanément :

1. atteindre la page au seuil de risque actif ;
2. ne pas dégrader l'état du prochain checkpoint ;
3. améliorer réellement au moins un axe structurel :
   - probabilité de checkpoint ;
   - acquisition de la cible suivante ;
   - accès à une Friendship +10 ;
   - Friendship attendue ;
   - achats structurels attendus.

Le simple ajout d'une song, le thinning ou l'économie d'un point de pattern ne
suffisent plus à payer quatre techniques coûteuses en l'absence de bénéfice
structurel mesuré.

## Dette dure conservée

Le nouveau comparateur ne s'applique pas si le checkpoint du concert courant
est encore incomplet. À `15/16`, une page portée ne résout rien : le solveur
reste sur le chemin `hard-close`, qui doit exposer puis acheter une song avant
le concert.

## Interface, overlay et logs

La décision terminale est attachée au résultat :

- `STOP_NOW` ou `EXPOSE_AND_CARRY` ;
- probabilité d'exposer la page ;
- coût terminal attendu ;
- probabilités et valeurs stop/push ;
- raison exacte du verdict.

Le journal NDJSON conserve cette raison dans la recommandation. L'overlay
affiche maintenant la branche gagnante et le coût attendu, ce qui rend ce type
d'incohérence directement auditable sur une capture future.

## Validation

Deux régressions dédiées ont été ajoutées :

1. C3 terminal, SP/Friendship absentes de la pool restante, checkpoint sécurisé,
   quatre techniques et coût attendu supérieur à 70 : `STOP_NOW` ;
2. C4 à `15/16` : le comparateur carry ne s'active pas et laisse le hard-close
   acheter avant le concert.

Résultat : **105/105 tests Node réussis**. Le noyau TypeScript modifié passe en
mode strict avec `noUnusedLocals/noUnusedParameters`, et les fichiers TS/TSX
modifiés passent l'analyse syntaxique.
