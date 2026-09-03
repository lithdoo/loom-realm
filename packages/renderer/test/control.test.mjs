import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createMainRendererControlPeer, prepareRendererHelloResultV1 } from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "../dist/index.js";

const snapshot = (sessionId, revision) => ({ sessionId, revision, runtimes: [], stack: [], inputTarget: null, dataAuthorities: [] });

function main(pair, sessionId) {
  return createMainRendererControlPeer({
    carrier: pair.left,
    acceptHello() {
      const initial = snapshot(sessionId, 1);
      return { kind: "accepted", snapshot: initial, preparedHelloText: prepareRendererHelloResultV1(initial) };
    },
  });
}

const turn = () => new Promise((resolve) => setImmediate(resolve));

test("holder atomically installs initial peer+Snapshot before consuming later state", async () => {
  const pair = createMemoryCarrierPair();
  const publisher = main(pair, "a");
  const holder = createRendererControlHolder();
  const installed = await holder.connect({ carrier: pair.right, rendererControlToken: "t" });
  assert.equal(installed.kind, "installed");
  assert.equal(holder.current().snapshot.revision, 1);
  publisher.publish(snapshot("a", 2));
  await turn();
  assert.equal(holder.current().snapshot.revision, 2);
  assert.ok(Object.isFrozen(holder.current()));
});

test("replacement identity ignores old late state and old terminal", async () => {
  const a = createMemoryCarrierPair();
  const b = createMemoryCarrierPair();
  const mainA = main(a, "a");
  const mainB = main(b, "b");
  const holder = createRendererControlHolder();
  await holder.connect({ carrier: a.right, rendererControlToken: "a" });
  await holder.connect({ carrier: b.right, rendererControlToken: "b" });
  mainA.publish(snapshot("a", 2));
  mainA.retire();
  await turn();
  assert.equal(holder.current().snapshot.sessionId, "b");
  mainB.retire();
  await turn();
  assert.equal(holder.current(), null);
});
