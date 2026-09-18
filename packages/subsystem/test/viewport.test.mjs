import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createRendererDataPeer } from "@loomrealm/data";
import { createMainRuntimeControlPeer } from "@loomrealm/runtime-control";
import { completed, defineSubsystem } from "../dist/index.js";
import { runSubsystem, SubsystemRuntimeFatalError } from "../dist/host/index.js";

const acceptedDataMessage = () => ({ kind: "accepted" });
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, message = "condition") {
  for (let attempt = 0; attempt < 200; attempt += 1) {
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

const defaultPolicy = Object.freeze({
  scheduler,
  helloDeadlineMs: 1000,
  frameDeadlineMs: 1000,
  terminalCleanupDeadlineMs: 50,
});

/**
 * Data channel broker: the trusted host acquires one carrier per fresh peer;
 * the test opens real Renderer Data peers over the paired ends.
 */
function viewportChannel() {
  const pending = [];
  const waiting = [];

  function deliver(entry) {
    const waiter = waiting.shift();
    if (waiter !== undefined) {
      waiter.cleanup();
      waiter.resolve({
        carrier: entry.pair.left,
        generation: entry.generation,
        dataProfile: entry.dataProfile,
      });
      return;
    }
    pending.push(entry);
  }

  return {
    binding: {
      acquire(signal) {
        if (signal.aborted) return Promise.reject(new Error("aborted"));
        const entry = pending.shift();
        if (entry !== undefined) {
          return Promise.resolve({
            carrier: entry.pair.left,
            generation: entry.generation,
            dataProfile: entry.dataProfile,
          });
        }
        return new Promise((resolve, reject) => {
          const waiter = {
            resolve,
            cleanup() { signal.removeEventListener("abort", onAbort); },
          };
          const onAbort = () => {
            const index = waiting.indexOf(waiter);
            if (index >= 0) waiting.splice(index, 1);
            reject(new Error("aborted"));
          };
          signal.addEventListener("abort", onAbort, { once: true });
          waiting.push(waiter);
        });
      },
    },
    open(subsystemKey = "demo", generation = 1, dataProfile = "loomrealm.renderer-data/1") {
      const pair = createMemoryCarrierPair();
      const peer = createRendererDataPeer({
        binding: { carrier: pair.right, subsystemKey, generation, dataProfile },
        handlers: {
          onInputInterest: acceptedDataMessage,
          onRenderDomains: acceptedDataMessage,
          onRenderSnapshot: acceptedDataMessage,
          onRenderPatch: acceptedDataMessage,
          onRenderEvent: acceptedDataMessage,
        },
      });
      deliver({ pair, generation, dataProfile });
      return { peer, pair };
    },
  };
}

async function createViewportSession(definition, channel, { waitReady = true } = {}) {
  const pair = createMemoryCarrierPair();
  const statuses = [];
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
      onStatus(status) {
        statuses.push(status);
      },
      onFrameCall() {
        return { kind: "success", result: {} };
      },
      onFrameReturn() {
        return { kind: "success", result: {} };
      },
    },
  });
  const runtime = runSubsystem({
    definition,
    runtimeControl: {
      async acquire() {
        return pair.right;
      },
    },
    runtimePolicy: defaultPolicy,
    launch: {
      subsystemKey: "demo",
      bootstrapToken: "secret",
      controlProtocolVersions: [1],
    },
    data: channel.binding,
  });
  void runtime.catch(() => {});
  assert.deepEqual(await main.identified, {
    kind: "identified",
    key: "demo",
    protocolVersion: 1,
  });
  if (waitReady) {
    await waitFor(() => statuses.some((status) => status.state === "ready"), "ready status");
  }
  return { main, runtime, statuses };
}

async function shutdown(session) {
  assert.deepEqual(await session.main.control.shutdown({ reason: "session-end" }), {
    kind: "success",
    result: {},
  });
  await session.runtime;
}

// ---------------------------------------------------------------------------
// V-09 — retained size, synchronous initial subscribe, getter ordering
// ---------------------------------------------------------------------------

