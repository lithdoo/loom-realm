import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryCarrierPair } from "../dist/testing/index.js";

const packageDirectory = fileURLToPath(new URL("..", import.meta.url));

test("either endpoint orderly-closes the whole duplex pair idempotently", async () => {
  for (const side of ["left", "right"]) {
    const pair = createMemoryCarrierPair();
    const firstClose = pair[side].close();

    assert.ok(firstClose instanceof Promise);
    await Promise.all([firstClose, pair.left.close(), pair.right.close()]);

    const leftTerminal = await pair.left.closed;
    const rightTerminal = await pair.right.closed;
    assert.deepEqual(leftTerminal, { kind: "closed" });
    assert.strictEqual(leftTerminal, rightTerminal);
  }
});

test("loss terminates both endpoints and preserves cause identity", async () => {
  const pair = createMemoryCarrierPair();
  const cause = new Error("injected loss");

  pair.lose(cause);

  const leftTerminal = await pair.left.closed;
  const rightTerminal = await pair.right.closed;
  assert.deepEqual(leftTerminal, { kind: "lost", cause });
  assert.strictEqual(leftTerminal, rightTerminal);
  assert.strictEqual(leftTerminal.cause, cause);
});

test("first terminal fact wins across close and loss", async () => {
  const orderly = createMemoryCarrierPair();
  await orderly.left.close();
  orderly.lose(new Error("too late"));
  assert.deepEqual(await orderly.right.closed, { kind: "closed" });

  const lost = createMemoryCarrierPair();
  const cause = new Error("first");
  lost.lose(cause);
  lost.lose(new Error("second"));
  await lost.left.close();
  assert.deepEqual(await lost.left.closed, { kind: "lost", cause });
});

test("package root does not expose testing implementation", async () => {
  const root = await import("../dist/index.js");
  const testing = await import("../dist/testing/index.js");

  assert.equal("createMemoryCarrierPair" in root, false);
  assert.equal(typeof testing.createMemoryCarrierPair, "function");
});

test("package has zero runtime dependencies and platform-neutral source", async () => {
  const manifest = JSON.parse(
    await readFile(join(packageDirectory, "package.json"), "utf8"),
  );
  assert.deepEqual(manifest.dependencies ?? {}, {});

  const sourceRoot = join(packageDirectory, "src");
  const pending = [sourceRoot];
  const files = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.name.endsWith(".ts")) files.push(path);
    }
  }

  const source = (await Promise.all(files.map((path) => readFile(path, "utf8")))).join("\n");
  assert.doesNotMatch(source, /from\s+["']node:/);
  assert.doesNotMatch(source, /\b(WebSocket|MessagePort|Worker)\b/);
  assert.doesNotMatch(source, /\b(setTimeout|setInterval|Math\.random)\b/);
  assert.doesNotMatch(source, /\bJSON\.(parse|stringify)\b/);
});
