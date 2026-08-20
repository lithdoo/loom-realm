import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WireValidationError,
  assertBoolean,
  assertFiniteNumber,
  assertJsonArray,
  assertJsonObject,
  assertJsonValue,
  assertSafeInteger,
  assertString,
  isJsonArray,
  isJsonObject,
  isJsonValue,
} from "../dist/index.js";

test("accepts every JSON primitive including negative zero", () => {
  for (const value of [null, true, false, "", "text", 0, -0, 1.5, -12]) {
    assert.equal(isJsonValue(value), true);
    assert.doesNotThrow(() => assertJsonValue(value));
  }
  assert.equal(Object.is(-0, -0), true);
});

test("rejects non-JSON and non-finite primitive values", () => {
  for (const value of [undefined, 1n, Symbol("x"), () => {}, NaN, Infinity, -Infinity]) {
    assert.equal(isJsonValue(value), false);
    assert.throws(() => assertJsonValue(value), WireValidationError);
  }
});

test("accepts ordinary and null-prototype objects", () => {
  const nullPrototype = Object.assign(Object.create(null), { value: 1 });
  assert.equal(isJsonObject({ nested: [true, null] }), true);
  assert.equal(isJsonObject(nullPrototype), true);
  assert.doesNotThrow(() => assertJsonObject(nullPrototype));
});

test("rejects class instances and built-in/exotic object shapes", () => {
  class Example {
    value = 1;
  }
  for (const value of [new Example(), new Date(), new Map(), new Set(), /x/, new Uint8Array()]) {
    assert.equal(isJsonValue(value), false);
  }
});

test("rejects accessors without invoking getters", () => {
  let reads = 0;
  const value = {};
  Object.defineProperty(value, "danger", {
    enumerable: true,
    get() {
      reads += 1;
      return 1;
    },
  });

  assert.equal(isJsonValue(value), false);
  assert.equal(reads, 0);
});

test("rejects symbol and non-enumerable application properties", () => {
  const symbolObject = { value: 1, [Symbol("hidden")]: 2 };
  const nonEnumerable = { value: 1 };
  Object.defineProperty(nonEnumerable, "hidden", { value: 2, enumerable: false });

  assert.equal(isJsonValue(symbolObject), false);
  assert.equal(isJsonValue(nonEnumerable), false);
});

test("accepts dense arrays and rejects sparse or augmented arrays", () => {
  assert.equal(isJsonArray([1, "two", null]), true);
  assert.doesNotThrow(() => assertJsonArray([]));

  const sparse = [];
  sparse.length = 3;
  const augmented = [1];
  augmented.extra = 2;
  const nonEnumerableElement = [1];
  Object.defineProperty(nonEnumerableElement, "0", { value: 1, enumerable: false });

  for (const value of [sparse, augmented, nonEnumerableElement]) {
    assert.equal(isJsonArray(value), false);
  }
});

test("rejects cycles at the precise nested path but accepts shared children", () => {
  const cyclic = { items: [{}] };
  cyclic.items[0].again = cyclic;
  assert.throws(
    () => assertJsonValue(cyclic),
    (error) => {
      assert.ok(error instanceof WireValidationError);
      assert.deepEqual(error.path, ["items", 0, "again"]);
      return true;
    },
  );

  const child = { value: 1 };
  assert.equal(isJsonValue({ left: child, right: child }), true);
});

test("validation is iterative for very deep values", () => {
  let value = null;
  for (let index = 0; index < 20_000; index += 1) value = [value];
  assert.doesNotThrow(() => assertJsonValue(value));
});

test("revoked proxies fail closed", () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  assert.equal(isJsonValue(proxy), false);
  assert.throws(() => assertJsonValue(proxy), WireValidationError);
});

test("primitive assertion helpers enforce only their representation fact", () => {
  assert.doesNotThrow(() => assertString(""));
  assert.doesNotThrow(() => assertBoolean(false));
  assert.doesNotThrow(() => assertFiniteNumber(-0));
  assert.doesNotThrow(() => assertSafeInteger(Number.MIN_SAFE_INTEGER));
  assert.doesNotThrow(() => assertSafeInteger(Number.MAX_SAFE_INTEGER));

  assert.throws(() => assertString(1), WireValidationError);
  assert.throws(() => assertBoolean(0), WireValidationError);
  assert.throws(() => assertFiniteNumber(Infinity), WireValidationError);
  assert.throws(() => assertSafeInteger(1.5), WireValidationError);
  assert.throws(() => assertSafeInteger(Number.MAX_SAFE_INTEGER + 1), WireValidationError);
});
