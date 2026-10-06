import test from "node:test";
import assert from "node:assert/strict";
import {
  RealmStateError,
  createRealmStateAuthority,
  prepareRealmStateDefinition,
} from "../dist/index.js";
import { createAuthorityForTesting } from "../dist/testing.js";

const key = (namespace, key) => ({ namespace, key });
const put = (target, version, value, extra = []) => ({
  conditions: [{ key: target, version }, ...extra],
  writes: [{ type: "put", key: target, value }],
});
const fails = (code) => (error) => error instanceof RealmStateError && error.code === code;
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("observation, materialization, initial values, and canonical arrays", async () => {
  const declared = key("z", "declared");
  const explicitNull = key("n", "null");
  const unknown = key("n", "unknown");
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([
    { namespace: declared.namespace, key: declared.key, value: { hp: 10 } },
    { namespace: explicitNull.namespace, key: explicitNull.key, value: null },
  ]));
  const read = await authority.read([declared, unknown, explicitNull]);
  assert.equal(read.revision, 0);
  assert.deepEqual(read.records.map((record) => record.key), [explicitNull, unknown, declared]);
  assert.deepEqual(read.records.map((record) => [record.value, record.version]), [[null, 0], [null, 0], [{ hp: 10 }, 0]]);
  assert.deepEqual((await authority.list()).records.map((record) => record.key), [explicitNull, declared]);
  assert.deepEqual((await authority.scan({ namespace: "missing" })).records, []);
  await authority.commit(put(unknown, 0, null));
  assert.deepEqual((await authority.list({ namespace: "n" })).records.map((record) => [record.key.key, record.version]), [["null", 0], ["unknown", 1]]);
  assert.equal((await authority.readInitial([unknown])).records[0].value, null);
  await authority.commit(put(declared, 0, { hp: 10 }));
  assert.equal((await authority.read([declared])).records[0].version, 1);
  assert.deepEqual((await authority.readInitial([declared])).records[0].value, { hp: 10 });
});

test("whole-record OCC is atomic across Collections and conflicts write zero", async () => {
  const a = key("a", "one");
  const b = key("b", "two");
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
  const committed = await authority.commit({
    conditions: [{ key: a, version: 0 }, { key: b, version: 0 }],
    writes: [{ type: "put", key: b, value: 2 }, { type: "put", key: a, value: 1 }],
  });
  assert.equal(committed.revision, 1);
  assert.deepEqual(committed.records.map((record) => record.key), [a, b]);
  await assert.rejects(authority.commit({
    conditions: [{ key: a, version: 0 }, { key: b, version: 1 }],
    writes: [{ type: "put", key: b, value: 3 }],
  }), fails("CONFLICT"));
  assert.deepEqual((await authority.scan()).records.map((record) => [record.value, record.version]), [[1, 1], [2, 1]]);
  assert.equal(authority.revision, 1);
});

test("safe-integer exhaustion is known no-commit and authority stays readable", async () => {
  const target = key("n", "k");
  const prepared = prepareRealmStateDefinition([{ namespace: "n", key: "k", value: 1 }]);
  const revisionExhausted = createAuthorityForTesting(prepared, {}, { revision: Number.MAX_SAFE_INTEGER });
  await assert.rejects(revisionExhausted.commit(put(target, 0, 2)), fails("LIMIT_EXCEEDED"));
  assert.equal((await revisionExhausted.read([target])).records[0].value, 1);
  const token = `${target.namespace.length}:${target.namespace}${target.key}`;
  const versionExhausted = createAuthorityForTesting(prepared, {}, { versions: new Map([[token, Number.MAX_SAFE_INTEGER]]) });
  await assert.rejects(versionExhausted.commit(put(target, Number.MAX_SAFE_INTEGER, 2)), fails("LIMIT_EXCEEDED"));
  assert.deepEqual(await versionExhausted.read([target]), {
    revision: 0,
    records: [{ key: target, value: 1, version: Number.MAX_SAFE_INTEGER }],
  });
});

test("materialized Record exhaustion rejects only new identities with zero write", async () => {
  const initial = Array.from({ length: 4096 }, (_, index) => ({ namespace: "capacity", key: `i${index}`, value: null }));
  const authority = createRealmStateAuthority(prepareRealmStateDefinition(initial));
  for (let batch = 0; batch < 96; batch += 1) {
    const keys = Array.from({ length: 128 }, (_, index) => key("capacity", `r${batch * 128 + index}`));
    await authority.commit({
      conditions: keys.map((target) => ({ key: target, version: 0 })),
      writes: keys.map((target) => ({ type: "put", key: target, value: null })),
    });
  }
  assert.equal((await authority.list()).records.length, 16384);
  const revision = authority.revision;
  await assert.rejects(authority.commit(put(key("capacity", "overflow"), 0, 1)), fails("LIMIT_EXCEEDED"));
  assert.equal(authority.revision, revision);
  assert.equal((await authority.list()).records.length, 16384);
  const existing = key("capacity", "i0");
  await authority.commit(put(existing, 0, 1));
  assert.equal((await authority.read([existing])).records[0].version, 1);
});

