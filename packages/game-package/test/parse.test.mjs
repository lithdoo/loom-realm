import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GamePackageError,
  parseGameEntryV1,
} from "../dist/index.js";

function expectError(code, path) {
  return (error) => {
    assert.ok(error instanceof GamePackageError);
    assert.equal(error.code, code);
    assert.deepEqual(error.path, path);
    return true;
  };
}

test("parses a valid minimal Game Entry", () => {
  const entry = parseGameEntryV1(
    '{"formatVersion":1,"initial":{"subsystem":"loom.map","input":null},"subsystems":[{"key":"loom.map"}]}',
  );
  assert.deepEqual(entry, {
    formatVersion: 1,
    initial: { subsystem: "loom.map", input: null },
    subsystems: [{ key: "loom.map" }],
  });
});

test("maps malformed JSON and runtime non-string input", () => {
  assert.throws(
    () => parseGameEntryV1("{"),
    expectError("GAME_ENTRY_INVALID", []),
  );
  assert.throws(
    () => parseGameEntryV1(1),
    expectError("GAME_ENTRY_INVALID", []),
  );
});

test("follows JSON.parse duplicate-member semantics", () => {
  const entry = parseGameEntryV1(
    '{"formatVersion":2,"formatVersion":1,"initial":{"subsystem":"x","input":null},"subsystems":[{"key":"x"}]}',
  );
  assert.equal(entry.formatVersion, 1);
});
