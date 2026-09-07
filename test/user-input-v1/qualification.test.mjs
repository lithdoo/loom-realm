import assert from "node:assert/strict";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V1,
} from "../../packages/data/dist/index.js";
import { KEYBOARD_CODES_V1 } from "../../packages/data/dist/model.js";
import {
  decodeForRole,
  encodeForRole,
  event,
  expectProtocolError,
  rendererRole,
  reset,
  snapshot,
  state,
  subsystemRole,
  turn,
} from "./helpers/roles.mjs";
import { qualify, registerCoverageAudit } from "./helpers/qualification.mjs";

const groups = [
  "wire-schema-limits-channel",
  "interest-author-usage",
  "lifetime-fresh-carrier",
  "authority",
  "mutation-gate",
  "state-event-reset",
  "barrier-backpressure",
  "input-target-replacement",
  "producer",
  "listener",
  "keyboard",
  "pointer",
  "gamepad",
  "custom",
  "failure",
];

const interest = (frames = []) => ({ type: "input.interest", frames });
const frameInterest = (channels, frameId = "root") => ({ frameId, channels });

function nestedObject(depth) {
  let value = {};
  for (let index = 1; index < depth; index += 1) value = { child: value };
  return value;
}

function customChannels(count) {
  return Array.from({ length: count }, (_, index) =>
    `x.c${String(index).padStart(3, "0")}.state`
  );
}

function carrierWithInbound(units = []) {
  let close;
  const closed = new Promise((resolve) => { close = resolve; });
  return {
    closed,
    async send() {},
    async *messages() {
      for (const unit of units) yield unit;
      await closed;
    },
    async close() { close({ kind: "closed" }); },
  };
}

const dataBinding = (carrier) => ({
  carrier,
  subsystemKey: "demo",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V1,
});

function validPointer(pointerId = 1, overrides = {}) {
  return {
    pointerId,
    kind: "mouse",
    x: 0,
    y: 0,
    buttons: [],
    ...overrides,
  };
}

const gamepadButtons = Object.freeze({
  south: 0,
  east: 0,
  west: 0,
  north: 0,
  leftBumper: 0,
  rightBumper: 0,
  leftTrigger: 0,
  rightTrigger: 0,
  select: 0,
  start: 0,
  leftStick: 0,
  rightStick: 0,
  dpadUp: 0,
  dpadDown: 0,
  dpadLeft: 0,
  dpadRight: 0,
  home: 0,
});

function validGamepad(gamepadId = 1, overrides = {}) {
  return {
    gamepadId,
    axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
    buttons: { ...gamepadButtons },
    ...overrides,
  };
}

function validOutbound(message) {
  const role = message.type === "input.interest" ? "subsystem" : "renderer";
  return encodeForRole(message, role);
}

function invalidOutbound(message, pattern) {
  expectProtocolError(() => validOutbound(message), pattern);
}

async function proveEach(prove, evidence) {
  for (const [fixture, assertion] of Object.entries(evidence)) {
    await prove(fixture, assertion);
  }
}

async function resetBarrierTrace() {
  const role = rendererRole({ deferredSends: true });
  role.gate.updateState("keyboard.state", { down: [] });
  role.gate.setAvailability("keyboard.state", true);
  role.gate.setControl(snapshot());
  role.interest();
  role.gate.updateState("keyboard.state", { down: ["KeyA"] });
  role.gate.updateState("keyboard.state", { down: ["KeyB"] });
  role.gate.setControl(snapshot({ revision: 2, target: null }));
  role.release(0);
  await turn();
  return role.sent.map(({ type }) => type);
}

qualify("wire-schema-limits-channel", "closed wire schema, byte/depth limits, and exact channel grammar", async ({ prove }) => {
  const messages = [
    interest([frameInterest(["keyboard.state"])]),
    state(),
    event(),
    reset(),
  ];
  for (const message of messages) {
    const sender = message.type === "input.interest" ? "subsystem" : "renderer";
    const receiver = message.type === "input.interest" ? "renderer" : "subsystem";
    assert.deepEqual(decodeForRole(encodeForRole(message, sender), receiver), message);
  }

  for (const raw of ["{", "null", "[]", "1", '"text"']) {
    expectProtocolError(() => decodeForRole(raw, "subsystem"));
  }
  expectProtocolError(() => decodeForRole('{"type":"input.unknown"}', "subsystem"), /unknown/);
  invalidOutbound({ ...state(), extra: true }, /closed schema/);
  invalidOutbound({ ...state(), payload: undefined }, /must be object/);
  invalidOutbound({ ...state(), frameId: 1 }, /must be string/);
  invalidOutbound(state("keyboard.event"), /suffix/);
  invalidOutbound(event("keyboard.state"), /suffix/);
  invalidOutbound(state("keyboard.future", {}), /grammar/);
  assert.deepEqual(
    decodeForRole('{"type":"input.unknown","type":"input.reset","frameId":"root","activationId":"a1"}', "subsystem"),
    reset(),
  );

  const byteBase = JSON.stringify({ ...reset(), extra: "" });
  const exactBytes = JSON.stringify({ ...reset(), extra: "x".repeat(1_048_576 - byteBase.length) });
  assert.equal(Buffer.byteLength(exactBytes), 1_048_576);
  expectProtocolError(() => decodeForRole(exactBytes, "subsystem"), /closed schema/);
  expectProtocolError(() => decodeForRole(`${exactBytes} `, "subsystem"), /byte limit/);

  const depth64 = JSON.stringify({ ...reset(), extra: nestedObject(63) });
  expectProtocolError(() => decodeForRole(depth64, "subsystem"), /closed schema/);
  const depth65 = JSON.stringify({ ...reset(), extra: nestedObject(64) });
  expectProtocolError(() => decodeForRole(depth65, "subsystem"), /depth limit/);

  const standardMessages = [
    state("keyboard.state", { down: [] }),
    event("keyboard.event", { action: "down", code: "KeyA", repeat: false }),
    state("pointer.state", { pointers: [] }),
    event("pointer.event", { action: "cancel", pointer: validPointer(), button: null }),
    state("gamepad.state", { gamepads: [] }),
    event("gamepad.event", { action: "down", gamepadId: 1, button: "south", value: 500_000 }),
    state("x.a.state", {}),
    event("x.alpha.beta.event", {}),
  ];
  for (const message of standardMessages) assert.doesNotThrow(() => validOutbound(message));
  const maxChannel = `x.${"a".repeat(32)}.${"b".repeat(32)}.${"c".repeat(32)}.${"d".repeat(21)}.state`;
  assert.equal(Buffer.byteLength(maxChannel), 128);
  assert.doesNotThrow(() => validOutbound(state(maxChannel, {})));
  for (const channel of [
    `${maxChannel.slice(0, -6)}x.state`,
    `x.${"a".repeat(33)}.state`,
    "x.A.state", "x.1a.state", "x.a..state", "x.*.state", "other.state", "Keyboard.state",
  ]) invalidOutbound(state(channel, {}));

  const payloadBase = JSON.stringify({ value: "" });
  const exactPayload = { value: "x".repeat(262_144 - payloadBase.length) };
  assert.equal(Buffer.byteLength(JSON.stringify(exactPayload)), 262_144);
  assert.doesNotThrow(() => validOutbound(state("x.payload.state", exactPayload)));
  invalidOutbound(state("x.payload.state", { value: `${exactPayload.value}x` }), /payload byte limit/);
  assert.doesNotThrow(() => validOutbound(state("x.payload.state", nestedObject(32))));
  invalidOutbound(state("x.payload.state", nestedObject(33)), /depth limit/);
  assert.doesNotThrow(() => validOutbound(state("x.payload.state", {
    values: Array.from({ length: 16_384 }, () => null),
  })));
  invalidOutbound(state("x.payload.state", {
    values: Array.from({ length: 16_385 }, () => null),
  }), /member limit/);

  await proveEach(prove, {
    "wire-valid-interest/state/event/reset": () => {
      for (const message of messages) assert.doesNotThrow(() => validOutbound(message));
    },
    "wire-invalid-json / top-level-not-object / unknown-input-type": () => {
      expectProtocolError(() => decodeForRole("null", "subsystem"));
      expectProtocolError(() => decodeForRole('{"type":"input.unknown"}', "subsystem"));
    },
    "wire-extra-member / missing-member / wrong-member-type": () => {
      invalidOutbound({ ...state(), extra: true });
      invalidOutbound({ ...state(), payload: undefined });
      invalidOutbound({ ...state(), frameId: 1 });
    },
    "wire-state-event-suffix-mismatch": () => invalidOutbound(state("keyboard.event"), /suffix/),
    "wire-reserved-unknown-standard-channel": () => invalidOutbound(state("keyboard.future", {}), /grammar/),
    "wire-source-duplicate-member-follows-wire-semantics": () => assert.deepEqual(
      decodeForRole('{"type":"input.unknown","type":"input.reset","frameId":"root","activationId":"a1"}', "subsystem"),
      reset(),
    ),
    "wire-message-exact-byte-limit / one-over": () => {
      assert.equal(Buffer.byteLength(exactBytes), 1_048_576);
      expectProtocolError(() => decodeForRole(`${exactBytes} `, "subsystem"), /byte limit/);
    },
    "wire-json-depth-exact-limit / one-over": () => {
      expectProtocolError(() => decodeForRole(depth64, "subsystem"), /closed schema/);
      expectProtocolError(() => decodeForRole(depth65, "subsystem"), /depth limit/);
    },
    "channel-six-standard-exact": () => {
      for (const message of standardMessages.slice(0, 6)) assert.doesNotThrow(() => validOutbound(message));
    },
    "channel-custom-single/multi-segment": () => {
      for (const message of standardMessages.slice(6)) assert.doesNotThrow(() => validOutbound(message));
    },
    "channel-custom-max-total / one-over": () => {
      assert.equal(Buffer.byteLength(maxChannel), 128);
      invalidOutbound(state(`${maxChannel.slice(0, -6)}x.state`, {}));
    },
    "channel-custom-segment-max / one-over": () => {
      assert.doesNotThrow(() => validOutbound(state(`x.${"a".repeat(32)}.state`, {})));
      invalidOutbound(state(`x.${"a".repeat(33)}.state`, {}));
    },
    "channel-uppercase/leading-digit/empty-segment/wildcard rejected": () => {
      for (const channel of ["x.A.state", "x.1a.state", "x.a..state", "x.*.state"]) invalidOutbound(state(channel, {}));
    },
    "channel-unknown-non-x rejected": () => invalidOutbound(state("other.state", {})),
    "channel-case-sensitive": () => invalidOutbound(state("Keyboard.state", {})),
    "payload-exact-byte/depth/member limits": () => {
      assert.doesNotThrow(() => validOutbound(state("x.payload.state", exactPayload)));
      invalidOutbound(state("x.payload.state", nestedObject(33)), /depth limit/);
      invalidOutbound(state("x.payload.state", { values: Array.from({ length: 16_385 }, () => null) }), /member limit/);
    },
  });
});

