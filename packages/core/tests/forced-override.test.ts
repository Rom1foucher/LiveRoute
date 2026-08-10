import assert from "node:assert/strict";
import test from "node:test";
import type { Balance, SongTarget } from "../src/live-model.ts";
import type { TechniqueChoiceAssessment } from "../src/diagnostics/decision-safety.ts";
import { analyzeSongSelection } from "../src/solver/song-policy.ts";
import {
  selectForcedSongPolicy,
  selectForcedTechniqueCandidate,
} from "../src/solver/forced-override.ts";

const balance = (partial: Partial<Balance> = {}): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
  ...partial,
});

const song = (id: string): SongTarget => ({
  id,
  name: id,
  cost: balance({ dance: 21 }),
  roles: ["filler"],
  priority: false,
  utility: 1,
  policyValue: 0,
});

test("l'override song expose un buy-continue normalement masqué par HOLD", () => {
  const filler = song("filler");
  const result = analyzeSongSelection({
    period: "classic",
    tokens: balance({ dance: 100 }),
    visibleSongs: [filler],
    remainingSongs: [filler],
    techniquesToNextSong: 2,
    songsThisSection: 2,
    totalSongs: 8,
    concertIndex: 1,
    timingMode: "section-open",
    trials: 200,
  });

  assert.equal(result.recommended?.action, "wait-reserve");
  const forced = selectForcedSongPolicy(result);
  assert.equal(forced?.action, "buy-continue");
  assert.equal(forced?.songId, "filler");
});

test("l'override technique dérive l'éligibilité sans champ overrideEligible", () => {
  const candidates = [
    { index: 0, result: { valid: true, recommendation: "stop" as const } },
    { index: 2, result: { valid: true, recommendation: "stop" as const } },
    { index: 1, result: { valid: false, recommendation: "invalid" as const } },
  ];
  const assessments: TechniqueChoiceAssessment[] = [
    {
      index: 0,
      safety: "hard-blocking",
      blocking: {
        label: { code: "blocking.songUnaffordable.label" },
        detail: { code: "blocking.songUnaffordable.detail" },
        proof: "deterministic",
      },
      advisory: null,
      probabilityDelta: 0,
    },
    {
      index: 2,
      safety: "secondary",
      blocking: null,
      advisory: null,
      probabilityDelta: 0,
    },
    {
      index: 1,
      safety: "secondary",
      blocking: null,
      advisory: null,
      probabilityDelta: 0,
    },
  ];

  assert.equal(
    selectForcedTechniqueCandidate(candidates, assessments)?.index,
    2,
  );
});

test("l'override forcé ignore le repère 16 devenu impossible", () => {
  const filler = song("filler-rhythm");
  const result = analyzeSongSelection({
    period: "classic",
    tokens: balance({ dance: 100 }),
    visibleSongs: [filler],
    remainingSongs: [filler],
    techniquesToNextSong: 2,
    songsThisSection: 2,
    totalSongs: 8,
    concertIndex: 1,
    timingMode: "section-open",
    trials: 120,
  });
  const continuation = result.policies.find(
    (policy) => policy.action === "buy-continue",
  );
  assert.ok(continuation);
  continuation.checkpoint16Status = "impossible";
  continuation.checkpoint18Status = "closable-before-deadline";

  assert.equal(selectForcedSongPolicy(result)?.id, continuation.id);
});
