import test from "node:test";
import assert from "node:assert/strict";
import { runM11RenderVertical } from "./helpers/m11-render-vertical.mjs";

test("real M11 Main → Desktop → Hostra Render vertical converges and rebaselines", { timeout: 25_000 }, async () => {
  const trace = await runM11RenderVertical();
  assert.equal(trace.initial.domains[0].revision, 1);
  assert.equal(trace.initial.domains[0].roots[0].attrs.phase, "initial");
  assert.equal(trace.updated.domains[0].revision, 2);
  assert.equal(trace.updated.events[0].targetKey, "hero");
  assert.equal(trace.retired.currentCarrier, false);
  assert.equal(trace.retired.stalePresentationCache, true);
  assert.equal(trace.rebaselined.domains[0].revision, 1);
  assert.equal(trace.rebaselined.domains[0].roots[0].attrs.phase, "updated");
  assert.equal(trace.rebaselined.events.length, 0);
  assert.equal(trace.reconnected.domains[0].roots[0].attrs.phase, "reconnected");
  assert.equal(trace.activeDuringReconnect, true);
  assert.equal(trace.activeAfterReconnect, true);
  assert.equal(trace.removed.domains.length, 0);
  assert.equal(trace.rendererFailure, null);
  assert.equal(trace.mainFailure, null);
  assert.deepEqual(trace.mainOutcome, {
    kind: "root-outcome",
    outcome: { type: "completed", value: { rendered: true } },
  });
});
