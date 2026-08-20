import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  assertGoldenManifest,
  loadGoldenEvidenceFromDirectory,
} from "../src/diagnostics/golden-evidence.ts";

const root = process.env.INIT_CWD ?? process.cwd();
const rawDirectory = process.argv[2];
const outputPath = process.argv[3];
const manifestPath = resolve(
  root,
  "packages/core/fixtures/golden-v1.0.2-checkpoints.json",
);

if (!rawDirectory) {
  console.error(
    "usage: npm run golden:v102 -- " +
      "<directory-containing-v1.0.2-ndjson> [evidence-snapshot.json]",
  );
  process.exitCode = 2;
} else {
  const rawManifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as unknown;
  assertGoldenManifest(rawManifest);
  const directoryUrl = pathToFileURL(resolve(root, rawDirectory));
  if (!directoryUrl.pathname.endsWith("/")) directoryUrl.pathname += "/";
  const snapshot = await loadGoldenEvidenceFromDirectory(
    rawManifest,
    directoryUrl,
  );
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (outputPath) {
    await writeFile(resolve(root, outputPath), serialized, "utf8");
  } else {
    process.stdout.write(serialized);
  }
}
