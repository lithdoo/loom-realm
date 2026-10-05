import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  RealmStateError,
  createRealmStateAuthority,
  createRealmStateCarrierBinding,
  createRealmStateClient,
  prepareRealmStateDefinition,
  serveRealmStateCarrier,
} from "../dist/index.js";
import {
  receiveRealmStateMessages,
  sendRealmStateMessage,
} from "../dist/framing.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const fails = (code) => (error) => error instanceof RealmStateError && error.code === code;

async function waitFor(predicate, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

function createGatedCarrier(carrier) {
  let blocked = false;
  let release;
  let observed;
  const gate = new Promise((resolve) => { release = resolve; });
  const blockedSend = new Promise((resolve) => { observed = resolve; });
  return {
    carrier: Object.freeze({
      async send(message) {
        if (blocked) {
          observed();
          await gate;
        }
        await carrier.send(message);
      },
      messages: () => carrier.messages(),
      closed: carrier.closed,
      close: () => carrier.close(),
    }),
    block() { blocked = true; },
    blockedSend,
    release() { blocked = false; release(); },
  };
}

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

test("slow physical delivery keeps the exact 64-event boundary and terminals the 65th", async () => {
  const target = { namespace: "n", key: "k" };
  for (const count of [64, 65]) {
    const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
    const pair = createMemoryCarrierPair();
    const gated = createGatedCarrier(pair.left);
    const server = serveRealmStateCarrier(authority, gated.carrier);
    const client = createRealmStateClient(createRealmStateCarrierBinding(pair.right));
    const events = [];
    await client.subscribe([target], (event) => events.push(event));
    await waitFor(() => events[0]?.type === "baseline", "baseline");
    gated.block();
    for (let version = 0; version < count; version += 1) {
      await authority.commit({
        conditions: [{ key: target, version }],
        writes: [{ type: "put", key: target, value: version }],
      });
    }
    await gated.blockedSend;
    gated.release();
    if (count === 64) {
      await waitFor(
        () => events.filter((event) => event.type === "change").length === 64,
        "64 physical changes",
      );
      assert.equal(events.some((event) => event.type === "terminal"), false);
    } else {
      await waitFor(() => events.at(-1)?.type === "terminal", "overflow terminal");
      assert.equal(events.at(-1).reason, "overflow");
      assert.deepEqual(events.map((event) => event.type), ["baseline", "terminal"]);
    }
    await server.close();
  }
});

test("slow remote listener uses the same bounded delivery semantics without Promise accumulation", async () => {
  const target = { namespace: "listener", key: "k" };
  for (const count of [64, 65]) {
    const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
    const pair = createMemoryCarrierPair();
    const server = serveRealmStateCarrier(authority, pair.left);
    const client = createRealmStateClient(createRealmStateCarrierBinding(pair.right));
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const events = [];
    await client.subscribe([target], async (event) => {
      events.push(event);
      if (event.type === "baseline") await gate;
    });
    await waitFor(() => events[0]?.type === "baseline", "slow-listener baseline");
    for (let version = 0; version < count; version += 1) {
      await authority.commit({
        conditions: [{ key: target, version }],
        writes: [{ type: "put", key: target, value: version }],
      });
    }
    await tick();
    release();
    if (count === 64) {
      await waitFor(
        () => events.filter((event) => event.type === "change").length === 64,
        "64 listener changes",
      );
      assert.equal(events.some((event) => event.type === "terminal"), false);
    } else {
      await waitFor(() => events.at(-1)?.type === "terminal", "listener overflow");
      assert.deepEqual(events.map((event) => event.type), ["baseline", "terminal"]);
      assert.equal(events.at(-1).reason, "overflow");
    }
    await server.close();
  }
});

test("slow physical delivery enforces the exact 8 MiB logical payload boundary", async () => {
  const target = { namespace: "n", key: "k" };
  const maximum = "x".repeat(256 * 1024 - 2);
  const remainder = "r".repeat(262_078);
  for (const overflow of [false, true]) {
    const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
    const pair = createMemoryCarrierPair();
    const gated = createGatedCarrier(pair.left);
    const server = serveRealmStateCarrier(authority, gated.carrier);
    const client = createRealmStateClient(createRealmStateCarrierBinding(pair.right));
    const events = [];
    await client.subscribe([target], (event) => events.push(event));
    await waitFor(() => events[0]?.type === "baseline", "payload baseline");
    gated.block();
    for (let version = 0; version < 31; version += 1) {
      await authority.commit({
        conditions: [{ key: target, version }],
        writes: [{ type: "put", key: target, value: maximum }],
      });
    }
    await authority.commit({
      conditions: [{ key: target, version: 31 }],
      writes: [{ type: "put", key: target, value: remainder }],
    });
    if (overflow) {
      await authority.commit({
        conditions: [{ key: target, version: 32 }],
        writes: [{ type: "put", key: target, value: null }],
      });
    }
    await gated.blockedSend;
    gated.release();
    if (overflow) {
      await waitFor(() => events.at(-1)?.type === "terminal", "payload overflow");
      assert.equal(events.at(-1).reason, "overflow");
    } else {
      await waitFor(
        () => events.filter((event) => event.type === "change").length === 32,
        "exact payload delivery",
      );
      assert.equal(events.some((event) => event.type === "terminal"), false);
    }
    await server.close();
  }
});

test("large consecutive subscription events are framed without chunk or revision reorder", async () => {
  const keys = Array.from({ length: 8 }, (_, index) => ({ namespace: "large", key: String(index) }));
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
  const pair = createMemoryCarrierPair();
  let concurrentSends = 0;
  let maximumConcurrentSends = 0;
  const delayed = Object.freeze({
    async send(message) {
      concurrentSends += 1;
      maximumConcurrentSends = Math.max(maximumConcurrentSends, concurrentSends);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1));
        await pair.left.send(message);
      } finally {
        concurrentSends -= 1;
      }
    },
    messages: () => pair.left.messages(),
    closed: pair.left.closed,
    close: () => pair.left.close(),
  });
  const server = serveRealmStateCarrier(authority, delayed);
  const client = createRealmStateClient(createRealmStateCarrierBinding(pair.right));
  const events = [];
  await client.subscribe(keys, (event) => events.push(event));
  await waitFor(() => events[0]?.type === "baseline", "large baseline");
  const valueA = `a${"x".repeat(256 * 1024 - 3)}`;
  const valueB = `b${"y".repeat(256 * 1024 - 3)}`;
  await authority.commit({
    conditions: keys.map((key) => ({ key, version: 0 })),
    writes: keys.map((key) => ({ type: "put", key, value: valueA })),
  });
  await authority.commit({
    conditions: keys.map((key) => ({ key, version: 1 })),
    writes: keys.map((key) => ({ type: "put", key, value: valueB })),
  });
  await waitFor(() => events.filter((event) => event.type === "change").length === 2, "large changes");
  const changes = events.filter((event) => event.type === "change");
  assert.deepEqual(changes.map((event) => event.revision), [1, 2]);
  assert.deepEqual(changes.map((event) => event.records[0].value[0]), ["a", "b"]);
  assert.equal(maximumConcurrentSends, 1);
  await server.close();
});

