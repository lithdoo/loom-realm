import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTROLS_BUTTONS_V1,
  CONTROLS_INPUT_CHANNELS,
  CONTROLS_STATE_REFRESH_MS,
  CONTROLS_STATE_STALE_MS,
  DEVICE_INPUT_CHANNELS,
  EMPTY_CONTROLS_STATE_V1,
  createFreshControlsStateTracker,
  createFreshDeviceStateTracker,
} from "../dist/index.js";

test("unified controls ABI is exact and isolated from raw device channels", () => {
  assert.deepEqual([...CONTROLS_INPUT_CHANNELS], ["controls.state", "controls.event"]);
  assert.deepEqual([...CONTROLS_BUTTONS_V1], [
    "up", "down", "left", "right", "south", "east", "west", "north",
    "leftBumper", "rightBumper", "leftTrigger", "rightTrigger", "start", "select",
  ]);
  assert.equal(CONTROLS_STATE_REFRESH_MS, 1_000);
  assert.equal(CONTROLS_STATE_STALE_MS, 2_500);
  assert.deepEqual(EMPTY_CONTROLS_STATE_V1, { down: [] });
  assert.equal(Object.isFrozen(EMPTY_CONTROLS_STATE_V1), true);
  assert.equal(Object.isFrozen(EMPTY_CONTROLS_STATE_V1.down), true);
  assert.deepEqual([...DEVICE_INPUT_CHANNELS], [
    "keyboard.state", "keyboard.event", "pointer.state", "pointer.event", "gamepad.state", "gamepad.event",
  ]);
});

test("fresh State tracker falls back to the channel empty State after silence", async () => {
  const seen = [];
  const tracker = createFreshDeviceStateTracker("keyboard.state", (payload) => seen.push(payload), { staleAfterMs: 20 });
  tracker.accept({ down: ["KeyA"] });
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.deepEqual(seen, [{ down: ["KeyA"] }, { down: [] }]);
  tracker.close();
});

test("fresh State tracker resets its deadline and close prevents fallback", async () => {
  const seen = [];
  const tracker = createFreshDeviceStateTracker("pointer.state", (payload) => seen.push(payload), { staleAfterMs: 25 });
  tracker.accept({ pointers: [{ pointerId: 1 }] });
  await new Promise((resolve) => setTimeout(resolve, 15));
  tracker.accept({ pointers: [{ pointerId: 1 }] });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(seen.length, 2);
  tracker.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(seen.length, 2);
});

test("fresh controls State tracker falls back independently and close cancels its deadline", async () => {
  const seen = [];
  const tracker = createFreshControlsStateTracker((payload) => seen.push(payload), { staleAfterMs: 20 });
  tracker.accept({ down: ["south"] });
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.deepEqual(seen, [{ down: ["south"] }, { down: [] }]);
  assert.equal(seen[1], EMPTY_CONTROLS_STATE_V1);
  tracker.accept({ down: ["north"] });
  tracker.close();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(seen, [{ down: ["south"] }, { down: [] }, { down: ["north"] }]);
});