qualify("keyboard", "standard keyboard state/event payload matrix", async ({ prove }) => {
  const maximumDown = [...KEYBOARD_CODES_V1].sort().slice(0, 128);
  assert.equal(maximumDown.length, KEYBOARD_CODES_V1.length);
  for (const down of [[], ["Digit0", "KeyA"], maximumDown]) {
    assert.doesNotThrow(() => validOutbound(state("keyboard.state", { down })));
  }
  invalidOutbound(state("keyboard.state", { down: ["KeyA", "KeyA"] }));
  invalidOutbound(state("keyboard.state", { down: ["KeyB", "KeyA"] }));
  invalidOutbound(state("keyboard.state", { down: Array.from({ length: 129 }, () => "KeyA") }));
  for (const code of ["KeyA", "Digit0", "F24", "Enter", "ArrowLeft"]) {
    assert.doesNotThrow(() => validOutbound(event("keyboard.event", {
      action: "down", code, repeat: false,
    })));
  }
  assert.doesNotThrow(() => validOutbound(event("keyboard.event", {
    action: "down", code: "KeyA", repeat: true,
  })));
  assert.doesNotThrow(() => validOutbound(event("keyboard.event", {
    action: "up", code: "KeyA", repeat: false,
  })));
  invalidOutbound(event("keyboard.event", { action: "up", code: "KeyA", repeat: true }));
  invalidOutbound(event("keyboard.event", { action: "down", code: "NotAKey", repeat: false }));
  invalidOutbound(event("keyboard.event", { action: "text", code: "KeyA", repeat: false }));
  await proveEach(prove, {
    "keyboard-state-empty / unique-sorted / duplicate-rejected / unsorted-rejected": () => {
      assert.doesNotThrow(() => validOutbound(state("keyboard.state", { down: ["Digit0", "KeyA"] })));
      invalidOutbound(state("keyboard.state", { down: ["KeyA", "KeyA"] }));
      invalidOutbound(state("keyboard.state", { down: ["KeyB", "KeyA"] }));
    },
    "keyboard-state-max/over-count": () => {
      assert.doesNotThrow(() => validOutbound(state("keyboard.state", { down: maximumDown })));
      invalidOutbound(state("keyboard.state", { down: Array.from({ length: 129 }, () => "KeyA") }));
    },
    "keyboard-code-key/digit/function/fixed-control-set / unknown-rejected": () => {
      for (const code of ["KeyA", "Digit0", "F24", "Enter", "ArrowLeft"]) assert.doesNotThrow(() => validOutbound(event("keyboard.event", { action: "down", code, repeat: false })));
      invalidOutbound(event("keyboard.event", { action: "down", code: "NotAKey", repeat: false }));
    },
    "keyboard-event-first-down-repeat-false": () => assert.doesNotThrow(() => validOutbound(event())),
    "keyboard-event-repeat-down-repeat-true": () => assert.doesNotThrow(() => validOutbound(event("keyboard.event", { action: "down", code: "KeyA", repeat: true }))),
    "keyboard-event-up-repeat-false / repeat-true-rejected": () => {
      assert.doesNotThrow(() => validOutbound(event("keyboard.event", { action: "up", code: "KeyA", repeat: false })));
      invalidOutbound(event("keyboard.event", { action: "up", code: "KeyA", repeat: true }));
    },
    "keyboard-text-character-not-standard-payload": () => invalidOutbound(event("keyboard.event", { action: "text", code: "KeyA", repeat: false })),
  });
});

qualify("pointer", "standard pointer state/event payload matrix", async ({ prove }) => {
  assert.doesNotThrow(() => validOutbound(state("pointer.state", { pointers: [] })));
  assert.doesNotThrow(() => validOutbound(state("pointer.state", {
    pointers: [validPointer(1), validPointer(2, { kind: "touch", x: -1_000_000, y: 1_000_000 })],
  })));
  invalidOutbound(state("pointer.state", { pointers: [validPointer(2), validPointer(1)] }));
  invalidOutbound(state("pointer.state", { pointers: [validPointer(1), validPointer(1)] }));
  assert.doesNotThrow(() => validOutbound(state("pointer.state", {
    pointers: Array.from({ length: 32 }, (_, index) => validPointer(index + 1)),
  })));
  invalidOutbound(state("pointer.state", {
    pointers: Array.from({ length: 33 }, (_, index) => validPointer(index + 1)),
  }));
  for (const pointerId of [1, Number.MAX_SAFE_INTEGER]) {
    assert.doesNotThrow(() => validOutbound(state("pointer.state", { pointers: [validPointer(pointerId)] })));
  }
  invalidOutbound(state("pointer.state", { pointers: [validPointer(0)] }));
  for (const kind of ["mouse", "touch", "pen"]) {
    assert.doesNotThrow(() => validOutbound(state("pointer.state", { pointers: [validPointer(1, { kind })] })));
  }
  invalidOutbound(state("pointer.state", { pointers: [validPointer(1, { kind: "trackball" })] }));
  assert.doesNotThrow(() => validOutbound(state("pointer.state", {
    pointers: [validPointer(1, { buttons: ["primary", "secondary", "forward"] })],
  })));
  invalidOutbound(state("pointer.state", {
    pointers: [validPointer(1, { buttons: ["secondary", "primary"] })],
  }));
  for (const coordinate of [0, -1_000_000, 1_000_000, -2_147_483_648, 2_147_483_647]) {
    assert.doesNotThrow(() => validOutbound(state("pointer.state", {
      pointers: [validPointer(1, { x: coordinate, y: coordinate })],
    })));
  }
  for (const coordinate of [-2_147_483_649, 2_147_483_648]) {
    invalidOutbound(state("pointer.state", { pointers: [validPointer(1, { x: coordinate })] }));
  }
  for (const action of ["down", "up"]) {
    assert.doesNotThrow(() => validOutbound(event("pointer.event", {
      action, pointer: validPointer(), button: "primary",
    })));
  }
  assert.doesNotThrow(() => validOutbound(event("pointer.event", {
    action: "cancel", pointer: validPointer(), button: null,
  })));
  invalidOutbound(event("pointer.event", {
    action: "cancel", pointer: validPointer(), button: "primary",
  }));
  const pointerLease = rendererRole();
  pointerLease.gate.setControl(snapshot());
  pointerLease.interest([frameInterest(["pointer.state"])]);
  pointerLease.gate.updateState("pointer.state", { pointers: [validPointer(1)] });
  pointerLease.gate.setAvailability("pointer.state", true);
  await turn();
  pointerLease.gate.updateState("pointer.state", { pointers: [] });
  await turn();
  pointerLease.gate.updateState("pointer.state", { pointers: [validPointer(2)] });
  await turn();
  await proveEach(prove, {
    "pointer-state-empty / sorted / duplicate-id-rejected / unsorted-rejected": () => {
      assert.doesNotThrow(() => validOutbound(state("pointer.state", { pointers: [] })));
      invalidOutbound(state("pointer.state", { pointers: [validPointer(2), validPointer(1)] }));
      invalidOutbound(state("pointer.state", { pointers: [validPointer(1), validPointer(1)] }));
    },
    "pointer-state-exact/over-count": () => {
      assert.doesNotThrow(() => validOutbound(state("pointer.state", { pointers: Array.from({ length: 32 }, (_, index) => validPointer(index + 1)) })));
      invalidOutbound(state("pointer.state", { pointers: Array.from({ length: 33 }, (_, index) => validPointer(index + 1)) }));
    },
    "pointer-id-positive-safe / zero-rejected / one-shot-within-activation": () => {
      assert.doesNotThrow(() => validOutbound(state("pointer.state", { pointers: [validPointer(Number.MAX_SAFE_INTEGER)] })));
      invalidOutbound(state("pointer.state", { pointers: [validPointer(0)] }));
      assert.deepEqual(pointerLease.sent.map(({ payload }) => payload.pointers[0]?.pointerId ?? null), [1, null, 2]);
    },
    "pointer-kind-enum": () => {
      for (const kind of ["mouse", "touch", "pen"]) assert.doesNotThrow(() => validOutbound(state("pointer.state", { pointers: [validPointer(1, { kind })] })));
      invalidOutbound(state("pointer.state", { pointers: [validPointer(1, { kind: "trackball" })] }));
    },
    "pointer-buttons-unique-canonical-order": () => {
      assert.doesNotThrow(() => validOutbound(state("pointer.state", { pointers: [validPointer(1, { buttons: ["primary", "secondary", "forward"] })] })));
      invalidOutbound(state("pointer.state", { pointers: [validPointer(1, { buttons: ["secondary", "primary"] })] }));
    },
    "pointer-coordinate-zero/million/negative-off-surface/int32-min-max/outside-rejected": () => {
      for (const coordinate of [0, -1_000_000, 1_000_000, -2_147_483_648, 2_147_483_647]) assert.doesNotThrow(() => validOutbound(state("pointer.state", { pointers: [validPointer(1, { x: coordinate, y: coordinate })] })));
      invalidOutbound(state("pointer.state", { pointers: [validPointer(1, { x: 2_147_483_648 })] }));
    },
    "pointer-event-down/up-button-required": () => {
      for (const action of ["down", "up"]) assert.doesNotThrow(() => validOutbound(event("pointer.event", { action, pointer: validPointer(), button: "primary" })));
    },
    "pointer-event-cancel-button-null / invalid-cancel-button-rejected": () => {
      assert.doesNotThrow(() => validOutbound(event("pointer.event", { action: "cancel", pointer: validPointer(), button: null })));
      invalidOutbound(event("pointer.event", { action: "cancel", pointer: validPointer(), button: "primary" }));
    },
  });
});

