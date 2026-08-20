import { test } from "node:test";
import assert from "node:assert/strict";
import { WireValidationError, assertExactKeys } from "../dist/index.js";

test("accepts exact required keys and any optional-key subset", () => {
  assert.doesNotThrow(() => assertExactKeys({ a: 1 }, ["a"], ["b"]));
  assert.doesNotThrow(() => assertExactKeys({ a: 1, b: 2 }, ["a"], ["b"]));
});

test("reports missing and unknown members at stable paths", () => {
  assert.throws(
    () => assertExactKeys({}, ["required"]),
    (error) => {
      assert.ok(error instanceof WireValidationError);
      assert.deepEqual(error.path, ["required"]);
      return true;
    },
  );
  assert.throws(
    () => assertExactKeys({ required: 1, extra: 2 }, ["required"]),
    (error) => {
      assert.ok(error instanceof WireValidationError);
      assert.deepEqual(error.path, ["extra"]);
      return true;
    },
  );
});

test("an inherited property never satisfies a required own member", () => {
  assert.throws(
    () => assertExactKeys({}, ["toString"]),
    (error) => error instanceof WireValidationError && error.path[0] === "toString",
  );
});

test("error paths are immutable snapshots and messages are not asserted", () => {
  const suppliedPath = ["root"];
  const error = new WireValidationError("wording is not contractual", suppliedPath);
  suppliedPath.push("changed");
  assert.deepEqual(error.path, ["root"]);
  assert.throws(() => error.path.push("forbidden"), TypeError);
});
