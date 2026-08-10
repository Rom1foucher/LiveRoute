import assert from "node:assert/strict";
import test from "node:test";
import {
  pendingOverlayPayload,
  tokenOverlayValues,
} from "../src/vision/overlay-state.ts";
import { DEFAULT_VISION_PROFILE } from "../src/vision/profile.ts";
import { TOKEN_KEYS } from "@glcp/core";

test("l'overlay affiche un loading state pendant le calcul, jamais un verdict par défaut", () => {
  const payload = pendingOverlayPayload(
    { page: "techniques", pageConfidence: 0.93 },
    {
      loading: true,
      stale: false,
      headline: "Analyse en cours…",
      summary: "Le solveur compare les trajectoires.",
    },
    "fr",
  );

  assert.ok(payload);
  assert.equal(payload.visible, true);
  assert.equal(payload.loading, true);
  assert.equal(payload.headline, "Analyse en cours…");
  assert.equal(payload.boxes.length, 0);
  assert.equal(payload.tokenValues.length, 0);
  assert.doesNotMatch(payload.headline, /greed/i);
});

test("un ancien verdict reste masqué lorsqu'il est simplement périmé", () => {
  const payload = pendingOverlayPayload(
    { page: "songs", pageConfidence: 0.8 },
    {
      loading: false,
      stale: true,
      headline: "Ancien verdict",
      summary: "Ancien résumé",
    },
    "fr",
  );

  assert.ok(payload);
  assert.equal(payload.visible, false);
  assert.equal(payload.loading, false);
  assert.equal(payload.headline, "");
});

test("les cinq valeurs OCR sont projetées sous leurs compteurs", () => {
  const values = [62, 91, 0, 147, null];
  const tokens = Object.fromEntries(
    TOKEN_KEYS.map((token, index) => [
      token,
      {
        value: values[index],
        confidence: index === 4 ? 0 : 0.92,
        raw: values[index] === null ? "" : String(values[index]),
      },
    ]),
  ) as Parameters<typeof tokenOverlayValues>[0]["tokens"];

  const projected = tokenOverlayValues(
    { tokens },
    DEFAULT_VISION_PROFILE.regions.tokens,
  );

  assert.deepEqual(
    projected.map(({ token, value }) => [token, value]),
    [
      ["dance", "62"],
      ["passion", "91"],
      ["vocal", "0"],
      ["visual", "147"],
      ["mental", "?"],
    ],
  );
  assert.deepEqual(
    projected.map(({ rect }) => rect),
    TOKEN_KEYS.map((token) => DEFAULT_VISION_PROFILE.regions.tokens[token]),
  );
});
