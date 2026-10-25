import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

// CI currently compiles the workspace before the PWA staging test runs.
// The self-hosted deployment instead starts with a fresh checkout and npm ci.
// Guard the complete dependency closure and build order independently of the
// state of dist/ left by preceding test steps.
const root = new URL("../../../", import.meta.url);
const read = async (url) => JSON.parse(await readFile(url, "utf8"));

test("generic PWA build keeps PokeMan fixture loading inside the staging boundary", async () => {
  const source = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import .*prepare-pwa-content\.mjs/m);
  assert.match(
    source,
    /async function buildStaging\(\) \{[\s\S]*await import\([\s\S]*prepare-pwa-content\.mjs[\s\S]*\)/,
  );
  assert.equal((source.match(/async function bundleSubsystem\(/g) ?? []).length, 1);
  assert.equal((source.match(/await build\(\{/g) ?? []).length, 1, "esbuild subsystem options stay centralized");
});

async function workspacePackages() {
  const packages = new Map();
  for (const directory of ["packages", "game-libs", "apps"]) {
    for (const entry of await readdir(new URL(`${directory}/`, root), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const pkg = await read(new URL(`${directory}/${entry.name}/package.json`, root));
        if (typeof pkg.name === "string") packages.set(pkg.name, pkg);
      } catch (cause) {
        if (cause?.code !== "ENOENT") throw cause;
      }
    }
  }
  return packages;
}

test("PokeMan staging build is self-contained and dependency-ordered for fresh Runner checkouts", async () => {
  const packages = await workspacePackages();
  const pwa = packages.get("@loomrealm/pwa");
  assert.ok(pwa, "PWA workspace missing");
  const script = pwa.scripts["build:staging"];
  assert.equal(typeof script, "string");
  assert.match(script, / && tsc -p tsconfig\.json && node scripts\/build\.mjs --staging$/);
  const buildCommand = script.split(" && ")[0];
  assert.match(buildCommand, /^npm run build(?: -w [@\w./-]+)+$/);
  const order = [...buildCommand.matchAll(/ -w (\S+)/g)].map((entry) => entry[1]);
  assert.equal(new Set(order).size, order.length, "workspace should not be built twice");
  const position = new Map(order.map((name, index) => [name, index]));

  // PokeMan staging also builds Base and Map executables from source and creates an
  // FSDB fixture, neither of which is a declared app/pwa runtime dependency.
  const required = new Set();
  const visit = (name) => {
    if (required.has(name)) return;
    required.add(name);
    const pkg = packages.get(name);
    assert.ok(pkg, `Missing local workspace: ${name}`);
    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      if (packages.has(dependency)) visit(dependency);
    }
  };
  for (const name of ["@loomrealm/pwa", "@loomrealm-game/map", "@loomrealm/fsdb"]) visit(name);
  required.delete("@loomrealm/pwa"); // Built by tsc after prerequisites.
  assert.deepEqual(new Set(order), required, "build:staging must compile every runtime/Map/FSDB workspace");
  for (const name of order) {
    const pkg = packages.get(name);
    assert.equal(typeof pkg?.scripts?.build, "string", `${name} is missing a build script`);
    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      if (required.has(dependency)) {
        assert.ok(position.get(dependency) < position.get(name),
          `${dependency} must build before ${name} on a fresh Runner checkout`);
      }
    }
  }
});