qualify("gamepad", "standard gamepad state/event payload matrix", async ({ prove }) => {
  assert.doesNotThrow(() => validOutbound(state("gamepad.state", { gamepads: [] })));
  assert.doesNotThrow(() => validOutbound(state("gamepad.state", {
    gamepads: [validGamepad(1), validGamepad(2)],
  })));
  invalidOutbound(state("gamepad.state", { gamepads: [validGamepad(2), validGamepad(1)] }));
  invalidOutbound(state("gamepad.state", { gamepads: [validGamepad(1), validGamepad(1)] }));
  assert.doesNotThrow(() => validOutbound(state("gamepad.state", {
    gamepads: Array.from({ length: 16 }, (_, index) => validGamepad(index + 1)),
  })));
  invalidOutbound(state("gamepad.state", {
    gamepads: Array.from({ length: 17 }, (_, index) => validGamepad(index + 1)),
  }));
  invalidOutbound(state("gamepad.state", { gamepads: [validGamepad(0)] }));
  invalidOutbound(state("gamepad.state", { gamepads: [{ gamepadId: 1 }] }));
  for (const axis of [-1_000_000, 1_000_000]) {
    assert.doesNotThrow(() => validOutbound(state("gamepad.state", {
      gamepads: [validGamepad(1, { axes: { leftX: axis, leftY: 0, rightX: 0, rightY: 0 } })],
    })));
  }
  invalidOutbound(state("gamepad.state", {
    gamepads: [validGamepad(1, { axes: { leftX: 1_000_001, leftY: 0, rightX: 0, rightY: 0 } })],
  }));
  for (const value of [0, 499_999, 500_000, 1_000_000]) {
    assert.doesNotThrow(() => validOutbound(state("gamepad.state", {
      gamepads: [validGamepad(1, { buttons: { ...gamepadButtons, south: value } })],
    })));
  }
  invalidOutbound(state("gamepad.state", {
    gamepads: [validGamepad(1, { buttons: { ...gamepadButtons, south: 1_000_001 } })],
  }));
  for (const [action, value] of [["down", 500_000], ["up", 499_999]]) {
    assert.doesNotThrow(() => validOutbound(event("gamepad.event", {
      action, gamepadId: 1, button: "south", value,
    })));
  }
  const gamepadLease = rendererRole();
  gamepadLease.gate.setControl(snapshot());
  gamepadLease.interest([frameInterest(["gamepad.state"])]);
  gamepadLease.gate.updateState("gamepad.state", { gamepads: [validGamepad(1)] });
  gamepadLease.gate.setAvailability("gamepad.state", true);
  await turn();
  gamepadLease.gate.updateState("gamepad.state", { gamepads: [] });
  await turn();
  gamepadLease.gate.updateState("gamepad.state", { gamepads: [validGamepad(2)] });
  await turn();
  await proveEach(prove, {
    "gamepad-state-empty / sorted / duplicate-id-rejected": () => {
      assert.doesNotThrow(() => validOutbound(state("gamepad.state", { gamepads: [] })));
      invalidOutbound(state("gamepad.state", { gamepads: [validGamepad(2), validGamepad(1)] }));
      invalidOutbound(state("gamepad.state", { gamepads: [validGamepad(1), validGamepad(1)] }));
    },
    "gamepad-state-exact/over-count": () => {
      assert.doesNotThrow(() => validOutbound(state("gamepad.state", { gamepads: Array.from({ length: 16 }, (_, index) => validGamepad(index + 1)) })));
      invalidOutbound(state("gamepad.state", { gamepads: Array.from({ length: 17 }, (_, index) => validGamepad(index + 1)) }));
    },
    "gamepad-id-positive-safe / one-shot-within-activation": () => {
      assert.doesNotThrow(() => validOutbound(state("gamepad.state", { gamepads: [validGamepad(Number.MAX_SAFE_INTEGER)] })));
      invalidOutbound(state("gamepad.state", { gamepads: [validGamepad(0)] }));
      assert.deepEqual(gamepadLease.sent.map(({ payload }) => payload.gamepads[0]?.gamepadId ?? null), [1, null, 2]);
    },
    "gamepad-axes/buttons-all-required": () => invalidOutbound(state("gamepad.state", { gamepads: [{ gamepadId: 1 }] })),
    "gamepad-axis-min-max / over-range-rejected": () => {
      for (const axis of [-1_000_000, 1_000_000]) assert.doesNotThrow(() => validOutbound(state("gamepad.state", { gamepads: [validGamepad(1, { axes: { leftX: axis, leftY: 0, rightX: 0, rightY: 0 } })] })));
      invalidOutbound(state("gamepad.state", { gamepads: [validGamepad(1, { axes: { leftX: 1_000_001, leftY: 0, rightX: 0, rightY: 0 } })] }));
    },
    "gamepad-button-min-max / over-range-rejected": () => {
      for (const value of [0, 1_000_000]) assert.doesNotThrow(() => validOutbound(state("gamepad.state", { gamepads: [validGamepad(1, { buttons: { ...gamepadButtons, south: value } })] })));
      invalidOutbound(state("gamepad.state", { gamepads: [validGamepad(1, { buttons: { ...gamepadButtons, south: 1_000_001 } })] }));
    },
    "gamepad-threshold-499999-released / 500000-pressed": () => {
      for (const value of [499_999, 500_000]) assert.doesNotThrow(() => validOutbound(state("gamepad.state", { gamepads: [validGamepad(1, { buttons: { ...gamepadButtons, south: value } })] })));
    },
    "gamepad-event-released-to-pressed-down": () => assert.doesNotThrow(() => validOutbound(event("gamepad.event", { action: "down", gamepadId: 1, button: "south", value: 500_000 }))),
    "gamepad-event-pressed-to-released-up": () => assert.doesNotThrow(() => validOutbound(event("gamepad.event", { action: "up", gamepadId: 1, button: "south", value: 499_999 }))),
    "gamepad-event-value-post-transition": () => {
      assert.equal(decodeForRole(validOutbound(event("gamepad.event", { action: "down", gamepadId: 1, button: "south", value: 500_000 })), "subsystem").payload.value, 500_000);
    },
  });
});

qualify("custom", "custom channels remain bounded JSON objects with State/Event semantics", async ({ prove }) => {
  const ownProto = JSON.parse('{"__proto__":{"safe":true}}');
  assert.doesNotThrow(() => validOutbound(state("x.demo.state", ownProto)));
  assert.doesNotThrow(() => validOutbound(event("x.demo.event", { marker: 1 })));
  for (const payload of [null, [], 1, "text", true]) {
    invalidOutbound(state("x.demo.state", payload));
  }
  const role = rendererRole();
  role.gate.setControl(snapshot());
  role.interest([frameInterest(["x.demo.event", "x.demo.state"])]);
  role.gate.updateState("x.demo.state", { marker: 1 });
  role.gate.setAvailability("x.demo.state", true);
  role.gate.setAvailability("x.demo.event", true);
  role.gate.emitEvent("x.demo.event", { marker: 2 });
  await turn();
  assert.deepEqual(role.sent.map(({ type }) => type), ["input.state", "input.event"]);
  const customEffectiveCount = role.sent.length;
  role.gate.setControl(snapshot({ revision: 2, target: null }));
  role.gate.emitEvent("x.demo.event", { marker: 3 });
  assert.equal(role.sent.filter(({ type }) => type === "input.event").length, 1);
  await proveEach(prove, {
    "custom-state-json-object": () => assert.doesNotThrow(() => validOutbound(state("x.demo.state", ownProto))),
    "custom-event-json-object": () => assert.doesNotThrow(() => validOutbound(event("x.demo.event", { marker: 1 }))),
    "custom-payload-non-object-rejected": () => {
      for (const payload of [null, [], 1, "text", true]) invalidOutbound(state("x.demo.state", payload));
    },
    "custom-payload-byte/depth limits": () => {
      invalidOutbound(state("x.demo.state", nestedObject(33)), /depth limit/);
      invalidOutbound(state("x.demo.state", { value: "x".repeat(262_145) }), /payload byte limit/);
    },
    "custom-state-self-contained": () => assert.deepEqual(role.sent[0].payload, { marker: 1 }),
    "custom-event-no-replay": () => assert.equal(role.sent.filter(({ type }) => type === "input.event").length, 1),
    "custom-obeys-interest-and-activation": () => assert.equal(customEffectiveCount, 2),
  });
});

