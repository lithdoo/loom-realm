import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V3,
} from "@loomrealm/data";
import { prepareRendererHelloResultV2 } from "@loomrealm/renderer-control";
import {
  CONTROLS_BUTTONS_V1,
  CONTROLS_INPUT_CHANNELS,
  CONTROLS_STATE_REFRESH_MS,
  CONTROLS_STATE_STALE_MS,
  DEVICE_INPUT_CHANNELS,
  EMPTY_CONTROLS_STATE_V1,
  createFreshControlsStateTracker,
  createFreshDeviceStateTracker,
} from "@loomrealm-game/common-controls";

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

test("the unified controls public ABI is exact and separately named", () => {
  assert.deepEqual([...CONTROLS_INPUT_CHANNELS], ["controls.state", "controls.event"]);
  assert.deepEqual([...CONTROLS_BUTTONS_V1], [
    "up", "down", "left", "right", "south", "east", "west", "north",
    "leftBumper", "rightBumper", "leftTrigger", "rightTrigger", "start", "select",
  ]);
  assert.deepEqual(EMPTY_CONTROLS_STATE_V1, { down: [] });
  assert.equal(Object.isFrozen(EMPTY_CONTROLS_STATE_V1), true);
  assert.equal(Object.isFrozen(EMPTY_CONTROLS_STATE_V1.down), true);
  assert.equal(CONTROLS_STATE_REFRESH_MS, 1_000);
  assert.equal(CONTROLS_STATE_STALE_MS, 2_500);
  assert.equal(typeof createFreshControlsStateTracker, "function");
  assert.equal(typeof createFreshDeviceStateTracker, "function");
});

test("controls fresh State expires to the frozen neutral value", async () => {
  const seen = [];
  const tracker = createFreshControlsStateTracker((payload) => seen.push(payload), { staleAfterMs: 15 });
  tracker.accept({ down: ["start"] });
  await new Promise((resolve) => setTimeout(resolve, 30));
  tracker.close();
  assert.deepEqual(seen, [{ down: ["start"] }, { down: [] }]);
  assert.equal(seen[1], EMPTY_CONTROLS_STATE_V1);
});

test("browser bundle registers four collision-guarded components and keeps controls ownership isolated", async () => {
  const [entry, builder] = await Promise.all([
    source("game-libs/game-common-controls/browser/device-input.browser.ts"),
    source("game-libs/game-common-controls/scripts/build-browser.mjs"),
  ]);
  for (const tag of ["game-keyboard-input", "game-pointer-input", "game-gamepad-input", "game-controls-input"]) {
    assert.match(entry, new RegExp(`customElements\\.define\\("${tag}"`));
    assert.match(builder, new RegExp(tag));
  }
  assert.match(entry, /registry\.get\("controls"\)/);
  assert.match(entry, /registry\.set\("controls", this\)/);
  assert.match(entry, /data-input-disabled/);
});

test("controls source owns the normative mappings, threshold, capture lifecycle, and reason split", async () => {
  const controls = await source("game-libs/game-common-controls/browser/controls-source.ts");
  for (const [code, button] of [
    ["ArrowUp", "up"], ["ArrowDown", "down"], ["ArrowLeft", "left"], ["ArrowRight", "right"],
    ["KeyZ", "south"], ["KeyX", "east"], ["KeyC", "west"], ["KeyV", "north"],
    ["KeyQ", "leftBumper"], ["KeyE", "rightBumper"], ["ShiftLeft", "leftTrigger"],
    ["ControlLeft", "rightTrigger"], ["Enter", "start"], ["Tab", "select"],
  ]) assert.match(controls, new RegExp(`\\["${code}", "${button}"\\]`));
  assert.match(controls, /const GAMEPAD_DOWN_THRESHOLD = 500_000/);
  assert.match(controls, /pad\.mapping !== "standard"/);
  assert.match(controls, /document\.addEventListener\("focusin", reconcileCapture\)/);
  assert.match(controls, /document\.addEventListener\("focusout", focusout\)/);
  assert.match(controls, /queueMicrotask\(reconcileCapture\)/);
  assert.match(controls, /event\.cancelable\) event\.preventDefault\(\)/);
  assert.match(controls, /physicalButtons\?: ReadonlySet/);
});

test("controls publication is exact top-frame State/Event and raw publication remains Session broadcast", async () => {
  const entry = await source("game-libs/game-common-controls/browser/device-input.browser.ts");
  assert.match(entry, /broadcast\?: boolean \| "top-frame"/);
  assert.match(entry, /broadcast: "top-frame", channel: change\.kind === "state" \? "controls\.state" : "controls\.event"/);
  assert.match(entry, /broadcast: true, channel: change\.channel/);
  assert.doesNotMatch(entry, /channel: "controls\.(?:state|event)"[^}]*broadcast: true/);
});

test("package browser tests exercise the real Custom Element seam and raw regressions", async () => {
  const [controlsTests, rawTests] = await Promise.all([
    source("game-libs/game-common-controls/test/controls-browser.test.mjs"),
    source("game-libs/game-common-controls/test/browser.test.mjs"),
  ]);
  for (const seam of ["receiveRenderContext", "page.keyboard", "getGamepads", "emitCustomEvent"]) {
    assert.match(controlsTests, new RegExp(seam.replace(".", "\\.")));
  }
  assert.match(controlsTests, /multi-pad OR/);
  assert.match(controlsTests, /Shadow DOM/);
  assert.match(controlsTests, /disconnect is silent/);
  for (const tag of ["game-keyboard-input", "game-pointer-input", "game-gamepad-input"]) assert.match(rawTests, new RegExp(tag));
});

test("root qualification composes controls, frame-targeted, and documentation gates", async () => {
  const rootPackage = JSON.parse(await source("package.json"));
  const command = rootPackage.scripts["test:game-common-controls-input:qualification"];
  assert.match(command, /build:game-common-controls-input/);
  assert.match(command, /test:game-common-controls-input:qualification:run/);
  assert.match(command, /test:frame-targeted-presentation:qualification/);
  assert.match(command, /docs:check-links/);
  assert.match(command, /docs:build/);
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
