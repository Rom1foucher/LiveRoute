import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertGoldenManifest,
  extractGoldenEvidence,
  parseNdjson,
  type GoldenManifest,
} from "../src/diagnostics/golden-evidence.ts";

const validateGoldenManifest: (value: unknown) => asserts value is GoldenManifest =
  assertGoldenManifest;

const loadManifest = async (): Promise<GoldenManifest> => {
  const raw = JSON.parse(
    await readFile(
      new URL("../fixtures/golden-v1.0.2-checkpoints.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
  validateGoldenManifest(raw);
  return raw;
};

test("v1.0.2 golden manifest is structurally valid and uses accepted explicit checkpoints", async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.baseline.policyVersion, "grand-live-v6");
  assert.equal(manifest.baseline.releaseTag, "v1.0.2");
  assert.equal(manifest.checkpoints.length, 25);
  assert.equal(
    manifest.checkpoints.filter((entry) => entry.reviewStatus === "accepted").length,
    23,
  );
  assert.equal(
    manifest.checkpoints.filter((entry) => entry.reviewStatus === "suspected-bug").length,
    1,
  );
  assert.equal(
    manifest.checkpoints.filter((entry) => entry.reviewStatus === "unknown").length,
    1,
  );
  assert.ok(
    manifest.checkpoints.some((entry) => entry.category === "carryover"),
  );
  assert.ok(
    manifest.checkpoints.some((entry) => entry.category === "hunt-target"),
  );
  assert.ok(manifest.checkpoints.some((entry) => entry.category === "c4-push"));
  assert.equal(
    manifest.checkpoints.filter((entry) => entry.category === "c4-terminal")
      .length,
    6,
  );
  assert.ok(
    manifest.checkpoints.some((entry) => entry.category === "grand-live-conversion"),
  );
});

test("golden extractor matches session + event + sequence + stateHash and validates the historical choice", async () => {
  const manifest: GoldenManifest = {
    manifestVersion: 1,
    id: "test",
    baseline: {
      releaseTag: "v1.0.2",
      commit: "69cb994",
      policyVersion: "grand-live-v6",
      ruleSetId: "rules",
    },
    sources: [{ id: "source", fileName: "decision.ndjson" }],
    runs: [
      {
        id: "run",
        sourceId: "source",
        sessionId: "session",
        reviewStatus: "accepted",
      },
    ],
    checkpoints: [
      {
        id: "checkpoint",
        runId: "run",
        category: "hunt-target",
        reviewStatus: "accepted",
        selector: { event: "choice", sequence: 94, stateHash: "C3-AAAA" },
        expect: {
          choiceKind: "song",
          choiceId: "grow-up-shine",
          matchedRecommendation: true,
        },
        reason: "test",
      },
    ],
  };
  const entries = parseNdjson(
    `${JSON.stringify({
      schemaVersion: 4,
      policyVersion: "grand-live-v6",
      ruleSetId: "rules",
      sessionId: "session",
      sequence: 94,
      stateHash: "C3-AAAA",
      event: "choice",
      timestamp: "2026-08-15T11:18:41.028Z",
      state: { concertIndex: 2 },
      choice: {
        kind: "song",
        id: "grow-up-shine",
        matchedRecommendation: true,
      },
    })}\n`,
    "decision.ndjson",
  );
  const snapshot = extractGoldenEvidence(
    manifest,
    new Map([["source", entries]]),
  );
  assert.equal(snapshot.checkpoints.length, 1);
  assert.deepEqual(snapshot.checkpoints[0]?.evidence.choice, {
    kind: "song",
    id: "grow-up-shine",
    matchedRecommendation: true,
  });
});

test("golden extractor rejects a historical action that no longer matches the classified evidence", () => {
  const manifest: GoldenManifest = {
    manifestVersion: 1,
    id: "test",
    baseline: {
      releaseTag: "v1.0.2",
      commit: "69cb994",
      policyVersion: "grand-live-v6",
      ruleSetId: "rules",
    },
    sources: [{ id: "source", fileName: "decision.ndjson" }],
    runs: [
      {
        id: "run",
        sourceId: "source",
        sessionId: "session",
        reviewStatus: "accepted",
      },
    ],
    checkpoints: [
      {
        id: "checkpoint",
        runId: "run",
        category: "song-choice",
        reviewStatus: "accepted",
        selector: { event: "choice", sequence: 1, stateHash: "C1-AAAA" },
        expect: {
          choiceKind: "song",
          choiceId: "kiseki",
          matchedRecommendation: true,
        },
        reason: "test",
      },
    ],
  };
  assert.throws(
    () =>
      extractGoldenEvidence(
        manifest,
        new Map([
          [
            "source",
            [
              {
                policyVersion: "grand-live-v6",
                ruleSetId: "rules",
                sessionId: "session",
                sequence: 1,
                stateHash: "C1-AAAA",
                event: "choice",
                choice: {
                  kind: "song",
                  id: "nigekiri",
                  matchedRecommendation: true,
                },
              },
            ],
          ],
        ]),
      ),
    /expected choice id kiseki/,
  );
});

test("golden extractor validates a terminal PUSH/STOP action inside a recommendation candidate", () => {
  const manifest: GoldenManifest = {
    manifestVersion: 1,
    id: "terminal-test",
    baseline: {
      releaseTag: "v1.0.2",
      commit: "69cb994",
      policyVersion: "grand-live-v6",
      ruleSetId: "rules",
    },
    sources: [{ id: "source", fileName: "decision.ndjson" }],
    runs: [
      {
        id: "run",
        sourceId: "source",
        sessionId: "session",
        reviewStatus: "accepted",
      },
    ],
    checkpoints: [
      {
        id: "terminal-checkpoint",
        runId: "run",
        category: "c4-terminal",
        reviewStatus: "accepted",
        selector: {
          event: "recommendation",
          sequence: 154,
          stateHash: "C4-AAAA",
        },
        expect: { terminalCandidateId: "2", terminalAction: "stop-now" },
        reason: "test",
      },
    ],
  };
  const entries = parseNdjson(
    `${JSON.stringify({
      policyVersion: "grand-live-v6",
      ruleSetId: "rules",
      sessionId: "session",
      sequence: 154,
      stateHash: "C4-AAAA",
      event: "recommendation",
      recommendation: {
        page: "techniques",
        normal: "option-3:stop",
        candidates: [
          {
            id: "option-3",
            terminalDecision: { candidateId: "2", action: "stop-now" },
          },
        ],
      },
    })}\n`,
    "decision.ndjson",
  );
  const snapshot = extractGoldenEvidence(
    manifest,
    new Map([["source", entries]]),
  );
  assert.equal(snapshot.checkpoints.length, 1);

  const wrongAction = structuredClone(manifest);
  wrongAction.checkpoints[0]!.expect = {
    terminalCandidateId: "2",
    terminalAction: "expose-and-carry",
  };
  assert.throws(
    () => extractGoldenEvidence(wrongAction, new Map([["source", entries]])),
    /expected terminal action expose-and-carry, got stop-now/,
  );
});
