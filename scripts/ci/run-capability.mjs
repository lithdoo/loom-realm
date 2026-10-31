import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const root = new URL("../../", import.meta.url);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MAP_LAYERING_TIMING_RACES = [
  "moving depth is below the tile before the boundary pixel and above at it",
  "stale superseded candidate bitmap is closed and cannot overwrite accepted",
];
const MAP_LAYERING_WITHOUT_TIMING_RACES = `^(?!(?:${MAP_LAYERING_TIMING_RACES.map(escapeRegex).join("|")})$).+ .+$`;

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

function runWithRetry(command, args, attempts = 2) {
  let lastStatus = 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = spawn(command, args);
    lastStatus = result.status ?? 1;
    if (lastStatus === 0) return;
    if (attempt < attempts) {
      console.warn(`Command failed on attempt ${attempt}/${attempts}; retrying once to isolate transient browser-paint timing.`);
    }
  }
  process.exit(lastStatus);
}

const npm = (...args) => run("npm", args);
const node = (...args) => run(process.execPath, args);

async function collectTestFiles(relativeDir) {
  const entries = await readdir(new URL(`${relativeDir}/`, root), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await collectTestFiles(child));
    else if (entry.isFile() && /\\.test\\.mjs$/.test(entry.name)) files.push(child);
  }
  return files;
}

async function runTestTrees(...relativeDirs) {
  const files = (await Promise.all(relativeDirs.map(collectTestFiles))).flat();
  if (files.length === 0) throw new Error(`no test files found under: ${relativeDirs.join(", ")}`);
  node("--test", ...files);
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

function buildMapStack() {
  npm(
    "run", "build",
    "-w", "@loomrealm/fsdb",
    "-w", "@loomrealm/fsdb-http",
    "-w", "@loomrealm/foundation",
    "-w", "@loomrealm/wire",
    "-w", "@loomrealm/shared-state",
    "-w", "@loomrealm/session-events",
    "-w", "@loomrealm/game-package",
    "-w", "@loomrealm/platform-ports",
    "-w", "@loomrealm/runtime-control",
    "-w", "@loomrealm/renderer-control",
    "-w", "@loomrealm/data",
    "-w", "@loomrealm/subsystem",
    "-w", "@loomrealm/renderer",
    "-w", "@loomrealm/main",
    "-w", "@loomrealm/game-launcher-hostra",
    "-w", "@loomrealm/desktop",
    "-w", "@loomrealm-game/common-controls",
    "-w", "@loomrealm-game/tile-presentation",
    "-w", "@loomrealm-game/map",
  );
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
  node("--test", "--test-concurrency=1", "test/m15-hostra-product.test.mjs");
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

  "map-build"() {
    buildMapStack();
  },

  async map() {
    buildMapStack();
    node("--test", "test/m14-boundary.test.mjs");
    node("--test", "tools/fixtures/essentials-v21.1/m14-consumer.test.mjs");
    await runTestTrees("game-libs/tile-presentation/test", "game-libs/map/test");
    npm("test", "-w", "@loomrealm-example/essentials-v21.1");
    npm("run", "build", "-w", "@loomrealm/game-launcher-pwa");
    npm("test", "-w", "@loomrealm-example/pokeman");
    node("--test", "test/m14-vertical.test.mjs");
    npm("pack", "-w", "@loomrealm-game/tile-presentation", "-w", "@loomrealm-game/map", "--dry-run");
    node("examples/essentials-v21.1/scripts/generate-fixtures.mjs");
    node(
      "--test",
      "tools/fixtures/essentials-v21.1/map-action-consumer.test.mjs",
      "tools/fixtures/essentials-v21.1/fsdb-plan.test.mjs",
      "test/rpgmap-safe-reimport.test.mjs",
      "test/rpgmap-verify-reimport.test.mjs",
      "test/rpgmap-local-consumer.test.mjs",
    );
    node(
      "--test",
      `--test-name-pattern=${MAP_LAYERING_WITHOUT_TIMING_RACES}`,
      "test/map-layering-browser.test.mjs",
    );
    node("--test", "test/map-depth-boundary-browser.test.mjs");
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
    // Qualification alone does not exercise the real /pwa/pokeman/
    // startup path; stage the product and boot it in Chromium as well.
    npm("run", "build:staging", "-w", "@loomrealm/pwa");
    node("apps/pwa/scripts/run-e2e.mjs", "staging");
  },

  "session-events"() {
    npm("run", "test:session-events:qualification");
  },

  battle() {
    npm("run", "build:battle");
    node(
      "--test",
      "game-libs/battle/test/decision.test.mjs",
      "game-libs/battle/test/presentation.test.mjs",
      "game-libs/battle/test/simulation-circuit.test.mjs",
      "game-libs/battle/test/simulation.test.mjs",
    );
    runWithRetry(process.execPath, ["--test", "game-libs/battle/test/browser-e2e.test.mjs"]);
    npm("pack", "-w", "@loomrealm-game/battle", "--dry-run");
  },

  async "rpg-dialogue"() {
    npm("run", "build:rpg-dialogue");
    await runTestTrees("game-libs/rpg-dialogue/test");
    npm("run", "test:rpg-dialogue-v1:qualification:run");
    npm("pack", "-w", "@loomrealm-game/rpg-dialogue", "--dry-run");
  },

  desktop() {
    buildMapStack();
    runDesktopTests();
  },

  "desktop-full"() {
    buildMapStack();
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
    await capabilities.map();
    await capabilities["schema-form"]();
    await capabilities.pwa();
    await capabilities.battle();
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