test("V-09 live subscribe is synchronous, getter updates first, equal sizes suppress, values are frozen", async () => {
  const channel = viewportChannel();
  let scopeRef;
  const session = await createViewportSession(
    defineSubsystem((scope) => {
      scopeRef = scope;
      assert.equal(scope.viewport.current, null, "initial current is null before any sample");
      return { frame: () => completed(null) };
    }),
    channel,
  );

  const viewport = scopeRef.viewport;
  const events = [];
  const unsubscribe = viewport.subscribe((value) => {
    events.push({ value, getter: viewport.current });
  });
  assert.equal(events.length, 1, "live subscribe delivers synchronously once");
  assert.deepEqual(events[0].value, null);
  assert.deepEqual(events[0].getter, null);

  const { peer } = channel.open();
  peer.viewport.publishState({ type: "viewport.state", width: 640, height: 480 });
  await waitFor(() => events.length === 2, "first size");
  assert.deepEqual(events[1].value, { width: 640, height: 480 });
  assert.deepEqual(events[1].getter, { width: 640, height: 480 }, "getter is updated before callback");
  assert.equal(Object.isFrozen(events[1].value), true);

  peer.viewport.publishState({ type: "viewport.state", width: 640, height: 480 });
  await tick();
  assert.equal(events.length, 2, "normalized equal sizes do not re-notify");

  const snapshot = viewport.current;
  const late = [];
  viewport.subscribe((value) => late.push(value));
  assert.deepEqual(late, [{ width: 640, height: 480 }], "late subscriber receives convergence value");
  assert.notEqual(viewport.current, snapshot, "getter hands out detached copies");

  unsubscribe();
  unsubscribe();
  assert.equal(events.length, 2, "unsubscribe is idempotent");
  await shutdown(session);
});

// ---------------------------------------------------------------------------
// V-10 — containment and reentrancy
// ---------------------------------------------------------------------------

test("V-10 listener throw/reject are contained, and subscribe/unsubscribe inside a callback is consistent", async () => {
  const channel = viewportChannel();
  let scopeRef;
  const session = await createViewportSession(
    defineSubsystem((scope) => {
      scopeRef = scope;
      return { frame: () => completed(null) };
    }),
    channel,
  );
  const viewport = scopeRef.viewport;
  const order = [];
  viewport.subscribe(() => {
    order.push("thrower");
    throw new Error("listener boom");
  });
  viewport.subscribe(() => {
    order.push("rejecting");
    return Promise.reject(new Error("listener rejection"));
  });
  const inner = [];
  let unsubscribeInner = null;
  let reentrantArmed = false;
  let injected = false;
  viewport.subscribe((value) => {
    if (!reentrantArmed || value === null || injected) return;
    injected = true;
    unsubscribeInner = viewport.subscribe((innerValue) => inner.push(innerValue?.width ?? null));
    unsubscribeNormal();
  });
  const normal = (value) => order.push(value === null ? "normal:null" : `normal:${value.width}`);
  const unsubscribeNormal = viewport.subscribe(normal);
  order.length = 0;

  const { peer } = channel.open();
  peer.viewport.publishState({ type: "viewport.state", width: 640, height: 480 });
  await waitFor(() => order.includes("normal:640"), "normal listener delivery");
  assert.deepEqual(order, ["thrower", "rejecting", "normal:640"]);
  await tick();

  reentrantArmed = true;
  peer.viewport.publishState({ type: "viewport.state", width: 800, height: 600 });
  await waitFor(() => inner.length === 1, "newly subscribed observer receives only its own synchronous initial");
  await tick();
  assert.deepEqual(inner, [800], "reentrant subscriber is not duplicated by the ongoing broadcast");
  assert.equal(order.includes("normal:800"), false, "unsubscribed-inside-callback observer receives no broadcast");
  unsubscribeInner();
  unsubscribeInner();
  await shutdown(session);
});

// ---------------------------------------------------------------------------
// V-11 — Data loss retention, fresh equal baseline, current-peer routing
// ---------------------------------------------------------------------------

