import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const root = readJson("package.json");
const expected = root.version;
const failures = [];

const assertEqual = (label, actual, wanted = expected) => {
  if (actual !== wanted) {
    failures.push(`${label}: expected ${wanted}, got ${String(actual)}`);
  }
};

const workspacePackages = [
  "packages/core/package.json",
  "packages/ui/package.json",
  "apps/web/package.json",
  "apps/desktop/package.json",
];

for (const path of workspacePackages) {
  const pkg = readJson(path);
  assertEqual(`${path} version`, pkg.version);
  for (const dependency of ["@glcp/core", "@glcp/ui"]) {
    if (pkg.dependencies?.[dependency] !== undefined) {
      assertEqual(`${path} ${dependency}`, pkg.dependencies[dependency]);
    }
  }
}

for (const path of ["apps/web/src/version.ts", "apps/desktop/src/version.ts"]) {
  const source = readFileSync(path, "utf8");
  const match = source.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
  assertEqual(`${path} APP_VERSION`, match?.[1]);
}

const tauri = readJson("apps/desktop/src-tauri/tauri.conf.json");
assertEqual("apps/desktop/src-tauri/tauri.conf.json version", tauri.version);

const cargo = readFileSync("apps/desktop/src-tauri/Cargo.toml", "utf8");
const cargoPackage = cargo.match(
  /\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/,
);
assertEqual(
  "apps/desktop/src-tauri/Cargo.toml package.version",
  cargoPackage?.[1],
);

const cargoLock = readFileSync("apps/desktop/src-tauri/Cargo.lock", "utf8");
const cargoLockPackage = cargoLock.match(
  /\[\[package\]\]\nname = "grand-live-carryover-planner-ocr"\nversion = "([^"]+)"/,
);
assertEqual(
  "apps/desktop/src-tauri/Cargo.lock application package.version",
  cargoLockPackage?.[1],
);

const releaseNotes = readFileSync("RELEASE_NOTES.md", "utf8");
if (!releaseNotes.includes(`## v${expected}`)) {
  failures.push(`RELEASE_NOTES.md: missing current ## v${expected} section`);
}

const lock = readJson("package-lock.json");
const lockPackages = [
  "",
  "packages/core",
  "packages/ui",
  "apps/web",
  "apps/desktop",
];
for (const path of lockPackages) {
  assertEqual(
    `package-lock.json packages[${JSON.stringify(path)}].version`,
    lock.packages?.[path]?.version,
  );
}
for (const path of ["packages/ui", "apps/web", "apps/desktop"]) {
  const dependencies = lock.packages?.[path]?.dependencies ?? {};
  for (const dependency of ["@glcp/core", "@glcp/ui"]) {
    if (dependencies[dependency] !== undefined) {
      assertEqual(
        `package-lock.json ${path} ${dependency}`,
        dependencies[dependency],
      );
    }
  }
}

if (failures.length > 0) {
  console.error(
    "Version consistency check failed:\n- " + failures.join("\n- "),
  );
  process.exitCode = 1;
} else {
  console.log(
    `Version consistency OK: ${expected} across web, desktop, workspaces and Tauri metadata.`,
  );
}
