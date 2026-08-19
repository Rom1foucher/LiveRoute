import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  diffReplaySnapshots,
  type ReplayCorpusSnapshot,
} from "../src/diagnostics/replay.ts";

const [leftPath, rightPath] = process.argv.slice(2);
if (!leftPath || !rightPath) {
  console.error("usage: npm run replay:diff -- <A.json> <B.json>");
  process.exitCode = 2;
} else {
  const [left, right] = await Promise.all(
    [leftPath, rightPath].map(async (path) =>
      JSON.parse(
        await readFile(
          resolve(process.env.INIT_CWD ?? process.cwd(), path),
          "utf8",
        ),
      ) as ReplayCorpusSnapshot,
    ),
  );
  const diff = diffReplaySnapshots(left, right);
  process.stdout.write(`${JSON.stringify(diff, null, 2)}\n`);
  if (!diff.same) process.exitCode = 1;
}
