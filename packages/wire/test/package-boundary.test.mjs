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
    "JsonTextSyntaxError",
    "WireValidationError",
    "assertBoolean",
    "assertExactKeys",
    "assertFiniteNumber",
    "assertJsonArray",
    "assertJsonObject",
    "assertJsonValue",
    "assertSafeInteger",
    "assertString",
    "decodeJsonRpcMessage",
    "isJsonArray",
    "isJsonObject",
    "isJsonValue",
    "jsonDepth",
    "parseJsonText",
    "stringifyJson",
    "utf8ByteLength",
  ]);
});

test("package has zero runtime dependencies and only a root export", async () => {
  const manifest = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.deepEqual(Object.keys(manifest.exports), ["."]);
});

test("source has no Foundation, Node, platform, carrier, or domain imports", async () => {
  const files = await sourceFiles(join(packageDirectory, "src"));
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");

  assert.doesNotMatch(source, /from\s+["']node:/);
  assert.doesNotMatch(source, /from\s+["']@loomrealm\/foundation/);
  assert.doesNotMatch(source, /\b(WebSocket|MessagePort|Worker|MessageCarrier)\b/);
  assert.doesNotMatch(source, /\b(Runtime|Subsystem|Frame|Activation|DataAuthority)\b/);
});
