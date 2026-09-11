import assert from "node:assert/strict";
import test from "node:test";
import WebSocket from "ws";
import { LoopbackRendererControlBinding } from "../dist/loopback-renderer-control.js";

function connect(endpoint) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    socket.once("open", () => resolve(socket)); socket.once("error", reject);
  });
}

test("Control rendezvous converges in both arrival orders with one-shot endpoints", async () => {
  for (const order of ["acquire-first", "document-first"]) {
    const binding = new LoopbackRendererControlBinding();
    const acquireAbort = new AbortController();
    const documentAbort = new AbortController();
    let acquired;
    let document;
    if (order === "acquire-first") {
      acquired = binding.binding.acquire(`token-${order}`, acquireAbort.signal);
      document = binding.beginDocument(documentAbort.signal);
    } else {
      document = binding.beginDocument(documentAbort.signal);
      acquired = binding.binding.acquire(`token-${order}`, acquireAbort.signal);
    }
    const candidate = await document;
    const socket = await connect(candidate.controlEndpoint);
    const carrier = await acquired;
    await carrier.send("hello");
    assert.equal(await new Promise((resolve) => socket.once("message", (raw) => resolve(raw.toString()))), "hello");
    await assert.rejects(connect(candidate.controlEndpoint));
    candidate.retire(); binding.close(); socket.close();
  }
});

test("Control rendezvous cancellation does not consume the opposite side", async () => {
  const binding = new LoopbackRendererControlBinding();
  const firstDocument = new AbortController();
  const abandoned = binding.beginDocument(firstDocument.signal);
  firstDocument.abort(new Error("abandoned document"));
  await assert.rejects(abandoned, /abandoned document/u);
  const acquired = binding.binding.acquire("fresh-token", new AbortController().signal);
  const candidate = await binding.beginDocument(new AbortController().signal);
  const socket = await connect(candidate.controlEndpoint);
  assert.ok(await acquired);
  socket.close(); binding.close();
});