test("subscriptions deliver baseline first, aggregate commits, permit reentrancy, and contain listener failure", async () => {
  const a = key("n", "a");
  const b = key("n", "b");
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
  const events = [];
  const subscription = await authority.subscribe([b, a], async (event) => {
    events.push(event);
    if (event.type === "baseline") await authority.read([a]);
    if (event.type === "change") throw new Error("contained");
  });
  await tick();
  await authority.commit({
    conditions: [{ key: a, version: 0 }, { key: b, version: 0 }],
    writes: [{ type: "put", key: b, value: 2 }, { type: "put", key: a, value: 1 }],
  });
  await tick();
  assert.deepEqual(events.map((event) => event.type), ["baseline", "change"]);
  assert.deepEqual(events[0].snapshot.records.map((record) => record.key), [a, b]);
  assert.deepEqual(events[1].records.map((record) => record.key), [a, b]);
  subscription.close();
  subscription.close();
  await authority.commit(put(a, 1, 3));
  await tick();
  assert.equal(events.length, 2);
});

test("slow consumer overflow is terminal and never silently drops while continuing", async () => {
  const target = key("n", "k");
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const events = [];
  await authority.subscribe([target], async (event) => {
    events.push(event);
    if (event.type === "baseline") await gate;
  });
  await tick();
  for (let version = 0; version < 65; version += 1) {
    await authority.commit(put(target, version, version));
  }
  release();
  await tick();
  await tick();
  assert.equal(events[0].type, "baseline");
  assert.equal(events.at(-1).type, "terminal");
  assert.equal(events.at(-1).reason, "overflow");
  assert.equal(events.some((event) => event.type === "change"), false);
});

test("live fatal self-terminals before reporting and terminalizes subscriptions", async () => {
  const target = key("n", "k");
  let observedTerminal = false;
  let reportedWhileTerminal = false;
  let authority;
  authority = createRealmStateAuthority(prepareRealmStateDefinition([]), {
    onFatal() { reportedWhileTerminal = authority.terminal; },
  });
  await authority.subscribe([target], (event) => { if (event.type === "terminal") observedTerminal = true; });
  authority.reportFatal(new Error("invariant"));
  assert.equal(reportedWhileTerminal, true);
  await assert.rejects(authority.read([target]), fails("TERMINAL"));
  await tick();
  assert.equal(observedTerminal, true);
});

test("Session termination terminals existing subscriptions and rejects later admission", async () => {
  const target = key("n", "k");
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
  const events = [];
  await authority.subscribe([target], (event) => events.push(event));
  authority.terminate();
  await tick();
  assert.deepEqual(events.map((event) => event.type), ["baseline", "terminal"]);
  assert.equal(events[1].reason, "authority-terminal");
  await assert.rejects(authority.read([target]), fails("TERMINAL"));
});

test("close racing queued delivery permits no callback after close returns", async () => {
  const target = key("n", "close-race");
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const events = [];
  const subscription = await authority.subscribe([target], async (event) => {
    events.push(event.type);
    if (event.type === "baseline") await gate;
  });
  await tick();
  await authority.commit(put(target, 0, 1));
  subscription.close();
  release();
  await tick();
  assert.deepEqual(events, ["baseline"]);
});

test("pre-READY construction failure is bootstrap failure and never reports live fatal", () => {
  let fatalReports = 0;
  assert.throws(
    () => createRealmStateAuthority(
      { records: [{ key: { namespace: "bad/name", key: "k" }, value: null }] },
      { onFatal: () => { fatalReports += 1; } },
    ),
    fails("INVALID_REQUEST"),
  );
  assert.equal(fatalReports, 0);
});

test("concurrent overlapping transactions serialize without partial commit while non-overlapping transactions both commit", async () => {
  const a = key("race", "a");
  const b = key("race", "b");
  const authority = createRealmStateAuthority(prepareRealmStateDefinition([]));
  const overlapping = await Promise.allSettled([
    authority.commit(put(a, 0, 1)),
    authority.commit(put(a, 0, 2)),
  ]);
  assert.deepEqual(overlapping.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(overlapping.find((result) => result.status === "rejected").reason.code, "CONFLICT");
  assert.equal((await authority.read([a])).records[0].version, 1);
  const nonOverlapping = await Promise.all([
    authority.commit(put(a, 1, 3)),
    authority.commit(put(b, 0, 4)),
  ]);
  assert.deepEqual(nonOverlapping.map((commit) => commit.revision), [2, 3]);
  assert.deepEqual((await authority.read([a, b])).records.map((record) => record.version), [2, 1]);
});
