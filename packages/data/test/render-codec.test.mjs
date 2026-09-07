import test from "node:test";
import assert from "node:assert/strict";
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
    binding: { carrier, subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
    handlers: {
      onInputState: () => ({ kind: "accepted" }),
      onInputEvent: () => ({ kind: "accepted" }),
      onInputReset: () => ({ kind: "accepted" }),
    },
  });
  return { peer, sent };
}

test("Render JSON keys use UTF-8 limits and every string is a Unicode scalar sequence", async () => {
  const exact = outboundHarness();
  assert.deepEqual(await exact.peer.render.sendSnapshot({
    type: "render.snapshot", domainId: "d", revision: 1, zIndex: 0,
    roots: [renderNode({ ["é".repeat(128)]: "😀" })],
  }), { kind: "sent" });
  assert.equal(exact.sent.length, 1);
  await exact.peer.close();

  for (const data of [
    { ["é".repeat(129)]: true },
    { value: "\ud800" },
    { nested: ["\udc00"] },
  ]) {
    const invalid = outboundHarness();
    const outcome = await invalid.peer.render.sendEvent({
      type: "render.event", domainId: "d", targetKey: "root", name: "tick", data,
    });
    assert.equal(outcome.kind, "terminal");
    assert.equal(outcome.terminal.kind, "local-fatal");
    assert.equal(invalid.sent.length, 0);
  }
});

test("Patch attrs and data Delta boundaries fail before carrier emission", async () => {
  const messages = [
    { attrs: { set: { ["é".repeat(65)]: "x" } } },
    { attrs: { set: { x: "\ud800" } } },
    { data: { set: { ["é".repeat(129)]: 1 } } },
    { data: { set: { x: "\ud800" } } },
    { data: { remove: ["é".repeat(129)] } },
  ];
  for (const delta of messages) {
    const invalid = outboundHarness();
    const outcome = await invalid.peer.render.sendPatch({
      type: "render.patch", domainId: "d", baseRevision: 1, revision: 2,
      ops: [{ op: "update", key: "root", ...delta }],
    });
    assert.equal(outcome.kind, "terminal");
    assert.equal(invalid.sent.length, 0);
  }
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
    binding: { carrier, subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
    handlers: {
      onInputInterest: () => ({ kind: "accepted" }),
      onRenderDomains: () => ({ kind: "accepted" }),
      onRenderSnapshot: () => ({ kind: "accepted" }),
      onRenderPatch: () => ({ kind: "accepted" }),
      onRenderEvent: () => { delivered += 1; return { kind: "accepted" }; },
    },
  });
  assert.equal((await peer.terminal).kind, "protocol-fatal");
  assert.equal(delivered, 0);
});
