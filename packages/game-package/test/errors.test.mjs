import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GamePackageError,
  validateGameEntryV1,
} from "../dist/index.js";

test("GamePackageError copies and freezes its structural path", () => {
  const sourcePath = ["initial", "input"];
  const cause = new Error("diagnostic only");
  const error = new GamePackageError("INITIAL_INPUT_INVALID", sourcePath, { cause });

  sourcePath.push("changed");
  assert.equal(error.name, "GamePackageError");
  assert.equal(error.code, "INITIAL_INPUT_INVALID");
  assert.deepEqual(error.path, ["initial", "input"]);
  assert.equal(Object.isFrozen(error.path), true);
  assert.equal(error.cause, cause);
  assert.throws(() => error.path.push("changed"), TypeError);
});

test("expected invalid inputs never leak Wire errors", () => {
  for (const value of [undefined, Symbol("x"), { invalid: () => {} }, { self: null }]) {
    if (value && typeof value === "object" && "self" in value) value.self = value;
    assert.throws(
      () => validateGameEntryV1(value),
      (error) => {
        assert.ok(error instanceof GamePackageError);
        return true;
      },
    );
  }
});