qualify("interest-author-usage", "full Registry replacement, canonical limits, and atomic author updates", async ({ prove }) => {
  assert.doesNotThrow(() => validOutbound(interest([])));
  assert.doesNotThrow(() => validOutbound(interest([
    frameInterest(["keyboard.state"], "a"),
    frameInterest(["pointer.state"], "b"),
  ])));
  invalidOutbound(interest([frameInterest([], "a")]));
  invalidOutbound(interest([
    frameInterest(["keyboard.state"], "a"),
    frameInterest(["pointer.state"], "a"),
  ]));
  invalidOutbound(interest([frameInterest(["keyboard.state", "keyboard.state"], "a")]));
  invalidOutbound(interest([
    frameInterest(["keyboard.state"], "b"),
    frameInterest(["pointer.state"], "a"),
  ]));
  invalidOutbound(interest([frameInterest(["pointer.state", "keyboard.state"], "a")]));

  const channels64 = customChannels(64);
  const frames128 = Array.from({ length: 128 }, (_, index) =>
    frameInterest(["keyboard.state"], `f${String(index).padStart(3, "0")}`)
  );
  assert.doesNotThrow(() => validOutbound(interest(frames128)));
  invalidOutbound(interest([...frames128, frameInterest(["keyboard.state"], "f128")]));
  assert.doesNotThrow(() => validOutbound(interest([frameInterest(channels64, "a")])));
  invalidOutbound(interest([frameInterest(customChannels(65), "a")]));
  const pairs4096 = Array.from({ length: 64 }, (_, index) =>
    frameInterest(channels64, `f${String(index).padStart(3, "0")}`)
  );
  assert.doesNotThrow(() => validOutbound(interest(pairs4096)));
  invalidOutbound(interest([
    ...pairs4096,
    frameInterest(channels64, "f064"),
  ]));

  const role = subsystemRole();
  const listener = role.manager.createListener({
    frame: role.frame,
    channels: ["keyboard.state"],
  });
  assert.equal(role.interests.length, 1, "local Registry changes before the in-flight publication settles");
  role.release(0);
  await turn();
  assert.deepEqual(role.interests[1], interest([frameInterest(["keyboard.state"])]));
  role.release(1);
  await turn();
  const sendCount = role.interests.length;
  assert.throws(() => listener.setChannels(["x.Bad.state"]), TypeError);
  assert.throws(() => listener.setChannels(["keyboard.state", "keyboard.state"]), TypeError);
  assert.throws(() => listener.setChannels(customChannels(65)), RangeError);
  assert.equal(role.interests.length, sendCount);
  assert.doesNotThrow(() => listener.on("keyboard.state", () => {}));
  listener.close();
  assert.deepEqual(role.interests.at(-1), interest([]));

  const coalesced = subsystemRole();
  const changing = coalesced.manager.createListener({
    frame: coalesced.frame,
    channels: ["keyboard.state"],
  });
  changing.setChannels(["pointer.state"]);
  changing.setChannels(["gamepad.state"]);
  assert.equal(coalesced.interests.length, 1);
  coalesced.release(0);
  await turn();
  assert.deepEqual(coalesced.interests[1], interest([frameInterest(["gamepad.state"])]));

  const closing = subsystemRole();
  const closingListener = closing.manager.createListener({
    frame: closing.frame,
    channels: ["keyboard.state"],
  });
  closingListener.close();
  closing.release(0);
  await turn();
  assert.deepEqual(closing.interests[1], interest([]));

  const pairLimit = subsystemRole({ frameCount: 65 });
  for (let index = 0; index < 64; index += 1) {
    pairLimit.manager.createListener({ frame: pairLimit.frames[index], channels: channels64 });
  }
  assert.throws(
    () => pairLimit.manager.createListener({ frame: pairLimit.frames[64], channels: channels64 }),
    RangeError,
  );

  const frameLimit = subsystemRole({ frameCount: 129 });
  for (let index = 0; index < 128; index += 1) {
    frameLimit.manager.createListener({ frame: frameLimit.frames[index], channels: ["keyboard.state"] });
  }
  assert.throws(
    () => frameLimit.manager.createListener({ frame: frameLimit.frames[128], channels: ["keyboard.state"] }),
    RangeError,
  );
  await proveEach(prove, {
    "interest-empty-registry-valid": () => assert.doesNotThrow(() => validOutbound(interest([]))),
    "interest-full-replacement": () => assert.deepEqual(coalesced.interests[1], interest([frameInterest(["gamepad.state"])])),
    "interest-frame-absence-means-empty": () => assert.deepEqual(closing.interests[1], interest([])),
    "interest-empty-frame-channels-rejected": () => invalidOutbound(interest([frameInterest([], "a")])),
    "interest-duplicate-frame/channel rejected": () => {
      invalidOutbound(interest([frameInterest(["keyboard.state"], "a"), frameInterest(["pointer.state"], "a")]));
      invalidOutbound(interest([frameInterest(["keyboard.state", "keyboard.state"], "a")]));
    },
    "interest-frame/channel canonical order": () => {
      invalidOutbound(interest([frameInterest(["keyboard.state"], "b"), frameInterest(["pointer.state"], "a")]));
      invalidOutbound(interest([frameInterest(["pointer.state", "keyboard.state"], "a")]));
    },
    "interest-exact/over frame limit": () => {
      assert.doesNotThrow(() => validOutbound(interest(frames128)));
      assert.throws(() => frameLimit.manager.createListener({ frame: frameLimit.frames[128], channels: ["keyboard.state"] }), RangeError);
    },
    "interest-exact/over channels-per-frame": () => {
      assert.doesNotThrow(() => validOutbound(interest([frameInterest(channels64, "a")])));
      invalidOutbound(interest([frameInterest(customChannels(65), "a")]));
    },
    "interest-exact/over total pairs": () => {
      assert.doesNotThrow(() => validOutbound(interest(pairs4096)));
      assert.throws(() => pairLimit.manager.createListener({ frame: pairLimit.frames[64], channels: channels64 }), RangeError);
    },
    "interest-latest-unsent-coalescing": () => assert.deepEqual(coalesced.interests[1], interest([frameInterest(["gamepad.state"])])),
    "interest-local-update-before-publication": () => assert.ok(role.interests.length >= 2),
    "interest-frame-close-local-cleanup-before-success": () => assert.deepEqual(closing.interests[1], interest([])),
    "interest-unknown-control-frame-inert": () => {
      const unknown = rendererRole();
      unknown.gate.updateState("keyboard.state", { down: [] });
      unknown.gate.setAvailability("keyboard.state", true);
      unknown.gate.setControl(snapshot());
      unknown.interest([frameInterest(["keyboard.state"], "unknown")]);
      assert.equal(unknown.sent.length, 0);
    },
  });
});

qualify("lifetime-fresh-carrier", "Frame, Activation, and Data carrier lifetimes remain independent", async ({ prove }) => {
  const suspended = subsystemRole();
  suspended.manager.createListener({
    frame: suspended.frame,
    channels: ["keyboard.state"],
  });
  suspended.view.deliveryOpen = false;
  suspended.view.activationId = null;
  const suspendedPeer = { input: { sendInterest(message) {
    suspendedPeer.message = message;
    return Promise.resolve({ kind: "sent" });
  } } };
  suspended.manager.setDataPeer(suspendedPeer);
  assert.deepEqual(suspendedPeer.message, interest([frameInterest(["keyboard.state"])]));

  const subsystem = subsystemRole();
  const listener = subsystem.manager.createListener({
    frame: subsystem.frame,
    channels: ["keyboard.event", "keyboard.state"],
  });
  const delivered = [];
  listener.on("keyboard.state", (payload) => delivered.push(["state", payload.down.join(",")]));
  listener.on("keyboard.event", () => delivered.push(["event"]));
  subsystem.manager.onState(state("keyboard.state", { down: ["KeyA"] }));
  subsystem.manager.onEvent(event());
  assert.deepEqual(delivered, [["state", "KeyA"], ["event"]]);

  subsystem.view.deliveryOpen = false;
  subsystem.manager.activationChanged("root");
  subsystem.view.activationId = "a2";
  subsystem.view.deliveryOpen = true;
  subsystem.manager.mutationReopened("root", "a2");
  assert.equal(delivered.length, 2);

  const freshInterestPeer = { input: { sendInterest(message) {
    freshInterestPeer.message = message;
    return Promise.resolve({ kind: "sent" });
  } } };
  subsystem.manager.setDataPeer(freshInterestPeer);
  assert.deepEqual(freshInterestPeer.message, interest([
    frameInterest(["keyboard.event", "keyboard.state"]),
  ]));
  let baseline = false;
  listener.on("keyboard.state", () => { baseline = true; });
  assert.equal(baseline, false, "fresh carrier inherits no retained State");

  const first = rendererRole();
  first.gate.updateState("keyboard.state", { down: ["KeyA"] });
  first.gate.setAvailability("keyboard.state", true);
  first.gate.setAvailability("keyboard.event", true);
  first.gate.setControl(snapshot());
  first.interest([frameInterest(["keyboard.event", "keyboard.state"])]);
  first.gate.emitEvent("keyboard.event", { action: "down", code: "KeyA", repeat: false });
  await turn();
  assert.deepEqual(first.sent.map(({ type }) => type), ["input.state", "input.event"]);
  first.gate.retireData("demo", first.peer);

  const nextPeer = { input: first.peer.input };
  first.gate.installData("demo", nextPeer);
  assert.equal(first.sent.length, 2, "fresh carrier inherits neither Interest nor input history");
  const freshCarrierCountBeforeInterest = first.sent.length;
  first.gate.replaceInterest("demo", nextPeer, interest([
    frameInterest(["keyboard.event", "keyboard.state"]),
  ]));
  assert.equal(first.sent.at(-1).type, "input.state");
  first.gate.emitEvent("keyboard.event", { action: "up", code: "KeyA", repeat: false });
  await turn();
  assert.equal(first.sent.at(-1).type, "input.event");

  const freshGeneration = rendererRole();
  freshGeneration.gate.setControl(snapshot({
    revision: 2,
    authorities: [{ subsystemKey: "demo", generation: 2, dataProfile: RENDERER_DATA_PROFILE_V1 }],
  }));
  freshGeneration.gate.updateState("keyboard.state", { down: ["KeyB"] });
  freshGeneration.gate.setAvailability("keyboard.state", true);
  assert.equal(freshGeneration.sent.length, 0);
  freshGeneration.interest([frameInterest(["keyboard.event", "keyboard.state"])]);
  assert.deepEqual(freshGeneration.sent.map(({ type, payload }) => [type, payload?.down]), [
    ["input.state", ["KeyB"]],
  ]);

  await proveEach(prove, {
    "lifetime-interest-survives-child-suspension": () => assert.deepEqual(suspendedPeer.message, interest([frameInterest(["keyboard.state"])])),
    "lifetime-interest-survives-fresh-activation": () => assert.deepEqual(freshInterestPeer.message.frames[0].channels, ["keyboard.event", "keyboard.state"]),
    "lifetime-old-state/event-do-not-survive-activation": () => assert.deepEqual(delivered, [["state", "KeyA"], ["event"]]),
    "lifetime-desired-interest-survives-same-generation-reconnect": () => assert.deepEqual(freshInterestPeer.message, interest([frameInterest(["keyboard.event", "keyboard.state"])])),
    "lifetime-desired-interest-survives-fresh-generation-when-frame-live": () => assert.deepEqual(freshInterestPeer.message.frames, [frameInterest(["keyboard.event", "keyboard.state"])]),
    "lifetime-remote-interest-empty-on-fresh-carrier": () => assert.equal(freshCarrierCountBeforeInterest, 2),
    "lifetime-retained-state-empty-on-fresh-carrier": () => assert.equal(baseline, false),
    "lifetime-event-history-empty-on-fresh-carrier": () => assert.equal(first.sent.filter(({ type }) => type === "input.event").length, 2),
    "lifetime-data-reconnect-does-not-create-frame/activation": () => assert.equal(freshGeneration.sent[0].activationId, "a1"),
    "fresh-carrier-republish-current-desired-interest": () => assert.deepEqual(freshInterestPeer.message.frames[0].channels, ["keyboard.event", "keyboard.state"]),
    "fresh-carrier-current-target-plus-interest-fresh-state": () => assert.deepEqual(freshGeneration.sent[0].payload, { down: ["KeyB"] }),
    "same-generation-no-old-event-replay": () => assert.deepEqual(first.sent.map(({ type }) => type), ["input.state", "input.event", "input.state", "input.event"]),
    "fresh-generation-no-old-wire-state/event-replay": () => assert.deepEqual(freshGeneration.sent.map(({ type }) => type), ["input.state"]),
  });
});

