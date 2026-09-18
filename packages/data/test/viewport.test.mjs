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
const tick = () => new Promise((resolve) => setImmediate(resolve));
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

test("V-04/P3-02: recognized viewport schema/direction â†?viewport; invalid JSON/unknown â†?profile; local invalid â†?local-fatal", async () => {
  {
    const pair = createMemoryCarrierPair();
    const seen = [];
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: {
        ...subsystemHandlers,
        onViewportState(message) {
          seen.push(message);
          return accepted();
        },
      },
    });
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: rendererHandlers,
    });
    renderer.viewport.publishState({ type: "viewport.state", width: 640, height: 480 });
    await tick();
    assert.deepEqual(seen, [{ type: "viewport.state", width: 640, height: 480 }]);
    await subsystem.close();
    await renderer.close();
  }

  {
    const pair = createMemoryCarrierPair();
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: subsystemHandlers,
    });
    await pair.right.send(JSON.stringify({ type: "viewport.state", width: 0, height: 480 }));
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "viewport");
  }

  {
    const pair = createMemoryCarrierPair();
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: subsystemHandlers,
    });
    await pair.right.send('{"type":"viewport.state","width":NaN,"height":480}');
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "profile");
  }

  {
    const pair = createMemoryCarrierPair();
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: subsystemHandlers,
    });
    await pair.right.send(JSON.stringify({ type: "viewport.foo", width: 1, height: 1 }));
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "profile");
  }

  {
    const pair = createMemoryCarrierPair();
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: rendererHandlers,
    });
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: subsystemHandlers,
    });
    await pair.left.send(JSON.stringify({ type: "viewport.state", width: 10, height: 10 }));
    const terminal = await renderer.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "viewport");
    await subsystem.close();
  }

  {
    const pair = createMemoryCarrierPair();
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: rendererHandlers,
    });
    renderer.viewport.publishState({ type: "viewport.state", width: -1, height: 10 });
    const terminal = await renderer.terminal;
    assert.equal(terminal.kind, "local-fatal");
  }
});

test("V-05: Aâ†’Bâ†’A while inFlight cancels B and does not resend A", async () => {
  const sent = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const carrier = {
    closed,
    async send(text) {
      sent.push(JSON.parse(text));
      await gate;
    },
    messages() { return { async *[Symbol.asyncIterator]() { await closed; } }; },
    async close() { resolveClosed({ kind: "closed" }); },
  };
  const renderer = createRendererDataPeer({
    binding: binding(carrier),
    handlers: rendererHandlers,
  });
  renderer.viewport.publishState({ type: "viewport.state", width: 100, height: 100 });
  await tick();
  assert.equal(sent.length, 1);
  renderer.viewport.publishState({ type: "viewport.state", width: 200, height: 200 });
  renderer.viewport.publishState({ type: "viewport.state", width: 100, height: 100 });
  release();
  await tick();
  await tick();
  assert.deepEqual(sent, [{ type: "viewport.state", width: 100, height: 100 }]);
  await renderer.close();
});

test("V-06/P3-05: admitted FIFO, pending latest, burst coalesce, concurrent Input ok", async () => {
  const sent = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  let active = 0;
  let maxActive = 0;
  const carrier = {
    closed,
    async send(text) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      sent.push(JSON.parse(text));
      if (sent.length === 1) await firstGate;
      active -= 1;
    },
    messages() { return { async *[Symbol.asyncIterator]() { await closed; } }; },
    async close() { resolveClosed({ kind: "closed" }); },
  };
  const renderer = createRendererDataPeer({
    binding: binding(carrier),
    handlers: rendererHandlers,
  });
  renderer.viewport.publishState({ type: "viewport.state", width: 1, height: 1 });
  await tick();
  for (let i = 2; i <= 10000; i += 1) {
    renderer.viewport.publishState({ type: "viewport.state", width: i, height: i });
  }
  const inputPromise = renderer.input.sendState({
    type: "input.state",
    frameId: "f1",
    activationId: "a1",
    channel: "x.demo.state",
    payload: { v: 1 },
  });
  releaseFirst();
  assert.deepEqual(await inputPromise, { kind: "sent" });
  for (let i = 0; i < 50; i += 1) await tick();
  assert.equal(maxActive, 1);
  assert.equal(sent[0].type, "viewport.state");
  assert.equal(sent[0].width, 1);
  const lastViewport = [...sent].reverse().find((m) => m.type === "viewport.state");
  assert.deepEqual(lastViewport, { type: "viewport.state", width: 10000, height: 10000 });
  assert.ok(sent.some((m) => m.type === "input.state"));
  assert.ok(sent.length < 20);
  await renderer.close();
});

test("V-07: terminal/retire fences old settle; fresh peer has independent baseline", async () => {
  const pair1 = createMemoryCarrierPair();
  const seen1 = [];
  const subsystem1 = createSubsystemDataPeer({
    binding: binding(pair1.left),
    handlers: {
      ...subsystemHandlers,
      onViewportState(message) { seen1.push(message); return accepted(); },
    },
  });
  const renderer1 = createRendererDataPeer({
    binding: binding(pair1.right),
    handlers: rendererHandlers,
  });
  renderer1.viewport.publishState({ type: "viewport.state", width: 10, height: 10 });
  await tick();
  await renderer1.close();
  await subsystem1.terminal;

  const pair2 = createMemoryCarrierPair();
  const seen2 = [];
  const subsystem2 = createSubsystemDataPeer({
    binding: binding(pair2.left),
    handlers: {
      ...subsystemHandlers,
      onViewportState(message) { seen2.push(message); return accepted(); },
    },
  });
  const renderer2 = createRendererDataPeer({
    binding: binding(pair2.right),
    handlers: rendererHandlers,
  });
  renderer2.viewport.publishState({ type: "viewport.state", width: 10, height: 10 });
  await tick();
  assert.deepEqual(seen2, [{ type: "viewport.state", width: 10, height: 10 }]);
  await renderer2.close();
  await subsystem2.close();
});

