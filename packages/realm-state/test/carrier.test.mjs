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

function createEventGatedCarrier(carrier) {
  let release;
  let observed;
  const gate = new Promise((resolve) => { release = resolve; });
  const blockedSend = new Promise((resolve) => { observed = resolve; });
  return {
    carrier: Object.freeze({
      async send(message) {
        let decoded;
        try { decoded = JSON.parse(message); } catch {}
        if (decoded?.type === "event") {
          observed();
          await gate;
        }
        await carrier.send(message);
      },
      messages: () => carrier.messages(),
      closed: carrier.closed,
      close: () => carrier.close(),
    }),
    blockedSend,
    release() { release(); },
  };
}

async function nextRequest(iterator) {
  const next = await iterator.next();
  assert.equal(next.done, false);
  const request = JSON.parse(next.value);
  assert.equal(request.protocol, "loomrealm.realm-state/1");
  assert.equal(request.type, "request");
  return request;
}

function sendResponse(carrier, id, response) {
  return sendRealmStateMessage(carrier, JSON.stringify({
    protocol: "loomrealm.realm-state/1",
    type: "response",
    id,
    ...response,
  }));
}

function sendEvent(carrier, subscriptionId, event) {
  return sendRealmStateMessage(carrier, JSON.stringify({
    protocol: "loomrealm.realm-state/1",
    type: "event",
    subscriptionId,
    event,
  }));
}

function snapshotRecord(key, value = null, version = 0) {
  return { key, value, version };
}

function indexRecord(key, version = 1) {
  return { key, version };
}

async function withTimeout(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 2_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
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
  await waitFor(() => events.length === 2, "baseline and committed change");
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

test("local close suppresses an already-accepted change without corrupting the binding", async () => {
  const target = { namespace: "close-race", key: "target" };
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([
    { ...target, value: 0 },
  ]));
  const pair = createMemoryCarrierPair();
  const gated = createGatedCarrier(pair.left);
  const server = serveRealmStateCarrier(authority, gated.carrier);
  const binding = createRealmStateCarrierBinding(pair.right);
  const client = createRealmStateClient(binding);
  const events = [];
  const subscription = await client.subscribe([target], (event) => events.push(event));
  await waitFor(() => events[0]?.type === "baseline", "close-race baseline");

  gated.block();
  await authority.commit({
    conditions: [{ key: target, version: 0 }],
    writes: [{ type: "put", key: target, value: 1 }],
  });
  await gated.blockedSend;
  subscription.close();
  gated.release();

  assert.equal((await client.read([target])).records[0].value, 1);
  await tick();
  assert.deepEqual(events.map((event) => event.type), ["baseline"]);
  await server.close();
});

test("local close before a gated baseline suppresses delivery and preserves the binding", async () => {
  const target = { namespace: "close-race", key: "baseline" };
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([
    { ...target, value: "initial" },
  ]));
  const pair = createMemoryCarrierPair();
  const gated = createEventGatedCarrier(pair.left);
  const server = serveRealmStateCarrier(authority, gated.carrier);
  const binding = createRealmStateCarrierBinding(pair.right);
  const client = createRealmStateClient(binding);
  const events = [];
  const subscription = await client.subscribe([target], (event) => events.push(event));
  await gated.blockedSend;

  subscription.close();
  gated.release();

  assert.equal((await client.read([target])).records[0].value, "initial");
  await tick();
  assert.deepEqual(events, []);
  await server.close();
});

