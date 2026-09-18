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

const DATA_PROFILE = "loomrealm.renderer-data/1";
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, message = "condition") {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(`timed out waiting for ${message}`);
}

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

const runtimePolicy = Object.freeze({
  scheduler,
  helloDeadlineMs: 1000,
  frameDeadlineMs: 1000,
  terminalCleanupDeadlineMs: 100,
});

function authority(subsystemKey, generation = 1) {
  return { subsystemKey, generation, dataProfile: DATA_PROFILE };
}

function controlSnapshot(sessionId, revision, dataAuthorities, active) {
  return {
    sessionId,
    revision,
    runtimes: dataAuthorities.map(({ subsystemKey }) => ({ subsystemKey, state: "ready" })),
    stack: active
      ? [{ frameId: "root", subsystemKey: "demo", lifecycle: "active", activationId: "a1" }]
      : [],
    inputTarget: active
      ? { subsystemKey: "demo", frameId: "root", activationId: "a1" }
      : null,
    dataAuthorities,
  };
}

/**
 * True architecture vertical:
 * fake viewport/input source → real RendererControlHolder → real RendererDataPeer
 * → real MessageCarrier → real SubsystemDataPeer → real Subsystem host → scope.viewport.
 */
function createVertical() {
  const recordedToSubsystem = [];
  const recordedToRenderer = [];

  const viewportObservations = [];
  const viewportSource = {
    start(emit) {
      viewportSource.starts += 1;
      viewportObservations.push(emit);
      return () => {
        viewportSource.stops += 1;
      };
    },
    starts: 0,
    stops: 0,
  };
  const inputSource = {
    start(emit) {
      inputSource.starts += 1;
      inputSource.emit = emit;
      return () => {
        inputSource.stops += 1;
      };
    },
    starts: 0,
    stops: 0,
    emit: null,
  };

  const dataGate = { held: false, waiters: [] };
  function holdData(held) {
    dataGate.held = held;
    if (!held) {
      for (const resolve of dataGate.waiters.splice(0)) resolve();
    }
  }

  function wrapForward(inner, sink, gate) {
    return {
      closed: inner.closed,
      async send(text) {
        while (gate.held) await new Promise((resolve) => gate.waiters.push(resolve));
        sink.push(text);
        return inner.send(text);
      },
      messages: () => inner.messages(),
      close: () => inner.close(),
    };
  }

  let authorities = [authority("demo")];
  let activeInput = false;
  let participant = null;

  function openParticipant(sessionId) {
    const pair = createMemoryCarrierPair();
    const main = createMainRendererControlPeer({
      carrier: pair.left,
      acceptHello() {
        const initial = controlSnapshot(
          sessionId,
          1,
          authorities.map((value) => ({ ...value })),
          activeInput,
        );
        return {
          kind: "accepted",
          snapshot: initial,
          preparedHelloText: prepareRendererHelloResultV1(initial),
        };
      },
    });
    return { pair, main, sessionId };
  }
  participant = openParticipant("session-a");

  const pendingEntries = [];
  const subsystemWaiters = [];
  let latestEntry = null;
  function deliverDataEntry(entry) {
    const waiter = subsystemWaiters.shift();
    if (waiter !== undefined) waiter.resolve(entry);
    else pendingEntries.push(entry);
  }

  const inputStates = [];
  let scopeRef = null;
  const scopeEvents = [];
  let frameStarted = false;
  let releaseFrame = null;
  const frameHold = new Promise((resolve) => { releaseFrame = resolve; });

  const definition = defineSubsystem((scope) => {
    scopeRef = scope;
    scope.viewport.subscribe((value) => scopeEvents.push(value));
    return {
      frame(frame) {
        frameStarted = true;
        const listener = scope.createInputListener({ frame, channels: ["keyboard.state"] });
        listener.on("keyboard.state", (payload) => inputStates.push(payload));
        return frameHold.then(() => completed(null));
      },
    };
  });

  const rendererDataBinding = {
    acquire(_subsystemKey, generation, dataProfile) {
      const pair = createMemoryCarrierPair();
      const entry = { pair, generation, dataProfile };
      latestEntry = entry;
      deliverDataEntry(entry);
      return wrapForward(pair.right, recordedToSubsystem, dataGate);
    },
  };

  const subsystemDataBinding = {
    acquire(signal) {
      if (signal.aborted) return Promise.reject(new Error("aborted"));
      const entry = pendingEntries.shift() ?? null;
      if (entry !== null) {
        return Promise.resolve(toResult(entry));
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve: (value) => resolve(toResult(value)),
        };
        const onAbort = () => {
          const index = subsystemWaiters.indexOf(waiter);
          if (index >= 0) subsystemWaiters.splice(index, 1);
          reject(new Error("aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        subsystemWaiters.push(waiter);
      });
    },
  };

  function toResult(entry) {
    return {
      carrier: wrapForward(entry.pair.left, recordedToRenderer, { held: false, waiters: [] }),
      generation: entry.generation,
      dataProfile: entry.dataProfile,
    };
  }

  const runtimePair = createMemoryCarrierPair();
  const statuses = [];
  const runtimeMain = createMainRuntimeControlPeer({
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
      onFrameCall() { return { kind: "success", result: {} }; },
      onFrameReturn() { return { kind: "success", result: {} }; },
    },
  });

  const runtime = runSubsystem({
    definition,
    runtimeControl: { async acquire() { return runtimePair.right; } },
    runtimePolicy,
    launch: { subsystemKey: "demo", bootstrapToken: "secret", controlProtocolVersions: [1] },
    data: subsystemDataBinding,
  });
  void runtime.catch(() => {});

  const holder = createRendererControlHolder(rendererDataBinding, inputSource, viewportSource);

  const api = {
    recordedToSubsystem,
    recordedToRenderer,
    viewportSource,
    viewportObservations,
    inputSource,
    scopeEvents,
    inputStates,
    statuses,
    runtimeMain,
    frameStarted: () => frameStarted,
    holdData,
    get scope() { return scopeRef; },
    get runtime() { return runtime; },
    get holder() { return holder; },
    emitViewport(sample) { viewportObservations[viewportObservations.length - 1](sample); },
    emitInput(change) { inputSource.emit(change); },
    async connect() {
      const result = await holder.connect({
        carrier: participant.pair.right,
        rendererControlToken: participant.sessionId,
      });
      assert.deepEqual(await runtimeMain.identified, { kind: "identified", key: "demo", protocolVersion: 1 });
      await waitFor(() => statuses.some((status) => status.state === "ready"), "subsystem ready");
      return result;
    },
    async replaceParticipant(sessionId) {
      participant = openParticipant(sessionId);
      return api.connect();
    },
    publishControlUpdate(revision, active) {
      activeInput = active;
      participant.main.publish(
        controlSnapshot(
          participant.sessionId,
          revision,
          authorities.map((value) => ({ ...value })),
          active,
        ),
      );
    },
    publishGeneration(generation) {
      authorities = [authority("demo", generation)];
      activeInput = false;
      participant.main.publish(
        controlSnapshot(participant.sessionId, 2, authorities.map((value) => ({ ...value })), false),
      );
    },
    dropDataPeer() {
      latestEntry?.pair.lose(new Error("vertical reconnect"));
    },
    async shutdown() {
      const reply = await runtimeMain.control.shutdown({ reason: "session-end" });
      assert.deepEqual(reply, { kind: "success", result: {} });
      await runtime;
    },
  };
  return api;
}

