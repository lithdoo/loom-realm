import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createMainRuntimeControlPeer } from "@loomrealm/runtime-control";
import {
  FrameCallRejectedError,
  completed,
  defineSubsystem,
} from "../dist/index.js";
import {
  runSubsystem,
  SubsystemRuntimeFatalError,
} from "../dist/host/index.js";

const scheduler = {
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
    };
  },
};

const defaultPolicy = Object.freeze({
  scheduler,
  helloDeadlineMs: 1000,
  frameDeadlineMs: 1000,
  terminalCleanupDeadlineMs: 50,
});

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function tick() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitFor(predicate, message = "condition") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

async function createSession(factory, mainOverrides = {}, policy = defaultPolicy) {
  const pair = createMemoryCarrierPair();
  const statuses = [];
  const calls = [];
  const returns = [];
  let acquireCount = 0;

  const main = createMainRuntimeControlPeer({
    carrier: pair.left,
    scheduler,
    frameDeadlineMs: 1000,
    shutdownDeadlineMs: 1000,
    authenticateHello: (params) =>
      params.key === "demo" && params.bootstrapToken === "secret"
        ? { kind: "accepted" }
        : { kind: "rejected", code: "BOOTSTRAP_AUTHENTICATION_FAILED" },
    handlers: {
      onStatus(status) {
        statuses.push(status);
        return mainOverrides.onStatus?.(status);
      },
      onFrameCall(params) {
        calls.push(params);
        if (mainOverrides.onFrameCall) return mainOverrides.onFrameCall(params);
        return { kind: "success", result: { childFrameId: "child-1" } };
      },
      onFrameReturn(params) {
        returns.push(params);
        if (mainOverrides.onFrameReturn) return mainOverrides.onFrameReturn(params);
        return { kind: "success", result: {} };
      },
    },
  });

  const runtime = runSubsystem({
    definition: factory,
    runtimeControl: {
      async acquire(signal) {
        acquireCount += 1;
        assert.equal(signal.aborted, false);
        return pair.right;
      },
    },
    runtimePolicy: policy,
    launch: {
      subsystemKey: "demo",
      bootstrapToken: "secret",
      controlProtocolVersions: [1],
    },
  });
  void runtime.catch(() => {});

  assert.deepEqual(await main.identified, {
    kind: "identified",
    key: "demo",
    protocolVersion: 1,
  });
  await waitFor(
    () => statuses.some((status) => status.state === "ready"),
    "ready status",
  );

  return {
    main,
    runtime,
    statuses,
    calls,
    returns,
    get acquireCount() {
      return acquireCount;
    },
  };
}

async function shutdown(session) {
  assert.deepEqual(await session.main.control.shutdown({ reason: "session-end" }), {
    kind: "success",
    result: {},
  });
  await session.runtime;
}

test("initialize creates context, activate starts once, and graceful shutdown aborts without waiting for late handler", async () => {
  const handlerGate = deferred();
  let scopeSignal;
  let frameSignal;
  let handlerStarts = 0;
  let shutdownCalls = 0;

  const session = await createSession(
    defineSubsystem((scope) => {
      scopeSignal = scope.signal;
      return {
        async frame(frame) {
          handlerStarts += 1;
          frameSignal = frame.signal;
          return handlerGate.promise;
        },
        shutdown() {
          shutdownCalls += 1;
        },
      };
    }),
  );

  assert.equal(session.acquireCount, 1);
  assert.deepEqual(
    await session.main.frame.initialize({ frameId: "root", input: { n: 1 } }),
    { kind: "success", result: {} },
  );
  assert.equal(handlerStarts, 0);

  assert.deepEqual(
    await session.main.frame.activate({ frameId: "root", activationId: "a1" }),
    { kind: "success", result: {} },
  );
  await waitFor(() => handlerStarts === 1, "handler start");
  assert.equal(frameSignal.aborted, false);

  await shutdown(session);
  assert.equal(scopeSignal.aborted, true);
  assert.equal(frameSignal.aborted, true);
  assert.equal(shutdownCalls, 1);

  handlerGate.resolve(completed(null));
  await tick();
  assert.equal(session.returns.length, 0);
});

test("accepted child call resumes only after frame.resume ACK and returns exactly one outcome", async () => {
  let observedChild;
  const session = await createSession(
    defineSubsystem(() => ({
      async frame(frame) {
        observedChild = await frame.call("child", { value: 1 });
        return completed({ childType: observedChild.type });
      },
    })),
  );

  await session.main.frame.initialize({ frameId: "root", input: null });
  await session.main.frame.activate({ frameId: "root", activationId: "a1" });
  await waitFor(() => session.calls.length === 1, "frame.call");
  await tick();

  assert.deepEqual(
    await session.main.frame.resume({
      frameId: "root",
      activationId: "a2",
      returnedFrameId: "child-1",
      result: { type: "completed", value: { ok: true } },
    }),
    { kind: "success", result: {} },
  );

  await waitFor(() => session.returns.length === 1, "frame.return");
  assert.deepEqual(observedChild, {
    type: "completed",
    value: { ok: true },
  });
  assert.deepEqual(session.returns[0].result, {
    type: "completed",
    value: { childType: "completed" },
  });

  assert.deepEqual(await session.main.frame.closeFrame({ frameId: "root" }), {
    kind: "success",
    result: {},
  });
  await shutdown(session);
});

