import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssPath = new URL("../src/vision/snapshot.css", import.meta.url);
const panelPath = new URL(
  "../src/vision/SnapshotCompanionPanel.tsx",
  import.meta.url,
);
const tauriPath = new URL("../src-tauri/tauri.conf.json", import.meta.url);

test("le mode compact OCR conserve une scrollbar pour les trois techniques", async () => {
  const css = await readFile(cssPath, "utf8");
  const compactStart = css.indexOf(
    "@media (min-width: 901px) and (max-height: 1120px)",
  );
  assert.notEqual(compactStart, -1);
  const compactBlock = css.slice(compactStart, compactStart + 1300);
  assert.match(
    compactBlock,
    /\.snapshot-review-panel\s*\{[^}]*overflow-y:\s*auto/s,
  );
  assert.doesNotMatch(
    compactBlock,
    /\.snapshot-review-panel\s*\{[^}]*overflow-y:\s*hidden/s,
  );
});

test("ouvrir Live OCR verrouille le scroll de la page principale", async () => {
  const [css, panel] = await Promise.all([
    readFile(cssPath, "utf8"),
    readFile(panelPath, "utf8"),
  ]);
  assert.match(
    css,
    /html\.snapshot-modal-open,[\s\S]*body\.snapshot-modal-open\s*\{[\s\S]*overflow:\s*hidden\s*!important/,
  );
  assert.match(panel, /classList\.add\("snapshot-modal-open"\)/);
  assert.match(panel, /classList\.remove\("snapshot-modal-open"\)/);
});

test("la fenêtre desktop ne peut plus être réduite sous la hauteur OCR sûre", async () => {
  const config = JSON.parse(await readFile(tauriPath, "utf8")) as {
    app: { windows: Array<{ label: string; minHeight?: number }> };
  };
  const main = config.app.windows.find((window) => window.label === "main");
  assert.ok(main);
  assert.ok((main.minHeight ?? 0) >= 940);
});
