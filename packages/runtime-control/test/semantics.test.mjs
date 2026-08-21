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
const success = () => ({ kind: "success", result: {} });

async function connect(mainHandlers, subsystemHandlers) {
  const pair = createMemoryCarrierPair();
  const main = createMainRuntimeControlPeer({
    carrier: pair.left,
    scheduler,
    frameDeadlineMs: 1000,
    shutdownDeadlineMs: 1000,
    authenticateHello: () => ({ kind: "accepted" }),
    handlers: mainHandlers,
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

test("all seven frozen Frame methods route only to their owning role", async () => {
  const seen = [];
  const { main, subsystem } = await connect(
    {
      onStatus() {},
      onFrameCall() {
        seen.push("call");
        return { kind: "success", result: { childFrameId: "child" } };
      },
      onFrameReturn() {
        seen.push("return");
        return success();
      },
    },
    {
      onShutdown: success,
      onFrameInitialize() {
        seen.push("initialize");
        return success();
      },
      onFrameActivate() {
        seen.push("activate");
        return success();
      },
      onFrameSuspend() {
        seen.push("suspend");
        return success();
      },
      onFrameResume() {
        seen.push("resume");
        return success();
      },
      onFrameClose() {
        seen.push("close");
        return success();
      },
    },
  );
  await main.frame.initialize({ frameId: "f", input: null });
  await main.frame.activate({ frameId: "f", activationId: "a" });
  await main.frame.suspend({ frameId: "f", activationId: "a" });
  await main.frame.resume({
    frameId: "f",
    activationId: "a",
    returnedFrameId: "child",
    result: { type: "cancelled" },
  });
  await main.frame.closeFrame({ frameId: "f" });
  await subsystem.frame.call({
    frameId: "f",
    activationId: "a",
    targetSubsystemKey: "target",
    input: null,
  });
  await subsystem.frame.returnFrame({
    frameId: "f",
    activationId: "a",
    result: { type: "completed", value: null },
  });
  assert.deepEqual(seen, [
    "initialize",
    "activate",
    "suspend",
    "resume",
    "close",
    "call",
    "return",
  ]);
  await main.close();
});

test("recoverable Frame errors release the mutation gate", async () => {
  let calls = 0;
  const { main, subsystem } = await connect(
    {
      onStatus() {},
      onFrameCall() {
        calls += 1;
        return calls === 1
          ? {
              kind: "semantic-error",
              error: { code: "FRAME_CALL_TARGET_NOT_FOUND" },
            }
          : { kind: "success", result: { childFrameId: "child" } };
      },
      onFrameReturn: success,
    },
    {
      onShutdown: success,
      onFrameInitialize: success,
      onFrameActivate: success,
      onFrameSuspend: success,
      onFrameResume: success,
      onFrameClose: success,
    },
  );
  const params = {
    frameId: "f",
    activationId: "a",
    targetSubsystemKey: "missing",
    input: null,
  };
  assert.deepEqual(await subsystem.frame.call(params), {
    kind: "semantic-error",
    error: { code: "FRAME_CALL_TARGET_NOT_FOUND" },
    classification: "recoverable",
  });
  assert.deepEqual(await subsystem.frame.call(params), {
    kind: "success",
    result: { childFrameId: "child" },
  });
  await main.close();
});

test("fatal Frame semantics terminate and stopping requires shutdown authority", async () => {
  const first = await connect(
    {
      onStatus() {},
      onFrameCall: () => ({ kind: "success", result: { childFrameId: "x" } }),
      onFrameReturn: () => ({
        kind: "semantic-error",
        error: { code: "FRAME_NOT_FOUND" },
      }),
    },
    {
      onShutdown: success,
      onFrameInitialize: success,
      onFrameActivate: success,
      onFrameSuspend: success,
      onFrameResume: success,
      onFrameClose: success,
    },
  );
  const fatal = await first.subsystem.frame.returnFrame({
    frameId: "f",
    activationId: "a",
    result: { type: "cancelled" },
  });
  assert.equal(fatal.kind, "semantic-error");
  assert.equal(fatal.classification, "fatal");
  assert.equal((await first.subsystem.terminal).kind, "protocol-fatal");

  const second = await connect(
    {
      onStatus() {},
      onFrameCall: () => ({ kind: "success", result: { childFrameId: "x" } }),
      onFrameReturn: success,
    },
    {
      onShutdown: success,
      onFrameInitialize: success,
      onFrameActivate: success,
      onFrameSuspend: success,
      onFrameResume: success,
      onFrameClose: success,
    },
  );
  const stopping = await second.subsystem.control.status({ state: "stopping" });
  assert.equal(stopping.kind, "terminal");
  assert.equal(stopping.terminal.kind, "local-fatal");
});

test("failed status prevents every later subsystem Frame send", async () => {
  let calls = 0;
  const { main, subsystem } = await connect(
    {
      onStatus() {},
      onFrameCall() {
        calls += 1;
        return { kind: "success", result: { childFrameId: "x" } };
      },
      onFrameReturn: success,
    },
    {
      onShutdown: success,
      onFrameInitialize: success,
      onFrameActivate: success,
      onFrameSuspend: success,
      onFrameResume: success,
      onFrameClose: success,
    },
  );
  assert.deepEqual(
    await subsystem.control.status({
      state: "failed",
      error: { code: "BOOM" },
    }),
    { kind: "sent" },
  );
  const outcome = await subsystem.frame.call({
    frameId: "f",
    activationId: "a",
    targetSubsystemKey: "target",
    input: null,
  });
  assert.equal(outcome.kind, "terminal");
  assert.equal(outcome.terminal.kind, "local-fatal");
  assert.equal(calls, 0);
  assert.equal((await main.terminal).kind, "carrier-closed");
});

test("FrameFailure.code follows the frozen Frame v1 grammar", async () => {
  const { main } = await connect(
    {
      onStatus() {},
      onFrameCall: () => ({ kind: "success", result: { childFrameId: "x" } }),
      onFrameReturn: success,
    },
    {
      onShutdown: success,
      onFrameInitialize: () => ({
        kind: "semantic-error",
        error: {
          code: "FRAME_INITIALIZE_REJECTED",
          failure: { code: "123" },
        },
      }),
      onFrameActivate: success,
      onFrameSuspend: success,
      onFrameResume: success,
      onFrameClose: success,
    },
  );
  const outcome = await main.frame.initialize({ frameId: "f", input: null });
  assert.equal(outcome.kind, "terminal");
  assert.equal(outcome.terminal.kind, "carrier-closed");
});

test("main shutdown intent blocks new Frame before stopping status", async () => {
  let releaseShutdown;
  let enterShutdown;
  const shutdownEntered = new Promise((resolve) => {
    enterShutdown = resolve;
  });
  const shutdownBlocked = new Promise((resolve) => {
    releaseShutdown = resolve;
  });
  let initializeCalls = 0;
  const { main } = await connect(
    {
      onStatus() {},
      onFrameCall: () => ({ kind: "success", result: { childFrameId: "x" } }),
      onFrameReturn: success,
    },
    {
      async onShutdown() {
        enterShutdown();
        await shutdownBlocked;
        return success();
      },
      onFrameInitialize() {
        initializeCalls += 1;
        return success();
      },
      onFrameActivate: success,
      onFrameSuspend: success,
      onFrameResume: success,
      onFrameClose: success,
    },
  );
  const shutdown = main.control.shutdown({ reason: "session-end" });
  await shutdownEntered;
  const frame = await main.frame.initialize({ frameId: "f", input: null });
  assert.equal(frame.kind, "terminal");
  assert.equal(frame.terminal.kind, "local-fatal");
  assert.equal(initializeCalls, 0);
  releaseShutdown();
  assert.equal((await shutdown).kind, "terminal");
});

test("onShutdown handler may report stopping before its Response", async () => {
  const statuses = [];
  let subsystem;
  let stoppingOutcome;
  const connected = await connect(
    {
      onStatus(status) {
        statuses.push(status.state);
      },
      onFrameCall: () => ({ kind: "success", result: { childFrameId: "x" } }),
      onFrameReturn: success,
    },
    {
      async onShutdown() {
        stoppingOutcome = await subsystem.control.status({ state: "stopping" });
        return success();
      },
      onFrameInitialize: success,
      onFrameActivate: success,
      onFrameSuspend: success,
      onFrameResume: success,
      onFrameClose: success,
    },
  );
  subsystem = connected.subsystem;
  assert.deepEqual(
    await connected.main.control.shutdown({ reason: "session-end" }),
    { kind: "success", result: {} },
  );
  assert.deepEqual(stoppingOutcome, { kind: "sent" });
  assert.deepEqual(statuses, ["stopping"]);
  await connected.main.close();
});
