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
