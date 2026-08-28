import { test } from "node:test";
import assert from "node:assert/strict";
import * as author from "../dist/index.js";
import * as host from "../dist/host/index.js";

test("author root and trusted host surface stay separated", () => {
  assert.deepEqual(Object.keys(author).sort(), [
    "FrameBusyError",
    "FrameCallRejectedError",
    "FrameClosedError",
    "FrameInactiveError",
    "cancelled",
    "completed",
    "defineSubsystem",
    "failed",
  ]);
  assert.deepEqual(Object.keys(host).sort(), [
    "SubsystemRuntimeFatalError",
    "runSubsystem",
  ]);

  assert.equal("runSubsystem" in author, false);
  assert.equal("connectSubsystemRuntimeControl" in author, false);
  assert.equal("RuntimeControlBinding" in author, false);
});
