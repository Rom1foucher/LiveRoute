import type { Message, PlanId } from "./messages.ts";
import type { PlanMode } from "../planner/strategic-plan.ts";

/** One decimal, matching the previous `Math.round(x * 1000) / 10` shape. */
const pct1 = (value: number): string => String(Math.round(value * 1000) / 10);
const pct0 = (value: number): string => String(Math.round(value * 100));
const fixed1 = (value: number): string => (value * 100).toFixed(1);
const fixed0 = (value: number): string => (value * 100).toFixed(0);
const tenth = (value: number): string => String(Math.round(value * 10) / 10);
const whole = (value: number): string => String(Math.round(value));

const planLabelFr = (planId: PlanId, mode: PlanMode): string => {
  switch (planId) {
    case "convert-final":
      return "CONVERT · Grand Live";
    case "hunt-sp2":
      return "HUNT_SP2";
    case "hunt-sp3":
      return "HUNT_SP3";
    case "close-c4":
      return "CLOSE · fin C4";
    case "accumulate-c4":
      return "ACCUMULATE · préparer C4";
    case "accumulate-c1":
      return mode === "close"
        ? "CLOSE · concert C1"
        : "ACCUMULATE · attendre avant C1";
    case "close-checkpoint":
      return "CLOSE · concert";
    case "hold":
      return "HOLD";
  }
};

const planExitFr = (
  planId: PlanId,
  mode: PlanMode,
  manualGaugeTarget: number,
): string => {
  switch (planId) {
    case "convert-final":
      return "Sécuriser Great Success final, puis convertir les tokens restants en +5 SP par technique et +25 SP par song.";
    case "hunt-sp2":
      return "SP training +2 achetée, puis passer à HOLD.";
    case "hunt-sp3":
      return "SP training +3 achetée, puis passer à HOLD.";
    case "close-c4":
      return "Prioriser les meilleures songs encore rentables avant le Grand Live, surtout Friendship +10 puis +5 ; 16/18 restent des indicateurs de trajectoire, pas des objectifs d’achat.";
    case "accumulate-c4":
      return "Préparer C4 en priorisant Friendship +10 puis +5 et leur timing d’activation ; 16/18 restent de simples repères de rythme.";
    case "accumulate-c1":
      return mode === "close"
        ? `Acheter les songs justifiées ; ${manualGaugeTarget} manuelles remplissent la jauge C1.`
        : "Le concert devient imminent.";
    case "close-checkpoint":
      return `Atteindre ${manualGaugeTarget} songs manuelles pour Great Success, puis passer en HOLD.`;
    case "hold":
      return "Attendre sans ouvrir de nouvelle chaîne ; acheter seulement une opportunité structurelle déjà exposée.";
  }
};

const planFallbackFr = (planId: PlanId): string => {
  switch (planId) {
    case "convert-final":
      return "Terminer lorsque plus aucune technique ni song abordable ne peut convertir les tokens restants.";
    case "hunt-sp2":
      return "Si la cible est affichée mais inabordable, conserver la page et produire les tokens manquants.";
    case "hunt-sp3":
      return "Protéger son vecteur de coût ; une Friendship ne passe devant que si elle conserve la cible et domine réellement la continuation.";
    case "close-c4":
      return "Sans cible structurelle suffisamment rentable, préserver le stock : les fillers tardifs ne valent pas une Friendship majeure achetée au bon moment.";
    case "accumulate-c4":
      return "Économiser : acheter tôt n’active pas le Live Bonus avant C4 et retire de l’information.";
    case "accumulate-c1":
      return "Conserver les couleurs rares et ne pas poursuivre uniquement pour un micro-bonus de stat.";
    case "close-checkpoint":
      return "Une fois Great Success sécurisé, ne plus ouvrir de nouvelle chaîne optionnelle.";
    case "hold":
      return "Économiser et conserver l’information de la prochaine page.";
  }
};

