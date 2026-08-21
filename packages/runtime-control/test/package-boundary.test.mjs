import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("..", import.meta.url));

test("root has exactly the frozen runtime exports", async () => {
  assert.deepEqual(Object.keys(await import("../dist/index.js")).sort(), [
    "connectSubsystemRuntimeControl",
    "createMainRuntimeControlPeer",
  ]);
});
test("manifest keeps the frozen dependency and export boundary", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(manifest.dependencies, {
    "@loomrealm/foundation": "0.1.0-alpha.0",
    "@loomrealm/wire": "0.1.0-alpha.0",
  });
  assert.deepEqual(Object.keys(manifest.exports), ["."]);
  assert.equal(manifest.sideEffects, false);
  assert.equal(manifest.engines.node, ">=20");
});
test("declarations expose exactly the frozen named surface", async () => {
  const source = await readFile(
    new URL("../dist/index.d.ts", import.meta.url),
    "utf8",
  );
  const names = [...source.matchAll(/\b(?:export|export type)\s*\{([^}]+)\}/gs)]
    .flatMap((match) =>
      match[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    )
    .sort();
  const expected = [
    "createMainRuntimeControlPeer",
    "connectSubsystemRuntimeControl",
    "SubsystemHelloParamsV1",
    "SubsystemHelloResultV1",
    "SubsystemRuntimeErrorV1",
    "SubsystemRuntimeStatusV1",
    "SubsystemShutdownReasonV1",
    "SubsystemShutdownParamsV1",
    "SubsystemShutdownResultV1",
    "FrameFailure",
    "FrameOutcome",
    "FrameInitializeParams",
    "FrameInitializeResult",
    "FrameActivateParams",
    "FrameActivateResult",
    "FrameSuspendParams",
    "FrameSuspendResult",
    "FrameResumeParams",
    "FrameResumeResult",
    "FrameCloseParams",
    "FrameCloseResult",
    "FrameCallParams",
    "FrameCallResult",
    "FrameReturnParams",
    "FrameReturnResult",
    "SubsystemHelloErrorDataV1",
    "RuntimeControlProtocolStateErrorDataV1",
    "FrameRpcErrorData",
    "FrameRecoverableRpcErrorData",
    "FrameFatalRpcErrorData",
    "RuntimeControlRequestMethod",
    "RuntimeControlScheduler",
    "RuntimeControlHandlerReply",
    "RuntimeControlSemanticErrorClassification",
    "RuntimeControlRequestOutcome",
    "RuntimeControlNotificationOutcome",
    "RuntimeControlTerminal",
    "MainHelloAuthenticationDecisionV1",
    "MainRuntimeControlIdentificationOutcome",
    "MainRuntimeControlHandlers",
    "MainRuntimeControlPeerOptions",
    "MainSubsystemControlPeer",
    "MainFrameControlPeer",
    "MainRuntimeControlPeer",
    "SubsystemRuntimeControlHandlers",
    "SubsystemRuntimeControlConnectOptions",
    "SubsystemControlPeer",
    "SubsystemFrameControlPeer",
    "SubsystemRuntimeControlPeer",
    "SubsystemRuntimeControlConnectOutcome",
  ].sort();
  assert.deepEqual(names, expected);
});
test("source remains transport- and platform-neutral", async () => {
  const files = (await readdir(join(packageDirectory, "src"))).filter((name) =>
    name.endsWith(".ts"),
  );
  const source = (
    await Promise.all(
      files.map((name) =>
        readFile(join(packageDirectory, "src", name), "utf8"),
      ),
    )
  ).join("\n");
  assert.doesNotMatch(source, /from\s+["']node:/);
  assert.doesNotMatch(source, /\b(WebSocket|MessagePort|Worker|fetch)\b/);
  assert.doesNotMatch(source, /@loomrealm\/(main|subsystem|game-launcher)/);
});
