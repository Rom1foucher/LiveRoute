import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

const root = process.cwd();
const failures = [];

const read = (path) => readFileSync(path, "utf8");
const extract = (source, expression, label) => {
  const match = source.match(expression);
  if (!match) failures.push(`Could not read ${label}`);
  return match?.[1] ?? "";
};

const decisionLog = read("packages/core/src/diagnostics/decision-log.ts");
const diagnostics = read("packages/core/src/diagnostics/decision-diagnostics.ts");
const applicationVersion = JSON.parse(read("package.json")).version;
const policyVersion = extract(
  decisionLog,
  /GRAND_LIVE_POLICY_VERSION\s*=\s*["']([^"']+)["']/,
  "GRAND_LIVE_POLICY_VERSION",
);
const logSchema = extract(
  decisionLog,
  /DECISION_LOG_SCHEMA_VERSION\s*=\s*(\d+)/,
  "DECISION_LOG_SCHEMA_VERSION",
);
const diagnosticSchema = extract(
  diagnostics,
  /DECISION_DIAGNOSTIC_SCHEMA\s*=\s*\n?\s*["']([^"']+)["']/,
  "DECISION_DIAGNOSTIC_SCHEMA",
);

const currentDocs = [
  "README.md",
  "docs/ALGORITHMIC_MODEL.md",
  "docs/VALIDATION.md",
  "docs/DECISION_LOG_V5.md",
];
for (const path of currentDocs) {
  const source = read(path);
  if (policyVersion && !source.includes(policyVersion)) {
    failures.push(`${path}: missing current policy ${policyVersion}`);
  }
}

const decisionDoc = read("docs/DECISION_LOG_V5.md");
if (
  logSchema &&
  !decisionDoc.includes(`schemaVersion       = ${logSchema}`)
) {
  failures.push(
    `docs/DECISION_LOG_V5.md: missing decision-log schema ${logSchema}`,
  );
}
if (diagnosticSchema && !decisionDoc.includes(diagnosticSchema)) {
  failures.push(`docs/DECISION_LOG_V5.md: missing ${diagnosticSchema}`);
}
if (
  !decisionDoc.includes(
    `application version                  = ${applicationVersion}`,
  )
) {
  failures.push(
    `docs/DECISION_LOG_V5.md: missing application version ${applicationVersion}`,
  );
}

const markdownFiles = ["README.md", "CONTRIBUTING.md"];
const walkMarkdown = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (normalize(path) !== normalize("docs/archive")) walkMarkdown(path);
    } else if (name.endsWith(".md")) {
      markdownFiles.push(path);
    }
  }
};
walkMarkdown("docs");

const markdownLink = /\[[^\]]*\]\(([^)]+)\)/g;
const docPathReference = /`(docs\/[A-Za-z0-9_./-]+\.md)`/g;
for (const file of markdownFiles) {
  const source = read(file);
  for (const match of source.matchAll(docPathReference)) {
    if (!existsSync(match[1])) {
      failures.push(`${file}: broken documentation reference ${match[1]}`);
    }
  }
  for (const match of source.matchAll(markdownLink)) {
    const raw = match[1].trim();
    const target = raw.split("#", 1)[0];
    if (
      !target ||
      target.startsWith("#") ||
      target.startsWith("mailto:") ||
      target.includes("://")
    ) {
      continue;
    }
    const absolute = resolve(dirname(file), target);
    const insideRoot = relative(root, absolute);
    if (insideRoot.startsWith("..")) continue;
    if (!existsSync(absolute)) {
      failures.push(`${file}: broken local link ${raw}`);
    }
  }
}

if (failures.length > 0) {
  console.error(
    "Documentation consistency check failed:\n- " + failures.join("\n- "),
  );
  process.exitCode = 1;
} else {
  console.log(
    `Documentation consistency OK: ${policyVersion}, log schema v${logSchema}, ${diagnosticSchema}.`,
  );
}
