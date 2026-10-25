import test from "node:test";
import assert from "node:assert/strict";
import * as publicApi from "../dist/index.js";
import {
  prepareRendererHelloResultV2,
} from "../dist/index.js";
import {
  decodeRendererControlMessage,
  encodeRendererControlMessage,
  validateRendererAuthoritySnapshotV2,
} from "../dist/validation.js";

const valid = () => ({
  sessionId: "s",
  revision: 1,
  runtimes: [{ subsystemKey: "a", state: "ready" }],
  stack: [{ frameId: "f", subsystemKey: "a", lifecycle: "active", activationId: "x" }],
  dataAuthorities: [{ subsystemKey: "a", generation: 1, dataProfile: "loomrealm.renderer-data/3" }],
});

test("package root exposes only peer constructors and exact hello preflight at runtime", () => {
  assert.deepEqual(Object.keys(publicApi).sort(), [
    "connectRendererControlPeer",
    "createMainRendererControlPeer",
    "prepareRendererHelloResultV2",
  ]);
});

test("whole Snapshot validation returns detached frozen exact state", () => {
  const raw = valid();
  const checked = validateRendererAuthoritySnapshotV2(raw);
  assert.notEqual(checked, raw);
  assert.ok(Object.isFrozen(checked));
  assert.ok(Object.isFrozen(checked.stack));
  assert.match(prepareRendererHelloResultV2(checked), /"protocolVersion":2/);
});

test("closed schema and current relations fail closed", () => {
  assert.throws(() => validateRendererAuthoritySnapshotV2({ ...valid(), extra: true }));
  assert.throws(() => validateRendererAuthoritySnapshotV2({ ...valid(), inputTarget: { subsystemKey: "a", frameId: "f", activationId: "other" } }));
  assert.throws(() => validateRendererAuthoritySnapshotV2({ ...valid(), runtimes: [...valid().runtimes, ...valid().runtimes] }));
});

test("exact outbound preflight rejects actual messages beyond one MiB", () => {
  const raw = { ...valid(), stack: [], dataAuthorities: [] };
  raw.runtimes = Array.from({ length: 5000 }, (_, index) => ({
    subsystemKey: `${index}:${"x".repeat(240)}`,
    state: "ready",
  }));
  assert.throws(() => prepareRendererHelloResultV2(raw));
});

test("profile rejects JSON container depth 65", () => {
  let value = null;
  for (let depth = 0; depth < 65; depth += 1) value = [value];
  assert.throws(() => encodeRendererControlMessage(value), /depth exceeds limit/);
});

test("profile rejects a container with 16,385 members", () => {
  const value = Array.from({ length: 16_385 }, () => null);
  assert.throws(() => encodeRendererControlMessage(value), /member limit exceeded/);
  assert.throws(
    () => decodeRendererControlMessage(JSON.stringify(value)),
    /member limit exceeded/,
  );
});
