import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertReplayCorpus,
  replayCorpus,
} from "../src/diagnostics/replay.ts";

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath) {
  console.error(
    "usage: npm run replay:corpus -- <corpus.json> [snapshot.json]",
  );
  process.exitCode = 2;
} else {
  const raw = JSON.parse(
    await readFile(
      resolve(process.env.INIT_CWD ?? process.cwd(), inputPath),
      "utf8",
    ),
  ) as unknown;
  assertReplayCorpus(raw);
  const snapshot = replayCorpus(raw);
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (outputPath) {
    await writeFile(
      resolve(process.env.INIT_CWD ?? process.cwd(), outputPath),
      serialized,
      "utf8",
    );
  } else {
    process.stdout.write(serialized);
  }
}
