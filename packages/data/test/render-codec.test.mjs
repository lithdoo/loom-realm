import test from "node:test";
import assert from "node:assert/strict";
import { jsonDepth } from "@loomrealm/wire";
import { createSubsystemDataPeer } from "../dist/index.js";

const renderNode = (data = {}) => ({ key: "root", tag: "sprite", attrs: {}, data, children: [] });

function outboundHarness() {
  const sent = [];
  let finish;
  const closed = new Promise((resolve) => { finish = resolve; });
  const carrier = {
    closed,
    async send(raw) { sent.push(raw); },
    async *messages() { await closed; },
    async close() { finish({ kind: "closed" }); },
  };
  const peer = createSubsystemDataPeer({
    binding: { carrier, subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/3" },
    handlers: {
      onViewportState: () => ({ kind: "accepted" }),
    },
  });
  return { peer, sent };
}

function globalDepthMessage(target) {
  for (let extra = 0; extra <= 32; extra += 1) {
    const leaf = { key: "n30", tag: "sprite", attrs: {}, data: {}, children: [] };
    let parent = leaf;
    for (let depth = 29; depth >= 1; depth -= 1) {
      parent = { key: `n${depth}`, tag: "sprite", attrs: {}, data: {}, children: [parent] };
    }
    let data = null;
    for (let depth = 1; depth < extra; depth += 1) data = { child: data };
    leaf.data = extra === 0 ? {} : { deep: data };
    const message = { type: "render.snapshot", domainId: "d", revision: 1, zIndex: 0, roots: [parent] };
    if (jsonDepth(message) === target) return message;
  }
  throw new Error(`Cannot construct Render message at JSON depth ${target}`);
}

test("Render strings keep scalar semantics without historical byte limits", async () => {
  const harness = outboundHarness();
  assert.deepEqual(await harness.peer.render.sendSnapshot({
    type: "render.snapshot", domainId: "d", revision: 1, zIndex: 0,
    roots: [renderNode({ ["é".repeat(1024)]: "😀", payload: "x".repeat(300_000) })],
  }), { kind: "sent" });
  assert.equal(harness.sent.length, 1);

  for (const data of [
    { value: "\ud800" },
    { nested: ["\udc00"] },
  ]) {
    assert.throws(() => harness.peer.render.sendEvent({
      type: "render.event", domainId: "d", targetKey: "root", name: "tick", data,
    }), /Unicode/);
  }
  assert.deepEqual(await harness.peer.render.sendDomains({ type: "render.domains", domains: ["healthy"] }), { kind: "sent" });
  await harness.peer.close();
});

test("outbound Render generic data is inspected only by the final serialization traversal", async () => {
  const harness = outboundHarness();
  let ownKeyVisits = 0;
  let prototypeVisits = 0;
  const payload = new Proxy({
    rows: Array.from({ length: 2_000 }, (_, index) => ({ index, label: `row-${index}` })),
  }, {
    ownKeys(target) {
      ownKeyVisits += 1;
      return Reflect.ownKeys(target);
    },
    getPrototypeOf(target) {
      prototypeVisits += 1;
      return Reflect.getPrototypeOf(target);
    },
  });

  assert.deepEqual(await harness.peer.render.sendEvent({
    type: "render.event",
    domainId: "d",
    targetKey: "root",
    name: "tick",
    data: { payload },
  }), { kind: "sent" });
  assert.equal(ownKeyVisits, 1);
  assert.equal(prototypeVisits, 1);
  assert.equal(harness.sent.length, 1);
  console.log("RENDER_CODEC_TRAVERSAL", JSON.stringify({
    genericRows: 2_000,
    codecFullGenericTraversals: 0,
    finalSerializationTraversals: 1,
    instrumentedPayloadOwnKeyVisits: ownKeyVisits,
    instrumentedPayloadPrototypeVisits: prototypeVisits,
  }));
  await harness.peer.close();
});

test("serialization still rejects invalid nested Render representation synchronously", async () => {
  const harness = outboundHarness();
  const sparse = [];
  sparse.length = 1;
  const cyclic = {};
  cyclic.self = cyclic;
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "value", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  const symbolic = {};
  symbolic[Symbol("hidden")] = 1;

  for (const value of [sparse, cyclic, accessor, symbolic, new Date(), NaN, undefined]) {
    assert.throws(() => harness.peer.render.sendEvent({
      type: "render.event",
      domainId: "d",
      targetKey: "root",
      name: "tick",
      data: { value },
    }));
  }
  assert.equal(getterCalls, 0);
  assert.deepEqual(await harness.peer.render.sendDomains({ type: "render.domains", domains: ["healthy"] }), { kind: "sent" });
  await harness.peer.close();
});

test("Patch attrs and data Deltas exceed historical string and op limits", async () => {
  const harness = outboundHarness();
  const ops = Array.from({ length: 4_097 }, (_, index) => ({
    op: "update", key: `node-${index}-${"k".repeat(160)}`,
    attrs: { set: { ["a".repeat(160)]: "v".repeat(5_000) } },
    data: { set: { ["é".repeat(300)]: index } },
  }));
  assert.deepEqual(await harness.peer.render.sendPatch({
    type: "render.patch", domainId: "d", baseRevision: 1, revision: 2, ops,
  }), { kind: "sent" });
  assert.equal(harness.sent.length, 1);
  await harness.peer.close();
});

test("invalid Render representation retires inbound Data before handler delivery", async () => {
  let delivered = 0;
  const carrier = (() => {
    let finish;
    const closed = new Promise((resolve) => { finish = resolve; });
    return {
      closed,
      async send() {},
      async *messages() {
        yield JSON.stringify({
          type: "render.event", domainId: "d", targetKey: "root", name: "tick",
          data: { value: "\ud800" },
        });
        await closed;
      },
      async close() { finish({ kind: "closed" }); },
    };
  })();
  const { createRendererDataPeer } = await import("../dist/index.js");
  const peer = createRendererDataPeer({
    binding: { carrier, subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/3" },
    handlers: {
      onRenderDomains: () => ({ kind: "accepted" }),
      onRenderSnapshot: () => ({ kind: "accepted" }),
      onRenderPatch: () => ({ kind: "accepted" }),
      onRenderEvent: () => { delivered += 1; return { kind: "accepted" }; },
    },
  });
  const terminal = await peer.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "render");
  assert.equal(delivered, 0);
});

test("outbound accepts valid global JSON depth over the historical 64 cap", async () => {
  const harness = outboundHarness();
  assert.deepEqual(await harness.peer.render.sendSnapshot(globalDepthMessage(65)), { kind: "sent" });
  assert.equal(harness.sent.length, 1);
  await harness.peer.close();
});
