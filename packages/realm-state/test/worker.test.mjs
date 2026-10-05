import test from "node:test";
import assert from "node:assert/strict";
import { MessageChannel, Worker } from "node:worker_threads";
import {
  createRealmStateAuthority,
  createRealmStateCarrierBinding,
  createRealmStateClient,
  createRealmStateMessagePortCarrier,
  prepareRealmStateDefinition,
  serveRealmStateCarrier,
} from "../dist/index.js";

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
