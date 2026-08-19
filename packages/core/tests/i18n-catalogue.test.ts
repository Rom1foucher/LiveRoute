import assert from "node:assert/strict";
import test from "node:test";

import { renderEn } from "../src/i18n/en.ts";
import { renderFr } from "../src/i18n/fr.ts";
import { formatMessage, formatMessages } from "../src/i18n/index.ts";
import type { Message, MessageCode } from "../src/i18n/messages.ts";

/**
 * One sample per code. Adding a member to `Message` without adding it here is
 * a compile error, so the catalogue can never silently drift from the union.
 */
const SAMPLES: Record<MessageCode, Message> = {
  "plan.label": { code: "plan.label", planId: "hunt-sp2", mode: "hunt" },
  "plan.exit": {
    code: "plan.exit",
    planId: "accumulate-c1",
    mode: "close",
    manualGaugeTarget: 2,
  },
  "plan.fallback": { code: "plan.fallback", planId: "hold", mode: "hold" },
  "supply.status": { code: "supply.status", status: "secured-now" },
  "checkpoint.name": { code: "checkpoint.name", checkpointId: "songs-16" },
  "reason.plan": { code: "reason.plan", planId: "close-c4", mode: "close" },
  "reason.structuralTargetVisible": { code: "reason.structuralTargetVisible" },
  "reason.chaseTargetVisible": { code: "reason.chaseTargetVisible" },
  "reason.opportunityVisible": { code: "reason.opportunityVisible" },
  "reason.gate18Impossible": { code: "reason.gate18Impossible" },
  "reason.gate18FutureSupply": { code: "reason.gate18FutureSupply" },
  "reason.capacityIndeterminate": { code: "reason.capacityIndeterminate" },
  "reason.noAffordablePlanTarget": { code: "reason.noAffordablePlanTarget" },
  "reason.huntAbandonTechniqueCount": {
    code: "reason.huntAbandonTechniqueCount",
    techniques: 5,
  },
  "reason.huntAbandonBelowFloor": {
    code: "reason.huntAbandonBelowFloor",
    probability: 0.1234,
    floor: 0.25,
  },
  "reason.huntContinuationRefused": {
    code: "reason.huntContinuationRefused",
    cause: { code: "reason.huntAbandonTechniqueCount", techniques: 5 },
  },
  "reason.huntAbandonMarginalValue": {
    code: "reason.huntAbandonMarginalValue",
    probability: 0.2,
    netValue: -3.5,
    pages: 3,
  },
  "reason.huntContinueMarginalValue": {
    code: "reason.huntContinueMarginalValue",
    probability: 0.45,
    netValue: 8.2,
    pages: 3,
  },
  "reason.securesGreatSuccess": { code: "reason.securesGreatSuccess" },
  "policy.noPurchase": { code: "policy.noPurchase" },
  "reason.finalGateSecuredCounter": {
    code: "reason.finalGateSecuredCounter",
    totalSongs: 17,
  },
  "reason.noPriorityLeftInPool": { code: "reason.noPriorityLeftInPool" },
  "reason.noVisiblePriorityJustifies": {
    code: "reason.noVisiblePriorityJustifies",
  },
  "reason.finalFillerNonStrategic": {
    code: "reason.finalFillerNonStrategic",
  },
  "reason.finalGateStillOpen": { code: "reason.finalGateStillOpen" },
  "reserve.noNearbyTarget": { code: "reserve.noNearbyTarget" },
  "reserve.feasibleScale": {
    code: "reserve.feasibleScale",
    anchors: ["Daisuki", "Fanfare"],
  },
  "reserve.softPressure": { code: "reserve.softPressure" },
  "reserve.infeasibleChaseTarget": {
    code: "reserve.infeasibleChaseTarget",
    songName: "Fanfare",
  },
  "reserve.skippedInfeasibleChase": {
    code: "reserve.skippedInfeasibleChase",
    base: { code: "reserve.feasibleScale", anchors: ["Daisuki"] },
    skipped: ["Fanfare"],
  },
  "advisory.cheaperSameSupport": {
    code: "advisory.cheaperSameSupport",
    option: 2,
  },
  "reason.nextSectionCheckpoint": {
    code: "reason.nextSectionCheckpoint",
    probability: 0.8123,
    checkpointRequired: 18,
    horizonSections: 2,
  },
  "reason.nextSectionValue": {
    code: "reason.nextSectionValue",
    friendshipBonus: 12.34,
    friendshipTrainingExposure: 123.4,
    spTrainingExposure: 44,
    practiceTrainingExposure: 18,
    lessonSkillPoints: 61.7,
    horizonSections: 1,
  },
  "reason.boundedLessonSkillPoints": {
    code: "reason.boundedLessonSkillPoints",
    points: 47,
  },
  "reason.stopNotCommitted": { code: "reason.stopNotCommitted" },
  "reason.reachNextPage": { code: "reason.reachNextPage", probability: 0.673 },
  "reason.findAndFundTarget": {
    code: "reason.findAndFundTarget",
    probability: 0.4211,
    pages: 3,
  },
  "reason.boundedMonteCarlo": { code: "reason.boundedMonteCarlo" },
  "reason.carryNextSectionCheckpoint": {
    code: "reason.carryNextSectionCheckpoint",
    probability: 0.55,
    horizonSections: 2,
  },
  "reason.carryNextSectionValue": {
    code: "reason.carryNextSectionValue",
    friendshipBonus: 7.5,
    friendshipTrainingExposure: 75,
    spTrainingExposure: 22,
    practiceTrainingExposure: 8,
    lessonSkillPoints: 25,
  },
  "reason.carriedSongLessonSkillPoints": {
    code: "reason.carriedSongLessonSkillPoints",
    points: 25,
  },
  "reason.stopFullStockCarries": { code: "reason.stopFullStockCarries" },
  "reason.pacingTargetMissed": {
    code: "reason.pacingTargetMissed",
    target: 16,
    totalSongs: 14,
  },
  "reason.stopNextSectionCheckpoint": {
    code: "reason.stopNextSectionCheckpoint",
    probability: 0.9,
    checkpointRequired: null,
    horizonSections: 1,
  },
  "reason.stopNextSectionFriendship": {
    code: "reason.stopNextSectionFriendship",
    friendshipBonus: 15,
    friendshipTrainingExposure: 150,
    horizonSections: 2,
  },
  "reason.greatSuccessSecured": { code: "reason.greatSuccessSecured" },
  "reason.greatSuccessNotSecured": { code: "reason.greatSuccessNotSecured" },
  "reason.waitMissingTokens": {
    code: "reason.waitMissingTokens",
    missing: [{ key: "passion", amount: 3 }],
    songName: "Fanfare for the Future!",
  },
  "reason.waitWouldBlockReserve": {
    code: "reason.waitWouldBlockReserve",
    names: ["Dream Sky", "Sekai"],
  },
  "reason.waitSameActivationNextLive": {
    code: "reason.waitSameActivationNextLive",
  },
  "reason.waitProtectedReserveDominates": {
    code: "reason.waitProtectedReserveDominates",
  },
  "reason.huntAbandonNoFiller": { code: "reason.huntAbandonNoFiller" },
  "reason.huntAbandonAtConcert": { code: "reason.huntAbandonAtConcert" },
  "reason.sectionStaysOpen": { code: "reason.sectionStaysOpen" },
  "carry.noSectionAfterGrandLive": { code: "carry.noSectionAfterGrandLive" },
  "carry.sectionStillOpen": { code: "carry.sectionStillOpen" },
  "carry.notAffordableEvenWithCredit": {
    code: "carry.notAffordableEvenWithCredit",
  },
  "carry.savesOneInheritedTechnique": {
    code: "carry.savesOneInheritedTechnique",
  },
  "carry.rhythmTargetMissed": {
    code: "carry.rhythmTargetMissed",
    required: 16,
  },
  "carry.creditMakesAffordable": { code: "carry.creditMakesAffordable" },
  "carry.creditCommonToBothBranches": {
    code: "carry.creditCommonToBothBranches",
  },
  "carry.delaysFriendshipBonus": { code: "carry.delaysFriendshipBonus" },
  "carry.delaysStructuralTarget": { code: "carry.delaysStructuralTarget" },
  "carry.negligibleStatBonus": { code: "carry.negligibleStatBonus" },
  "terminal.gainFriendship10": { code: "terminal.gainFriendship10" },
  "terminal.gainExpectedFriendship": {
    code: "terminal.gainExpectedFriendship",
  },
  "terminal.gainNextTarget": { code: "terminal.gainNextTarget" },
  "terminal.gainStructuralPurchases": {
    code: "terminal.gainStructuralPurchases",
  },
  "terminal.gainNone": { code: "terminal.gainNone" },
  "terminal.exposeAndCarry": {
    code: "terminal.exposeAndCarry",
    gain: { code: "terminal.gainNextTarget" },
  },
  "terminal.stopNowPageNotReached": { code: "terminal.stopNowPageNotReached" },
  "terminal.stopNowNotSeparated": {
    code: "terminal.stopNowNotSeparated",
    coRecommendationReason: "monte-carlo-not-separated",
  },
  "terminal.stopNow": {
    code: "terminal.stopNow",
    gain: { code: "terminal.gainNone" },
  },
  "terminal.exposeAndCarryValue": {
    code: "terminal.exposeAndCarryValue",
    grossValue: 40,
    opportunityCost: 25,
    riskPenalty: 2,
    netValue: 13,
    reachLowerBound: 0.9,
    catastropheFloor: 0.72,
  },
  "terminal.stopNowValue": {
    code: "terminal.stopNowValue",
    grossValue: 12,
    opportunityCost: 25,
    riskPenalty: 3,
    netValue: -16,
    reachLowerBound: 0.9,
    catastropheFloor: 0.72,
  },
  "terminal.stopNowCatastropheFloor": {
    code: "terminal.stopNowCatastropheFloor",
    grossValue: 80,
    opportunityCost: 10,
    riskPenalty: 4.4,
    netValue: 65.6,
    reachLowerBound: 0.7,
    catastropheFloor: 0.72,
  },
  "override.forcedPushActive": { code: "override.forcedPushActive" },
  "override.forcedPushOption": { code: "override.forcedPushOption", option: 2 },
  "blocking.techniqueUnaffordable.label": {
    code: "blocking.techniqueUnaffordable.label",
  },
  "blocking.techniqueUnaffordable.detail": {
    code: "blocking.techniqueUnaffordable.detail",
  },
  "blocking.blocksPriorityTarget.label": {
    code: "blocking.blocksPriorityTarget.label",
  },
  "blocking.blocksPriorityTarget.detail": {
    code: "blocking.blocksPriorityTarget.detail",
    names: ["Grow-up Shine!"],
  },
  "blocking.songUnaffordable.label": {
    code: "blocking.songUnaffordable.label",
  },
  "blocking.songUnaffordable.detail": {
    code: "blocking.songUnaffordable.detail",
  },
  "blocking.closesFinalGate.label": { code: "blocking.closesFinalGate.label" },
  "blocking.closesFinalGate.detail": {
    code: "blocking.closesFinalGate.detail",
  },
} as const satisfies { [K in Message["code"]]: Extract<Message, { code: K }> };

