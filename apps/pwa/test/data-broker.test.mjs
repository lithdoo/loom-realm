import assert from "node:assert/strict";
import test from "node:test";
import { PwaDataBroker } from "../dist/types/data-broker.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function runtimeFixture() {
  const end = deferred();
  return {
    runtime: Object.freeze({
      runtimeControl: Object.freeze({ acquire: async () => { throw new Error("unused"); } }),
      terminated: end.promise,
      requestTermination: async () => {},
    }),
    terminate: end.resolve,
  };
}

function provisionerFixture(log, behavior = {}) {
  const ports = new Map();
  return {
    provisioner: {
      async install(request, port) {
        log.push({ side: "runner", action: "install", ...request });
        if (behavior.install) await behavior.install(request, port);
        ports.set(request.connectionId, port);
      },
      async revoke(request) {
        log.push({ side: "runner", action: "revoke", ...request });
        if (behavior.revoke) await behavior.revoke(request);
        ports.get(request.connectionId)?.close();
        ports.delete(request.connectionId);
      },
    },
    ports,
  };
}

function bridgeFixture(log, behavior = {}) {
  const ports = new Map();
  return {
    bridge: {
      async request(message) {
        const action = message.type === "renderer-data/install" ? "install" : "revoke";
        log.push({ side: "window", action, ...message, port: undefined });
        if (behavior.request) await behavior.request(message);
        if (action === "install") ports.set(message.connectionId, message.port);
        else {
          ports.get(message.connectionId)?.close();
          ports.delete(message.connectionId);
        }
      },
    },
    ports,
  };
}

function view(runtime, generation = 1, dataProfile = "data-v1") {
  return Object.freeze({
    rendererControlToken: `renderer-${generation}`,
    entries: Object.freeze([Object.freeze({ subsystemKey: "demo", generation, dataProfile, runtime })]),
  });
}

async function committedFixture(options = {}) {
  const log = [];
  const hosted = runtimeFixture();
  const runner = provisionerFixture(log, options.runner);
  const window = bridgeFixture(log, options.window);
  const observations = [];
  const broker = new PwaDataBroker(window.bridge, "epoch-1", (event) => observations.push(event));
  broker.onRuntimeDataProvisioner(hosted.runtime, runner.provisioner);
  broker.sink.replace(view(hosted.runtime));
  await broker.whenIdle();
  return { broker, hosted, runner, window, log, observations };
}

test("commits only one channel identity after both endpoints acknowledge", async () => {
  const fixture = await committedFixture();
  const installs = fixture.log.filter((entry) => entry.action === "install");
  assert.deepEqual(installs.map((entry) => entry.side), ["runner", "window"]);
  assert.equal(installs[0].connectionId, installs[1].connectionId);
  assert.equal(fixture.runner.ports.size, 1);
  assert.equal(fixture.window.ports.size, 1);
  assert.ok(fixture.observations.some((event) => event.type === "data-committed"));
  await fixture.broker.close();
  assert.equal(fixture.runner.ports.size, 0);
  assert.equal(fixture.window.ports.size, 0);
});

test("rolls back Runner and Window when Window rejects or times out", async () => {
  for (const detail of ["rejected", "timed out", "bridge closed"]) {
    let first = true;
    const fixture = await committedFixture({
      window: {
        request(message) {
          if (first && message.type === "renderer-data/install") {
            first = false;
            message.port.close();
            throw new Error(detail);
          }
        },
      },
    });
    const rollback = fixture.log.filter((entry) => entry.action === "revoke");
    assert.deepEqual(rollback.map((entry) => entry.side), ["window", "runner"], detail);
    assert.equal(rollback[0].connectionId, rollback[1].connectionId, detail);
    assert.equal(fixture.runner.ports.size, 0, detail);
    assert.ok(fixture.observations.some((event) => event.type === "data-rollback-complete"), detail);
    await fixture.broker.close();
  }
});

test("fresh authority reconciliation retries only after completed rollback", async () => {
  const log = [];
  const hosted = runtimeFixture();
  const runner = provisionerFixture(log);
  let reject = true;
  const window = bridgeFixture(log, {
    request(message) {
      if (reject && message.type === "renderer-data/install") {
        message.port.close();
        throw new Error("first install rejected");
      }
    },
  });
  const broker = new PwaDataBroker(window.bridge, "epoch-1");
  broker.onRuntimeDataProvisioner(hosted.runtime, runner.provisioner);
  broker.sink.replace(view(hosted.runtime));
  await broker.whenIdle();
  reject = false;
  broker.sink.replace(view(hosted.runtime));
  await broker.whenIdle();
  const installs = log.filter((entry) => entry.action === "install");
  assert.equal(installs.length, 4);
  assert.notEqual(installs[0].connectionId, installs[2].connectionId);
  const oldRevokeIndex = log.findIndex((entry) => entry.action === "revoke" && entry.connectionId === installs[0].connectionId && entry.side === "runner");
  const newInstallIndex = log.findIndex((entry) => entry.action === "install" && entry.connectionId === installs[2].connectionId);
  assert.ok(oldRevokeIndex >= 0 && oldRevokeIndex < newInstallIndex);
  await broker.close();
});

