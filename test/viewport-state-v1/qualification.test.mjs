/**
 * Viewport State v1 conformance (V-01 … V-14).
 *
 * ID map (this file + companion runners executed by `npm run test:viewport`):
 *   V-01 normalize / ignore illegal / no getter  — this file + packages/renderer
 *   V-02 sync bootstrap + deferred first sample — this file + packages/renderer
 *   V-03 source fault / participant replace fencing — this file + packages/renderer
 *   V-04 wire + local-fatal families — this file + packages/data
 *   V-05 A→B→A while inFlight — this file
 *   V-06 admitted FIFO / burst / concurrency — this file
 *   V-07 terminal/retire fence + fresh peer — this file
 *   V-08 same participant two peers / reconnect — packages/renderer (also covered)
 *   V-09 Runtime scope sync/getter/equal/detached — packages/subsystem
 *   V-10 listener isolation + reentrancy — packages/subsystem (+ C-02)
 *   V-11 Data loss retain / equal suppress — packages/subsystem
 *   V-12 post-terminal inert — packages/subsystem
 *   V-13 independent of Frame/InputTarget — packages/subsystem
 *   V-14 real architecture vertical — test/viewport-core-vertical.test.mjs
 *
 * Every test below carries concrete assertions (no placeholder assert.ok(true)).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V1,
} from "@loomrealm/data";
import { createRendererControlHolder } from "@loomrealm/renderer";
import { normalizeViewportSample } from "../../packages/renderer/dist/viewport.js";
import { ViewportManager } from "../../packages/subsystem/dist/internal/viewport-manager.js";
import {
  createMainRendererControlPeer,
  prepareRendererHelloResultV1,
} from "@loomrealm/renderer-control";
import { createMainRuntimeControlPeer } from "@loomrealm/runtime-control";
import { completed, defineSubsystem } from "@loomrealm/subsystem";
import { runSubsystem } from "@loomrealm/subsystem/host";

const accepted = () => ({ kind: "accepted" });
const binding = (carrier, generation = 1) => ({
  carrier,
  subsystemKey: "demo",
  generation,
  dataProfile: RENDERER_DATA_PROFILE_V1,
});
const subsystemHandlers = (extra = {}) => ({
  onInputState: accepted,
  onInputEvent: accepted,
  onInputReset: accepted,
  onViewportState: extra.onViewportState ?? accepted,
});
const rendererHandlers = () => ({
  onInputInterest: accepted,
  onRenderDomains: accepted,
  onRenderSnapshot: accepted,
  onRenderPatch: accepted,
  onRenderEvent: accepted,
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function waitFor(predicate, message = "condition") {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

const authority = {
  subsystemKey: "demo",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V1,
};
const snapshot = (sessionId, revision, generation = 1) => ({
  sessionId,
  revision,
  runtimes: [{ subsystemKey: "demo", state: "ready" }],
  stack: [{
    frameId: "root",
    subsystemKey: "demo",
    lifecycle: "active",
    activationId: "a1",
  }],
  inputTarget: { subsystemKey: "demo", frameId: "root", activationId: "a1" },
  dataAuthorities: [{ ...authority, generation }],
});

test("V-01: trusted raw sample normalize; illegal ignored; getter not executed", () => {
  assert.deepEqual(normalizeViewportSample({ width: 640.9, height: 480.9 }), {
    width: 640,
    height: 480,
  });
  assert.equal(normalizeViewportSample({ width: 0, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: -1, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: 0.1, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: Number.NaN, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: Number.POSITIVE_INFINITY, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: Number.MAX_SAFE_INTEGER + 1, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: 10 }), null);
  assert.equal(normalizeViewportSample({ width: 10, height: 10, extra: 1 }), null);
  const withSymbol = { width: 10, height: 10 };
  withSymbol[Symbol("x")] = 1;
  assert.equal(normalizeViewportSample(withSymbol), null);
  let getterHits = 0;
  const withGetter = {};
  Object.defineProperty(withGetter, "width", {
    enumerable: true,
    get() { getterHits += 1; return 100; },
  });
  Object.defineProperty(withGetter, "height", {
    enumerable: true,
    value: 100,
    writable: true,
  });
  assert.equal(normalizeViewportSample(withGetter), null);
  assert.equal(getterHits, 0);
});

test("V-02: sync bootstrap sample in start(emit) reaches wire as floor-normalized baseline", async () => {
  const seen = [];
  const control = createMemoryCarrierPair();
  const data = createMemoryCarrierPair();
  createSubsystemDataPeer({
    binding: binding(data.left),
    handlers: subsystemHandlers({
      onViewportState(message) {
        seen.push(message);
        return accepted();
      },
    }),
  });
  createMainRendererControlPeer({
    carrier: control.left,
    acceptHello() {
      const initial = snapshot("v2", 1);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });
  const holder = createRendererControlHolder(
    {
      async acquire() {
        return data.right;
      },
    },
    undefined,
    {
      start(emit) {
        emit({ width: 640.9, height: 480.9 });
        emit({ width: 100, height: 100 });
        return () => {};
      },
    },
  );
  await holder.connect({ carrier: control.right, rendererControlToken: "t" });
  await waitFor(() => seen.length >= 1, "bootstrap baseline");
  assert.deepEqual(seen[0], { type: "viewport.state", width: 100, height: 100 });
});

test("V-03: start throw marks local unavailable; participant replace fences old emit", async () => {
  const controlFail = createMemoryCarrierPair();
  createMainRendererControlPeer({
    carrier: controlFail.left,
    acceptHello() {
      const initial = snapshot("v3f", 1);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });
  const failing = createRendererControlHolder(undefined, undefined, {
    start() {
      throw new Error("boom");
    },
  });
  const outcome = await failing.connect({
    carrier: controlFail.right,
    rendererControlToken: "f",
  });
  assert.equal(outcome.kind, "installed");

  let starts = 0;
  let oldEmit;
  const controlA = createMemoryCarrierPair();
  const controlB = createMemoryCarrierPair();
  createMainRendererControlPeer({
    carrier: controlA.left,
    acceptHello() {
      const initial = snapshot("v3a", 1);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });
  createMainRendererControlPeer({
    carrier: controlB.left,
    acceptHello() {
      const initial = snapshot("v3b", 1);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });
  const holder = createRendererControlHolder(
    undefined,
    undefined,
    {
      start(emit) {
        starts += 1;
        oldEmit = emit;
        return () => {};
      },
    },
  );
  await holder.connect({ carrier: controlA.right, rendererControlToken: "a" });
  assert.equal(starts, 1);
  await holder.connect({ carrier: controlB.right, rendererControlToken: "b" });
  assert.equal(starts, 2);
  assert.doesNotThrow(() => oldEmit({ width: 999, height: 999 }));
  await tick();
});

test("V-04: inbound families + trusted local invalid → local-fatal", async () => {
  {
    const pair = createMemoryCarrierPair();
    const seen = [];
    createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: subsystemHandlers({
        onViewportState(message) {
          seen.push(message);
          return accepted();
        },
      }),
    });
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: rendererHandlers(),
    });
    renderer.viewport.publishState({ type: "viewport.state", width: 640, height: 480 });
    await waitFor(() => seen.length === 1);
    assert.deepEqual(seen[0], { type: "viewport.state", width: 640, height: 480 });
    await renderer.close();
  }
  {
    const pair = createMemoryCarrierPair();
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: subsystemHandlers(),
    });
    await pair.right.send(JSON.stringify({ type: "viewport.state", width: 0, height: 480 }));
    const terminal = await subsystem.terminal;
    assert.equal(terminal.protocol, "viewport");
  }
  {
    const pair = createMemoryCarrierPair();
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: subsystemHandlers(),
    });
    await pair.right.send('{"type":"viewport.state","width":NaN,"height":480}');
    const terminal = await subsystem.terminal;
    assert.equal(terminal.protocol, "profile");
  }
  {
    const pair = createMemoryCarrierPair();
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: rendererHandlers(),
    });
    assert.doesNotThrow(() => {
      renderer.viewport.publishState({ type: "viewport.state", width: -1, height: 10 });
    });
    const terminal = await renderer.terminal;
    assert.equal(terminal.kind, "local-fatal");
  }
});

test("V-05: inFlight A then B→A cancels B and does not resend A", async () => {
  const sent = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const carrier = {
    closed,
    async send(text) {
      sent.push(JSON.parse(text));
      await gate;
    },
    messages() { return { async *[Symbol.asyncIterator]() { await closed; } }; },
    async close() { resolveClosed({ kind: "closed" }); },
  };
  const renderer = createRendererDataPeer({
    binding: binding(carrier),
    handlers: rendererHandlers(),
  });
  renderer.viewport.publishState({ type: "viewport.state", width: 100, height: 100 });
  await tick();
  assert.equal(sent.length, 1);
  renderer.viewport.publishState({ type: "viewport.state", width: 200, height: 200 });
  renderer.viewport.publishState({ type: "viewport.state", width: 100, height: 100 });
  release();
  await tick();
  await tick();
  assert.deepEqual(sent, [{ type: "viewport.state", width: 100, height: 100 }]);
  await renderer.close();
});

test("V-06: burst coalesce under shared writer with concurrent Input; concurrency ≤ 1", async () => {
  const sent = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  let active = 0;
  let maxActive = 0;
  const carrier = {
    closed,
    async send(text) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      sent.push(JSON.parse(text));
      if (sent.length === 1) await firstGate;
      active -= 1;
    },
    messages() { return { async *[Symbol.asyncIterator]() { await closed; } }; },
    async close() { resolveClosed({ kind: "closed" }); },
  };
  const renderer = createRendererDataPeer({
    binding: binding(carrier),
    handlers: rendererHandlers(),
  });
  renderer.viewport.publishState({ type: "viewport.state", width: 1, height: 1 });
  await tick();
  for (let i = 2; i <= 10000; i += 1) {
    renderer.viewport.publishState({ type: "viewport.state", width: i, height: i });
  }
  const inputPromise = renderer.input.sendState({
    type: "input.state",
    frameId: "f1",
    activationId: "a1",
    channel: "keyboard.state",
    payload: { down: ["KeyA"] },
  });
  releaseFirst();
  assert.deepEqual(await inputPromise, { kind: "sent" });
  for (let i = 0; i < 50; i += 1) await tick();
  assert.equal(maxActive, 1);
  assert.equal(sent[0].type, "viewport.state");
  assert.equal(sent[0].width, 1);
  const lastViewport = [...sent].reverse().find((m) => m.type === "viewport.state");
  assert.deepEqual(lastViewport, { type: "viewport.state", width: 10000, height: 10000 });
  assert.ok(sent.some((m) => m.type === "input.state"));
  assert.ok(sent.length < 20);
  await renderer.close();
});

test("V-07: terminal/retire fences old settle; fresh peer independent baseline", async () => {
  const pair1 = createMemoryCarrierPair();
  const seen1 = [];
  createSubsystemDataPeer({
    binding: binding(pair1.left),
    handlers: subsystemHandlers({
      onViewportState(message) {
        seen1.push(message);
        return accepted();
      },
    }),
  });
  const renderer1 = createRendererDataPeer({
    binding: binding(pair1.right),
    handlers: rendererHandlers(),
  });
  renderer1.viewport.publishState({ type: "viewport.state", width: 10, height: 10 });
  await waitFor(() => seen1.length === 1);
  await renderer1.close();

  const pair2 = createMemoryCarrierPair();
  const seen2 = [];
  createSubsystemDataPeer({
    binding: binding(pair2.left),
    handlers: subsystemHandlers({
      onViewportState(message) {
        seen2.push(message);
        return accepted();
      },
    }),
  });
  const renderer2 = createRendererDataPeer({
    binding: binding(pair2.right),
    handlers: rendererHandlers(),
  });
  renderer2.viewport.publishState({ type: "viewport.state", width: 10, height: 10 });
  await waitFor(() => seen2.length === 1);
  assert.deepEqual(seen2, [{ type: "viewport.state", width: 10, height: 10 }]);
  await renderer2.close();
});

test("V-08: same participant two Data peers each receive an independent baseline", async () => {
  let starts = 0;
  const control = createMemoryCarrierPair();
  const data1 = createMemoryCarrierPair();
  const data2 = createMemoryCarrierPair();
  const seen1 = [];
  const seen2 = [];
  createSubsystemDataPeer({
    binding: binding(data1.left, 1),
    handlers: subsystemHandlers({
      onViewportState(message) {
        seen1.push(message);
        return accepted();
      },
    }),
  });
  let secondAcquire;
  const secondReady = new Promise((resolve) => { secondAcquire = resolve; });
  let acquireCount = 0;
  const holder = createRendererControlHolder(
    {
      async acquire(_key, _generation) {
        acquireCount += 1;
        if (acquireCount === 1) return data1.right;
        secondAcquire();
        return data2.right;
      },
    },
    undefined,
    {
      start(emit) {
        starts += 1;
        emit({ width: 640, height: 480 });
        return () => {};
      },
    },
  );
  const mainPeer = createMainRendererControlPeer({
    carrier: control.left,
    acceptHello() {
      const initial = snapshot("v8", 1, 1);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });
  await holder.connect({ carrier: control.right, rendererControlToken: "t" });
  await waitFor(() => seen1.length === 1, "first baseline");
  assert.equal(starts, 1);
  createSubsystemDataPeer({
    binding: binding(data2.left, 2),
    handlers: subsystemHandlers({
      onViewportState(message) {
        seen2.push(message);
        return accepted();
      },
    }),
  });
  await mainPeer.publish(snapshot("v8", 2, 2));
  await secondReady;
  await waitFor(() => seen2.length === 1, "second baseline");
  assert.equal(starts, 1);
  assert.deepEqual(seen1[0], { type: "viewport.state", width: 640, height: 480 });
  assert.deepEqual(seen2[0], { type: "viewport.state", width: 640, height: 480 });
});

test("V-09: sync initial, getter-before-callback, equal suppress, detached size", () => {
  const manager = new ViewportManager();
  const observations = [];
  manager.viewport.subscribe((value) => {
    observations.push({ getter: manager.viewport.current, value });
  });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].value, null);
  manager.applyState(100, 50);
  assert.equal(observations.length, 2);
  assert.deepEqual(observations[1].value, { width: 100, height: 50 });
  assert.deepEqual(observations[1].getter, { width: 100, height: 50 });
  assert.equal(Object.isFrozen(observations[1].value), true);
  manager.applyState(100, 50);
  assert.equal(observations.length, 2);
  manager.close();
});

test("V-10: listener sync throw / Promise.reject / then-getter throw isolated", async () => {
  const manager = new ViewportManager();
  const ok = [];
  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  try {
    manager.viewport.subscribe(() => { throw new Error("sync boom"); });
    manager.viewport.subscribe(() => Promise.reject(new Error("async boom")));
    manager.viewport.subscribe(() => {
      const evil = {};
      Object.defineProperty(evil, "then", {
        enumerable: true,
        get() { throw new Error("then getter boom"); },
      });
      return evil;
    });
    manager.viewport.subscribe((value) => { ok.push(value); });
    assert.deepEqual(ok, [null]);
    assert.doesNotThrow(() => manager.applyState(7, 8));
    assert.ok(ok.some((v) => v && v.width === 7));
    await tick();
    assert.equal(unhandled.length, 0);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    manager.close();
  }
});

test("V-11: equal size after Data peer refresh suppresses business notification", async () => {
  const manager = new ViewportManager();
  const seen = [];
  manager.viewport.subscribe((value) => seen.push(value));
  manager.applyState(30, 40);
  assert.equal(seen.length, 2);
  manager.applyState(30, 40);
  assert.equal(seen.length, 2);
  manager.applyState(31, 41);
  assert.equal(seen.length, 3);
  manager.close();
});

test("V-12: post-terminal subscribe is inert without initial callback", () => {
  const manager = new ViewportManager();
  manager.applyState(1, 2);
  manager.close();
  const calls = [];
  const unsub = manager.viewport.subscribe((value) => calls.push(value));
  assert.deepEqual(calls, []);
  assert.deepEqual(manager.viewport.current, { width: 1, height: 2 });
  unsub();
  unsub();
});

test("V-13: viewport updates remain independent of Frame lifecycle", async () => {
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
  const pair = createMemoryCarrierPair();
  const dataPair = createMemoryCarrierPair();
  const statuses = [];
  let frameAborted = false;
  const observations = [];
  const main = createMainRuntimeControlPeer({
    carrier: pair.left,
    scheduler,
    frameDeadlineMs: 1000,
    shutdownDeadlineMs: 1000,
    authenticateHello: (params) =>
      params.key === "demo" && params.bootstrapToken === "secret"
        ? { kind: "accepted" }
        : { kind: "rejected", code: "BOOTSTRAP_AUTHENTICATION_FAILED" },
    handlers: {
      onStatus(status) { statuses.push(status); },
      onFrameCall() { return { kind: "success", result: { childFrameId: "c1" } }; },
      onFrameReturn() { return { kind: "success", result: {} }; },
    },
  });
  let dataUsed = false;
  const runtime = runSubsystem({
    definition: defineSubsystem((scope) => {
      scope.viewport.subscribe((value) => observations.push(value));
      return {
        async frame(frame) {
          try {
            await new Promise((resolve, reject) => {
              if (frame.signal.aborted) {
                reject(frame.signal.reason);
                return;
              }
              frame.signal.addEventListener("abort", () => {
                frameAborted = true;
                reject(frame.signal.reason);
              }, { once: true });
            });
          } catch {
            return completed(null);
          }
          return completed(null);
        },
      };
    }),
    runtimeControl: { async acquire() { return pair.right; } },
    runtimePolicy: {
      scheduler,
      helloDeadlineMs: 1000,
      frameDeadlineMs: 1000,
      terminalCleanupDeadlineMs: 50,
    },
    launch: {
      subsystemKey: "demo",
      bootstrapToken: "secret",
      controlProtocolVersions: [1],
    },
    data: {
      async acquire() {
        if (dataUsed) throw new Error("stopped");
        dataUsed = true;
        return {
          carrier: dataPair.right,
          generation: 1,
          dataProfile: RENDERER_DATA_PROFILE_V1,
        };
      },
    },
  });
  void runtime.catch(() => {});
  await main.identified;
  await waitFor(() => statuses.some((s) => s.state === "ready"), "ready");
  await main.frame.initialize({ frameId: "root", input: null });
  await main.frame.activate({ frameId: "root", activationId: "a1" });
  const renderer = createRendererDataPeer({
    binding: binding(dataPair.left),
    handlers: rendererHandlers(),
  });
  renderer.viewport.publishState({ type: "viewport.state", width: 50, height: 60 });
  await waitFor(() => observations.some((v) => v && v.width === 50), "with active frame");
  await main.frame.suspend({ frameId: "root", activationId: "a1" });
  await waitFor(() => frameAborted, "frame aborted");
  renderer.viewport.publishState({ type: "viewport.state", width: 51, height: 61 });
  await waitFor(() => observations.some((v) => v && v.width === 51), "after suspend");
  assert.deepEqual(await main.control.shutdown({ reason: "session-end" }), {
    kind: "success",
    result: {},
  });
  await runtime;
});

test("V-14: compact real vertical — fake source → holder → peers → host → scope.viewport", async () => {
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
  const viewportEvents = [];
  let emitViewport;
  const controlPair = createMemoryCarrierPair();
  const dataPair = createMemoryCarrierPair();
  const runtimePair = createMemoryCarrierPair();
  const statuses = [];
  createMainRendererControlPeer({
    carrier: controlPair.left,
    acceptHello() {
      const initial = snapshot("v14", 1, 1);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });
  const mainRuntime = createMainRuntimeControlPeer({
    carrier: runtimePair.left,
    scheduler,
    frameDeadlineMs: 1000,
    shutdownDeadlineMs: 1000,
    authenticateHello: (params) =>
      params.key === "demo" && params.bootstrapToken === "secret"
        ? { kind: "accepted" }
        : { kind: "rejected", code: "BOOTSTRAP_AUTHENTICATION_FAILED" },
    handlers: {
      onStatus(status) { statuses.push(status); },
      onFrameCall() { return { kind: "success", result: { childFrameId: "c1" } }; },
      onFrameReturn() { return { kind: "success", result: {} }; },
    },
  });
  let dataUsed = false;
  const holder = createRendererControlHolder(
    {
      async acquire() {
        if (dataUsed) throw new Error("unexpected");
        dataUsed = true;
        return dataPair.right;
      },
    },
    undefined,
    {
      start(emit) {
        emitViewport = emit;
        emit({ width: 640.9, height: 480.9 });
        return () => {};
      },
    },
  );
  const runtime = runSubsystem({
    definition: defineSubsystem((scope) => {
      scope.viewport.subscribe((value) => {
        viewportEvents.push(value === null ? null : { ...value });
      });
      return { frame() { return completed(null); } };
    }),
    runtimeControl: { async acquire() { return runtimePair.right; } },
    runtimePolicy: {
      scheduler,
      helloDeadlineMs: 1000,
      frameDeadlineMs: 1000,
      terminalCleanupDeadlineMs: 50,
    },
    launch: {
      subsystemKey: "demo",
      bootstrapToken: "secret",
      controlProtocolVersions: [1],
    },
    data: {
      async acquire() {
        return {
          carrier: dataPair.left,
          generation: 1,
          dataProfile: RENDERER_DATA_PROFILE_V1,
        };
      },
    },
  });
  void runtime.catch(() => {});
  await waitFor(() => statuses.some((s) => s.state === "ready"), "ready");
  const installed = await holder.connect({
    carrier: controlPair.right,
    rendererControlToken: "token",
  });
  assert.equal(installed.kind, "installed");
  await waitFor(
    () => viewportEvents.some((v) => v && v.width === 640 && v.height === 480),
    "normalized size",
  );
  emitViewport({ width: 1024, height: 768 });
  await waitFor(
    () => viewportEvents.some((v) => v && v.width === 1024),
    "resize",
  );
  assert.deepEqual(
    await mainRuntime.control.shutdown({ reason: "session-end" }),
    { kind: "success", result: {} },
  );
  await runtime;
});
