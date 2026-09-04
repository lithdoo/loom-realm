import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ChildProcess } from "node:child_process";
import WebSocket, { WebSocketServer } from "ws";
import {
  createHostraRuntimeHosting,
  prepareHostraGame,
} from "../dist/index.js";
import { buildRunnerEnvironment } from "../dist/runtime-hosting.js";

const policy = Object.freeze({
  helloDeadlineMs: 30_000,
  frameDeadlineMs: 1_000,
  terminalCleanupDeadlineMs: 100,
  terminationGraceMs: 100,
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function prepared(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "loomrealm-runtime-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "subsystems"));
  await writeFile(path.join(root, "game.json"), JSON.stringify({
    formatVersion: 1,
    initial: { subsystem: "root", input: null },
    subsystems: [{ key: "root" }],
  }));
  await writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({
    formatVersion: 1,
    subsystems: [{ key: "root", module: "subsystems/root.mjs" }],
  }));
  await writeFile(path.join(root, "subsystems", "root.mjs"), `
    export default () => ({
      async frame(_input, frame) { frame.completed(null); }
    });
  `);
  return prepareHostraGame({ source: { installationRoot: root }, runnerPolicy: policy });
}

test("Runner environment uses the exact allowlist and reserved bootstrap", () => {
  const environment = buildRunnerEnvironment({
    PATH: "path",
    TEMP: "temp",
    NODE_OPTIONS: "--inspect",
    NODE_PATH: "secret",
    HOSTRA_RPC_TOKEN: "secret",
  }, "bootstrap");
  assert.equal(environment.PATH, "path");
  assert.equal(environment.TEMP, "temp");
  assert.equal(environment.LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP, "bootstrap");
  assert.equal(environment.NODE_OPTIONS, undefined);
  assert.equal(environment.NODE_PATH, undefined);
  assert.equal(environment.HOSTRA_RPC_TOKEN, undefined);
});

test("RuntimeHosting launches the package Runner, acquires once, and observes actual exit", async (t) => {
  const game = await prepared(t);
  const hosting = createHostraRuntimeHosting({ launchPlan: game.launchPlan });
  const hosted = await hosting.launch({ subsystemKey: "root", bootstrapToken: "token" }, new AbortController().signal);
  const carrier = await hosted.runtimeControl.acquire(new AbortController().signal);
  await assert.rejects(hosted.runtimeControl.acquire(new AbortController().signal));
  await assert.rejects(hosted.requestTermination(AbortSignal.abort(new Error("before commit"))));
  await hosted.requestTermination(new AbortController().signal);
  await hosted.requestTermination(AbortSignal.abort(new Error("late caller abort")));
  await hosted.terminated;
  assert.ok(["closed", "lost"].includes((await carrier.closed).kind));
});

test("RuntimeHosting hands off an exact child-bound Data provisioner before launch resolves", async (t) => {
  const game = await prepared(t);
  let handoff = null;
  const hosting = createHostraRuntimeHosting({
    launchPlan: game.launchPlan,
    onRuntimeDataProvisioner(runtime, provisioner) {
      handoff = { runtime, provisioner };
    },
  });
  const hosted = await hosting.launch(
    { subsystemKey: "root", bootstrapToken: "token" },
    new AbortController().signal,
  );
  assert.equal(handoff.runtime, hosted);

  const connected = deferred();
  const dataPath = `/${"a".repeat(43)}`;
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0, path: dataPath });
  t.after(() => new Promise((resolve) => server.close(() => resolve())));
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  server.once("connection", (socket) => connected.resolve(socket));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const prepare = handoff.provisioner.prepare({
    candidateId: "candidate-a",
    endpoint: `ws://127.0.0.1:${address.port}${dataPath}`,
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  }, new AbortController().signal);
  const socket = await connected.promise;
  await prepare;

  await assert.rejects(handoff.provisioner.prepare({
    candidateId: "candidate-b",
    endpoint: `ws://127.0.0.1:${address.port}${dataPath}`,
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  }, new AbortController().signal), /already prepared/);
  await handoff.provisioner.commit("candidate-a", new AbortController().signal);
  const overflowClosed = new Promise((resolve) => socket.once("close", resolve));
  for (let index = 0; index < 65; index += 1) {
    try { socket.send(`held-${index}`); } catch {}
  }
  await overflowClosed;
  assert.doesNotThrow(() => handoff.provisioner.revoke("candidate-a"));

  await hosted.requestTermination(new AbortController().signal);
  await hosted.terminated;
});

