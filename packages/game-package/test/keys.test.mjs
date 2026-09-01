import { test } from "node:test";
import assert from "node:assert/strict";
import { GamePackageError, validateGameEntryV1 } from "../dist/index.js";

function entry(keys, initial = keys[0] ?? "missing") {
  return {
    formatVersion: 1,
    initial: { subsystem: initial, input: null },
    subsystems: keys.map((key) => ({ key })),
  };
}

function expectError(code, path) {
  return (error) => {
    assert.ok(error instanceof GamePackageError);
    assert.equal(error.code, code);
    assert.deepEqual(error.path, path);
    return true;
  };
}

test("accepts exact non-empty keys without normalization and preserves order", () => {
  const keys = [" loom.map", "loom.map", "LOOM.MAP", "é", "e\u0301", "   "];
  const result = validateGameEntryV1(entry(keys, "   "));
  assert.deepEqual(result.subsystems.map(({ key }) => key), keys);
});

test("accepts the 256-byte key boundary", () => {
  const keys = ["x".repeat(256), "é".repeat(128), "😀".repeat(64)];
  const result = validateGameEntryV1(entry(keys));
  assert.deepEqual(result.subsystems.map(({ key }) => key), keys);
});

test("rejects empty, non-string, oversized, and ill-formed Unicode keys", () => {
  assert.throws(
    () => validateGameEntryV1(entry([""])),
    expectError("SUBSYSTEM_KEY_INVALID", ["subsystems", 0, "key"]),
  );
  assert.throws(
    () => validateGameEntryV1(entry([1], "missing")),
    expectError("SUBSYSTEM_KEY_INVALID", ["subsystems", 0, "key"]),
  );
  assert.throws(
    () => validateGameEntryV1(entry(["x".repeat(257)])),
    expectError("SUBSYSTEM_KEY_INVALID", ["subsystems", 0, "key"]),
  );
  assert.throws(
    () => validateGameEntryV1(entry(["é".repeat(129)])),
    expectError("SUBSYSTEM_KEY_INVALID", ["subsystems", 0, "key"]),
  );
  assert.throws(
    () => validateGameEntryV1(entry(["😀".repeat(65)])),
    expectError("SUBSYSTEM_KEY_INVALID", ["subsystems", 0, "key"]),
  );
  assert.throws(
    () => validateGameEntryV1(entry(["\ud800"])),
    expectError("SUBSYSTEM_KEY_INVALID", ["subsystems", 0, "key"]),
  );
  assert.throws(
    () => validateGameEntryV1(entry(["\udc00"])),
    expectError("SUBSYSTEM_KEY_INVALID", ["subsystems", 0, "key"]),
  );
  assert.throws(
    () => validateGameEntryV1(entry(["\ud800x"])),
    expectError("SUBSYSTEM_KEY_INVALID", ["subsystems", 0, "key"]),
  );
});

test("reports the later duplicate only after descriptor validation", () => {
  assert.throws(
    () => validateGameEntryV1(entry(["a", "b", "a"], "a")),
    expectError("SUBSYSTEM_KEY_DUPLICATE", ["subsystems", 2, "key"]),
  );

  const value = entry(["a", "a", "b"], "a");
  value.subsystems[2].extra = true;
  assert.throws(
    () => validateGameEntryV1(value),
    expectError("GAME_ENTRY_INVALID", ["subsystems", 2, "extra"]),
  );
});

test("requires the initial target to be declared", () => {
  assert.throws(
    () => validateGameEntryV1(entry(["a"], "A")),
    expectError("INITIAL_TARGET_UNDECLARED", ["initial", "subsystem"]),
  );
});

test("classifies format versions exactly", () => {
  const stringVersion = entry(["a"]);
  stringVersion.formatVersion = "1";
  assert.throws(
    () => validateGameEntryV1(stringVersion),
    expectError("GAME_ENTRY_INVALID", ["formatVersion"]),
  );

  const otherVersion = entry(["a"]);
  otherVersion.formatVersion = 2;
  assert.throws(
    () => validateGameEntryV1(otherVersion),
    expectError("GAME_ENTRY_VERSION_UNSUPPORTED", ["formatVersion"]),
  );

  const nonFiniteVersion = entry(["a"]);
  nonFiniteVersion.formatVersion = Infinity;
  assert.throws(
    () => validateGameEntryV1(nonFiniteVersion),
    expectError("GAME_ENTRY_INVALID", ["formatVersion"]),
  );
});
