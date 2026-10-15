import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createInMemorySessionEventBinding,
  createSessionEventCarrierBinding,
  createSessionEventClient,
  createSessionEventHub,
  createSessionEventMessagePortCarrier,
  serveSessionEventCarrier,
} from "../dist/index.js";

const turn = () => new Promise((resolve) => setTimeout(resolve, 20));

function createControllableCarrier() {
  const inbound = [];
  const readers = [];
  const outbound = [];
  const outboundWaiters = [];
  const held = [];
  let holding = false;
  let nextFailure = null;
  let terminal = null;
  let settleClosed;
  const closed = new Promise((resolve) => { settleClosed = resolve; });

  const finish = (fact) => {
    if (terminal !== null) return;
    terminal = fact;
    while (readers.length > 0) readers.shift()({ done: true, value: undefined });
    while (held.length > 0) held.shift().reject(fact.cause ?? new Error("carrier closed"));
    settleClosed(fact);
  };
  const carrier = Object.freeze({
    closed,
    async send(text) {
      if (terminal !== null) throw new Error("carrier closed");
      const message = JSON.parse(text);
      outbound.push(message);
      while (outboundWaiters.length > 0) outboundWaiters.shift()();
      if (nextFailure !== null) {
        const failure = nextFailure;
        nextFailure = null;
        throw failure;
      }
      if (holding) {
        await new Promise((resolve, reject) => held.push({ resolve, reject }));
      }
    },
    messages() {
      return Object.freeze({
        [Symbol.asyncIterator]() {
          return Object.freeze({
            next() {
              if (inbound.length > 0) return Promise.resolve({ done: false, value: inbound.shift() });
              if (terminal !== null) return Promise.resolve({ done: true, value: undefined });
              return new Promise((resolve) => readers.push(resolve));
            },
          });
        },
      });
    },
    async close() { finish({ kind: "closed" }); },
  });
  return Object.freeze({
    carrier,
    outbound,
    inject(message) {
      if (terminal !== null) throw new Error("carrier closed");
      const text = JSON.stringify(message);
      const reader = readers.shift();
      if (reader === undefined) inbound.push(text);
      else reader({ done: false, value: text });
    },
    lose(cause = new Error("carrier lost")) { finish({ kind: "lost", cause }); },
    failNextSend(cause = new Error("send failed")) { nextFailure = cause; },
    holdOutbound() { holding = true; },
    releaseOutbound() {
      holding = false;
      while (held.length > 0) held.shift().resolve();
    },
    async nextOutbound(index) {
      while (outbound.length <= index) {
        await new Promise((resolve) => outboundWaiters.push(resolve));
      }
      return outbound[index];
    },
  });
}

const ok = (request, result = {}) => Object.freeze({
  protocol: "loomrealm.session-events/1",
  type: "response",
  id: request.id,
  ok: true,
  result,
});

const remoteEvent = (subscriptionId, type) => Object.freeze({
  protocol: "loomrealm.session-events/1",
  type: "event",
  subscriptionId,
  event: Object.freeze({
    channel: "x",
    type,
    payload: null,
    source: Object.freeze({ subsystemKey: "remote" }),
  }),
});

async function establish(control, binding, outboundIndex, listener) {
  const pending = binding.subscribe(["x"], listener);
  const request = await control.nextOutbound(outboundIndex);
  assert.equal(request.method, "subscribe");
  const subscriptionId = outboundIndex + 101;
  control.inject(ok(request, { subscriptionId }));
  return { subscription: await pending, subscriptionId, nextIndex: outboundIndex + 1 };
}

