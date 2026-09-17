import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createSubsystemDataPeer } from "@loomrealm/data";
import {
  createMainRendererControlPeer,
  prepareRendererHelloResultV1,
} from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "../dist/index.js";
import { normalizeViewportSample } from "../dist/internal/viewport-publisher.js";

const authority = {
  subsystemKey: "demo",
  generation: 1,
  dataProfile: "loomrealm.renderer-data/1",
};

const inputTarget = Object.freeze({
  subsystemKey: "demo",
  frameId: "root",
  activationId: "a1",
});

const snapshot = (sessionId, revision, generation = 1) => ({
  sessionId,
  revision,
  runtimes: [{ subsystemKey: "demo", state: "ready" }],
  stack: [{ frameId: "root", subsystemKey: "demo", lifecycle: "active", activationId: "a1" }],
  inputTarget,
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

const turn = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await turn();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

test("floors legal CSS logical samples, discards invalid ones, and fences old source emits", async () => {
  const control = createMemoryCarrierPair();
  const publisher = main(control, "a");
  const received = [];
  let emit;
  let stops = 0;
  const source = {
    start(next) {
      emit = next;
      next({ width: 640.9, height: 480.4 });
      next({ width: 0, height: 480 });
      next({ width: Number.NaN, height: 480 });
      return () => { stops += 1; };
    },
  };
  const holder = createRendererControlHolder({
    async acquire() {
      const pair = createMemoryCarrierPair();
      createSubsystemDataPeer({
        binding: {
          carrier: pair.left,
          subsystemKey: "demo",
          generation: 1,
          dataProfile: "loomrealm.renderer-data/1",
        },
        handlers: {
          onInputState: () => ({ kind: "accepted" }),
          onInputEvent: () => ({ kind: "accepted" }),
          onInputReset: () => ({ kind: "accepted" }),
          onViewportState(message) {
            received.push(message);
            return { kind: "accepted" };
          },
        },
      });
      return pair.right;
    },
  }, undefined, source);
  await holder.connect({ carrier: control.right, rendererControlToken: "a" });
  await waitFor(() => received.length === 1, "legal floor");
  assert.deepEqual(received[0], { type: "viewport.state", width: 640, height: 480 });
  assert.deepEqual(holder.current().snapshot.inputTarget, inputTarget);
  emit({ width: 800, height: 600 });
  await waitFor(() => received.length === 2, "resize");
  assert.deepEqual(received[1], { type: "viewport.state", width: 800, height: 600 });
  emit({ width: 800, height: 600 });
  await turn();
  assert.equal(received.length, 2);
  assert.deepEqual(holder.current().snapshot.inputTarget, inputTarget);
  publisher.retire();
  await waitFor(() => stops === 1, "source stop");
  emit({ width: 1024, height: 768 });
  await turn();
  assert.equal(received.length, 2);
});

test("invalid-only samples never synthesize zero, default, or null viewport.state", async () => {
  const control = createMemoryCarrierPair();
  const publisher = main(control, "a");
  const received = [];
  const source = {
    start(next) {
      next({ width: 0, height: 480 });
      next({ width: -1, height: 480 });
      next({ width: Number.POSITIVE_INFINITY, height: 480 });
      return () => {};
    },
  };
  const holder = createRendererControlHolder({
    async acquire() {
      const pair = createMemoryCarrierPair();
      createSubsystemDataPeer({
        binding: {
          carrier: pair.left,
          subsystemKey: "demo",
          generation: 1,
          dataProfile: "loomrealm.renderer-data/1",
        },
        handlers: {
          onInputState: () => ({ kind: "accepted" }),
          onInputEvent: () => ({ kind: "accepted" }),
          onInputReset: () => ({ kind: "accepted" }),
          onViewportState(message) {
            received.push(message);
            return { kind: "accepted" };
          },
        },
      });
      return pair.right;
    },
  }, undefined, source);
  await holder.connect({ carrier: control.right, rendererControlToken: "a" });
  await turn();
  await turn();
  assert.deepEqual(received, []);
  publisher.retire();
});

test("normalizeViewportSample floors finite fractions and rejects illegal samples", () => {
  assert.deepEqual(normalizeViewportSample({ width: 640.9, height: 480.1 }), { width: 640, height: 480 });
  assert.equal(normalizeViewportSample(null), null);
  assert.equal(normalizeViewportSample("640x480"), null);
  assert.equal(normalizeViewportSample({ height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: 640 }), null);
  assert.equal(normalizeViewportSample({ width: "640", height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: Number.NaN, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: Number.POSITIVE_INFINITY, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: Number.NEGATIVE_INFINITY, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: 0, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: -1, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: 0.9, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: Number.MAX_SAFE_INTEGER + 1, height: 480 }), null);
});

test("fresh Renderer does not republish the previous Renderer observation on a silent source", async () => {
  const received = [];
  let starts = 0;
  let emitB;
  const source = {
    start(next) {
      starts += 1;
      if (starts === 1) {
        next({ width: 640, height: 480 });
        return () => {};
      }
      emitB = next;
      return () => {};
    },
  };
  const holder = createRendererControlHolder({
    async acquire(_key, generation) {
      const pair = createMemoryCarrierPair();
      const local = [];
      createSubsystemDataPeer({
        binding: {
          carrier: pair.left,
          subsystemKey: "demo",
          generation,
          dataProfile: "loomrealm.renderer-data/1",
        },
        handlers: {
          onInputState: () => ({ kind: "accepted" }),
          onInputEvent: () => ({ kind: "accepted" }),
          onInputReset: () => ({ kind: "accepted" }),
          onViewportState(message) {
            local.push(message);
            received.push({ generation, message });
            return { kind: "accepted" };
          },
        },
      });
      return pair.right;
    },
  }, undefined, source);
  const a = createMemoryCarrierPair();
  main(a, "a");
  await holder.connect({ carrier: a.right, rendererControlToken: "a" });
  await waitFor(() => received.length === 1, "renderer A baseline");
  const b = createMemoryCarrierPair();
  main(b, "b");
  await holder.connect({ carrier: b.right, rendererControlToken: "b" });
  await waitFor(() => starts === 2, "renderer B source started");
  await turn();
  await turn();
  assert.deepEqual(received, [
    { generation: 1, message: { type: "viewport.state", width: 640, height: 480 } },
  ]);
  emitB({ width: 800, height: 600 });
  await waitFor(() => received.length === 2, "renderer B legal baseline");
  assert.deepEqual(received[1], {
    generation: 1,
    message: { type: "viewport.state", width: 800, height: 600 },
  });
});

test("fresh Renderer fences the old source and queued callback", async () => {
  const emits = [];
  const received = [];
  let starts = 0;
  const source = {
    start(next) {
      starts += 1;
      emits.push(next);
      next({ width: 640, height: 480 });
      return () => {};
    },
  };
  const holder = createRendererControlHolder({
    async acquire(_key, generation) {
      const pair = createMemoryCarrierPair();
      const local = [];
      createSubsystemDataPeer({
        binding: {
          carrier: pair.left,
          subsystemKey: "demo",
          generation,
          dataProfile: "loomrealm.renderer-data/1",
        },
        handlers: {
          onInputState: () => ({ kind: "accepted" }),
          onInputEvent: () => ({ kind: "accepted" }),
          onInputReset: () => ({ kind: "accepted" }),
          onViewportState(message) {
            local.push(message);
            received.push(message);
            return { kind: "accepted" };
          },
        },
      });
      return pair.right;
    },
  }, undefined, source);
  const a = createMemoryCarrierPair();
  main(a, "a");
  await holder.connect({ carrier: a.right, rendererControlToken: "a" });
  await waitFor(() => received.length === 1, "renderer A baseline");
  const b = createMemoryCarrierPair();
  main(b, "b");
  await holder.connect({ carrier: b.right, rendererControlToken: "b" });
  await waitFor(() => starts === 2 && received.length === 2, "renderer B baseline");
  emits[0]({ width: 1024, height: 768 });
  await turn();
  assert.deepEqual(received, [
    { type: "viewport.state", width: 640, height: 480 },
    { type: "viewport.state", width: 640, height: 480 },
  ]);
});

test("fresh Data carrier republishes the current legal baseline", async () => {
  const control = createMemoryCarrierPair();
  const publisher = main(control, "a");
  const acquisitions = [];
  const source = {
    start(emit) {
      emit({ width: 320, height: 240 });
      return () => {};
    },
  };
  const holder = createRendererControlHolder({
    async acquire(_key, generation) {
      const pair = createMemoryCarrierPair();
      const received = [];
      const subsystem = createSubsystemDataPeer({
        binding: {
          carrier: pair.left,
          subsystemKey: "demo",
          generation,
          dataProfile: "loomrealm.renderer-data/1",
        },
        handlers: {
          onInputState: () => ({ kind: "accepted" }),
          onInputEvent: () => ({ kind: "accepted" }),
          onInputReset: () => ({ kind: "accepted" }),
          onViewportState(message) {
            received.push(message);
            return { kind: "accepted" };
          },
        },
      });
      acquisitions.push({ generation, received, subsystem });
      return pair.right;
    },
  }, undefined, source);
  await holder.connect({ carrier: control.right, rendererControlToken: "a" });
  await waitFor(() => acquisitions[0]?.received.length === 1, "generation 1 baseline");
  publisher.publish(snapshot("a", 2, 2));
  await waitFor(() => acquisitions.length === 2 && acquisitions[1].received.length === 1, "generation 2 baseline");
  assert.deepEqual(acquisitions[0].received, [{ type: "viewport.state", width: 320, height: 240 }]);
  assert.deepEqual(acquisitions[1].received, [{ type: "viewport.state", width: 320, height: 240 }]);
  await acquisitions[1].subsystem.close();
  await waitFor(
    () => acquisitions.length === 3 &&
      acquisitions[2].generation === 2 &&
      acquisitions[2].received.length === 1,
    "same-generation fresh carrier baseline",
  );
  assert.deepEqual(acquisitions[2].received, [{ type: "viewport.state", width: 320, height: 240 }]);
  publisher.retire();
  await acquisitions[2].subsystem.terminal;
});