test("throwing Runtime Data provisioner handoff fails launch after child convergence", async (t) => {
  const game = await prepared(t);
  const setupFailure = new Error("bad composition");
  await assert.rejects(
    createHostraRuntimeHosting({
      launchPlan: game.launchPlan,
      onRuntimeDataProvisioner() {
        throw setupFailure;
      },
    }).launch(
      { subsystemKey: "root", bootstrapToken: "token" },
      new AbortController().signal,
    ),
    (error) => error === setupFailure,
  );
});

test("RuntimeHosting rejects an already-aborted launch without side effects", async (t) => {
  const game = await prepared(t);
  const hosting = createHostraRuntimeHosting({ launchPlan: game.launchPlan });
  const reason = new Error("aborted");
  await assert.rejects(
    hosting.launch({ subsystemKey: "root", bootstrapToken: "token" }, AbortSignal.abort(reason)),
    (error) => error === reason,
  );
});

test("acquire abort closes the listener while HostedRuntime remains terminable", async (t) => {
  const game = await prepared(t);
  const badPlan = Object.freeze({
    ...game.launchPlan,
    runtimes: Object.freeze(game.launchPlan.runtimes.map((runtime) => Object.freeze({
      ...runtime,
      physicalModule: path.join(game.launchPlan.canonicalInstallationRoot, "subsystems", "missing-after-prepare.mjs"),
    }))),
  });
  const hosted = await createHostraRuntimeHosting({ launchPlan: badPlan }).launch(
    { subsystemKey: "root", bootstrapToken: "token" },
    new AbortController().signal,
  );
  const controller = new AbortController();
  controller.abort(new Error("stop acquire"));
  await assert.rejects(hosted.runtimeControl.acquire(controller.signal));
  await hosted.terminated;
});