test("recoverable call rejection is catchable and keeps the current activation usable", async () => {
  let caught;
  const session = await createSession(
    defineSubsystem(() => ({
      async frame(frame) {
        try {
          await frame.call("missing", null);
        } catch (error) {
          caught = error;
        }
        return completed("recovered");
      },
    })),
    {
      onFrameCall() {
        return {
          kind: "semantic-error",
          error: { code: "FRAME_CALL_TARGET_NOT_FOUND" },
        };
      },
    },
  );

  await session.main.frame.initialize({ frameId: "root", input: null });
  await session.main.frame.activate({ frameId: "root", activationId: "a1" });
  await waitFor(() => session.returns.length === 1, "recoverable return");

  assert.ok(caught instanceof FrameCallRejectedError);
  assert.equal(caught.code, "FRAME_CALL_TARGET_NOT_FOUND");
  assert.deepEqual(session.returns[0].result, {
    type: "completed",
    value: "recovered",
  });

  await session.main.frame.closeFrame({ frameId: "root" });
  await shutdown(session);
});

test("Runtime-fatal call never re-enters the business continuation", async () => {
  const callStarted = deferred();
  const never = new Promise(() => {});
  let reentered = false;
  let failedCalls = 0;
  let failedValue;
  let frameSignal;

  const session = await createSession(
    defineSubsystem(() => ({
      async frame(frame) {
        frameSignal = frame.signal;
        await frame.call("blocked", null);
        reentered = true;
        return completed(null);
      },
      failed(error) {
        failedCalls += 1;
        failedValue = error;
      },
    })),
    {
      async onFrameCall() {
        callStarted.resolve();
        await never;
      },
    },
  );

  await session.main.frame.initialize({ frameId: "root", input: null });
  await session.main.frame.activate({ frameId: "root", activationId: "a1" });
  await callStarted.promise;
  await session.main.close();

  await assert.rejects(
    session.runtime,
    (error) =>
      error instanceof SubsystemRuntimeFatalError &&
      error.failure.code === "RUNTIME_CONTROL_CONNECTION_LOST",
  );
  await tick();

  assert.equal(reentered, false);
  assert.equal(failedCalls, 1);
  assert.equal(failedValue.code, "RUNTIME_CONTROL_CONNECTION_LOST");
  assert.equal(frameSignal.aborted, true);
});

test("administrative suspend aborts the Frame and discards a late handler result", async () => {
  const handlerGate = deferred();
  let frameSignal;
  const session = await createSession(
    defineSubsystem(() => ({
      async frame(frame) {
        frameSignal = frame.signal;
        return handlerGate.promise;
      },
    })),
  );

  await session.main.frame.initialize({ frameId: "root", input: null });
  await session.main.frame.activate({ frameId: "root", activationId: "a1" });
  await waitFor(() => frameSignal !== undefined, "Frame handler");

  assert.deepEqual(
    await session.main.frame.suspend({ frameId: "root", activationId: "a1" }),
    { kind: "success", result: {} },
  );
  await tick();
  assert.equal(frameSignal.aborted, true);

  handlerGate.resolve(completed("late"));
  await tick();
  assert.equal(session.returns.length, 0);

  await session.main.frame.closeFrame({ frameId: "root" });
  await shutdown(session);
});

test("uncaught business exception becomes a sanitized failed Frame outcome", async () => {
  const session = await createSession(
    defineSubsystem(() => ({
      frame() {
        throw new Error("secret internal detail");
      },
    })),
  );

  await session.main.frame.initialize({ frameId: "root", input: null });
  await session.main.frame.activate({ frameId: "root", activationId: "a1" });
  await waitFor(() => session.returns.length === 1, "failed Frame return");

  assert.deepEqual(session.returns[0].result, {
    type: "failed",
    error: {
      code: "UNHANDLED_BUSINESS_EXCEPTION",
      message: "Unhandled business exception",
    },
  });

  await session.main.frame.closeFrame({ frameId: "root" });
  await shutdown(session);
});

test("terminal cleanup is bounded and hook failure never replaces the primary cause", async () => {
  let acquireCount = 0;
  const runtime = runSubsystem({
    definition: defineSubsystem(() => ({
      frame: () => completed(null),
      async failed() {
        throw new Error("secondary hook failure");
      },
    })),
    runtimeControl: {
      async acquire() {
        acquireCount += 1;
        throw new Error("physical detail");
      },
    },
    runtimePolicy: {
      ...defaultPolicy,
      terminalCleanupDeadlineMs: 20,
    },
    launch: {
      subsystemKey: "demo",
      bootstrapToken: "secret",
      controlProtocolVersions: [1],
    },
  });

  await assert.rejects(
    runtime,
    (error) =>
      error instanceof SubsystemRuntimeFatalError &&
      error.failure.code === "RUNTIME_CONTROL_ACQUIRE_FAILED",
  );
  assert.equal(acquireCount, 1);
});

test("a hanging shutdown hook cannot keep runSubsystem pending forever", async () => {
  const never = new Promise(() => {});
  const session = await createSession(
    defineSubsystem(() => ({
      frame: () => completed(null),
      shutdown() {
        return never;
      },
    })),
    {},
    { ...defaultPolicy, terminalCleanupDeadlineMs: 20 },
  );

  const started = Date.now();
  await shutdown(session);
  assert.ok(Date.now() - started < 500);
});
