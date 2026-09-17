import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createSubsystemDataPeer } from "@loomrealm/data";
import { createMainRendererControlPeer, prepareRendererHelloResultV1 } from "@loomrealm/renderer-control";
import { createRendererControlHolder, normalizeViewportSample } from "../dist/index.js";

const snapshot = (sessionId, revision, dataAuthorities = []) => ({
  sessionId,
  revision,
  runtimes: dataAuthorities.map(({ subsystemKey }) => ({ subsystemKey, state: "ready" })),
  stack: [],
  inputTarget: null,
  dataAuthorities,
});

function main(pair, sessionId, dataAuthorities = []) {
  return createMainRendererControlPeer({
    carrier: pair.left,
    acceptHello() {
      const initial = snapshot(sessionId, 1, dataAuthorities);
      return { kind: "accepted", snapshot: initial, preparedHelloText: prepareRendererHelloResultV1(initial) };
    },
  });
}

const authority = (subsystemKey = "map") => ({
  subsystemKey,
  generation: 1,
  dataProfile: "loomrealm.renderer-data/1",
});

const turn = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await turn();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

function viewportDataHarness() {
  const subsystemPeers = [];
  const viewportSeen = [];
  const binding = {
    async acquire(subsystemKey, generation, dataProfile) {
      const pair = createMemoryCarrierPair();
      const peer = createSubsystemDataPeer({
        binding: { carrier: pair.left, subsystemKey, generation, dataProfile },
        handlers: {
          onInputState: () => ({ kind: "accepted" }),
          onInputEvent: () => ({ kind: "accepted" }),
          onInputReset: () => ({ kind: "accepted" }),
          onViewportState: (message) => {
            viewportSeen.push([message.width, message.height]);
            return { kind: "accepted" };
          },
        },
      });
      subsystemPeers.push(peer);
      return pair.right;
    },
  };
  return { binding, subsystemPeers, viewportSeen };
}

function fakeSource() {
  const state = { emit: null, stopCalls: 0, started: 0 };
  const source = {
    start(emit) {
      state.started += 1;
      state.emit = emit;
      return () => {
        state.stopCalls += 1;
        state.emit = null;
      };
    },
  };
  return { source, state };
}

test("normalizeViewportSample floors legal fractions and discards illegal observations", () => {
  assert.deepEqual(normalizeViewportSample({ width: 640.9, height: 480.2 }), { width: 640, height: 480 });
  assert.deepEqual(normalizeViewportSample({ width: 1, height: Number.MAX_SAFE_INTEGER }), {
    width: 1,
    height: Number.MAX_SAFE_INTEGER,
  });
  assert.equal(normalizeViewportSample({ width: 0, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: -5, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: 0.9, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: NaN, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: Infinity, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: Number.MAX_VALUE, height: 480 }), null);
  assert.equal(normalizeViewportSample({ width: "640", height: 480 }), null);
  assert.equal(normalizeViewportSample(null), null);
});

test("initial legal sample reaches the current Data peer; fractional sizes floor", async () => {
  const harness = viewportDataHarness();
  const { source, state } = fakeSource();
  const pair = createMemoryCarrierPair();
  void main(pair, "s1", [authority()]);
  const holder = createRendererControlHolder(harness.binding, undefined, source);
  const installed = await holder.connect({ carrier: pair.right, rendererControlToken: "t" });
  assert.equal(installed.kind, "installed");
  await waitFor(() => harness.subsystemPeers.length === 1, "data peer install");
  // No legal observation yet: nothing synthetic is sent.
  await turn();
  assert.deepEqual(harness.viewportSeen, []);
  state.emit({ width: 640.9, height: 480.9 });
  await waitFor(() => harness.viewportSeen.length === 1, "initial viewport publication");
  assert.deepEqual(harness.viewportSeen, [[640, 480]]);
});

test("illegal samples are discarded without clearing the retained latest", async () => {
  const harness = viewportDataHarness();
  const { source, state } = fakeSource();
  const pair = createMemoryCarrierPair();
  void main(pair, "s1", [authority()]);
  const holder = createRendererControlHolder(harness.binding, undefined, source);
  await holder.connect({ carrier: pair.right, rendererControlToken: "t" });
  await waitFor(() => harness.subsystemPeers.length === 1, "data peer install");
  state.emit({ width: 800, height: 600 });
  await waitFor(() => harness.viewportSeen.length === 1, "first publication");
  for (const bad of [
    { width: 0, height: 600 },
    { width: 800, height: -1 },
    { width: NaN, height: 600 },
    { width: 0.4, height: 600 },
    null,
    undefined,
    { width: "800", height: 600 },
  ]) {
    state.emit(bad);
  }
  await turn();
  assert.deepEqual(harness.viewportSeen, [[800, 600]]);
});

