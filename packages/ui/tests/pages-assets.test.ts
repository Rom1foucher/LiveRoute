import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SOURCE_FILES = [
  "../src/App.tsx",
  "../src/constants.tsx",
  "../../core/src/domain/song-data.ts",
].map((path) => fileURLToPath(new URL(path, import.meta.url)));

test("les assets publics restent relatifs au base path GitHub Pages", () => {
  const absoluteAssets = SOURCE_FILES.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/["'`]\/assets\//g)].map(
      (match) => `${file}:${match.index}`,
    ),
  );

  assert.deepEqual(absoluteAssets, []);
});
