import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  connectSubsystemRuntimeControl,
  createMainRuntimeControlPeer,
} from "../dist/index.js";

const scheduler = {
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
};
const subsystemHandlers = {
  onShutdown: () => ({ kind: "success", result: {} }),
  onFrameInitialize: () => ({ kind: "success", result: {} }),
  onFrameActivate: () => ({ kind: "success", result: {} }),
  onFrameSuspend: () => ({ kind: "success", result: {} }),
  onFrameResume: () => ({ kind: "success", result: {} }),
  onFrameClose: () => ({ kind: "success", result: {} }),
};
async function session() {
  const pair = createMemoryCarrierPair();
  const main = createMainRuntimeControlPeer({
    carrier: pair.left,
    scheduler,
    frameDeadlineMs: 1000,
    shutdownDeadlineMs: 1000,
    authenticateHello: () => ({ kind: "accepted" }),
    handlers: {
      onStatus() {},
      onFrameCall: () => ({ kind: "success", result: { childFrameId: "x" } }),
      onFrameReturn: () => ({ kind: "success", result: {} }),
    },
  });
  const outcome = await connectSubsystemRuntimeControl({
    carrier: pair.right,
    scheduler,
    helloDeadlineMs: 1000,
    frameDeadlineMs: 1000,
    hello: { key: "s", bootstrapToken: "t", protocolVersions: [1] },
    handlers: subsystemHandlers,
  });
  assert.equal(outcome.kind, "connected");
  await main.identified;
  return { main, subsystem: outcome.peer };
}

test("duplicate hello versions are rejected before carrier ownership", async () => {
  const pair = createMemoryCarrierPair();
  await assert.rejects(
    () =>
      connectSubsystemRuntimeControl({
        carrier: pair.right,
        scheduler,
        helloDeadlineMs: 1,
        frameDeadlineMs: 1000,
        hello: { key: "s", bootstrapToken: "t", protocolVersions: [1, 1] },
        handlers: subsystemHandlers,
      }),
    /protocolVersions/,
  );
  let settled = false;
  pair.right.closed.then(() => {
    settled = true;
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);
  await pair.right.close();
});

test("unpaired surrogate and cyclic business data fail closed locally", async () => {
  for (const input of [
    "\ud800",
    (() => {
      const value = {};
      value.self = value;
      return value;
    })(),
  ]) {
    const { main } = await session();
    const outcome = await main.frame.initialize({ frameId: "f", input });
    assert.equal(outcome.kind, "terminal");
    assert.equal(outcome.terminal.kind, "local-fatal");
  }
});

test("outbound shared DAG is measured by serialized occurrence", async () => {
  const { main } = await session();
  const shared = "界".repeat(100_000);
  const outcome = await main.frame.initialize({
    frameId: "f",
    input: [shared, shared],
  });
  assert.equal(outcome.kind, "terminal");
  assert.equal(outcome.terminal.kind, "local-fatal");
});

test("deep input is rejected iteratively without stack overflow", async () => {
  const { main } = await session();
  let input = null;
  for (let i = 0; i < 70; i++) input = [input];
  const outcome = await main.frame.initialize({ frameId: "f", input });
  assert.equal(outcome.kind, "terminal");
  assert.equal(outcome.terminal.kind, "local-fatal");
});
