import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/vision/SnapshotCompanionPanel.tsx", import.meta.url),
  "utf8",
);

const takeSnapshotStart = source.indexOf("const takeSnapshot = useCallback");
const takeSnapshotEnd = source.indexOf(
  "useEffect(() => {\n    captureRef.current",
  takeSnapshotStart,
);
const takeSnapshot = source.slice(takeSnapshotStart, takeSnapshotEnd);

test("the previous overlay is hidden before native capture", () => {
  const hide = takeSnapshot.indexOf("await hideOverlay()");
  const capture = takeSnapshot.indexOf("await captureWindow(selected)");
  assert.ok(hide >= 0, "takeSnapshot must hide the previous overlay");
  assert.ok(capture >= 0, "takeSnapshot must call the native capture command");
  assert.ok(
    hide < capture,
    "overlay hiding must finish before native capture starts",
  );
});

test("a successful native frame is exposed before OCR starts", () => {
  const capture = takeSnapshot.indexOf("await captureWindow(selected)");
  const publishFrame = takeSnapshot.indexOf("setFrame(nextFrame)");
  const recognize = takeSnapshot.indexOf("await recognizeCapturedFrame(");
  assert.ok(
    capture < publishFrame,
    "the frame can only be published after capture",
  );
  assert.ok(
    publishFrame < recognize,
    "the native frame must be visible before OCR begins",
  );
});

test("native Tauri string errors are preserved for diagnostics", () => {
  assert.match(
    takeSnapshot,
    /typeof reason === "string"\s*\? runtimeText\(reason\)/,
  );
});
