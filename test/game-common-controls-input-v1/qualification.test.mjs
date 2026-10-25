import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V3,
} from "@loomrealm/data";
import { prepareRendererHelloResultV2 } from "@loomrealm/renderer-control";
import { DEVICE_INPUT_CHANNELS } from "@loomrealm-game/common-controls";

const root = new URL("../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("the game-lib owns exactly six isolated device channels", () => {
  assert.deepEqual([...DEVICE_INPUT_CHANNELS], [
    "keyboard.state", "keyboard.event",
    "pointer.state", "pointer.event",
    "gamepad.state", "gamepad.event",
  ]);
  assert.equal(new Set(DEVICE_INPUT_CHANNELS).size, 6);
});

test("Renderer Data v3 contains active families but rejects retired input messages", async () => {
  assert.equal(RENDERER_DATA_PROFILE_V3, "loomrealm.renderer-data/3");
  const pair = createMemoryCarrierPair();
  const peer = createSubsystemDataPeer({
    binding: { carrier: pair.left, subsystemKey: "game", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V3 },
    handlers: { onViewportState: () => ({ kind: "accepted" }) },
  });
  await pair.right.send(JSON.stringify({ type: "input.state", frameId: "f", activationId: "a", channel: "keyboard.state", payload: { down: [] } }));
  const terminal = await peer.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "profile");
});

test("Renderer Control v2 is closed and has no inputTarget", () => {
  const snapshot = { sessionId: "s", revision: 1, runtimes: [], stack: [], dataAuthorities: [] };
  const message = JSON.parse(prepareRendererHelloResultV2(snapshot));
  assert.equal(message.result.protocolVersion, 2);
  assert.equal("inputTarget" in message.result.snapshot, false);
  assert.throws(() => prepareRendererHelloResultV2({ ...snapshot, inputTarget: null }), TypeError);
});

test("Framework production sources expose no legacy User Input runtime", async () => {
  const [data, subsystem, renderer, main, desktop, pwa] = await Promise.all([
    source("packages/data/src/index.ts"),
    source("packages/subsystem/src/index.ts"),
    source("packages/renderer/src/index.ts"),
    source("packages/main/src/internal/main-session.ts"),
    source("apps/desktop/src/renderer-entry.ts"),
    source("apps/pwa/src/renderer-host.ts"),
  ]);
  const framework = [data, subsystem, renderer, main, desktop, pwa].join("\n");
  for (const retired of [
    "createInputListener", "InputManager", "RendererInputSource", "InputGate",
    "input.interest", "input.reset", "inputTarget", "createBrowserRendererInputSource",
  ]) assert.equal(framework.includes(retired), false, retired);
  assert.match(main, /bootstrap\.initial\.input/);
  assert.match(main, /currentActivationId/);
  assert.match(main, /FRAME_OWNERSHIP_MISMATCH/);
  assert.match(main, /FRAME_STACK_MISMATCH/);
  assert.match(main, /ACTIVATION_MISMATCH/);
});

test("Desktop and PWA compose generic Presentation Events without a physical input source", async () => {
  const [desktop, pwa] = await Promise.all([
    source("apps/desktop/src/renderer-entry.ts"),
    source("apps/pwa/src/renderer-host.ts"),
  ]);
  assert.match(desktop, /createRendererPresentationEventBinding/);
  assert.match(pwa, /createRendererPresentationEventBinding/);
  assert.doesNotMatch(desktop, /RendererInputSource|inputSource/);
  assert.doesNotMatch(pwa, /RendererInputSource|inputSource/);
});
