import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * The engine emits message codes, never sentences. This is what makes the
 * decision log diffable across versions, reason equality decidable in tests,
 * and a second language a catalogue change rather than a solver change.
 *
 * The rule is easy to break by accident: one `reasons.push("…")` during a
 * debugging session is enough. So it is checked mechanically on every run
 * rather than left to review.
 */

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

/**
 * `path.relative()` uses the OS separator, so it returns `i18n\fr.ts` on
 * Windows. Every prefix/equality check below is written against `/`, so
 * comparisons must normalise first — otherwise `i18n/` never matches on
 * Windows and this guard scans the one directory it is meant to exempt.
 */
const relPosix = (from: string, to: string): string =>
  relative(from, to).split(sep).join("/");

/** The i18n layer is where prose is supposed to live. */
const EXCLUDED = ["i18n/"];

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });

const engineFiles = walk(SRC).filter((path) => {
  const rel = relPosix(SRC, path);
  return !EXCLUDED.some((prefix) => rel.startsWith(prefix));
});

/** Comments are allowed to be prose; only executable literals are inspected. */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Accents catch most of it. The bare function words catch the rest, since a
 * sentence such as "plan actif sans cible" carries no accent at all.
 */
const FRENCH =
  /[éèêëàâçîïôûùÉÈÀÇœ]|\b(le|la|les|des|une|pour|dans|avec|puis|aucune?|sans|vers|chaque|cette|conserver|acheter|song prioritaire)\b/i;

/** Song titles and internal identifiers are data, not user-facing copy. */
const DATA_FILES = ["domain/song-data.ts", "domain/song-catalog.ts"];

const literals = (source: string): { value: string; kind: string }[] => [
  ...[...source.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => ({
    value: match[1] ?? "",
    kind: "string",
  })),
  ...[...source.matchAll(/`((?:[^`\\]|\\.)*)`/g)].map((match) => ({
    value: match[1] ?? "",
    kind: "template",
  })),
];

test("aucun module du moteur ne contient de prose destinée à l'écran", () => {
  const offences: string[] = [];
  for (const file of engineFiles) {
    const rel = relPosix(SRC, file);
    if (DATA_FILES.includes(rel)) continue;
    for (const { value, kind } of literals(
      codeOnly(readFileSync(file, "utf8")),
    )) {
      if (FRENCH.test(value)) {
        offences.push(`${rel} : ${kind} « ${value.slice(0, 60)} »`);
      }
    }
  }
  assert.deepEqual(offences, []);
});

test("le moteur n'importe la couche i18n que pour ses types", () => {
  const offences: string[] = [];
  for (const file of engineFiles) {
    const source = codeOnly(readFileSync(file, "utf8"));
    for (const match of source.matchAll(
      /^import (.*?) from "([^"]*i18n[^"]*)"/gm,
    )) {
      if (!(match[1] ?? "").startsWith("type ")) {
        offences.push(`${relPosix(SRC, file)} : ${match[0]}`);
      }
    }
  }
  assert.deepEqual(offences, []);
});