test("authority replacement during pending Window install fences the old result", async () => {
  const log = [];
  const hosted = runtimeFixture();
  const runner = provisionerFixture(log);
  const firstWindow = deferred();
  let installs = 0;
  const window = bridgeFixture(log, {
    async request(message) {
      if (message.type === "renderer-data/install" && installs++ === 0) await firstWindow.promise;
    },
  });
  const broker = new PwaDataBroker(window.bridge, "epoch-1");
  broker.onRuntimeDataProvisioner(hosted.runtime, runner.provisioner);
  broker.sink.replace(view(hosted.runtime, 1));
  while (!log.some((entry) => entry.side === "window" && entry.action === "install")) await new Promise((resolve) => setTimeout(resolve, 0));
  broker.sink.replace(view(hosted.runtime, 2));
  firstWindow.resolve();
  await broker.whenIdle();
  const windowInstalls = log.filter((entry) => entry.side === "window" && entry.action === "install");
  assert.equal(windowInstalls.length, 2);
  assert.equal(windowInstalls[0].generation, 1);
  assert.equal(windowInstalls[1].generation, 2);
  assert.notEqual(windowInstalls[0].connectionId, windowInstalls[1].connectionId);
  const oldRevokes = log.filter((entry) => entry.action === "revoke" && entry.connectionId === windowInstalls[0].connectionId);
  assert.deepEqual(oldRevokes.map((entry) => entry.side), ["window", "runner"]);
  await broker.close();
});

test("Runtime termination during provisioning rolls back without committing", async () => {
  const log = [];
  const hosted = runtimeFixture();
  const runner = provisionerFixture(log);
  const pending = deferred();
  const window = bridgeFixture(log, { async request(message) { if (message.type === "renderer-data/install") await pending.promise; } });
  const observations = [];
  const broker = new PwaDataBroker(window.bridge, "epoch-1", (event) => observations.push(event));
  broker.onRuntimeDataProvisioner(hosted.runtime, runner.provisioner);
  broker.sink.replace(view(hosted.runtime));
  while (!log.some((entry) => entry.side === "window" && entry.action === "install")) await new Promise((resolve) => setTimeout(resolve, 0));
  hosted.terminate();
  pending.resolve();
  await broker.whenIdle();
  assert.ok(observations.some((event) => event.type === "data-rollback-complete"));
  assert.ok(!observations.some((event) => event.type === "data-committed"));
  assert.equal(runner.ports.size, 0);
  assert.equal(window.ports.size, 0);
  await broker.close();
});

test("same tuple is idempotent and a new generation revokes before replacement", async () => {
  const fixture = await committedFixture();
  const firstConnection = fixture.log.find((entry) => entry.action === "install").connectionId;
  fixture.broker.sink.replace(view(fixture.hosted.runtime));
  await fixture.broker.whenIdle();
  assert.equal(fixture.log.filter((entry) => entry.action === "install").length, 2);
  fixture.broker.sink.replace(view(fixture.hosted.runtime, 2));
  await fixture.broker.whenIdle();
  const next = fixture.log.filter((entry) => entry.action === "install" && entry.generation === 2);
  assert.equal(next.length, 2);
  assert.equal(next[0].connectionId, next[1].connectionId);
  assert.notEqual(next[0].connectionId, firstConnection);
  const lastOldRevoke = fixture.log.findLastIndex((entry) => entry.action === "revoke" && entry.connectionId === firstConnection);
  const firstNewInstall = fixture.log.findIndex((entry) => entry.action === "install" && entry.generation === 2);
  assert.ok(lastOldRevoke < firstNewInstall);
  await fixture.broker.close();
});

test("shutdown revokes both committed endpoints", async () => {
  const fixture = await committedFixture();
  const connectionId = fixture.log.find((entry) => entry.action === "install").connectionId;
  await fixture.broker.close();
  const shutdown = fixture.log.filter((entry) => entry.action === "revoke" && entry.connectionId === connectionId);
  assert.deepEqual(shutdown.map((entry) => entry.side), ["window", "runner"]);
  assert.equal(fixture.runner.ports.size, 0);
  assert.equal(fixture.window.ports.size, 0);
});

test("shutdown cancels a pending Window install before rolling back both endpoints", async () => {
  const log = [];
  const hosted = runtimeFixture();
  const runner = provisionerFixture(log);
  const installStarted = deferred();
  const bridge = {
    async request(message, _transfer, signal) {
      const action = message.type === "renderer-data/install" ? "install" : "revoke";
      log.push({ side: "window", action, connectionId: message.connectionId });
      if (action === "install") {
        installStarted.resolve();
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      }
    },
  };
  const broker = new PwaDataBroker(bridge, "epoch-1");
  broker.onRuntimeDataProvisioner(hosted.runtime, runner.provisioner);
  broker.sink.replace(view(hosted.runtime));
  await installStarted.promise;
  await broker.close();
  const connectionId = log.find((entry) => entry.side === "runner" && entry.action === "install").connectionId;
  assert.deepEqual(log.filter((entry) => entry.connectionId === connectionId).map(({ side, action }) => [side, action]), [
    ["runner", "install"],
    ["window", "install"],
    ["window", "revoke"],
    ["runner", "revoke"],
  ]);
  assert.equal(runner.ports.size, 0);
});
