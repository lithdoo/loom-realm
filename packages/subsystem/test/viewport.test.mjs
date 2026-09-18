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
} from "../dist/host/index.js";
import { ViewportManager } from "../dist/internal/viewport-manager.js";

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

async function tick() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitFor(predicate, message = "condition") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

async function createSession(factory, data) {
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
        return { kind: "success", result: { childFrameId: "child-1" } };
      },
      onFrameReturn() {
        return { kind: "success", result: {} };
      },
    },
  });

  const runtime = runSubsystem({
    definition: factory,
    runtimeControl: {
      async acquire(signal) {
        assert.equal(signal.aborted, false);
        return pair.right;
      },
    },
    runtimePolicy: defaultPolicy,
    launch: {
      subsystemKey: "demo",
      bootstrapToken: "secret",
      controlProtocolVersions: [1],
    },
    ...(data === undefined ? {} : { data }),
  });
  void runtime.catch(() => {});

  assert.deepEqual(await main.identified, {
    kind: "identified",
    key: "demo",
    protocolVersion: 1,
  });
  await waitFor(() => statuses.some((status) => status.state === "ready"), "ready");
  return { main, runtime, statuses };
}

async function shutdown(session) {
  assert.deepEqual(await session.main.control.shutdown({ reason: "session-end" }), {
    kind: "success",
    result: {},
  });
  await session.runtime;
}

