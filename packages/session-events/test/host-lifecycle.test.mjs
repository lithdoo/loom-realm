import assert from "node:assert/strict";
import test from "node:test";
import { createHostLifecyclePublisher, createSessionEventHub } from "../dist/index.js";

test("host lifecycle publisher authenticates as host, preserves order, and deduplicates", async () => {
  const hub = createSessionEventHub();
  const binding = hub.createBinding("battle");
  const events = [];
  await binding.subscribe(["host.lifecycle"], (event) => events.push(event));
  const lifecycle = createHostLifecyclePublisher(hub);
  await Promise.all([lifecycle.publish("background"), lifecycle.publish("background"), lifecycle.publish("foreground")]);
  while (events.length < 2) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events.map(({ channel, type, payload, source }) => ({ channel, type, payload, source })), [
    { channel: "host.lifecycle", type: "background", payload: {}, source: { subsystemKey: "host" } },
    { channel: "host.lifecycle", type: "foreground", payload: {}, source: { subsystemKey: "host" } },
  ]);
  lifecycle.close();
  hub.terminate();
});
