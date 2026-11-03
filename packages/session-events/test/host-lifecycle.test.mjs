import assert from "node:assert/strict";
import test from "node:test";
import { createHostLifecyclePublisher, createSessionEventHub, subscribeHostLifecycle } from "../dist/index.js";

test("host lifecycle publisher authenticates as host, preserves order, and deduplicates", async () => {
  const hub = createSessionEventHub();
  const binding = hub.createBinding("battle");
  const events = [];
  const lifecycle = createHostLifecyclePublisher(hub, { sessionEpoch: "session-1", initialState: "background" });
  const subscription = await subscribeHostLifecycle(binding, (event) => events.push(event));
  await Promise.all([lifecycle.publish("background"), lifecycle.publish("background"), lifecycle.publish("foreground")]);
  while (events.length < 2) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, [
    { sessionEpoch: "session-1", sequence: 0, state: "background" },
    { sessionEpoch: "session-1", sequence: 1, state: "foreground" },
  ]);
  assert.deepEqual(subscription.initial, events[0]);
  subscription.close();
  lifecycle.close();
  hub.terminate();
});