test("chaque code du catalogue rend une chaîne non vide", () => {
  for (const [code, sample] of Object.entries(SAMPLES)) {
    const rendered = renderFr(sample);
    assert.equal(typeof rendered, "string", code);
    assert.ok(rendered.length > 0, `${code} rend une chaîne vide`);
    assert.doesNotMatch(rendered, /undefined|\[object/, code);
  }
});

test("les cinq statuts de checkpoint sont tous rendus", () => {
  const statuses = [
    "secured-now",
    "closable-before-deadline",
    "reachable-with-future-supply",
    "indeterminate",
    "impossible",
  ] as const;
  const rendered = statuses.map((status) =>
    renderFr({ code: "supply.status", status }),
  );
  assert.equal(new Set(rendered).size, statuses.length);
});

test("les huit plans rendent un label, une sortie et un repli distincts", () => {
  const plans = [
    { planId: "accumulate-c1", mode: "accumulate" },
    { planId: "accumulate-c1", mode: "close" },
    { planId: "hunt-sp2", mode: "hunt" },
    { planId: "hunt-sp3", mode: "hunt" },
    { planId: "hold", mode: "hold" },
    { planId: "accumulate-c4", mode: "accumulate" },
    { planId: "close-c4", mode: "close" },
    { planId: "close-checkpoint", mode: "close" },
    { planId: "convert-final", mode: "convert" },
  ] as const;
  const labels = plans.map(({ planId, mode }) =>
    renderFr({ code: "plan.label", planId, mode }),
  );
  assert.equal(new Set(labels).size, plans.length);
  for (const { planId, mode } of plans) {
    assert.ok(
      renderFr({ code: "plan.exit", planId, mode, manualGaugeTarget: 2 })
        .length > 0,
    );
    assert.ok(renderFr({ code: "plan.fallback", planId, mode }).length > 0);
  }
});

test("le gel de formulation : la version française reste identique", () => {
  // Frozen against v0.22.9, before the message-code extraction.
  const frozen: [Message, string][] = [
    [
      { code: "supply.status", status: "closable-before-deadline" },
      "à fermer avant le concert",
    ],
    [
      { code: "reason.plan", planId: "close-c4", mode: "close" },
      "plan CLOSE · fin C4",
    ],
    [
      { code: "reason.huntAbandonTechniqueCount", techniques: 5 },
      "abandon HUNT : le prochain cycle demande 5 techniques",
    ],
    [
      {
        code: "reason.huntAbandonBelowFloor",
        probability: 0.1234,
        floor: 0.25,
      },
      "abandon HUNT : 12.3 % de trouver et financer la cible, sous le seuil 25 %",
    ],
    [
      {
        code: "reason.huntContinuationRefused",
        cause: { code: "reason.huntAbandonTechniqueCount", techniques: 5 },
      },
      "abandon HUNT : le prochain cycle demande 5 techniques · continuation HUNT refusée",
    ],
    [
      {
        code: "reason.nextSectionCheckpoint",
        probability: 0.8123,
        checkpointRequired: 18,
        horizonSections: 2,
      },
      "81.2 % sur checkpoint 18 jusqu’à C4, transition(s) +10 incluse(s)",
    ],
    [
      {
        code: "reason.nextSectionValue",
        friendshipBonus: 12.34,
        friendshipTrainingExposure: 123.4,
        spTrainingExposure: 44,
        practiceTrainingExposure: 18,
        lessonSkillPoints: 61.7,
        horizonSections: 1,
      },
      "valeur inter-section sans revenu futur : 12.3 % Friendship acquis, exposition 123.4 %·entraînement, SP-training 44, autres entraînements 18, et 62 SP de lessons attendus sur la section suivante",
    ],
    [
      { code: "reason.reachNextPage", probability: 0.673 },
      "67 % d’atteindre la prochaine page",
    ],
    [
      { code: "reason.findAndFundTarget", probability: 0.4211, pages: 3 },
      "42.1 % de trouver et financer la cible sur 3 page(s) avec techniques payées",
    ],
    [
      { code: "reason.boundedLessonSkillPoints", points: 47 },
      "47 SP de lessons sur ce chemin borné",
    ],
    [
      {
        code: "reason.waitMissingTokens",
        missing: [
          { key: "passion", amount: 3 },
          { key: "vocal", amount: 8 },
        ],
        songName: "Dream Sky",
      },
      "manque 3 passion · 8 vocal pour Dream Sky ; conserve cette page et entraîne-toi",
    ],
    [
      { code: "reason.waitWouldBlockReserve", names: ["Dream Sky", "Sekai"] },
      "achat possible, mais il rendrait Dream Sky / Sekai immédiatement inachetable",
    ],
    [
      { code: "reason.pacingTargetMissed", target: 16, totalSongs: 14 },
      "objectif de rythme 16 non atteint : 14/16, sans blocage mécanique",
    ],
    [
      {
        code: "reason.stopNextSectionCheckpoint",
        probability: 0.9,
        checkpointRequired: null,
        horizonSections: 1,
      },
      "90 % sur l’objectif futur sur la section suivante",
    ],
    [
      { code: "carry.rhythmTargetMissed", required: 16 },
      "objectif de rythme 16 manqué avant le concert ; le carry reste mécaniquement possible",
    ],
    [
      { code: "terminal.stopNow", gain: { code: "terminal.gainNone" } },
      "STOP_NOW : aucun gain prospectif structurel ne compense le coût des techniques restantes",
    ],
    [
      {
        code: "terminal.exposeAndCarry",
        gain: { code: "terminal.gainNextTarget" },
      },
      "EXPOSE_AND_CARRY justifié : augmente réellement l’acquisition de la cible suivante",
    ],
    [
      {
        code: "terminal.exposeAndCarryValue",
        grossValue: 40,
        opportunityCost: 25,
        riskPenalty: 2,
        netValue: 13,
        reachLowerBound: 0.9,
        catastropheFloor: 0.72,
      },
      "EXPOSE_AND_CARRY · valeur 40 - coût d’opportunité 25 - risque 2 = net 13 · borne basse reach 90 % (plancher 72 %)",
    ],
    [
      {
        code: "terminal.stopNowCatastropheFloor",
        grossValue: 80,
        opportunityCost: 10,
        riskPenalty: 4.4,
        netValue: 65.6,
        reachLowerBound: 0.7,
        catastropheFloor: 0.72,
      },
      "STOP_NOW · valeur 80 - coût d’opportunité 10 - risque 4.4 = net 65.6 · borne basse reach 70 % sous le plancher catastrophe 72 %",
    ],
    [
      {
        code: "blocking.blocksPriorityTarget.detail",
        names: ["Grow-up Shine!"],
      },
      "Grow-up Shine! devient définitivement inachetable avant la prochaine sélection.",
    ],
    [
      {
        code: "blocking.blocksPriorityTarget.detail",
        names: ["Grow-up Shine!", "Dream Sky"],
      },
      "Grow-up Shine! / Dream Sky deviennent inachetables avant la prochaine sélection.",
    ],
    [
      { code: "override.forcedPushOption", option: 2 },
      "Option 2 : meilleur achat valide et non bloquant.",
    ],
    [
      {
        code: "reserve.skippedInfeasibleChase",
        base: { code: "reserve.feasibleScale", anchors: ["Daisuki"] },
        skipped: ["Fanfare"],
      },
      "échelle faisable · Daisuki · chasse infaisable sautée : Fanfare",
    ],
    [
      { code: "reason.finalGateSecuredCounter", totalSongs: 17 },
      "Great Success final sécurisé ; compteur 18 informatif : 17/18",
    ],
  ];
  for (const [message, expected] of frozen) {
    assert.equal(renderFr(message), expected, message.code);
  }
});

test("formatMessage rend le français par défaut et l’anglais sur demande", () => {
  const message: Message = { code: "reason.securesGreatSuccess" };
  assert.equal(formatMessage(message), renderFr(message));
  assert.equal(formatMessage(message, "fr"), renderFr(message));
  assert.equal(formatMessage(message, "en"), renderEn(message));
  assert.notEqual(renderEn(message), renderFr(message));
  assert.deepEqual(formatMessages([message, message]), [
    renderFr(message),
    renderFr(message),
  ]);
});

test("chaque code rend une chaîne anglaise non vide et distincte du français", () => {
  const identical: string[] = [];
  for (const [code, sample] of Object.entries(SAMPLES)) {
    const en = renderEn(sample);
    assert.equal(typeof en, "string", code);
    assert.ok(en.length > 0, `${code} rend une chaîne vide en anglais`);
    assert.doesNotMatch(en, /undefined|\[object/, code);
    // Codes whose rendering is a pure identifier (HOLD, HUNT_SP2…) legitimately
    // match; everything else must actually differ from the French wording.
    if (en === renderFr(sample) && /[a-z]{4}\s[a-z]{3}/.test(en)) {
      identical.push(code);
    }
  }
  assert.deepEqual(identical, []);
});

test("aucune chaîne anglaise du solveur n’est restée en français", () => {
  const FRENCH =
    /[éèêëàâçîïôûù]|\b(le|la|les|des|une|pour|dans|avec|puis|aucun|aucune|sans|reste|cible)\b/i;
  const leaks: string[] = [];
  for (const [code, sample] of Object.entries(SAMPLES)) {
    const en = renderEn(sample);
    if (FRENCH.test(en)) leaks.push(`${code} → ${en}`);
  }
  assert.deepEqual(leaks, []);
});
