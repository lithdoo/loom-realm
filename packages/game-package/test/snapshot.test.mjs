import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGameEntryV1 } from "../dist/index.js";

function entry(input) {
  return {
    formatVersion: 1,
    initial: { subsystem: "loom.map", input },
    subsystems: [{ key: "loom.map" }],
  };
}

test("returns a detached deeply frozen snapshot without freezing the source", () => {
  const source = entry({ nested: [{ value: 1 }] });
  const result = validateGameEntryV1(source);

  assert.notEqual(result, source);
  assert.notEqual(result.initial, source.initial);
  assert.notEqual(result.initial.input, source.initial.input);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(source.initial.input.nested), false);

  source.initial.subsystem = "changed";
  source.initial.input.nested[0].value = 2;
  source.subsystems[0].key = "changed";
  assert.equal(result.initial.subsystem, "loom.map");
  assert.equal(result.initial.input.nested[0].value, 1);
  assert.equal(result.subsystems[0].key, "loom.map");

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.initial), true);
  assert.equal(Object.isFrozen(result.initial.input), true);
  assert.equal(Object.isFrozen(result.initial.input.nested), true);
  assert.equal(Object.isFrozen(result.initial.input.nested[0]), true);
  assert.equal(Object.isFrozen(result.subsystems), true);
  assert.equal(Object.isFrozen(result.subsystems[0]), true);
  assert.throws(() => { result.initial.input.nested[0].value = 3; }, TypeError);
});

test("preserves negative zero and prototype-looking data members safely", () => {
  const input = JSON.parse('{"__proto__":{"safe":true},"constructor":"data"}');
  input.negativeZero = -0;
  const result = validateGameEntryV1(entry(input));

  assert.equal(Object.getPrototypeOf(result.initial.input), Object.prototype);
  assert.deepEqual(result.initial.input.__proto__, { safe: true });
  assert.equal(result.initial.input.constructor, "data");
  assert.equal(Object.is(result.initial.input.negativeZero, -0), true);
  assert.equal({}.safe, undefined);
});

test("handles very deep input without recursive validation or copying", { timeout: 5_000 }, () => {
  let input = null;
  for (let index = 0; index < 30_000; index += 1) input = [input];
  const result = validateGameEntryV1(entry(input));

  let cursor = result.initial.input;
  for (let index = 0; index < 30_000; index += 1) cursor = cursor[0];
  assert.equal(cursor, null);
});

test("does not exponentially expand a shared acyclic graph", { timeout: 5_000 }, () => {
  let input = { value: 1 };
  for (let index = 0; index < 25; index += 1) input = { left: input, right: input };
  const result = validateGameEntryV1(entry(input));

  let left = result.initial.input;
  let right = result.initial.input;
  for (let index = 0; index < 25; index += 1) {
    left = left.left;
    right = right.right;
  }
  assert.deepEqual(left, { value: 1 });
  assert.deepEqual(right, { value: 1 });
});

test("does not invoke inherited toJSON", () => {
  let calls = 0;
  Object.defineProperty(Object.prototype, "toJSON", {
    configurable: true,
    value() {
      calls += 1;
      return null;
    },
  });
  try {
    validateGameEntryV1(entry({ value: 1 }));
    assert.equal(calls, 0);
  } finally {
    delete Object.prototype.toJSON;
  }
});
