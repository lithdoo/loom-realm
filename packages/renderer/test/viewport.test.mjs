import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createSubsystemDataPeer } from "@loomrealm/data";
import { createMainRendererControlPeer, prepareRendererHelloResultV1 } from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "../dist/index.js";

const accepted = () => ({ kind: "accepted" });
const turn = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, message = "condition") {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await turn();
  }
  assert.fail(`timed out waiting for ${message}`);
}

const authority = (subsystemKey, generation = 1) => ({
  subsystemKey,
  generation,
  dataProfile: "loomrealm.renderer-data/1",
});

function snapshot(sessionId, revision, dataAuthorities) {
  return {
    sessionId,
    revision,
    runtimes: dataAuthorities.map(({ subsystemKey }) => ({ subsystemKey, state: "ready" })),
    stack: [],
    inputTarget: null,
    dataAuthorities,
  };
}

function main(pair, sessionId, dataAuthorities) {
  return createMainRendererControlPeer({
    carrier: pair.left,
    acceptHello() {
      const initial = snapshot(sessionId, 1, dataAuthorities);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });
}

function viewportHarness({ source, dataAuthorities = [authority("demo")] } = {}) {
  const control = createMemoryCarrierPair();
  const controlMain = main(control, "session-a", dataAuthorities);
  const received = [];
  const peers = [];
  const binding = {
    async acquire(subsystemKey, generation, dataProfile) {
      const pair = createMemoryCarrierPair();
      const peer = createSubsystemDataPeer({
        binding: { carrier: pair.left, subsystemKey, generation, dataProfile },
        handlers: {
          onInputState: accepted,
          onInputEvent: accepted,
          onInputReset: accepted,
          onViewportState(message) {
            received.push({ subsystemKey, generation, message });
            return accepted();
          },
        },
      });
      peers.push({ subsystemKey, generation, peer, pair });
      return pair.right;
    },
  };
  const holder = createRendererControlHolder(binding, undefined, source);
  return {
    binding,
    holder,
    control,
    controlMain,
    received,
    peers,
    async connect() {
      return holder.connect({ carrier: control.right, rendererControlToken: "t" });
    },
    async close() {
      controlMain.retire();
      await Promise.allSettled(peers.map(({ peer }) => peer.close()));
    },
  };
}

// ---------------------------------------------------------------------------
// V-01 — raw source normalization, filtering, dedupe
// ---------------------------------------------------------------------------

test("V-01 raw samples floor to logical CSS pixels, invalid observations are ignored, equal values dedupe", async (t) => {
  let emit = null;
  const source = { start(next) { emit = next; return () => {}; } };
  const harness = viewportHarness({ source });
  t.after(() => harness.close());
  assert.equal((await harness.connect()).kind, "installed");
  await waitFor(() => harness.peers.length === 1, "first Data peer");

  emit({ width: 640.9, height: 480.9 });
  await waitFor(() => harness.received.length === 1, "first normalized size");
  assert.deepEqual(harness.received[0].message, { type: "viewport.state", width: 640, height: 480 });

  let getterReads = 0;
  const invalidSamples = [
    { width: 0, height: 480 },
    { width: -640, height: 480 },
    { width: 0.1, height: 480 },
    { width: Number.NaN, height: 480 },
    { width: Number.POSITIVE_INFINITY, height: 480 },
    { width: Number.MAX_SAFE_INTEGER + 1, height: 480 },
    { width: 640 },
    { width: 640, height: 480, extra: 1 },
    { get width() { getterReads += 1; return 640; }, height: 480 },
    Object.create({ width: 640, height: 480 }),
    null,
    "640x480",
  ];
  for (const sample of invalidSamples) emit(sample);
  await turn();
  assert.equal(getterReads, 0, "getters are never invoked");
  assert.equal(harness.received.length, 1, "invalid observations keep the retained size");

  emit({ width: 640.9, height: 480.9 });
  await turn();
  assert.equal(harness.received.length, 1, "normalized-equal observations dedupe");

  emit({ width: 641.2, height: 480.2 });
  await waitFor(() => harness.received.length === 2, "changed size publishes");
  assert.deepEqual(harness.received[1].message, { type: "viewport.state", width: 641, height: 480 });
});

// ---------------------------------------------------------------------------
// V-02 — bootstrap sampling, staged slot, late measurability
// ---------------------------------------------------------------------------

test("V-02 synchronous start sample is staged into one latest slot and committed as fresh baseline", async (t) => {
  const emitted = [];
  const source = {
    start(emit) {
      emitted.push({ width: 100.9, height: 100.9 });
      emit({ width: 100.9, height: 100.9 });
      emit({ width: 200.9, height: 300.9 });
      return () => {};
    },
  };
  const harness = viewportHarness({ source });
  t.after(() => harness.close());
  assert.equal((await harness.connect()).kind, "installed");
  await waitFor(() => harness.received.length === 1, "staged baseline");
  await turn();
  assert.equal(harness.received.length, 1, "one latest staged slot, not a per-sample queue");
  assert.deepEqual(harness.received[0].message, { type: "viewport.state", width: 200, height: 300 });
});

test("V-02 an initially unmeasurable source publishes the first legal size later without resize input", async (t) => {
  let emit = null;
  let starts = 0;
  const source = { start(next) { starts += 1; emit = next; return () => {}; } };
  const harness = viewportHarness({ source });
  t.after(() => harness.close());
  await harness.connect();
  await waitFor(() => harness.peers.length === 1, "Data peer waits without synthetic size");
  await turn();
  assert.equal(harness.received.length, 0);
  assert.equal(starts, 1);

  emit({ width: 320, height: 240 });
  await waitFor(() => harness.received.length === 1, "first measurable size");
  assert.deepEqual(harness.received[0].message, { type: "viewport.state", width: 320, height: 240 });
});

// ---------------------------------------------------------------------------
// V-03 — local source failure containment and participant replacement
// ---------------------------------------------------------------------------

test("V-03 start throw or bad stop function is locally unavailable without Data/Control terminal or retry", async (t) => {
  const throwing = { start() { throw new Error("bootstrap failed"); } };
  const harness = viewportHarness({ source: throwing });
  t.after(() => harness.close());
  assert.equal((await harness.connect()).kind, "installed");
  await waitFor(() => harness.peers.length === 1, "Data peer installs despite source failure");
  await turn();
  assert.equal(harness.received.length, 0);
  assert.equal(harness.holder.current()?.snapshot.sessionId, "session-a");

  const badReturn = { start() { return undefined; } };
  const harness2 = viewportHarness({ source: badReturn });
  t.after(() => harness2.close());
  assert.equal((await harness2.connect()).kind, "installed");
  await waitFor(() => harness2.peers.length === 1, "Data peer installs despite bad stop");
  assert.equal(harness2.holder.current()?.snapshot.sessionId, "session-a");
});

test("V-03 stop throw is contained, participant replacement isolates the old source callback", async (t) => {
  const emits = [];
  let starts = 0;
  let stops = 0;
  const source = {
    start(emit) {
      starts += 1;
      emits.push(emit);
      return () => {
        stops += 1;
        if (stops === 1) throw new Error("contained stop failure");
      };
    },
  };
  const harness = viewportHarness({ source });
  t.after(() => harness.close());

  const firstControl = createMemoryCarrierPair();
  const firstMain = main(firstControl, "session-a", [authority("demo")]);
  const holder = harness.holder;
  assert.equal((await holder.connect({ carrier: firstControl.right, rendererControlToken: "a" })).kind, "installed");
  emits[0]({ width: 111, height: 222 });
  await waitFor(() => harness.received.length === 1, "first participant baseline");

  const secondControl = createMemoryCarrierPair();
  const secondMain = main(secondControl, "session-b", [authority("demo")]);
  assert.equal((await holder.connect({ carrier: secondControl.right, rendererControlToken: "b" })).kind, "installed");
  assert.equal(starts, 2);
  assert.equal(stops, 1, "old source stopped despite throwing");

  emits[0]({ width: 999, height: 999 });
  await turn();
  assert.equal(
    harness.received.filter(({ message }) => message.width === 999).length,
    0,
    "late old callback is fenced",
  );

  emits[1]({ width: 333, height: 444 });
  await waitFor(
    () => harness.received.some(({ message }) => message.width === 333),
    "new participant source publishes",
  );
  assert.equal(
    harness.received.some(({ message }) => message.width === 111),
    true,
    "old participant baseline is history, not inherited evidence",
  );
  firstMain.retire();
  secondMain.retire();
});

test("V-03 invalid viewport source capability is rejected at construction", () => {
  assert.throws(() => createRendererControlHolder(undefined, undefined, null), /Invalid RendererViewportSource/);
  assert.throws(() => createRendererControlHolder(undefined, undefined, {}), /Invalid RendererViewportSource/);
  assert.throws(
    () => createRendererControlHolder(undefined, undefined, {
      get start() { throw new Error("getter"); },
    }),
    /Invalid RendererViewportSource/,
  );
});

// ---------------------------------------------------------------------------
// V-08 — participant-scoped source shared by multiple current Data peers
// ---------------------------------------------------------------------------

test("V-08 one source feeds every current Data peer its own baseline and update stream", async (t) => {
  const authorities = [authority("s1"), authority("s2")];
  let emit = null;
  let starts = 0;
  const source = { start(next) { starts += 1; emit = next; return () => {}; } };
  const harness = viewportHarness({ source, dataAuthorities: authorities });
  t.after(() => harness.close());
  assert.equal((await harness.connect()).kind, "installed");
  await waitFor(() => harness.peers.length === 2, "two Data peers");

  emit({ width: 640, height: 480 });
  await waitFor(() => harness.received.length === 2, "both peers receive the fresh baseline");
  assert.deepEqual(
    harness.received.map(({ subsystemKey, message }) => [subsystemKey, message.width, message.height]),
    [["s1", 640, 480], ["s2", 640, 480]],
  );

  emit({ width: 800, height: 600 });
  await waitFor(() => harness.received.length === 4, "both peers receive the update");
  assert.deepEqual(
    harness.received.slice(2).map(({ subsystemKey, message }) => [subsystemKey, message.width]),
    [["s1", 800], ["s2", 800]],
  );

  // Same-participant Control snapshot update must not restart the source.
  const controlSnapshot = snapshot("session-a", 2, authorities);
  harness.controlMain.publish(controlSnapshot);
  await turn();
  assert.equal(starts, 1, "snapshot update does not restart the participant source");

  // Reconnect: only the fresh peer gets a baseline; the sibling cursor is untouched.
  const s2 = harness.peers.find(({ subsystemKey }) => subsystemKey === "s2");
  await s2.pair.lose(new Error("reconnect"));
  await waitFor(
    () => harness.peers.filter(({ subsystemKey }) => subsystemKey === "s2").length === 2,
    "fresh s2 carrier",
  );
  await waitFor(() => harness.received.length === 5, "fresh s1 baseline after reconnect");
  assert.deepEqual(harness.received[4], {
    subsystemKey: "s2",
    generation: 1,
    message: { type: "viewport.state", width: 800, height: 600 },
  });
  await turn();
  assert.equal(harness.received.length, 5, "sibling cursor is independent");
});

test("V-08 generation replacement publishes a fresh baseline while the source stays participant-scoped", async (t) => {
  const authorities = [authority("demo", 1)];
  let emit = null;
  let starts = 0;
  const source = { start(next) { starts += 1; emit = next; return () => {}; } };
  const harness = viewportHarness({ source, dataAuthorities: authorities });
  t.after(() => harness.close());
  await harness.connect();
  await waitFor(() => harness.peers.length === 1, "generation 1 peer");
  emit({ width: 640, height: 480 });
  await waitFor(() => harness.received.length === 1, "generation 1 baseline");

  harness.controlMain.publish(snapshot("session-a", 2, [authority("demo", 2)]));
  await waitFor(() => harness.peers.length === 2, "generation 2 peer");
  await waitFor(() => harness.received.length === 2, "generation 2 fresh baseline");
  assert.deepEqual(harness.received[1], {
    subsystemKey: "demo",
    generation: 2,
    message: { type: "viewport.state", width: 640, height: 480 },
  });
  assert.equal(starts, 1, "same participant generation change never restarts the source");
});