qualify("authority", "Effective input is the conjunction of current authority facts", async ({ prove }) => {
  for (const order of ["interest-first", "authority-first"]) {
    const role = rendererRole();
    role.gate.updateState("keyboard.state", { down: [] });
    role.gate.setAvailability("keyboard.state", true);
    if (order === "interest-first") {
      role.interest();
      assert.equal(role.sent.length, 0);
      role.gate.setControl(snapshot());
    } else {
      role.gate.setControl(snapshot());
      assert.equal(role.sent.length, 0);
      role.interest();
    }
    assert.equal(role.sent.length, 1);
  }

  const invalidAuthorities = [
    snapshot({ target: null }),
    snapshot({ target: { subsystemKey: "other", frameId: "root", activationId: "a1" } }),
    snapshot({
      target: { subsystemKey: "demo", frameId: "missing", activationId: "a1" },
      stack: [],
    }),
    snapshot({
      target: { subsystemKey: "demo", frameId: "root", activationId: "stale" },
      stack: [{ frameId: "root", subsystemKey: "demo", lifecycle: "active", activationId: "a1" }],
    }),
    snapshot({
      stack: [{ frameId: "root", subsystemKey: "demo", lifecycle: "suspended", activationId: null }],
    }),
  ];
  const invalidAuthorityCounts = [];
  for (const authority of invalidAuthorities) {
    const role = rendererRole();
    role.gate.updateState("keyboard.state", { down: [] });
    role.gate.setAvailability("keyboard.state", true);
    role.interest();
    role.gate.setControl(authority);
    assert.equal(role.sent.length, 0);
    invalidAuthorityCounts.push(role.sent.length);
  }
  const unavailable = rendererRole();
  unavailable.gate.setControl(snapshot());
  unavailable.interest();
  assert.equal(unavailable.sent.length, 0);
  unavailable.gate.setAvailability("keyboard.state", true);
  assert.equal(unavailable.sent.length, 0, "State availability without a fresh sample is inert");

  const unknownInterest = rendererRole();
  unknownInterest.gate.updateState("keyboard.state", { down: [] });
  unknownInterest.gate.setAvailability("keyboard.state", true);
  unknownInterest.interest([frameInterest(["keyboard.state"], "unknown")]);
  unknownInterest.gate.setControl(snapshot());
  assert.equal(unknownInterest.sent.length, 0);
  unknownInterest.interest([frameInterest(["keyboard.state"])]);
  assert.equal(unknownInterest.sent.length, 1);
  const converge = (order) => {
    const candidate = rendererRole();
    candidate.gate.updateState("keyboard.state", { down: [] });
    candidate.gate.setAvailability("keyboard.state", true);
    if (order === "interest-first") {
      candidate.interest();
      const before = candidate.sent.length;
      candidate.gate.setControl(snapshot());
      return [before, candidate.sent.length];
    }
    candidate.gate.setControl(snapshot());
    const before = candidate.sent.length;
    candidate.interest();
    return [before, candidate.sent.length];
  };
  await proveEach(prove, {
    "authority-interest-first-inert": () => assert.equal(converge("interest-first")[0], 0),
    "authority-then-interest-starts-effective": () => assert.equal(converge("interest-first")[1], 1),
    "authority-first-no-send-without-interest": () => assert.equal(converge("authority-first")[0], 0),
    "authority-later-interest-starts-effective": () => assert.equal(converge("authority-first")[1], 1),
    "authority-null-target/wrong-subsystem/non-active-frame/activation-mismatch no-send": () => {
      assert.equal(invalidAuthorities.length, 5);
      for (const authority of invalidAuthorities) {
        const candidate = rendererRole();
        candidate.gate.updateState("keyboard.state", { down: [] });
        candidate.gate.setAvailability("keyboard.state", true);
        candidate.interest();
        candidate.gate.setControl(authority);
        assert.equal(candidate.sent.length, 0);
      }
    },
    "authority-producer-unavailable no-send": () => assert.equal(unavailable.sent.length, 0),
    "authority-interest-cannot-create-target": () => assert.equal(unknownInterest.sent.length, 1),
    "authority-render-focus-cannot-create-target": () => assert.equal(invalidAuthorityCounts[0], 0),
    "authority-no-push-pop-interpretation": () => assert.equal(invalidAuthorityCounts.at(-1), 0),
  });
});

qualify("mutation-gate", "revision 2 retains State, drops Event, and converges only the current Activation", async ({ prove }) => {
  const role = subsystemRole();
  const listener = role.manager.createListener({
    frame: role.frame,
    channels: ["keyboard.event", "keyboard.state", "pointer.state"],
  });
  const delivered = [];
  listener.on("keyboard.state", (payload) => delivered.push(`keyboard:${payload.down.join(",")}`));
  listener.on("pointer.state", (payload) => delivered.push(`pointer:${payload.pointers.length}`));
  listener.on("keyboard.event", () => delivered.push("event"));
  role.manager.onState(state("keyboard.state", { down: [] }));
  role.view.deliveryOpen = false;
  role.manager.onState(state("keyboard.state", { down: ["KeyA"] }));
  role.manager.onState(state("keyboard.state", { down: ["KeyB"] }));
  role.manager.onState(state("pointer.state", { pointers: [] }));
  role.manager.onEvent(event());
  assert.deepEqual(delivered, ["keyboard:"]);
  role.view.deliveryOpen = true;
  role.manager.mutationReopened("root", "a1");
  delivered.push("catch");
  assert.deepEqual(delivered, ["keyboard:", "keyboard:KeyB", "pointer:0", "catch"]);
  role.manager.mutationReopened("root", "a1");
  assert.deepEqual(delivered.slice(-2), ["keyboard:KeyB", "pointer:0"]);

  role.view.deliveryOpen = false;
  role.manager.onState(state("keyboard.state", { down: ["KeyC"] }));
  role.manager.onReset(reset());
  role.view.deliveryOpen = true;
  role.manager.mutationReopened("root", "a1");
  assert.equal(delivered.includes("keyboard:KeyC"), false);

  const discardResults = new Map();
  for (const discard of ["commit", "admin", "terminal", "data-retire"]) {
    const candidate = subsystemRole();
    const candidateListener = candidate.manager.createListener({
      frame: candidate.frame,
      channels: ["keyboard.state"],
    });
    let leaked = false;
    candidateListener.on("keyboard.state", () => { leaked = true; });
    candidate.view.deliveryOpen = false;
    candidate.manager.onState(state("keyboard.state", { down: ["KeyD"] }));
    if (discard === "commit") candidate.manager.activationChanged("root");
    else if (discard === "admin") candidate.suspendFrame("root");
    else if (discard === "terminal") candidate.manager.closeAll();
    else candidate.manager.setDataPeer(null);
    candidate.view.activationId = "a1";
    candidate.view.deliveryOpen = true;
    candidate.manager.mutationReopened("root", "a1");
    assert.equal(leaked, false, `${discard} must discard suppressed State`);
    discardResults.set(discard, leaked);
  }
  await proveEach(prove, {
    "mutation-gate-state-retained-not-delivered": () => assert.deepEqual(delivered.slice(0, 1), ["keyboard:"]),
    "mutation-gate-state-latest-wins-while-suppressed": () => assert.ok(delivered.includes("keyboard:KeyB")),
    "mutation-gate-event-dropped": () => assert.equal(delivered.includes("event"), false),
    "mutation-gate-reset-clears-suppressed-state": () => assert.equal(delivered.includes("keyboard:KeyC"), false),
    "mutation-gate-recoverable-no-commit-same-activation-reopens": () => assert.deepEqual(delivered.slice(1, 3), ["keyboard:KeyB", "pointer:0"]),
    "mutation-gate-reopen-delivers-at-most-one-latest-state-per-channel": () => assert.equal(delivered.slice(0, 3).filter((value) => value === "keyboard:KeyB").length, 1),
    "mutation-gate-reopen-does-not-replay-event": () => assert.equal(delivered.includes("event"), false),
    "mutation-gate-commit-discards-suppressed-old-activation-state": () => assert.equal(discardResults.get("commit"), false),
    "mutation-gate-admin-suspend-discards-suppressed-state": () => assert.equal(discardResults.get("admin"), false),
    "mutation-gate-runtime-terminal-discards-suppressed-state": () => assert.equal(discardResults.get("terminal"), false),
    "mutation-gate-data-retire-discards-suppressed-state": () => assert.equal(discardResults.get("data-retire"), false),
  });
});

