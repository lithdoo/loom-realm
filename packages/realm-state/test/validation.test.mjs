import test from "node:test";
import assert from "node:assert/strict";
import {
  REALM_STATE_LIMITS,
  RealmStateError,
  compareRealmStateKeys,
  jsonValueMetrics,
  prepareRealmStateDefinition,
  validateRealmStateKey,
  validateTransaction,
} from "../dist/index.js";

const fails = (code) => (error) => error instanceof RealmStateError && error.code === code;

test("identity grammar uses exact Unicode scalar strings and byte bounds", () => {
  assert.deepEqual(validateRealmStateKey({ namespace: " A ", key: "é" }), { namespace: " A ", key: "é" });
  assert.throws(() => validateRealmStateKey({ namespace: "", key: "x" }), fails("INVALID_REQUEST"));
  assert.throws(() => validateRealmStateKey({ namespace: "a/b", key: "x" }), fails("INVALID_REQUEST"));
  assert.throws(() => validateRealmStateKey({ namespace: "a", key: "\u0000" }), fails("INVALID_REQUEST"));
  assert.throws(() => validateRealmStateKey({ namespace: "a", key: "\ud800" }), fails("INVALID_REQUEST"));
  validateRealmStateKey({ namespace: "é".repeat(32), key: "x" });
  assert.throws(() => validateRealmStateKey({ namespace: "é".repeat(33), key: "x" }), fails("LIMIT_EXCEEDED"));
  validateRealmStateKey({ namespace: "n", key: "😀".repeat(64) });
  assert.throws(() => validateRealmStateKey({ namespace: "n", key: "😀".repeat(65) }), fails("LIMIT_EXCEEDED"));
});

test("canonical order is unsigned UTF-8 and does not normalize", () => {
  const keys = [
    { namespace: "ä", key: "a" },
    { namespace: "z", key: "a" },
    { namespace: "e\u0301", key: "a" },
    { namespace: "é", key: "a" },
  ].sort(compareRealmStateKeys);
  assert.deepEqual(keys.map((entry) => entry.namespace), ["e\u0301", "z", "ä", "é"]);
});

test("JSON size and depth accounting locks exact boundaries", () => {
  assert.deepEqual(jsonValueMetrics(null), { encodedBytes: 4, depth: 0 });
  assert.deepEqual(jsonValueMetrics([]), { encodedBytes: 2, depth: 1 });
  assert.deepEqual(jsonValueMetrics({ a: "😀" }), { encodedBytes: Buffer.byteLength(JSON.stringify({ a: "😀" })), depth: 1 });
  let value = null;
  for (let index = 0; index < 64; index += 1) value = [value];
  assert.equal(jsonValueMetrics(value).depth, 64);
  validateTransaction({ conditions: [{ key: { namespace: "n", key: "k" }, version: 0 }], writes: [{ type: "put", key: { namespace: "n", key: "k" }, value }] });
  value = [value];
  assert.throws(() => validateTransaction({ conditions: [{ key: { namespace: "n", key: "k" }, version: 0 }], writes: [{ type: "put", key: { namespace: "n", key: "k" }, value }] }), fails("LIMIT_EXCEEDED"));
  const exact = "x".repeat(REALM_STATE_LIMITS.valueBytes - 2);
  validateTransaction({ conditions: [{ key: { namespace: "n", key: "k" }, version: 0 }], writes: [{ type: "put", key: { namespace: "n", key: "k" }, value: exact }] });
  assert.throws(() => validateTransaction({ conditions: [{ key: { namespace: "n", key: "k" }, version: 0 }], writes: [{ type: "put", key: { namespace: "n", key: "k" }, value: `${exact}x` }] }), fails("LIMIT_EXCEEDED"));
});

test("prepared definitions are detached, frozen, unique, and bounded", () => {
  const source = { nested: [1] };
  const prepared = prepareRealmStateDefinition([{ namespace: "n", key: "k", value: source }]);
  source.nested[0] = 2;
  assert.deepEqual(prepared.records[0].value, { nested: [1] });
  assert(Object.isFrozen(prepared));
  assert(Object.isFrozen(prepared.records[0].value));
  assert.throws(() => prepareRealmStateDefinition([
    { namespace: "n", key: "k", value: null },
    { namespace: "n", key: "k", value: null },
  ]), fails("INVALID_REQUEST"));
});

test("prepared record count and total payload enforce exact frozen boundaries", () => {
  const countBoundary = Array.from({ length: REALM_STATE_LIMITS.initialRecords }, (_, index) => ({
    namespace: "count", key: String(index), value: null,
  }));
  assert.equal(prepareRealmStateDefinition(countBoundary).records.length, REALM_STATE_LIMITS.initialRecords);
  assert.throws(
    () => prepareRealmStateDefinition([...countBoundary, { namespace: "count", key: "overflow", value: null }]),
    fails("LIMIT_EXCEEDED"),
  );

  const payloadBoundary = Array.from({ length: 32 }, (_, index) => {
    const key = String(index).padStart(2, "0");
    const encodedValueBytes = index === 31 ? 262_048 : REALM_STATE_LIMITS.valueBytes;
    return { namespace: "n", key, value: "x".repeat(encodedValueBytes - 2) };
  });
  prepareRealmStateDefinition(payloadBoundary);
  assert.throws(
    () => prepareRealmStateDefinition(payloadBoundary.map((record, index) => (
      index === 31 ? { ...record, value: `${record.value}x` } : record
    ))),
    fails("LIMIT_EXCEEDED"),
  );
});

test("transaction structural admission precedes OCC", () => {
  assert.throws(() => validateTransaction({ conditions: [], writes: [] }), fails("INVALID_REQUEST"));
  assert.throws(() => validateTransaction({
    conditions: [{ key: { namespace: "n", key: "a" }, version: 0 }],
    writes: [{ type: "put", key: { namespace: "n", key: "b" }, value: 1 }],
  }), fails("INVALID_REQUEST"));
  assert.throws(() => validateTransaction({
    conditions: [
      { key: { namespace: "n", key: "a" }, version: 0 },
      { key: { namespace: "n", key: "a" }, version: 0 },
    ],
    writes: [{ type: "put", key: { namespace: "n", key: "a" }, value: 1 }],
  }), fails("INVALID_REQUEST"));
});

test("transaction write payload accepts exactly 2 MiB and rejects the next value", () => {
  const value = "x".repeat(REALM_STATE_LIMITS.valueBytes - 2);
  const conditions = Array.from({ length: 9 }, (_, index) => ({
    key: { namespace: "payload", key: String(index) }, version: 0,
  }));
  const writes = conditions.map(({ key }) => ({ type: "put", key, value }));
  validateTransaction({ conditions: conditions.slice(0, 8), writes: writes.slice(0, 8) });
  assert.throws(
    () => validateTransaction({ conditions, writes }),
    fails("LIMIT_EXCEEDED"),
  );
});
