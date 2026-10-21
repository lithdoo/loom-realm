import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererPresentationEventBinding,
  decodePresentationEventPublishRequestV1,
  encodePresentationEventPublishRequestV1,
  serveRendererPresentationEventCarrier,
} from "../dist/index.js";

const publication = (overrides = {}) => ({
  sessionId: "session",
  ownerSubsystemKey: "owner",
  generation: 2,
  domainId: "domain",
  targetKey: "node",
  channel: "keyboard.state",
  type: "input.state",
  broadcast: true,
  payload: { domainId: "domain", targetKey: "node", data: { down: ["KeyW"] } },
  ...overrides,
});

test("Presentation Event carrier validates, correlates, and preserves FIFO", async () => {
  const pair = createMemoryCarrierPair();
  const seen = [];
  const server = serveRendererPresentationEventCarrier(pair.left, async (event) => {
    seen.push(event);
    return event.type !== "reject";
  });
  const binding = createRendererPresentationEventBinding(pair.right);
  await binding.publish(publication());
  await assert.rejects(binding.publish(publication({ type: "reject" })), /rejected/);
  await binding.publish(publication({ type: "after" }));
  assert.deepEqual(seen.map(({ type }) => type), ["input.state", "reject", "after"]);
  assert.deepEqual(seen[0].payload.data, { down: ["KeyW"] });
  await server.close();
});

test("Presentation Event wire keeps channel/type/payload/broadcast orthogonal and rejects spoofed envelopes", () => {
  const decoded = decodePresentationEventPublishRequestV1(
    encodePresentationEventPublishRequestV1(7, publication()),
  );
  assert.equal(decoded.requestId, 7);
  assert.deepEqual(
    [decoded.event.channel, decoded.event.type, decoded.event.broadcast],
    ["keyboard.state", "input.state", true],
  );
  assert.equal("channel" in decoded.event.payload.data, false);
  assert.throws(() => encodePresentationEventPublishRequestV1(1, publication({
    payload: { domainId: "spoofed", targetKey: "node", data: {} },
  })), TypeError);
  assert.throws(() => encodePresentationEventPublishRequestV1(1, publication({ channel: "bad\nchannel" })), TypeError);
});