async function waitForFile(file, deadlineMs = 5_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      return await readFile(file, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error("Timed out waiting for child fixture output");
}

test("wrong capability paths do not consume the one valid connection", async (t) => {
  const game = await prepared(t);
  const fixtureEntry = path.join(game.launchPlan.canonicalInstallationRoot, "fixture-runner.mjs");
  await writeFile(fixtureEntry, `
    import { writeFile } from "node:fs/promises";
    const bootstrap = JSON.parse(process.env.LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP);
    delete process.env.LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP;
    await writeFile("endpoint.txt", bootstrap.controlEndpoint);
    setInterval(() => {}, 1000);
  `);
  const plan = Object.freeze({ ...game.launchPlan, runnerEntry: fixtureEntry });
  const hosted = await createHostraRuntimeHosting({ launchPlan: plan }).launch(
    { subsystemKey: "root", bootstrapToken: "token" },
    new AbortController().signal,
  );
  const endpoint = await waitForFile(path.join(game.launchPlan.canonicalInstallationRoot, "endpoint.txt"));
  const parsed = new URL(endpoint);
  const wrong = new WebSocket(`${parsed.origin}/wrong`);
  const wrongOutcome = await Promise.race([
    new Promise((resolve) => wrong.once("unexpected-response", () => resolve("rejected"))),
    new Promise((resolve) => wrong.once("error", () => resolve("rejected"))),
    new Promise((resolve) => wrong.once("open", () => resolve("opened"))),
  ]);
  assert.equal(wrongOutcome, "rejected");
  wrong.terminate();

  const query = new WebSocket(`${endpoint}?extra=1`);
  const queryOutcome = await Promise.race([
    new Promise((resolve) => query.once("unexpected-response", () => resolve("rejected"))),
    new Promise((resolve) => query.once("error", () => resolve("rejected"))),
    new Promise((resolve) => query.once("open", () => resolve("opened"))),
  ]);
  assert.equal(queryOutcome, "rejected");
  query.terminate();

  const acquiring = hosted.runtimeControl.acquire(new AbortController().signal);
  const valid = new WebSocket(endpoint);
  const carrier = await acquiring;
  await new Promise((resolve, reject) => {
    if (valid.readyState === WebSocket.OPEN) resolve();
    else {
      valid.once("open", resolve);
      valid.once("error", reject);
    }
  });
  const reconnect = new WebSocket(endpoint);
  const reconnectOutcome = await Promise.race([
    new Promise((resolve) => reconnect.once("unexpected-response", () => resolve("rejected"))),
    new Promise((resolve) => reconnect.once("error", () => resolve("rejected"))),
    new Promise((resolve) => reconnect.once("open", () => resolve("opened"))),
  ]);
  assert.equal(reconnectOutcome, "rejected");
  reconnect.terminate();
  await hosted.requestTermination(new AbortController().signal);
  await hosted.terminated;
  await carrier.closed;
  valid.terminate();
});

test("spawn failure is mapped without returning HostedRuntime", async (t) => {
  const game = await prepared(t);
  const plan = Object.freeze({
    ...game.launchPlan,
    canonicalNodeExecutable: path.join(game.launchPlan.canonicalInstallationRoot, "missing-node.exe"),
  });
  await assert.rejects(
    createHostraRuntimeHosting({ launchPlan: plan }).launch(
      { subsystemKey: "root", bootstrapToken: "token" },
      new AbortController().signal,
    ),
    (error) => {
      assert.equal(error?.code, "PROCESS_SPAWN_FAILED");
      assert.equal(error?.cause, undefined);
      assert.equal(error.message.includes(game.launchPlan.canonicalInstallationRoot), false);
      return true;
    },
  );
});

test("oversized bootstrap rejection closes the already-created attempt listener", async (t) => {
  const game = await prepared(t);
  const plan = Object.freeze({
    ...game.launchPlan,
    runtimes: Object.freeze(game.launchPlan.runtimes.map((runtime) => Object.freeze({
      ...runtime,
      physicalModule: `${runtime.physicalModule}${"x".repeat(17_000)}`,
    }))),
  });
  await assert.rejects(
    createHostraRuntimeHosting({ launchPlan: plan }).launch(
      { subsystemKey: "root", bootstrapToken: "token" },
      new AbortController().signal,
    ),
    (error) => error?.code === "LAUNCH_RUNTIME_UNAVAILABLE",
  );
});

test("launch abort while pending rejects and converges child cleanup", async (t) => {
  const game = await prepared(t);
  const hosting = createHostraRuntimeHosting({ launchPlan: game.launchPlan });
  const controller = new AbortController();
  const launch = hosting.launch({ subsystemKey: "root", bootstrapToken: "token" }, controller.signal);
  const reason = new Error("abandon launch");
  controller.abort(reason);
  await assert.rejects(launch, (error) => error === reason);
});

test("termination grace escalates a POSIX child that ignores the normal request", { skip: process.platform === "win32" }, async (t) => {
  const game = await prepared(t);
  const fixtureEntry = path.join(game.launchPlan.canonicalInstallationRoot, "ignore-term.mjs");
  await writeFile(fixtureEntry, `
    process.on("SIGTERM", () => {});
    setInterval(() => {}, 1000);
  `);
  const plan = Object.freeze({
    ...game.launchPlan,
    runnerEntry: fixtureEntry,
    runnerPolicy: Object.freeze({ ...game.launchPlan.runnerPolicy, terminationGraceMs: 30 }),
  });
  const hosted = await createHostraRuntimeHosting({ launchPlan: plan }).launch(
    { subsystemKey: "root", bootstrapToken: "token" },
    new AbortController().signal,
  );
  await hosted.requestTermination(new AbortController().signal);
  await hosted.terminated;
});

test("normal termination request failure still commits and runs force convergence", async (t) => {
  const game = await prepared(t);
  const fixtureEntry = path.join(game.launchPlan.canonicalInstallationRoot, "termination-fixture.mjs");
  await writeFile(fixtureEntry, "setInterval(() => {}, 1000);");
  const plan = Object.freeze({
    ...game.launchPlan,
    runnerEntry: fixtureEntry,
    runnerPolicy: Object.freeze({ ...game.launchPlan.runnerPolicy, terminationGraceMs: 30 }),
  });
  const originalKill = ChildProcess.prototype.kill;
  let matchingCalls = 0;
  ChildProcess.prototype.kill = function(signal) {
    if (this.spawnargs?.[1] === fixtureEntry) {
      matchingCalls += 1;
      if (matchingCalls === 1) return false;
    }
    return originalKill.call(this, signal);
  };
  t.after(() => {
    ChildProcess.prototype.kill = originalKill;
  });

  const hosted = await createHostraRuntimeHosting({ launchPlan: plan }).launch(
    { subsystemKey: "root", bootstrapToken: "token" },
    new AbortController().signal,
  );
  await assert.rejects(
    hosted.requestTermination(new AbortController().signal),
    (error) => error?.code === "PROCESS_TERMINATION_FAILED",
  );
  await hosted.terminated;
  assert.equal(matchingCalls, 2);
});

test("a post-listening WS server error fails inside the attempt without crashing the host", async (t) => {
  const game = await prepared(t);
  const originalEmit = WebSocketServer.prototype.emit;
  WebSocketServer.prototype.emit = function(event, ...args) {
    const emitted = originalEmit.call(this, event, ...args);
    if (event === "listening") {
      queueMicrotask(() => this.emit("error", new Error("injected late server failure")));
    }
    return emitted;
  };
  t.after(() => {
    WebSocketServer.prototype.emit = originalEmit;
  });
  await assert.rejects(
    createHostraRuntimeHosting({ launchPlan: game.launchPlan }).launch(
      { subsystemKey: "root", bootstrapToken: "token" },
      new AbortController().signal,
    ),
    (error) => error?.code === "LAUNCH_RUNTIME_UNAVAILABLE",
  );
});
