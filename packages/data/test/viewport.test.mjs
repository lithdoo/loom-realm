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
  onViewportState: accepted,
};
const rendererHandlers = {
  onInputInterest: accepted,
  onRenderDomains: accepted,
  onRenderSnapshot: accepted,
  onRenderPatch: accepted,
  onRenderEvent: accepted,
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const viewport = (width, height) => ({ type: "viewport.state", width, height });

async function waitFor(predicate) {
  for (let i = 0; i < 80; i += 1) {
    if (predicate()) return;
    await tick();
  }
  throw new Error("timed out waiting for viewport condition");
}

function createWriterCarrier() {
  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  const sent = [];
  let active = 0;
  let maxActive = 0;
  let sendGate = Promise.resolve();
  let releaseSend = () => {};
  const carrier = {
    closed,
    sent,
    get maxActive() {
      return maxActive;
    },
    holdSend() {
      sendGate = new Promise((resolve) => {
        releaseSend = resolve;
      });
    },
    releaseSend() {
      releaseSend();
      sendGate = Promise.resolve();
    },
    async send(text) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sendGate;
      sent.push(text);
      active -= 1;
    },
    async *messages() {
      await closed;
    },
    async close() {
      resolveClosed({ kind: "closed" });
    },
  };
  return carrier;
}

test("viewport.state round-trips Renderer to Subsystem over the shared profile", async () => {
  const pair = createMemoryCarrierPair();
  const seen = [];
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: {
      ...subsystemHandlers,
      onViewportState(message) {
        seen.push([message.width, message.height]);
        return accepted();
      },
    },
  });
  const renderer = createRendererDataPeer({
    binding: binding(pair.right),
    handlers: rendererHandlers,
  });
  assert.deepEqual(await renderer.viewport.sendState(viewport(640, 480)), { kind: "sent" });
  await tick();
  assert.deepEqual(seen, [[640, 480]]);
  await renderer.close();
  await subsystem.terminal;
});

test("recognized invalid viewport.state is protocol-fatal viewport with no handler effect", async () => {
  const pair = createMemoryCarrierPair();
  let calls = 0;
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: {
      ...subsystemHandlers,
      onViewportState() {
        calls += 1;
        return accepted();
      },
    },
  });
  await pair.right.send(JSON.stringify({ type: "viewport.state", width: 0, height: 480 }));
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "viewport");
  assert.equal(calls, 0);
});

test("unknown viewport.* type is protocol-fatal viewport", async () => {
  const pair = createMemoryCarrierPair();
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: subsystemHandlers,
  });
  await pair.right.send(JSON.stringify({ type: "viewport.reset", width: 1, height: 1 }));
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "viewport");
});

test("wrong-direction viewport.state fails as viewport protocol-fatal", async () => {
  const pair = createMemoryCarrierPair();
  const renderer = createRendererDataPeer({
    binding: binding(pair.right),
    handlers: rendererHandlers,
  });
  await pair.left.send(JSON.stringify(viewport(800, 600)));
  const terminal = await renderer.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "viewport");
});

test("extra viewport fields fail closed as viewport without mutation", async () => {
  const pair = createMemoryCarrierPair();
  let calls = 0;
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: {
      ...subsystemHandlers,
      onViewportState() {
        calls += 1;
        return accepted();
      },
    },
  });
  await pair.right.send(JSON.stringify({ type: "viewport.state", width: 640, height: 480, dpr: 2 }));
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "viewport");
  assert.equal(calls, 0);
});

test("fractional viewport dimensions are local-fatal and emit zero bytes", async () => {
  const carrier = createWriterCarrier();
  const renderer = createRendererDataPeer({
    binding: binding(carrier),
    handlers: rendererHandlers,
  });
  const result = await renderer.viewport.sendState(viewport(640.9, 480));
  assert.equal(result.kind, "terminal");
  assert.equal(result.terminal.kind, "local-fatal");
  assert.equal(carrier.sent.length, 0);
  await renderer.close();
});

test("blocked writer coalesces a resize burst to one in-flight and one pending latest", async () => {
  const carrier = createWriterCarrier();
  carrier.holdSend();
  const renderer = createRendererDataPeer({
    binding: binding(carrier),
    handlers: rendererHandlers,
  });
  const first = renderer.viewport.sendState(viewport(320, 240));
  await waitFor(() => carrier.maxActive === 1);
  const burst = [];
  for (let width = 1; width <= 1200; width += 1) {
    burst.push(renderer.viewport.sendState(viewport(width, 480)));
  }
  const reset = renderer.input.sendReset({
    type: "input.reset",
    frameId: "f1",
    activationId: "a1",
  });
  await tick();
  assert.equal(carrier.maxActive, 1);
  carrier.releaseSend();
  const [firstResult, resetResult, ...burstResults] = await Promise.all([first, reset, ...burst]);
  assert.equal(firstResult.kind, "sent");
  assert.equal(resetResult.kind, "sent");
  assert.ok(burstResults.every((result) => result.kind === "sent"));
  const parsed = carrier.sent.map((text) => JSON.parse(text));
  const types = parsed.map((message) => message.type);
  assert.equal(types.filter((type) => type === "viewport.state").length, 2);
  assert.equal(types.filter((type) => type === "input.reset").length, 1);
  const viewports = parsed.filter((message) => message.type === "viewport.state");
  assert.deepEqual(viewports[0], viewport(320, 240));
  assert.deepEqual(viewports[1], viewport(1200, 480));
  assert.ok(types.indexOf("input.reset") > 0);
  await renderer.close();
});

test("fresh renderer peer does not inherit the previous carrier viewport cursor", async () => {
  const firstCarrier = createWriterCarrier();
  const first = createRendererDataPeer({
    binding: binding(firstCarrier),
    handlers: rendererHandlers,
  });
  assert.deepEqual(await first.viewport.sendState(viewport(640, 480)), { kind: "sent" });
  await first.close();

  const secondCarrier = createWriterCarrier();
  const second = createRendererDataPeer({
    binding: binding(secondCarrier),
    handlers: rendererHandlers,
  });
  assert.deepEqual(await second.viewport.sendState(viewport(640, 480)), { kind: "sent" });
  assert.deepEqual(
    secondCarrier.sent.map((text) => JSON.parse(text)),
    [viewport(640, 480)],
  );
  await second.close();
});
