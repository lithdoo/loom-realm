import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V1,
} from "../dist/index.js";

const accepted = () => ({ kind: "accepted" });
const binding = (carrier) => ({
  carrier,
  subsystemKey: "map",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V1,
});
const subsystemHandlers = {
  onInputState: accepted,
  onInputEvent: accepted,
  onInputReset: accepted,
};
const rendererHandlers = {
  onInputInterest: accepted,
  onRenderDomains: accepted,
  onRenderSnapshot: accepted,
  onRenderPatch: accepted,
  onRenderEvent: accepted,
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("terminal first-wins and is not overwritten by a later carrier loss", async () => {
  const pair = createMemoryCarrierPair();
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: subsystemHandlers,
  });
  await pair.right.send("{");
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "profile");
  pair.lose(new Error("lost"));
  assert.equal(await subsystem.terminal, terminal);
});

test("fresh peer starts with no inherited writer or reader state", async () => {
  const first = createMemoryCarrierPair();
  const oldPeer = createSubsystemDataPeer({
    binding: binding(first.left),
    handlers: subsystemHandlers,
  });
  assert.deepEqual(
    await oldPeer.render.sendDomains({ type: "render.domains", domains: ["hud"] }),
    { kind: "sent" },
  );
  await oldPeer.close();
  assert.equal((await oldPeer.terminal).kind, "carrier-closed");

  const second = createMemoryCarrierPair();
  const seen = [];
  const freshSubsystem = createSubsystemDataPeer({
    binding: binding(second.left),
    handlers: subsystemHandlers,
  });
  const freshRenderer = createRendererDataPeer({
    binding: binding(second.right),
    handlers: {
      ...rendererHandlers,
      onRenderDomains(message) {
        seen.push(message.domains);
        return accepted();
      },
    },
  });
  assert.deepEqual(
    await freshSubsystem.render.sendDomains({ type: "render.domains", domains: ["fresh"] }),
    { kind: "sent" },
  );
  await tick();
  assert.deepEqual(seen, [["fresh"]]);
  await freshSubsystem.close();
  await freshRenderer.terminal;
});
