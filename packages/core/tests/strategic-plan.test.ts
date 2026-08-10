import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveStrategicPlan,
  isChaseTarget,
  isReserveTarget,
  isVisibleOptionalTarget,
  planExitMessage,
  structuralTier,
} from "../src/planner/strategic-plan.ts";
import { fr } from "./helpers/messages.ts";

const sp2 = { id: "SP2", roles: ["sp2-target"] as const };
const sp3 = { id: "SP3", roles: ["sp3-target"] as const };
const friendship5 = { id: "F5", roles: ["friendship-5"] as const };

test("une SP +2 manquée garde une valeur structurelle en C3", () => {
  const plan = deriveStrategicPlan({
    concertIndex: 2,
    timingMode: "section-open",
    remainingSongs: [sp2, friendship5],
  });
  assert.equal(structuralTier(sp2, plan), 4);
  assert.ok(structuralTier(sp2, plan) > structuralTier(friendship5, plan));
});

test("les SP manquées décroissent au lieu de devenir immédiatement filler", () => {
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "section-open",
    remainingSongs: [sp2, sp3],
  });
  assert.equal(structuralTier(sp3, plan), 4);
  assert.equal(structuralTier(sp2, plan), 2);
});

test("HOLD sépare chasse, opportunité visible et réserve future", () => {
  const friendship = { id: "F10", roles: ["friendship-10"] as const };
  const futureSp3 = { id: "SP3", roles: ["sp3-target"] as const };
  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: [friendship, futureSp3],
  });

  assert.equal(plan.mode, "hold");
  assert.equal(isChaseTarget(friendship, plan), false);
  assert.equal(isVisibleOptionalTarget(friendship, plan), true);
  assert.equal(isReserveTarget(friendship, plan), true);
  assert.equal(isChaseTarget(futureSp3, plan), false);
  assert.equal(isVisibleOptionalTarget(futureSp3, plan), false);
  assert.equal(isReserveTarget(futureSp3, plan), true);
});

test("après SP, CLOSE sécurise Great Success puis rebascule en HOLD", () => {
  const friendship = { id: "F10", roles: ["friendship-10"] as const };
  for (const concertIndex of [1, 2]) {
    const incomplete = deriveStrategicPlan({
      concertIndex,
      timingMode: "deadline-now",
      remainingSongs: [friendship],
      songsThisSection: 2,
    });
    assert.equal(incomplete.id, "close-checkpoint");
    assert.equal(incomplete.mode, "close");
    assert.equal(isChaseTarget(friendship, incomplete), true);

    const secured = deriveStrategicPlan({
      concertIndex,
      timingMode: "deadline-now",
      remainingSongs: [friendship],
      songsThisSection: 3,
    });
    assert.equal(secured.id, "hold");
    assert.equal(secured.mode, "hold");
    assert.deepEqual(secured.chaseTargets.ids, []);
    assert.equal(isVisibleOptionalTarget(friendship, secured), true);
  }
});

test("HUNT ne transforme pas une Friendship cachée en cible de chasse", () => {
  const friendship = { id: "F5", roles: ["friendship-5"] as const };
  const plan = deriveStrategicPlan({
    concertIndex: 1,
    timingMode: "section-open",
    remainingSongs: [sp2, friendship],
  });

  assert.equal(plan.mode, "hunt");
  assert.equal(isChaseTarget(sp2, plan), true);
  assert.equal(isChaseTarget(friendship, plan), false);
  assert.equal(isVisibleOptionalTarget(friendship, plan), false);
  assert.equal(isReserveTarget(friendship, plan), true);
});

test("une cible SP abandonnée ne rouvre plus HUNT sur la page suivante", () => {
  const plan = deriveStrategicPlan({
    concertIndex: 2,
    timingMode: "section-open",
    remainingSongs: [sp3, friendship5],
    abandonedChaseTargetIds: ["SP3"],
  });
  assert.equal(plan.mode, "hold");
  assert.equal(isChaseTarget(sp3, plan), false);
  assert.equal(isReserveTarget(sp3, plan), false);

  const deadline = deriveStrategicPlan({
    concertIndex: 2,
    timingMode: "deadline-now",
    remainingSongs: [sp3, friendship5],
    songsThisSection: 2,
    abandonedChaseTargetIds: ["SP3"],
  });
  assert.equal(deadline.mode, "hold");
  assert.deepEqual(deadline.chaseTargets.ids, []);
});

test("la fin C4 traite 16 comme un repère et non comme une porte", () => {
  const friendship = { id: "F10", roles: ["friendship-10"] as const };
  const plan = deriveStrategicPlan({
    concertIndex: 3,
    timingMode: "deadline-now",
    remainingSongs: [friendship],
  });

  assert.equal(plan.id, "close-c4");
  assert.equal(plan.checkpointRequired, null);
  assert.match(
    fr(planExitMessage(plan)),
    /indicateurs de trajectoire, pas des objectifs/,
  );
  assert.equal(isChaseTarget(friendship, plan), true);
});

test("Grand Live convertit toutes les songs sans hiérarchie de bonus expirée", () => {
  const friendship = { id: "GL-F10", roles: ["friendship-10"] as const };
  const specialty = {
    id: "GL-SPECIALTY",
    roles: ["specialty-priority"] as const,
  };
  const filler = { id: "GL-FILLER", roles: ["filler"] as const };
  const plan = deriveStrategicPlan({
    concertIndex: 4,
    timingMode: "deadline-now",
    remainingSongs: [friendship, specialty, filler],
  });

  assert.equal(plan.mode, "convert");
  assert.deepEqual(plan.chaseTargets.ids, [
    "GL-F10",
    "GL-FILLER",
    "GL-SPECIALTY",
  ]);
  assert.equal(isChaseTarget(friendship, plan), true);
  assert.equal(isChaseTarget(specialty, plan), true);
  assert.equal(isChaseTarget(filler, plan), true);
  assert.equal(structuralTier(friendship, plan), 0);
  assert.equal(structuralTier(specialty, plan), 0);
});
