import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildPwaBundle, validatePwaBundlePayload } from "../scripts/build-bundle.mjs";

const fixture = () => ({
  formatVersion: 1,
  gameEntryText: JSON.stringify({
    formatVersion: 1,
    initial: { subsystem: "demo", input: {} },
    subsystems: [{ key: "demo" }],
  }),
  launchManifestText: JSON.stringify({
    formatVersion: 1,
    subsystems: [{ key: "demo", module: "subsystems/demo.mjs" }],
  }),
  presentation: { formatVersion: 1, scripts: [], styles: [] },
  executables: [{
    logicalModule: "subsystems/demo.mjs",
    mime: "text/javascript",
    source: "export default () => ({ async frame() { return { type: 'completed' }; } });",
    contentVersion: "sha256:demo",
  }],
  content: [{
    kind: "record",
    namespace: "struct.demo",
    key: "config",
    mime: "application/json",
    encoding: "base64",
    body: "eyJvayI6dHJ1ZX0=",
  }],
});

test("generic PWA bundle input rejects malformed manifests, duplicate identities, and invalid encodings", () => {
  assert.doesNotThrow(() => validatePwaBundlePayload(fixture()));
  const duplicate = fixture();
  duplicate.content.push({ ...duplicate.content[0] });
  assert.throws(() => validatePwaBundlePayload(duplicate), /Duplicate PWA Content identity/);
  const invalidEncoding = fixture();
  invalidEncoding.content[0].body = "not base64!";
  assert.throws(() => validatePwaBundlePayload(invalidEncoding), /canonical base64/);
  const invalidManifest = fixture();
  invalidManifest.gameEntryText = "not json";
  assert.throws(() => validatePwaBundlePayload(invalidManifest), /gameEntryText/);
});

test("generic PWA builder emits an app-scoped installation bundle without product-specific code", async () => {
  const temp = await mkdtemp(join(tmpdir(), "loomrealm-pwa-bundle-"));
  try {
    const input = join(temp, "input.json");
    const outputDir = join(temp, "output");
    await writeFile(input, JSON.stringify(fixture()));
    const result = await buildPwaBundle({
      bundlePath: input,
      appId: "fixture-game",
      basePath: "/pwa/fixture-game/",
      outputDir,
    });
    assert.equal(result.appId, "fixture-game");
    assert.equal(result.basePath, "/pwa/fixture-game/");
    assert.match(result.bundleId, /^loomrealm-pwa-sha256-[0-9a-f]{64}$/);
    const generation = JSON.parse(await readFile(join(outputDir, "generation.json"), "utf8"));
    assert.equal(generation.basePath, "/pwa/fixture-game/");
    assert.equal(generation.appId, "fixture-game");
    const bundle = JSON.parse(await readFile(join(outputDir, "installation-bundle.json"), "utf8"));
    assert.equal(bundle.bundleId, result.bundleId);
    assert.equal(bundle.formatVersion, 1);
    for (const file of ["index.html", "window.js", "service-worker.js", "session-worker.js", "worker-runner.js"]) {
      const content = await readFile(join(outputDir, file), "utf8");
      assert.ok(content.length > 0, "missing " + file);
    }
    const windowSource = await readFile(join(outputDir, "window.js"), "utf8");
    assert.match(windowSource, /installation-bundle\.json/);
    assert.doesNotMatch(windowSource, /PokeMan|pokeman/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
