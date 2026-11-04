import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const root = new URL("../../", import.meta.url);

function spawn(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  console.log(`\n> ${printable}`);
  return spawnSync(command, args, {
    cwd: new URL(".", root),
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
    ...options,
  });
}

function run(command, args, options = {}) {
  const result = spawn(command, args, options);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const npm = (...args) => run("npm", args);
const node = (...args) => run(process.execPath, args);

async function collectTestFiles(relativeDir) {
  const entries = await readdir(new URL(`${relativeDir}/`, root), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await collectTestFiles(child));
    else if (entry.isFile() && /\.test\.mjs$/.test(entry.name)) files.push(child);
  }
  return files;
}

async function runTestTrees(...relativeDirs) {
  for (const relativeDir of relativeDirs) {
    const files = await collectTestFiles(relativeDir);
    if (files.length === 0) throw new Error(`no test files found under: ${relativeDir}`);
    node("--test", ...files);
  }
}

const REGRESSION_TEST_DIRS = [
  "packages/fsdb/test",
  "packages/foundation/test",
  "packages/wire/test",
  "packages/shared-state/test",
  "packages/session-events/test",
  "packages/game-package/test",
  "packages/game-launcher-pwa/test",
  "packages/platform-ports/test",
  "packages/runtime-control/test",
  "packages/renderer-control/test",
  "packages/data/test",
  "packages/subsystem/test",
  "packages/renderer/test",
  "packages/main/test",
  "packages/game-launcher-hostra/test",
  "packages/fsdb-http/test",
  "apps/desktop/test",
];

function buildRegressionStack() {
  // npm run build --workspaces is not dependency-topological. Build the known
  // authority/product stack in its explicit dependency order before tests.
  npm("run", "build:shared-state-stack");
  npm("run", "build", "-w", "@loomrealm/fsdb-http");
}

async function packPublishable() {
  for (const dir of ["packages", "game-libs"]) {
    const entries = await readdir(new URL(`${dir}/`, root), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const packagePath = new URL(`${dir}/${entry.name}/package.json`, root);
      let pkg;
      try {
        pkg = JSON.parse(await readFile(packagePath, "utf8"));
      } catch {
        continue;
      }
      if (pkg.private || !pkg.name) continue;
      npm("pack", "-w", pkg.name, "--dry-run");
    }
  }
}

function runDesktopTests() {
  node(
    "--test",
    "apps/desktop/test/renderer-viewport-source.test.mjs",
    "apps/desktop/test/product-viewport-composition.test.mjs",
    "apps/desktop/test/loopback-renderer-control.test.mjs",
    "apps/desktop/test/product-lifecycle.test.mjs",
    "test/m15-boundary.test.mjs",
  );
}

const capabilities = {
  async core() {
    buildRegressionStack();
    await runTestTrees(...REGRESSION_TEST_DIRS);
    npm("run", "build", "-w", "@loomrealm-game/common-controls");
    node("--test", "test/game-common-controls-input-v1/qualification.test.mjs");
    node("--test", "test/render-update-v1/qualification.test.mjs");
    node("--test", "test/m11-boundary.test.mjs");
  },

  async compat() {
    buildRegressionStack();
    await runTestTrees(...REGRESSION_TEST_DIRS);
  },

  content() {
    npm("run", "test:fixtures");
    node("--test", "test/m12-boundary.test.mjs");
    npm("pack", "-w", "@loomrealm/fsdb", "-w", "@loomrealm/fsdb-http", "--dry-run");
  },

  presentation() {
    npm("run", "build:desktop-stack");
    node(
      "--test",
      "packages/renderer/test/web-presentation-config.test.mjs",
      "packages/renderer/test/web-projector-events.test.mjs",
      "packages/renderer/test/presentation-event.test.mjs",
      "packages/renderer/test/presentation-seam.test.mjs",
      "test/web-presentation-v2/qualification.test.mjs",
    );
    node("--test", "test/m13-boundary.test.mjs");
    npm("pack", "-w", "@loomrealm/renderer", "--dry-run");
  },

  async "schema-form"() {
    npm("run", "test:schema-form:qualification");
    await runTestTrees("game-libs/schema-form/test");
    npm("pack", "-w", "@loomrealm-game/schema-form", "--dry-run");
  },

  async pwa() {
    npm("run", "build:qualification", "-w", "@loomrealm/pwa");
    await runTestTrees("packages/game-launcher-pwa/test");
    npm("run", "test:unit", "-w", "@loomrealm/pwa");
    node("apps/pwa/scripts/run-e2e.mjs", "all");
  },

  "session-events"() {
    npm("run", "test:session-events:qualification");
  },

  "session-events-after-pwa"() {
    // The Browser CI job runs this only after the PWA capability. That prior
    // step already built the qualification bundle and ran the same m17 E2E
    // suite, while Linux core regression covers the package integration tests.
    node("--test", "test/session-events-v1/qualification.test.mjs");
  },

  async "rpg-dialogue"() {
    npm("run", "build:rpg-dialogue");
    await runTestTrees("game-libs/rpg-dialogue/test");
    npm("run", "test:rpg-dialogue-v1:qualification:run");
    npm("pack", "-w", "@loomrealm-game/rpg-dialogue", "--dry-run");
  },

  desktop() {
    npm("run", "build:desktop-stack");
    runDesktopTests();
  },

  "desktop-full"() {
    npm("run", "build:desktop-stack");
    runDesktopTests();
  },

  "state-windows"() {
    npm("run", "test:shared-state");
    npm("run", "test:shared-state:qualification:run");
    npm("test", "-w", "@loomrealm/desktop");
    npm("pack", "-w", "@loomrealm/shared-state", "-w", "@loomrealm/game-launcher-pwa", "--dry-run");
  },

  "hostra-conformance"() {
    npm("run", "test:game-launcher-hostra");
    npm("pack", "-w", "@loomrealm/game-launcher-hostra", "--dry-run");
    node("scripts/qualify-hostra-packed.mjs");
  },

  async pack() {
    await packPublishable();
  },

  async "full-linux"() {
    await capabilities.core();
    await capabilities.content();
    await capabilities.presentation();
    await capabilities["schema-form"]();
    await capabilities.pwa();
    await capabilities["rpg-dialogue"]();
    await capabilities.pack();
  },

  "full-windows"() {
    capabilities["state-windows"]();
    capabilities["hostra-conformance"]();
  },
};

const requested = process.argv.slice(2);
if (requested.length === 0) {
  console.error(`usage: run-capability.mjs <${Object.keys(capabilities).join("|")}> [...]`);
  process.exit(2);
}

for (const name of requested) {
  const capability = capabilities[name];
  if (!capability) {
    console.error(`unknown capability: ${name}`);
    process.exit(2);
  }
  await capability();
}
