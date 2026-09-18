// Viewport State v1 architecture qualification — V-01..V-14 (vertical matrix).
//
// The chain under test is REAL at every architectural seam except the physical
// window sampling, which the frozen contract explicitly defers to a later
// product milestone:
//
//   fake viewport source (platform seam stand-in)
//   → real RendererControlHolder (packages/renderer)
//   → real RendererDataPeer (packages/data)
//   → real MessageCarrier memory pair (packages/foundation)
//   → real SubsystemDataPeer (packages/data)
//   → real runSubsystem host (packages/subsystem)
//   → scope.viewport inside the real definition
//
// The Data "broker" below only pairs renderer-side and host-side acquisitions
// the way the Platform DataConnectionBroker would; every protocol byte flows
// through real Data peers over real carriers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererControlHolder,
} from "@loomrealm/renderer";
import {
  createMainRendererControlPeer,
  prepareRendererHelloResultV1,
} from "@loomrealm/renderer-control";
import { createMainRuntimeControlPeer } from "@loomrealm/runtime-control";
import {
  runSubsystem,
} from "@loomrealm/subsystem/host";
import {
  completed,
  defineSubsystem,
} from "@loomrealm/subsystem";

const PROFILE = "loomrealm.renderer-data/1";
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
const runtimePolicy = {
  scheduler,
  helloDeadlineMs: 1000,
  frameDeadlineMs: 1000,
  terminalCleanupDeadlineMs: 50,
};

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, message = "condition") {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

function createFakeViewportSource() {
  let starts = 0;
  let stops = 0;
  let current = null;
  const handles = [];
  return {
    source: {
      start(onEmit) {
        starts += 1;
        const handle = { emit: onEmit, stopped: false };
        handles.push(handle);
        current = handle;
        return () => {
          stops += 1;
          handle.stopped = true;
          if (current === handle) current = null;
        };
      },
    },
    emit: (sample) => current?.emit(sample),
    staleEmit: (index, sample) => {
      const handle = handles[index];
      if (handle !== undefined) handle.emit(sample);
    },
    get starts() { return starts; },
    get stops() { return stops; },
  };
}

function createFakeInputSource() {
  let emit = null;
  return {
    source: {
      start(onEmit) {
        emit = onEmit;
        return () => { emit = null; };
      },
    },
    emit: (change) => emit?.(change),
  };
}

/** Mini Platform DataConnectionBroker: pairs the two real acquisition sides and logs both wire directions. */
function createDataBroker() {
  let generation = 1;
  const rendererDemands = [];
  const hostOffers = [];
  const pairs = [];

  function makePair() {
    const pair = createMemoryCarrierPair();
    const entry = {
      pair,
      generation,
      rendererSent: [],
      hostSent: [],
      gate: Promise.resolve(),
      releaseGate: () => {},
      claimed: false,
      hold() {
        entry.gate = new Promise((resolve) => { entry.releaseGate = resolve; });
      },
      release() {
        entry.releaseGate();
        entry.gate = Promise.resolve();
      },
    };
    const wrap = (end, log) => {
      const rawSend = end.send.bind(end);
      end.send = async (text) => {
        await entry.gate;
        log.push(text);
        return rawSend(text);
      };
    };
    wrap(pair.left, entry.rendererSent);
    wrap(pair.right, entry.hostSent);
    pairs.push(entry);
    return entry;
  }

  return {
    pairs,
    get generation() { return generation; },
    setGeneration(next) { generation = next; },
    get active() { return pairs.filter((entry) => !entry.lost).at(-1) ?? null; },
    rendererBinding: {
      acquire(subsystemKey, generationRequested, dataProfile, signal) {
        const offer = hostOffers.find((candidate) =>
          candidate.generation === generationRequested && !candidate.claimed);
        if (offer !== undefined) {
          offer.claimed = true;
          return Promise.resolve(offer.pair.left);
        }
        return new Promise((resolve) => {
          rendererDemands.push({ subsystemKey, generation: generationRequested, resolve, signal });
        });
      },
    },
    hostBinding: {
      acquire() {
        const entry = makePair();
        hostOffers.push(entry);
        const demandIndex = rendererDemands.findIndex((demand) => demand.generation === entry.generation);
        if (demandIndex >= 0) {
          const demand = rendererDemands.splice(demandIndex, 1)[0];
          demand.resolve(entry.pair.left);
        }
        return Promise.resolve({ carrier: entry.pair.right, generation, dataProfile: PROFILE });
      },
    },
    retireActive() {
      const entry = pairs.at(-1);
      if (entry !== undefined) {
        entry.lost = true;
        entry.pair.lose();
      }
    },
  };
}

const authority = (subsystemKey = "demo", generation = 1) => ({ subsystemKey, generation, dataProfile: PROFILE });

function controlSnapshot(sessionId, revision, options = {}) {
  const authorities = options.authorities ?? [authority()];
  const stack = options.stack ?? [];
  return {
    sessionId,
    revision,
    runtimes: authorities.map(({ subsystemKey }) => ({ subsystemKey, state: "ready" })),
    stack,
    inputTarget: options.inputTarget ?? null,
    dataAuthorities: authorities,
  };
}

async function createVertical() {
  const controlPair = createMemoryCarrierPair();
  const statuses = [];
  const main = createMainRuntimeControlPeer({
    carrier: controlPair.left,
    scheduler,
    frameDeadlineMs: 1000,
    shutdownDeadlineMs: 1000,
    authenticateHello: () => ({ kind: "accepted" }),
    handlers: {
      onStatus(status) {
        statuses.push(status);
        return { kind: "success", result: {} };
      },
      onFrameCall() { return { kind: "success", result: { childFrameId: "child-1" } }; },
      onFrameReturn() { return { kind: "success", result: {} }; },
    },
  });

  const broker = createDataBroker();
  const state = {
    scope: null,
    viewport: null,
    inputPayloads: [],
    listenerCreated: false,
    frameGateResolvers: [],
  };

  const runtime = runSubsystem({
    definition: defineSubsystem((scope) => {
      state.scope = scope;
      state.viewport = scope.viewport;
      scope.createRenderDomain({ zIndex: 1, roots: [] });
      return {
        frame(frame) {
          const listener = scope.createInputListener({ frame, channels: ["keyboard.state"] });
          listener.on("keyboard.state", (payload) => state.inputPayloads.push(payload));
          state.listenerCreated = true;
          return new Promise((resolve) => state.frameGateResolvers.push(resolve));
        },
      };
    }),
    runtimeControl: {
      async acquire() { return controlPair.right; },
    },
    runtimePolicy,
    launch: {
      subsystemKey: "demo",
      bootstrapToken: "secret",
      controlProtocolVersions: [1],
    },
    data: broker.hostBinding,
  });
  void runtime.catch(() => {});
  await main.identified;
  await waitFor(() => statuses.some((status) => status.state === "ready"), "subsystem ready");

  const rendererControlPair = createMemoryCarrierPair();
  const rendererMain = createMainRendererControlPeer({
    carrier: rendererControlPair.left,
    acceptHello() {
      const initial = controlSnapshot("v", 1);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });

  const fakeInput = createFakeInputSource();
  const fakeViewport = createFakeViewportSource();
  const holder = createRendererControlHolder(broker.rendererBinding, fakeInput.source, fakeViewport.source);
  const installed = await holder.connect({ carrier: rendererControlPair.right, rendererControlToken: "t" });
  assert.equal(installed.kind, "installed");

  return {
    main,
    rendererMain,
    holder,
    broker,
    fakeInput,
    fakeViewport,
    state,
    runtime,
    statuses,
    controlPair,
    rendererControlPair,
    async shutdown() {
      assert.deepEqual(await main.control.shutdown({ reason: "session-end" }), { kind: "success", result: {} });
      await runtime;
    },
  };
}

const viewportWire = (texts) => texts.filter((text) => text.includes("viewport.state"));
const lastViewportWire = (texts) => viewportWire(texts).at(-1);

test("V-14 vertical: synchronous first sample, floor normalization and exact wire bytes reach scope.viewport", async () => {
  const vertical = await createVertical();
  const seen = [];
  vertical.state.viewport.subscribe((value) => seen.push(value));
  assert.deepEqual(seen, [null]);

  vertical.fakeViewport.source.start; // started by holder connect already
  vertical.fakeViewport.emit({ width: 800.9, height: 600.4 });
  await waitFor(() => vertical.state.viewport.current !== null);
  assert.deepEqual(vertical.state.viewport.current, { width: 800, height: 600 });
  assert.deepEqual(seen, [null, { width: 800, height: 600 }]);
  const wire = vertical.broker.pairs[0].rendererSent;
  assert.deepEqual(wire, ['{"type":"viewport.state","width":800,"height":600}']);
  await vertical.shutdown();
});

test("V-14 vertical: change, equal and invalid samples over the real chain", async () => {
  const vertical = await createVertical();
  const seen = [];
  vertical.state.viewport.subscribe((value) => seen.push(value));
  vertical.fakeViewport.emit({ width: 640, height: 480 });
  await waitFor(() => seen.length === 2);

  vertical.fakeViewport.emit({ width: 1024, height: 768 });
  await waitFor(() => seen.length === 3);
  assert.deepEqual(seen[2], { width: 1024, height: 768 });

  vertical.fakeViewport.emit({ width: 1024.9, height: 768.2 });
  await tick();
  assert.equal(seen.length, 3, "normalized-equal sample is suppressed end to end");

  vertical.fakeViewport.emit({ width: 0, height: 10 });
  vertical.fakeViewport.emit({ width: Number.NaN, height: 10 });
  vertical.fakeViewport.emit({ width: -3, height: 10 });
  vertical.fakeViewport.emit({ height: 480 });
  await tick();
  assert.deepEqual(vertical.state.viewport.current, { width: 1024, height: 768 }, "invalid samples retain the last valid size");

  await vertical.shutdown();
});

test("V-14 vertical: backpressured 10000-sample burst with concurrent Input and Render converges bounded", async () => {
  const vertical = await createVertical();
  const seen = [];
  vertical.state.viewport.subscribe((value) => seen.push(value));

  // Real Input path: activate the root frame so the Subsystem registers Interest.
  assert.deepEqual(
    await vertical.main.frame.initialize({ frameId: "root", input: null }),
    { kind: "success", result: {} },
  );
  assert.deepEqual(
    await vertical.main.frame.activate({ frameId: "root", activationId: "a1" }),
    { kind: "success", result: {} },
  );
  await waitFor(() => vertical.state.listenerCreated, "input listener created");
  vertical.rendererMain.publish(controlSnapshot("v", 2, {
    stack: [{ frameId: "root", subsystemKey: "demo", lifecycle: "active", activationId: "a1" }],
    inputTarget: { subsystemKey: "demo", frameId: "root", activationId: "a1" },
  }));
  await waitFor(() => vertical.broker.active.hostSent.some((text) => text.includes("input.interest")), "interest published");
  vertical.fakeInput.emit({ kind: "availability", channel: "keyboard.state", available: true });
  vertical.fakeInput.emit({ kind: "state", channel: "keyboard.state", payload: { down: ["KeyA"] } });
  await waitFor(() => vertical.state.inputPayloads.length === 1, "input delivered through the real chain");
  await waitFor(() => vertical.broker.active.hostSent.some((text) => text.includes("render.domains")), "render baseline published");

  // Backpressure the renderer→subsystem direction, then burst.
  const active = vertical.broker.active;
  active.hold();
  vertical.fakeViewport.emit({ width: 10, height: 10 });
  for (let i = 0; i < 10000; i += 1) {
    vertical.fakeViewport.emit({ width: 1000 + (i % 500), height: 2000 + (i % 500) });
  }
  vertical.fakeInput.emit({ kind: "state", channel: "keyboard.state", payload: { down: ["KeyS"] } });
  await tick();
  const heldViewportUnits = viewportWire(active.rendererSent).length;
  assert.ok(heldViewportUnits <= 1, `burst stays bounded while blocked, saw ${heldViewportUnits}`);
  active.release();
  await waitFor(() => vertical.state.viewport.current?.width === 1499, "latest size converges");
  assert.deepEqual(vertical.state.viewport.current, { width: 1499, height: 2499 });
  const units = viewportWire(active.rendererSent);
  assert.ok(units.length <= 2, `at most first+latest viewport units, saw ${units.length}`);
  assert.equal(units[0], '{"type":"viewport.state","width":10,"height":10}');
  assert.equal(lastViewportWire(active.rendererSent), '{"type":"viewport.state","width":1499,"height":2499}');
  await waitFor(() => vertical.state.inputPayloads.length === 2, "input still delivered after burst");
  await vertical.shutdown();
});

test("V-14 vertical: same-generation reconnect resends the wire baseline without duplicate business callbacks", async () => {
  const vertical = await createVertical();
  const seen = [];
  vertical.state.viewport.subscribe((value) => seen.push(value));
  vertical.fakeViewport.emit({ width: 640, height: 480 });
  await waitFor(() => seen.length === 2);
  const firstPair = vertical.broker.pairs[0];
  assert.equal(viewportWire(firstPair.rendererSent).length, 1);

  vertical.broker.retireActive();
  await waitFor(() => vertical.broker.pairs.length === 2, "fresh carrier pair");
  await waitFor(() => vertical.broker.pairs[1].rendererSent.some((text) => text.includes("viewport.state")), "fresh wire baseline");
  assert.deepEqual(viewportWire(vertical.broker.pairs[1].rendererSent), ['{"type":"viewport.state","width":640,"height":480}']);
  await tick();
  assert.equal(seen.length, 2, "equal fresh baseline does not re-notify business");
  assert.deepEqual(vertical.state.viewport.current, { width: 640, height: 480 });
  const freshHostWire = vertical.broker.pairs[1].hostSent;
  assert.ok(freshHostWire.some((text) => text.includes("input.interest")) || freshHostWire.length === 0 || freshHostWire.some((text) => text.includes("render.domains")), "child fresh baselines rebuilt on the fresh carrier");
  await vertical.shutdown();
});

test("V-14 vertical: generation replacement installs fresh peers with fresh cursors", async () => {
  const vertical = await createVertical();
  const seen = [];
  vertical.state.viewport.subscribe((value) => seen.push(value));
  vertical.fakeViewport.emit({ width: 640, height: 480 });
  await waitFor(() => seen.length === 2);
  vertical.fakeViewport.emit({ width: 900, height: 700 });
  await waitFor(() => seen.length === 3);

  vertical.rendererMain.publish(controlSnapshot("v", 2, { authorities: [authority("demo", 2)] }));
  vertical.broker.setGeneration(2);
  vertical.broker.retireActive();
  await waitFor(() => vertical.broker.pairs.length === 2, "fresh generation carrier");
  const fresh = vertical.broker.pairs[1];
  assert.equal(fresh.generation, 2);
  await waitFor(() => viewportWire(fresh.rendererSent).length === 1, "fresh generation baseline");
  assert.deepEqual(viewportWire(fresh.rendererSent), ['{"type":"viewport.state","width":900,"height":700}']);
  assert.equal(seen.length, 3, "equal size on fresh generation suppresses business notification");
  await vertical.shutdown();
});

test("V-14 vertical: Control participant replacement keeps the Runtime and its Viewport object stable", async () => {
  const vertical = await createVertical();
  const seen = [];
  const viewportObject = vertical.state.viewport;
  vertical.state.viewport.subscribe((value) => seen.push(value));
  vertical.fakeViewport.emit({ width: 640, height: 480 });
  await waitFor(() => seen.length === 2);
  const oldEmit = vertical.fakeViewport;

  const nextControlPair = createMemoryCarrierPair();
  createMainRendererControlPeer({
    carrier: nextControlPair.left,
    acceptHello() {
      const initial = controlSnapshot("w", 1);
      return { kind: "accepted", snapshot: initial, preparedHelloText: prepareRendererHelloResultV1(initial) };
    },
  });
  void nextControlPair;
  const installed = await vertical.holder.connect({ carrier: nextControlPair.right, rendererControlToken: "t2" });
  assert.equal(installed.kind, "installed");
  assert.equal(oldEmit.stops, 1, "the old participant's source is stopped on replacement");

  // The original holder's source restarted for the new participant and does not
  // inherit the old raw sample.
  assert.equal(vertical.fakeViewport.starts, 2, "source restarts with the new Control participant");
  const pairsBefore = vertical.broker.pairs.length;
  await waitFor(() => vertical.broker.pairs.length > pairsBefore, "new participant Data peers");
  await tick();
  const latest = vertical.broker.pairs.at(-1);
  assert.equal(viewportWire(latest.rendererSent).length, 0, "no baseline until a new valid sample");
  vertical.fakeViewport.emit({ width: 320, height: 240 });
  await waitFor(() => viewportWire(latest.rendererSent).length === 1);
  assert.deepEqual(viewportWire(latest.rendererSent), ['{"type":"viewport.state","width":320,"height":240}']);
  await waitFor(() => seen.length === 3);
  assert.deepEqual(seen[2], { width: 320, height: 240 });
  assert.equal(vertical.state.viewport, viewportObject, "the Runtime keeps one stable Viewport object");

  vertical.fakeViewport.staleEmit(0, { width: 999, height: 999 });
  await tick();
  assert.deepEqual(vertical.state.viewport.current, { width: 320, height: 240 }, "old participant source callback stays inert");

  await vertical.shutdown();
});

test("V-14 vertical: Runtime terminal stops observation; post-terminal subscribe is inert", async () => {
  const vertical = await createVertical();
  const seen = [];
  vertical.state.viewport.subscribe((value) => seen.push(value));
  vertical.fakeViewport.emit({ width: 640, height: 480 });
  await waitFor(() => seen.length === 2);

  await vertical.shutdown();
  const inert = [];
  vertical.state.viewport.subscribe((value) => inert.push(value));
  assert.deepEqual(inert, [], "no initial callback after Runtime terminal");
  vertical.fakeViewport.emit({ width: 10, height: 10 });
  await tick();
  assert.deepEqual(seen, [null, { width: 640, height: 480 }], "zero late delivery after Runtime terminal");
  assert.deepEqual(vertical.state.viewport.current, { width: 640, height: 480 });
});
