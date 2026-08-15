import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("desktop build and dev always prepare the offline OCR assets", async () => {
  const packageJson = JSON.parse(await read("../package.json")) as {
    scripts: Record<string, string>;
  };
  assert.match(packageJson.scripts.build, /npm run prepare:ocr/);
  assert.match(packageJson.scripts.dev, /npm run prepare:ocr/);
});

test("Tauri CSP allows same-origin OCR asset loading", async () => {
  const config = JSON.parse(await read("../src-tauri/tauri.conf.json")) as {
    app: { security: { csp: string } };
  };
  assert.match(config.app.security.csp, /connect-src[^;]*'self'/);
  assert.match(config.app.security.csp, /worker-src[^;]*'self'/);
});

test("Tesseract initialization and recognition cannot hang forever", async () => {
  const source = await read("../src/vision/ocr.ts");
  assert.match(source, /OCR_INITIALIZATION_TIMEOUT_MS\s*=\s*20_000/);
  assert.match(source, /OCR_RECOGNITION_TIMEOUT_MS\s*=\s*30_000/);
  assert.match(source, /Initialisation OCR expirée/);
  assert.match(source, /Reconnaissance OCR expirée/);
  assert.match(source, /discardWorker\(\)/);
});
