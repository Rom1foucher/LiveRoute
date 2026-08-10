import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";

/** Resolved from this file, so the suite is independent of the working directory. */
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

const traverse =
  (_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse;

/**
 * Regex sweeps missed French copy four separate times, because JSX splits a
 * sentence across text nodes, template quasis and expressions: `{n} / 3 jauge ·
 * {m} manuelle` contains no single literal a grep can match. This walks the
 * actual AST instead, so every literal fragment that can reach the screen is
 * inspected whatever surrounds it.
 */
const SOURCES = [
  ...readdirSync(join(SRC, "components"))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => join(SRC, "components", name)),
  join(SRC, "App.tsx"),
  join(SRC, "constants.tsx"),
  join(SRC, "slots.tsx"),
];

/** className values, asset paths and DOM ids are not user-facing copy. */
const NON_COPY =
  /^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)*$|^\/|\.(png|webp|svg|json)$/;

const FRENCH =
  /[éèêëàâçîïôûùÉÈÀÇ]|\b(le|la|les|des|une|pour|dans|avec|puis|aucune?|sans|vers|chaque|manuelles?|automatique|restantes?|jauge|chansons?|avant|seulement|cette|plafond|principale|secondaire|dynamique|ponctuel|ajuster|valables|réserve|cible|achats?|sélections?|verrouillées?|achetées?|porter|solde|choix)\b/i;

const fragments = (): { file: string; line: number; value: string }[] => {
  const found: { file: string; line: number; value: string }[] = [];
  for (const file of SOURCES) {
    const ast = parse(readFileSync(file, "utf8"), {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
    traverse(ast, {
      JSXText(path) {
        const value = path.node.value.replace(/\s+/g, " ").trim();
        if (value) {
          found.push({ file, line: path.node.loc?.start.line ?? 0, value });
        }
      },
      TemplateElement(path) {
        const value = path.node.value.cooked?.replace(/\s+/g, " ").trim();
        if (value) {
          found.push({ file, line: path.node.loc?.start.line ?? 0, value });
        }
      },
      StringLiteral(path) {
        if (path.parentPath.isImportDeclaration()) return;
        const value = path.node.value.trim();
        if (value) {
          found.push({ file, line: path.node.loc?.start.line ?? 0, value });
        }
      },
    });
  }
  return found;
};

test("aucun fragment JSX ne contient de copie française en dur", () => {
  const leaks = fragments()
    .filter(({ value }) => !NON_COPY.test(value) && FRENCH.test(value))
    .map(({ file, line, value }) => `${file}:${line} ${value.slice(0, 60)}`);
  assert.deepEqual(leaks, []);
});

test("le scan couvre bien toute la surface JSX", () => {
  // Guards against the walker silently matching nothing after a refactor.
  assert.ok(fragments().length > 400);
});