test("MessagePort remote binding preserves routing, source, detachment, and terminal evidence", async () => {
  const hub = createSessionEventHub();
  const pairA = new MessageChannel();
  const pairB = new MessageChannel();
  const serverA = serveSessionEventCarrier(
    createInMemorySessionEventBinding(hub, "a"),
    createSessionEventMessagePortCarrier(pairA.port1),
  );
  const serverB = serveSessionEventCarrier(
    createInMemorySessionEventBinding(hub, "b"),
    createSessionEventMessagePortCarrier(pairB.port1),
  );
  const a = createSessionEventClient(createSessionEventCarrierBinding(createSessionEventMessagePortCarrier(pairA.port2)));
  const b = createSessionEventClient(createSessionEventCarrierBinding(createSessionEventMessagePortCarrier(pairB.port2)));
  const seen = [];
  const subscription = await b.subscribe(["battle"], (event) => seen.push(event));
  const payload = { hp: 3 };
  await a.publish("battle", "hit", payload);
  payload.hp = 0;
  await turn();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].payload.hp, 3);
  assert.equal(seen[0].source.subsystemKey, "a");
  await serverB.close();
  assert.deepEqual(await subscription.closed, { reason: "binding-terminal" });
  a.terminate(); b.terminate(); hub.terminate();
  await serverA.close();
});

test("post-dispatch lost publish result is OUTCOME_UNKNOWN and is not retried", async () => {
  let attempts = 0;
  let settleTerminal;
  const terminal = new Promise((resolve) => { settleTerminal = resolve; });
  const binding = {
    terminal,
    close() {},
    subscribe() { throw new Error("unused"); },
    publish() {
      attempts += 1;
      return {
        dispatched: Promise.resolve(),
        result: new Promise(() => {}),
      };
    },
  };
  const client = createSessionEventClient(binding);
  const pending = client.publish("x", "t", null);
  await Promise.resolve();
  settleTerminal("binding-terminal");
  await assert.rejects(pending, { code: "OUTCOME_UNKNOWN" });
  assert.equal(attempts, 1);
});

test("physical event send failure terminals the remote binding instead of silently dropping", async () => {
  const hub = createSessionEventHub();
  const pair = createMemoryCarrierPair();
  const serverCarrier = Object.freeze({
    closed: pair.left.closed,
    messages: () => pair.left.messages(),
    close: () => pair.left.close(),
    send(message) {
      if (JSON.parse(message).type === "event") {
        return Promise.reject(new Error("stalled physical sender failed"));
      }
      return pair.left.send(message);
    },
  });
  const server = serveSessionEventCarrier(
    createInMemorySessionEventBinding(hub, "subscriber"),
    serverCarrier,
  );
  const remote = createSessionEventClient(createSessionEventCarrierBinding(pair.right));
  const publisher = createSessionEventClient(createInMemorySessionEventBinding(hub, "publisher"));
  const subscription = await remote.subscribe(["x"], () => {});

  await publisher.publish("x", "event", null);
  assert.deepEqual(await subscription.closed, { reason: "binding-terminal" });
  await assert.rejects(remote.publish("x", "later", null), { code: "BINDING_UNAVAILABLE" });

  publisher.terminate();
  remote.terminate();
  hub.terminate();
  await server.closed;
});

test("retiring subscription discards a late event until unsubscribe response while peers remain usable", async () => {
  const control = createControllableCarrier();
  const binding = createSessionEventCarrierBinding(control.carrier);
  const seenA = [];
  const seenB = [];
  const a = await establish(control, binding, 0, (event) => seenA.push(event.type));
  const b = await establish(control, binding, a.nextIndex, (event) => seenB.push(event.type));

  a.subscription.close();
  assert.deepEqual(await a.subscription.closed, { reason: "closed" });
  const unsubscribe = await control.nextOutbound(b.nextIndex);
  assert.deepEqual(unsubscribe.params, { subscriptionId: a.subscriptionId });
  control.inject(remoteEvent(a.subscriptionId, "late-a"));
  control.inject(remoteEvent(b.subscriptionId, "live-b"));
  await turn();
  assert.deepEqual(seenA, []);
  assert.deepEqual(seenB, ["live-b"]);
  control.inject(ok(unsubscribe));
  control.inject(remoteEvent(a.subscriptionId, "stale-after-retirement"));

  const publish = binding.publish("x", "still-usable", null);
  const publishRequest = await control.nextOutbound(b.nextIndex + 1);
  assert.equal(publishRequest.method, "publish");
  control.inject(ok(publishRequest));
  await publish.dispatched;
  await publish.result;
  b.subscription.close();
  await binding.close();
});