test("resize publishes changes; equal sizes (incl. DPR-only) are suppressed", async () => {
  const harness = viewportDataHarness();
  const { source, state } = fakeSource();
  const pair = createMemoryCarrierPair();
  void main(pair, "s1", [authority()]);
  const holder = createRendererControlHolder(harness.binding, undefined, source);
  await holder.connect({ carrier: pair.right, rendererControlToken: "t" });
  await waitFor(() => harness.subsystemPeers.length === 1, "data peer install");
  state.emit({ width: 640, height: 480 });
  await waitFor(() => harness.viewportSeen.length === 1, "first size");
  state.emit({ width: 640, height: 480 });
  await turn();
  assert.equal(harness.viewportSeen.length, 1);
  state.emit({ width: 1024, height: 768 });
  await waitFor(() => harness.viewportSeen.length === 2, "resize publication");
  assert.deepEqual(harness.viewportSeen[1], [1024, 768]);
});

test("same-authority fresh carrier republishes the retained latest as its own baseline", async () => {
  const harness = viewportDataHarness();
  const { source, state } = fakeSource();
  const pair = createMemoryCarrierPair();
  void main(pair, "s1", [authority()]);
  const holder = createRendererControlHolder(harness.binding, undefined, source);
  await holder.connect({ carrier: pair.right, rendererControlToken: "t" });
  await waitFor(() => harness.subsystemPeers.length === 1, "data peer install");
  state.emit({ width: 1280, height: 720 });
  await waitFor(() => harness.viewportSeen.length === 1, "first size");
  // Same-generation carrier replacement: old peer terminal -> re-acquire.
  await harness.subsystemPeers[0].close();
  await waitFor(() => harness.subsystemPeers.length === 2, "fresh data peer install");
  await waitFor(() => harness.viewportSeen.length === 2, "fresh baseline republication");
  assert.deepEqual(harness.viewportSeen[1], [1280, 720]);
});

test("renderer replacement fences the old source, its late emits, and the old participant baseline", async () => {
  const harness = viewportDataHarness();
  const { source, state } = fakeSource();
  const a = createMemoryCarrierPair();
  const b = createMemoryCarrierPair();
  void main(a, "a", [authority()]);
  void main(b, "b", [authority()]);
  const holder = createRendererControlHolder(harness.binding, undefined, source);
  await holder.connect({ carrier: a.right, rendererControlToken: "a" });
  await waitFor(() => harness.subsystemPeers.length === 1, "first data peer");
  state.emit({ width: 800, height: 600 });
  await waitFor(() => harness.viewportSeen.length === 1, "first size");
  const lateEmit = state.emit;
  await holder.connect({ carrier: b.right, rendererControlToken: "b" });
  await waitFor(() => state.stopCalls === 1, "old source stopped");
  await waitFor(() => harness.subsystemPeers.length === 2, "fresh data peer under new session");
  // Fresh Renderer participant B: its physical source has NOT produced a
  // legal sample yet. The old participant's 800x600 must NOT be republished
  // as B's baseline (independent-review corrected expectation).
  await turn();
  await turn();
  assert.deepEqual(harness.viewportSeen, [[800, 600]]);
  assert.equal(state.started, 2);
  // Late emit from A's retired source stays fenced.
  lateEmit?.({ width: 42, height: 42 });
  await turn();
  assert.deepEqual(harness.viewportSeen, [[800, 600]]);
  // Only B's first legal sample becomes B's baseline.
  state.emit({ width: 1024, height: 768 });
  await waitFor(() => harness.viewportSeen.length === 2, "B first sample");
  assert.deepEqual(harness.viewportSeen[1], [1024, 768]);
});

test("same Renderer participant: carrier reconnect immediately republishes retained 800x600 baseline", async () => {
  const harness = viewportDataHarness();
  const { source, state } = fakeSource();
  const pair = createMemoryCarrierPair();
  void main(pair, "s1", [authority()]);
  const holder = createRendererControlHolder(harness.binding, undefined, source);
  await holder.connect({ carrier: pair.right, rendererControlToken: "t" });
  await waitFor(() => harness.subsystemPeers.length === 1, "data peer install");
  state.emit({ width: 800, height: 600 });
  await waitFor(() => harness.viewportSeen.length === 1, "sample published");
  // Same participant, same-generation carrier replacement: retained latest
  // is still this participant's current truth -> fresh carrier baseline.
  await harness.subsystemPeers[0].close();
  await waitFor(() => harness.subsystemPeers.length === 2, "fresh data peer install");
  await waitFor(() => harness.viewportSeen.length === 2, "fresh carrier baseline");
  assert.deepEqual(harness.viewportSeen[1], [800, 600]);
});

test("viewport source bootstrap failure is contained and leaves no subscription", async () => {
  const harness = viewportDataHarness();
  const badSource = {
    start() {
      throw new Error("source boom");
    },
  };
  const pair = createMemoryCarrierPair();
  void main(pair, "s1", [authority()]);
  const holder = createRendererControlHolder(harness.binding, undefined, badSource);
  const installed = await holder.connect({ carrier: pair.right, rendererControlToken: "t" });
  assert.equal(installed.kind, "installed");
  await waitFor(() => harness.subsystemPeers.length === 1, "data peer install");
  await turn();
  assert.deepEqual(harness.viewportSeen, []);
});
