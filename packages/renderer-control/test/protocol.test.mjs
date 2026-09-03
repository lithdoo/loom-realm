import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  connectRendererControlPeer,
  createMainRendererControlPeer,
  prepareRendererHelloResultV1,
} from "../dist/index.js";

const snapshot = (revision = 1) => Object.freeze({
  sessionId: "session",
  revision,
  runtimes: Object.freeze([{ subsystemKey: "game", state: "ready" }]),
  stack: Object.freeze([{ frameId: "f:1", subsystemKey: "game", lifecycle: "active", activationId: "a:1" }]),
  inputTarget: Object.freeze({ subsystemKey: "game", frameId: "f:1", activationId: "a:1" }),
  dataAuthorities: Object.freeze([]),
});

test("concrete peers perform one-shot hello and lazy initial handoff", async () => {
  const pair = createMemoryCarrierPair();
  const main = createMainRendererControlPeer({
    carrier: pair.left,
    acceptHello(peer, params, version) {
      assert.equal(params.rendererControlToken, "token");
      assert.equal(version, 1);
      const initial = snapshot();
      return { kind: "accepted", snapshot: initial, preparedHelloText: prepareRendererHelloResultV1(initial) };
    },
  });
  const connected = await connectRendererControlPeer({ carrier: pair.right, rendererControlToken: "token" });
  assert.equal(connected.kind, "connected");
  assert.equal(connected.snapshot.revision, 1);

  main.publish(snapshot(2));
  const iterator = connected.peer.states()[Symbol.asyncIterator]();
  assert.equal((await iterator.next()).value.revision, 2);
  await connected.peer.close();
});

test("protocol peer rejects unsupported version before authority acceptance", async () => {
  const pair = createMemoryCarrierPair();
  let calls = 0;
  createMainRendererControlPeer({ carrier: pair.left, acceptHello() { calls += 1; throw new Error("unreachable"); } });
  const outcome = await connectRendererControlPeer({ carrier: pair.right, rendererControlToken: "token", protocolVersions: [2] });
  assert.deepEqual(outcome, { kind: "rejected", code: "RENDERER_CONTROL_PROTOCOL_UNSUPPORTED" });
  assert.equal(calls, 0);
});

test("renderer peer fail-closes revision regression", async () => {
  const pair = createMemoryCarrierPair();
  const main = createMainRendererControlPeer({
    carrier: pair.left,
    acceptHello() { const value = snapshot(2); return { kind: "accepted", snapshot: value, preparedHelloText: prepareRendererHelloResultV1(value) }; },
  });
  const connected = await connectRendererControlPeer({ carrier: pair.right, rendererControlToken: "token" });
  assert.equal(connected.kind, "connected");
  main.publish(snapshot(2));
  const iterator = connected.peer.states()[Symbol.asyncIterator]();
  assert.equal((await iterator.next()).done, true);
  assert.equal((await connected.peer.terminal).kind, "protocol-fatal");
});
