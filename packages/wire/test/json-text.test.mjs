import { test } from "node:test";
import assert from "node:assert/strict";
import {
  JsonTextSyntaxError,
  WireValidationError,
  parseJsonText,
  stringifyJson,
} from "../dist/index.js";

test("parses top-level primitives, objects, arrays, and surrounding whitespace", () => {
  for (const [text, expected] of [
    [" null ", null],
    ["true", true],
    ["12.5", 12.5],
    ["\"text\"", "text"],
    ["[1,2]", [1, 2]],
    ["{\"a\":1}", { a: 1 }],
  ]) {
    assert.deepEqual(parseJsonText(text), expected);
  }
});

test("distinguishes JSON syntax failure from parsed value-model failure", () => {
  assert.throws(() => parseJsonText("{"), JsonTextSyntaxError);
  assert.throws(() => parseJsonText("1e400"), WireValidationError);
});

test("stringify validates before native silent conversion", () => {
  assert.throws(() => stringifyJson(NaN), WireValidationError);
  assert.throws(() => stringifyJson({ value: undefined }), WireValidationError);
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => stringifyJson(sparse), WireValidationError);
  assert.throws(() => stringifyJson({ toJSON() { return 1; } }), WireValidationError);
});

test("stringify round-trips JSON value semantics including shared references", () => {
  const child = { name: "shared" };
  const value = { left: child, right: child, list: [null, true, -0, "😀"] };
  assert.deepEqual(parseJsonText(stringifyJson(value)), {
    left: { name: "shared" },
    right: { name: "shared" },
    list: [null, true, 0, "😀"],
  });
});

test("stringify ignores inherited toJSON hooks", (t) => {
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON");
  t.after(() => {
    if (previous === undefined) delete Object.prototype.toJSON;
    else Object.defineProperty(Object.prototype, "toJSON", previous);
  });
  Object.defineProperty(Object.prototype, "toJSON", {
    configurable: true,
    value() {
      return "hijacked";
    },
  });

  assert.equal(stringifyJson({ value: 1 }), "{\"value\":1}");
});

test("stringify handles very deep inputs without recursive serialization", () => {
  let value = null;
  for (let index = 0; index < 10_000; index += 1) value = [value];
  const text = stringifyJson(value);
  assert.equal(text.length, 20_004);
});
