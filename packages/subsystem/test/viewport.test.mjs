import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createRendererDataPeer } from "@loomrealm/data";
import { createMainRuntimeControlPeer } from "@loomrealm/runtime-control";
import { ViewportManager } from "../dist/internal/viewport-manager.js";
import { completed, defineSubsystem } from "../dist/index.js";
import { runSubsystem } from "../dist/host/index.js";

const state = (width, height) => ({ type: "viewport.state", width, height });

test("viewport retained API: initial null, sync first delivery, getter before callback", () => {
  const manager = new ViewportManager();
  const viewport = manager.viewport;
  assert.equal(viewport.current, null);
  const seen = [];
  viewport.subscribe((value) => {
    // Getter must already reflect the delivered value inside the callback.
    seen.push([value, viewport.current === value]);
  });
  assert.deepEqual(seen, [[null, true]]);
  manager.onState(state(640, 480));
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1], [{ width: 640, height: 480 }, true]);
  assert.deepEqual(viewport.current, { width: 640, height: 480 });
});

test("duplicate size does not notify again; changed size notifies exactly once", () => {
  const manager = new ViewportManager();
  let calls = 0;
  manager.viewport.subscribe(() => { calls += 1; });
  manager.onState(state(800, 600));
  manager.onState(state(800, 600));
  assert.equal(calls, 2); // initial null + one structural change
  manager.onState(state(1024, 768));
  assert.equal(calls, 3);
  manager.onState(state(1024, 768));
  assert.equal(calls, 3);
});

test("subscribe after accepted B delivers current B synchronously once", () => {
  const manager = new ViewportManager();
  manager.onState(state(800, 600));
  const seen = [];
  manager.viewport.subscribe((value) => seen.push(value));
  assert.deepEqual(seen, [{ width: 800, height: 600 }]);
});

test("delivered snapshots and current are detached and immutable", () => {
  const manager = new ViewportManager();
  let delivered;
  manager.viewport.subscribe((value) => { delivered = value; });
  manager.onState(state(320, 240));
  assert.equal(Object.isFrozen(delivered), true);
  assert.equal(Object.isFrozen(manager.viewport.current), true);
  const snapshot = manager.viewport.current;
  try {
    snapshot.width = 9999;
  } catch {
    // Frozen in strict mode; either way the value must not change.
  }
  assert.equal(manager.viewport.current.width, 320);
  manager.onState(state(640, 480));
  assert.equal(snapshot.width, 320);
  assert.equal(manager.viewport.current.width, 640);
});

test("listener synchronous throw is contained and does not block others", () => {
  const manager = new ViewportManager();
  const good = [];
  manager.viewport.subscribe(() => { throw new Error("listener throw"); });
  manager.viewport.subscribe((value) => good.push(value));
  manager.onState(state(10, 10));
  assert.deepEqual(good, [null, { width: 10, height: 10 }]);
  assert.deepEqual(manager.viewport.current, { width: 10, height: 10 });
});

test("listener returned rejected promise is contained without unhandled rejection", async () => {
  const manager = new ViewportManager();
  const seen = [];
  manager.viewport.subscribe(() => Promise.reject(new Error("rejecting listener")));
  manager.viewport.subscribe((value) => seen.push(value));
  manager.onState(state(12, 12));
  await new Promise((resolve) => setImmediate(resolve));
  manager.onState(state(14, 14));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, [null, { width: 12, height: 12 }, { width: 14, height: 14 }]);
});

test("unsubscribe is idempotent and stops delivery", () => {
  const manager = new ViewportManager();
  const seen = [];
  const unsubscribe = manager.viewport.subscribe((value) => seen.push(value));
  unsubscribe();
  unsubscribe();
  manager.onState(state(20, 20));
  assert.deepEqual(seen, [null]);
});

test("Runtime terminal stops delivery and post-terminal subscribe is inert", () => {
  const manager = new ViewportManager();
  const seen = [];
  manager.viewport.subscribe((value) => seen.push(value));
  manager.onState(state(30, 30));
  manager.close();
  manager.onState(state(40, 40));
  assert.deepEqual(seen, [null, { width: 30, height: 30 }]);
  let lateCalls = 0;
  const inert = manager.viewport.subscribe(() => { lateCalls += 1; });
  inert();
  inert();
  assert.equal(lateCalls, 0);
  // Historical value remains readable; it proves nothing about paintability.
  assert.deepEqual(manager.viewport.current, { width: 30, height: 30 });
});

