import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { UI_EN } from "../src/i18n/ui-en.ts";
import { UI_FR, type Labels } from "../src/i18n/ui-fr.ts";

/** Resolved from this file, so the suite is independent of the working directory. */
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

type Leaf = string | string[] | ((...args: never[]) => string);

const walk = (node: Record<string, unknown>, prefix = ""): [string, Leaf][] =>
  Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? walk(value as Record<string, unknown>, path)
      : [[path, value as Leaf]];
  });

const FR = new Map(walk(UI_FR as unknown as Record<string, unknown>));
const EN = new Map(walk(UI_EN as unknown as Record<string, unknown>));

/** Accented characters or French function words that English never produces. */
const FRENCH =
  /[éèêëàâçîïôûùÉÈÀÇ]|\b(le|la|les|des|une|pour|dans|avec|puis|aucun|aucune|selon|chaque|tokens? actuels)\b/i;

test("les deux catalogues ont exactement les mêmes clés", () => {
  const missing = [...FR.keys()].filter((key) => !EN.has(key));
  const orphan = [...EN.keys()].filter((key) => !FR.has(key));
  assert.deepEqual(missing, [], "clés absentes de UI_EN");
  assert.deepEqual(orphan, [], "clés orphelines dans UI_EN");
});

test("les types correspondent clé par clé", () => {
  for (const [key, fr] of FR) {
    const en = EN.get(key);
    assert.equal(typeof en, typeof fr, key);
    if (Array.isArray(fr)) {
      assert.ok(Array.isArray(en), key);
      assert.equal((en as string[]).length, fr.length, key);
    }
    if (typeof fr === "function") {
      assert.equal((en as (...args: never[]) => string).length, fr.length, key);
    }
  }
});

/** Endonyms: a language name is always written in its own language. */
const ENDONYMS = new Set(["lang.fr", "lang.en"]);

test("aucune chaîne anglaise n’est restée en français", () => {
  const suspect: string[] = [];
  for (const [key, value] of EN) {
    if (ENDONYMS.has(key)) continue;
    const samples =
      typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    for (const sample of samples) {
      if (FRENCH.test(sample)) suspect.push(`${key} → ${sample}`);
    }
  }
  assert.deepEqual(suspect, []);
});

test("aucune chaîne n’est vide", () => {
  for (const [key, value] of [...FR, ...EN]) {
    const samples =
      typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    for (const sample of samples) assert.ok(sample.length > 0, key);
  }
});

test("les catalogues ne contiennent ni entité HTML ni note historique", () => {
  const relics: string[] = [];
  for (const [language, catalogue] of [
    ["fr", FR],
    ["en", EN],
  ] as const) {
    for (const [key, value] of catalogue) {
      const samples =
        typeof value === "string"
          ? [value]
          : Array.isArray(value)
            ? value
            : [String(value)];
      for (const sample of samples) {
        if (
          /&(?:nbsp|gt|lt|amp);/i.test(sample) ||
          /(?:ce n[’']est pas|is not) Run n[’'] Run/i.test(sample)
        ) {
          relics.push(`${language}.${key} → ${sample}`);
        }
      }
    }
  }
  assert.deepEqual(relics, []);
});

const SOURCES = [
  ...readdirSync(join(SRC, "components"))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => join(SRC, "components", name)),
  join(SRC, "App.tsx"),
  join(SRC, "constants.tsx"),
  join(SRC, "slots.tsx"),
];

test("aucune copie française ne subsiste hors du catalogue", () => {
  // Comments are allowed to stay in French; rendered strings are not.
  const leaks: string[] = [];
  for (const file of SOURCES) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        const code = line.replace(/\/\/.*$/, "");
        for (const match of code.matchAll(/"([^"\n]{4,})"|`([^`\n]{4,})`/g)) {
          const value = match[1] ?? match[2] ?? "";
          if (/[éèêàçôûù]/.test(value)) {
            leaks.push(`${file}:${index + 1} ${value.slice(0, 60)}`);
          }
        }
      });
  }
  assert.deepEqual(leaks, []);
});

test("chaque clé du catalogue est référencée au moins une fois", () => {
  const sources = SOURCES.map((file) => readFileSync(file, "utf8")).join("\n");
  const escape = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const unused = [...FR.keys()].filter((path) => {
    const [namespace, key] = path.split(".");
    // `meta` and `theme` entries are consumed indirectly by helpers in
    // ui/constants.tsx (dynamic lookups, not literal `L.namespace.key`).
    if (namespace === "meta" || namespace === "lang" || namespace === "theme") {
      return false;
    }
    return !new RegExp(
      `L\\.${escape(namespace)}\\.${escape(key)}(?![A-Za-z0-9_])`,
    ).test(sources);
  });
  assert.deepEqual(unused, [], "clés jamais rendues");
});

test("la langue par défaut du catalogue reste le français", () => {
  const labels: Labels = UI_FR;
  assert.equal(labels.meta.locale, "fr-FR");
  assert.equal(UI_EN.meta.locale, "en-GB");
});

test("aucun n\u0153ud JSX ne rend de prose fran\u00e7aise en dur", () => {
  // Bare text between tags is the form that escaped three earlier sweeps,
  // because words like "Duo" or "Auto" carry no French marker at all.
  const PROSE = /^[A-Za-z\u00C0-\u00FF0-9 ,;:!?%\u00b7'\u2019.\-/()]+$/;
  const CODEY = /[_{}<>=`"$]|\b[a-z]+[A-Z]\w*|\w+\.\w+|=>/;
  const FRENCH = /[\u00e9\u00e8\u00e0\u00ea\u00e7\u00ee\u00f4\u00fb\u00f9]/;
  const leaks: string[] = [];
  for (const file of SOURCES) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        const text = line.trim();
        const indent = line.length - line.trimStart().length;
        if (
          text &&
          indent >= 4 &&
          !text.startsWith("//") &&
          PROSE.test(text) &&
          !CODEY.test(text) &&
          FRENCH.test(text)
        ) {
          leaks.push(`${file}:${index + 1} ${text.slice(0, 60)}`);
        }
      });
  }
  assert.deepEqual(leaks, []);
});