function parseUnits(recorded) {
  return recorded.map((text) => JSON.parse(text));
}

function viewportUnits(vertical) {
  return parseUnits(vertical.recordedToSubsystem).filter(({ type }) => type === "viewport.state");
}

// ---------------------------------------------------------------------------
// P3-09 / V-14 — first, equal, changed, invalid samples over the real chain
// ---------------------------------------------------------------------------

test("P3-09/V-14 real chain delivers first size, suppresses equal, filters invalid, and updates changes", async () => {
  const vertical = createVertical();
  const installed = await vertical.connect();
  assert.equal(installed.kind, "installed");
  await waitFor(() => vertical.scope !== null, "definition scope");
  assert.equal(vertical.scope.viewport.current, null, "no synthetic size before any sample");
  assert.deepEqual(vertical.scopeEvents, [null]);

  vertical.emitViewport({ width: 640.9, height: 480.9 });
  await waitFor(() => vertical.scopeEvents.length === 2, "first normalized size reaches scope");
  assert.deepEqual(vertical.scope.viewport.current, { width: 640, height: 480 });

  vertical.emitViewport({ width: 640.9, height: 480.9 });
  vertical.emitViewport({ width: 0, height: 480 });
  vertical.emitViewport({ width: Number.NaN, height: 480 });
  await tick();
  assert.equal(vertical.scopeEvents.length, 2, "equal and invalid observations stay silent");

  vertical.emitViewport({ width: 1280.7, height: 720.2 });
  await waitFor(() => vertical.scopeEvents.length === 3, "changed size reaches scope");
  assert.deepEqual(vertical.scopeEvents[2], { width: 1280, height: 720 });

  assert.deepEqual(
    viewportUnits(vertical).map(({ width, height }) => [width, height]),
    [[640, 480], [1280, 720]],
    "wire evidence: exactly the distinct normalized sizes transited the real carrier",
  );
  await vertical.shutdown();
});

