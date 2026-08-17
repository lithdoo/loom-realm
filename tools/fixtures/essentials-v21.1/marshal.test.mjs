import assert from "node:assert/strict";
import test from "node:test";
import { ImportFailure } from "./lib/errors.mjs";
import { decodeMarshal } from "./lib/marshal/decoder.mjs";

const bytes = (...values) => Buffer.from([4, 8, ...values]);

test("Ruby Marshal decoder preserves object links and cycles", () => {
  const decoded = decodeMarshal(bytes(91, 6, 64, 0)); // [@0]
  assert.equal(decoded.root.kind, "array");
  assert.equal(decoded.root.items[0], decoded.root);
  assert.equal(decoded.coverage.invalidReferences, 0);
  assert.equal(decoded.coverage.discardedNodes, 0);
});

test("Ruby Marshal decoder preserves symbols, symbol links, strings and ivars", () => {
  const symbols = decodeMarshal(bytes(91, 7, 58, 6, 97, 59, 0)); // [:a, ;0]
  assert.equal(symbols.root.items[0], symbols.root.items[1]);
  const string = decodeMarshal(bytes(73, 34, 6, 120, 6, 58, 6, 69, 84)); // I\"x :E true
  assert.equal(string.root.text, "x");
  assert.equal(string.root.ivars.E, true);
});

test("Ruby Marshal decoder keeps unknown Ruby classes as generic graph objects", () => {
  const decoded = decodeMarshal(bytes(111, 58, 8, 70, 111, 111, 6, 58, 7, 64, 120, 105, 10)); // Foo @x=5
  assert.equal(decoded.root.className, "Foo");
  assert.equal(decoded.root.ivars["@x"], 5);
});

test("Ruby Marshal decoder rejects invalid links and unsupported tags", () => {
  assert.throws(() => decodeMarshal(bytes(64, 0)), (error) => error instanceof ImportFailure && error.category === "MARSHAL_INVALID");
  assert.throws(() => decodeMarshal(bytes(122)), (error) => error instanceof ImportFailure && error.category === "MARSHAL_UNSUPPORTED");
});
