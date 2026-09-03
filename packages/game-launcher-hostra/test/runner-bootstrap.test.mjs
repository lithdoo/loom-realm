import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRunnerBootstrap } from "../dist/runner/bootstrap.js";

function encoded(overrides = {}) {
  return JSON.stringify({
    version: 1,
    subsystemKey: "root",
    physicalModule: process.platform === "win32" ? "C:/game/root.mjs" : "/game/root.mjs",
    controlEndpoint: `ws://127.0.0.1:12345/${"a".repeat(43)}`,
    bootstrapToken: "bootstrap-token",
    controlProtocolVersions: [1],
    helloDeadlineMs: 1,
    frameDeadlineMs: 1_000,
    terminalCleanupDeadlineMs: 1,
    ...overrides,
  });
}

test("Runner bootstrap validation is closed and deeply immutable", () => {
  const bootstrap = parseRunnerBootstrap(encoded());
  assert.ok(Object.isFrozen(bootstrap));
  assert.ok(Object.isFrozen(bootstrap.controlProtocolVersions));
  assert.throws(() => parseRunnerBootstrap(encoded({ extra: true })));
  assert.throws(() => parseRunnerBootstrap(encoded({ controlEndpoint: "ws://localhost:12345/x" })));
  assert.throws(() => parseRunnerBootstrap(encoded({ frameDeadlineMs: 999 })));
  assert.throws(() => parseRunnerBootstrap("x".repeat(16_385)));
});
