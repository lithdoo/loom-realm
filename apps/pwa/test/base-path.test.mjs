import assert from "node:assert/strict";
import test from "node:test";
import { moduleDirectoryPath, pwaPath } from "../dist/types/base-path.js";

test("root bundles keep site-root URLs and a subpath bundle stays inside its directory", () => {
  assert.equal(moduleDirectoryPath("https://game.test/window.js"), "");
  assert.equal(pwaPath("/service-worker.js", "https://game.test/window.js"), "/service-worker.js");
  assert.equal(pwaPath("/", "https://game.test/window.js"), "/");
  assert.equal(pwaPath("/_lr/internal/runtime-info", "https://game.test/worker-runner.js"), "/_lr/internal/runtime-info");
  assert.equal(moduleDirectoryPath("https://game.test/pwa/pokeman/window.js"), "/pwa/pokeman");
  assert.equal(pwaPath("/service-worker.js", "https://game.test/pwa/pokeman/service-worker.js"), "/pwa/pokeman/service-worker.js");
  assert.equal(pwaPath("/", "https://game.test/pwa/pokeman/window.js"), "/pwa/pokeman/");
  assert.equal(
    pwaPath("/_lr/v1/games/abc/records/struct.Map/3", "https://game.test/pwa/pokeman/window.js"),
    "/pwa/pokeman/_lr/v1/games/abc/records/struct.Map/3",
  );
  assert.equal(moduleDirectoryPath("file:///C:/loom/window.js"), "");
});
