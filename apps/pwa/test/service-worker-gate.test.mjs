import assert from "node:assert/strict";
import test from "node:test";
import { serviceWorkerGate } from "../dist/types/service-worker-gate.js";

function storageFixture(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    values,
  };
}

function worker(generation, state = "activated") {
  const messages = [];
  const listeners = new Set();
  return {
    messages,
    get state() { return state; },
    setState(next) { state = next; for (const listener of listeners) listener(); },
    addEventListener(type, listener) { if (type === "statechange") listeners.add(listener); },
    removeEventListener(type, listener) { if (type === "statechange") listeners.delete(listener); },
    postMessage(message, transfer) {
      messages.push(message);
      transfer[0].postMessage(Object.freeze({ protocolVersion: 1, buildId: "loomrealm-pwa-v1", generation }));
    },
  };
}

function container(controller, registration) {
  const calls = [];
  return {
    calls,
    serviceWorkers: {
      controller,
      async getRegistration() { calls.push({ getRegistration: true }); return registration; },
      async register(url, options) { calls.push({ url, options }); return registration; },
    },
  };
}

test("an already-controlled document handshakes its current controller and never waits for a waiting update", async () => {
  const oldController = worker("old-generation");
  const waitingUpdate = worker("new-generation", "installed");
  const fixture = container(oldController, { installing: null, waiting: waitingUpdate, active: oldController });
  const storage = storageFixture({ "loomrealm-sw-controller-reload-v1": "1" });
  const result = await serviceWorkerGate({ serviceWorkers: fixture.serviceWorkers, storage: storage.storage });
  assert.equal(result.generation, "old-generation");
  assert.equal(oldController.messages.length, 1);
  assert.equal(waitingUpdate.messages.length, 0);
  assert.equal(storage.values.size, 0);
});

test("first installation waits until eligible and requests exactly one normal reload", async () => {
  const installing = worker("first-generation", "installing");
  const fixture = container(null, { installing, waiting: null, active: null });
  const storage = storageFixture();
  const reloaded = new Error("reload requested");
  const gate = serviceWorkerGate({
    serviceWorkers: fixture.serviceWorkers,
    storage: storage.storage,
    reload() { throw reloaded; },
  });
  installing.setState("installed");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(storage.values.size, 0);
  installing.setState("activated");
  await assert.rejects(gate, (cause) => cause === reloaded);
  assert.equal(storage.values.get("loomrealm-sw-controller-reload-v1"), "1");
});

test("an uncontrolled document reloads onto the active generation instead of waiting for a concurrent update", async () => {
  const active = worker("current-generation", "activated");
  const installing = worker("future-generation", "installing");
  const fixture = container(null, { installing, waiting: null, active });
  const storage = storageFixture();
  const reloaded = new Error("reload requested");
  await assert.rejects(serviceWorkerGate({
    serviceWorkers: fixture.serviceWorkers,
    storage: storage.storage,
    reload() { throw reloaded; },
  }), (cause) => cause === reloaded);
  assert.equal(storage.values.get("loomrealm-sw-controller-reload-v1"), "1");
});

test("a second uncontrolled bootstrap fails closed without a reload loop", async () => {
  const active = worker("first-generation");
  const fixture = container(null, { installing: null, waiting: null, active });
  const storage = storageFixture({ "loomrealm-sw-controller-reload-v1": "1" });
  let reloads = 0;
  await assert.rejects(
    serviceWorkerGate({ serviceWorkers: fixture.serviceWorkers, storage: storage.storage, reload: () => { reloads += 1; } }),
    /after first-install reload/,
  );
  assert.equal(reloads, 0);
});

test("the next eligible document can accept the newly controlling generation", async () => {
  const newController = worker("new-generation");
  const fixture = container(newController, { installing: null, waiting: null, active: newController });
  const result = await serviceWorkerGate({ serviceWorkers: fixture.serviceWorkers, storage: storageFixture().storage });
  assert.equal(result.generation, "new-generation");
});

test("controller changes during the handshake cannot switch the pinned generation", async () => {
  let reply;
  const oldController = worker("ignored");
  oldController.postMessage = (message, transfer) => { oldController.messages.push(message); reply = transfer[0]; };
  const newController = worker("new-generation");
  const fixture = container(oldController, { installing: null, waiting: newController, active: oldController });
  const gate = serviceWorkerGate({ serviceWorkers: fixture.serviceWorkers, storage: storageFixture().storage });
  while (reply === undefined) await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.serviceWorkers.controller = newController;
  reply.postMessage(Object.freeze({ protocolVersion: 1, buildId: "loomrealm-pwa-v1", generation: "old-generation" }));
  const result = await gate;
  assert.equal(result.generation, "old-generation");
  assert.equal(newController.messages.length, 0);
});

test("malformed controller handshake fails closed", async () => {
  const controller = worker("unused");
  controller.postMessage = (_message, transfer) => transfer[0].postMessage({ protocolVersion: 1, buildId: "x", generation: "x", extra: true });
  const fixture = container(controller, { installing: null, waiting: null, active: controller });
  await assert.rejects(serviceWorkerGate({ serviceWorkers: fixture.serviceWorkers, storage: storageFixture().storage }), /Incompatible/);
});
