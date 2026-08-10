import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(projectRoot, "public", "ocr");

/**
 * Resolves an installed package's directory through Node's own module
 * resolution rather than a hand-built `node_modules` path. In an npm
 * workspace, dependencies are hoisted to the repository root, not into this
 * package's own `node_modules/` — hardcoding the latter breaks the moment
 * hoisting differs, which is exactly what happened when this script was
 * carried over from a standalone (non-workspace) project.
 */
const resolveFile = (specifier) =>
  fileURLToPath(import.meta.resolve(specifier));

const packageDir = (name) => dirname(resolveFile(`${name}/package.json`));

const workerSource = resolveFile("tesseract.js/dist/worker.min.js");
const coreSource = packageDir("tesseract.js-core");
const languageSource = resolveFile(
  "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
);

await rm(publicRoot, { recursive: true, force: true });
await mkdir(join(publicRoot, "core"), { recursive: true });
await mkdir(join(publicRoot, "lang"), { recursive: true });

await cp(workerSource, join(publicRoot, "worker.min.js"));
await cp(languageSource, join(publicRoot, "lang", "eng.traineddata.gz"));

const coreFiles = (await readdir(coreSource)).filter(
  (file) =>
    file.startsWith("tesseract-core") && /lstm\.wasm(?:\.js)?$/.test(file),
);

await Promise.all(
  coreFiles.map((file) =>
    cp(join(coreSource, file), join(publicRoot, "core", file)),
  ),
);

console.log(
  `Prepared offline OCR assets (${coreFiles.length + 2} files) in public/ocr.`,
);
