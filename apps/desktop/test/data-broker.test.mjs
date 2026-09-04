import test from "node:test";
import assert from "node:assert/strict";
import { DesktopDataConnectionBroker } from "../dist/index.js";
import { connectBoundedDataCarrier, DEFAULT_DATA_BUFFER_POLICY } from "../dist/data-websocket.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${message}`);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function runtime() {
  return Object.freeze({
    runtimeControl: Object.freeze({ acquire: () => Promise.reject(new Error("unused")) }),
    terminated: new Promise(() => {}),
    requestTermination: async () => {},
  });
}

class FakeProvisioner {
  pending = null;
  current = null;
  prepares = [];
  commits = [];
  revokes = [];
  prepareGate = null;
  failNextCommit = false;
  commitFailureGate = null;
  sendBeforePrepared = false;

  async prepare(request, signal) {
    if (this.pending !== null) throw new Error("pending occupied");
    const carrier = await connectBoundedDataCarrier(request.endpoint, signal, DEFAULT_DATA_BUFFER_POLICY);
    const owned = { request, carrier };
    this.pending = owned;
    this.prepares.push(owned);
    if (this.sendBeforePrepared) {
      await carrier.send("pre-install-traffic");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (this.prepareGate !== null) await this.prepareGate.promise;
    if (signal.aborted || this.pending !== owned) throw signal.reason ?? new Error("revoked");
  }

  async commit(candidateId, signal) {
    this.commits.push(candidateId);
    if (this.failNextCommit) {
      this.failNextCommit = false;
      if (this.commitFailureGate !== null) await this.commitFailureGate.promise;
      throw new Error("commit delivery failed");
    }
    if (signal.aborted || this.pending?.request.candidateId !== candidateId) throw new Error("not prepared");
    const old = this.current;
    this.current = this.pending;
    this.pending = null;
    if (old !== null) void old.carrier.close().catch(() => {});
  }

  revoke(candidateId) {
    this.revokes.push(candidateId);
    if (this.pending?.request.candidateId === candidateId) {
      const owned = this.pending;
      this.pending = null;
      void owned.carrier.close().catch(() => {});
    }
    if (this.current?.request.candidateId === candidateId) {
      const owned = this.current;
      this.current = null;
      void owned.carrier.close().catch(() => {});
    }
  }
}

function authority(token, hosted, generation = 1, dataProfile = "loomrealm.renderer-data/1") {
  return Object.freeze({
    rendererControlToken: token,
    entries: Object.freeze([Object.freeze({
      subsystemKey: "root",
      generation,
      dataProfile,
      runtime: hosted,
    })]),
  });
}

function setup(options = {}) {
  let id = 0;
  const broker = new DesktopDataConnectionBroker({
    candidateId: () => `candidate-${++id}`,
    ...options,
  });
  const hosted = runtime();
  const provisioner = new FakeProvisioner();
  broker.onRuntimeDataProvisioner(hosted, provisioner);
  const binding = broker.rendererDataBinding("renderer-a");
  return { broker, hosted, provisioner, binding };
}

test("paired candidate installs once and relays opaque text in both directions", async (t) => {
  const { broker, hosted, provisioner, binding } = setup();
  t.after(() => broker.close());
  const rendererCarrierPromise = binding.acquire(
    "root", 1, "loomrealm.renderer-data/1", new AbortController().signal,
  );
  broker.sink.replace(authority("renderer-a", hosted));
  const rendererCarrier = await rendererCarrierPromise;
  await waitFor(() => provisioner.current !== null, "Runner post-install commit");
  const runnerCarrier = provisioner.current.carrier;

  const rendererMessages = rendererCarrier.messages()[Symbol.asyncIterator]();
  const runnerMessages = runnerCarrier.messages()[Symbol.asyncIterator]();
  const rendererUnit = "{ definitely-not-parsed";
  const runnerUnit = "opaque runner text";
  await runnerCarrier.send(rendererUnit);
  assert.deepEqual(await rendererMessages.next(), { done: false, value: rendererUnit });
  await rendererCarrier.send(runnerUnit);
  assert.deepEqual(await runnerMessages.next(), { done: false, value: runnerUnit });

  broker.sink.replace(null);
  assert.ok(["closed", "lost"].includes((await rendererCarrier.closed).kind));
  assert.ok(["closed", "lost"].includes((await runnerCarrier.closed).kind));
});

test("one pending owner rejects newcomers and exact Runtime replacement invalidates stale work", async (t) => {
  const { broker, hosted, provisioner } = setup();
  t.after(() => broker.close());
  provisioner.prepareGate = deferred();
  broker.sink.replace(authority("renderer-a", hosted));
  await waitFor(() => provisioner.pending !== null, "first pending candidate");
  assert.equal(await broker.requestCandidate("root"), false);
  assert.equal(provisioner.commits.length, 0, "one-side logical prepare cannot install");

  const replacement = runtime();
  broker.sink.replace(authority("renderer-a", replacement));
  await waitFor(() => provisioner.revokes.includes("candidate-1"), "stale candidate revoke");
  provisioner.prepareGate.resolve();
  assert.equal(provisioner.current, null);
});

test("different subsystem slots install and retire independently", async (t) => {
  let id = 0;
  const broker = new DesktopDataConnectionBroker({ candidateId: () => `independent-${++id}` });
  t.after(() => broker.close());
  const runtimeA = runtime();
  const runtimeB = runtime();
  const provisionerA = new FakeProvisioner();
  const provisionerB = new FakeProvisioner();
  broker.onRuntimeDataProvisioner(runtimeA, provisionerA);
  broker.onRuntimeDataProvisioner(runtimeB, provisionerB);
  const binding = broker.rendererDataBinding("renderer-a");
  const acquireA = binding.acquire("a", 1, "loomrealm.renderer-data/1", new AbortController().signal);
  const acquireB = binding.acquire("b", 1, "loomrealm.renderer-data/1", new AbortController().signal);
  broker.sink.replace(Object.freeze({
    rendererControlToken: "renderer-a",
    entries: Object.freeze([
      Object.freeze({ subsystemKey: "a", generation: 1, dataProfile: "loomrealm.renderer-data/1", runtime: runtimeA }),
      Object.freeze({ subsystemKey: "b", generation: 1, dataProfile: "loomrealm.renderer-data/1", runtime: runtimeB }),
    ]),
  }));
  const [carrierA, carrierB] = await Promise.all([acquireA, acquireB]);
  await waitFor(() => provisionerA.current !== null && provisionerB.current !== null, "independent currents");
  await provisionerA.current.carrier.close();
  assert.ok(["closed", "lost"].includes((await carrierA.closed).kind));
  const bClosedEarly = await Promise.race([
    carrierB.closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 30)),
  ]);
  assert.equal(bClosedEarly, false, "slot B remains current when slot A retires");
});