test("same-size fresh baseline after carrier replacement does not re-notify", () => {
  const manager = new ViewportManager();
  const seen = [];
  manager.viewport.subscribe((value) => seen.push(value));
  manager.onState(state(640, 480));
  // Fresh carrier republishes the same current size: suppressed.
  manager.onState(state(640, 480));
  assert.deepEqual(seen, [null, { width: 640, height: 480 }]);
});

test("renderer participant replacement: retained observation stays readable until the new participant samples", () => {
  // Subsystem-side contract (Viewport v1 SS4): carrier/participant loss
  // never nulls the retained observation; a fresh Renderer's first legal
  // sample then updates it normally. The Renderer-side publisher is
  // responsible for not fabricating the new participant's baseline
  // (covered in packages/renderer/test/viewport.test.mjs).
  const manager = new ViewportManager();
  manager.onState(state(800, 600));
  assert.deepEqual(manager.viewport.current, { width: 800, height: 600 });
  // Renderer A retired; Renderer B connected but has not sampled yet:
  // no onState call happens; the historical value remains readable.
  assert.deepEqual(manager.viewport.current, { width: 800, height: 600 });
  // B's first legal sample arrives and updates exactly once.
  let calls = 0;
  manager.viewport.subscribe(() => { calls += 1; });
  manager.onState(state(1024, 768));
  assert.deepEqual(manager.viewport.current, { width: 1024, height: 768 });
  assert.equal(calls, 2); // initial 800x600 + the one structural change
});

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

test("host integration: viewport.state flows to scope.viewport through the current Data peer", async () => {
  const pair = createMemoryCarrierPair();
  const statuses = [];
  const main = createMainRuntimeControlPeer({
    carrier: pair.left,
    scheduler,
    frameDeadlineMs: 1000,
    shutdownDeadlineMs: 1000,
    authenticateHello: () => ({ kind: "accepted" }),
    handlers: {
      onStatus(status) { statuses.push(status); return { kind: "success", result: {} }; },
      onFrameCall: () => ({ kind: "success", result: { childFrameId: "child-1" } }),
      onFrameReturn: () => ({ kind: "success", result: {} }),
    },
  });
  void main;

  let rendererCarrier;
  let capturedScope;
  const definition = defineSubsystem((scope) => {
    capturedScope = scope;
    return {
      frame: () => completed({ ok: true }),
    };
  });

  const runtime = runSubsystem({
    definition,
    runtimeControl: { async acquire() { return pair.right; } },
    runtimePolicy: {
      scheduler,
      helloDeadlineMs: 1000,
      frameDeadlineMs: 1000,
      terminalCleanupDeadlineMs: 50,
    },
    launch: { subsystemKey: "demo", bootstrapToken: "secret", controlProtocolVersions: [1] },
    data: {
      async acquire() {
        const dataPair = createMemoryCarrierPair();
        rendererCarrier = dataPair.right;
        return { carrier: dataPair.left, generation: 1, dataProfile: "loomrealm.renderer-data/1" };
      },
    },
  });
  void runtime.catch(() => {});

  const accept = () => ({ kind: "accepted" });
  const events = [];
  let viewportReady;
  const viewportGate = new Promise((resolve) => { viewportReady = resolve; });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    if (rendererCarrier !== undefined) break;
  }
  const renderer = createRendererDataPeer({
    binding: {
      carrier: rendererCarrier,
      subsystemKey: "demo",
      generation: 1,
      dataProfile: "loomrealm.renderer-data/1",
    },
    handlers: {
      onInputInterest: accept,
      onRenderDomains: accept,
      onRenderSnapshot: accept,
      onRenderPatch: accept,
      onRenderEvent: accept,
    },
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    if (capturedScope !== undefined) break;
  }
  capturedScope.viewport.subscribe((value) => {
    events.push(value);
    viewportReady();
  });
  await renderer.viewport.sendState(state(640, 480));
  await viewportGate;
  assert.deepEqual(events, [null, { width: 640, height: 480 }]);
  assert.deepEqual(capturedScope.viewport.current, { width: 640, height: 480 });
  await renderer.close();
});