export const renderFr = (message: Message): string => {
  switch (message.code) {
    // ── Strategic plan identity ────────────────────────────────────────────
    case "plan.label":
      return planLabelFr(message.planId, message.mode);
    case "plan.exit":
      return planExitFr(
        message.planId,
        message.mode,
        message.manualGaugeTarget,
      );
    case "plan.fallback":
      return planFallbackFr(message.planId);

    // ── Checkpoint supply ──────────────────────────────────────────────────
    case "supply.status":
      switch (message.status) {
        case "secured-now":
          return "déjà sécurisé";
        case "closable-before-deadline":
          return "à fermer avant le concert";
        case "reachable-with-future-supply":
          return "dépend de futurs gains";
        case "indeterminate":
          return "capacité indéterminée";
        case "impossible":
          return "impossible";
      }
    // eslint-disable-next-line no-fallthrough
    case "checkpoint.name":
      return message.checkpointId === "songs-16"
        ? "Repère de rythme 16 songs"
        : "Checkpoint 18 songs";

    // ── Song policy: shared prefix ─────────────────────────────────────────
    case "policy.noPurchase":
      return "Aucun achat";
    case "reason.plan":
      return `plan ${planLabelFr(message.planId, message.mode)}`;
    case "reason.structuralTargetVisible":
      return "objectif structurel déjà affiché";
    case "reason.chaseTargetVisible":
      return "cible de chasse déjà affichée";
    case "reason.opportunityVisible":
      return "opportunité visible, sans chasse supplémentaire";
    case "reason.gate18Impossible":
      return "18 impossible avec le stock actuel";
    case "reason.gate18FutureSupply":
      return "18 dépend encore de futurs gains de tokens";
    case "reason.capacityIndeterminate":
      return "capacité exacte indéterminée : recherche bornée";
    case "reason.noAffordablePlanTarget":
      return "aucune cible du plan ne reste achetable immédiatement";

    // ── Song policy: buy branch ────────────────────────────────────────────
    case "reason.huntAbandonTechniqueCount":
      return `abandon HUNT : le prochain cycle demande ${message.techniques} techniques`;
    case "reason.huntAbandonBelowFloor":
      return `abandon HUNT : ${fixed1(message.probability)} % de trouver et financer la cible, sous le seuil ${fixed0(message.floor)} %`;
    case "reason.huntContinuationRefused":
      return `${renderFr(message.cause)} · continuation HUNT refusée`;
    case "reason.huntAbandonMarginalValue":
      return `abandon HUNT après ${message.pages} page(s) ratée(s) : ${fixed1(message.probability)} % find & fund, valeur marginale ${message.netValue.toFixed(1)}`;
    case "reason.huntContinueMarginalValue":
      return `poursuite HUNT après ${message.pages} page(s) ratée(s) : ${fixed1(message.probability)} % find & fund, valeur marginale ${message.netValue >= 0 ? "+" : ""}${message.netValue.toFixed(1)}`;
    case "reason.huntAbandonUnreachable":
      return `abandon HUNT : apparition de la cible à ${fixed1(message.appearanceProbability)} % après ${message.pages} page(s) ratée(s)`;
    case "reason.huntContinueReachability": {
      const funding =
        message.fundingAssessment === "future-income-required"
          ? "le financement zero-income actuel est insuffisant ; le revenu des trainings futurs reste inconnu"
          : `fundability zero-income ${message.zeroIncomeFundabilityProbability === null ? "inconnue" : `${fixed1(message.zeroIncomeFundabilityProbability)} %`}`;
      return `HUNT reste actif après ${message.pages} page(s) ratée(s) : ${fixed1(message.appearanceProbability)} % d'apparition, ${fixed1(message.findAndFundProbability)} % find & fund zero-income ; ${funding}`;
    }
    case "reason.securesGreatSuccess":
      return "sécurise Great Success";
    case "reason.nextSectionCheckpoint": {
      const horizon =
        message.horizonSections === 2
          ? "jusqu’à C4"
          : "sur la section suivante";
      const checkpoint = message.checkpointRequired
        ? `checkpoint ${message.checkpointRequired}`
        : "objectif de la section suivante";
      return `${pct1(message.probability)} % sur ${checkpoint} ${horizon}, transition(s) +10 incluse(s)`;
    }
    case "reason.nextSectionValue": {
      const horizon =
        message.horizonSections === 2
          ? "jusqu’à C4"
          : "sur la section suivante";
      return `valeur inter-section sans revenu futur : ${tenth(message.friendshipBonus)} % Friendship acquis, exposition ${tenth(message.friendshipTrainingExposure)} %·entraînement, SP-training ${tenth(message.spTrainingExposure)}, autres entraînements ${tenth(message.practiceTrainingExposure)}, et ${whole(message.lessonSkillPoints)} SP de lessons attendus ${horizon}`;
    }
    case "reason.boundedLessonSkillPoints":
      return `${message.points} SP de lessons sur ce chemin borné`;
    case "reason.stopNotCommitted":
      return "arrêt non engagé : les techniques réellement affichées seront réévaluées après l’achat";
    case "reason.reachNextPage":
      return `${pct0(message.probability)} % d’atteindre la prochaine page`;
    case "reason.findAndFundTarget":
      return `${pct1(message.probability)} % de trouver et financer la cible sur ${message.pages} page(s) avec techniques payées`;
    case "reason.boundedMonteCarlo":
      return "projection Monte-Carlo bornée, sans futur gain d’entraînement";

    // ── Song policy: carry branch ──────────────────────────────────────────
    case "reason.carryNextSectionCheckpoint":
      return `${pct1(message.probability)} % sur ${message.horizonSections === 2 ? "l’horizon C4" : "la section suivante"} après transition(s) vérifiée(s) +10`;
    case "reason.carryNextSectionValue":
      return `valeur inter-section sans revenu futur : ${tenth(message.friendshipBonus)} % Friendship acquis, exposition ${tenth(message.friendshipTrainingExposure)} %·entraînement, SP-training ${tenth(message.spTrainingExposure)}, autres entraînements ${tenth(message.practiceTrainingExposure)}, et ${whole(message.lessonSkillPoints)} SP de lessons attendus`;
    case "reason.carriedSongLessonSkillPoints":
      return `${message.points} SP de lesson à l’achat de la song portée`;

    // ── Song policy: stop branch ───────────────────────────────────────────
    case "reason.stopFullStockCarries":
      return "aucune song achetée : tout le stock traverse le concert puis reçoit le crédit +10";
    case "reason.pacingTargetMissed":
      return `objectif de rythme ${message.target} non atteint : ${message.totalSongs}/${message.target}, sans blocage mécanique`;
    case "reason.stopNextSectionCheckpoint": {
      const horizon =
        message.horizonSections === 2
          ? "jusqu’à C4"
          : "sur la section suivante";
      const checkpoint = message.checkpointRequired
        ? `le checkpoint ${message.checkpointRequired}`
        : "l’objectif futur";
      return `${pct1(message.probability)} % sur ${checkpoint} ${horizon}`;
    }
    case "reason.stopNextSectionFriendship": {
      const horizon =
        message.horizonSections === 2
          ? "jusqu’à C4"
          : "sur la section suivante";
      return `${tenth(message.friendshipBonus)} % Friendship acquis ${horizon}, exposition effective ${tenth(message.friendshipTrainingExposure)} %·entraînement, techniques et songs payées`;
    }
    case "reason.greatSuccessSecured":
      return "Great Success est déjà sécurisé";
    case "reason.finalGateSecuredCounter":
      return `Great Success final sécurisé ; compteur 18 informatif : ${message.totalSongs}/18`;
    case "reason.noPriorityLeftInPool":
      return "aucune song ne reste dans la pool : conversion terminale terminée";
    case "reason.noVisiblePriorityJustifies":
      return "aucune song visible n’est abordable : conversion terminale terminée";
    case "reason.finalFillerNonStrategic":
      return "filler non stratégique après sécurisation de Great Success final ; achat possible mais déconseillé";
    case "reason.finalGateStillOpen":
      return "Great Success final encore ouvert : arrêter maintenant est invalide";
    case "reason.greatSuccessNotSecured":
      return "Great Success n’est pas sécurisé sans achat supplémentaire";

    // ── Song policy: wait branch ───────────────────────────────────────────
    case "reason.waitMissingTokens":
      return `manque ${message.missing.map((token) => `${token.amount} ${token.key}`).join(" · ")} pour ${message.songName} ; conserve cette page et entraîne-toi`;
    case "reason.waitWouldBlockReserve":
      return `achat possible, mais il rendrait ${message.names.join(" / ")} immédiatement inachetable`;
    case "reason.waitSameActivationNextLive":
      return "même activation au prochain live : attendre conserve tokens et information";
    case "reason.waitProtectedReserveDominates":
      return "achat possible, mais la réserve protégée domine cette opportunité visible";
    case "reason.huntAbandonAtConcert":
      return "abandon HUNT : le concert est franchi sans acquérir la cible";
    case "reason.huntAbandonNoFiller":
      return "abandonne la chasse sans acheter de filler ; conserve le stock jusqu’au concert";
    case "reason.sectionStaysOpen":
      return "la section reste ouverte : les gains futurs restent observés, jamais inventés";

    // ── Exposed carry evaluation ───────────────────────────────────────────
    case "carry.noSectionAfterGrandLive":
      return "aucune section ne suit le Grand Live : carry final interdit";
    case "carry.sectionStillOpen":
      return "la section reste ouverte : réserver la page n’est pas encore un carry";
    case "carry.notAffordableEvenWithCredit":
      return "même le crédit +10 vérifié ne rend pas la song achetable ; la nouvelle pool resterait bloquée";
    case "carry.savesOneInheritedTechnique":
      return "économise exactement une technique héritée à total égal";
    case "carry.rhythmTargetMissed":
      return `objectif de rythme ${message.required} manqué avant le concert ; le carry reste mécaniquement possible`;
    case "carry.creditMakesAffordable":
      return "le crédit +10 vérifié rend la song achetable";
    case "carry.creditCommonToBothBranches":
      return "le crédit +10 vérifié est commun aux deux branches et ne vaut pas une prime";
    case "carry.delaysFriendshipBonus":
      return "retarde un Live Bonus Friendship d’une section";
    case "carry.delaysStructuralTarget":
      return "retarde une cible structurelle du plan actif";
    case "carry.negligibleStatBonus":
      return "aucun micro-bonus de stat n’est valorisé contre cette économie";

    // ── Terminal technique screen ──────────────────────────────────────────
    case "terminal.gainFriendship10":
      return "augmente réellement l’accès à une Friendship +10 %";
    case "terminal.gainExpectedFriendship":
      return "augmente la Friendship attendue dans la section suivante";
    case "terminal.gainNextTarget":
      return "augmente réellement l’acquisition de la cible suivante";
    case "terminal.gainStructuralPurchases":
      return "augmente les achats structurels attendus en aval";
    case "terminal.gainNone":
      return "aucun gain prospectif structurel ne compense le coût des techniques restantes";
    case "terminal.exposeAndCarry":
      return `EXPOSE_AND_CARRY justifié : ${renderFr(message.gain)}`;
    case "terminal.stopNowPageNotReached":
      return "STOP_NOW : la page portée n’est pas atteinte assez sûrement";
    case "terminal.stopNowNotSeparated":
      return message.coRecommendationReason === "both"
        ? "STOP_NOW reste l’action principale stable ; EXPOSE_AND_CARRY est co-recommandé car le Monte-Carlo apparié ne sépare pas les actions et la calibration peut aussi inverser l’ordre"
        : "STOP_NOW reste l’action principale stable ; EXPOSE_AND_CARRY est co-recommandé car le Monte-Carlo apparié ne sépare pas les actions";
    case "terminal.stopNow":
      return `STOP_NOW : ${renderFr(message.gain)}`;
    case "terminal.exposeAndCarryValue":
      return `EXPOSE_AND_CARRY · valeur ${tenth(message.grossValue)} - coût d’opportunité ${tenth(message.opportunityCost)} - risque ${tenth(message.riskPenalty)} = net ${tenth(message.netValue)} · borne basse reach ${pct1(message.reachLowerBound)} % (plancher ${pct1(message.catastropheFloor)} %)`;
    case "terminal.stopNowValue":
      return `STOP_NOW · valeur ${tenth(message.grossValue)} - coût d’opportunité ${tenth(message.opportunityCost)} - risque ${tenth(message.riskPenalty)} = net ${tenth(message.netValue)} · borne basse reach ${pct1(message.reachLowerBound)} % (plancher ${pct1(message.catastropheFloor)} %)`;
    case "terminal.stopNowCatastropheFloor":
      return `STOP_NOW · valeur ${tenth(message.grossValue)} - coût d’opportunité ${tenth(message.opportunityCost)} - risque ${tenth(message.riskPenalty)} = net ${tenth(message.netValue)} · borne basse reach ${pct1(message.reachLowerBound)} % sous le plancher catastrophe ${pct1(message.catastropheFloor)} %`;

    // ── Token reserve explanation ──────────────────────────────────────────
    case "reserve.noNearbyTarget":
      return "aucune song cible proche";
    case "reserve.feasibleScale":
      return `échelle faisable · ${message.anchors.join(" / ")}`;
    case "reserve.softPressure":
      return "pression souple · demande stratégique future";
    case "reserve.infeasibleChaseTarget":
      return `${message.songName} : chasse infaisable, aucun chemin réel ne préserve son coût intégral`;
    case "reserve.skippedInfeasibleChase":
      return `${renderFr(message.base)} · chasse infaisable sautée : ${message.skipped.join(" / ")}`;

    // ── Forced push (override) ─────────────────────────────────────────────
    case "override.forcedPushActive":
      return "Push forcé actif : verdict STOP/HOLD normal ignoré.";
    case "override.forcedPushOption":
      return `Option ${message.option} : meilleur achat valide et non bloquant.`;

    // ── Blocking proofs (diagnostics) ──────────────────────────────────────
    case "blocking.techniqueUnaffordable.label":
      return "Choix non finançable";
    case "blocking.techniqueUnaffordable.detail":
      return "Le coût dépasse au moins un solde de tokens actuel.";
    case "blocking.blocksPriorityTarget.label":
      return "Bloque la cible prioritaire";
    case "blocking.blocksPriorityTarget.detail":
      return message.names.length === 1
        ? `${message.names[0]} devient définitivement inachetable avant la prochaine sélection.`
        : `${message.names.join(" / ")} deviennent inachetables avant la prochaine sélection.`;
    case "blocking.songUnaffordable.label":
      return "Achat non finançable";
    case "blocking.songUnaffordable.detail":
      return "Le coût dépasse le stock actuel ou l’action est invalide dans cet état.";
    case "blocking.closesFinalGate.label":
      return "Ferme la porte finale";
    case "blocking.closesFinalGate.detail":
      return "La porte 18 ∧ Great Success final devient impossible dans cette branche.";
    case "advisory.cheaperSameSupport":
      return `Plus chère que l’option ${message.option} sur les mêmes couleurs. À choisir seulement si son effet propre (Energy, Hint, etc.) justifie le surcoût.`;
  }
};
