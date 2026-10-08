import assert from "node:assert/strict";
import test from "node:test";
import { parseGameEntryV1 } from "@loomrealm/game-package";
import { serializePwaPublicManifestV1 } from "../dist/types/content-manifest.js";

test("public Content manifest bytes normalize whitespace and recursively sort object keys", () => {
  const first = parseGameEntryV1(`{
    "subsystems": [{ "key": "demo" }],
    "initial": { "input": { "z": 1, "nested": { "b": 2, "a": 1 } }, "subsystem": "demo" },
    "formatVersion": 1,
    "state": { "records": [{ "value": { "z": 2, "a": 1 }, "key": "k", "namespace": "n" }] }
  }`);
  const second = parseGameEntryV1('{"formatVersion":1,"state":{"records":[{"namespace":"n","key":"k","value":{"a":1,"z":2}}]},"initial":{"subsystem":"demo","input":{"nested":{"a":1,"b":2},"z":1}},"subsystems":[{"key":"demo"}]}');
  const left = serializePwaPublicManifestV1(first);
  const right = serializePwaPublicManifestV1(second);
  assert.equal(left, right);
  assert.equal(left, '{"formatVersion":1,"initial":{"input":{"nested":{"a":1,"b":2},"z":1},"subsystem":"demo"},"state":{"records":[{"key":"k","namespace":"n","value":{"a":1,"z":2}}]},"subsystems":[{"key":"demo"}]}');
});
