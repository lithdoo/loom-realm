import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareRendererHelloResultV1,
  validateRendererAuthoritySnapshotV1,
} from "../dist/index.js";

const valid = () => ({
  sessionId: "s",
  revision: 1,
  runtimes: [{ subsystemKey: "a", state: "ready" }],
  stack: [{ frameId: "f", subsystemKey: "a", lifecycle: "active", activationId: "x" }],
  inputTarget: { subsystemKey: "a", frameId: "f", activationId: "x" },
  dataAuthorities: [{ subsystemKey: "a", generation: 1, dataProfile: "loomrealm.renderer-data/1" }],
});

test("whole Snapshot validation returns detached frozen exact state", () => {
  const raw = valid();
  const checked = validateRendererAuthoritySnapshotV1(raw);
  assert.notEqual(checked, raw);
  assert.ok(Object.isFrozen(checked));
  assert.ok(Object.isFrozen(checked.stack));
  assert.match(prepareRendererHelloResultV1(checked), /"protocolVersion":1/);
});

test("closed schema and current relations fail closed", () => {
  assert.throws(() => validateRendererAuthoritySnapshotV1({ ...valid(), extra: true }));
  assert.throws(() => validateRendererAuthoritySnapshotV1({ ...valid(), inputTarget: { subsystemKey: "a", frameId: "f", activationId: "other" } }));
  assert.throws(() => validateRendererAuthoritySnapshotV1({ ...valid(), runtimes: [...valid().runtimes, ...valid().runtimes] }));
});

test("exact outbound preflight rejects actual messages beyond one MiB", () => {
  const raw = { ...valid(), stack: [], inputTarget: null, dataAuthorities: [] };
  raw.runtimes = Array.from({ length: 5000 }, (_, index) => ({
    subsystemKey: `${index}:${"x".repeat(240)}`,
    state: "ready",
  }));
  assert.throws(() => prepareRendererHelloResultV1(raw));
});