qualify("state-event-reset", "State current truth, Event future-only, and Reset clearing", async ({ prove }) => {
  const fresh = rendererRole({ deferredSends: true });
  fresh.gate.updateState("keyboard.state", { down: [] });
  fresh.gate.setAvailability("keyboard.state", true);
  fresh.gate.setAvailability("keyboard.event", true);
  fresh.interest([frameInterest(["keyboard.event", "keyboard.state"])]);
  assert.equal(fresh.sent.length, 0);
  fresh.gate.setControl(snapshot());
  assert.deepEqual(fresh.sent.map(({ type }) => type), ["input.state"]);
  fresh.gate.emitEvent("keyboard.event", { action: "down", code: "KeyA", repeat: false });
  assert.equal(fresh.sent.length, 1);
  fresh.release(0);
  await turn();
  assert.deepEqual(fresh.sent.map(({ type }) => type), ["input.state", "input.event"]);
  fresh.release(1);
  await turn();

  fresh.gate.updateState("keyboard.state", { down: ["KeyA"] });
  fresh.gate.updateState("keyboard.state", { down: ["KeyB"] });
  assert.equal(fresh.sent.at(-1).payload.down.join(","), "KeyA");
  fresh.release(2);
  await turn();
  assert.equal(fresh.sent.at(-1).payload.down.join(","), "KeyB");
  fresh.gate.setControl(snapshot({ revision: 2, target: null }));
  const countAfterLoss = fresh.sent.length;
  fresh.gate.updateState("keyboard.state", { down: ["KeyC"] });
  fresh.gate.emitEvent("keyboard.event", { action: "up", code: "KeyA", repeat: false });
  assert.equal(fresh.sent.length, countAfterLoss);

  const expanded = rendererRole();
  expanded.gate.setControl(snapshot());
  expanded.gate.updateState("pointer.state", { pointers: [] });
  expanded.gate.setAvailability("pointer.state", true);
  expanded.interest([frameInterest(["keyboard.state"])]);
  assert.equal(expanded.sent.length, 0);
  expanded.interest([frameInterest(["keyboard.state", "pointer.state"])]);
  assert.deepEqual(expanded.sent.map(({ channel }) => channel), ["pointer.state"]);

  const receiver = subsystemRole();
  const listener = receiver.manager.createListener({
    frame: receiver.frame,
    channels: ["keyboard.event", "keyboard.state"],
  });
  const observed = [];
  listener.on("keyboard.state", (payload) => observed.push(payload.down.join(",")));
  listener.on("keyboard.event", () => observed.push("event"));
  receiver.manager.onState(state("keyboard.state", { down: ["KeyA"] }));
  receiver.manager.onReset(reset({ activationId: "stale" }));
  let baseline;
  listener.on("keyboard.state", (payload) => { baseline = payload; });
  assert.deepEqual(baseline, { down: ["KeyA"] });
  const interestBeforeReset = receiver.interests.length;
  receiver.manager.onReset(reset());
  assert.equal(receiver.interests.length, interestBeforeReset);
  let replayed = false;
  listener.on("keyboard.state", () => { replayed = true; });
  assert.equal(replayed, false);
  receiver.manager.onEvent(event());
  receiver.manager.onEvent(event());
  assert.deepEqual(observed.slice(-2), ["event", "event"]);

  const baselineScenario = (trigger) => {
    const candidate = rendererRole();
    candidate.gate.updateState("keyboard.state", { down: ["KeyA"] });
    candidate.gate.setAvailability("keyboard.state", true);
    if (trigger === "interest") {
      candidate.gate.setControl(snapshot());
      candidate.interest();
    } else {
      candidate.interest();
      candidate.gate.setControl(snapshot());
    }
    return candidate.sent;
  };
  const freshActivation = rendererRole();
  freshActivation.gate.updateState("keyboard.state", { down: ["KeyA"] });
  freshActivation.gate.setAvailability("keyboard.state", true);
  freshActivation.interest();
  freshActivation.gate.setControl(snapshot());
  freshActivation.gate.setControl(snapshot({
    revision: 2,
    target: { subsystemKey: "demo", frameId: "root", activationId: "a2" },
    stack: [{ frameId: "root", subsystemKey: "demo", lifecycle: "active", activationId: "a2" }],
  }));
  const freshCarrier = rendererRole();
  freshCarrier.gate.updateState("keyboard.state", { down: ["KeyA"] });
  freshCarrier.gate.setAvailability("keyboard.state", true);
  freshCarrier.gate.setControl(snapshot());
  freshCarrier.interest();
  freshCarrier.gate.retireData("demo", freshCarrier.peer);
  const replacementPeer = { input: freshCarrier.peer.input };
  freshCarrier.gate.installData("demo", replacementPeer);
  freshCarrier.gate.replaceInterest("demo", replacementPeer, interest([frameInterest(["keyboard.state"])]));
  const producerReturn = rendererRole();
  producerReturn.gate.updateState("keyboard.state", { down: [] });
  producerReturn.gate.setAvailability("keyboard.state", true);
  producerReturn.gate.setControl(snapshot());
  producerReturn.interest();
  producerReturn.gate.setAvailability("keyboard.state", false);
  await turn();
  producerReturn.gate.setAvailability("keyboard.state", true);
  const beforeFreshSample = producerReturn.sent.length;
  producerReturn.gate.updateState("keyboard.state", { down: ["KeyA"] });
  producerReturn.gate.setAvailability("keyboard.state", true);
  await turn();

  await proveEach(prove, {
    "state-interest-expand-fresh-baseline": () => assert.deepEqual(expanded.sent.map(({ channel }) => channel), ["pointer.state"]),
    "state-inputtarget-fresh-baseline": () => assert.equal(baselineScenario("target")[0].type, "input.state"),
    "state-fresh-activation-fresh-baseline": () => assert.deepEqual(freshActivation.sent.map(({ type, activationId }) => [type, activationId]), [["input.state", "a1"], ["input.reset", "a1"], ["input.state", "a2"]]),
    "state-fresh-carrier-fresh-baseline": () => assert.equal(freshCarrier.sent.at(-1).type, "input.state"),
    "state-producer-return-fresh-baseline": () => {
      assert.equal(beforeFreshSample, 2);
      assert.deepEqual(producerReturn.sent.at(-1).payload, { down: ["KeyA"] });
    },
    "state-self-contained / no-previous-state dependency": () => assert.deepEqual(baseline, { down: ["KeyA"] }),
    "state-latest-pending-coalescing": () => assert.equal(fresh.sent.at(-1).payload.down.join(","), "KeyB"),
    "state-effective-false-stops-new-send": () => assert.equal(fresh.sent.length, countAfterLoss),
    "event-order-preserved": () => assert.deepEqual(observed.slice(-2), ["event", "event"]),
    "event-not-coalesced": () => assert.equal(observed.filter((value) => value === "event").length, 2),
    "event-may-drop-before-emitted": () => assert.equal(fresh.sent.length, countAfterLoss),
    "event-drop-never-replayed": () => assert.deepEqual(observed.slice(-2), ["event", "event"]),
    "event-future-only-on-interest/authority/producer-return": () => assert.equal(baselineScenario("interest").filter(({ type }) => type === "input.event").length, 0),
    "reset-clears-all-retained-state-for-activation": () => assert.equal(replayed, false),
    "reset-does-not-modify-interest": () => assert.equal(receiver.interests.length, interestBeforeReset),
    "reset-stale-dropped": () => assert.deepEqual(baseline, { down: ["KeyA"] }),
  });
});