test("V-11 Data loss retains the last size; a fresh equal baseline suppresses and a change updates", async () => {
  const channel = viewportChannel();
  let scopeRef;
  const session = await createViewportSession(
    defineSubsystem((scope) => {
      scopeRef = scope;
      return { frame: () => completed(null) };
    }),
    channel,
  );
  const viewport = scopeRef.viewport;
  const events = [];
  viewport.subscribe((value) => events.push(value));

  const first = channel.open();
  first.peer.viewport.publishState({ type: "viewport.state", width: 640, height: 480 });
  await waitFor(() => events.length === 2, "first baseline");
  assert.deepEqual(events[1], { width: 640, height: 480 });

  await first.peer.close();
  await tick();
  assert.deepEqual(viewport.current, { width: 640, height: 480 }, "Data loss retains the last valid size");
  assert.equal(events.length, 2, "Data loss never notifies null");

  const second = channel.open();
  second.peer.viewport.publishState({ type: "viewport.state", width: 640, height: 480 });
  await tick();
  assert.equal(events.length, 2, "fresh carrier equal baseline does not re-notify business");
  assert.deepEqual(viewport.current, { width: 640, height: 480 });

  second.peer.viewport.publishState({ type: "viewport.state", width: 1280, height: 720 });
  await waitFor(() => events.length === 3, "different fresh size updates");
  assert.deepEqual(events[2], { width: 1280, height: 720 });
  await shutdown(session);
});

// ---------------------------------------------------------------------------
// V-12 — Runtime terminal cleanup and post-terminal inertness
// ---------------------------------------------------------------------------

test("V-12 graceful shutdown closes the manager: old listeners silent, new subscribe inert", async () => {
  const channel = viewportChannel();
  let scopeRef;
  const session = await createViewportSession(
    defineSubsystem((scope) => {
      scopeRef = scope;
      return { frame: () => completed(null) };
    }),
    channel,
  );
  const viewport = scopeRef.viewport;
  const events = [];
  viewport.subscribe((value) => events.push(value));
  const { peer } = channel.open();
  peer.viewport.publishState({ type: "viewport.state", width: 640, height: 480 });
  await waitFor(() => events.length === 2);

  await shutdown(session);
  assert.equal(scopeRef.signal.aborted, true, "Runtime abort signal is independent evidence");
  assert.equal(viewport.current, null, "terminal closes the retained manager");

  const late = [];
  const unsubscribe = viewport.subscribe((value) => late.push(value));
  assert.deepEqual(late, [], "post-terminal subscribe performs no initial callback");
  unsubscribe();
  unsubscribe();
  peer.viewport.publishState({ type: "viewport.state", width: 999, height: 999 });
  await tick();
  assert.deepEqual(late, []);
  assert.equal(events.length, 2, "old listeners receive no late delivery");
});

test("V-12 fatal Runtime terminal also closes the manager and never auto-fails Frame", async () => {
  const channel = viewportChannel();
  let scopeRef;
  const session = await createViewportSession(
    defineSubsystem((scope) => {
      scopeRef = scope;
      return {
        frame: () => completed(null),
        initialize() {
          throw new Error("initialize failed");
        },
      };
    }),
    channel,
    { waitReady: false },
  );
  await assert.rejects(session.runtime, SubsystemRuntimeFatalError);
  assert.equal(session.statuses.some((status) => status.state === "failed"), true);
  const late = [];
  scopeRef.viewport.subscribe((value) => late.push(value));
  assert.deepEqual(late, []);
  assert.equal(scopeRef.viewport.current, null);
});

// ---------------------------------------------------------------------------
// V-13 — independence from Frame/Input/Render authority
// ---------------------------------------------------------------------------

test("V-13 viewport updates never mutate Frame, Input, RenderDomain or Runtime failure authority", async () => {
  const channel = viewportChannel();
  let scopeRef;
  let shutdownCalls = 0;
  const session = await createViewportSession(
    defineSubsystem((scope) => {
      scopeRef = scope;
      scope.createRenderDomain({ zIndex: 0, roots: [] });
      return {
        frame: () => completed(null),
        shutdown() { shutdownCalls += 1; },
      };
    }),
    channel,
  );
  const viewport = scopeRef.viewport;
  const { peer } = channel.open();
  const events = [];
  viewport.subscribe((value) => events.push(value));
  peer.viewport.publishState({ type: "viewport.state", width: 320, height: 240 });
  peer.viewport.publishState({ type: "viewport.state", width: 640, height: 480 });
  await waitFor(() => events.length === 3, "two viewport updates");
  assert.equal(scopeRef.signal.aborted, false);
  assert.equal(session.statuses.some((status) => status.state === "failed"), false);
  assert.equal(session.statuses.filter((status) => status.state === "ready").length, 1);
  peer.viewport.publishState({ type: "viewport.state", width: 0, height: 1 });
  await tick();
  assert.equal(viewport.current.width, 640, "invalid local offer never mutates retained size");
  await shutdown(session);
  assert.equal(shutdownCalls, 1, "viewport never owns Runtime lifecycle");
});
