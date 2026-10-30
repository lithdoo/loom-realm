import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V3,
} from "../dist/index.js";

const accepted = () => ({ kind: "accepted" });
const binding = (carrier) => ({
  carrier,
  subsystemKey: "map",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V3,
});
const subsystemHandlers = {
  onViewportState: accepted,
};
const rendererHandlers = {
  onRenderDomains: accepted,
  onRenderSnapshot: accepted,
  onRenderPatch: accepted,
  onRenderEvent: accepted,
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const viewport = (width, height) => ({ type: "viewport.state", width, height });
const presentationEvent = () => ({
  type: "presentation.event",
  sourceSubsystemKey: "map",
  domainId: "map",
  targetKey: "root",
  frameId: "root",
  activationId: "a1",
  channel: "x.viewport.concurrent",
  name: "viewport-concurrent",
  data: {},
});

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

test("unknown viewport.* type is protocol-fatal profile", async () => {
  const pair = createMemoryCarrierPair();
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: subsystemHandlers,
  });
  await pair.right.send(JSON.stringify({ type: "viewport.reset", width: 1, height: 1 }));
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "profile");
});

test("unknown viewport.foo type is protocol-fatal profile", async () => {
  const pair = createMemoryCarrierPair();
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: subsystemHandlers,
  });
  await pair.right.send(JSON.stringify({ type: "viewport.foo" }));
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "profile");
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

test("fractional viewport dimensions fail the call without retiring Data", async () => {
  const carrier = createWriterCarrier();
  const renderer = createRendererDataPeer({
    binding: binding(carrier),
    handlers: rendererHandlers,
  });
  assert.throws(() => renderer.viewport.sendState(viewport(640.9, 480)), /positive safe integer/);
  assert.equal(carrier.sent.length, 0);
  assert.deepEqual(await renderer.viewport.sendState(viewport(640, 480)), { kind: "sent" });
  await renderer.close();
});

test("same-size invalid viewport input is validated before idle deduplication", async () => {
  const carrier = createWriterCarrier();
  const renderer = createRendererDataPeer({
    binding: binding(carrier),
    handlers: rendererHandlers,
  });
  assert.deepEqual(await renderer.viewport.sendState(viewport(640, 480)), { kind: "sent" });

  assert.throws(() => renderer.viewport.sendState({
    type: "viewport.state",
    width: 640,
    height: 480,
    extra: true,
  }), /unknown member/);
  assert.deepEqual(carrier.sent.map((text) => JSON.parse(text)), [viewport(640, 480)]);
  await renderer.close();
});

test("invalid viewport input fails locally without disturbing pending-latest", async () => {
  const carrier = createWriterCarrier();
  carrier.holdSend();
  const renderer = createRendererDataPeer({
    binding: binding(carrier),
    handlers: rendererHandlers,
  });
  const first = renderer.viewport.sendState(viewport(640, 480));
  await waitFor(() => carrier.maxActive === 1);
  const pending = renderer.viewport.sendState(viewport(800, 600));

  assert.throws(() => renderer.viewport.sendState({
      type: "viewport.state",
      width: 640,
      height: 480,
      extra: true,
    }), /unknown member/);
  assert.deepEqual(carrier.sent, []);

  carrier.releaseSend();
  const firstResult = await first;
  const pendingResult = await pending;
  assert.equal(firstResult.kind, "sent");
  assert.equal(pendingResult.kind, "sent");
  assert.deepEqual(carrier.sent.map((text) => JSON.parse(text)), [viewport(640, 480), viewport(800, 600)]);
  await renderer.close();
});