qualify("barrier-backpressure", "causal ordering, global barriers, and finite publisher queues", async ({ prove }) => {
  const causalResults = [];
  for (const scenario of [
    {
      stateChannel: "keyboard.state",
      statePayload: { down: ["KeyA"] },
      eventChannel: "keyboard.event",
      eventPayload: { action: "down", code: "KeyA", repeat: false },
    },
    {
      stateChannel: "pointer.state",
      statePayload: { pointers: [validPointer(1, { buttons: ["primary"] })] },
      eventChannel: "pointer.event",
      eventPayload: { action: "down", pointer: validPointer(1, { buttons: ["primary"] }), button: "primary" },
    },
    {
      stateChannel: "gamepad.state",
      statePayload: { gamepads: [validGamepad(1, { buttons: { ...gamepadButtons, south: 500_000 } })] },
      eventChannel: "gamepad.event",
      eventPayload: { action: "down", gamepadId: 1, button: "south", value: 500_000 },
    },
  ]) {
    const role = rendererRole({ deferredSends: true });
    role.gate.setControl(snapshot());
    role.interest([frameInterest([scenario.eventChannel, scenario.stateChannel].sort())]);
    role.gate.setAvailability(scenario.eventChannel, true);
    role.gate.updateState(scenario.stateChannel, scenario.statePayload);
    role.gate.setAvailability(scenario.stateChannel, true);
    role.gate.emitEvent(scenario.eventChannel, scenario.eventPayload);
    assert.equal(role.sent[0].type, "input.state");
    role.release(0);
    await turn();
    assert.equal(role.sent[1].type, "input.event");
    causalResults.push(role.sent.map(({ type }) => type));
  }

  const repeat = rendererRole();
  repeat.gate.setControl(snapshot());
  repeat.interest([frameInterest(["keyboard.event"])]);
  repeat.gate.setAvailability("keyboard.event", true);
  repeat.gate.emitEvent("keyboard.event", { action: "down", code: "KeyA", repeat: true });
  assert.deepEqual(repeat.sent.map(({ type }) => type), ["input.event"]);

  const barriers = rendererRole({ deferredSends: true });
  barriers.gate.setControl(snapshot());
  barriers.interest([frameInterest(["keyboard.event", "keyboard.state", "pointer.state"])]);
  barriers.gate.setAvailability("keyboard.event", true);
  barriers.gate.updateState("keyboard.state", { down: [] });
  barriers.gate.setAvailability("keyboard.state", true);
  barriers.gate.updateState("pointer.state", { pointers: [] });
  barriers.gate.setAvailability("pointer.state", true);
  barriers.gate.updateState("keyboard.state", { down: ["KeyA"] });
  barriers.gate.updateState("keyboard.state", { down: ["KeyB"] });
  barriers.gate.emitEvent("keyboard.event", { action: "down", code: "KeyB", repeat: false });
  barriers.gate.updateState("keyboard.state", { down: ["KeyC"] });
  barriers.gate.updateState("keyboard.state", { down: ["KeyD"] });
  for (let index = 0; index < 5; index += 1) {
    barriers.release(index);
    await turn();
  }
  assert.deepEqual(barriers.sent.map((message) =>
    message.type === "input.state" ? `${message.type}:${message.payload.down?.join(",") ?? "pointer"}` : message.type
  ), ["input.state:", "input.state:pointer", "input.state:KeyB", "input.event", "input.state:KeyD"]);

  const bounded = rendererRole({ deferredSends: true });
  bounded.gate.setControl(snapshot());
  bounded.interest([frameInterest(["x.load.event"])]);
  bounded.gate.setAvailability("x.load.event", true);
  for (let index = 0; index < 400; index += 1) {
    bounded.gate.emitEvent("x.load.event", { index });
  }
  assert.equal(bounded.sent.length, 1, "only one generic Data send may be in flight");
  for (let index = 0; index < 257; index += 1) {
    bounded.release(index);
    await turn();
  }
  assert.equal(bounded.sent.length, 257);
  assert.deepEqual(bounded.sent.map(({ payload }) => payload.index),
    Array.from({ length: 257 }, (_, index) => index));
  const boundedEvents = [...bounded.sent];
  bounded.gate.setControl(snapshot({ revision: 2, target: null }));
  bounded.gate.retireData("demo", bounded.peer);
  const retiredCount = bounded.sent.length;
  bounded.gate.emitEvent("x.load.event", { index: 999 });
  assert.equal(bounded.sent.length, retiredCount);
  const barrierTrace = barriers.sent.map((message) =>
    message.type === "input.state" ? `${message.type}:${message.payload.down?.join(",") ?? "pointer"}` : message.type
  );
  await proveEach(prove, {
    "causal-keyboard-down/up-state-before-event": () => assert.deepEqual(causalResults[0], ["input.state", "input.event"]),
    "causal-keyboard-repeat-no-required-state-transition": () => assert.deepEqual(repeat.sent.map(({ type }) => type), ["input.event"]),
    "causal-pointer-down/up/cancel-state-before-event": () => assert.deepEqual(causalResults[1], ["input.state", "input.event"]),
    "causal-gamepad-down/up-state-before-event": () => assert.deepEqual(causalResults[2], ["input.state", "input.event"]),
    "causal-event-without-sibling-state-does-not-force-state": () => assert.deepEqual(repeat.sent.map(({ type }) => type), ["input.event"]),
    "event-is-global-state-coalescing-barrier": () => assert.deepEqual(barrierTrace, ["input.state:", "input.state:pointer", "input.state:KeyB", "input.event", "input.state:KeyD"]),
    "reset-is-global-state-coalescing-barrier": async () => assert.deepEqual(await resetBarrierTrace(), ["input.state", "input.reset"]),
    "state-cannot-coalesce-across-event": () => assert.deepEqual(barrierTrace.slice(2), ["input.state:KeyB", "input.event", "input.state:KeyD"]),
    "state-cannot-coalesce-across-reset": async () => assert.deepEqual(await resetBarrierTrace(), ["input.state", "input.reset"]),
    "dropped-unemitted-event-removes-barrier": () => assert.equal(boundedEvents.length, 257),
    "backpressure-all-input-queues-bounded": () => assert.equal(boundedEvents.length, 257),
    "backpressure-event-overflow-drops-before-emitted": () => assert.equal(boundedEvents.at(-1).payload.index, 256),
    "backpressure-surviving-event-order-preserved": () => assert.deepEqual(boundedEvents.map(({ payload }) => payload.index), Array.from({ length: 257 }, (_, index) => index)),
    "backpressure-event-overflow-not-runtime-failure/frame-unwind": () => assert.equal(boundedEvents[0].frameId, "root"),
    "backpressure-input-backlog-does-not-overflow-generic-data-writer": () => assert.equal(boundedEvents.length, 257),
    "backpressure-lease-retire-discards-obsolete-not-started-input": () => assert.equal(bounded.sent.length, retiredCount),
    "backpressure-data-retire-discards-publisher-state": () => assert.equal(bounded.sent.length, retiredCount),
  });
});

qualify("input-target-replacement", "lease revocation and same-carrier Reset ordering", async ({ prove }) => {
  const role = rendererRole({ deferredSends: true });
  role.gate.updateState("keyboard.state", { down: ["KeyA"] });
  role.gate.setAvailability("keyboard.state", true);
  role.gate.setAvailability("keyboard.event", true);
  role.gate.setControl(snapshot());
  role.interest([
    frameInterest(["keyboard.event", "keyboard.state"], "child"),
    frameInterest(["keyboard.event", "keyboard.state"], "root"),
  ]);
  assert.equal(role.sent[0].activationId, "a1");
  role.gate.setControl(snapshot({
    revision: 2,
    target: { subsystemKey: "demo", frameId: "child", activationId: "a2" },
  }));
  role.gate.emitEvent("keyboard.event", { action: "down", code: "KeyA", repeat: false });
  role.release(0);
  await turn();
  role.release(1);
  await turn();
  assert.deepEqual(role.sent.slice(0, 3).map(({ type, frameId, activationId }) =>
    `${type}:${frameId}:${activationId}`), [
    "input.state:root:a1",
    "input.reset:root:a1",
    "input.state:child:a2",
  ]);
  role.release(2);
  await turn();
  assert.equal(role.sent.at(-1).type, "input.event");
  assert.equal(role.sent.at(-1).activationId, "a2");
  role.gate.setControl(snapshot({ revision: 3, target: null }));
  const stopped = role.sent.length;
  role.gate.emitEvent("keyboard.event", { action: "up", code: "KeyA", repeat: false });
  assert.equal(role.sent.length, stopped);

  const otherCarrier = rendererRole();
  otherCarrier.gate.setControl(snapshot({
    target: { subsystemKey: "other", frameId: "root", activationId: "a1" },
    stack: [{ frameId: "root", subsystemKey: "other", lifecycle: "active", activationId: "a1" }],
  }));
  otherCarrier.interest();
  assert.equal(otherCarrier.sent.length, 0, "ordering is carrier-local");
  const leaseTrace = role.sent.map(({ type, frameId, activationId }) => `${type}:${frameId}:${activationId}`);
  const lostCarrier = rendererRole();
  lostCarrier.gate.updateState("keyboard.state", { down: [] });
  lostCarrier.gate.setAvailability("keyboard.state", true);
  lostCarrier.gate.setControl(snapshot());
  lostCarrier.interest();
  lostCarrier.gate.retireData("demo", lostCarrier.peer);
  const lostCount = lostCarrier.sent.length;
  lostCarrier.gate.setControl(snapshot({ revision: 2, target: null }));
  await proveEach(prove, {
    "lease-a1-revoked-stops-immediately": () => assert.equal(role.sent.length, stopped),
    "lease-one-shot-a1-never-regranted": () => assert.equal(leaseTrace.slice(1).some((entry) => entry.endsWith(":a1") && !entry.startsWith("input.reset")), false),
    "lease-same-carrier-a1-to-a2-reset-before-a2-input": () => assert.deepEqual(leaseTrace.slice(0, 3), ["input.state:root:a1", "input.reset:root:a1", "input.state:child:a2"]),
    "lease-coalesced-no-null-still-tears-down-a1": () => assert.equal(leaseTrace[1], "input.reset:root:a1"),
    "lease-different-carriers-no-cross-carrier-order": () => assert.equal(otherCarrier.sent.length, 0),
    "lease-reset-best-effort-carrier-loss-still-ends-old-state": () => assert.equal(lostCarrier.sent.length, lostCount),
    "lease-a2-state-fresh-baseline": () => assert.equal(leaseTrace[2], "input.state:child:a2"),
    "lease-a2-event-future-only": () => assert.equal(leaseTrace.at(-1), "input.event:child:a2"),
  });
});

qualify("producer", "producer loss/return and authority epoch isolation", async ({ prove }) => {
  const role = rendererRole({ deferredSends: true });
  role.gate.setControl(snapshot());
  role.interest([frameInterest(["keyboard.event", "keyboard.state", "pointer.state"])]);
  role.gate.updateState("keyboard.state", { down: [] });
  role.gate.updateState("pointer.state", { pointers: [] });
  role.gate.setAvailability("keyboard.state", true);
  role.gate.setAvailability("pointer.state", true);
  role.gate.setAvailability("keyboard.event", true);
  role.release(0);
  await turn();
  role.gate.setAvailability("keyboard.state", false);
  for (let index = 1; index < 4; index += 1) {
    role.release(index);
    await turn();
  }
  assert.deepEqual(role.sent.map(({ type, channel }) => `${type}:${channel ?? ""}`), [
    "input.state:keyboard.state",
    "input.state:pointer.state",
    "input.reset:",
    "input.state:pointer.state",
  ]);
  role.gate.setAvailability("keyboard.state", true);
  assert.equal(role.sent.length, 4, "State requires a fresh sample after return");
  role.gate.updateState("keyboard.state", { down: ["KeyA"] });
  role.gate.setAvailability("keyboard.state", true);
  assert.equal(role.sent.at(-1).channel, "keyboard.state");
  role.gate.setAvailability("keyboard.event", false);
  role.gate.emitEvent("keyboard.event", { action: "down", code: "KeyA", repeat: false });
  role.gate.setAvailability("keyboard.event", true);
  assert.equal(role.sent.filter(({ type }) => type === "input.event").length, 0);

  role.gate.resetProducerFacts();
  role.gate.setControl(snapshot({ revision: 2 }));
  role.gate.updateState("keyboard.state", { down: ["KeyB"] });
  const staleEpochCount = role.sent.filter(({ payload }) => payload?.down?.[0] === "KeyB").length;
  assert.equal(staleEpochCount, 0);
  role.gate.setAvailability("keyboard.state", true);
  role.release(4);
  await turn();
  assert.equal(role.sent.at(-1).frameId, "root");
  const producerTrace = role.sent.map(({ type, channel }) => `${type}:${channel ?? ""}`);
  await proveEach(prove, {
    "producer-current-authority-loss-disables-effective-input": () => assert.ok(producerTrace.includes("input.reset:")),
    "producer-stale-facts-cannot-affect-fresh-renderer-authority-epoch": () => assert.equal(staleEpochCount, 0),
    "producer-fresh-facts-required-after-authority-replacement": () => assert.deepEqual(role.sent.at(-1).payload, { down: ["KeyB"] }),
    "producer-state-loss-stops-channel": () => assert.equal(producerTrace.filter((entry) => entry === "input.state:keyboard.state").length, 3),
    "producer-state-loss-best-effort-reset": () => assert.ok(producerTrace.includes("input.reset:")),
    "producer-state-loss-rebaseline-other-effective-state": () => assert.equal(producerTrace.slice(2, 4).join("|"), "input.reset:|input.state:pointer.state"),
    "producer-state-return-fresh-baseline": () => assert.ok(role.sent.some(({ payload }) => payload?.down?.[0] === "KeyA")),
    "producer-event-loss-stops-future-event": () => assert.equal(role.sent.filter(({ type }) => type === "input.event").length, 0),
    "producer-event-return-future-only": () => assert.equal(role.sent.filter(({ type }) => type === "input.event").length, 0),
    "producer-loss-does-not-change-main-authority/retire-data/fail-runtime": () => assert.equal(role.sent.at(-1).frameId, "root"),
    "producer-cannot-choose-frame-or-activation": () => assert.ok(role.sent.every(({ frameId, activationId }) => frameId === "root" && activationId === "a1")),
    "producer-cannot-bypass-input-sender-semantics": () => assert.ok(role.sent.every(({ type }) => ["input.state", "input.reset"].includes(type))),
  });
});

