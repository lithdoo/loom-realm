import { WireValidationError, type WirePathSegment } from "./errors.js";
import { assertExactKeysAt } from "./exact-keys.js";
import type { JsonArray, JsonObject, JsonValue } from "./json-value.js";
import { assertJsonObject, assertJsonObjectAt } from "./validation.js";

export type JsonRpcId = string | number | null;
export type JsonRpcParams = JsonObject | JsonArray;

export interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: JsonRpcParams;
  readonly id: JsonRpcId;
}

export interface JsonRpcNotification {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: JsonRpcParams;
}

export interface JsonRpcSuccessResponse {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly result: JsonValue;
}

export interface JsonRpcErrorObject {
  readonly code: number;
  readonly message: string;
  readonly data?: JsonValue;
}

export interface JsonRpcErrorResponse {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly error: JsonRpcErrorObject;
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccessResponse
  | JsonRpcErrorResponse;

function fail(message: string, path: readonly WirePathSegment[]): never {
  throw new WireValidationError(message, path);
}

function hasOwn(object: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function assertVersion(object: JsonObject): void {
  if (object.jsonrpc !== "2.0") fail("Expected JSON-RPC version 2.0", ["jsonrpc"]);
}

function assertMethod(object: JsonObject): void {
  if (typeof object.method !== "string") fail("Expected method string", ["method"]);
}

function assertParams(object: JsonObject): void {
  if (!hasOwn(object, "params")) return;
  const params = object.params;
  if (params === null || typeof params !== "object") {
    fail("Expected object or array params", ["params"]);
  }
}

function assertId(value: JsonValue, path: readonly WirePathSegment[]): void {
  if (value === null || typeof value === "string") return;
  if (typeof value === "number" && Number.isSafeInteger(value)) return;
  fail("Expected a string, safe integer, or null JSON-RPC id", path);
}

export function decodeJsonRpcMessage(value: JsonValue): JsonRpcMessage {
  assertJsonObject(value);
  const object = value;
  assertVersion(object);

  if (hasOwn(object, "method")) {
    if (hasOwn(object, "id")) {
      assertExactKeysAt(object, ["jsonrpc", "method", "id"], ["params"]);
      assertMethod(object);
      assertParams(object);
      assertId(object.id as JsonValue, ["id"]);
      return object as unknown as JsonRpcRequest;
    }

    assertExactKeysAt(object, ["jsonrpc", "method"], ["params"]);
    assertMethod(object);
    assertParams(object);
    return object as unknown as JsonRpcNotification;
  }

  if (!hasOwn(object, "id")) fail("Missing response id", ["id"]);
  assertId(object.id as JsonValue, ["id"]);
  const hasResult = hasOwn(object, "result");
  const hasError = hasOwn(object, "error");

  if (hasResult && !hasError) {
    assertExactKeysAt(object, ["jsonrpc", "id", "result"]);
    return object as unknown as JsonRpcSuccessResponse;
  }

  if (hasError && !hasResult) {
    assertExactKeysAt(object, ["jsonrpc", "id", "error"]);
    const error = object.error;
    assertJsonObjectAt(error, ["error"]);
    assertExactKeysAt(error, ["code", "message"], ["data"], ["error"]);
    if (!Number.isSafeInteger(error.code)) {
      fail("Expected a safe integer error code", ["error", "code"]);
    }
    if (typeof error.message !== "string") {
      fail("Expected an error message string", ["error", "message"]);
    }
    return object as unknown as JsonRpcErrorResponse;
  }

  fail("Response must contain exactly one of result or error", []);
}
