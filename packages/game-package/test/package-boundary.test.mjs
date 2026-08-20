import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("..", import.meta.url));

async function sourceFiles(directory) {
  const pending = [directory];
  const files = [];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.name.endsWith(".ts")) files.push(path);
    }
  }
  return files;
}

test("package has exactly the frozen runtime root exports", async () => {
  const root = await import("../dist/index.js");
  assert.deepEqual(Object.keys(root).sort(), [
    "GamePackageError",
    "parseGameEntryV1",
    "validateGameEntryV1",
  ]);
});

test("package has only the Wire runtime dependency and a root export", async () => {
  const manifest = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
  assert.deepEqual(manifest.dependencies, { "@loomrealm/wire": "0.1.0-alpha.0" });
  assert.deepEqual(Object.keys(manifest.exports), ["."]);
  assert.equal(manifest.sideEffects, false);
  assert.equal(manifest.engines.node, ">=20");
});

test("source remains platform-neutral and does not acquire runtime authority", async () => {
  const files = await sourceFiles(join(packageDirectory, "src"));
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");

  assert.doesNotMatch(source, /from\s+["']node:/);
  assert.doesNotMatch(source, /@loomrealm\/(foundation|main|subsystem|runtime-control|game-launcher)/);
  assert.doesNotMatch(source, /\b(fetch|WebSocket|MessagePort|Worker)\b/);
  assert.doesNotMatch(source, /\b(readFile|writeFile|import\s*\()\b/);
});

test("declarations expose the complete frozen type surface", async () => {
  const declarations = await readFile(join(packageDirectory, "dist", "index.d.ts"), "utf8");
  for (const name of [
    "GamePackageError",
    "GamePackageErrorCode",
    "GameEntryV1",
    "InitialFrameTargetV1",
    "SubsystemDescriptorV1",
    "ValidatedGameEntryV1",
    "parseGameEntryV1",
    "validateGameEntryV1",
  ]) {
    assert.match(declarations, new RegExp(`\\b${name}\\b`));
  }
});
