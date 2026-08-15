import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  replayFixture,
  replayFixtureMatchesExpected,
  type ReplayFixture,
} from "../src/diagnostics/replay.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: npm run replay:fixture -- <fixture.json>");
  process.exitCode = 2;
} else {
  const fixture = JSON.parse(
    await readFile(resolve(process.cwd(), path), "utf8"),
  ) as ReplayFixture;
  const replay = replayFixture(fixture);
  console.log(JSON.stringify(replay, null, 2));
  if (!replayFixtureMatchesExpected(fixture, replay)) {
    console.error(`fixture ${fixture.id}: expected oracle mismatch`);
    process.exitCode = 1;
  }
}
