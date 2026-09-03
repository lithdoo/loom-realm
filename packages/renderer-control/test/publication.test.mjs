import test from "node:test";
import assert from "node:assert/strict";
import { createMainRendererControlPeer, prepareRendererHelloResultV1 } from "../dist/index.js";

const snapshot = (revision) => ({ sessionId: "s", revision, runtimes: [], stack: [], inputTarget: null, dataAuthorities: [] });

test("publication holds one in-flight and only latest pending Snapshot", async () => {
  const sent = [];
  const releases = [];
  let closeCalls = 0;
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  async function* messages() {
    yield JSON.stringify({ jsonrpc: "2.0", id: 1, method: "renderer.hello", params: { rendererControlToken: "t", protocolVersions: [1] } });
    await closed;
  }
  const carrier = {
    messages,
    closed,
    send(text) { sent.push(text); return new Promise((resolve) => releases.push(resolve)); },
    async close() { closeCalls += 1; resolveClosed({ kind: "closed" }); },
  };
  const peer = createMainRendererControlPeer({ carrier, acceptHello() { const initial = snapshot(1); return { kind: "accepted", snapshot: initial, preparedHelloText: prepareRendererHelloResultV1(initial) }; } });
  while (releases.length === 0) await new Promise((resolve) => setImmediate(resolve));
  peer.publish(snapshot(2));
  peer.publish(snapshot(3));
  releases.shift()();
  while (releases.length === 0) await new Promise((resolve) => setImmediate(resolve));
  releases.shift()();
  while (sent.length < 2) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(JSON.parse(sent[1]).params.snapshot.revision, 3);
  peer.retire();
  assert.equal(peer.publish(snapshot(4)).kind, "terminal");
  assert.equal(closeCalls, 1);
});

test("retirement wins once, clears pending, and never starts a post-retirement send", async () => {
  const sent = [];
  const releases = [];
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  async function* messages() {
    yield JSON.stringify({ jsonrpc: "2.0", id: 1, method: "renderer.hello", params: { rendererControlToken: "t", protocolVersions: [1] } });
    await closed;
  }
  const carrier = {
    messages,
    closed,
    send(text) { sent.push(text); return new Promise((resolve) => releases.push(resolve)); },
    async close() { resolveClosed({ kind: "closed" }); },
  };
  const peer = createMainRendererControlPeer({ carrier, acceptHello() { const initial = snapshot(1); return { kind: "accepted", snapshot: initial, preparedHelloText: prepareRendererHelloResultV1(initial) }; } });
  while (releases.length === 0) await new Promise((resolve) => setImmediate(resolve));
  releases.shift()();
  while (sent.length < 1) await new Promise((resolve) => setImmediate(resolve));
  peer.publish(snapshot(2));
  peer.publish(snapshot(3));
  while (sent.length < 2) await new Promise((resolve) => setImmediate(resolve));
  const first = peer.retire();
  assert.equal(first.kind, "retired");
  assert.equal(peer.retire(), first);
  releases.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 2);
});
