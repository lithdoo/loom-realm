import { once } from "node:events";
import { test } from "node:test";
import assert from "node:assert/strict";
import WebSocket, { WebSocketServer } from "ws";
import { createWebSocketCarrier } from "../dist/websocket-carrier.js";

async function pair(t) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const accepted = once(server, "connection");
  const client = new WebSocket(`ws://127.0.0.1:${address.port}/control`);
  await once(client, "open");
  const [peer] = await accepted;
  t.after(() => {
    client.terminate();
    peer.terminate();
  });
  return { client, peer };
}

test("WebSocket carrier preserves text message order and closes idempotently", async (t) => {
  const { client, peer } = await pair(t);
  const carrier = createWebSocketCarrier(client);
  const iterator = carrier.messages()[Symbol.asyncIterator]();
  assert.throws(() => carrier.messages(), /already acquired/);
  peer.send("one");
  peer.send("two");
  assert.deepEqual(await iterator.next(), { done: false, value: "one" });
  assert.deepEqual(await iterator.next(), { done: false, value: "two" });
  await carrier.send("reply");
  const [data, isBinary] = await once(peer, "message");
  assert.equal(data.toString(), "reply");
  assert.equal(isBinary, false);
  await Promise.all([carrier.close(), carrier.close()]);
  assert.deepEqual(await carrier.closed, { kind: "closed" });
  assert.deepEqual(await iterator.next(), { done: true, value: undefined });
});

test("WebSocket carrier treats a binary application unit as lost", async (t) => {
  const { client, peer } = await pair(t);
  const carrier = createWebSocketCarrier(client);
  peer.send(Buffer.from([1, 2, 3]), { binary: true });
  const fact = await carrier.closed;
  assert.equal(fact.kind, "lost");
  assert.ok(fact.cause instanceof TypeError);
});
