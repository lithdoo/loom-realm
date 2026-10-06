import test from "node:test";
import assert from "node:assert/strict";
import { GamePackageError, validateGameEntryV1 } from "../dist/index.js";

const entry = (state) => ({
  formatVersion: 1,
  ...(state === undefined ? {} : { state }),
  initial: { subsystem: "game", input: null },
  subsystems: [{ key: "game" }],
});

const fails = (code) => (error) => error instanceof GamePackageError && error.code === code;

test("optional State document validates, detaches, freezes, and preserves exact identity", () => {
  const value = { hp: 10 };
  const validated = validateGameEntryV1(entry({ records: [
    { namespace: "z", key: "é", value },
    { namespace: "a", key: "e\u0301", value: null },
  ] }));
  value.hp = 0;
  assert.equal(validated.state.records[0].value.hp, 10);
  assert(Object.isFrozen(validated.state.records));
  assert.deepEqual(validated.state.records.map(({ namespace, key }) => [namespace, key]), [["z", "é"], ["a", "e\u0301"]]);
  assert.equal("state" in validateGameEntryV1(entry()), false);
});

test("State schema stays closed and maps invalid, duplicate, and limit failures", () => {
  assert.throws(() => validateGameEntryV1(entry({ records: [], extra: true })), fails("GAME_ENTRY_INVALID"));
  assert.throws(() => validateGameEntryV1(entry({ records: [{ namespace: "a/b", key: "k", value: null }] })), fails("REALM_STATE_INITIAL_INVALID"));
  assert.throws(() => validateGameEntryV1(entry({ records: [
    { namespace: "n", key: "k", value: null },
    { namespace: "n", key: "k", value: 1 },
  ] })), fails("REALM_STATE_INITIAL_DUPLICATE"));
  assert.throws(() => validateGameEntryV1(entry({ records: [{ namespace: "n", key: "k", value: "x".repeat(256 * 1024) }] })), fails("REALM_STATE_INITIAL_LIMIT_EXCEEDED"));
});

test("platform, revision, transaction, and Save/Load fields are rejected from State schema", () => {
  for (const forbidden of ["formatVersion", "module", "worker", "revision", "version", "transactionId", "saveSlot", "loadSeed"]) {
    assert.throws(() => validateGameEntryV1(entry({ records: [], [forbidden]: true })), fails("GAME_ENTRY_INVALID"));
  }
});
