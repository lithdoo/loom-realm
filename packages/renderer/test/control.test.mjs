import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createMainRendererControlPeer, prepareRendererHelloResultV1 } from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "../dist/index.js";

const snapshot = (sessionId, revision, dataAuthorities = []) => ({
  sessionId,
  revision,
  runtimes: dataAuthorities.map(({ subsystemKey }) => ({ subsystemKey, state: "ready" })),
  stack: [],
  inputTarget: null,
  dataAuthorities,
});

function main(pair, sessionId, dataAuthorities = []) {
  return createMainRendererControlPeer({
    carrier: pair.left,
    acceptHello() {
      const initial = snapshot(sessionId, 1, dataAuthorities);
      return { kind: "accepted", snapshot: initial, preparedHelloText: prepareRendererHelloResultV1(initial) };
    },
  });
}

const turn = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await turn();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

const authority = (subsystemKey) => ({
  subsystemKey,
  generation: 1,
  dataProfile: "loomrealm.renderer-data/1",
});

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

test("public holder factory keeps the exact optional one-argument M8 seam", () => {
  assert.equal(createRendererControlHolder.length, 1);
  assert.ok(createRendererControlHolder());
  assert.throws(() => createRendererControlHolder(null), /Invalid RendererDataBinding/);
  assert.throws(() => createRendererControlHolder({}), /Invalid RendererDataBinding/);
  assert.throws(
    () => createRendererControlHolder({ get acquire() { throw new Error("getter"); } }),
    /Invalid RendererDataBinding/,
  );
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

test("concurrent connect on one holder fails fast without creating local currentness", async () => {
  let releaseSend;
  const sendGate = new Promise((resolve) => { releaseSend = resolve; });
  const closed = new Promise(() => {});
  const blockedCarrier = {
    closed,
    send() { return sendGate; },
    async *messages() {},
    async close() {},
  };
  const holder = createRendererControlHolder();
  const first = holder.connect({ carrier: blockedCarrier, rendererControlToken: "a" });

  const unused = createMemoryCarrierPair();
  await assert.rejects(
    holder.connect({ carrier: unused.right, rendererControlToken: "b" }),
    /connect already in progress/,
  );
  assert.equal(holder.current(), null);

  releaseSend();
  assert.deepEqual(await first, { kind: "terminal" });
  await unused.left.close();
});

test("Data reconciliation acquires exact authority, aborts removal, and closes late results", async () => {
  const control = createMemoryCarrierPair();
  const publisher = main(control, "a", [authority("demo")]);
  const requests = [];
  const holder = createRendererControlHolder({
    acquire(subsystemKey, generation, dataProfile, signal) {
      const gate = deferred();
      requests.push({ subsystemKey, generation, dataProfile, signal, gate });
      return gate.promise;
    },
  });
  assert.equal((await holder.connect({ carrier: control.right, rendererControlToken: "t" })).kind, "installed");
  await waitFor(() => requests.length === 1, "initial Data acquire");
  assert.deepEqual(
    { subsystemKey: requests[0].subsystemKey, generation: requests[0].generation, dataProfile: requests[0].dataProfile },
    authority("demo"),
  );

  publisher.publish(snapshot("a", 2));
  await waitFor(() => requests[0].signal.aborted, "stale acquire abort");
  const late = createMemoryCarrierPair();
  requests[0].gate.resolve(late.right);
  assert.deepEqual(await late.left.closed, { kind: "closed" });
  assert.equal(holder.current().snapshot.dataAuthorities.length, 0);
});

test("Data terminal reacquires while one slot failure remains isolated until Control changes", async () => {
  const authorities = [authority("s1"), authority("s2"), authority("s3")];
  const controlA = createMemoryCarrierPair();
  main(controlA, "a", authorities);
  const requests = [];
  const s1Pairs = [];
  const holder = createRendererControlHolder({
    acquire(subsystemKey, generation, dataProfile, signal) {
      const gate = deferred();
      requests.push({ subsystemKey, generation, dataProfile, signal, gate });
      if (subsystemKey === "s1") {
        const pair = createMemoryCarrierPair();
        s1Pairs.push(pair);
        gate.resolve(pair.right);
      } else if (subsystemKey === "s3") {
        gate.reject(new Error("slot failure"));
      }
      return gate.promise;
    },
  });
  await holder.connect({ carrier: controlA.right, rendererControlToken: "a" });
  await waitFor(() => requests.length === 3, "three independent slot acquires");
  await turn();
  assert.equal(requests.filter(({ subsystemKey }) => subsystemKey === "s3").length, 1);
  const s2A = requests.find(({ subsystemKey }) => subsystemKey === "s2");
  assert.equal(s2A.signal.aborted, false);

  await s1Pairs[0].left.close();
  await waitFor(
    () => requests.filter(({ subsystemKey }) => subsystemKey === "s1").length === 2,
    "same-generation s1 reacquire",
  );
  assert.equal(s2A.signal.aborted, false);
  assert.equal(requests.filter(({ subsystemKey }) => subsystemKey === "s3").length, 1);

  const controlB = createMemoryCarrierPair();
  main(controlB, "b", authorities);
  await holder.connect({ carrier: controlB.right, rendererControlToken: "b" });
  await waitFor(() => s2A.signal.aborted, "old Control pending abort");
  assert.deepEqual(await s1Pairs[1].left.closed, { kind: "closed" });
  await waitFor(
    () => requests.filter(({ subsystemKey }) => subsystemKey === "s3").length === 2,
    "new Control clears old failed identity",
  );
});

test("trusted Renderer Data construction failure closes the carrier and suppresses same-identity retry", async () => {
  const controlA = createMemoryCarrierPair();
  const publisherA = main(controlA, "a", [authority("demo")]);
  let acquireCount = 0;
  let closeCount = 0;
  const holder = createRendererControlHolder({
    async acquire() {
      acquireCount += 1;
      return {
        closed: new Promise(() => {}),
        close() {
          closeCount += 1;
        },
      };
    },
  });
  await holder.connect({ carrier: controlA.right, rendererControlToken: "a" });
  await waitFor(() => closeCount === 1, "malformed carrier close");
  publisherA.publish(snapshot("a", 2, [authority("demo")]));
  await turn();
  assert.equal(acquireCount, 1);

  const controlB = createMemoryCarrierPair();
  main(controlB, "b", [authority("demo")]);
  await holder.connect({ carrier: controlB.right, rendererControlToken: "b" });
  await waitFor(() => acquireCount === 2, "new Control retry");
});

test("throwing carrier close getter stays isolated during Renderer construction failure", async () => {
  const control = createMemoryCarrierPair();
  main(control, "a", [authority("demo")]);
  let acquireCount = 0;
  const holder = createRendererControlHolder({
    async acquire() {
      acquireCount += 1;
      return {
        get close() {
          throw new Error("close getter failed");
        },
      };
    },
  });
  await holder.connect({ carrier: control.right, rendererControlToken: "a" });
  await waitFor(() => acquireCount === 1, "malformed carrier acquisition");
  await turn();
  assert.equal(holder.current().snapshot.sessionId, "a");
});
