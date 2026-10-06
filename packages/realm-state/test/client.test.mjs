import test from "node:test";
import assert from "node:assert/strict";
import {
  RealmStateError,
  createInMemoryRealmStateBinding,
  createRealmStateAuthority,
  createRealmStateClient,
  prepareRealmStateDefinition,
} from "../dist/index.js";

const target = { namespace: "n", key: "k" };
const transaction = { conditions: [{ key: target, version: 0 }], writes: [{ type: "put", key: target, value: 1 }] };
const fails = (code) => (error) => error instanceof RealmStateError && error.code === code;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test("logical client fails fast unbound, survives rebind, and terminals with Runtime", async () => {
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
  const client = createRealmStateClient();
  await assert.rejects(client.read([target]), fails("BINDING_UNAVAILABLE"));
  const identity = client;
  const first = createInMemoryRealmStateBinding(authority);
  client.attach(first);
  assert.equal((await client.read([target])).records[0].version, 0);
  client.detach();
  await assert.rejects(client.read([target]), fails("BINDING_UNAVAILABLE"));
  client.attach(createInMemoryRealmStateBinding(authority));
  assert.equal(client, identity);
  await client.commit(transaction);
  client.terminate();
  await assert.rejects(client.read([target]), fails("TERMINAL"));
});

test("binding generation fences late read and maps dispatched lost commit to OUTCOME_UNKNOWN without replay", async () => {
  const readResult = deferred();
  const commitResult = deferred();
  const terminalA = deferred();
  let commitsA = 0;
  const bindingA = Object.freeze({
    read: () => readResult.promise,
    readInitial: () => Promise.reject(new Error()),
    list: () => Promise.reject(new Error()),
    scan: () => Promise.reject(new Error()),
    commit: () => { commitsA += 1; return { dispatched: Promise.resolve(), result: commitResult.promise }; },
    subscribe: () => Promise.reject(new Error()),
    terminal: terminalA.promise,
    close() {},
  });
  const authorityB = createRealmStateAuthority(prepareRealmStateDefinition([]));
  const client = createRealmStateClient(bindingA);
  const oldRead = client.read([target]);
  const oldCommit = client.commit(transaction);
  await Promise.resolve();
  terminalA.resolve();
  await Promise.resolve();
  client.attach(createInMemoryRealmStateBinding(authorityB));
  readResult.resolve({ revision: 99, records: [{ key: target, value: "old", version: 99 }] });
  commitResult.resolve({ revision: 99, records: [{ key: target, version: 99 }] });
  await assert.rejects(oldRead, fails("BINDING_UNAVAILABLE"));
  await assert.rejects(oldCommit, fails("OUTCOME_UNKNOWN"));
  assert.equal(commitsA, 1);
  assert.equal((await client.read([target])).records[0].version, 0);
});

test("commit lost before dispatch is known no-commit and is never retried", async () => {
  const terminalBinding = deferred();
  let attempts = 0;
  const binding = Object.freeze({
    read: () => Promise.reject(new Error()),
    readInitial: () => Promise.reject(new Error()),
    list: () => Promise.reject(new Error()),
    scan: () => Promise.reject(new Error()),
    commit: () => {
      attempts += 1;
      return { dispatched: Promise.reject(new Error("not accepted")), result: Promise.reject(new Error("not accepted")) };
    },
    subscribe: () => Promise.reject(new Error()),
    terminal: terminalBinding.promise,
    close() {},
  });
  const client = createRealmStateClient(binding);
  await assert.rejects(client.commit(transaction), fails("BINDING_UNAVAILABLE"));
  assert.equal(attempts, 1);
  terminalBinding.resolve();
});

test("late old-binding subscription events cannot cross a rebind generation", async () => {
  const terminalA = deferred();
  let oldListener;
  const bindingA = Object.freeze({
    read: () => Promise.reject(new Error()),
    readInitial: () => Promise.reject(new Error()),
    list: () => Promise.reject(new Error()),
    scan: () => Promise.reject(new Error()),
    commit: () => ({ dispatched: Promise.reject(new Error()), result: Promise.reject(new Error()) }),
    subscribe: async (_keys, listener) => { oldListener = listener; return Object.freeze({ close() {} }); },
    terminal: terminalA.promise,
    close() {},
  });
  const authorityB = createRealmStateAuthority(prepareRealmStateDefinition([]));
  const client = createRealmStateClient(bindingA);
  const events = [];
  await client.subscribe([target], (event) => events.push(event));
  terminalA.resolve();
  await Promise.resolve();
  client.attach(createInMemoryRealmStateBinding(authorityB));
  oldListener({ type: "change", revision: 99, records: [{ key: target, value: "stale", version: 99 }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, [{ type: "terminal", reason: "binding-terminal" }]);
});

test("old subscriptions terminal on binding loss and fresh subscribe gets a fresh baseline", async () => {
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
  const first = createInMemoryRealmStateBinding(authority);
  const client = createRealmStateClient(first);
  const oldEvents = [];
  await client.subscribe([target], (event) => oldEvents.push(event));
  await new Promise((resolve) => setTimeout(resolve, 5));
  first.close();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(oldEvents.at(-1).reason, "binding-terminal");
  client.attach(createInMemoryRealmStateBinding(authority));
  const freshEvents = [];
  await client.subscribe([target], (event) => freshEvents.push(event));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(freshEvents.map((event) => event.type), ["baseline"]);
});