test("pre-install application traffic disposes the candidate without creating current", async (t) => {
  const { broker, hosted, provisioner } = setup();
  t.after(() => broker.close());
  provisioner.sendBeforePrepared = true;
  broker.sink.replace(authority("renderer-a", hosted));
  await waitFor(() => provisioner.revokes.includes("candidate-1"), "pre-install candidate disposal");
  assert.equal(provisioner.current, null);
  assert.equal(provisioner.commits.length, 0);
});

test("Renderer token and S/G/P replacement synchronously revoke stale pending material", async (t) => {
  const { broker, hosted, provisioner } = setup();
  t.after(() => broker.close());
  provisioner.prepareGate = deferred();
  broker.sink.replace(authority("renderer-a", hosted));
  await waitFor(() => provisioner.pending !== null, "token-bound candidate");
  broker.rendererDataBinding("renderer-b");
  assert.doesNotThrow(() => broker.sink.replace(authority("renderer-b", hosted, 2, "replacement/profile")));
  assert.ok(provisioner.revokes.includes("candidate-1"));
  assert.equal(provisioner.current, null);
  provisioner.prepareGate.resolve();
});

test("post-install Runner commit failure retires B and never resurrects A", async (t) => {
  const { broker, hosted, provisioner, binding } = setup();
  t.after(() => broker.close());
  const aPromise = binding.acquire("root", 1, "loomrealm.renderer-data/1", new AbortController().signal);
  broker.sink.replace(authority("renderer-a", hosted));
  const a = await aPromise;
  await waitFor(() => provisioner.current !== null, "A current");

  provisioner.failNextCommit = true;
  provisioner.commitFailureGate = deferred();
  assert.equal(await broker.requestCandidate("root"), true, "B reached logical installation");
  const b = await binding.acquire("root", 1, "loomrealm.renderer-data/1", new AbortController().signal);
  provisioner.commitFailureGate.resolve();
  assert.ok(["closed", "lost"].includes((await a.closed).kind));
  assert.ok(["closed", "lost"].includes((await b.closed).kind));
  await waitFor(
    () => provisioner.current?.request.candidateId === "candidate-3",
    "fresh recovery after B delivery failure",
  );
  assert.notEqual(provisioner.current.request.candidateId, "candidate-1", "A cannot be restored");
  assert.ok(provisioner.revokes.includes("candidate-1"));
  assert.ok(provisioner.revokes.includes("candidate-2"));
});

