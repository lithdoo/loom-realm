/**
 * V-14 / P3-09 real architecture vertical — independent scenarios.
 *
 * Chain (real at every seam except physical window sampling):
 *   fake viewport source
 *   → real RendererControlHolder
 *   → real RendererDataPeer
 *   → real MessageCarrier
 *   → real SubsystemDataPeer
 *   → real runSubsystem host
 *   → scope.viewport
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
import { completed, defineSubsystem } from "@loomrealm/subsystem";
import { runSubsystem } from "@loomrealm/subsystem/host";

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

function createFakeViewportSource(options = {}) {
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
        if (typeof options.onStart === "function") options.onStart(onEmit);
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
      admissions: 0,
      maxActive: 0,
      active: 0,
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
        entry.admissions += 1;
        entry.active += 1;
        entry.maxActive = Math.max(entry.maxActive, entry.active);
        try {
          await entry.gate;
          log.push(text);
          return await rawSend(text);
        } finally {
          entry.active -= 1;
        }
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
      acquire(_subsystemKey, generationRequested) {
        const offer = hostOffers.find((candidate) =>
          candidate.generation === generationRequested && !candidate.claimed);
        if (offer !== undefined) {
          offer.claimed = true;
          return Promise.resolve(offer.pair.left);
        }
        return new Promise((resolve) => {
          rendererDemands.push({ generation: generationRequested, resolve });
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
        return Promise.resolve({
          carrier: entry.pair.right,
          generation,
          dataProfile: PROFILE,
        });
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

const authority = (subsystemKey = "demo", generation = 1) => ({
  subsystemKey,
  generation,
  dataProfile: PROFILE,
});

function controlSnapshot(sessionId, revision, options = {}) {
  const authorities = options.authorities ?? [authority()];
  return {
    sessionId,
    revision,
    runtimes: authorities.map(({ subsystemKey }) => ({ subsystemKey, state: "ready" })),
    stack: options.stack ?? [],
    inputTarget: options.inputTarget ?? null,
    dataAuthorities: authorities,
  };
}

async function createVertical(sourceOptions = {}) {
  const controlPair = createMemoryCarrierPair();
  const statuses = [];
  const main = createMainRuntimeControlPeer({
    carrier: controlPair.left,
    scheduler,
    frameDeadlineMs: 1000,
    shutdownDeadlineMs: 1000,
    authenticateHello: (params) =>
      params.key === "demo" && params.bootstrapToken === "secret"
        ? { kind: "accepted" }
        : { kind: "rejected", code: "BOOTSTRAP_AUTHENTICATION_FAILED" },
    handlers: {
      onStatus(status) { statuses.push(status); },
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
  };

  const runtime = runSubsystem({
    definition: defineSubsystem((scope) => {
      state.scope = scope;
      state.viewport = scope.viewport;
      scope.createRenderDomain({ zIndex: 1, roots: [] });
      return {
        frame(frame) {
          const listener = scope.createInputListener({
            frame,
            channels: ["keyboard.state"],
          });
          listener.on("keyboard.state", (payload) => state.inputPayloads.push(payload));
          state.listenerCreated = true;
          return new Promise(() => {});
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
      const initial = controlSnapshot("vert", 1);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });

  const fakeInput = createFakeInputSource();
  const fakeViewport = createFakeViewportSource(sourceOptions);
  const holder = createRendererControlHolder(
    broker.rendererBinding,
    fakeInput.source,
    fakeViewport.source,
  );
  const installed = await holder.connect({
    carrier: rendererControlPair.right,
    rendererControlToken: "t",
  });
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
    async shutdown() {
      assert.deepEqual(
        await main.control.shutdown({ reason: "session-end" }),
        { kind: "success", result: {} },
      );
      await runtime;
    },
  };
}

const viewportWire = (texts) => texts.filter((text) => text.includes('"type":"viewport.state"'));

test("V-14: sync initial sample inside start(emit) + latest-only staging; deferred first sample", async () => {
  {
    const vertical = await createVertical({
      onStart(emit) {
        emit({ width: 100, height: 100 });
        emit({ width: 640.9, height: 480.9 });
      },
    });
    const seen = [];
    vertical.state.viewport.subscribe((value) => seen.push(value));
    await waitFor(() => vertical.state.viewport.current !== null, "sync bootstrap");
    assert.deepEqual(vertical.state.viewport.current, { width: 640, height: 480 });
    assert.ok(seen.some((v) => v && v.width === 640));
    const wire = viewportWire(vertical.broker.pairs[0].rendererSent);
    assert.deepEqual(wire, ['{"type":"viewport.state","width":640,"height":480}']);
    await vertical.shutdown();
  }
  {
    const vertical = await createVertical();
    const seen = [];
    vertical.state.viewport.subscribe((value) => seen.push(value));
    assert.equal(vertical.state.viewport.current, null);
    assert.deepEqual(viewportWire(vertical.broker.pairs[0].rendererSent), []);
    vertical.fakeViewport.emit({ width: 800.9, height: 600.4 });
    await waitFor(() => vertical.state.viewport.current !== null, "deferred first");
    assert.deepEqual(vertical.state.viewport.current, { width: 800, height: 600 });
    assert.deepEqual(
      viewportWire(vertical.broker.pairs[0].rendererSent),
      ['{"type":"viewport.state","width":800,"height":600}'],
    );
    await vertical.shutdown();
  }
});

test("V-14: blocked writer + 10000 size changes with real Input/Render; admission/wire/concurrency/FIFO", async () => {
  const vertical = await createVertical();
  const seen = [];
  vertical.state.viewport.subscribe((value) => seen.push(value));

  assert.deepEqual(
    await vertical.main.frame.initialize({ frameId: "root", input: null }),
    { kind: "success", result: {} },
  );
  assert.deepEqual(
    await vertical.main.frame.activate({ frameId: "root", activationId: "a1" }),
    { kind: "success", result: {} },
  );
  await waitFor(() => vertical.state.listenerCreated, "input listener");
  await vertical.rendererMain.publish(controlSnapshot("vert", 2, {
    stack: [{
      frameId: "root",
      subsystemKey: "demo",
      lifecycle: "active",
      activationId: "a1",
    }],
    inputTarget: { subsystemKey: "demo", frameId: "root", activationId: "a1" },
  }));
  await waitFor(
    () => vertical.broker.active.hostSent.some((text) => text.includes("input.interest")),
    "interest",
  );
  vertical.fakeInput.emit({ kind: "availability", channel: "keyboard.state", available: true });
  vertical.fakeInput.emit({
    kind: "state",
    channel: "keyboard.state",
    payload: { down: ["KeyA"] },
  });
  await waitFor(() => vertical.state.inputPayloads.length === 1, "input delivered");
  await waitFor(
    () => vertical.broker.active.hostSent.some((text) => text.includes("render.domains")),
    "render domains",
  );

  const active = vertical.broker.active;
  active.hold();
  const admissionsBeforeBurst = active.admissions;
  vertical.fakeViewport.emit({ width: 10, height: 10 });
  await waitFor(() => active.admissions === admissionsBeforeBurst + 1, "first viewport admitted while held");
  assert.equal(viewportWire(active.rendererSent).length, 0, "held send has not completed wire yet");

  for (let i = 0; i < 10000; i += 1) {
    vertical.fakeViewport.emit({ width: 1000 + (i % 500), height: 2000 + (i % 500) });
  }
  vertical.fakeInput.emit({
    kind: "state",
    channel: "keyboard.state",
    payload: { down: ["KeyS"] },
  });
  await tick();
  const admissionsDuringHold = active.admissions - admissionsBeforeBurst;
  assert.ok(
    admissionsDuringHold <= 2,
    `viewport admissions while blocked stay ≤1 in-flight + 1 pending path, saw ${admissionsDuringHold}`,
  );
  assert.equal(active.maxActive, 1, "physical concurrent send ≤ 1 while held");
  assert.equal(viewportWire(active.rendererSent).length, 0);

  active.release();
  await waitFor(() => vertical.state.viewport.current?.width === 1499, "latest converges");
  assert.deepEqual(vertical.state.viewport.current, { width: 1499, height: 2499 });
  const units = viewportWire(active.rendererSent);
  assert.ok(units.length <= 2, `at most first+latest viewport wire units, saw ${units.length}`);
  assert.equal(units[0], '{"type":"viewport.state","width":10,"height":10}');
  assert.equal(units.at(-1), '{"type":"viewport.state","width":1499,"height":2499}');
  assert.equal(active.maxActive, 1);
  await waitFor(() => vertical.state.inputPayloads.length === 2, "input after burst");
  assert.ok(seen.some((v) => v && v.width === 1499));
  await vertical.shutdown();
});

test("V-14: same-generation reconnect resends wire baseline without duplicate business callback", async () => {
  const vertical = await createVertical();
  const seen = [];
  vertical.state.viewport.subscribe((value) => seen.push(value));
  vertical.fakeViewport.emit({ width: 640, height: 480 });
  await waitFor(() => seen.some((v) => v && v.width === 640), "first size");
  const before = seen.length;
  assert.equal(viewportWire(vertical.broker.pairs[0].rendererSent).length, 1);

  vertical.broker.retireActive();
  await waitFor(() => vertical.broker.pairs.length === 2, "fresh pair");
  await waitFor(
    () => viewportWire(vertical.broker.pairs[1].rendererSent).length === 1,
    "fresh wire baseline",
  );
  assert.deepEqual(
    viewportWire(vertical.broker.pairs[1].rendererSent),
    ['{"type":"viewport.state","width":640,"height":480}'],
  );
  await tick();
  assert.equal(seen.length, before, "equal fresh baseline does not re-notify");
  assert.deepEqual(vertical.state.viewport.current, { width: 640, height: 480 });
  await vertical.shutdown();
});

test("V-14: new generation installs fresh peers with independent cursors", async () => {
  const vertical = await createVertical();
  const seen = [];
  vertical.state.viewport.subscribe((value) => seen.push(value));
  vertical.fakeViewport.emit({ width: 640, height: 480 });
  await waitFor(() => seen.some((v) => v && v.width === 640));
  vertical.fakeViewport.emit({ width: 900, height: 700 });
  await waitFor(() => seen.some((v) => v && v.width === 900));
  const before = seen.length;

  await vertical.rendererMain.publish(controlSnapshot("vert", 2, {
    authorities: [authority("demo", 2)],
  }));
  vertical.broker.setGeneration(2);
  vertical.broker.retireActive();
  await waitFor(() => vertical.broker.pairs.length === 2, "gen2 pair");
  const fresh = vertical.broker.pairs[1];
  assert.equal(fresh.generation, 2);
  await waitFor(() => viewportWire(fresh.rendererSent).length === 1, "gen2 baseline");
  assert.deepEqual(
    viewportWire(fresh.rendererSent),
    ['{"type":"viewport.state","width":900,"height":700}'],
  );
  assert.equal(seen.length, before, "equal size on fresh generation suppresses business notify");
  await vertical.shutdown();
});

test("V-14: Control participant replace fences old source/peer; Viewport object identity stable", async () => {
  const vertical = await createVertical();
  const seen = [];
  const viewportObject = vertical.state.viewport;
  vertical.state.viewport.subscribe((value) => seen.push(value));
  vertical.fakeViewport.emit({ width: 640, height: 480 });
  await waitFor(() => seen.some((v) => v && v.width === 640));

  const nextControlPair = createMemoryCarrierPair();
  createMainRendererControlPeer({
    carrier: nextControlPair.left,
    acceptHello() {
      const initial = controlSnapshot("vert-b", 1);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });
  const pairsBefore = vertical.broker.pairs.length;
  const installed = await vertical.holder.connect({
    carrier: nextControlPair.right,
    rendererControlToken: "t2",
  });
  assert.equal(installed.kind, "installed");
  assert.ok(vertical.fakeViewport.stops >= 1);
  assert.equal(vertical.fakeViewport.starts, 2);

  await waitFor(() => vertical.broker.pairs.length > pairsBefore, "new participant peers");
  await tick();
  const latest = vertical.broker.pairs.at(-1);
  assert.equal(viewportWire(latest.rendererSent).length, 0, "no inherited baseline");
  vertical.fakeViewport.staleEmit(0, { width: 999, height: 999 });
  await tick();
  assert.equal(viewportWire(latest.rendererSent).length, 0, "old source callback inert");

  vertical.fakeViewport.emit({ width: 320, height: 240 });
  await waitFor(() => viewportWire(latest.rendererSent).length === 1);
  assert.deepEqual(
    viewportWire(latest.rendererSent),
    ['{"type":"viewport.state","width":320,"height":240}'],
  );
  await waitFor(() => seen.some((v) => v && v.width === 320));
  assert.equal(vertical.state.viewport, viewportObject);
  await vertical.shutdown();
});

test("V-14: Runtime terminal — no new callbacks; subscribe inert; current retained", async () => {
  const vertical = await createVertical();
  const seen = [];
  vertical.state.viewport.subscribe((value) => seen.push(value));
  vertical.fakeViewport.emit({ width: 640, height: 480 });
  await waitFor(() => seen.some((v) => v && v.width === 640));
  const snapshotSeen = seen.map((v) => (v === null ? null : { ...v }));

  await vertical.shutdown();
  const inert = [];
  vertical.state.viewport.subscribe((value) => inert.push(value));
  assert.deepEqual(inert, []);
  vertical.fakeViewport.emit({ width: 10, height: 10 });
  await tick();
  assert.deepEqual(
    seen.map((v) => (v === null ? null : { ...v })),
    snapshotSeen,
  );
  assert.deepEqual(vertical.state.viewport.current, { width: 640, height: 480 });
});
