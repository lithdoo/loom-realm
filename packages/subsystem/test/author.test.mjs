import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cancelled,
  completed,
  defineSubsystem,
  failed,
} from "../dist/index.js";

test("author helpers keep the M4 surface explicit and validated", () => {
  const factory = () => ({ frame: () => cancelled() });
  assert.equal(defineSubsystem(factory), factory);

  assert.deepEqual(completed({ value: 1 }), {
    type: "completed",
    value: { value: 1 },
  });
  assert.deepEqual(cancelled(), { type: "cancelled" });
  assert.deepEqual(
    failed({ code: "BUSINESS_FAILED", message: "safe", data: { x: true } }),
    {
      type: "failed",
      error: { code: "BUSINESS_FAILED", message: "safe", data: { x: true } },
    },
  );

  assert.throws(() => completed(undefined), /JSON/i);
  assert.throws(() => failed({ code: "bad code" }), /failure code/i);
  assert.throws(
    () => failed({ code: "OK", extra: true }),
    /unknown fields/i,
  );
});
