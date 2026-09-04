import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as author from "../dist/index.js";
import * as host from "../dist/host/index.js";

test("author root and trusted host surface stay separated", () => {
  assert.deepEqual(Object.keys(author).sort(), [
    "FrameBusyError",
    "FrameCallRejectedError",
    "FrameClosedError",
    "FrameInactiveError",
    "cancelled",
    "completed",
    "defineSubsystem",
    "failed",
  ]);
  assert.deepEqual(Object.keys(host).sort(), [
    "SubsystemRuntimeFatalError",
    "runSubsystem",
  ]);

  assert.equal("runSubsystem" in author, false);
  assert.equal("connectSubsystemRuntimeControl" in author, false);
  assert.equal("RuntimeControlBinding" in author, false);
});

test("trusted host keeps the exact M8 protocol and port dependency direction", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), [
    "@loomrealm/data",
    "@loomrealm/platform-ports",
    "@loomrealm/runtime-control",
    "@loomrealm/wire",
  ]);
  const declaration = await readFile(new URL("../dist/host/run-subsystem.d.ts", import.meta.url), "utf8");
  assert.match(declaration, /readonly data\?: SubsystemDataBinding/);
});
