import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * The merge that produced this monorepo existed because presentation concerns
 * had leaked into the engine: a solver module imported the desktop capture
 * layer, and every user-facing sentence was hard-coded French prose inside
 * decision code. Both are cheap to reintroduce by accident and expensive to
 * unwind later, so they are asserted here rather than left to review.
 *
 * `src/adapters/` is the single sanctioned DOM area. Nothing under it may be
 * imported by the engine itself, which the second test below checks.
 */

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

/**
 * `path.relative()` uses the OS separator, so it returns `adapters\browser.ts`
 * on Windows. Every prefix check below is written against `/`, so comparisons
 * must normalise first — otherwise the exclusion silently never matches on
 * Windows and this guard flags files it was explicitly told to skip.
 */
const relPosix = (from: string, to: string): string =>
  relative(from, to).split(sep).join("/");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });

const engineFiles = walk(SRC).filter(
  (path) => !relPosix(SRC, path).startsWith("adapters/"),
);

/**
 * Comments legitimately name the globals they explain, so the guard reads code
 * only. Stripping is deliberately naive: it cannot see a `//` inside a string
 * literal, which at worst hides a line from the check and never invents one.
 */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const FORBIDDEN: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /\bwindow\./, why: "DOM global" },
  { pattern: /\bdocument\./, why: "DOM global" },
  { pattern: /\blocalStorage\b/, why: "browser storage" },
  { pattern: /\bsessionStorage\b/, why: "browser storage" },
  { pattern: /\bnavigator\./, why: "DOM global" },
  { pattern: /from "react/, why: "React import" },
  { pattern: /from "@tauri-apps\//, why: "Tauri import" },
  { pattern: /from "tesseract\.js/, why: "OCR import" },
];

test("aucun module du moteur ne dépend du DOM, de React ou du desktop", () => {
  const offences: string[] = [];
  for (const file of engineFiles) {
    const source = codeOnly(readFileSync(file, "utf8"));
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(source)) {
        offences.push(`${relPosix(SRC, file)} : ${why} (${pattern.source})`);
      }
    }
  }
  assert.deepEqual(offences, []);
});

test("le moteur n'importe jamais un adaptateur", () => {
  const offences = engineFiles.filter((file) =>
    /from "[^"]*adapters\//.test(codeOnly(readFileSync(file, "utf8"))),
  );
  assert.deepEqual(
    offences.map((file) => relPosix(SRC, file)),
    [],
  );
});

test("aucun import relatif sans extension explicite", () => {
  const offences: string[] = [];
  for (const file of walk(SRC)) {
    const source = codeOnly(readFileSync(file, "utf8"));
    for (const match of source.matchAll(/from "(\.[^"]*)"/g)) {
      const specifier = match[1] ?? "";
      if (!/\.(ts|tsx|json|css)$/.test(specifier)) {
        offences.push(`${relPosix(SRC, file)} : ${specifier}`);
      }
    }
  }
  assert.deepEqual(offences, []);
});
