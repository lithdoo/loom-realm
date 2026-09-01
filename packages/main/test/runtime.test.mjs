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
          releaseTerminationObservation() {
            terminatedGate.resolve();
          },
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
            if (!options.holdTerminationObservation?.(request.subsystemKey)) {
              terminatedGate.resolve();
            }
          },
          () => {
            record.terminated = true;
            if (!options.holdTerminationObservation?.(request.subsystemKey)) {
              terminatedGate.resolve();
            }
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
          terminated: options.rejectTerminationObservation?.(request.subsystemKey)
            ? terminatedGate.promise.then(() => {
                throw new Error(
                  `termination observation failed ${request.subsystemKey}`,
                );
              })
            : terminatedGate.promise,
          async requestTermination(terminationSignal) {
            record.terminationRequests += 1;
            if (terminationSignal.aborted) {
              throw new Error("Termination request aborted");
            }
            if (options.requestTermination) {
              await options.requestTermination({
                request,
                record,
                signal: terminationSignal,
                async close() {
                  await pair.left.close();
                },
              });
              return;
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

test("Main preserves __proto__ as ordinary business JSON data", async () => {
  const input = JSON.parse('{"__proto__":{"safe":true}}');
  const fake = createFakePlatform({
    root: defineSubsystem(() => ({
      frame(frame) {
        assert.equal(Object.prototype.hasOwnProperty.call(frame.params, "__proto__"), true);
        assert.equal(Object.getPrototypeOf(frame.params), Object.prototype);
        return completed(frame.params);
      },
    })),
  });

  const result = await runMain({
    bootstrap: bootstrap(["root"], "root", input),
    platform: fake.platform,
    policy,
  });

  assert.equal(result.kind, "root-outcome");
  assert.equal(result.outcome.type, "completed");
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.outcome.value, "__proto__"),
    true,
  );
  assert.equal(Object.getPrototypeOf(result.outcome.value), Object.prototype);
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(result.outcome.value, "__proto__").value,
    { safe: true },
  );
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

test("ill-formed bootstrap token fails closed before any Runtime launch", async () => {
  const fake = createFakePlatform(
    { root: defineSubsystem(() => ({ frame: () => completed(null) })) },
    { generateToken: () => "\ud800" },
  );

  await assert.rejects(
    runMain({
      bootstrap: bootstrap(["root"], "root"),
      platform: fake.platform,
      policy,
    }),
    (error) => {
      assert.ok(error instanceof MainRuntimeFatalError);
      assert.equal(error.failure.code, "MAIN_BOOTSTRAP_TOKEN_INVALID");
      assert.equal(error.failure.subsystemKey, "root");
      return true;
    },
  );
  assert.deepEqual(fake.launches, []);
});

test("bootstrap token generation failure is attributed to the required Runtime", async () => {
  const fake = createFakePlatform(
    { root: defineSubsystem(() => ({ frame: () => completed(null) })) },
    { generateToken: () => { throw new Error("entropy unavailable"); } },
  );

  await assert.rejects(
    runMain({
      bootstrap: bootstrap(["root"], "root"),
      platform: fake.platform,
      policy,
    }),
    (error) => {
      assert.ok(error instanceof MainRuntimeFatalError);
      assert.equal(error.failure.code, "MAIN_BOOTSTRAP_TOKEN_GENERATION_FAILED");
      assert.equal(error.failure.subsystemKey, "root");
      return true;
    },
  );
  assert.deepEqual(fake.launches, []);
});

test("later Runtime launch failure gracefully cleans an already-ready Runtime", async () => {
  let shutdownCalls = 0;
  const fake = createFakePlatform({
    first: defineSubsystem(() => ({
      frame: () => completed(null),
      shutdown() {
        shutdownCalls += 1;
      },
    })),
  });

  await assert.rejects(
    runMain({
      bootstrap: bootstrap(["first", "missing"], "first"),
      platform: fake.platform,
      policy,
    }),
    (error) => {
      assert.ok(error instanceof MainRuntimeFatalError);
      assert.equal(error.failure.code, "MAIN_RUNTIME_LAUNCH_FAILED");
      assert.equal(error.failure.subsystemKey, "missing");
      return true;
    },
  );
  assert.deepEqual(fake.launches.map(({ subsystemKey }) => subsystemKey), ["first"]);
  assert.equal(shutdownCalls, 1);
  assert.equal(fake.runtimes.get("first").terminationRequests, 0);
});

test("declared but failed call target is recoverable as unavailable", async () => {
  const rootStarted = deferred();
  const continueRoot = deferred();
  let rejectedCode;
  const fake = createFakePlatform({
    root: defineSubsystem(() => ({
      async frame(frame) {
        rootStarted.resolve();
        await continueRoot.promise;
        try {
          await frame.call("child", null);
        } catch (error) {
          assert.ok(error instanceof FrameCallRejectedError);
          rejectedCode = error.code;
        }
        return completed("recovered");
      },
    })),
    child: defineSubsystem(() => ({ frame: () => completed(null) })),
  });

  const resultPromise = runMain({
    bootstrap: bootstrap(["root", "child"], "root"),
    platform: fake.platform,
    policy,
  });
  await rootStarted.promise;
  fake.lose("child");
  continueRoot.resolve();

  assert.deepEqual(await resultPromise, {
    kind: "root-outcome",
    outcome: { type: "completed", value: "recovered" },
  });
  assert.equal(rejectedCode, "FRAME_CALL_TARGET_UNAVAILABLE");
});

test("middle Runtime failure closes a healthy descendant and resumes the root", async () => {
  const leafStarted = deferred();
  const never = new Promise(() => {});
  let leafAborted = false;
  const fake = createFakePlatform({
    root: defineSubsystem(() => ({
      async frame(frame) {
        const middle = await frame.call("middle", null);
        return completed({
          type: middle.type,
          code: middle.type === "failed" ? middle.error.code : null,
        });
      },
    })),
    middle: defineSubsystem(() => ({
      async frame(frame) {
        await frame.call("leaf", null);
        return completed("unreachable");
      },
    })),
    leaf: defineSubsystem(() => ({
      async frame(frame) {
        frame.signal.addEventListener("abort", () => { leafAborted = true; }, { once: true });
        leafStarted.resolve();
        await never;
        return completed(null);
      },
    })),
  });

  const resultPromise = runMain({
    bootstrap: bootstrap(["root", "middle", "leaf"], "root"),
    platform: fake.platform,
    policy,
  });
  await leafStarted.promise;
  fake.lose("middle");

  assert.deepEqual(await resultPromise, {
    kind: "root-outcome",
    outcome: {
      type: "completed",
      value: { type: "failed", code: "SUBSYSTEM_RUNTIME_FAILED" },
    },
  });
  assert.equal(leafAborted, true);
});

test("runMain rejects invalid policy and LogicalGameBootstrap before side effects", async () => {
  const fake = createFakePlatform({
    root: defineSubsystem(() => ({ frame: () => completed(null) })),
  });
  const invalidCases = [
    { bootstrap: bootstrap([], "root"), policy },
    { bootstrap: bootstrap(["root", "root"], "root"), policy },
    { bootstrap: bootstrap(["root"], "missing"), policy },
    { bootstrap: bootstrap(["\ud800"], "\ud800"), policy },
    { bootstrap: bootstrap(["root"], "root"), policy: { ...policy, runtimeBootstrapDeadlineMs: 0 } },
    { bootstrap: bootstrap(["root"], "root"), policy: { ...policy, frameDeadlineMs: -1 } },
  ];

  for (const invalid of invalidCases) {
    await assert.rejects(
      runMain({ ...invalid, platform: fake.platform }),
      TypeError,
    );
  }
  assert.deepEqual(fake.launches, []);
});

test("Runtime launch that never settles is bounded by the bootstrap deadline", async () => {
  const never = new Promise(() => {});
  let launchSignal;
  const platform = {
    scheduler,
    bootstrapTokens: { generate: () => `timeout-${"x".repeat(48)}` },
    runtimeHosting: {
      launch(_request, signal) {
        launchSignal = signal;
        return never;
      },
    },
  };

  await assert.rejects(
    runMain({
      bootstrap: bootstrap(["root"], "root"),
      platform,
      policy: { ...policy, runtimeBootstrapDeadlineMs: 10 },
    }),
    (error) => {
      assert.ok(error instanceof MainRuntimeFatalError);
      assert.equal(error.failure.code, "MAIN_RUNTIME_BOOTSTRAP_TIMEOUT");
      return true;
    },
  );
  assert.equal(launchSignal.aborted, true);
});

test("already-aborted Session never launches a Runtime", async () => {
  const fake = createFakePlatform({
    root: defineSubsystem(() => ({ frame: () => completed(null) })),
  });
  const controller = new AbortController();
  controller.abort();

  assert.deepEqual(
    await runMain({
      bootstrap: bootstrap(["root"], "root"),
      platform: fake.platform,
      policy,
      signal: controller.signal,
    }),
    { kind: "shutdown" },
  );
  assert.deepEqual(fake.launches, []);
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

test("failed Runtime termination request can be retried by terminal cleanup", async () => {
  const started = deferred();
  const never = new Promise(() => {});
  let attempt = 0;
  const fake = createFakePlatform(
    {
      root: defineSubsystem(() => ({
        async frame() {
          started.resolve();
          await never;
          return completed(null);
        },
      })),
    },
    {
      holdTerminationObservation: (key) => key === "root",
      async requestTermination({ record, close }) {
        attempt += 1;
        if (attempt === 1) throw new Error("first termination request failed");
        await close();
        record.releaseTerminationObservation();
      },
    },
  );

  const resultPromise = runMain({
    bootstrap: bootstrap(["root"], "root"),
    platform: fake.platform,
    policy,
  });
  await started.promise;
  fake.lose("root");

  assert.deepEqual(await resultPromise, {
    kind: "root-outcome",
    outcome: {
      type: "failed",
      error: { code: "SUBSYSTEM_RUNTIME_FAILED" },
    },
  });
  assert.equal(fake.runtimes.get("root").terminationRequests, 2);
});

test("termination observation rejection is not accepted as physical termination proof", async () => {
  let shutdownCalls = 0;
  const fake = createFakePlatform(
    {
      root: defineSubsystem(() => ({
        frame: () => completed("done"),
        shutdown() {
          shutdownCalls += 1;
        },
      })),
    },
    { rejectTerminationObservation: (key) => key === "root" },
  );

  const result = await runMain({
    bootstrap: bootstrap(["root"], "root"),
    platform: fake.platform,
    policy,
  });

  assert.deepEqual(result, {
    kind: "root-outcome",
    outcome: { type: "completed", value: "done" },
  });
  assert.equal(shutdownCalls, 1);
  assert.equal(fake.runtimes.get("root").terminationRequests, 1);
});
