import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertReplayCorpus,
  diffReplaySnapshots,
  replayCorpus,
  replayFixture,
  replayFixtureMatchesExpected,
  type ReplayCorpus,
  type ReplayCorpusSnapshot,
  type ReplayFixture,
} from "../src/diagnostics/replay.ts";

const loadFixture = async (name: string): Promise<ReplayFixture> =>
  JSON.parse(
    await readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8"),
  ) as ReplayFixture;

const loadCorpus = async (name: string): Promise<ReplayCorpus> => {
  const value = JSON.parse(
    await readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8"),
  ) as unknown;
  assertReplayCorpus(value);
  return value;
};

for (const name of ["analysis-smoke.json"]) {
  test(`fixture autonome et déterministe : ${name}`, async () => {
    const fixture = await loadFixture(name);
    const first = replayFixture(fixture);
    const second = replayFixture(fixture);
    assert.equal(replayFixtureMatchesExpected(fixture, first), true);

    if (first.kind === "song-policy" && second.kind === "song-policy") {
      assert.deepEqual(second.result.policies, first.result.policies);
      assert.deepEqual(second.result.plan, first.result.plan);
    } else {
      assert.deepEqual(second, first);
    }
  });
}

test(
  "P0 : le corpus classifié est déterministe sur les trois chemins de replay",
  async () => {
    const corpus = await loadCorpus("replay-corpus-v5.json");
    const first = replayCorpus(corpus);
    const second = replayCorpus(corpus);
    assert.deepEqual(second, first);
    assert.deepEqual(
      [...new Set(first.cases.map((entry) => entry.decision.kind))].sort(),
      ["analysis", "song-policy", "terminal-technique"],
    );
    assert.ok(first.cases.every((entry) => entry.evidence.length > 0));
  },
);

test(
  "P0 : une recommandation historique est une preuve, jamais un oracle",
  async () => {
    const corpus = await loadCorpus("replay-corpus-v5.json");
    const original = replayCorpus(corpus);
    const changedEvidence = structuredClone(corpus);
    const first = changedEvidence.cases[0];
    assert.ok(first);
    first.evidence = [
      {
        kind: "historical-recommendation",
        source: "test-only",
        payload: { recommendation: "deliberately-wrong" },
      },
    ];
    const replayed = replayCorpus(changedEvidence);
    assert.deepEqual(replayed.cases[0]?.decision, original.cases[0]?.decision);
    assert.equal(diffReplaySnapshots(original, replayed).same, true);
  },
);

test("P0 : le format de corpus interdit explicitement expected", async () => {
  const corpus = await loadCorpus("replay-corpus-v5.json");
  const invalid = structuredClone(corpus) as unknown as {
    cases: Array<{ fixture: Record<string, unknown> }>;
  };
  const first = invalid.cases[0];
  assert.ok(first);
  first.fixture.expected = { recommendation: "safe" };
  assert.throws(
    () => assertReplayCorpus(invalid),
    /expected is forbidden; evidence is not an oracle/,
  );
});

test("P0 : replay diff est vide sur deux snapshots identiques", async () => {
  const corpus = await loadCorpus("replay-corpus-v5.json");
  const snapshot = replayCorpus(corpus);
  const relabelled: ReplayCorpusSnapshot = {
    ...structuredClone(snapshot),
    policyVersion: "another-policy-label",
  };
  const diff = diffReplaySnapshots(snapshot, relabelled);
  assert.equal(diff.same, true);
  assert.deepEqual(diff.changedCases, []);
});

test(
  "P0 : replay diff localise un changement de décision sans consulter l'evidence",
  async () => {
    const corpus = await loadCorpus("replay-corpus-v5.json");
    const before = replayCorpus(corpus);
    const after = structuredClone(before);
    const analysis = after.cases.find(
      (entry) => entry.decision.kind === "analysis",
    );
    assert.ok(analysis);
    if (analysis.decision.kind !== "analysis") {
      assert.fail("analysis case missing");
    }
    analysis.decision.result.recommendation = "stop";

    const diff = diffReplaySnapshots(before, after);
    assert.equal(diff.same, false);
    assert.equal(diff.changedCases.length, 1);
    assert.match(
      diff.changedCases[0]?.differences[0]?.path ?? "",
      /recommendation/,
    );
  },
);