// ---------------------------------------------------------------------------
// P3-05 / P3-09 — 10000 burst under blocked carrier backpressure
// ---------------------------------------------------------------------------

test("P3-05/P3-09 10000-sample burst under blocked carrier converges to the latest without unbounded wire units", async () => {
  const vertical = createVertical();
  await vertical.connect();
  await waitFor(() => vertical.scope !== null);
  vertical.scope.createRenderDomain({ zIndex: 0, roots: [] });
  vertical.emitViewport({ width: 1, height: 1 });
  await waitFor(() => vertical.scope.viewport.current?.width === 1, "primed baseline over the real chain");

  vertical.holdData(true);
  vertical.emitViewport({ width: 2, height: 2 });
  await tick();
  for (let i = 3; i <= 10_000; i += 1) {
    vertical.emitViewport({ width: i, height: i });
  }
  await tick();
  assert.equal(vertical.scope.viewport.current.width, 1, "blocked carrier cannot advance retained size");

  vertical.holdData(false);
  await waitFor(() => vertical.scope.viewport.current.width === 10_000, "latest converges after release");
  assert.deepEqual(
    viewportUnits(vertical).map(({ width }) => width),
    [1, 2, 10_000],
    "bounded viewport publication: one in-flight plus one latest pending for the whole burst",
  );
  assert.equal(vertical.statuses.some((status) => status.state === "failed"), false);
  await vertical.shutdown();
});

// ---------------------------------------------------------------------------
// P3-09 / V-14 — concurrent Input and Render traffic under viewport burst
// ---------------------------------------------------------------------------

test("P3-09/V-14 real Input and Render traffic interleave with a blocked viewport burst", async () => {
  const vertical = createVertical();
  await vertical.connect();
  await waitFor(() => vertical.scope !== null);
  vertical.scope.createRenderDomain({ zIndex: 0, roots: [] });
  assert.deepEqual(
    await vertical.runtimeMain.frame.initialize({ frameId: "root", input: null }),
    { kind: "success", result: {} },
  );
  assert.deepEqual(
    await vertical.runtimeMain.frame.activate({ frameId: "root", activationId: "a1" }),
    { kind: "success", result: {} },
  );
  await waitFor(() => vertical.frameStarted(), "frame handler");
  vertical.publishControlUpdate(2, true);
  await waitFor(
    () => parseUnits(vertical.recordedToRenderer).some(({ type }) => type === "input.interest"),
    "input interest reaches the Renderer",
  );

  vertical.emitViewport({ width: 10, height: 10 });
  await waitFor(() => vertical.scope.viewport.current?.width === 10, "primed viewport baseline");
  vertical.holdData(true);
  vertical.emitViewport({ width: 11, height: 11 });
  for (let i = 12; i <= 509; i += 1) vertical.emitViewport({ width: i, height: 10 });
  await tick();
  vertical.emitInput({ kind: "state", channel: "keyboard.state", payload: { down: [] } });
  vertical.emitInput({ kind: "availability", channel: "keyboard.state", available: true });
  await tick();
  assert.equal(vertical.inputStates.length, 0, "input waits behind the shared serialized writer");
  vertical.holdData(false);

  await waitFor(() => vertical.scope.viewport.current.width === 509, "viewport convergence");
  await waitFor(() => vertical.inputStates.length >= 1, "input state reaches the definition");
  const units = parseUnits(vertical.recordedToSubsystem);
  assert.deepEqual(
    units.filter(({ type }) => type === "viewport.state").map(({ width }) => width),
    [10, 11, 509],
  );
  assert.equal(
    parseUnits(vertical.recordedToRenderer).some(({ type }) => type === "render.domains"),
    true,
    "Render subscription baseline shares the same serialized connection",
  );
  assert.equal(units.some(({ type }) => type === "input.state"), true);
  assert.equal(vertical.statuses.some((status) => status.state === "failed"), false);
  await vertical.shutdown();
});

