/**
 * V-14 / P3-09: real architecture vertical
 * fake viewport source → real RendererControlHolder → real RendererDataPeer
 * → real MessageCarrier → real SubsystemDataPeer → real Subsystem host → scope.viewport
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createMainRendererControlPeer,
  prepareRendererHelloResultV1,
} from "@loomrealm/renderer-control";
import { createMainRuntimeControlPeer } from "@loomrealm/runtime-control";
import { createRendererControlHolder } from "@loomrealm/renderer";
import {
  completed,
  defineSubsystem,
} from "@loomrealm/subsystem";
import { runSubsystem } from "@loomrealm/subsystem/host";

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

async function tick() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

function controlSnapshot(sessionId, revision, generation = 1) {
  return {
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
    dataAuthorities: [{
      subsystemKey: "demo",
      generation,
      dataProfile: "loomrealm.renderer-data/1",
    }],
  };
}

test("V-14/P3-09 real vertical: source→holder→peers→host→scope.viewport", async () => {
  const viewportEvents = [];
  let emitViewport;
  let stopCount = 0;
  const fakeSource = {
    start(emit) {
      emitViewport = emit;
      emit({ width: 640.9, height: 480.9 });
      return () => { stopCount += 1; };
    },
  };

  const controlPair = createMemoryCarrierPair();
  const dataPair = createMemoryCarrierPair();
  const runtimePair = createMemoryCarrierPair();
  const statuses = [];

  createMainRendererControlPeer({
    carrier: controlPair.left,
    acceptHello() {
      const initial = controlSnapshot("vert", 1, 1);
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

  let dataAcquire = 0;
  const holder = createRendererControlHolder(
    {
      async acquire() {
        dataAcquire += 1;
        if (dataAcquire === 1) return dataPair.right;
        throw new Error("unexpected acquire");
      },
    },
    undefined,
    fakeSource,
  );

  let dataUsed = false;
  const runtime = runSubsystem({
    definition: defineSubsystem((scope) => {
      assert.equal(scope.viewport.current, null);
      scope.viewport.subscribe((value) => {
        viewportEvents.push(value === null ? null : { ...value });
      });
      return {
        frame() {
          return completed({ w: scope.viewport.current?.width ?? null });
        },
      };
    }),
    runtimeControl: {
      async acquire() {
        return runtimePair.right;
      },
    },
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
        if (dataUsed) throw new Error("data acquire stopped");
        dataUsed = true;
        return {
          carrier: dataPair.left,
          generation: 1,
          dataProfile: "loomrealm.renderer-data/1",
        };
      },
    },
  });
  void runtime.catch(() => {});

  await waitFor(() => statuses.some((s) => s.state === "ready"), "runtime ready");
  const installed = await holder.connect({
    carrier: controlPair.right,
    rendererControlToken: "token",
  });
  assert.equal(installed.kind, "installed");

  await waitFor(
    () => viewportEvents.some((v) => v && v.width === 640 && v.height === 480),
    "initial normalized size",
  );

  emitViewport({ width: 640, height: 480 });
  await tick();
  const afterEqual = viewportEvents.length;

  emitViewport({ width: -1, height: 10 });
  emitViewport({ width: Number.NaN, height: 10 });
  emitViewport({ width: 800, height: 600, extra: true });
  await tick();
  assert.equal(viewportEvents.length, afterEqual);

  for (let i = 0; i < 10000; i += 1) {
    emitViewport({ width: 900 + (i % 3), height: 700 });
  }
  emitViewport({ width: 1024, height: 768 });
  await waitFor(
    () => viewportEvents.some((v) => v && v.width === 1024 && v.height === 768),
    "burst converge",
  );

  const controlPair2 = createMemoryCarrierPair();
  createMainRendererControlPeer({
    carrier: controlPair2.left,
    acceptHello() {
      const initial = controlSnapshot("vert2", 1, 1);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });
  const beforeReplace = viewportEvents.length;
  const oldEmit = emitViewport;
  await holder.connect({
    carrier: controlPair2.right,
    rendererControlToken: "token2",
  });
  assert.ok(stopCount >= 1);
  oldEmit({ width: 1, height: 1 });
  await tick();
  assert.equal(viewportEvents.length, beforeReplace);

  assert.deepEqual(
    await mainRuntime.control.shutdown({ reason: "session-end" }),
    { kind: "success", result: {} },
  );
  await runtime;
  assert.ok(viewportEvents.filter((v) => v && v.width === 1024).length >= 1);
});
