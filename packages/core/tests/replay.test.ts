import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  replayFixture,
  replayFixtureMatchesExpected,
  type ReplayFixture,
} from "../src/diagnostics/replay.ts";

const loadFixture = async (name: string): Promise<ReplayFixture> =>
  JSON.parse(
    await readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8"),
  ) as ReplayFixture;

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
