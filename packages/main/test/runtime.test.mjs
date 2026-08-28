import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  FrameCallRejectedError,
  completed,
  defineSubsystem,
} from "@loomrealm/subsystem";
import { runSubsystem } from "@loomrealm/subsystem/host";
import { MainRuntimeFatalError, runMain } from "../dist/index.js";

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

const policy = Object.freeze({
  runtimeBootstrapDeadlineMs: 1000,
  frameDeadlineMs: 1000,
  shutdownDeadlineMs: 1000,
  terminationDeadlineMs: 100,
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createFakePlatform(definitions, options = {}) {
  let tokenId = 0;
  const launches = [];
  const runtimes = new Map();

  const platform = {
    scheduler,
    bootstrapTokens: {
      generate() {
        if (options.generateToken) return options.generateToken(++tokenId);
        return `test-token-${++tokenId}-${"x".repeat(48)}`;
      },
    },
    runtimeHosting: {
      async launch(request, signal) {
        assert.equal(signal.aborted, false);
        const definition = definitions[request.subsystemKey];
        if (!definition) throw new Error(`Missing fake Runtime ${request.subsystemKey}`);
        assert.deepEqual(Object.keys(request).sort(), [
          "bootstrapToken",
          "subsystemKey",
        ]);

        launches.push({ ...request });
        const pair = createMemoryCarrierPair();
        const terminatedGate = deferred();
        const record = {
          pair,
          acquireCount: 0,
          terminationRequests: 0,
          terminated: false,
        };
        runtimes.set(request.subsystemKey, record);

        const runtime = runSubsystem({
          definition,
          runtimeControl: {
            async acquire(runtimeSignal) {
              assert.equal(runtimeSignal.aborted, false);
              return pair.right;
            },
          },
          runtimePolicy: {
            scheduler,
            helloDeadlineMs: 1000,
            frameDeadlineMs: 1000,
            terminalCleanupDeadlineMs: 50,
          },
          launch: {
            subsystemKey: request.subsystemKey,
            bootstrapToken: request.bootstrapToken,
            controlProtocolVersions: [1],
          },
        });
        void runtime.then(
          () => {
            record.terminated = true;
            terminatedGate.resolve();
          },
          () => {
            record.terminated = true;
            terminatedGate.resolve();
          },
        );

        return Object.freeze({
          runtimeControl: Object.freeze({
            async acquire(mainSignal) {
              record.acquireCount += 1;
              if (mainSignal.aborted) throw new Error("Main acquire aborted");
              return pair.left;
            },
          }),
          terminated: terminatedGate.promise,
          async requestTermination(terminationSignal) {
            record.terminationRequests += 1;
            if (terminationSignal.aborted) {
              throw new Error("Termination request aborted");
            }
            await pair.left.close();
          },
        });
      },
    },
  };

  return {
    platform,
    launches,
    runtimes,
    lose(key) {
      const record = runtimes.get(key);
      assert.ok(record, `Runtime ${key} exists`);
      record.pair.lose(new Error(`lost ${key}`));
    },
  };
}

function bootstrap(keys, initialKey, input = null) {
  return Object.freeze({
    subsystemKeys: Object.freeze([...keys]),
    initial: Object.freeze({ subsystemKey: initialKey, input }),
  });
}

test("Main boots required Runtimes and drives a nested cross-Subsystem Frame to root outcome", async () => {
  let rootShutdown = 0;
  let childShutdown = 0;
  const fake = createFakePlatform({
    root: defineSubsystem(() => ({
      async frame(frame) {
        const child = await frame.call("child", { value: frame.params });
        return completed({
          childType: child.type,
          childValue: child.type === "completed" ? child.value : null,
        });
      },
      shutdown() {
        rootShutdown += 1;
      },
    })),
    child: defineSubsystem(() => ({
      frame(frame) {
        return completed({ echo: frame.params });
      },
      shutdown() {
        childShutdown += 1;
      },
    })),
  });

  const result = await runMain({
    bootstrap: bootstrap(["root", "child"], "root", { n: 7 }),
    platform: fake.platform,
    policy,
  });

  assert.deepEqual(result, {
    kind: "root-outcome",
    outcome: {
      type: "completed",
      value: {
        childType: "completed",
        childValue: { echo: { value: { n: 7 } } },
      },
    },
  });
  assert.deepEqual(
    fake.launches.map(({ subsystemKey }) => subsystemKey),
    ["root", "child"],
  );
  assert.equal(new Set(fake.launches.map(({ bootstrapToken }) => bootstrapToken)).size, 2);
  assert.equal(rootShutdown, 1);
  assert.equal(childShutdown, 1);
  assert.equal(fake.runtimes.get("root").acquireCount, 1);
  assert.equal(fake.runtimes.get("child").acquireCount, 1);
  assert.equal(fake.runtimes.get("root").terminationRequests, 0);
  assert.equal(fake.runtimes.get("child").terminationRequests, 0);
});

test("same-Subsystem recursion closes through Response-before-dependent-RPC without reentrant deadlock", async () => {
  const fake = createFakePlatform({
    loop: defineSubsystem(() => ({
      async frame(frame) {
        const depth = frame.params.depth;
        if (depth === 0) {
          const child = await frame.call("loop", { depth: 1 });
          return completed({ childType: child.type });
        }
        return completed("leaf");
      },
    })),
  });

  const result = await runMain({
    bootstrap: bootstrap(["loop"], "loop", { depth: 0 }),
    platform: fake.platform,
    policy,
  });

  assert.deepEqual(result, {
    kind: "root-outcome",
    outcome: { type: "completed", value: { childType: "completed" } },
  });
});

test("undeclared call target is recoverable and keeps the current Activation usable", async () => {
  let rejectedCode;
  const fake = createFakePlatform({
    root: defineSubsystem(() => ({
      async frame(frame) {
        try {
          await frame.call("missing", null);
        } catch (error) {
          assert.ok(error instanceof FrameCallRejectedError);
          rejectedCode = error.code;
        }
        return completed("recovered");
      },
    })),
  });

  const result = await runMain({
    bootstrap: bootstrap(["root"], "root"),
    platform: fake.platform,
    policy,
  });

  assert.equal(rejectedCode, "FRAME_CALL_TARGET_NOT_FOUND");
  assert.deepEqual(result, {
    kind: "root-outcome",
    outcome: { type: "completed", value: "recovered" },
  });
});

test("failed child Runtime unwinds the doomed suffix and fresh-resumes its healthy Caller", async () => {
  const childStarted = deferred();
  const never = new Promise(() => {});
  const fake = createFakePlatform({
    root: defineSubsystem(() => ({
      async frame(frame) {
        const child = await frame.call("child", null);
        return completed({
          type: child.type,
          code: child.type === "failed" ? child.error.code : null,
        });
      },
    })),
    child: defineSubsystem(() => ({
      async frame() {
        childStarted.resolve();
        await never;
        return completed(null);
      },
    })),
  });

  const resultPromise = runMain({
    bootstrap: bootstrap(["root", "child"], "root"),
    platform: fake.platform,
    policy,
  });

  await childStarted.promise;
  fake.lose("child");
  const result = await resultPromise;

  assert.deepEqual(result, {
    kind: "root-outcome",
    outcome: {
      type: "completed",
      value: { type: "failed", code: "SUBSYSTEM_RUNTIME_FAILED" },
    },
  });
});

test("root Runtime loss becomes a failed root outcome without re-entering old business continuation", async () => {
  const rootStarted = deferred();
  const never = new Promise(() => {});
  let reentered = false;
  const fake = createFakePlatform({
    root: defineSubsystem(() => ({
      async frame() {
        rootStarted.resolve();
        await never;
        reentered = true;
        return completed(null);
      },
    })),
  });

  const resultPromise = runMain({
    bootstrap: bootstrap(["root"], "root"),
    platform: fake.platform,
    policy,
  });

  await rootStarted.promise;
  fake.lose("root");
  const result = await resultPromise;

  assert.deepEqual(result, {
    kind: "root-outcome",
    outcome: {
      type: "failed",
      error: { code: "SUBSYSTEM_RUNTIME_FAILED" },
    },
  });
  assert.equal(reentered, false);
});

test("duplicate bootstrap token material fails closed before launching the second Runtime", async () => {
  const token = `duplicate-${"x".repeat(48)}`;
  const fake = createFakePlatform(
    {
      a: defineSubsystem(() => ({ frame: () => completed(null) })),
      b: defineSubsystem(() => ({ frame: () => completed(null) })),
    },
    { generateToken: () => token },
  );

  await assert.rejects(
    runMain({
      bootstrap: bootstrap(["a", "b"], "a"),
      platform: fake.platform,
      policy,
    }),
    (error) => {
      assert.ok(error instanceof MainRuntimeFatalError);
      assert.equal(error.failure.code, "MAIN_BOOTSTRAP_TOKEN_INVALID");
      assert.equal(error.failure.subsystemKey, "b");
      return true;
    },
  );
  assert.deepEqual(fake.launches.map(({ subsystemKey }) => subsystemKey), ["a"]);
});

test("external abort produces graceful Session shutdown and bounded Runtime cleanup", async () => {
  const started = deferred();
  const never = new Promise(() => {});
  let shutdownCalls = 0;
  const fake = createFakePlatform({
    root: defineSubsystem(() => ({
      async frame() {
        started.resolve();
        await never;
        return completed(null);
      },
      shutdown() {
        shutdownCalls += 1;
      },
    })),
  });
  const controller = new AbortController();

  const resultPromise = runMain({
    bootstrap: bootstrap(["root"], "root"),
    platform: fake.platform,
    policy,
    signal: controller.signal,
  });
  await started.promise;
  controller.abort();

  assert.deepEqual(await resultPromise, { kind: "shutdown" });
  assert.equal(shutdownCalls, 1);
  assert.equal(fake.runtimes.get("root").terminationRequests, 0);
});
