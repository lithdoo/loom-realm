import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ImportFailure } from "./lib/errors.mjs";
import { VANILLA_REGISTRY_V21_1 } from "./lib/essentials/v21.1/vanilla-registry.mjs";
import { buildCoverageReport, V21_1_PBS_CLASSIFICATIONS } from "./lib/model/coverage.mjs";
import { buildSourceManifest } from "./lib/source/manifest.mjs";

async function syntheticManifest(t) {
  const root = await mkdtemp(join(tmpdir(), "essentials-registry-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "PBS"));
  await mkdir(join(root, "Data"));
  for (const family of VANILLA_REGISTRY_V21_1.pbsFamilies) {
    if (!family.required) continue;
    await writeFile(join(root, "PBS", `${family.baseFilenames[0]}.txt`), "# fixture\n");
  }
  for (const entry of VANILLA_REGISTRY_V21_1.compiledData) {
    if (entry.required) await writeFile(join(root, "Data", entry.filename), "data");
  }
  for (const rootDefinition of VANILLA_REGISTRY_V21_1.rmxpRoots) {
    const filename = rootDefinition.pattern === "Map*.rxdata" ? "Map001.rxdata" : rootDefinition.pattern;
    if (!rootDefinition.required || filename === "Scripts.rxdata") continue;
    await writeFile(join(root, "Data", filename), "rxdata");
  }
  return buildSourceManifest(root);
}

test("v21.1 registry freezes the audited authority and all completeness dimensions", () => {
  const registry = VANILLA_REGISTRY_V21_1;
  assert.equal(registry.authority.commit, "ea7b5d56d2436591160983c4e641a2ceee2d875a");
  assert.equal(registry.pbsFamilies.length, 22);
  assert.equal(registry.compiledData.length, 22);
  assert.equal(registry.hardcodedDomains.length, 17);
  assert.equal(registry.rmxpRoots.length, 18);
  assert(Object.isFrozen(registry));
  assert(Object.isFrozen(registry.pbsFamilies));
});

test("coverage output is deterministic and accounts every required family", async (t) => {
  const manifest = await syntheticManifest(t);
  const first = buildCoverageReport(manifest, VANILLA_REGISTRY_V21_1);
  const second = buildCoverageReport(manifest, VANILLA_REGISTRY_V21_1);
  assert.deepEqual(first, second);
  assert.deepEqual(first.registry.unclassifiedRequiredFamilies, []);
  assert.equal(first.registry.expectedFamilies.length, 22);
  assert.equal(first.registry.implementedFamilies.length, 22);
  assert.equal(first.registry.remainingFamilies.length, 0);
  assert.deepEqual(first.pbs.unmatchedMainFiles, []);
  assert(Object.isFrozen(first));
});

test("a new required registry family without a disposition fails the coverage gate", async (t) => {
  const manifest = await syntheticManifest(t);
  const extra = Object.freeze({
    id: "new-required-family", baseFilenames: Object.freeze(["new_required"]),
    compiledData: Object.freeze([]), compilerPass: "compile_new_required", required: true,
    companionPrefixes: Object.freeze([]), authority: Object.freeze(["test authority"]),
  });
  const registry = Object.freeze({
    ...VANILLA_REGISTRY_V21_1,
    pbsFamilies: Object.freeze([...VANILLA_REGISTRY_V21_1.pbsFamilies, extra]),
  });
  assert.equal(V21_1_PBS_CLASSIFICATIONS[extra.id], undefined);
  assert.throws(
    () => buildCoverageReport(manifest, registry),
    (error) => error instanceof ImportFailure && error.category === "COVERAGE_FAILURE",
  );
});

test("an unmatched top-level PBS file fails instead of being silently ignored", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "essentials-registry-unmatched-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "PBS"));
  await writeFile(join(root, "PBS", "unknown_family.txt"), "unknown\n");
  const manifest = await buildSourceManifest(root);
  assert.throws(
    () => buildCoverageReport(manifest, VANILLA_REGISTRY_V21_1),
    (error) => error instanceof ImportFailure && error.category === "COVERAGE_FAILURE",
  );
});