// ---------------------------------------------------------------------------
// P3-06 / V-14 — disconnect, generation change, participant replacement
// ---------------------------------------------------------------------------

test("P3-06/V-14 disconnect, generation change and participant replacement stay isolated", async () => {
  const vertical = createVertical();
  await vertical.connect();
  await waitFor(() => vertical.scope !== null);
  vertical.emitViewport({ width: 640, height: 480 });
  await waitFor(() => vertical.scope.viewport.current?.width === 640, "first baseline");
  assert.deepEqual(viewportUnits(vertical).map(({ width }) => width), [640]);

  // Disconnect: the fresh same-generation peer must re-send the equal wire baseline.
  vertical.dropDataPeer();
  await waitFor(() => viewportUnits(vertical).length === 2, "fresh carrier equal baseline transits");
  await tick();
  assert.deepEqual(vertical.scopeEvents.map((value) => value?.width ?? null), [null, 640]);
  assert.deepEqual(viewportUnits(vertical).map(({ width }) => width), [640, 640]);

  // Generation change: new peer, fresh baseline, no source restart.
  vertical.publishGeneration(2);
  await waitFor(() => viewportUnits(vertical).length === 3, "generation 2 baseline");
  assert.equal(vertical.viewportSource.starts, 1, "generation change never restarts the participant source");
  assert.equal(vertical.scope.viewport.current.width, 640);

  // Participant replacement: old source stops, the new participant waits for a fresh sample.
  await vertical.replaceParticipant("session-b");
  assert.equal(vertical.viewportSource.starts, 2);
  assert.equal(vertical.viewportSource.stops, 1);
  vertical.emitViewport({ width: 800, height: 600 });
  await waitFor(() => vertical.scope.viewport.current.width === 800, "new participant sample reaches scope");
  await vertical.shutdown();
});

test("V-14 old source callback and stale participant state cannot pollute the replacement", async () => {
  const vertical = createVertical();
  await vertical.connect();
  await waitFor(() => vertical.scope !== null);
  vertical.emitViewport({ width: 111, height: 222 });
  await waitFor(() => vertical.scope.viewport.current?.width === 111, "old participant baseline");
  const oldEmit = vertical.viewportObservations[0];

  await vertical.replaceParticipant("session-b");
  await tick();
  assert.equal(vertical.scope.viewport.current.width, 111, "retained size survives participant replacement");
  oldEmit({ width: 999, height: 999 });
  await tick();
  assert.equal(vertical.scope.viewport.current.width, 111, "late old source callback is fenced");
  assert.equal(
    viewportUnits(vertical).some(({ width }) => width === 999),
    false,
    "no old-participant wire publication",
  );
  vertical.emitViewport({ width: 333, height: 444 });
  await waitFor(() => vertical.scope.viewport.current.width === 333, "new participant source publishes");
  await vertical.shutdown();
});

// ---------------------------------------------------------------------------
// V-12 / V-14 — Runtime terminal and old callback fencing over the real chain
// ---------------------------------------------------------------------------

test("V-12/V-14 Runtime terminal closes scope.viewport and old observers stay silent", async () => {
  const vertical = createVertical();
  await vertical.connect();
  await waitFor(() => vertical.scope !== null);
  vertical.emitViewport({ width: 320, height: 240 });
  await waitFor(() => vertical.scope.viewport.current?.width === 320, "size before terminal");
  const scope = vertical.scope;

  await vertical.shutdown();
  assert.equal(scope.signal.aborted, true);
  const events = [];
  const unsubscribe = scope.viewport.subscribe((value) => events.push(value));
  assert.deepEqual(events, [], "post-terminal subscribe is inert without initial callback");
  unsubscribe();
  unsubscribe();
  assert.equal(scope.viewport.current, null, "manager is closed");
  vertical.emitViewport({ width: 999, height: 999 });
  await tick();
  assert.deepEqual(events, [], "no late delivery to old observers");
  assert.equal(vertical.scopeEvents.length, 2, "pre-terminal events unchanged");
});
