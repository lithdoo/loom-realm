import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GamePackageError,
  validateGameEntryV1,
} from "../dist/index.js";

const valid = () => ({
  formatVersion: 1,
  initial: { subsystem: "loom.map", input: null },
  subsystems: [{ key: "loom.map" }],
});

function expectError(code, path) {
  return (error) => {
    assert.ok(error instanceof GamePackageError);
    assert.equal(error.code, code);
    assert.deepEqual(error.path, path);
    return true;
  };
}

test("requires closed top-level, initial, and descriptor schemas", () => {
  for (const [mutate, path] of [
    [(entry) => delete entry.formatVersion, ["formatVersion"]],
    [(entry) => { entry.module = "./main.mjs"; }, ["module"]],
    [(entry) => delete entry.initial.input, ["initial", "input"]],
    [(entry) => { entry.initial.env = {}; }, ["initial", "env"]],
    [(entry) => delete entry.subsystems[0].key, ["subsystems", 0, "key"]],
    [(entry) => { entry.subsystems[0].launcher = {}; }, ["subsystems", 0, "launcher"]],
  ]) {
    const entry = valid();
    mutate(entry);
    assert.throws(() => validateGameEntryV1(entry), expectError("GAME_ENTRY_INVALID", path));
  }
});

test("reports required members before unknown members in normative order", () => {
  assert.throws(
    () => validateGameEntryV1({ extra: true }),
    expectError("GAME_ENTRY_INVALID", ["formatVersion"]),
  );
  assert.throws(
    () => validateGameEntryV1({ formatVersion: 1, extra: true }),
    expectError("GAME_ENTRY_INVALID", ["initial"]),
  );
});

test("platform-looking names remain ordinary data inside initial.input", () => {
  const entry = valid();
  entry.initial.input = JSON.parse(
    '{"module":1,"env":2,"platform":3,"launcher":4,"__proto__":5,"constructor":6}',
  );
  const result = validateGameEntryV1(entry);
  assert.deepEqual(Object.keys(result.initial.input), [
    "module", "env", "platform", "launcher", "__proto__", "constructor",
  ]);
  assert.equal(result.initial.input.__proto__, 5);
});

test("missing own schema members never read inherited getters", () => {
  const names = ["formatVersion", "initial", "subsystems", "subsystem", "input", "key"];
  let reads = 0;
  try {
    for (const name of names) {
      Object.defineProperty(Object.prototype, name, {
        configurable: true,
        get() {
          reads += 1;
          return "inherited";
        },
      });
    }
    assert.throws(
      () => validateGameEntryV1({}),
      expectError("GAME_ENTRY_INVALID", ["formatVersion"]),
    );
    assert.equal(reads, 0);
  } finally {
    for (const name of names) delete Object.prototype[name];
  }
});

test("maps representation failures before schema failures", () => {
  const entry = valid();
  entry.initial.input = { nested: undefined };
  entry.extra = true;
  assert.throws(
    () => validateGameEntryV1(entry),
    expectError("INITIAL_INPUT_INVALID", ["initial", "input", "nested"]),
  );

  const keyFailure = valid();
  keyFailure.subsystems[0].key = { nested: undefined };
  assert.throws(
    () => validateGameEntryV1(keyFailure),
    expectError("SUBSYSTEM_KEY_INVALID", ["subsystems", 0, "key", "nested"]),
  );
});

test("rejects invalid container kinds at their structural paths", () => {
  assert.throws(
    () => validateGameEntryV1(null),
    expectError("GAME_ENTRY_INVALID", []),
  );

  const invalidInitial = valid();
  invalidInitial.initial = [];
  assert.throws(
    () => validateGameEntryV1(invalidInitial),
    expectError("GAME_ENTRY_INVALID", ["initial"]),
  );

  const invalidTarget = valid();
  invalidTarget.initial.subsystem = 1;
  assert.throws(
    () => validateGameEntryV1(invalidTarget),
    expectError("GAME_ENTRY_INVALID", ["initial", "subsystem"]),
  );

  const invalidList = valid();
  invalidList.subsystems = {};
  assert.throws(
    () => validateGameEntryV1(invalidList),
    expectError("GAME_ENTRY_INVALID", ["subsystems"]),
  );

  const invalidDescriptor = valid();
  invalidDescriptor.subsystems = [null];
  assert.throws(
    () => validateGameEntryV1(invalidDescriptor),
    expectError("GAME_ENTRY_INVALID", ["subsystems", 0]),
  );
});

test("rejects accessor, sparse, exotic, and cyclic input without invoking accessors", () => {
  let reads = 0;
  const accessor = {};
  Object.defineProperty(accessor, "danger", {
    enumerable: true,
    get() {
      reads += 1;
      return 1;
    },
  });
  assert.throws(
    () => validateGameEntryV1({ ...valid(), initial: { subsystem: "loom.map", input: accessor } }),
    expectError("INITIAL_INPUT_INVALID", ["initial", "input", "danger"]),
  );
  assert.equal(reads, 0);

  const sparse = [];
  sparse.length = 1;
  assert.throws(
    () => validateGameEntryV1({ ...valid(), initial: { subsystem: "loom.map", input: sparse } }),
    expectError("INITIAL_INPUT_INVALID", ["initial", "input", 0]),
  );

  class Exotic {
    value = 1;
  }
  assert.throws(
    () => validateGameEntryV1({ ...valid(), initial: { subsystem: "loom.map", input: new Exotic() } }),
    expectError("INITIAL_INPUT_INVALID", ["initial", "input"]),
  );

  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(
    () => validateGameEntryV1({ ...valid(), initial: { subsystem: "loom.map", input: cyclic } }),
    expectError("INITIAL_INPUT_INVALID", ["initial", "input", "self"]),
  );
});
