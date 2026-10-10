import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const root = new URL("../../", import.meta.url);
const MAP_DEPTH_BOUNDARY_RACE = "moving depth is below the tile before the boundary pixel and above at it";
const MAP_LAYERING_WITHOUT_DEPTH_RACE = `^(?!${MAP_DEPTH_BOUNDARY_RACE}$).+ .+$`;

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

function buildRegressionStack() {
  // npm run build --workspaces is not dependency-topological. Build the known
  // authority/product stack in its explicit dependency order before tests.
  npm("run", "build:realm-state-stack");
  npm("run", "build", "-w", "@loomrealm/fsdb-http");
}

function buildMapStack() {
  npm(
    "run", "build",
    "-w", "@loomrealm/fsdb",
    "-w", "@loomrealm/fsdb-http",
    "-w", "@loomrealm/foundation",
    "-w", "@loomrealm/wire",
    "-w", "@loomrealm/realm-state",
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
    "-w", "@loomrealm-game/tile-presentation",
    "-w", "@loomrealm-game/map",
  );
}

function buildPwaStack() {
  npm(
    "run", "build",
    "-w", "@loomrealm/foundation",
    "-w", "@loomrealm/wire",
    "-w", "@loomrealm/realm-state",
    "-w", "@loomrealm/game-package",
    "-w", "@loomrealm/platform-ports",
    "-w", "@loomrealm/runtime-control",
    "-w", "@loomrealm/renderer-control",
    "-w", "@loomrealm/data",
    "-w", "@loomrealm/subsystem",
    "-w", "@loomrealm/renderer",
    "-w", "@loomrealm/main",
    "-w", "@loomrealm/game-launcher-pwa",
    "-w", "@loomrealm/pwa",
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
    "apps/desktop/test/renderer-input-source.test.mjs",
    "apps/desktop/test/renderer-viewport-source.test.mjs",
    "apps/desktop/test/product-viewport-composition.test.mjs",
    "apps/desktop/test/loopback-renderer-control.test.mjs",
    "apps/desktop/test/product-lifecycle.test.mjs",
    "test/m15-boundary.test.mjs",
  );
  node("--test", "--test-concurrency=1", "test/m15-hostra-product.test.mjs");
}

const capabilities = {
  core() {
    buildRegressionStack();
    npm("run", "test:regression");
    node("--test", "test/user-input-v1/qualification.test.mjs");
    node("--test", "test/m10-boundary.test.mjs");
    node("--test", "test/render-update-v1/qualification.test.mjs");
    node("--test", "test/m11-boundary.test.mjs");
  },

  compat() {
    buildRegressionStack();
    npm("run", "test:regression");
  },

  content() {
    npm("run", "test:fixtures");
    node("--test", "test/m12-boundary.test.mjs");
    npm("pack", "-w", "@loomrealm/fsdb", "-w", "@loomrealm/fsdb-http", "--dry-run");
  },

  presentation() {
    npm("run", "build:desktop-stack");
    node("--test", "test/web-presentation-v1/qualification.test.mjs");
    node("--test", "test/m13-boundary.test.mjs");
    npm("pack", "-w", "@loomrealm/renderer", "--dry-run");
  },

  "map-build"() {
    buildMapStack();
  },

  map() {
    buildMapStack();
    node("--test", "test/m14-boundary.test.mjs");
    node("--test", "tools/fixtures/essentials-v21.1/m14-consumer.test.mjs");
    npm("test", "-w", "@loomrealm-game/tile-presentation");
    npm("test", "-w", "@loomrealm-game/map");
    npm("test", "-w", "@loomrealm-example/essentials-v21.1");
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
      `--test-name-pattern=${MAP_LAYERING_WITHOUT_DEPTH_RACE}`,
      "test/map-layering-browser.test.mjs",
    );
    node("--test", "test/map-depth-boundary-browser.test.mjs");
  },

  "schema-form"() {
    npm("run", "test:schema-form:qualification");
    npm("test", "-w", "@loomrealm-game/schema-form");
    npm("pack", "-w", "@loomrealm-game/schema-form", "--dry-run");
  },

  pwa() {
    buildPwaStack();
    npm("test", "-w", "@loomrealm/game-launcher-pwa");
    npm("test", "-w", "@loomrealm/pwa");
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

  desktop() {
    buildMapStack();
    runDesktopTests();
  },

  "desktop-full"() {
    buildMapStack();
    runDesktopTests();
  },

  "state-windows"() {
    npm("run", "test:realm-state");
    npm("run", "test:realm-state:qualification:run");
    npm("test", "-w", "@loomrealm/desktop");
    npm("pack", "-w", "@loomrealm/realm-state", "-w", "@loomrealm/game-launcher-pwa", "--dry-run");
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
    capabilities.core();
    capabilities.content();
    capabilities.presentation();
    capabilities.map();
    capabilities["schema-form"]();
    capabilities.pwa();
    capabilities.battle();
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