function renderer(carrier, generation = 1) {
  const accept = () => ({ kind: "accepted" });
  return createRendererDataPeer({
    binding: {
      carrier,
      subsystemKey: "demo",
      generation,
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

function onceData(carrier, generation = 1) {
  let used = false;
  return {
    async acquire() {
      if (used) throw new Error("data acquire stopped");
      used = true;
      return {
        carrier,
        generation,
        dataProfile: "loomrealm.renderer-data/1",
      };
    },
  };
}

test("V-09: sync initial, getter-before-callback, equal suppress, detached + host wire", async () => {
  const manager = new ViewportManager();
  const observations = [];
  manager.viewport.subscribe((value) => {
    observations.push({
      getter: manager.viewport.current,
      value,
    });
  });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].value, null);
  manager.applyState(100, 50);
  assert.equal(observations.length, 2);
  assert.deepEqual(observations[1].value, { width: 100, height: 50 });
  assert.deepEqual(observations[1].getter, { width: 100, height: 50 });
  assert.equal(Object.isFrozen(observations[1].value), true);
  manager.applyState(100, 50);
  assert.equal(observations.length, 2);
  const late = [];
  manager.viewport.subscribe((value) => late.push(value));
  assert.deepEqual(late, [{ width: 100, height: 50 }]);
  manager.applyState(200, 100);
  assert.deepEqual(observations[2].value, { width: 200, height: 100 });
  manager.close();

  const dataPair = createMemoryCarrierPair();
  const hostObs = [];
  const session = await createSession(
    defineSubsystem((scope) => {
      scope.viewport.subscribe((value) => hostObs.push(value));
      return { frame() { return completed(null); } };
    }),
    onceData(dataPair.right),
  );
  await tick();
  const peer = renderer(dataPair.left);
  peer.viewport.publishState({ type: "viewport.state", width: 100, height: 50 });
  await waitFor(() => hostObs.some((v) => v && v.width === 100), "host size");
  await shutdown(session);
});

test("V-10: listener throw/reject contained; reentrant subscribe/unsubscribe", async () => {
  const manager = new ViewportManager();
  const ok = [];
  manager.viewport.subscribe(() => {
    throw new Error("sync boom");
  });
  manager.viewport.subscribe(() => Promise.reject(new Error("async boom")));
  manager.viewport.subscribe((value) => ok.push(value));
  assert.deepEqual(ok, [null]);
  manager.applyState(11, 12);
  assert.ok(ok.some((v) => v && v.width === 11));

  let nested = null;
  let unsub = () => {};
  unsub = manager.viewport.subscribe((value) => {
    if (value && value.width === 11) {
      unsub();
      nested = [];
      manager.viewport.subscribe((v) => nested.push(v));
    }
  });
  assert.deepEqual(nested, [{ width: 11, height: 12 }]);
  manager.applyState(22, 23);
  assert.ok(nested.some((v) => v && v.width === 22));
  const before = nested.length;
  // outer already unsubscribed during sync initial; further applies only notify nested
  manager.applyState(33, 34);
  assert.ok(nested.length > before);
  manager.close();
  const inert = [];
  manager.viewport.subscribe((value) => inert.push(value));
  assert.deepEqual(inert, []);
  await tick();
});

test("V-11: Data loss retains size; equal fresh baseline suppresses; different notifies", async () => {
  const observations = [];
  const requests = [];
  const firstPair = createMemoryCarrierPair();
  const secondPair = createMemoryCarrierPair();

  const session = await createSession(
    defineSubsystem((scope) => {
      scope.viewport.subscribe((value) => observations.push(value));
      return { frame() { return completed(null); } };
    }),
    {
      acquire() {
        let resolve;
        const promise = new Promise((r) => { resolve = r; });
        requests.push({ resolve, promise });
        return promise;
      },
    },
  );
  await waitFor(() => requests.length === 1, "first acquire");
  requests[0].resolve({
    carrier: firstPair.right,
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  });
  await tick();

  const renderer1 = renderer(firstPair.left);
  renderer1.viewport.publishState({ type: "viewport.state", width: 30, height: 40 });
  await waitFor(() => observations.some((v) => v && v.width === 30), "first size");
  const beforeLoss = observations.length;
  await renderer1.close();
  await waitFor(() => requests.length === 2, "reacquire");
  assert.equal(observations.length, beforeLoss);

  requests[1].resolve({
    carrier: secondPair.right,
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  });
  await tick();
  const renderer2 = renderer(secondPair.left);
  renderer2.viewport.publishState({ type: "viewport.state", width: 30, height: 40 });
  await tick();
  await tick();
  assert.equal(observations.length, beforeLoss);
  renderer2.viewport.publishState({ type: "viewport.state", width: 31, height: 41 });
  await waitFor(() => observations.some((v) => v && v.width === 31), "changed");
  // Stop further reacquire loops before shutdown.
  requests.push = () => 0;
  await shutdown(session);
});

test("V-12: post-terminal subscribe is inert without initial callback", async () => {
  let scopeRef;
  const session = await createSession(
    defineSubsystem((scope) => {
      scopeRef = scope;
      return { frame() { return completed(null); } };
    }),
  );
  await shutdown(session);
  const calls = [];
  const unsub = scopeRef.viewport.subscribe((value) => calls.push(value));
  assert.deepEqual(calls, []);
  unsub();
  unsub();
});

test("V-13: viewport updates independent of Frame/InputTarget changes", async () => {
  const observations = [];
  const dataPair = createMemoryCarrierPair();
  let frameSignalAborted = false;
  const session = await createSession(
    defineSubsystem((scope) => {
      scope.viewport.subscribe((value) => observations.push(value));
      return {
        async frame(frame) {
          scope.createInputListener({
            frame,
            channels: ["keyboard.state"],
          });
          try {
            await new Promise((resolve, reject) => {
              if (frame.signal.aborted) {
                reject(frame.signal.reason);
                return;
              }
              frame.signal.addEventListener("abort", () => {
                frameSignalAborted = true;
                reject(frame.signal.reason);
              }, { once: true });
            });
          } catch {
            return completed(null);
          }
          return completed(null);
        },
      };
    }),
    onceData(dataPair.right),
  );

  await session.main.frame.initialize({ frameId: "root", input: null });
  await session.main.frame.activate({ frameId: "root", activationId: "a1" });
  await tick();
  const peer = renderer(dataPair.left);
  peer.viewport.publishState({ type: "viewport.state", width: 50, height: 60 });
  await waitFor(() => observations.some((v) => v && v.width === 50), "viewport with active frame");
  await session.main.frame.suspend({ frameId: "root", activationId: "a1" });
  await waitFor(() => frameSignalAborted, "frame aborted by suspend");
  peer.viewport.publishState({ type: "viewport.state", width: 51, height: 61 });
  await waitFor(() => observations.some((v) => v && v.width === 51), "viewport after suspend");
  await session.main.frame.closeFrame({ frameId: "root" });
  await shutdown(session);
});

test("C-02: thenable then-getter throw isolated with sync throw and Promise.reject", async () => {
  const manager = new ViewportManager();
  const ok = [];
  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  try {
    manager.viewport.subscribe(() => { throw new Error("sync boom"); });
    manager.viewport.subscribe(() => Promise.reject(new Error("async boom")));
    manager.viewport.subscribe(() => {
      const evil = {};
      Object.defineProperty(evil, "then", {
        enumerable: true,
        get() { throw new Error("then getter boom"); },
      });
      return evil;
    });
    manager.viewport.subscribe((value) => { ok.push(value); });
    assert.deepEqual(ok, [null]);
    assert.doesNotThrow(() => manager.applyState(7, 8));
    assert.ok(ok.some((v) => v && v.width === 7 && v.height === 8));
    await tick();
    assert.equal(unhandled.length, 0);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    manager.close();
  }
});
