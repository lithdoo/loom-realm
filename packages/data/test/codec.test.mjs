import test from "node:test";
import assert from "node:assert/strict";
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

function hangingCarrier() {
  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  return {
    closed,
    async send() {},
    async *messages() {
      await closed;
    },
    async close() {
      resolveClosed({ kind: "closed" });
    },
  };
}

function inboundCarrier(units) {
  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  return {
    closed,
    async send() {},
    async *messages() {
      for (const unit of units) yield unit;
      await closed;
    },
    async close() {
      resolveClosed({ kind: "closed" });
    },
  };
}

function nested(depth) {
  let value = null;
  for (let i = 0; i < depth; i += 1) value = { a: value };
  return value;
}

test("unsorted interest frames are rejected without a canonicalizer", async () => {
  const carrier = hangingCarrier();
  const subsystem = createSubsystemDataPeer({
    binding: binding(carrier),
    handlers: subsystemHandlers,
  });
  const result = await subsystem.input.sendInterest({
    type: "input.interest",
    frames: [
      { frameId: "b", channels: ["x.demo.state"] },
      { frameId: "a", channels: ["x.demo.state"] },
    ],
  });
  assert.equal(result.kind, "terminal");
  assert.equal(result.terminal.kind, "local-fatal");
});

test("unsorted interest channels are rejected without a canonicalizer", async () => {
  const carrier = hangingCarrier();
  const subsystem = createSubsystemDataPeer({
    binding: binding(carrier),
    handlers: subsystemHandlers,
  });
  const result = await subsystem.input.sendInterest({
    type: "input.interest",
    frames: [{ frameId: "a", channels: ["x.z.state", "x.a.state"] }],
  });
  assert.equal(result.kind, "terminal");
  assert.equal(result.terminal.kind, "local-fatal");
});

test("canonical interest order is accepted", async () => {
  const carrier = hangingCarrier();
  const subsystem = createSubsystemDataPeer({
    binding: binding(carrier),
    handlers: subsystemHandlers,
  });
  const result = await subsystem.input.sendInterest({
    type: "input.interest",
    frames: [
      { frameId: "a", channels: ["keyboard.state", "x.demo.state"] },
      { frameId: "b", channels: ["x.a.event"] },
    ],
  });
  assert.deepEqual(result, { kind: "sent" });
  await subsystem.close();
});

test("KeyboardCode runtime acceptance uses the frozen finite set", async () => {
  const carrier = hangingCarrier();
  const renderer = createRendererDataPeer({
    binding: binding(carrier),
    handlers: rendererHandlers,
  });
  const valid = await renderer.input.sendState({
    type: "input.state",
    frameId: "f1",
    activationId: "a1",
    channel: "keyboard.state",
    payload: { down: ["Digit0", "KeyA"] },
  });
  assert.deepEqual(valid, { kind: "sent" });
  const invalid = await renderer.input.sendEvent({
    type: "input.event",
    frameId: "f1",
    activationId: "a1",
    channel: "keyboard.event",
    payload: { action: "down", code: "NotAKey", repeat: false },
  });
  assert.equal(invalid.kind, "terminal");
  assert.equal(invalid.terminal.kind, "local-fatal");
});

test("unknown type fail-closes the current Data peer", async () => {
  const carrier = inboundCarrier([JSON.stringify({ type: "input.unknown" })]);
  const subsystem = createSubsystemDataPeer({
    binding: binding(carrier),
    handlers: subsystemHandlers,
  });
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "input");
});

test("message larger than 1 MiB fail-closes as profile protocol-fatal", async () => {
  const carrier = inboundCarrier(["a".repeat(1_048_577)]);
  const subsystem = createSubsystemDataPeer({
    binding: binding(carrier),
    handlers: subsystemHandlers,
  });
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "profile");
});

test("JSON depth greater than 64 fail-closes as profile protocol-fatal", async () => {
  const carrier = inboundCarrier([JSON.stringify(nested(65))]);
  const subsystem = createSubsystemDataPeer({
    binding: binding(carrier),
    handlers: subsystemHandlers,
  });
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "profile");
});