test("malformed failure responses atomically terminal read and commit correlations", async () => {
  const target = { namespace: "corrupt", key: "failure" };
  for (const operation of ["read", "commit"]) {
    const pair = createMemoryCarrierPair();
    const binding = createRealmStateCarrierBinding(pair.right);
    const client = createRealmStateClient(binding);
    const peer = receiveRealmStateMessages(pair.left)[Symbol.asyncIterator]();
    const result = operation === "read"
      ? client.read([target])
      : client.commit({
          conditions: [{ key: target, version: 0 }],
          writes: [{ type: "put", key: target, value: 1 }],
        });
    const request = await nextRequest(peer);
    await sendResponse(pair.left, request.id, {
      ok: false,
      failure: { code: "CONFLICT", message: 42 },
    });
    await assert.rejects(
      withTimeout(result, `${operation} malformed failure rejection`),
      fails(operation === "commit" ? "OUTCOME_UNKNOWN" : "BINDING_UNAVAILABLE"),
    );
    await binding.terminal;
  }
});

test("one corrupt response drains every active correlation with operation-specific evidence", async () => {
  const mutation = { namespace: "drain", key: "mutation" };
  const observation = { namespace: "drain", key: "observation" };
  const pair = createMemoryCarrierPair();
  const binding = createRealmStateCarrierBinding(pair.right);
  const client = createRealmStateClient(binding);
  const peer = receiveRealmStateMessages(pair.left)[Symbol.asyncIterator]();
  const commit = client.commit({
    conditions: [{ key: mutation, version: 0 }],
    writes: [{ type: "put", key: mutation, value: 1 }],
  });
  const read = client.read([observation]);
  const requests = [await nextRequest(peer), await nextRequest(peer)];
  const readRequest = requests.find((request) => request.method === "read");
  assert.ok(readRequest);
  await sendResponse(pair.left, readRequest.id, {
    ok: true,
    result: { revision: 0, records: "malformed" },
  });
  await Promise.all([
    assert.rejects(withTimeout(read, "drained read"), fails("BINDING_UNAVAILABLE")),
    assert.rejects(withTimeout(commit, "drained commit"), fails("OUTCOME_UNKNOWN")),
  ]);
  await binding.terminal;
});

test("read and readInitial require the exact requested identity set", async () => {
  const requested = { namespace: "semantic", key: "a" };
  const unexpected = { namespace: "semantic", key: "b" };
  for (const method of ["read", "readInitial"]) {
    const pair = createMemoryCarrierPair();
    const binding = createRealmStateCarrierBinding(pair.right);
    const client = createRealmStateClient(binding);
    const peer = receiveRealmStateMessages(pair.left)[Symbol.asyncIterator]();
    const result = client[method]([requested]);
    const request = await nextRequest(peer);
    await sendResponse(pair.left, request.id, {
      ok: true,
      result: method === "read"
        ? { revision: 0, records: [snapshotRecord(unexpected)] }
        : { records: [{ key: unexpected, value: null }] },
    });
    await assert.rejects(
      withTimeout(result, `${method} identity rejection`),
      fails("BINDING_UNAVAILABLE"),
    );
    await binding.terminal;
  }
});

test("namespace-filtered list and scan reject records outside the requested namespace", async () => {
  const unexpected = { namespace: "other", key: "record" };
  for (const method of ["list", "scan"]) {
    const pair = createMemoryCarrierPair();
    const binding = createRealmStateCarrierBinding(pair.right);
    const client = createRealmStateClient(binding);
    const peer = receiveRealmStateMessages(pair.left)[Symbol.asyncIterator]();
    const result = client[method]({ namespace: "requested" });
    const request = await nextRequest(peer);
    await sendResponse(pair.left, request.id, {
      ok: true,
      result: {
        revision: 0,
        records: method === "list"
          ? [indexRecord(unexpected, 0)]
          : [snapshotRecord(unexpected)],
      },
    });
    await assert.rejects(
      withTimeout(result, `${method} namespace rejection`),
      fails("BINDING_UNAVAILABLE"),
    );
    await binding.terminal;
  }
});

