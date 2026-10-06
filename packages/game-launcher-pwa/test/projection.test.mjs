import test from "node:test";
import assert from "node:assert/strict";
import { validateGameEntryV1 } from "@loomrealm/game-package";
import { projectPwaPreparedRealmState } from "../dist/index.js";

test("PWA PREPARE projects the same detached platform-neutral State definition", () => {
  const source = { value: 1 };
  const game = validateGameEntryV1({
    formatVersion: 1,
    state: { records: [{ namespace: "n", key: "k", value: source }] },
    initial: { subsystem: "root", input: null },
    subsystems: [{ key: "root" }],
  });
  const prepared = projectPwaPreparedRealmState(game);
  source.value = 2;
  assert.deepEqual(prepared, { records: [{ key: { namespace: "n", key: "k" }, value: { value: 1 } }] });
  assert(Object.isFrozen(prepared.records[0].value));
  for (const forbidden of ["formatVersion", "revision", "version", "transactionId", "loadSeed", "module", "worker"]) {
    assert.equal(forbidden in prepared, false);
  }
  const empty = projectPwaPreparedRealmState(validateGameEntryV1({
    formatVersion: 1,
    initial: { subsystem: "root", input: null },
    subsystems: [{ key: "root" }],
  }));
  assert.deepEqual(empty, { records: [] });
});
