import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createRendererControlHolder } from "@loomrealm/renderer";
import { prepareRendererHelloResultV1 } from "@loomrealm/renderer-control";
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

async function waitFor(predicate, message) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${message}`);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function createFakePlatform(definitions, options = {}) {
  let tokenId = 0;
  const launches = [];
  const runtimes = new Map();

  const platform = {
    scheduler,
    opaqueMaterial: {
      generate() {
        if (options.generateToken) return options.generateToken(++tokenId);
        return `test-token-${++tokenId}-${"x".repeat(48)}`;
      },
    },
    runtimeHosting: {
      async launch(request, signal) {
        assert.equal(signal.aborted, false);
        if (options.beforeLaunch) await options.beforeLaunch(request, signal);
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
          ...(options.subsystemDataBinding === undefined
            ? {}
            : { data: options.subsystemDataBinding(request.subsystemKey) }),
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

        const hosted = Object.freeze({
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
        record.hosted = hosted;
        return hosted;
      },
    },
    ...(options.rendererControl === undefined
      ? {}
      : { rendererControl: options.rendererControl }),
    ...(options.dataConnections === undefined
      ? {}
      : { dataConnections: options.dataConnections }),
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

function createPairedDataFixture(subsystemKey) {
  const rendererWaiters = [];
  const subsystemWaiters = [];
  const pairs = [];

  const remove = (items, item) => {
    const index = items.indexOf(item);
    if (index >= 0) items.splice(index, 1);
  };
  const wait = (items, signal, fields = {}) => {
    const gate = deferred();
    const waiter = { ...fields, signal, gate, detach: () => {} };
    const abort = () => {
      remove(items, waiter);
      gate.reject(new Error("Data acquire aborted"));
    };
    if (signal.aborted) abort();
    else {
      signal.addEventListener("abort", abort, { once: true });
      waiter.detach = () => signal.removeEventListener("abort", abort);
      items.push(waiter);
    }
    return waiter;
  };
  const pump = () => {
    while (rendererWaiters.length > 0 && subsystemWaiters.length > 0) {
      const renderer = rendererWaiters.shift();
      const subsystem = subsystemWaiters.shift();
      renderer.detach();
      subsystem.detach();
      if (renderer.signal.aborted || subsystem.signal.aborted) continue;
      const pair = createMemoryCarrierPair();
      pairs.push(pair);
      renderer.gate.resolve(pair.left);
      subsystem.gate.resolve({
        carrier: pair.right,
        generation: renderer.generation,
        dataProfile: renderer.dataProfile,
      });
    }
  };

  return {
    pairs,
    renderer: {
      acquire(key, generation, dataProfile, signal) {
        assert.equal(key, subsystemKey);
        const waiter = wait(rendererWaiters, signal, { generation, dataProfile });
        pump();
        return waiter.gate.promise;
      },
    },
    subsystem: {
      acquire(signal) {
        const waiter = wait(subsystemWaiters, signal);
        pump();
        return waiter.gate.promise;
      },
    },
  };
}

function rendererLimitBootstrapKeys(sessionId) {
  const keys = Array.from({ length: 3553 }, (_, index) =>
    `${String(index).padStart(6, "0")}:${"x".repeat(249)}`,
  );
  keys.push(`${String(keys.length).padStart(6, "0")}:${"x".repeat(174)}`);
  const bytes = Buffer.byteLength(prepareRendererHelloResultV1({
    sessionId,
    revision: 1,
    runtimes: keys.map((subsystemKey) => ({ subsystemKey, state: "starting" })),
    stack: [],
    inputTarget: null,
    dataAuthorities: [],
  }));
  assert.equal(bytes, 1_048_576, "fixture must sit at the exact hello byte limit");
  return keys;
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
    { generateToken: (id) => id === 1 ? `session-${"s".repeat(48)}` : token },
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
    { generateToken: (id) => id === 1 ? `session-${"s".repeat(48)}` : "\ud800" },
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
    { generateToken: (id) => {
      if (id === 1) return `session-${"s".repeat(48)}`;
      throw new Error("entropy unavailable");
    } },
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
    opaqueMaterial: { generate: (() => { let id = 0; return () => `timeout-${++id}-${"x".repeat(48)}`; })() },
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

test("optional Renderer Binding drives a real candidate hello and committed projection", async () => {
  const finish = deferred();
  const slots = [];
  const binding = {
    acquire(token, signal) {
      const slot = deferred();
      slots.push({ token, signal, slot });
      return slot.promise;
    },
  };
  const fake = createFakePlatform(
    { root: defineSubsystem(() => ({ async frame() { await finish.promise; return completed("done"); } })) },
    { rendererControl: binding },
  );
  const result = runMain({ bootstrap: bootstrap(["root"], "root"), platform: fake.platform, policy });
  while (slots.length === 0 || !fake.runtimes.has("root")) await new Promise((resolve) => setImmediate(resolve));

  const pair = createMemoryCarrierPair();
  const first = slots[0];
  first.slot.resolve(pair.left);
  const holder = createRendererControlHolder();
  const installed = await holder.connect({ carrier: pair.right, rendererControlToken: first.token });
  assert.equal(installed.kind, "installed");
  assert.equal(holder.current().snapshot.sessionId.startsWith("test-token-1-"), true);
  await waitFor(() => holder.current()?.snapshot.dataAuthorities.length === 1, "ready DataAuthority projection");
  assert.deepEqual(holder.current().snapshot.dataAuthorities, [{
    subsystemKey: "root",
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  }]);
  assert.ok(holder.current().snapshot.revision >= 1);
  assert.deepEqual(holder.current().snapshot.runtimes.map(({ subsystemKey }) => subsystemKey), ["root"]);

  while (slots.length < 2) await new Promise((resolve) => setImmediate(resolve));
  assert.notEqual(slots[1].token, first.token);
  finish.resolve();
  assert.deepEqual(await result, { kind: "root-outcome", outcome: { type: "completed", value: "done" } });
  assert.equal(slots[1].signal.aborted, true);
  while (holder.current() !== null) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(holder.current(), null);
});

test("M9 projects immutable full Data authority views with exact Runtime identity and terminal null", async () => {
  const finish = deferred();
  const slots = [];
  const views = [];
  const sink = {
    replace(view) {
      if (view !== null) {
        assert.equal(Object.isFrozen(view), true);
        assert.equal(Object.isFrozen(view.entries), true);
        assert.equal(view.entries.every(Object.isFrozen), true);
      }
      views.push(view);
    },
  };
  const fake = createFakePlatform(
    {
      root: defineSubsystem(() => ({
        async frame() {
          await finish.promise;
          return completed("done");
        },
      })),
    },
    {
      dataConnections: sink,
      rendererControl: {
        acquire(token, signal) {
          const slot = deferred();
          slots.push({ token, signal, slot });
          return slot.promise;
        },
      },
    },
  );

  const result = runMain({ bootstrap: bootstrap(["root"], "root"), platform: fake.platform, policy });
  await waitFor(() => views.length > 0, "initial Data authority null");
  assert.deepEqual(views, [null]);
  await waitFor(() => slots.length > 0 && fake.runtimes.has("root"), "Runtime and Renderer slot");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(views, [null], "ready Runtime without current Renderer remains null");

  const pair = createMemoryCarrierPair();
  slots[0].slot.resolve(pair.left);
  const holder = createRendererControlHolder();
  assert.equal((await holder.connect({
    carrier: pair.right,
    rendererControlToken: slots[0].token,
  })).kind, "installed");
  await waitFor(() => views.at(-1) !== null, "current Renderer Data authority view");
  const published = views.at(-1);
  assert.equal(published.rendererControlToken, slots[0].token);
  assert.deepEqual(published.entries.map(({ subsystemKey, generation, dataProfile }) => ({ subsystemKey, generation, dataProfile })), [{
    subsystemKey: "root",
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  }]);
  assert.equal(published.entries[0].runtime, fake.runtimes.get("root").hosted);

  finish.resolve();
  await waitFor(() => views.at(-1) === null, "terminal Data authority null");
  assert.deepEqual(await result, {
    kind: "root-outcome",
    outcome: { type: "completed", value: "done" },
  });
});

test("current Renderer token stays live for opaque-material duplicate defense only", async () => {
  const finish = deferred();
  const slots = [];
  let rendererToken;
  const fake = createFakePlatform(
    { root: defineSubsystem(() => ({ async frame() { await finish.promise; return completed("done"); } })) },
    {
      generateToken(id) {
        if (id === 4) return rendererToken;
        return `m9-token-${id}-${"x".repeat(48)}`;
      },
      rendererControl: {
        acquire(token, signal) {
          rendererToken ??= token;
          const slot = deferred();
          slots.push({ token, signal, slot });
          return slot.promise;
        },
      },
    },
  );
  const result = runMain({ bootstrap: bootstrap(["root"], "root"), platform: fake.platform, policy });
  await waitFor(() => slots.length === 1, "first Renderer slot");
  const pair = createMemoryCarrierPair();
  slots[0].slot.resolve(pair.left);
  const holder = createRendererControlHolder();
  assert.equal((await holder.connect({ carrier: pair.right, rendererControlToken: rendererToken })).kind, "installed");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(slots.length, 1, "duplicate live current token cannot arm another candidate");
  finish.resolve();
  await result;
});

test("M8 deterministic vertical installs real paired Data peers and recovers under generation 1", async () => {
  const finish = deferred();
  const controlSlots = [];
  const data = createPairedDataFixture("root");
  const fake = createFakePlatform(
    {
      root: defineSubsystem(() => ({
        async frame() {
          await finish.promise;
          return completed("done");
        },
      })),
    },
    {
      subsystemDataBinding: () => data.subsystem,
      rendererControl: {
        acquire(token, signal) {
          const slot = deferred();
          controlSlots.push({ token, signal, slot });
          return slot.promise;
        },
      },
    },
  );
  const result = runMain({
    bootstrap: bootstrap(["root"], "root"),
    platform: fake.platform,
    policy,
  });
  await waitFor(() => controlSlots.length > 0, "Renderer Control slot");
  const control = createMemoryCarrierPair();
  controlSlots[0].slot.resolve(control.left);
  const holder = createRendererControlHolder(data.renderer);
  assert.equal((await holder.connect({
    carrier: control.right,
    rendererControlToken: controlSlots[0].token,
  })).kind, "installed");

  await waitFor(() => data.pairs.length === 1, "initial paired Data installation");
  await waitFor(
    () => holder.current()?.snapshot.dataAuthorities.length === 1,
    "Main DataAuthority",
  );
  const authorityBefore = holder.current().snapshot.dataAuthorities[0];
  const revisionBefore = holder.current().snapshot.revision;
  assert.deepEqual(authorityBefore, {
    subsystemKey: "root",
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  });

  data.pairs[0].lose(new Error("test Data loss"));
  await waitFor(() => data.pairs.length === 2, "fresh same-generation pair");
  assert.deepEqual(holder.current().snapshot.dataAuthorities[0], authorityBefore);
  assert.equal(holder.current().snapshot.revision, revisionBefore);

  finish.resolve();
  assert.deepEqual(await result, {
    kind: "root-outcome",
    outcome: { type: "completed", value: "done" },
  });
});

test("non-abort Renderer Binding rejection is Session-local and does not fail Runtime business", async () => {
  let acquireCalls = 0;
  const fake = createFakePlatform(
    { root: defineSubsystem(() => ({ frame: () => completed("ok") })) },
    { rendererControl: { acquire() { acquireCalls += 1; return Promise.reject(new Error("binding terminal")); } } },
  );
  const result = await runMain({ bootstrap: bootstrap(["root"], "root"), platform: fake.platform, policy });
  assert.deepEqual(result, { kind: "root-outcome", outcome: { type: "completed", value: "ok" } });
  assert.equal(acquireCalls, 1);
});

test("active Renderer replacement is atomic and stale terminal cannot clear the new holder", async () => {
  const finish = deferred();
  const slots = [];
  const fake = createFakePlatform(
    { root: defineSubsystem(() => ({ async frame() { await finish.promise; return completed("done"); } })) },
    { rendererControl: { acquire(token, signal) { const slot = deferred(); slots.push({ token, signal, slot }); return slot.promise; } } },
  );
  const result = runMain({ bootstrap: bootstrap(["root"], "root"), platform: fake.platform, policy });
  while (slots.length < 1) await new Promise((resolve) => setImmediate(resolve));
  const holder = createRendererControlHolder();

  const a = createMemoryCarrierPair();
  slots[0].slot.resolve(a.left);
  const installedA = await holder.connect({ carrier: a.right, rendererControlToken: slots[0].token });
  assert.equal(installedA.kind, "installed");
  const oldPeer = installedA.current.peer;

  while (slots.length < 2) await new Promise((resolve) => setImmediate(resolve));
  const b = createMemoryCarrierPair();
  slots[1].slot.resolve(b.left);
  const installedB = await holder.connect({ carrier: b.right, rendererControlToken: slots[1].token });
  assert.equal(installedB.kind, "installed");
  assert.notEqual(installedB.current.peer, oldPeer);
  await oldPeer.terminal;
  assert.equal(holder.current().peer, installedB.current.peer);

  finish.resolve();
  await result;
  while (holder.current() !== null) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(holder.current(), null);
});

test("connected Renderer mirrors committed frame.call and frame.return through fresh caller resume", async () => {
  const allowCall = deferred();
  const finishChild = deferred();
  const finishRoot = deferred();
  const rootEntered = deferred();
  const childEntered = deferred();
  const rootResumed = deferred();
  const slots = [];
  const fake = createFakePlatform(
    {
      root: defineSubsystem(() => ({
        async frame(frame) {
          rootEntered.resolve();
          await allowCall.promise;
          const child = await frame.call("child", null);
          rootResumed.resolve(child);
          await finishRoot.promise;
          return completed("done");
        },
      })),
      child: defineSubsystem(() => ({
        async frame() {
          childEntered.resolve();
          await finishChild.promise;
          return completed("child");
        },
      })),
    },
    { rendererControl: { acquire(token, signal) { const slot = deferred(); slots.push({ token, signal, slot }); return slot.promise; } } },
  );
  const result = runMain({ bootstrap: bootstrap(["root", "child"], "root"), platform: fake.platform, policy });
  await waitFor(() => slots.length > 0, "Renderer candidate slot");
  const pair = createMemoryCarrierPair();
  slots[0].slot.resolve(pair.left);
  const holder = createRendererControlHolder();
  assert.equal((await holder.connect({ carrier: pair.right, rendererControlToken: slots[0].token })).kind, "installed");

  await rootEntered.promise;
  await waitFor(() => holder.current()?.snapshot.stack.length === 1 && holder.current().snapshot.stack[0].lifecycle === "active", "root active projection");
  assert.deepEqual(
    holder.current().snapshot.dataAuthorities.map(({ subsystemKey, generation, dataProfile }) => ({ subsystemKey, generation, dataProfile })),
    [
      { subsystemKey: "root", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
      { subsystemKey: "child", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
    ],
  );
  const firstActivation = holder.current().snapshot.stack[0].activationId;
  allowCall.resolve();
  await childEntered.promise;
  await waitFor(() => holder.current()?.snapshot.stack.length === 2 && holder.current().snapshot.stack[1].lifecycle === "active", "child active projection");
  assert.deepEqual(holder.current().snapshot.stack.map(({ lifecycle }) => lifecycle), ["suspended", "active"]);
  assert.equal(holder.current().snapshot.inputTarget.frameId, holder.current().snapshot.stack[1].frameId);

  finishChild.resolve();
  await rootResumed.promise;
  await waitFor(() => holder.current()?.snapshot.stack.length === 1 && holder.current().snapshot.stack[0].lifecycle === "active", "fresh caller resume projection");
  assert.notEqual(holder.current().snapshot.stack[0].activationId, firstActivation);
  assert.equal(holder.current().snapshot.inputTarget.frameId, holder.current().snapshot.stack[0].frameId);

  finishRoot.resolve();
  assert.deepEqual(await result, { kind: "root-outcome", outcome: { type: "completed", value: "done" } });
});

test("connected Renderer mirrors fixed-point failure unwind without changing Main outcome", async () => {
  const allowCall = deferred();
  const rootEntered = deferred();
  const childEntered = deferred();
  const finishRoot = deferred();
  const rootResumed = deferred();
  const never = new Promise(() => {});
  const slots = [];
  const fake = createFakePlatform(
    {
      root: defineSubsystem(() => ({
        async frame(frame) {
          rootEntered.resolve();
          await allowCall.promise;
          const child = await frame.call("child", null);
          rootResumed.resolve(child);
          await finishRoot.promise;
          return completed({ type: child.type, code: child.type === "failed" ? child.error.code : null });
        },
      })),
      child: defineSubsystem(() => ({
        async frame() {
          childEntered.resolve();
          await never;
          return completed(null);
        },
      })),
    },
    { rendererControl: { acquire(token, signal) { const slot = deferred(); slots.push({ token, signal, slot }); return slot.promise; } } },
  );
  const result = runMain({ bootstrap: bootstrap(["root", "child"], "root"), platform: fake.platform, policy });
  await waitFor(() => slots.length > 0, "Renderer candidate slot");
  const pair = createMemoryCarrierPair();
  slots[0].slot.resolve(pair.left);
  const holder = createRendererControlHolder();
  assert.equal((await holder.connect({ carrier: pair.right, rendererControlToken: slots[0].token })).kind, "installed");

  await rootEntered.promise;
  await waitFor(() => holder.current()?.snapshot.stack.length === 1 && holder.current().snapshot.stack[0].lifecycle === "active", "root active projection before failure path");
  const oldRootActivation = holder.current().snapshot.stack[0].activationId;
  allowCall.resolve();
  await childEntered.promise;
  await waitFor(() => holder.current()?.snapshot.stack.length === 2 && holder.current().snapshot.stack[1].lifecycle === "active", "child active projection");
  fake.lose("child");
  const failed = await rootResumed.promise;
  assert.deepEqual(failed, { type: "failed", error: { code: "SUBSYSTEM_RUNTIME_FAILED" } });
  await waitFor(() => holder.current()?.snapshot.stack.length === 1 && holder.current().snapshot.stack[0].lifecycle === "active", "unwound caller projection");
  assert.equal(holder.current().snapshot.runtimes.find(({ subsystemKey }) => subsystemKey === "child").state, "failed");
  assert.equal(holder.current().snapshot.dataAuthorities.some(({ subsystemKey }) => subsystemKey === "child"), false);
  assert.deepEqual(holder.current().snapshot.dataAuthorities.find(({ subsystemKey }) => subsystemKey === "root"), {
    subsystemKey: "root",
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  });
  assert.notEqual(holder.current().snapshot.stack[0].activationId, oldRootActivation);

  finishRoot.resolve();
  assert.deepEqual(await result, {
    kind: "root-outcome",
    outcome: { type: "completed", value: { type: "failed", code: "SUBSYSTEM_RUNTIME_FAILED" } },
  });
});

test("unrepresentable candidate and current publication fail closed without replacing Main authority", async () => {
  const sessionId = `test-token-1-${"x".repeat(48)}`;
  const keys = rendererLimitBootstrapKeys(sessionId);
  const launchGate = deferred();
  const initializeEntered = deferred();
  const initializeGate = deferred();
  const stateSendSeen = deferred();
  const releaseStateSend = deferred();
  const slots = [];
  const controller = new AbortController();
  const rootKey = keys[0];
  const fake = createFakePlatform(
    {
      [rootKey]: defineSubsystem(() => ({
        initialize() {
          initializeEntered.resolve();
          return initializeGate.promise;
        },
        frame: () => completed("unreachable"),
      })),
    },
    {
      beforeLaunch: () => launchGate.promise,
      rendererControl: {
        acquire(token, signal) {
          const slot = deferred();
          slots.push({ token, signal, slot });
          return slot.promise;
        },
      },
    },
  );
  const result = runMain({ bootstrap: bootstrap(keys, rootKey), platform: fake.platform, policy, signal: controller.signal });
  await waitFor(() => slots.length > 0, "initial Renderer candidate slot");

  const a = createMemoryCarrierPair();
  let gated = false;
  const gatedMainCarrier = {
    closed: a.left.closed,
    messages: () => a.left.messages(),
    close: () => a.left.close(),
    send(text) {
      const message = JSON.parse(text);
      if (!gated && message.method === "renderer.state") {
        gated = true;
        stateSendSeen.resolve();
        return releaseStateSend.promise.then(() => a.left.send(text));
      }
      return a.left.send(text);
    },
  };
  slots[0].slot.resolve(gatedMainCarrier);
  const holder = createRendererControlHolder();
  const installedA = await holder.connect({ carrier: a.right, rendererControlToken: slots[0].token });
  assert.equal(installedA.kind, "installed");
  const authorityBefore = holder.current().snapshot;
  assert.equal(Buffer.byteLength(prepareRendererHelloResultV1(authorityBefore)), 1_048_576);

  launchGate.resolve();
  await stateSendSeen.promise;
  await initializeEntered.promise;
  await waitFor(() => slots.length > 1, "replacement Renderer candidate slot");
  const b = createMemoryCarrierPair();
  slots[1].slot.resolve(b.left);
  const rejectedB = await holder.connect({ carrier: b.right, rendererControlToken: slots[1].token });
  assert.deepEqual(rejectedB, { kind: "rejected", code: "PROTOCOL_STATE_ERROR" });
  assert.equal(holder.current().peer, installedA.current.peer);
  assert.equal(holder.current().snapshot, authorityBefore);

  releaseStateSend.resolve();
  await waitFor(() => holder.current() === null, "current Renderer representation terminal");
  assert.equal(fake.runtimes.get(rootKey).terminated, false);

  controller.abort();
  initializeGate.resolve();
  assert.deepEqual(await result, { kind: "shutdown" });
});