test("commit success evidence requires exactly the transaction write identities", async () => {
  const a = { namespace: "commit-set", key: "a" };
  const b = { namespace: "commit-set", key: "b" };
  const c = { namespace: "commit-set", key: "c" };
  for (const records of [
    [indexRecord(a)],
    [indexRecord(a), indexRecord(c)],
  ]) {
    const pair = createMemoryCarrierPair();
    const binding = createRealmStateCarrierBinding(pair.right);
    const client = createRealmStateClient(binding);
    const peer = receiveRealmStateMessages(pair.left)[Symbol.asyncIterator]();
    const result = client.commit({
      conditions: [
        { key: a, version: 0 },
        { key: b, version: 0 },
      ],
      writes: [
        { type: "put", key: a, value: 1 },
        { type: "put", key: b, value: 2 },
      ],
    });
    const request = await nextRequest(peer);
    await sendResponse(pair.left, request.id, {
      ok: true,
      result: { revision: 1, records },
    });
    await assert.rejects(
      withTimeout(result, "commit identity rejection"),
      fails("OUTCOME_UNKNOWN"),
    );
    await binding.terminal;
  }
});

test("subscription baseline requires the exact subscribed identity set", async () => {
  const a = { namespace: "subscription-set", key: "a" };
  const b = { namespace: "subscription-set", key: "b" };
  const c = { namespace: "subscription-set", key: "c" };
  const pair = createMemoryCarrierPair();
  const binding = createRealmStateCarrierBinding(pair.right);
  const peer = receiveRealmStateMessages(pair.left)[Symbol.asyncIterator]();
  const events = [];
  const pendingSubscription = binding.subscribe([a, b], (event) => events.push(event));
  const request = await nextRequest(peer);
  await sendResponse(pair.left, request.id, {
    ok: true,
    result: { subscriptionId: 7 },
  });
  await pendingSubscription;
  await sendEvent(pair.left, 7, {
    type: "baseline",
    snapshot: {
      revision: 0,
      records: [snapshotRecord(a), snapshotRecord(c)],
    },
  });
  await binding.terminal;
  await tick();
  assert.equal(events.some((event) => event.type === "baseline"), false);
  assert.equal(events.some((event) => event.type === "change"), false);
});

test("subscription changes must be a non-empty subset of subscribed identities", async () => {
  const a = { namespace: "subscription-set", key: "a" };
  const b = { namespace: "subscription-set", key: "b" };
  const c = { namespace: "subscription-set", key: "c" };
  for (const records of [[], [snapshotRecord(c, 1, 1)]]) {
    const pair = createMemoryCarrierPair();
    const binding = createRealmStateCarrierBinding(pair.right);
    const peer = receiveRealmStateMessages(pair.left)[Symbol.asyncIterator]();
    const events = [];
    const pendingSubscription = binding.subscribe([a, b], (event) => events.push(event));
    const request = await nextRequest(peer);
    await sendResponse(pair.left, request.id, {
      ok: true,
      result: { subscriptionId: 8 },
    });
    await pendingSubscription;
    await sendEvent(pair.left, 8, {
      type: "baseline",
      snapshot: {
        revision: 0,
        records: [snapshotRecord(a), snapshotRecord(b)],
      },
    });
    await waitFor(() => events[0]?.type === "baseline", "valid semantic baseline");
    await sendEvent(pair.left, 8, { type: "change", revision: 1, records });
    await binding.terminal;
    await tick();
    assert.deepEqual(events.filter((event) => event.type === "change"), []);
  }
});