test("P3-01: viewport.state only Rendererâ†’Subsystem; reverse is viewport fatal", async () => {
  const pair = createMemoryCarrierPair();
  const renderer = createRendererDataPeer({
    binding: binding(pair.right),
    handlers: rendererHandlers,
  });
  await pair.left.send(JSON.stringify({ type: "viewport.state", width: 1, height: 1 }));
  const terminal = await renderer.terminal;
  assert.equal(terminal.protocol, "viewport");
});

test("C-01: publishState exact-own validation; getter/Proxy never sync-leak", async () => {
  {
    const pair = createMemoryCarrierPair();
    const seen = [];
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: {
        ...subsystemHandlers,
        onViewportState(message) { seen.push(message); return accepted(); },
      },
    });
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: rendererHandlers,
    });
    renderer.viewport.publishState({ type: "viewport.state", width: 640, height: 480 });
    await tick();
    assert.deepEqual(seen, [{ type: "viewport.state", width: 640, height: 480 }]);
    renderer.viewport.publishState({ type: "viewport.state", width: 640, height: 480 });
    await tick();
    assert.equal(seen.length, 1);
    await renderer.close();
    await subsystem.close();
  }

  {
    const pair = createMemoryCarrierPair();
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: rendererHandlers,
    });
    assert.doesNotThrow(() => {
      renderer.viewport.publishState({ type: "viewport.state", width: 640, height: 480, extra: 1 });
    });
    const terminal = await renderer.terminal;
    assert.equal(terminal.kind, "local-fatal");
  }

  {
    const pair = createMemoryCarrierPair();
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: rendererHandlers,
    });
    const inherited = Object.create({ width: 640, height: 480 });
    inherited.type = "viewport.state";
    inherited.noise = true;
    assert.doesNotThrow(() => renderer.viewport.publishState(inherited));
    const terminal = await renderer.terminal;
    assert.equal(terminal.kind, "local-fatal");
  }

  {
    const pair = createMemoryCarrierPair();
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: rendererHandlers,
    });
    const withGetter = { type: "viewport.state", height: 480 };
    Object.defineProperty(withGetter, "width", {
      enumerable: true,
      configurable: true,
      get() { throw new Error("width getter boom"); },
    });
    assert.doesNotThrow(() => renderer.viewport.publishState(withGetter));
    const terminal = await renderer.terminal;
    assert.equal(terminal.kind, "local-fatal");
  }

  {
    const pair = createMemoryCarrierPair();
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: rendererHandlers,
    });
    const proxy = new Proxy(
      { type: "viewport.state", width: 640, height: 480 },
      {
        get(_t, prop) {
          if (prop === "width") throw new Error("proxy width trap");
          return Reflect.get(_t, prop);
        },
        ownKeys(t) { return Reflect.ownKeys(t); },
        getOwnPropertyDescriptor(t, p) { return Reflect.getOwnPropertyDescriptor(t, p); },
      },
    );
    assert.doesNotThrow(() => renderer.viewport.publishState(proxy));
    const terminal = await renderer.terminal;
    assert.equal(terminal.kind, "local-fatal");
  }
});

test("C-01: invalid while inFlight/idle same-size cannot be swallowed", async () => {
  {
    const sent = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let resolveClosed;
    const closed = new Promise((resolve) => { resolveClosed = resolve; });
    const carrier = {
      closed,
      async send(text) {
        sent.push(JSON.parse(text));
        await gate;
      },
      messages() { return { async *[Symbol.asyncIterator]() { await closed; } }; },
      async close() { resolveClosed({ kind: "closed" }); },
    };
    const renderer = createRendererDataPeer({
      binding: binding(carrier),
      handlers: rendererHandlers,
    });
    renderer.viewport.publishState({ type: "viewport.state", width: 100, height: 100 });
    await tick();
    assert.equal(sent.length, 1);
    assert.doesNotThrow(() => {
      renderer.viewport.publishState({ type: "viewport.state", width: 200, height: 200, extra: 1 });
    });
    renderer.viewport.publishState({ type: "viewport.state", width: 300, height: 300 });
    release();
    const terminal = await renderer.terminal;
    assert.equal(terminal.kind, "local-fatal");
    assert.equal(sent.every((m) => m.type === "viewport.state" && m.width > 0 && !("extra" in m)), true);
    assert.ok(sent.length <= 2);
  }

  {
    const pair = createMemoryCarrierPair();
    const seen = [];
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: {
        ...subsystemHandlers,
        onViewportState(message) { seen.push(message); return accepted(); },
      },
    });
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: rendererHandlers,
    });
    renderer.viewport.publishState({ type: "viewport.state", width: 640, height: 480 });
    await tick();
    assert.equal(seen.length, 1);
    assert.doesNotThrow(() => {
      const sameSizedInvalid = { type: "viewport.state", width: 640, height: 480, extra: 1 };
      renderer.viewport.publishState(sameSizedInvalid);
    });
    const terminal = await renderer.terminal;
    assert.equal(terminal.kind, "local-fatal");
    assert.equal(seen.length, 1);
    await subsystem.close();
  }
});
