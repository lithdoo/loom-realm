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

qualify("wire-schema-limits-channel", "closed wire schema, byte/depth limits, and exact channel grammar", () => {
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
});

qualify("keyboard", "standard keyboard state/event payload matrix", () => {
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
});

qualify("pointer", "standard pointer state/event payload matrix", () => {
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
});

qualify("gamepad", "standard gamepad state/event payload matrix", () => {
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
});

qualify("custom", "custom channels remain bounded JSON objects with State/Event semantics", async () => {
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
  role.gate.setControl(snapshot({ revision: 2, target: null }));
  role.gate.emitEvent("x.demo.event", { marker: 3 });
  assert.equal(role.sent.filter(({ type }) => type === "input.event").length, 1);
});

qualify("interest-author-usage", "full Registry replacement, canonical limits, and atomic author updates", async () => {
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
});

qualify("lifetime-fresh-carrier", "Frame, Activation, and Data carrier lifetimes remain independent", async () => {
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
  first.gate.replaceInterest("demo", nextPeer, interest([
    frameInterest(["keyboard.event", "keyboard.state"]),
  ]));
  assert.equal(first.sent.at(-1).type, "input.state");
  first.gate.emitEvent("keyboard.event", { action: "up", code: "KeyA", repeat: false });
  await turn();
  assert.equal(first.sent.at(-1).type, "input.event");
});

qualify("authority", "Effective input is the conjunction of current authority facts", () => {
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
  for (const authority of invalidAuthorities) {
    const role = rendererRole();
    role.gate.updateState("keyboard.state", { down: [] });
    role.gate.setAvailability("keyboard.state", true);
    role.interest();
    role.gate.setControl(authority);
    assert.equal(role.sent.length, 0);
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
});

qualify("mutation-gate", "revision 2 retains State, drops Event, and converges only the current Activation", () => {
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
    else if (discard === "admin") candidate.manager.closeFrame("root");
    else if (discard === "terminal") candidate.manager.closeAll();
    else candidate.manager.setDataPeer(null);
    candidate.view.deliveryOpen = true;
    candidate.manager.mutationReopened("root", "a1");
    assert.equal(leaked, false, `${discard} must discard suppressed State`);
  }
});

qualify("state-event-reset", "State current truth, Event future-only, and Reset clearing", async () => {
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
});

qualify("barrier-backpressure", "causal ordering, global barriers, and finite publisher queues", async () => {
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
  bounded.gate.setControl(snapshot({ revision: 2, target: null }));
  bounded.gate.retireData("demo", bounded.peer);
  const retiredCount = bounded.sent.length;
  bounded.gate.emitEvent("x.load.event", { index: 999 });
  assert.equal(bounded.sent.length, retiredCount);
});

qualify("input-target-replacement", "lease revocation and same-carrier Reset ordering", async () => {
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
});

qualify("producer", "producer loss/return and authority epoch isolation", async () => {
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
  assert.equal(role.sent.filter(({ payload }) => payload?.down?.[0] === "KeyB").length, 0);
  role.gate.setAvailability("keyboard.state", true);
  assert.equal(role.sent.at(-1).frameId, "root");
});

qualify("listener", "listener union, retained baselines, snapshots, and business isolation", async () => {
  const role = subsystemRole();
  const first = role.manager.createListener({
    frame: role.frame,
    channels: ["keyboard.event", "keyboard.state"],
  });
  const second = role.manager.createListener({ frame: role.frame, channels: ["keyboard.state"] });
  const order = [];
  first.on("keyboard.state", () => { order.push(1); throw new Error("contained"); });
  second.on("keyboard.state", async () => { order.push(2); throw new Error("contained rejection"); });
  first.on("keyboard.state", () => { order.push(3); return new Promise(() => {}); });
  role.manager.onState(state("keyboard.state", { down: ["KeyA"] }));
  assert.deepEqual(order, [1, 2, 3]);
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
});

qualify("failure", "protocol-invalid retires Data while stale and business failures stay local", async () => {
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
});

registerCoverageAudit(groups);
