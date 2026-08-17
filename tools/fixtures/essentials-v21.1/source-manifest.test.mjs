import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ImportFailure } from "./lib/errors.mjs";
import { buildSourceManifest } from "./lib/source/manifest.mjs";
import { createSourceReader } from "./lib/source/reader.mjs";

async function collect(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test("SourceManifest inventories, fingerprints and classifies every physical object", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "essentials-manifest-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const nfdDirectory = `caf${"é".normalize("NFD")}`;
  const nfdFile = `r${"é".normalize("NFD")}.txt`;
  await mkdir(join(root, "Graphics", nfdDirectory), { recursive: true });
  await writeFile(join(root, "Graphics", nfdDirectory, nfdFile), "raw bytes");
  await mkdir(join(root, "Plugins"));
  await writeFile(join(root, "Plugins", "plugin.rb"), "plugin");
  await writeFile(join(root, "mkxp.json"), '{"windowTitle":"Pokémon Essentials v21.1"}');
  await writeFile(join(root, "Game.exe"), "excluded");
  await writeFile(join(root, "Game.ini"), "opaque");

  const manifest = await buildSourceManifest(root);
  assert.equal(manifest.version, "21.1");
  assert.equal(manifest.coverage.totalObjects, manifest.coverage.classifiedObjects);
  assert.equal(manifest.coverage.unclassifiedRecognisedObjects, 0);
  const byPath = new Map(manifest.objects.map((object) => [object.relativePath, object]));
  assert.equal(byPath.get("Graphics").classification, "raw-preserved");
  assert.equal(byPath.get("Graphics/café/ré.txt").physicalRelativePath, `Graphics/${nfdDirectory}/${nfdFile}`);
  assert.equal(byPath.get("Plugins/plugin.rb").classification, "raw-preserved");
  assert.equal(byPath.get("mkxp.json").classification, "parsed");
  assert.equal(byPath.get("Game.exe").classification, "explicitly-excluded");
  assert.equal(byPath.get("Game.exe").classificationReason, "runtime-executable");
  assert.equal(byPath.get("Game.ini").classification, "opaque-preserved");
  assert.match(byPath.get("Graphics/café/ré.txt").sha256, /^[a-f0-9]{64}$/);
  assert(Object.isFrozen(manifest));
  assert(Object.isFrozen(manifest.objects));

  const reader = createSourceReader(manifest);
  const raw = byPath.get("Graphics/café/ré.txt");
  assert.equal((await collect(reader.open(raw))).toString(), "raw bytes");
  await writeFile(raw.sourcePath, "changed bytes");
  await assert.rejects(
    collect(reader.open(raw)),
    (error) => error instanceof ImportFailure && error.category === "SOURCE_CHANGED",
  );
});
