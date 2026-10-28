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
    "SessionEventError",
    "cancelled",
    "completed",
    "defineSubsystem",
    "failed",
    "isSessionEventFailure",
  ]);
  assert.deepEqual(Object.keys(host).sort(), [
    "SubsystemRuntimeFatalError",
    "createBoundContentClient",
    "createSameOriginContentClient",
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
  for (const name of ["ContentReadOptions", "ContentRecord", "ContentGroup", "ContentResource", "ContentReadErrorCode", "ContentReadError", "ContentClient"]) {
    assert.match(index, new RegExp(`\\b${name}\\b`));
  }
  assert.match(content, /record\(/);
  assert.match(content, /group\(/);
  assert.match(content, /resource\(/);
  for (const forbidden of ["manifest(", "head(", "fetch(", "installationId", "token", "URL"]) assert.equal(content.includes(forbidden), false);
  assert.match(model, /readonly content: ContentClient/);
  assert.match(model, /readonly viewport: Viewport/);
});

test("trusted host keeps the exact M8 protocol and port dependency direction", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), [
    "@loomrealm/data",
    "@loomrealm/platform-ports",
    "@loomrealm/runtime-control",
    "@loomrealm/session-events",
    "@loomrealm/shared-state",
    "@loomrealm/wire",
  ]);
  const declaration = await readFile(new URL("../dist/host/run-subsystem.d.ts", import.meta.url), "utf8");
  assert.match(declaration, /readonly data\?: SubsystemDataBinding/);
  assert.match(declaration, /readonly state: SharedStateRuntimeCapability/);
  assert.match(declaration, /readonly events: SessionEventsRuntimeCapability/);
  const model = await readFile(new URL("../dist/model.d.ts", import.meta.url), "utf8");
  assert.match(model, /readonly state: SharedStateClient/);
  assert.match(model, /readonly events: SessionEventClient/);
});

test("author declarations expose Runtime-scoped readonly Viewport", async () => {
  const index = await readFile(new URL("../dist/index.d.ts", import.meta.url), "utf8");
  const model = await readFile(new URL("../dist/model.d.ts", import.meta.url), "utf8");
  for (const name of ["Viewport", "ViewportSize", "ViewportListener"]) {
    assert.match(index, new RegExp(`\\b${name}\\b`));
  }
  assert.match(model, /readonly viewport: Viewport/);
});
