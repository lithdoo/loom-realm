import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveProductGeneration, emitProductArtifacts } from "../scripts/build-identity.mjs";

test("PWA generation is deterministic and changes with an imported dependency artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "loomrealm-pwa-generation-"));
  try {
    const entry = join(root, "entry.js");
    const dependency = join(root, "dependency.js");
    await writeFile(entry, 'import { value } from "./dependency.js"; globalThis.fixture = value;\n');
    await writeFile(dependency, "export const value = 1;\n");
    const entries = [{ input: entry, output: "window.js" }];
    const first = await deriveProductGeneration(entries, root);
    const same = await deriveProductGeneration(entries, root);
    assert.equal(same, first);
    await writeFile(dependency, "export const value = 2;\n");
    const changed = await deriveProductGeneration(entries, root);
    assert.notEqual(changed, first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("production Window artifact excludes the qualification authority surface", async () => {
  const output = await mkdtemp(join(tmpdir(), "loomrealm-pwa-production-"));
  const appRoot = fileURLToPath(new URL("..", import.meta.url));
  try {
    const entries = [{ input: join(appRoot, "src", "window-entry.ts"), output: "window.js" }];
    await emitProductArtifacts(entries, output, appRoot, "qualification-surface-test");
    const artifact = await readFile(join(output, "window.js"), "utf8");
    assert.doesNotMatch(artifact, /__loomrealmPwaQualification/);
    assert.doesNotMatch(artifact, /qualification-window-entry/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
