import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { UI_EN } from "../src/i18n/ui-en.ts";
import { UI_FR } from "../src/i18n/ui-fr.ts";

/** Resolved from this file, so the suite is independent of the working directory. */
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

// constants.tsx is a .tsx file: Node's --experimental-strip-types cannot
// import it directly (JSX-capable extensions aren't in its resolver), so
// THEME_IDS is read back out of the source text instead of imported. This
// mirrors the source-level checks already used for TopBar.tsx below.
const constantsSource = readFileSync(join(SRC, "constants.tsx"), "utf8");
const themeIdsLiteral = constantsSource.match(
  /export const THEME_IDS: readonly ThemeId\[\] = \[([^\]]+)\];/,
);
assert.ok(themeIdsLiteral, "THEME_IDS introuvable dans constants.tsx");
const THEME_IDS = [...themeIdsLiteral[1].matchAll(/"([^"]+)"/g)].map(
  (m) => m[1],
);

const catalogueKey = (id: string) => (id === "dark-uma" ? "darkUma" : id);

test("chaque ThemeId a un libellé FR et EN", () => {
  for (const id of THEME_IDS) {
    const key = catalogueKey(id) as keyof typeof UI_FR.theme;
    assert.ok(UI_FR.theme[key], `FR manquant pour ${id}`);
    assert.ok(UI_EN.theme[key], `EN manquant pour ${id}`);
  }
});

test("aucune clé de theme n'existe sans ThemeId correspondant", () => {
  const known = new Set(["label", ...THEME_IDS.map(catalogueKey)]);
  for (const key of Object.keys(UI_FR.theme)) {
    assert.ok(known.has(key), `clé de catalogue orpheline : theme.${key}`);
  }
});

test("chaque ThemeId a un bloc CSS [data-theme] et une variable --brand", () => {
  const css = readFileSync(join(SRC, "styles.css"), "utf8");
  for (const id of THEME_IDS) {
    if (id === "light") continue; // default :root block, no attribute needed
    assert.match(
      css,
      new RegExp(`:root\\[data-theme="${id}"\\]\\s*\\{[^}]*--brand:`),
      `bloc CSS manquant ou sans --brand pour ${id}`,
    );
    for (const token of ["--option", "--risk"] as const) {
      assert.match(
        css,
        new RegExp(`:root\\[data-theme="${id}"\\]\\s*\\{[^}]*${token}:`),
        `${token} manquant pour ${id}`,
      );
    }
  }
});

test("le sélecteur de thème couvre exactement THEME_IDS", () => {
  const topbar = readFileSync(join(SRC, "components", "TopBar.tsx"), "utf8");
  assert.match(topbar, /THEME_IDS\.map/);
});
