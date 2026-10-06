import test from "node:test";
import assert from "node:assert/strict";
import { MessageChannel, Worker } from "node:worker_threads";
import {
  RealmStateError,
  createRealmStateAuthority,
  createRealmStateCarrierBinding,
  createRealmStateClient,
  createRealmStateMessagePortCarrier,
  prepareRealmStateDefinition,
  serveRealmStateCarrier,
} from "../dist/index.js";

const fails = (code) => (error) => error instanceof RealmStateError && error.code === code;
async function waitFor(predicate, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

test("Worker realization uses the same platform-neutral validation, ordering, OCC, and errors", async () => {
  const worker = new Worker(new URL("../fixtures/worker-harness.mjs", import.meta.url), { type: "module" });
  const result = await new Promise((resolve, reject) => {
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => { if (code !== 0) reject(new Error(`Worker exited ${code}`)); });
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.initialOrder, ["z", "é"]);
  assert.deepEqual(result.size, { encodedBytes: Buffer.byteLength(JSON.stringify({ emoji: "😀" })), depth: 1 });
  assert.equal(result.revision, 1);
  assert.equal(result.conflict, "CONFLICT");
  assert.deepEqual(result.scan.records.map((record) => record.key.namespace), ["z", "é"]);
});

test("MessagePort physical realization carries the same logical protocol without Node APIs in shared code", async () => {
  const { port1, port2 } = new MessageChannel();
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
  const server = serveRealmStateCarrier(authority, createRealmStateMessagePortCarrier(port1));
  const client = createRealmStateClient(
    createRealmStateCarrierBinding(createRealmStateMessagePortCarrier(port2)),
  );
  const target = { namespace: "browser", key: "portable" };
  await client.commit({
    conditions: [{ key: target, version: 0 }],
    writes: [{ type: "put", key: target, value: "ok" }],
  });
  assert.equal((await client.read([target])).records[0].value, "ok");
  await server.close();
});

test("MessagePort uses the shared subscription ordering and bounded backpressure model", async () => {
  const { port1, port2 } = new MessageChannel();
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
  const server = serveRealmStateCarrier(authority, createRealmStateMessagePortCarrier(port1));
  const client = createRealmStateClient(
    createRealmStateCarrierBinding(createRealmStateMessagePortCarrier(port2)),
  );
  const target = { namespace: "port", key: "pressure" };
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const events = [];
  await client.subscribe([target], async (event) => {
    events.push(event);
    if (event.type === "baseline") await gate;
  });
  await waitFor(() => events[0]?.type === "baseline", "MessagePort baseline");
  for (let version = 0; version < 65; version += 1) {
    await authority.commit({
      conditions: [{ key: target, version }],
      writes: [{ type: "put", key: target, value: version }],
    });
  }
  release();
  await waitFor(() => events.at(-1)?.type === "terminal", "MessagePort overflow");
  assert.equal(events[0].type, "baseline");
  assert.equal(events.at(-1).reason, "overflow");
  assert.equal(events.some((event, index) => index > 0 && event.type === "baseline"), false);
  await server.close();
});

test("MessagePort preserves post-dispatch unknown-outcome evidence without retry", async () => {
  const { port1, port2 } = new MessageChannel();
  let mutations = 0;
  const authority = {
    read: async () => ({ revision: 0, records: [] }),
    readInitial: async () => ({ records: [] }),
    list: async () => ({ revision: 0, records: [] }),
    scan: async () => ({ revision: 0, records: [] }),
    async commit() {
      mutations += 1;
      throw new Error("unexpected implementation failure");
    },
    subscribe: async () => ({ close() {} }),
  };
  serveRealmStateCarrier(authority, createRealmStateMessagePortCarrier(port1));
  const client = createRealmStateClient(
    createRealmStateCarrierBinding(createRealmStateMessagePortCarrier(port2)),
  );
  const target = { namespace: "port", key: "evidence" };
  await assert.rejects(client.commit({
    conditions: [{ key: target, version: 0 }],
    writes: [{ type: "put", key: target, value: 1 }],
  }), fails("OUTCOME_UNKNOWN"));
  assert.equal(mutations, 1);
});
