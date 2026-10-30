import test from "node:test";
import assert from "node:assert/strict";
import {
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V3,
} from "../dist/index.js";

const accepted = () => ({ kind: "accepted" });
const binding = (carrier) => ({
  carrier,
  subsystemKey: "map",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V3,
});
const handlers = {
  onViewportState: accepted,
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate) {
  for (let i = 0; i < 50; i += 1) {
    if (predicate()) return;
    await tick();
  }
  throw new Error("timed out waiting for writer condition");
}

function createWriterCarrier() {
  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  const sent = [];
  let active = 0;
  let maxActive = 0;
  let sendGate = Promise.resolve();
  let releaseSend = () => {};
  const carrier = {
    closed,
    sent,
    get maxActive() {
      return maxActive;
    },
    holdSend() {
      sendGate = new Promise((resolve) => {
        releaseSend = resolve;
      });
    },
    releaseSend() {
      releaseSend();
      sendGate = Promise.resolve();
    },
    async send(text) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sendGate;
      sent.push(text);
      active -= 1;
    },
    async *messages() {
      await closed;
    },
    async close() {
      resolveClosed({ kind: "closed" });
    },
    closeNow() {
      resolveClosed({ kind: "closed" });
    },
  };
  return carrier;
}

test("writer preserves enqueue order across Render messages", async () => {
  const carrier = createWriterCarrier();
  const subsystem = createSubsystemDataPeer({
    binding: binding(carrier),
    handlers,
  });
  const results = await Promise.all([
    subsystem.render.sendDomains({ type: "render.domains", domains: ["hud"] }),
    subsystem.render.sendDomains({ type: "render.domains", domains: ["menu"] }),
    subsystem.render.sendEvent({
      type: "render.event",
      domainId: "hud",
      targetKey: "root",
      name: "click",
      data: {},
    }),
  ]);
  assert.deepEqual(results, [{ kind: "sent" }, { kind: "sent" }, { kind: "sent" }]);
  assert.deepEqual(
    carrier.sent.map((text) => JSON.parse(text).type),
    ["render.domains", "render.domains", "render.event"],
  );
  assert.equal(carrier.maxActive, 1);
  await subsystem.close();
});

test("send after terminal emits zero bytes", async () => {
  const carrier = createWriterCarrier();
  const subsystem = createSubsystemDataPeer({
    binding: binding(carrier),
    handlers,
  });
  await subsystem.close();
  const before = carrier.sent.length;
  const result = await subsystem.render.sendDomains({ type: "render.domains", domains: [] });
  assert.equal(result.kind, "terminal");
  assert.equal(carrier.sent.length, before);
});

test("emitted send stays sent when terminal races after carrier.send resolves", async () => {
  const carrier = createWriterCarrier();
  carrier.holdSend();
  const subsystem = createSubsystemDataPeer({
    binding: binding(carrier),
    handlers,
  });
  const sendOp = subsystem.render.sendDomains({ type: "render.domains", domains: [] });
  await waitFor(() => carrier.maxActive === 1);
  carrier.closeNow();
  await tick();
  carrier.releaseSend();
  const result = await sendOp;
  assert.deepEqual(result, { kind: "sent" });
  assert.equal(carrier.sent.length, 1);
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "carrier-closed");
});

test("writer pending operations settle exactly once on terminal", async () => {
  const carrier = createWriterCarrier();
  carrier.holdSend();
  const subsystem = createSubsystemDataPeer({
    binding: binding(carrier),
    handlers,
  });
  const first = subsystem.render.sendDomains({ type: "render.domains", domains: ["a"] });
  const second = subsystem.render.sendDomains({ type: "render.domains", domains: ["pending"] });
  const third = subsystem.render.sendDomains({ type: "render.domains", domains: ["b"] });
  await waitFor(() => carrier.maxActive === 1);
  carrier.closeNow();
  await tick();
  carrier.releaseSend();
  const results = await Promise.all([first, second, third]);
  assert.equal(results[0].kind, "sent");
  assert.equal(results[1].kind, "terminal");
  assert.equal(results[2].kind, "terminal");
  assert.equal(carrier.sent.length, 1);
  assert.equal(results.filter((result) => result.kind === "terminal").length, 2);
});

test("controlled backlog exceeds the historical 1024 threshold without admission failure", async () => {
  const carrier = createWriterCarrier();
  carrier.holdSend();
  const subsystem = createSubsystemDataPeer({ binding: binding(carrier), handlers });
  const operations = Array.from({ length: 1_100 }, (_, index) =>
    subsystem.render.sendDomains({ type: "render.domains", domains: [`d${index}`] }));
  await waitFor(() => carrier.maxActive === 1);
  assert.equal(subsystem.peekTerminal?.(), undefined);
  carrier.closeNow();
  carrier.releaseSend();
  const results = await Promise.all(operations);
  assert.equal(results[0].kind, "sent");
  assert.equal(results.slice(1).every((result) => result.kind === "terminal"), true);
  assert.equal((await subsystem.terminal).kind, "carrier-closed");
});

test("carrier.send reject with a kind object is carrier-lost and matches peer.terminal", async () => {
  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  const cause = { kind: "closed" };
  const carrier = {
    closed,
    async send() {
      throw cause;
    },
    async *messages() {
      await closed;
    },
    async close() {
      resolveClosed({ kind: "closed" });
    },
  };
  const subsystem = createSubsystemDataPeer({
    binding: binding(carrier),
    handlers,
  });
  const result = await subsystem.render.sendDomains({ type: "render.domains", domains: [] });
  assert.equal(result.kind, "terminal");
  assert.equal(result.terminal.kind, "carrier-lost");
  assert.equal(result.terminal.cause, cause);
  assert.equal(result.terminal, await subsystem.terminal);
});
