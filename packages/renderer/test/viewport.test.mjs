import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createSubsystemDataPeer } from "@loomrealm/data";
import {
  createMainRendererControlPeer,
  prepareRendererHelloResultV1,
} from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "../dist/index.js";

const authority = (subsystemKey = "demo", generation = 1) => ({
  subsystemKey,
  generation,
  dataProfile: "loomrealm.renderer-data/1",
});

const snapshot = (sessionId, revision, authorities = [authority()]) => ({
  sessionId,
  revision,
  runtimes: authorities.map(({ subsystemKey }) => ({ subsystemKey, state: "ready" })),
  stack: [],
  inputTarget: null,
  dataAuthorities: authorities,
});

function main(pair, sessionId, authorities = [authority()]) {
  return createMainRendererControlPeer({
    carrier: pair.left,
    acceptHello() {
      const initial = snapshot(sessionId, 1, authorities);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });
}

const turn = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, message = "condition") {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await turn();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

/** Real Data-plane harness: every renderer acquire lands on a real SubsystemDataPeer. */
function viewportDataHarness() {
  const peers = [];
  const binding = {
    async acquire(subsystemKey, generation, dataProfile) {
      const pair = createMemoryCarrierPair();
      const received = [];
      const peer = createSubsystemDataPeer({
        binding: { carrier: pair.left, subsystemKey, generation, dataProfile },
        handlers: {
          onInputState: () => ({ kind: "accepted" }),
          onInputEvent: () => ({ kind: "accepted" }),
          onInputReset: () => ({ kind: "accepted" }),
          onViewportState(message) {
            received.push(`${message.width}x${message.height}`);
            return { kind: "accepted" };
          },
        },
      });
      peers.push({ subsystemKey, generation, received, peer });
      return pair.right;
    },
  };
  return { binding, peers };
}

function recordedSource(initialSamples = []) {
  let emit = null;
  let starts = 0;
  let stops = 0;
  const source = {
    start(onEmit) {
      starts += 1;
      emit = onEmit;
      for (const sample of initialSamples) onEmit(sample);
      return () => {
        stops += 1;
      };
    },
  };
  return {
    source,
    emit: (sample) => emit?.(sample),
    get starts() { return starts; },
    get stops() { return stops; },
  };
}

test("V-01 raw samples are floored, validated without reading getters, and invalid samples retain the last size", async () => {
  const control = createMemoryCarrierPair();
  main(control, "a");
  const { binding, peers } = viewportDataHarness();
  const recorder = recordedSource();
  const holder = createRendererControlHolder(binding, undefined, recorder.source);
  await holder.connect({ carrier: control.right, rendererControlToken: "a" });
  await waitFor(() => peers.length === 1);

  recorder.emit({ width: 640.9, height: 480.9 });
  await waitFor(() => peers[0].received.length === 1);
  assert.deepEqual(peers[0].received, ["640x480"]);

  let getterReads = 0;
  const invalidSamples = [
    { width: 0, height: 100 },
    { width: -5, height: 100 },
    { width: 0.1, height: 100 },
    { width: Number.NaN, height: 100 },
    { width: Number.POSITIVE_INFINITY, height: 100 },
    { width: 2 ** 53, height: 100 },
    { width: 640 },
    { width: 640, height: 480, depth: 3 },
    { width: "640", height: 480 },
    null,
    42,
    (() => {
      const sample = {};
      Object.defineProperty(sample, "width", {
        enumerable: true,
        get() { getterReads += 1; return 640; },
      });
      Object.defineProperty(sample, "height", {
        enumerable: true,
        get() { getterReads += 1; return 480; },
      });
      return sample;
    })(),
    (() => {
      const sample = Object.create({ width: 640, height: 480 });
      return sample;
    })(),
  ];
  for (const sample of invalidSamples) recorder.emit(sample);
  await turn();
  assert.equal(getterReads, 0, "getter-backed samples must be rejected without reading");
  assert.deepEqual(peers[0].received, ["640x480"], "invalid samples must not clear the retained size");

  recorder.emit({ width: 640.2, height: 480.7 });
  await turn();
  assert.deepEqual(peers[0].received, ["640x480"], "normalized-equal samples are suppressed");

  recorder.emit({ width: 641, height: 480 });
  await waitFor(() => peers[0].received.length === 2);
  assert.deepEqual(peers[0].received, ["640x480", "641x480"]);
});

test("V-02 synchronous bootstrap stages one latest slot and later measurability publishes a baseline", async () => {
  const control = createMemoryCarrierPair();
  main(control, "a");
  const { binding, peers } = viewportDataHarness();
  const recorder = recordedSource([
    { width: 1024, height: 768 },
    { width: 800, height: 600 },
  ]);
  const holder = createRendererControlHolder(binding, undefined, recorder.source);
  await holder.connect({ carrier: control.right, rendererControlToken: "a" });
  await waitFor(() => peers.length === 1);
  await waitFor(() => peers[0].received.length === 1);
  assert.deepEqual(peers[0].received, ["800x600"], "only the latest staged bootstrap sample is committed");

  const controlB = createMemoryCarrierPair();
  main(controlB, "b");
  const { binding: bindingB, peers: peersB } = viewportDataHarness();
  const emptySource = recordedSource();
  const holderB = createRendererControlHolder(bindingB, undefined, emptySource.source);
  await holderB.connect({ carrier: controlB.right, rendererControlToken: "b" });
  await waitFor(() => peersB.length === 1);
  await turn();
  assert.deepEqual(peersB[0].received, [], "no synthetic size while unmeasurable");
  emptySource.emit({ width: 320, height: 240 });
  await waitFor(() => peersB[0].received.length === 1);
  assert.deepEqual(peersB[0].received, ["320x240"], "first valid observation becomes the baseline");
});

test("V-03 source bootstrap failure keeps Control current, never fakes a size, and never restarts in-participant", async () => {
  const control = createMemoryCarrierPair();
  const publisher = main(control, "a");
  const { binding, peers } = viewportDataHarness();
  let starts = 0;
  let lateEmit = null;
  const failing = {
    start(emit) {
      starts += 1;
      lateEmit = emit;
      emit({ width: 640, height: 480 });
      throw new Error("surface unavailable");
    },
  };
  const holder = createRendererControlHolder(binding, undefined, failing);
  const installed = await holder.connect({ carrier: control.right, rendererControlToken: "a" });
  assert.equal(installed.kind, "installed");
  assert.ok(holder.current() !== null, "Control stays installed after source bootstrap failure");
  await waitFor(() => peers.length === 1);
  await turn();
  assert.deepEqual(peers[0].received, [], "staged value from a failed start is discarded");

  publisher.publish(snapshot("a", 2));
  await turn();
  assert.equal(starts, 1, "no invisible auto-restart within the same participant");
  lateEmit?.({ width: 800, height: 600 });
  await turn();
  assert.deepEqual(peers[0].received, [], "fenced callback from the failed source stays inert");
});

test("V-03 non-function stop return is treated as bootstrap failure without terminal", async () => {
  const control = createMemoryCarrierPair();
  main(control, "a");
  const { binding, peers } = viewportDataHarness();
  const bad = {
    start() { return undefined; },
  };
  const holder = createRendererControlHolder(binding, undefined, bad);
  const installed = await holder.connect({ carrier: control.right, rendererControlToken: "a" });
  assert.equal(installed.kind, "installed");
  await waitFor(() => peers.length === 1);
  await turn();
  assert.deepEqual(peers[0].received, []);
});

test("V-03 participant replacement fences the old source and the new participant inherits no old sample", async () => {
  const a = createMemoryCarrierPair();
  main(a, "a");
  const { binding, peers } = viewportDataHarness();
  let startCount = 0;
  let firstEmit = null;
  const source = {
    start(emit) {
      startCount += 1;
      if (startCount === 1) {
        firstEmit = emit;
        emit({ width: 640, height: 480 });
      }
      return () => {};
    },
  };
  const holder = createRendererControlHolder(binding, undefined, source);
  await holder.connect({ carrier: a.right, rendererControlToken: "a" });
  await waitFor(() => peers.length === 1 && peers[0].received.length === 1);
  assert.deepEqual(peers[0].received, ["640x480"]);

  const b = createMemoryCarrierPair();
  main(b, "b");
  await holder.connect({ carrier: b.right, rendererControlToken: "b" });
  assert.equal(startCount, 2);
  await waitFor(() => peers.length === 2);
  await turn();
  assert.deepEqual(peers[1].received, [], "new participant does not inherit the old raw sample");

  firstEmit({ width: 999, height: 999 });
  await turn();
  assert.deepEqual(peers[1].received, [], "old source callback after replacement stays inert");
  assert.deepEqual(peers[0].received, ["640x480"], "retired old peer receives nothing from the old source");
});

test("V-03 stop() throwing during replacement is contained and the new source still works", async () => {
  let stops = 0;
  const throwingStop = {
    start() {
      return () => {
        stops += 1;
        throw new Error("stop failed");
      };
    },
  };
  const next = recordedSource([{ width: 100, height: 50 }]);
  let impl = throwingStop;
  const source = {
    start(emit) { return impl.start(emit); },
  };
  const a = createMemoryCarrierPair();
  main(a, "a");
  const { binding, peers } = viewportDataHarness();
  const holder = createRendererControlHolder(binding, undefined, source);
  await holder.connect({ carrier: a.right, rendererControlToken: "a" });

  impl = next.source;
  const b = createMemoryCarrierPair();
  main(b, "b");
  const installed = await holder.connect({ carrier: b.right, rendererControlToken: "b" });
  assert.equal(installed.kind, "installed");
  await waitFor(() => peers.length === 2 && peers[1].received.length === 1);
  assert.deepEqual(peers[1].received, ["100x50"]);
  assert.equal(stops, 1);
});

test("V-08 one source serves every current peer with independent baselines and survives snapshot refreshes", async () => {
  const control = createMemoryCarrierPair();
  const publisher = main(control, "a", [authority("demo"), authority("hud")]);
  const { binding, peers } = viewportDataHarness();
  const recorder = recordedSource([{ width: 640, height: 480 }]);
  const holder = createRendererControlHolder(binding, undefined, recorder.source);
  await holder.connect({ carrier: control.right, rendererControlToken: "a" });
  await waitFor(() => peers.length === 2);
  await waitFor(() => peers.every(({ received }) => received.length === 1));
  assert.deepEqual(peers.find(({ subsystemKey }) => subsystemKey === "demo").received, ["640x480"]);
  assert.deepEqual(peers.find(({ subsystemKey }) => subsystemKey === "hud").received, ["640x480"]);

  publisher.publish(snapshot("a", 2, [authority("demo"), authority("hud")]));
  await turn();
  assert.equal(recorder.starts, 1, "Control snapshot refresh does not restart the source");

  recorder.emit({ width: 800, height: 600 });
  await waitFor(() => peers.every(({ received }) => received.length === 2));
  for (const { received } of peers) assert.deepEqual(received, ["640x480", "800x600"]);
});

test("V-08 same-generation Data peer loss republishes the equal baseline on the fresh peer", async () => {
  const control = createMemoryCarrierPair();
  main(control, "a");
  const { binding, peers } = viewportDataHarness();
  const recorder = recordedSource([{ width: 640, height: 480 }]);
  const holder = createRendererControlHolder(binding, undefined, recorder.source);
  await holder.connect({ carrier: control.right, rendererControlToken: "a" });
  await waitFor(() => peers.length === 1 && peers[0].received.length === 1);

  await peers[0].peer.close();
  await waitFor(() => peers.length === 2);
  await waitFor(() => peers[1].received.length === 1);
  assert.deepEqual(peers[1].received, ["640x480"], "fresh peer always gets the wire baseline, even if equal");
  assert.equal(recorder.starts, 1, "source is not restarted on Data reconnect");
});

test("V-08 fresh generation retires the old peer and rebaselines the new one", async () => {
  const control = createMemoryCarrierPair();
  const publisher = main(control, "a");
  const { binding, peers } = viewportDataHarness();
  const recorder = recordedSource([{ width: 640, height: 480 }]);
  const holder = createRendererControlHolder(binding, undefined, recorder.source);
  await holder.connect({ carrier: control.right, rendererControlToken: "a" });
  await waitFor(() => peers.length === 1 && peers[0].received.length === 1);

  recorder.emit({ width: 1024, height: 768 });
  await waitFor(() => peers[0].received.length === 2);

  publisher.publish(snapshot("a", 2, [authority("demo", 2)]));
  await waitFor(() => peers.length === 2);
  await waitFor(() => peers[1].received.length === 1);
  assert.equal(peers[1].generation, 2);
  assert.deepEqual(peers[1].received, ["1024x768"], "fresh generation peer gets its own baseline");
  assert.equal(recorder.starts, 1, "generation change does not restart the participant source");
});
