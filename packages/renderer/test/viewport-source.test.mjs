import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createSubsystemDataPeer } from "@loomrealm/data";
import {
  createMainRendererControlPeer,
  prepareRendererHelloResultV1,
} from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "../dist/index.js";
import { normalizeViewportSample } from "../dist/viewport.js";

const authority = {
  subsystemKey: "demo",
  generation: 1,
  dataProfile: "loomrealm.renderer-data/1",
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

function main(pair, sessionId) {
  return createMainRendererControlPeer({
    carrier: pair.left,
    acceptHello() {
      const initial = snapshot(sessionId, 1);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });
}

async function turn() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await turn();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

const accepted = () => ({ kind: "accepted" });

test("V-01: normalize trusted raw samples; ignore illegal; no getter reads", () => {
  assert.deepEqual(normalizeViewportSample({ width: 640.9, height: 480.9 }), { width: 640, height: 480 });
  assert.equal(normalizeViewportSample({ width: 0, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: -1, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: 0.1, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: Number.NaN, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: Number.POSITIVE_INFINITY, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: Number.MAX_SAFE_INTEGER + 1, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: 10 }), null);
  assert.equal(normalizeViewportSample({ width: 10, height: 10, extra: 1 }), null);
  const proto = { width: 100, height: 100 };
  assert.equal(normalizeViewportSample(Object.create(proto)), null);
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

test("V-02: sync bootstrap sample and deferred first measurable sample", async () => {
  {
    const seen = [];
    const control = createMemoryCarrierPair();
    const data = createMemoryCarrierPair();
    createSubsystemDataPeer({
      binding: {
        carrier: data.left,
        subsystemKey: "demo",
        generation: 1,
        dataProfile: "loomrealm.renderer-data/1",
      },
      handlers: {
        onInputState: accepted,
        onInputEvent: accepted,
        onInputReset: accepted,
        onViewportState(message) { seen.push(message); return accepted(); },
      },
    });
    const holder = createRendererControlHolder(
      { async acquire() { return data.right; } },
      undefined,
      {
        start(emit) {
          emit({ width: 800, height: 600 });
          return () => {};
        },
      },
    );
    main(control, "s1");
    await holder.connect({ carrier: control.right, rendererControlToken: "t" });
    await waitFor(() => seen.length === 1, "sync baseline");
    assert.deepEqual(seen[0], { type: "viewport.state", width: 800, height: 600 });
  }

  {
    const seen = [];
    let emitRef;
    const control = createMemoryCarrierPair();
    const data = createMemoryCarrierPair();
    createSubsystemDataPeer({
      binding: {
        carrier: data.left,
        subsystemKey: "demo",
        generation: 1,
        dataProfile: "loomrealm.renderer-data/1",
      },
      handlers: {
        onInputState: accepted,
        onInputEvent: accepted,
        onInputReset: accepted,
        onViewportState(message) { seen.push(message); return accepted(); },
      },
    });
    const holder = createRendererControlHolder(
      { async acquire() { return data.right; } },
      undefined,
      {
        start(emit) {
          emitRef = emit;
          return () => {};
        },
      },
    );
    main(control, "s2");
    await holder.connect({ carrier: control.right, rendererControlToken: "t" });
    await turn();
    assert.equal(seen.length, 0);
    emitRef({ width: 320, height: 240 });
    await waitFor(() => seen.length === 1, "deferred baseline");
    assert.deepEqual(seen[0], { type: "viewport.state", width: 320, height: 240 });
  }
});

test("V-03: start failure local; late old callback inert after participant replace", async () => {
  let oldEmit;
  let starts = 0;
  const controlA = createMemoryCarrierPair();
  const holder = createRendererControlHolder(
    undefined,
    undefined,
    {
      start(emit) {
        starts += 1;
        if (starts === 1) {
          oldEmit = emit;
          emit({ width: 100, height: 100 });
          return () => {};
        }
        emit({ width: 200, height: 200 });
        return () => {};
      },
    },
  );
  main(controlA, "sa");
  await holder.connect({ carrier: controlA.right, rendererControlToken: "a" });
  assert.equal(starts, 1);

  const controlB = createMemoryCarrierPair();
  main(controlB, "sb");
  await holder.connect({ carrier: controlB.right, rendererControlToken: "b" });
  assert.equal(starts, 2);
  oldEmit({ width: 999, height: 999 });
  await turn();

  const failing = createRendererControlHolder(
    undefined,
    undefined,
    {
      start() {
        throw new Error("boom");
      },
    },
  );
  const controlC = createMemoryCarrierPair();
  main(controlC, "sc");
  const outcome = await failing.connect({ carrier: controlC.right, rendererControlToken: "c" });
  assert.equal(outcome.kind, "installed");
});

test("V-08: same participant two peers each get baseline; source not restarted on reconnect", async () => {
  let starts = 0;
  let emitRef;
  const control = createMemoryCarrierPair();
  const data1 = createMemoryCarrierPair();
  const data2 = createMemoryCarrierPair();
  const seen1 = [];
  const seen2 = [];
  createSubsystemDataPeer({
    binding: {
      carrier: data1.left,
      subsystemKey: "demo",
      generation: 1,
      dataProfile: "loomrealm.renderer-data/1",
    },
    handlers: {
      onInputState: accepted,
      onInputEvent: accepted,
      onInputReset: accepted,
      onViewportState(message) { seen1.push(message); return accepted(); },
    },
  });
  let secondAcquire;
  const secondReady = new Promise((resolve) => { secondAcquire = resolve; });
  let acquireCount = 0;
  const holder = createRendererControlHolder(
    {
      async acquire(_key, generation) {
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
        emitRef = emit;
        emit({ width: 640, height: 480 });
        return () => {};
      },
    },
  );
  const mainPeer = createMainRendererControlPeer({
    carrier: control.left,
    acceptHello() {
      const initial = snapshot("sx", 1, 1);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });
  await holder.connect({ carrier: control.right, rendererControlToken: "t" });
  await waitFor(() => seen1.length === 1, "first peer baseline");
  assert.equal(starts, 1);

  createSubsystemDataPeer({
    binding: {
      carrier: data2.left,
      subsystemKey: "demo",
      generation: 2,
      dataProfile: "loomrealm.renderer-data/1",
    },
    handlers: {
      onInputState: accepted,
      onInputEvent: accepted,
      onInputReset: accepted,
      onViewportState(message) { seen2.push(message); return accepted(); },
    },
  });
  await mainPeer.publish(snapshot("sx", 2, 2));
  await secondReady;
  await waitFor(() => seen2.length === 1, "fresh peer baseline");
  assert.equal(starts, 1);
  assert.deepEqual(seen1[0], { type: "viewport.state", width: 640, height: 480 });
  assert.deepEqual(seen2[0], { type: "viewport.state", width: 640, height: 480 });
  emitRef({ width: 640, height: 480 });
  await turn();
  assert.equal(seen2.length, 1);
});
