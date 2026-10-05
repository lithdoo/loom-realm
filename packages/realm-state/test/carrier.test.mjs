import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRealmStateAuthority,
  createRealmStateCarrierBinding,
  createRealmStateClient,
  prepareRealmStateDefinition,
  serveRealmStateCarrier,
} from "../dist/index.js";

test("carrier realization preserves observation, commit, subscription, and cleanup semantics", async () => {
  const target = { namespace: "worker", key: "record" };
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([
    { namespace: target.namespace, key: target.key, value: 0 },
  ]));
  const pair = createMemoryCarrierPair();
  const server = serveRealmStateCarrier(authority, pair.left);
  const binding = createRealmStateCarrierBinding(pair.right);
  const client = createRealmStateClient(binding);
  assert.equal((await client.readInitial([target])).records[0].value, 0);
  const events = [];
  await client.subscribe([target], (event) => events.push(event));
  const committed = await client.commit({
    conditions: [{ key: target, version: 0 }],
    writes: [{ type: "put", key: target, value: { value: 1 } }],
  });
  assert.equal(committed.revision, 1);
  for (let attempt = 0; events.length < 2 && attempt < 100; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.deepEqual(events.map((event) => event.type), ["baseline", "change"]);
  assert.deepEqual((await client.scan()).records[0].value, { value: 1 });
  await server.close();
  await binding.terminal;
});

test("carrier framing preserves valid logical requests and snapshots above one physical unit", async () => {
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
  const pair = createMemoryCarrierPair();
  const server = serveRealmStateCarrier(authority, pair.left);
  const client = createRealmStateClient(createRealmStateCarrierBinding(pair.right));
  const value = "x".repeat(256 * 1024 - 2);
  const keys = Array.from({ length: 8 }, (_, index) => ({ namespace: "framed", key: String(index) }));
  const committed = await client.commit({
    conditions: keys.map((key) => ({ key, version: 0 })),
    writes: keys.map((key) => ({ type: "put", key, value })),
  });
  assert.equal(committed.records.length, 8);
  const snapshot = await client.scan({ namespace: "framed" });
  assert.equal(snapshot.records.length, 8);
  assert.equal(snapshot.records.every((record) => record.value.length === value.length), true);
  await server.close();
});
