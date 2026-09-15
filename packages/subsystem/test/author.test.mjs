import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cancelled,
  completed,
  defineSubsystem,
  failed,
} from "../dist/index.js";
import { RenderManager } from "../dist/internal/render-manager.js";

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

test("RenderDomain author surface includes update without exposing publication types", () => {
  const manager = new RenderManager();
  const domain = manager.createDomain({ zIndex: 0, roots: [] });
  assert.equal(typeof domain.replace, "function");
  assert.equal(typeof domain.update, "function");
  assert.equal(typeof domain.emit, "function");
  assert.equal(typeof domain.close, "function");
  assert.equal("domainId" in domain, false);
});
