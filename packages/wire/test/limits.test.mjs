import { test } from "node:test";
import assert from "node:assert/strict";
import { WireValidationError, jsonDepth, utf8ByteLength } from "../dist/index.js";

test("measures standard UTF-8 bytes rather than UTF-16 length", () => {
  assert.equal(utf8ByteLength(""), 0);
  assert.equal(utf8ByteLength("ASCII"), 5);
  assert.equal(utf8ByteLength("中文"), 6);
  assert.equal(utf8ByteLength("😀"), 4);
  assert.equal(utf8ByteLength("e\u0301"), 3);
  assert.equal(utf8ByteLength("\ud800"), 3);
  assert.equal(utf8ByteLength("\udc00"), 3);
  assert.throws(() => utf8ByteLength(42), WireValidationError);
});

test("uses the frozen container-count depth definition", () => {
  assert.equal(jsonDepth(null), 0);
  assert.equal(jsonDepth(1), 0);
  assert.equal(jsonDepth("x"), 0);
  assert.equal(jsonDepth([]), 1);
  assert.equal(jsonDepth({}), 1);
  assert.equal(jsonDepth([1]), 1);
  assert.equal(jsonDepth([[]]), 2);
  assert.equal(jsonDepth({ a: {} }), 2);
  assert.equal(jsonDepth({ a: [{ b: 1 }] }), 3);
});

test("measures very deep input without call-stack overflow", () => {
  let value = null;
  for (let index = 0; index < 20_000; index += 1) value = { child: value };
  assert.equal(jsonDepth(value), 20_000);
});