test("retiring subscription accepts a late terminal as definitive retirement", async () => {
  const control = createControllableCarrier();
  const binding = createSessionEventCarrierBinding(control.carrier);
  const a = await establish(control, binding, 0, () => {});
  a.subscription.close();
  const unsubscribe = await control.nextOutbound(a.nextIndex);
  control.inject(Object.freeze({
    protocol: "loomrealm.session-events/1",
    type: "terminal",
    subscriptionId: a.subscriptionId,
    reason: "closed",
  }));
  control.inject(ok(unsubscribe));
  const publish = binding.publish("x", "after-terminal", null);
  const publishRequest = await control.nextOutbound(a.nextIndex + 1);
  control.inject(ok(publishRequest));
  await publish.result;
  await binding.close();
});

test("overflow retires only that remote subscription and late traffic cannot poison peers", async () => {
  const control = createControllableCarrier();
  const binding = createSessionEventCarrierBinding(control.carrier);
  let release;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const slow = await establish(control, binding, 0, async () => { started(); await gate; });
  const healthySeen = [];
  const healthy = await establish(control, binding, slow.nextIndex, (event) => healthySeen.push(event.type));

  control.inject(remoteEvent(slow.subscriptionId, "active"));
  await startedPromise;
  for (let index = 0; index < 65; index += 1) {
    control.inject(remoteEvent(slow.subscriptionId, `queued-${index}`));
  }
  assert.deepEqual(await slow.subscription.closed, { reason: "overflow" });
  const unsubscribe = await control.nextOutbound(healthy.nextIndex);
  assert.equal(unsubscribe.method, "unsubscribe");
  control.inject(remoteEvent(slow.subscriptionId, "late-overflow"));
  control.inject(remoteEvent(healthy.subscriptionId, "healthy"));
  control.inject(ok(unsubscribe));
  await turn();
  assert.deepEqual(healthySeen, ["healthy"]);

  const publish = binding.publish("x", "accepted", null);
  const publishRequest = await control.nextOutbound(healthy.nextIndex + 1);
  control.inject(ok(publishRequest));
  await publish.result;
  release();
  healthy.subscription.close();
  await binding.close();
});

test("binding loss while a subscription retires settles the binding and rejects future work", async () => {
  const control = createControllableCarrier();
  const binding = createSessionEventCarrierBinding(control.carrier);
  const a = await establish(control, binding, 0, () => {});
  a.subscription.close();
  await control.nextOutbound(a.nextIndex);
  control.lose();
  assert.equal(await binding.terminal, "binding-terminal");
  const publish = binding.publish("x", "later", null);
  await assert.rejects(publish.dispatched, { code: "BINDING_UNAVAILABLE" });
  await assert.rejects(publish.result, { code: "BINDING_UNAVAILABLE" });
});

test("a never-issued subscription identity is binding-terminal protocol corruption", async () => {
  const control = createControllableCarrier();
  const binding = createSessionEventCarrierBinding(control.carrier);
  control.inject(remoteEvent(999, "impossible"));
  assert.equal(await binding.terminal, "binding-terminal");
});

test("controllable carrier holds dispatch, delays response, preserves order, and exposes send failure", async () => {
  const control = createControllableCarrier();
  control.holdOutbound();
  const binding = createSessionEventCarrierBinding(control.carrier);
  const first = binding.publish("x", "first", null);
  const firstRequest = await control.nextOutbound(0);
  assert.equal(firstRequest.method, "publish");
  assert.equal(await Promise.race([first.dispatched.then(() => "done"), turn().then(() => "held")]), "held");
  control.releaseOutbound();
  await first.dispatched;
  assert.equal(await Promise.race([first.result.then(() => "done"), turn().then(() => "delayed")]), "delayed");
  control.inject(ok(firstRequest));
  await first.result;

  control.failNextSend(new Error("intentional send failure"));
  const second = binding.publish("x", "second", null);
  const secondRequest = await control.nextOutbound(1);
  assert.equal(secondRequest.method, "publish");
  assert.ok(secondRequest.id > firstRequest.id);
  await assert.rejects(second.dispatched, /intentional send failure/);
  await assert.rejects(second.result, /intentional send failure/);
  assert.equal(await binding.terminal, "binding-terminal");
});