test("logical invalid requests are request-local while physical corruption terminals the binding", async () => {
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
  const pair = createMemoryCarrierPair();
  const server = serveRealmStateCarrier(authority, pair.left);
  const responses = receiveRealmStateMessages(pair.right)[Symbol.asyncIterator]();
  await sendRealmStateMessage(pair.right, JSON.stringify({
    protocol: "loomrealm.realm-state/1",
    type: "request",
    id: 1,
    method: "unknown",
    params: {},
  }));
  const invalid = JSON.parse((await responses.next()).value);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.failure.code, "INVALID_REQUEST");
  await sendRealmStateMessage(pair.right, JSON.stringify({
    protocol: "loomrealm.realm-state/1",
    type: "request",
    id: 2,
    method: "read",
    params: { keys: [{ namespace: "n", key: "k" }] },
  }));
  const valid = JSON.parse((await responses.next()).value);
  assert.equal(valid.ok, true);
  assert.equal(valid.result.records[0].value, null);
  await pair.right.send("{broken");
  await server.closed;
});

test("unexpected post-dispatch server failure never masquerades as known no-commit", async () => {
  let mutations = 0;
  const unexpectedAuthority = {
    read: async () => ({ revision: 0, records: [] }),
    readInitial: async () => ({ records: [] }),
    list: async () => ({ revision: 0, records: [] }),
    scan: async () => ({ revision: 0, records: [] }),
    async commit() {
      mutations += 1;
      throw new Error("unexpected after mutation admission");
    },
    subscribe: async () => ({ close() {} }),
  };
  const pair = createMemoryCarrierPair();
  serveRealmStateCarrier(unexpectedAuthority, pair.left);
  const client = createRealmStateClient(createRealmStateCarrierBinding(pair.right));
  const target = { namespace: "evidence", key: "k" };
  await assert.rejects(client.commit({
    conditions: [{ key: target, version: 0 }],
    writes: [{ type: "put", key: target, value: 1 }],
  }), fails("OUTCOME_UNKNOWN"));
  assert.equal(mutations, 1);
});

test("invalid response bodies are binding corruption rather than request-local failures", async () => {
  const pair = createMemoryCarrierPair();
  const binding = createRealmStateCarrierBinding(pair.right);
  const client = createRealmStateClient(binding);
  const peer = receiveRealmStateMessages(pair.left)[Symbol.asyncIterator]();
  const response = (async () => {
    const request = JSON.parse((await peer.next()).value);
    await sendRealmStateMessage(pair.left, JSON.stringify({
      protocol: "loomrealm.realm-state/1",
      type: "response",
      id: request.id,
      ok: true,
      result: { revision: 0, records: "corrupted" },
    }));
  })();
  await assert.rejects(
    client.read([{ namespace: "corrupt", key: "response" }]),
    fails("BINDING_UNAVAILABLE"),
  );
  await response;
  await binding.terminal;
});

test("framing rejects interleaved, oversized-count, and truncated physical streams", async () => {
  const frame = (stream, index, total, chunk = "x") => JSON.stringify({
    protocol: "loomrealm.realm-state.frame/1",
    type: "chunk",
    stream,
    index,
    total,
    chunk,
  });
  const carrierFor = (units) => ({
    async send() {},
    async *messages() { yield* units; },
    closed: new Promise(() => {}),
    async close() {},
  });
  await assert.rejects(async () => {
    for await (const _ of receiveRealmStateMessages(carrierFor([
      frame(1, 0, 2),
      frame(2, 0, 2),
    ]))) void _;
  }, /Out-of-order/u);
  await assert.rejects(async () => {
    for await (const _ of receiveRealmStateMessages(carrierFor([
      frame(1, 0, 50_000),
    ]))) void _;
  }, /frame/u);
  await assert.rejects(async () => {
    for await (const _ of receiveRealmStateMessages(carrierFor([
      frame(1, 0, 2),
    ]))) void _;
  }, /Truncated/u);
});
