import assert from "node:assert/strict";
import test from "node:test";
import {
  SessionEventError,
  isSessionEventFailure,
  validateChannels,
  validatePublish,
} from "../dist/index.js";

test("channel, type, set, JsonValue, size, and depth boundaries", () => {
  assert.equal(validatePublish("a".repeat(256), "t".repeat(128), null).channel.length, 256);
  assert.equal(validatePublish("é".repeat(128), "é".repeat(64), null).channel.length, 128);
  assert.throws(() => validatePublish("é".repeat(129), "t", null), { code: "LIMIT_EXCEEDED" });
  assert.throws(() => validatePublish("a", "é".repeat(65), null), { code: "LIMIT_EXCEEDED" });
  assert.throws(() => validatePublish("a".repeat(257), "t", null), { code: "LIMIT_EXCEEDED" });
  assert.throws(() => validatePublish("a", "t".repeat(129), null), { code: "LIMIT_EXCEEDED" });
  assert.throws(() => validatePublish("", "t", null), { code: "INVALID_REQUEST" });
  assert.throws(() => validatePublish("a\u0000", "t", null), { code: "INVALID_REQUEST" });
  assert.throws(() => validatePublish("\ud800", "t", null), { code: "INVALID_REQUEST" });
  assert.equal(validatePublish("battle/main", "enemy/defeated", null).channel, "battle/main");
  for (const channel of ["/battle", "battle/", "battle//main"]) {
    assert.equal(validatePublish(channel, "t", null).channel, channel);
  }
  assert.throws(() => validateChannels([]), { code: "INVALID_REQUEST" });
  assert.throws(() => validateChannels(["a", "a"]), { code: "INVALID_REQUEST" });
  assert.equal(validateChannels(Array.from({ length: 64 }, (_, index) => `c${index}`)).length, 64);
  assert.throws(
    () => validateChannels(Array.from({ length: 65 }, (_, index) => `c${index}`)),
    { code: "LIMIT_EXCEEDED" },
  );

  let atLimit = null;
  for (let index = 0; index < 64; index += 1) atLimit = [atLimit];
  validatePublish("a", "t", atLimit);
  assert.throws(() => validatePublish("a", "t", [atLimit]), { code: "LIMIT_EXCEEDED" });
  validatePublish("a", "t", "x".repeat(256 * 1024 - 2));
  assert.throws(
    () => validatePublish("a", "t", "x".repeat(256 * 1024 - 1)),
    { code: "LIMIT_EXCEEDED" },
  );
  for (const invalid of [undefined, NaN, Infinity, 1n, Symbol("x"), () => {}, new Date()]) {
    assert.throws(() => validatePublish("a", "t", invalid), { code: "INVALID_REQUEST" });
  }
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => validatePublish("a", "t", cyclic), { code: "INVALID_REQUEST" });
});

test("failure guard is structural and Error surface is stable", () => {
  const error = new SessionEventError("INVALID_REQUEST", "bad", ["payload", 0]);
  assert.equal(isSessionEventFailure(error), true);
  assert.equal(isSessionEventFailure({ code: "OUTCOME_UNKNOWN", message: "lost" }), true);
  assert.equal(isSessionEventFailure({ code: "PRIVATE", message: "lost" }), false);
  assert.equal(error.name, "SessionEventError");
  assert.deepEqual(error.path, ["payload", 0]);
});
