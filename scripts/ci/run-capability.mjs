import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const root = new URL("../../", import.meta.url);

function run(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  console.log(`\n> ${printable}`);
  const result = spawnSync(command, args, {
    cwd: new URL(".", root),
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
    ...options,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const npm = (...args) => run("npm", args);
const node = (...args) => run(process.execPath, args);

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

const capabilities = {
  core() {
    npm("run", "build:packages");
    npm("run", "test:regression");
    npm("run", "test:m10:qualification:run");
    node("--test", "test/m10-boundary.test.mjs");
    npm("run", "test:m11:qualification:run");
    node("--test", "test/m11-boundary.test.mjs");
  },

  compat() {
    npm("run", "build:packages");
    npm("run", "test:regression");
  },

  content() {
    npm("run", "test:fixtures");
    node("--test", "test/m12-boundary.test.mjs");
    npm("run", "test:m12:pack");
  },

  presentation() {
    npm("run", "test:m13:pr");
  },

  map() {
    npm("run", "test:m14:pr");
    node("examples/essentials-v21.1/scripts/generate-fixtures.mjs");
    node(
      "--test",
      "tools/fixtures/essentials-v21.1/map-action-consumer.test.mjs",
      "tools/fixtures/essentials-v21.1/fsdb-plan.test.mjs",
      "test/rpgmap-safe-reimport.test.mjs",
      "test/rpgmap-verify-reimport.test.mjs",
      "test/rpgmap-local-consumer.test.mjs",
      "test/map-layering-browser.test.mjs",
    );
  },

  "schema-form"() {
    npm("run", "test:schema-form:qualification");
    npm("test", "-w", "@loomrealm-game/schema-form");
    npm("pack", "-w", "@loomrealm-game/schema-form", "--dry-run");
  },

  pwa() {
    npm("run", "build:m16");
    npm("test", "-w", "@loomrealm/game-launcher-pwa");
    npm("test", "-w", "@loomrealm/pwa");
  },

  battle() {
    npm("run", "test:battle");
    npm("pack", "-w", "@loomrealm-game/battle", "--dry-run");
  },

  desktop() {
    npm("run", "build:m15");
    npm("run", "test:m15:desktop");
    npm("run", "test:m15:hostra");
  },

  "desktop-full"() {
    npm("run", "build:m15");
    npm("run", "test:m15:desktop");
    npm("run", "test:m15:hostra:full");
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