test("sendState rejects exotic invalid objects synchronously without retiring Data", async (t) => {
  const cases = [
    {
      name: "throwing getter",
      create() {
        let getterHits = 0;
        const message = { type: "viewport.state", height: 480 };
        Object.defineProperty(message, "width", {
          enumerable: true,
          get() {
            getterHits += 1;
            throw new Error("width getter boom");
          },
        });
        return { message, verify: () => assert.equal(getterHits, 0) };
      },
    },
    {
      name: "throwing Proxy ownKeys trap",
      create() {
        const message = new Proxy(viewport(640, 480), {
          ownKeys() {
            throw new Error("ownKeys boom");
          },
        });
        return { message, verify: () => {} };
      },
    },
    {
      name: "inherited dimensions",
      create() {
        const message = Object.create({ width: 640, height: 480 });
        message.type = "viewport.state";
        return { message, verify: () => {} };
      },
    },
    {
      name: "symbol own property",
      create() {
        const message = viewport(640, 480);
        message[Symbol("extra")] = true;
        return { message, verify: () => {} };
      },
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const carrier = createWriterCarrier();
      const renderer = createRendererDataPeer({
        binding: binding(carrier),
        handlers: rendererHandlers,
      });
      const { message, verify } = entry.create();
      assert.throws(() => renderer.viewport.sendState(message));
      assert.equal(carrier.sent.length, 0);
      verify();
      assert.deepEqual(await renderer.viewport.sendState(viewport(640, 480)), { kind: "sent" });
      await renderer.close();
    });
  }

  await t.test("throwing Proxy get trap propagates from the authoring call", async () => {
    let getHits = 0;
    const message = new Proxy(viewport(640, 480), {
      get(target, property, receiver) {
        if (property === "width") {
          getHits += 1;
          throw new Error("get boom");
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const carrier = createWriterCarrier();
    const renderer = createRendererDataPeer({
      binding: binding(carrier),
      handlers: rendererHandlers,
    });
    assert.throws(() => renderer.viewport.sendState(message), /get boom/);
    assert.ok(getHits >= 1);
    assert.deepEqual(carrier.sent, []);
    assert.deepEqual(await renderer.viewport.sendState(viewport(640, 480)), { kind: "sent" });
    await renderer.close();
  });
});

test("blocked writer converges A to B to A without emitting the canceled B", async () => {
  const carrier = createWriterCarrier();
  carrier.holdSend();
  const renderer = createRendererDataPeer({
    binding: binding(carrier),
    handlers: rendererHandlers,
  });
  const a = renderer.viewport.sendState(viewport(640, 480));
  await waitFor(() => carrier.maxActive === 1);
  const b = renderer.viewport.sendState(viewport(800, 600));
  const backToA = renderer.viewport.sendState(viewport(640, 480));
  carrier.releaseSend();

  const outcomes = await Promise.all([a, b, backToA]);
  assert.ok(outcomes.every((outcome) => outcome.kind === "sent"));
  assert.deepEqual(carrier.sent.map((text) => JSON.parse(text)), [viewport(640, 480)]);
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
  const concurrent = renderer.presentation.sendEvent(presentationEvent());
  await tick();
  assert.equal(carrier.maxActive, 1);
  carrier.releaseSend();
  const [firstResult, concurrentResult, ...burstResults] = await Promise.all([
    first,
    concurrent,
    ...burst,
  ]);
  assert.equal(firstResult.kind, "sent");
  assert.equal(concurrentResult.kind, "sent");
  assert.ok(burstResults.every((result) => result.kind === "sent"));
  const parsed = carrier.sent.map((text) => JSON.parse(text));
  const types = parsed.map((message) => message.type);
  assert.equal(types.filter((type) => type === "viewport.state").length, 2);
  const viewports = parsed.filter((message) => message.type === "viewport.state");
  assert.deepEqual(viewports[0], viewport(320, 240));
  assert.deepEqual(viewports[1], viewport(1200, 480));
  assert.equal(types.filter((type) => type === "presentation.event").length, 1);
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

test("same-size sendState after terminal does not return a synthetic sent", async () => {
  const carrier = createWriterCarrier();
  const renderer = createRendererDataPeer({
    binding: binding(carrier),
    handlers: rendererHandlers,
  });
  assert.deepEqual(await renderer.viewport.sendState(viewport(640, 480)), { kind: "sent" });
  await renderer.close();
  const same = await renderer.viewport.sendState(viewport(640, 480));
  const next = await renderer.viewport.sendState(viewport(800, 600));
  assert.equal(same.kind, "terminal");
  assert.equal(next.kind, "terminal");
  assert.equal(same.terminal.kind, "carrier-closed");
  assert.equal(next.terminal.kind, "carrier-closed");
  assert.equal(carrier.sent.length, 1);
});

test("pending viewport waiters settle exactly once when the carrier terminals", async () => {
  const carrier = createWriterCarrier();
  carrier.holdSend();
  const renderer = createRendererDataPeer({
    binding: binding(carrier),
    handlers: rendererHandlers,
  });
  const first = renderer.viewport.sendState(viewport(320, 240));
  await waitFor(() => carrier.maxActive === 1);
  const pending = renderer.viewport.sendState(viewport(800, 600));
  const late = renderer.viewport.sendState(viewport(1024, 768));
  const seen = [];
  const track = (promise, label) => promise.then((outcome) => {
    seen.push(label);
    return outcome;
  });
  const firstTracked = track(first, "first");
  const pendingTracked = track(pending, "pending");
  const lateTracked = track(late, "late");
  await renderer.close();
  const [pendingResult, lateResult] = await Promise.all([pendingTracked, lateTracked]);
  carrier.releaseSend();
  const firstResult = await firstTracked;
  assert.equal(pendingResult.kind, "terminal");
  assert.equal(lateResult.kind, "terminal");
  assert.equal(pendingResult.terminal, lateResult.terminal);
  assert.ok(firstResult.kind === "sent" || firstResult.kind === "terminal");
  assert.deepEqual([...seen].sort(), ["first", "late", "pending"].sort());
  assert.equal(seen.filter((label) => label === "pending").length, 1);
  assert.equal(seen.filter((label) => label === "late").length, 1);
});
