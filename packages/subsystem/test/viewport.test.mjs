import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createRendererDataPeer } from "@loomrealm/data";
import { createMainRuntimeControlPeer } from "@loomrealm/runtime-control";
import { completed, defineSubsystem } from "../dist/index.js";
import { runSubsystem } from "../dist/host/index.js";
import { ViewportManager } from "../dist/internal/viewport-manager.js";

const scheduler = {
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
    };
  },
};

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, message = "condition") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

test("ViewportManager delivers null first, updates getter before callback, and isolates listener failures", async () => {
  const manager = new ViewportManager();
  assert.equal(manager.current, null);
  const seen = [];
  const unsubscribe = manager.subscribe((value) => {
    seen.push({ value, current: manager.current });
    if (value?.width === 640) throw new Error("sync");
    if (value?.width === 800) return Promise.reject(new Error("async"));
  });
  assert.deepEqual(seen, [{ value: null, current: null }]);
  manager.accept({ type: "viewport.state", width: 640, height: 480 });
  assert.deepEqual(manager.current, { width: 640, height: 480 });
  assert.equal(seen.length, 2);
  assert.equal(seen[1].current.width, 640);
  manager.accept({ type: "viewport.state", width: 640, height: 480 });
  assert.equal(seen.length, 2);
  manager.accept({ type: "viewport.state", width: 800, height: 600 });
  await tick();
  assert.equal(seen.length, 3);
  const snapshot = manager.current;
  assert.throws(() => {
    snapshot.width = 1;
  });
  assert.deepEqual(manager.current, { width: 800, height: 600 });
  unsubscribe();
  unsubscribe();
  manager.accept({ type: "viewport.state", width: 1024, height: 768 });
  assert.equal(seen.length, 3);
  const late = [];
  const live = manager.subscribe((value) => late.push(value));
  assert.deepEqual(late, [{ width: 1024, height: 768 }]);
  manager.terminate();
  live();
  const after = [];
  const post = manager.subscribe((value) => after.push(value));
  post();
  post();
  assert.deepEqual(after, []);
});

test("ViewportManager ignores illegal internal samples without clearing retained current", () => {
  const manager = new ViewportManager();
  manager.accept({ type: "viewport.state", width: 640, height: 480 });
  assert.deepEqual(manager.current, { width: 640, height: 480 });
  manager.accept({ type: "viewport.state", width: 0, height: 480 });
  manager.accept({ type: "viewport.state", width: Number.NaN, height: 480 });
  manager.accept({ type: "viewport.state", width: -8, height: 480 });
  manager.accept({ type: "viewport.state" });
  assert.deepEqual(manager.current, { width: 640, height: 480 });
});

test("post-terminal subscribe is inert even if current still holds history", async () => {
  const manager = new ViewportManager();
  manager.accept({ type: "viewport.state", width: 320, height: 240 });
  manager.terminate();
  assert.deepEqual(manager.current, { width: 320, height: 240 });
  const calls = [];
  const stop = manager.subscribe((value) => calls.push(value));
  stop();
  assert.deepEqual(calls, []);
});

test("Runtime scope.viewport receives Data state and goes inert after shutdown", async () => {
  const pair = createMemoryCarrierPair();
  const statuses = [];
  const captured = {};
  const dataPair = createMemoryCarrierPair();
  const dataReady = [];
  const main = createMainRuntimeControlPeer({
    carrier: pair.left,
    scheduler,
    frameDeadlineMs: 1000,
    shutdownDeadlineMs: 1000,
    authenticateHello: () => ({ kind: "accepted" }),
    handlers: {
      onStatus(status) {
        statuses.push(status);
      },
      onFrameCall() {
        return { kind: "success", result: { childFrameId: "child-1" } };
      },
      onFrameReturn() {
        return { kind: "success", result: {} };
      },
    },
  });
  const runtime = runSubsystem({
    definition: defineSubsystem((scope) => {
      captured.viewport = scope.viewport;
      assert.equal(scope.viewport.current, null);
      return { frame: () => completed(null) };
    }),
    runtimeControl: {
      async acquire() {
        return pair.right;
      },
    },
    runtimePolicy: Object.freeze({
      scheduler,
      helloDeadlineMs: 1000,
      frameDeadlineMs: 1000,
      terminalCleanupDeadlineMs: 50,
    }),
    launch: {
      subsystemKey: "demo",
      bootstrapToken: "secret",
      controlProtocolVersions: [1],
    },
    data: {
      async acquire() {
        dataReady.push(true);
        return {
          carrier: dataPair.right,
          generation: 1,
          dataProfile: "loomrealm.renderer-data/1",
        };
      },
    },
  });
  void runtime.catch(() => {});
  await waitFor(() => statuses.some((status) => status.state === "ready"), "ready");
  await waitFor(() => dataReady.length === 1, "data acquire");
  const renderer = createRendererDataPeer({
    binding: {
      carrier: dataPair.left,
      subsystemKey: "demo",
      generation: 1,
      dataProfile: "loomrealm.renderer-data/1",
    },
    handlers: {
      onInputInterest: () => ({ kind: "accepted" }),
      onRenderDomains: () => ({ kind: "accepted" }),
      onRenderSnapshot: () => ({ kind: "accepted" }),
      onRenderPatch: () => ({ kind: "accepted" }),
      onRenderEvent: () => ({ kind: "accepted" }),
    },
  });
  const seen = [];
  captured.viewport.subscribe((value) => seen.push(value && { ...value }));
  await renderer.viewport.sendState({ type: "viewport.state", width: 640, height: 480 });
  await waitFor(() => seen.some((value) => value && value.width === 640), "viewport A");
  assert.deepEqual(captured.viewport.current, { width: 640, height: 480 });
  await main.control.shutdown({ reason: "session-end" });
  await runtime;
  const after = [];
  captured.viewport.subscribe((value) => after.push(value));
  assert.deepEqual(after, []);
  await renderer.close();
});
