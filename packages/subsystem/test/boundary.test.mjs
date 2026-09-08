import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as author from "../dist/index.js";
import * as host from "../dist/host/index.js";

test("author root and trusted host surface stay separated", () => {
  assert.deepEqual(Object.keys(author).sort(), [
    "ContentReadError",
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
    "createBoundContentClient",
    "runSubsystem",
  ]);

  assert.equal("runSubsystem" in author, false);
  assert.equal("connectSubsystemRuntimeControl" in author, false);
  assert.equal("RuntimeControlBinding" in author, false);
  assert.equal("createBoundContentClient" in author, false);
});

test("M12 author declarations expose only the frozen Content projection", async () => {
  const index = await readFile(new URL("../dist/index.d.ts", import.meta.url), "utf8");
  const content = await readFile(new URL("../dist/content.d.ts", import.meta.url), "utf8");
  const model = await readFile(new URL("../dist/model.d.ts", import.meta.url), "utf8");
  for (const name of ["ContentReadOptions", "ContentRecord", "ContentResource", "ContentReadErrorCode", "ContentReadError", "ContentClient"]) {
    assert.match(index, new RegExp(`\\b${name}\\b`));
  }
  assert.match(content, /record\(/);
  assert.match(content, /resource\(/);
  for (const forbidden of ["manifest(", "group(", "fetch(", "installationId", "token", "URL"]) assert.equal(content.includes(forbidden), false);
  assert.match(model, /readonly content: ContentClient/);
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

test("M10 author declarations expose the exact minimal Input surface", async () => {
  const index = await readFile(new URL("../dist/index.d.ts", import.meta.url), "utf8");
  const input = await readFile(new URL("../dist/input.d.ts", import.meta.url), "utf8");
  const model = await readFile(new URL("../dist/model.d.ts", import.meta.url), "utf8");
  for (const name of [
    "InputStateChannel", "InputEventChannel", "InputChannel",
    "KeyboardStateInput", "KeyboardEventInput",
    "PointerStateInput", "PointerEventInput",
    "GamepadStateInput", "GamepadEventInput",
    "InputPayload", "InputHandler", "Unsubscribe",
    "CreateInputListenerOptions", "InputListener",
  ]) assert.match(index, new RegExp(`\\b${name}\\b`));
  for (const supporting of [
    "KeyboardCode", "PointerSample", "PointerButton", "PointerKind",
    "GamepadSample", "GamepadAxes", "GamepadButtons", "GamepadButton",
    "CustomInputObject",
  ]) assert.doesNotMatch(index, new RegExp(`\\b${supporting}\\b`));
  assert.match(input, /type KeyboardStateInput = KeyboardStatePayloadV1/);
  assert.match(input, /type InputPayload<C extends InputChannel>/);
  assert.match(model, /createInputListener\(options: CreateInputListenerOptions\): InputListener/);
});
