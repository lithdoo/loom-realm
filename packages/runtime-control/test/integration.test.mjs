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
    let active = true;
    return () => {
      if (active) {
        active = false;
        clearTimeout(timer);
      }
    };
  },
};
const hello = {
  key: "renderer",
  bootstrapToken: "secret",
  protocolVersions: [1],
};
const subsystemHandlers = {
  onShutdown: () => ({ kind: "success", result: {} }),
  onFrameInitialize: () => ({ kind: "success", result: {} }),
  onFrameActivate: () => ({ kind: "success", result: {} }),
  onFrameSuspend: () => ({ kind: "success", result: {} }),
  onFrameResume: () => ({ kind: "success", result: {} }),
  onFrameClose: () => ({ kind: "success", result: {} }),
};

test("hello, ordered status, bidirectional Frame RPC, and shutdown form a closed session", async () => {
  const pair = createMemoryCarrierPair();
  const statuses = [];
  const calls = [];
  const main = createMainRuntimeControlPeer({
    carrier: pair.left,
    scheduler,
    frameDeadlineMs: 1000,
    shutdownDeadlineMs: 1000,
    authenticateHello: (p) =>
      p.bootstrapToken === "secret"
        ? { kind: "accepted" }
        : { kind: "rejected", code: "BOOTSTRAP_AUTHENTICATION_FAILED" },
    handlers: {
      onStatus: (s) => statuses.push(s.state),
      onFrameCall: (p) => {
        calls.push(p);
        return { kind: "success", result: { childFrameId: "child" } };
      },
      onFrameReturn: () => ({ kind: "success", result: {} }),
    },
  });
  const connected = await connectSubsystemRuntimeControl({
    carrier: pair.right,
    scheduler,
    helloDeadlineMs: 1000,
    frameDeadlineMs: 1000,
    hello,
    handlers: subsystemHandlers,
  });
  assert.equal(connected.kind, "connected");
  assert.deepEqual(await main.identified, {
    kind: "identified",
    key: "renderer",
    protocolVersion: 1,
  });
  const subsystem = connected.peer;
  assert.deepEqual(
    await main.frame.initialize({ frameId: "root", input: { value: 1 } }),
    { kind: "success", result: {} },
  );
  assert.deepEqual(
    await subsystem.frame.call({
      frameId: "root",
      activationId: "a",
      targetSubsystemKey: "audio",
      input: null,
    }),
    { kind: "success", result: { childFrameId: "child" } },
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(await subsystem.control.status({ state: "initializing" }), {
    kind: "sent",
  });
  assert.deepEqual(await subsystem.control.status({ state: "ready" }), {
    kind: "sent",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(statuses, ["initializing", "ready"]);
  assert.deepEqual(await main.control.shutdown({ reason: "session-end" }), {
    kind: "success",
    result: {},
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await subsystem.control.status({ state: "stopping" }), {
    kind: "sent",
  });
  await main.close();
  assert.equal((await subsystem.terminal).kind, "carrier-closed");
});

test("unsupported protocol is rejected before authentication", async () => {
  const pair = createMemoryCarrierPair();
  let authCalls = 0;
  const main = createMainRuntimeControlPeer({
    carrier: pair.left,
    scheduler,
    frameDeadlineMs: 1000,
    shutdownDeadlineMs: 1000,
    authenticateHello: () => {
      authCalls++;
      return { kind: "accepted" };
    },
    handlers: {
      onStatus() {},
      onFrameCall() {
        return { kind: "success", result: { childFrameId: "x" } };
      },
      onFrameReturn() {
        return { kind: "success", result: {} };
      },
    },
  });
  const result = await connectSubsystemRuntimeControl({
    carrier: pair.right,
    scheduler,
    helloDeadlineMs: 1000,
    frameDeadlineMs: 1000,
    hello: { ...hello, protocolVersions: [2] },
    handlers: subsystemHandlers,
  });
  assert.deepEqual(result, {
    kind: "rejected",
    error: { code: "CONTROL_PROTOCOL_UNSUPPORTED" },
  });
  assert.equal(authCalls, 0);
  assert.equal((await main.identified).kind, "rejected");
});

test("a second subsystem mutation is local-fatal without a second send", async () => {
  const pair = createMemoryCarrierPair();
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  createMainRuntimeControlPeer({
    carrier: pair.left,
    scheduler,
    frameDeadlineMs: 1000,
    shutdownDeadlineMs: 1000,
    authenticateHello: () => ({ kind: "accepted" }),
    handlers: {
      onStatus() {},
      async onFrameCall() {
        await blocked;
        return { kind: "success", result: { childFrameId: "x" } };
      },
      onFrameReturn() {
        return { kind: "success", result: {} };
      },
    },
  });
  const result = await connectSubsystemRuntimeControl({
    carrier: pair.right,
    scheduler,
    helloDeadlineMs: 1000,
    frameDeadlineMs: 1000,
    hello,
    handlers: subsystemHandlers,
  });
  assert.equal(result.kind, "connected");
  const first = result.peer.frame.call({
    frameId: "f",
    activationId: "a",
    targetSubsystemKey: "x",
    input: null,
  });
  const second = await result.peer.frame.returnFrame({
    frameId: "f",
    activationId: "a",
    result: { type: "cancelled" },
  });
  assert.equal(second.kind, "terminal");
  assert.equal(second.terminal.kind, "local-fatal");
  release();
  assert.equal((await first).kind, "terminal");
});
