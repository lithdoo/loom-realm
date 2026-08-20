import { test } from "node:test";
import assert from "node:assert/strict";
import { WireValidationError, decodeJsonRpcMessage } from "../dist/index.js";

test("decodes requests with string, safe numeric, and generic null ids", () => {
  for (const id of ["request", 1, Number.MAX_SAFE_INTEGER, null]) {
    const value = { jsonrpc: "2.0", method: "opaque.method", id, params: { value: 1 } };
    assert.strictEqual(decodeJsonRpcMessage(value), value);
  }
});

test("notification is defined by id absence, not an id:null value", () => {
  const notification = { jsonrpc: "2.0", method: "event", params: [] };
  assert.strictEqual(decodeJsonRpcMessage(notification), notification);

  const nullId = { jsonrpc: "2.0", method: "event", id: null };
  assert.strictEqual(decodeJsonRpcMessage(nullId), nullId);
  assert.equal("id" in decodeJsonRpcMessage(notification), false);
});

test("accepts object/array params and rejects primitive params", () => {
  assert.doesNotThrow(() =>
    decodeJsonRpcMessage({ jsonrpc: "2.0", method: "x", id: 1, params: {} }),
  );
  assert.doesNotThrow(() =>
    decodeJsonRpcMessage({ jsonrpc: "2.0", method: "x", id: 1, params: [] }),
  );
  assert.throws(
    () => decodeJsonRpcMessage({ jsonrpc: "2.0", method: "x", id: 1, params: null }),
    (error) => error instanceof WireValidationError && error.path[0] === "params",
  );
});

test("decodes success and exact error responses", () => {
  const success = { jsonrpc: "2.0", id: "a", result: null };
  const failure = {
    jsonrpc: "2.0",
    id: 2,
    error: { code: -32_000, message: "domain opaque", data: { detail: true } },
  };
  assert.strictEqual(decodeJsonRpcMessage(success), success);
  assert.strictEqual(decodeJsonRpcMessage(failure), failure);
});

test("requires result and response id and enforces result/error exclusion", () => {
  for (const value of [
    { jsonrpc: "2.0", id: 1 },
    { jsonrpc: "2.0", result: null },
    { jsonrpc: "2.0", id: 1, result: null, error: { code: 1, message: "x" } },
  ]) {
    assert.throws(() => decodeJsonRpcMessage(value), WireValidationError);
  }
});

test("enforces exact version and closed envelope/error shapes", () => {
  for (const value of [
    { jsonrpc: "1.0", method: "x", id: 1 },
    { jsonrpc: "2.0", method: "x", id: 1, extra: true },
    { jsonrpc: "2.0", id: 1, result: null, params: {} },
    { jsonrpc: "2.0", id: 1, error: { code: 1, message: "x", extra: true } },
  ]) {
    assert.throws(() => decodeJsonRpcMessage(value), WireValidationError);
  }
});

test("numeric ids and error codes must be safe integers", () => {
  for (const id of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => decodeJsonRpcMessage({ jsonrpc: "2.0", method: "x", id }),
      (error) => error instanceof WireValidationError && error.path[0] === "id",
    );
  }
  assert.throws(
    () => decodeJsonRpcMessage({ jsonrpc: "2.0", id: 1, error: { code: 1.5, message: "x" } }),
    (error) => {
      assert.ok(error instanceof WireValidationError);
      assert.deepEqual(error.path, ["error", "code"]);
      return true;
    },
  );
});

test("accepts opaque method strings without LoomRealm interpretation", () => {
  for (const method of ["", "frame.initialize", "rpc.reserved-looking", "😀"] ) {
    assert.doesNotThrow(() => decodeJsonRpcMessage({ jsonrpc: "2.0", method, id: 1 }));
  }
});

test("single-message decoder rejects JSON-RPC Batch arrays", () => {
  assert.throws(
    () => decodeJsonRpcMessage([{ jsonrpc: "2.0", method: "x", id: 1 }]),
    WireValidationError,
  );
});