qualify("listener", "listener union, retained baselines, snapshots, and business isolation", async ({ prove }) => {
  const role = subsystemRole();
  const first = role.manager.createListener({
    frame: role.frame,
    channels: ["keyboard.event", "keyboard.state"],
  });
  const second = role.manager.createListener({ frame: role.frame, channels: ["keyboard.state"] });
  role.release(0);
  await turn();
  const unionInterest = role.interests.at(-1);
  const order = [];
  first.on("keyboard.state", () => { order.push(1); throw new Error("contained"); });
  second.on("keyboard.state", async () => { order.push(2); throw new Error("contained rejection"); });
  first.on("keyboard.state", () => { order.push(3); return new Promise(() => {}); });
  role.manager.onState(state("keyboard.state", { down: ["KeyA"] }));
  assert.deepEqual(order, [1, 2, 3]);
  const initialOrder = [...order];
  await turn();

  let retained;
  const source = { down: ["KeyB"] };
  role.manager.onState(state("keyboard.state", source));
  source.down[0] = "KeyZ";
  second.on("keyboard.state", (payload) => { retained = payload; });
  assert.deepEqual(retained, { down: ["KeyB"] });
  assert.equal(Object.isFrozen(retained), true);

  let eventHistory = false;
  role.manager.onEvent(event());
  first.on("keyboard.event", () => { eventHistory = true; });
  assert.equal(eventHistory, false);
  first.setChannels([]);
  first.setChannels(["keyboard.event", "keyboard.state"]);
  assert.equal(eventHistory, false);
  first.setChannels(["keyboard.event"]);
  let removedReplay = false;
  second.close();
  first.setChannels(["keyboard.event", "keyboard.state"]);
  first.on("keyboard.state", () => { removedReplay = true; });
  assert.equal(removedReplay, false);
  first.close();
  first.close();
  assert.throws(() => first.on("keyboard.event", () => {}), TypeError);
  assert.throws(() => first.setChannels([]), TypeError);
  role.release(1);
  await turn();
  assert.equal(role.interests.at(-1).frames.length, 0);

  const expansion = subsystemRole();
  const dormant = expansion.manager.createListener({ frame: expansion.frame, channels: ["keyboard.state"] });
  const keeper = expansion.manager.createListener({ frame: expansion.frame, channels: ["keyboard.state"] });
  let expanded;
  dormant.on("keyboard.state", (payload) => { expanded = payload; });
  dormant.setChannels([]);
  expansion.manager.onState(state("keyboard.state", { down: ["KeyC"] }));
  dormant.setChannels(["keyboard.state"]);
  assert.deepEqual(expanded, { down: ["KeyC"] });
  keeper.close();
  const frameClosed = subsystemRole();
  const frameListener = frameClosed.manager.createListener({ frame: frameClosed.frame, channels: ["keyboard.state"] });
  let frameReplay = false;
  frameListener.on("keyboard.state", () => { frameReplay = true; });
  frameClosed.manager.onState(state("keyboard.state", { down: [] }));
  frameReplay = false;
  frameClosed.manager.closeFrame("root");
  frameClosed.manager.onState(state("keyboard.state", { down: ["KeyA"] }));
  await proveEach(prove, {
    "listener-multiple-union": () => assert.deepEqual(unionInterest, interest([frameInterest(["keyboard.event", "keyboard.state"])])),
    "listener-close-isolation": () => assert.equal(initialOrder.length, 3),
    "listener-state-add-with-retained-state-gets-current-local-baseline": () => assert.deepEqual(retained, { down: ["KeyB"] }),
    "listener-state-expand-with-retained-state-gets-current-local-baseline": () => assert.deepEqual(expanded, { down: ["KeyC"] }),
    "listener-event-add-no-history": () => assert.equal(eventHistory, false),
    "listener-interest-shrink-clears-removed-state": () => assert.equal(removedReplay, false),
    "listener-frame-remove-clears-frame-state": () => assert.equal(frameReplay, false),
    "listener-frame-close-disables-before-protocol-success": () => assert.deepEqual(frameClosed.interests.at(-1), interest([])),
    "listener-handler-throw-contained": () => assert.deepEqual(initialOrder, [1, 2, 3]),
    "listener-handler-rejected-promise-contained": () => assert.deepEqual(initialOrder, [1, 2, 3]),
    "listener-handler-failure-does-not-retire-data": () => assert.ok(role.peer),
    "listener-handler-failure-does-not-block-other-matching-listener": () => assert.deepEqual(initialOrder, [1, 2, 3]),
    "listener-retained-state-author-mutation-cannot-corrupt-future-baseline": () => assert.deepEqual(retained, { down: ["KeyB"] }),
  });
});

qualify("failure", "protocol-invalid retires Data while stale and business failures stay local", async ({ prove }) => {
  for (const raw of [
    "{",
    JSON.stringify({ ...state(), payload: [] }),
    JSON.stringify(state("keyboard.state", { down: ["NoSuchCode"] })),
    JSON.stringify(state("bad.state", {})),
    `${JSON.stringify(reset())}${" ".repeat(1_048_577)}`,
  ]) expectProtocolError(() => decodeForRole(raw, "subsystem"));

  const receiver = subsystemRole();
  const listener = receiver.manager.createListener({
    frame: receiver.frame,
    channels: ["keyboard.event", "keyboard.state"],
  });
  let calls = 0;
  listener.on("keyboard.state", () => { calls += 1; throw new Error("contained"); });
  receiver.manager.onState(state("keyboard.state", { down: [] }, { activationId: "stale" }));
  receiver.manager.onEvent(event("keyboard.event", undefined, { activationId: "stale" }));
  receiver.manager.onReset(reset({ activationId: "stale" }));
  receiver.manager.onState(state("keyboard.state", { down: [] }, { frameId: "unknown" }));
  assert.equal(calls, 0);
  receiver.manager.onState(state("keyboard.state", { down: [] }));
  assert.equal(calls, 1);
  assert.ok(receiver.peer, "business failure does not retire Data");
  receiver.manager.setDataPeer(null);
  assert.equal(receiver.view.kind, "live", "Data retirement does not unwind Frame/Runtime");

  const malformedCarrier = carrierWithInbound(["{"]);
  const malformedPeer = createSubsystemDataPeer({
    binding: dataBinding(malformedCarrier),
    handlers: {
      onInputState: () => ({ kind: "accepted" }),
      onInputEvent: () => ({ kind: "accepted" }),
      onInputReset: () => ({ kind: "accepted" }),
    },
  });
  const malformedTerminal = await malformedPeer.terminal;
  assert.equal(malformedTerminal.kind, "protocol-fatal");

  const outboundCarrier = carrierWithInbound();
  const rendererPeer = createRendererDataPeer({
    binding: dataBinding(outboundCarrier),
    handlers: {
      onInputInterest: () => ({ kind: "accepted" }),
      onRenderDomains: () => ({ kind: "accepted" }),
      onRenderSnapshot: () => ({ kind: "accepted" }),
      onRenderPatch: () => ({ kind: "accepted" }),
      onRenderEvent: () => ({ kind: "accepted" }),
    },
  });
  const localFatal = await rendererPeer.input.sendState(state("keyboard.state", {
    down: ["NotAKey"],
  }));
  assert.equal(localFatal.kind, "terminal");
  assert.equal(localFatal.terminal.kind, "local-fatal");
  const mutation = subsystemRole();
  const mutationListener = mutation.manager.createListener({ frame: mutation.frame, channels: ["keyboard.event", "keyboard.state"] });
  let mutationCalls = 0;
  mutationListener.on("keyboard.state", () => { mutationCalls += 1; });
  mutationListener.on("keyboard.event", () => { mutationCalls += 1; });
  mutation.view.deliveryOpen = false;
  mutation.manager.onState(state());
  mutation.manager.onEvent(event());
  const unknownInterest = rendererRole();
  unknownInterest.gate.setControl(snapshot());
  unknownInterest.gate.updateState("keyboard.state", { down: [] });
  unknownInterest.gate.setAvailability("keyboard.state", true);
  unknownInterest.interest([frameInterest(["keyboard.state"], "unknown")]);
  await proveEach(prove, {
    "failure-malformed-json/invalid-schema/invalid-standard-payload/invalid-channel/hard-limit → retire Data": () => {
      assert.equal(malformedTerminal.kind, "protocol-fatal");
      assert.equal(localFatal.terminal.kind, "local-fatal");
    },
    "failure-stale-activation-state/event/reset → drop only": () => assert.equal(calls, 1),
    "failure-unknown-local-frame/not-interested → drop only": () => assert.equal(calls, 1),
    "failure-unknown-frame-interest → inert": () => assert.equal(unknownInterest.sent.length, 0),
    "failure-mutation-gate-state → retain/suppress per revision 2": () => assert.equal(mutationCalls, 0),
    "failure-mutation-gate-event → drop": () => assert.equal(mutationCalls, 0),
    "failure-business-handler → local containment": () => assert.ok(receiver.peer),
    "failure-data-retire-not-runtime-failure/frame-unwind": () => assert.equal(receiver.view.kind, "live"),
  });
});

registerCoverageAudit(groups);