test("a subscription protocol terminal retires its identity and forbids later events", async () => {
  const target = { namespace: "subscription-terminal", key: "target" };
  const pair = createMemoryCarrierPair();
  const binding = createRealmStateCarrierBinding(pair.right);
  const peer = receiveRealmStateMessages(pair.left)[Symbol.asyncIterator]();
  const events = [];
  const pendingSubscription = binding.subscribe([target], (event) => events.push(event));
  const request = await nextRequest(peer);
  await sendResponse(pair.left, request.id, {
    ok: true,
    result: { subscriptionId: 10 },
  });
  await pendingSubscription;
  await sendEvent(pair.left, 10, {
    type: "baseline",
    snapshot: { revision: 0, records: [snapshotRecord(target)] },
  });
  await waitFor(() => events[0]?.type === "baseline", "terminal lifecycle baseline");
  await sendEvent(pair.left, 10, { type: "terminal", reason: "authority-terminal" });
  await waitFor(() => events.at(-1)?.type === "terminal", "subscription terminal");
  await sendEvent(pair.left, 10, {
    type: "change",
    revision: 1,
    records: [snapshotRecord(target, 1, 1)],
  });
  await binding.terminal;
  assert.deepEqual(events.map((event) => event.type), ["baseline", "terminal"]);
});

test("unsubscribe ACK retires one tombstone after valid in-flight events", async () => {
  const target = { namespace: "unsubscribe", key: "target" };
  const pair = createMemoryCarrierPair();
  const binding = createRealmStateCarrierBinding(pair.right);
  const peer = receiveRealmStateMessages(pair.left)[Symbol.asyncIterator]();
  const events = [];
  const pendingSubscription = binding.subscribe([target], (event) => events.push(event));
  const subscribeRequest = await nextRequest(peer);
  await sendResponse(pair.left, subscribeRequest.id, {
    ok: true,
    result: { subscriptionId: 9 },
  });
  const subscription = await pendingSubscription;
  await sendEvent(pair.left, 9, {
    type: "baseline",
    snapshot: { revision: 0, records: [snapshotRecord(target)] },
  });
  await waitFor(() => events[0]?.type === "baseline", "ACK lifecycle baseline");

  subscription.close();
  subscription.close();
  const unsubscribeRequest = await nextRequest(peer);
  assert.equal(unsubscribeRequest.method, "unsubscribe");
  assert.equal(unsubscribeRequest.params.subscriptionId, 9);
  await sendEvent(pair.left, 9, {
    type: "change",
    revision: 1,
    records: [snapshotRecord(target, 1, 1)],
  });
  await tick();
  assert.deepEqual(events.map((event) => event.type), ["baseline"]);
  await sendResponse(pair.left, unsubscribeRequest.id, { ok: true, result: {} });
  await tick();

  const read = binding.read([target]);
  const readRequest = await nextRequest(peer);
  assert.equal(readRequest.method, "read");
  await sendResponse(pair.left, readRequest.id, {
    ok: true,
    result: { revision: 1, records: [snapshotRecord(target, 1, 1)] },
  });
  assert.equal((await read).records[0].value, 1);

  await sendEvent(pair.left, 9, {
    type: "change",
    revision: 2,
    records: [snapshotRecord(target, 2, 2)],
  });
  await binding.terminal;
});

test("locally aborted reads retain correlation until the remote response retires it", async () => {
  const a = { namespace: "abort", key: "a" };
  const b = { namespace: "abort", key: "b" };
  const pair = createMemoryCarrierPair();
  const binding = createRealmStateCarrierBinding(pair.right);
  const peer = receiveRealmStateMessages(pair.left)[Symbol.asyncIterator]();
  const controller = new AbortController();
  const reason = new Error("caller stopped waiting");
  const first = binding.read([a], { signal: controller.signal });
  const firstRequest = await nextRequest(peer);
  controller.abort(reason);
  await assert.rejects(withTimeout(first, "local abort"), (error) => error === reason);

  await sendResponse(pair.left, firstRequest.id, {
    ok: true,
    result: { revision: 0, records: [snapshotRecord(a)] },
  });
  await tick();
  const second = binding.read([b]);
  const secondRequest = await nextRequest(peer);
  assert.equal(secondRequest.method, "read");
  await sendResponse(pair.left, secondRequest.id, {
    ok: true,
    result: { revision: 0, records: [snapshotRecord(b, "still-live")] },
  });
  assert.equal((await second).records[0].value, "still-live");
  await binding.close();
});
