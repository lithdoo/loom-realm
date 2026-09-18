import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createRendererDataPeer } from "@loomrealm/data";
import { createMainRuntimeControlPeer } from "@loomrealm/runtime-control";
import {
  completed,
  defineSubsystem,
} from "../dist/index.js";
import {
  runSubsystem,
  SubsystemRuntimeFatalError,
} from "../dist/host/index.js";

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

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, message = "condition") {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function rendererDataPeer(carrier) {
  const accept = () => ({ kind: "accepted" });
  return createRendererDataPeer({
    binding: {
      carrier,
      subsystemKey: "demo",
      generation: 1,
      dataProfile: "loomrealm.renderer-data/1",
    },
    handlers: {
      onInputInterest: accept,
      onRenderDomains: accept,
      onRenderSnapshot: accept,
      onRenderPatch: accept,
      onRenderEvent: accept,
    },
  });
}

/** Real host session; Data acquisitions are gated so tests install real renderer peers. */
async function createViewportSession(definitionFactory) {
  const control = createMemoryCarrierPair();
  const statuses = [];
  const main = createMainRuntimeControlPeer({
    carrier: control.left,
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

  const requests = [];
  const runtime = runSubsystem({
    definition: definitionFactory,
    runtimeControl: {
      async acquire() { return control.right; },
    },
    runtimePolicy: defaultPolicy,
    launch: {
      subsystemKey: "demo",
      bootstrapToken: "secret",
      controlProtocolVersions: [1],
    },
    data: {
      acquire(signal) {
        const gate = deferred();
        requests.push({ signal, gate });
        return gate.promise;
      },
    },
  });
  void runtime.catch(() => {});
  await main.identified;
  await waitFor(() => statuses.some((status) => status.state === "ready"), "ready status");
  return { main, runtime, statuses, requests, control };
}

/** Install the next real renderer-side Data peer for the host's pending acquisition. */
async function installRenderer(session, index, generation = 1) {
  await waitFor(() => session.requests.length > index, `Data acquire ${index}`);
  const pair = createMemoryCarrierPair();
  session.requests[index].gate.resolve({
    carrier: pair.right,
    generation,
    dataProfile: "loomrealm.renderer-data/1",
  });
  await tick();
  return { pair, renderer: rendererDataPeer(pair.left) };
}

const publish = (renderer, width, height) =>
  renderer.viewport.publishState({ type: "viewport.state", width, height });

test("V-09 scope.viewport starts null, live subscribe is synchronous, getter leads callback, equal sizes suppressed", async () => {
  let scopeViewport = null;
  const session = await createViewportSession(
    defineSubsystem((scope) => {
      scopeViewport = scope.viewport;
      return { frame: () => completed(null) };
    }),
  );
  assert.ok(scopeViewport);
  assert.equal(scopeViewport.current, null);

  const seen = [];
  const getterAtCallback = [];
  scopeViewport.subscribe((value) => {
    getterAtCallback.push(scopeViewport.current === value);
    seen.push(value);
  });
  assert.deepEqual(seen, [null], "live subscribe delivers one synchronous initial");

  const { renderer } = await installRenderer(session, 0);
  publish(renderer, 640, 480);
  await waitFor(() => seen.length === 2);
  assert.deepEqual(seen[1], { width: 640, height: 480 });
  assert.ok(getterAtCallback.every(Boolean), "getter is already updated when the callback runs");
  assert.ok(Object.isFrozen(seen[1]), "delivered size is frozen");
  assert.throws(() => { seen[1].width = 1; }, TypeError, "delivered size is immutable");

  publish(renderer, 640, 480);
  await tick();
  assert.equal(seen.length, 2, "equal size does not re-notify");

  publish(renderer, 800, 600);
  await waitFor(() => seen.length === 3);
  assert.deepEqual(seen[2], { width: 800, height: 600 });

  const late = [];
  scopeViewport.subscribe((value) => late.push(value));
  assert.deepEqual(late, [{ width: 800, height: 600 }], "new subscriber gets its own synchronous initial");

  await session.main.control.shutdown({ reason: "session-end" });
  await session.runtime;
});

test("V-10 listener throws, rejecting thenables, reentrant subscribe/unsubscribe and idempotent unsubscribe are contained", async () => {
  let scopeViewport = null;
  const session = await createViewportSession(
    defineSubsystem((scope) => {
      scopeViewport = scope.viewport;
      return { frame: () => completed(null) };
    }),
  );
  const normal = [];
  const order = [];
  const firstUnsubscribe = scopeViewport.subscribe(() => {
    order.push("first");
    throw new Error("listener threw");
  });
  const rejecting = scopeViewport.subscribe(() => {
    order.push("rejecting");
    return Promise.reject(new Error("thenable rejected"));
  });
  const steady = scopeViewport.subscribe((value) => {
    order.push("steady");
    normal.push(value);
  });

  const { renderer } = await installRenderer(session, 0);
  publish(renderer, 640, 480);
  await waitFor(() => normal.length === 2);
  assert.deepEqual(
    order,
    ["first", "rejecting", "steady", "first", "rejecting", "steady"],
    "a throwing listener never blocks other observers",
  );
  await tick();
  // No unhandled rejection: the process would fail the suite otherwise.

  firstUnsubscribe();
  firstUnsubscribe();
  rejecting && scopeViewport.subscribe(() => {})();
  const mark = order.length;
  publish(renderer, 700, 500);
  await waitFor(() => normal.length === 3);
  assert.deepEqual(normal, [null, { width: 640, height: 480 }, { width: 700, height: 500 }]);
  assert.ok(!order.slice(mark).includes("first"), "unsubscribed listener receives nothing");

  const newbornSeen = [];
  const siblingSeen = [];
  const siblingUnsubscribe = scopeViewport.subscribe((value) => siblingSeen.push(value));
  let armed = false;
  let selfUnsubscribe = () => {};
  const selfListener = scopeViewport.subscribe(() => {
    if (!armed) {
      armed = true; // ignore our own synchronous initial
      return;
    }
    // Reentrant mutation during a broadcast: unsubscribe a sibling (twice) and
    // subscribe a newborn from inside the callback.
    siblingUnsubscribe();
    siblingUnsubscribe();
    scopeViewport.subscribe((value) => newbornSeen.push(value));
    selfUnsubscribe();
  });
  selfUnsubscribe = selfListener;
  publish(renderer, 900, 900);
  await waitFor(() => newbornSeen.length === 1);
  assert.deepEqual(newbornSeen, [{ width: 900, height: 900 }], "in-callback subscribe gets exactly its own initial, never a duplicate broadcast");
  publish(renderer, 1000, 1000);
  await waitFor(() => newbornSeen.length === 2);
  await tick();
  assert.deepEqual(newbornSeen, [
    { width: 900, height: 900 },
    { width: 1000, height: 1000 },
  ]);
  assert.deepEqual(siblingSeen, [{ width: 700, height: 500 }, { width: 900, height: 900 }], "unsubscribed-in-callback sibling receives nothing afterwards");

  await session.main.control.shutdown({ reason: "session-end" });
  await session.runtime;
});

test("V-11 Data loss retains the last size; fresh carriers rebaseline on the wire without duplicate business callbacks", async () => {
  let scopeViewport = null;
  const session = await createViewportSession(
    defineSubsystem((scope) => {
      scopeViewport = scope.viewport;
      return { frame: () => completed(null) };
    }),
  );
  const seen = [];
  scopeViewport.subscribe((value) => seen.push(value));

  const first = await installRenderer(session, 0);
  publish(first.renderer, 640, 480);
  await waitFor(() => seen.length === 2);
  assert.deepEqual(seen[1], { width: 640, height: 480 });

  first.pair.lose();
  await tick();
  assert.deepEqual(scopeViewport.current, { width: 640, height: 480 }, "Data loss keeps the last size without a null notification");
  assert.equal(seen.length, 2, "no null notification on carrier loss");
  publish(first.renderer, 999, 999);
  await tick();
  assert.deepEqual(scopeViewport.current, { width: 640, height: 480 }, "retired peer messages stay inert");

  const second = await installRenderer(session, 1);
  publish(second.renderer, 640, 480);
  await tick();
  assert.equal(seen.length, 2, "equal fresh baseline does not re-notify business");

  publish(second.renderer, 1024, 768);
  await waitFor(() => seen.length === 3);
  assert.deepEqual(seen[2], { width: 1024, height: 768 });

  second.pair.lose();
  const third = await installRenderer(session, 2, 2);
  publish(third.renderer, 1024, 768);
  await tick();
  assert.equal(seen.length, 3, "fresh generation with equal size suppresses the business callback");
  assert.deepEqual(scopeViewport.current, { width: 1024, height: 768 });

  await session.main.control.shutdown({ reason: "session-end" });
  await session.runtime;
});

test("V-12 graceful terminal closes the manager: post-terminal subscribe is inert and late deliveries stop", async () => {
  let scopeViewport = null;
  const session = await createViewportSession(
    defineSubsystem((scope) => {
      scopeViewport = scope.viewport;
      return { frame: () => completed(null) };
    }),
  );
  const seen = [];
  scopeViewport.subscribe((value) => seen.push(value));
  const { renderer } = await installRenderer(session, 0);
  publish(renderer, 640, 480);
  await waitFor(() => seen.length === 2);

  await session.main.control.shutdown({ reason: "session-end" });
  await session.runtime;

  const inert = [];
  const unsubscribe = scopeViewport.subscribe((value) => inert.push(value));
  assert.deepEqual(inert, [], "post-terminal subscribe performs no initial callback");
  assert.equal(typeof unsubscribe, "function");
  unsubscribe();
  unsubscribe();

  publish(renderer, 100, 100);
  await tick();
  assert.deepEqual(seen, [null, { width: 640, height: 480 }], "old listeners get zero late delivery");
  assert.deepEqual(scopeViewport.current, { width: 640, height: 480 }, "last size stays readable as history");
});

test("V-12 fatal Runtime terminal closes the manager without waiting for Data teardown", async () => {
  let scopeViewport = null;
  const session = await createViewportSession(
    defineSubsystem((scope) => {
      scopeViewport = scope.viewport;
      return { frame: () => completed(null) };
    }),
  );
  const { renderer } = await installRenderer(session, 0);
  publish(renderer, 320, 240);
  await waitFor(() => scopeViewport.current !== null);

  session.control.lose();
  await assert.rejects(session.runtime, SubsystemRuntimeFatalError);

  const inert = [];
  scopeViewport.subscribe((value) => inert.push(value));
  assert.deepEqual(inert, []);
  publish(renderer, 100, 100);
  await tick();
  assert.deepEqual(scopeViewport.current, { width: 320, height: 240 });
});

test("V-13 viewport observations stay independent of Frame lifecycle and grant no mutation surface", async () => {
  let scopeViewport = null;
  let frameRuns = 0;
  let releaseFrame;
  const frameGate = new Promise((resolve) => { releaseFrame = resolve; });
  const session = await createViewportSession(
    defineSubsystem((scope) => {
      scopeViewport = scope.viewport;
      return {
        frame() {
          frameRuns += 1;
          return frameGate.then(() => completed(null));
        },
      };
    }),
  );
  const surfaceKeys = Reflect.ownKeys(scopeViewport).map(String).sort();
  assert.deepEqual(surfaceKeys, ["current", "subscribe"], "the public Viewport surface is exactly current+subscribe");
  assert.equal(Object.getPrototypeOf(scopeViewport), Object.prototype, "the public Viewport surface adds no methods");
  assert.ok(Object.isFrozen(scopeViewport));
  assert.equal(typeof scopeViewport.subscribe, "function");
  for (const forbidden of ["setWidth", "setHeight", "publish", "emit", "assign", "update", "resize", "close", "onViewportState"]) {
    assert.equal(scopeViewport[forbidden], undefined, `no ${forbidden} mutation surface`);
  }

  const { renderer } = await installRenderer(session, 0);
  const seen = [];
  scopeViewport.subscribe((value) => seen.push(value));

  assert.deepEqual(
    await session.main.frame.initialize({ frameId: "root", input: null }),
    { kind: "success", result: {} },
  );
  publish(renderer, 640, 480);
  await waitFor(() => seen.length === 2);
  assert.deepEqual(
    await session.main.frame.activate({ frameId: "root", activationId: "a1" }),
    { kind: "success", result: {} },
  );
  await waitFor(() => frameRuns === 1, "frame execution");
  assert.equal(seen.length, 2, "Frame activity does not consume viewport observations");

  assert.deepEqual(
    await session.main.frame.suspend({ frameId: "root", activationId: "a1" }),
    { kind: "success", result: {} },
  );
  publish(renderer, 800, 600);
  await waitFor(() => seen.length === 3);
  assert.deepEqual(seen[2], { width: 800, height: 600 }, "suspended Frame does not gate viewport delivery");

  releaseFrame(completed(null));
  await tick();
  await session.main.control.shutdown({ reason: "session-end" });
  await session.runtime;
});