test("proactive same-generation replacement cuts over from A to B exactly once", async (t) => {
  const { broker, hosted, provisioner, binding } = setup();
  t.after(() => broker.close());
  const firstAcquire = binding.acquire(
    "root", 1, "loomrealm.renderer-data/1", new AbortController().signal,
  );
  broker.sink.replace(authority("renderer-a", hosted));
  const a = await firstAcquire;
  await waitFor(() => provisioner.current?.request.candidateId === "candidate-1", "A current");

  assert.equal(await broker.requestCandidate("root"), true);
  assert.equal(provisioner.current.request.candidateId, "candidate-2");
  const b = await binding.acquire(
    "root", 1, "loomrealm.renderer-data/1", new AbortController().signal,
  );
  assert.notEqual(b, a);
  assert.ok(["closed", "lost"].includes((await a.closed).kind));
  assert.equal(provisioner.current.request.generation, 1);
  assert.equal(provisioner.current.request.dataProfile, "loomrealm.renderer-data/1");
  assert.equal(provisioner.revokes.filter((id) => id === "candidate-1").length, 1);

  const bClosedEarly = await Promise.race([
    b.closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 30)),
  ]);
  assert.equal(bClosedEarly, false, "B remains the sole current carrier");
});

test("Renderer authority transition closes and forgets the retired token binding", async (t) => {
  const { broker, hosted, provisioner, binding: bindingA } = setup();
  t.after(() => broker.close());
  broker.sink.replace(authority("renderer-a", hosted));
  await waitFor(() => provisioner.current !== null, "Renderer A current");
  const bindingB = broker.rendererDataBinding("renderer-b");
  broker.sink.replace(authority("renderer-b", hosted));
  await assert.rejects(
    bindingA.acquire("root", 1, "loomrealm.renderer-data/1", new AbortController().signal),
    /closed/,
  );
  await bindingB.acquire("root", 1, "loomrealm.renderer-data/1", new AbortController().signal);
});

test("finite role-undelivered buffer overflow retires the whole pair and permits fresh same-generation install", async (t) => {
  const { broker, hosted, provisioner, binding } = setup({
    bufferPolicy: { maxMessages: 1, maxBytes: 128 },
  });
  t.after(() => broker.close());
  const firstPromise = binding.acquire("root", 1, "loomrealm.renderer-data/1", new AbortController().signal);
  broker.sink.replace(authority("renderer-a", hosted));
  const first = await firstPromise;
  await waitFor(() => provisioner.current !== null, "first Runner carrier");
  const firstRunner = provisioner.current.carrier;
  await firstRunner.send("one");
  await firstRunner.send("two");
  assert.equal((await first.closed).kind, "lost");

  const secondPromise = binding.acquire("root", 1, "loomrealm.renderer-data/1", new AbortController().signal);
  const second = await secondPromise;
  assert.notEqual(second, first);
  await waitFor(() => provisioner.prepares.length >= 2, "same-generation replacement");
  assert.equal(provisioner.prepares[1].request.generation, 1);
  assert.equal(provisioner.prepares[1].request.dataProfile, "loomrealm.renderer-data/1");
});
