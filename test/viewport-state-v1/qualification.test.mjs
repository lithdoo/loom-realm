import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V1,
} from "../../packages/data/dist/index.js";
import { ViewportManager } from "../../packages/subsystem/dist/internal/viewport-manager.js";
import {
  createMainRendererControlPeer,
  prepareRendererHelloResultV1,
} from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "../../packages/renderer/dist/index.js";
import { createDesktopRendererViewportSource } from "../../apps/desktop/dist/renderer-viewport-source.js";
import { qualify, registerCoverageAudit } from "./helpers/qualification.mjs";

const accepted = () => ({ kind: "accepted" });
const binding = (carrier, generation = 1) => ({
  carrier,
  subsystemKey: "demo",
  generation,
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
const viewport = (width, height) => ({ type: "viewport.state", width, height });
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

function createWriterCarrier() {
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const sent = [];
  let active = 0;
  let maxActive = 0;
  let sendGate = Promise.resolve();
  let releaseSend = () => {};
  return {
    closed,
    sent,
    get maxActive() { return maxActive; },
    holdSend() { sendGate = new Promise((resolve) => { releaseSend = resolve; }); },
    releaseSend() { releaseSend(); sendGate = Promise.resolve(); },
    async send(text) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sendGate;
      sent.push(text);
      active -= 1;
    },
    async *messages() { await closed; },
    async close() { resolveClosed({ kind: "closed" }); },
  };
}

const authority = {
  subsystemKey: "demo",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V1,
};
const inputTarget = Object.freeze({
  subsystemKey: "demo",
  frameId: "root",
  activationId: "a1",
});
const snapshot = (sessionId, revision, generation = 1) => ({
  sessionId,
  revision,
  runtimes: [{ subsystemKey: "demo", state: "ready" }],
  stack: [{ frameId: "root", subsystemKey: "demo", lifecycle: "active", activationId: "a1" }],
  inputTarget,
  dataAuthorities: [{ ...authority, generation }],
});

function main(pair, sessionId) {
  return createMainRendererControlPeer({
    carrier: pair.left,
    acceptHello() {
      const initial = snapshot(sessionId, 1);
      return {
        kind: "accepted",
        snapshot: initial,
        preparedHelloText: prepareRendererHelloResultV1(initial),
      };
    },
  });
}

class Events {
  listeners = new Map();
  addEventListener = (name, listener) => {
    const values = this.listeners.get(name) ?? new Set();
    values.add(listener);
    this.listeners.set(name, values);
  };
  removeEventListener = (name, listener) => this.listeners.get(name)?.delete(listener);
  dispatch(name, event = {}) {
    for (const listener of this.listeners.get(name) ?? []) listener({ type: name, ...event });
  }
}

function fakeWindow() {
  const events = new Events();
  const document = new Events();
  document.visibilityState = "visible";
  let nextFrame = 0;
  const frames = new Map();
  return {
    ...events,
    document,
    innerWidth: 640.9,
    innerHeight: 480.2,
    devicePixelRatio: 1,
    requestAnimationFrame(callback) {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
    dispatch: events.dispatch.bind(events),
    runFrame() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    },
  };
}

qualify("wire-schema", "exact Viewport State v1 representation and diagnostics", async ({ prove }) => {
  await prove("exact-viewport-state-fields", async () => {
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
    assert.deepEqual(await renderer.viewport.sendState(viewport(640, 480)), { kind: "sent" });
    await tick();
    assert.deepEqual(seen, [viewport(640, 480)]);
    await renderer.close();
    await subsystem.terminal;
  });

  await prove("positive-safe-integer-dimensions", async () => {
    const carrier = createWriterCarrier();
    const renderer = createRendererDataPeer({
      binding: binding(carrier),
      handlers: rendererHandlers,
    });
    assert.deepEqual(await renderer.viewport.sendState(viewport(1, 1)), { kind: "sent" });
    await renderer.close();
  });

  await prove("extra-fields-fatal", async () => {
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

  await prove("zero-height-fatal", async () => {
    const pair = createMemoryCarrierPair();
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: subsystemHandlers,
    });
    await pair.right.send(JSON.stringify(viewport(640, 0)));
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "viewport");
  });

  await prove("fraction-local-fatal", async () => {
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

  await prove("wrong-direction-fatal", async () => {
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

  await prove("unknown-viewport-star-fatal", async () => {
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

  await prove("recognized-invalid-protocol-viewport", async () => {
    const pair = createMemoryCarrierPair();
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: subsystemHandlers,
    });
    await pair.right.send(JSON.stringify({ type: "viewport.state", width: -1, height: 480 }));
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "viewport");
  });
});

qualify("retained-api", "Runtime-scoped readonly Viewport callback contract", async ({ prove }) => {
  await prove([
    "start-current-null",
    "subscribe-sync-null",
    "getter-before-callback",
    "duplicate-size-suppress",
    "later-subscribe-sync-current",
    "snapshot-immutable",
    "listener-throw-isolated",
    "listener-rejection-isolated",
    "unsubscribe-idempotent",
    "post-terminal-subscribe-inert",
  ], async () => {
    const manager = new ViewportManager();
    assert.equal(manager.current, null);
    const seen = [];
    const unsubscribe = manager.subscribe((value) => {
      seen.push({ value, current: manager.current });
      if (value?.width === 640) throw new Error("sync");
      if (value?.width === 800) return Promise.reject(new Error("async"));
    });
    assert.deepEqual(seen, [{ value: null, current: null }]);
    manager.accept(viewport(640, 480));
    assert.equal(seen.length, 2);
    assert.equal(seen[1].current.width, 640);
    manager.accept(viewport(640, 480));
    assert.equal(seen.length, 2);
    manager.accept(viewport(800, 600));
    await tick();
    assert.equal(seen.length, 3);
    assert.throws(() => { seen[2].value.width = 1; });
    const late = [];
    manager.subscribe((value) => late.push(value));
    assert.deepEqual(late, [{ width: 800, height: 600 }]);
    unsubscribe();
    unsubscribe();
    manager.accept(viewport(1024, 768));
    assert.equal(seen.length, 3);
    manager.terminate();
    const after = [];
    const stop = manager.subscribe((value) => after.push(value));
    stop();
    stop();
    assert.deepEqual(after, []);
  });
});

qualify("bounded-publisher", "blocked writer coalesces viewport latest without starving Input", async ({ prove }) => {
  await prove([
    "blocked-writer-one-inflight-one-pending",
    "resize-burst-gt-1024-latest-converges",
    "interleaved-input-survives-burst",
  ], async () => {
    const carrier = createWriterCarrier();
    carrier.holdSend();
    const renderer = createRendererDataPeer({
      binding: binding(carrier),
      handlers: rendererHandlers,
    });
    const first = renderer.viewport.sendState(viewport(320, 240));
    await waitFor(() => carrier.maxActive === 1, "in-flight");
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
    await renderer.close();
  });
});

qualify("lifetime", "fresh carrier, fresh Renderer, and terminal fencing", async ({ prove }) => {
  await prove("no-synthetic-wire-without-observation", async () => {
    const control = createMemoryCarrierPair();
    const publisher = main(control, "a");
    const received = [];
    const holder = createRendererControlHolder({
      async acquire() {
        const pair = createMemoryCarrierPair();
        createSubsystemDataPeer({
          binding: binding(pair.left),
          handlers: {
            ...subsystemHandlers,
            onViewportState(message) {
              received.push(message);
              return accepted();
            },
          },
        });
        return pair.right;
      },
    }, undefined, {
      start(emit) {
        emit({ width: 0, height: 0 });
        return () => {};
      },
    });
    await holder.connect({ carrier: control.right, rendererControlToken: "a" });
    await tick();
    await tick();
    assert.deepEqual(received, []);
    publisher.retire();
  });

  await prove("first-legal-sends-once", async () => {
    const control = createMemoryCarrierPair();
    const publisher = main(control, "a");
    const received = [];
    const holder = createRendererControlHolder({
      async acquire() {
        const pair = createMemoryCarrierPair();
        createSubsystemDataPeer({
          binding: binding(pair.left),
          handlers: {
            ...subsystemHandlers,
            onViewportState(message) {
              received.push(message);
              return accepted();
            },
          },
        });
        return pair.right;
      },
    }, undefined, {
      start(emit) {
        emit({ width: 640.9, height: 480.4 });
        return () => {};
      },
    });
    await holder.connect({ carrier: control.right, rendererControlToken: "a" });
    await waitFor(() => received.length === 1, "first legal");
    assert.deepEqual(received, [viewport(640, 480)]);
    publisher.retire();
  });

  await prove("same-generation-fresh-carrier-baseline", async () => {
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
    assert.deepEqual(secondCarrier.sent.map((text) => JSON.parse(text)), [viewport(640, 480)]);
    await second.close();
  });

  await prove("fresh-renderer-fences-old-source", async () => {
    const emits = [];
    const received = [];
    let starts = 0;
    const holder = createRendererControlHolder({
      async acquire(_key, generation) {
        const pair = createMemoryCarrierPair();
        createSubsystemDataPeer({
          binding: binding(pair.left, generation),
          handlers: {
            ...subsystemHandlers,
            onViewportState(message) {
              received.push(message);
              return accepted();
            },
          },
        });
        return pair.right;
      },
    }, undefined, {
      start(emit) {
        starts += 1;
        emits.push(emit);
        emit({ width: 640, height: 480 });
        return () => {};
      },
    });
    const a = createMemoryCarrierPair();
    main(a, "a");
    await holder.connect({ carrier: a.right, rendererControlToken: "a" });
    await waitFor(() => received.length === 1, "A");
    const b = createMemoryCarrierPair();
    main(b, "b");
    await holder.connect({ carrier: b.right, rendererControlToken: "b" });
    await waitFor(() => starts === 2 && received.length === 2, "B");
    emits[0]({ width: 1024, height: 768 });
    await tick();
    assert.deepEqual(received, [viewport(640, 480), viewport(640, 480)]);
  });

  await prove("runtime-terminal-no-late-callback", async () => {
    const manager = new ViewportManager();
    manager.accept(viewport(320, 240));
    manager.terminate();
    const calls = [];
    manager.subscribe((value) => calls.push(value));
    assert.deepEqual(calls, []);
  });
});

qualify("input-frame-independence", "Viewport does not mint InputTarget or masquerade as custom state", async ({ prove }) => {
  await prove("viewport-does-not-mutate-input-target", async () => {
    const control = createMemoryCarrierPair();
    const publisher = main(control, "a");
    const holder = createRendererControlHolder({
      async acquire() {
        const pair = createMemoryCarrierPair();
        createSubsystemDataPeer({
          binding: binding(pair.left),
          handlers: subsystemHandlers,
        });
        return pair.right;
      },
    }, undefined, {
      start(emit) {
        emit({ width: 800, height: 600 });
        return () => {};
      },
    });
    await holder.connect({ carrier: control.right, rendererControlToken: "a" });
    await tick();
    assert.deepEqual(holder.current().snapshot.inputTarget, inputTarget);
    publisher.retire();
  });

  await prove("viewport-is-not-x-star-state", async () => {
    const pair = createMemoryCarrierPair();
    const input = [];
    const viewports = [];
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: {
        onInputState(message) {
          input.push(message);
          return accepted();
        },
        onInputEvent: accepted,
        onInputReset: accepted,
        onViewportState(message) {
          viewports.push(message);
          return accepted();
        },
      },
    });
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: rendererHandlers,
    });
    await renderer.viewport.sendState(viewport(400, 300));
    await tick();
    assert.deepEqual(input, []);
    assert.deepEqual(viewports, [viewport(400, 300)]);
    await renderer.close();
    await subsystem.terminal;
  });
});

qualify("logical-surface", "Desktop document layout viewport physical source", async ({ prove }) => {
  await prove([
    "desktop-document-layout-viewport",
    "floor-css-logical-pixels",
    "hidden-visible-resample",
    "dpr-only-does-not-change-css-size",
  ], async () => {
    const window = fakeWindow();
    const samples = [];
    const source = createDesktopRendererViewportSource(window);
    const stop = source.start((sample) => samples.push({ ...sample }));
    assert.deepEqual(samples, [{ width: 640.9, height: 480.2 }]);
    window.innerWidth = 800;
    window.innerHeight = 600;
    window.dispatch("resize");
    window.runFrame();
    assert.deepEqual(samples.at(-1), { width: 800, height: 600 });
    window.devicePixelRatio = 2;
    window.dispatch("resize");
    window.runFrame();
    assert.equal(samples.filter((sample) => sample.width === 800 && sample.height === 600).length >= 1, true);
    assert.equal(samples.at(-1).width, 800);
    assert.equal(samples.at(-1).height, 600);
    window.document.visibilityState = "hidden";
    window.document.dispatch("visibilitychange");
    window.document.visibilityState = "visible";
    window.innerWidth = 1024;
    window.innerHeight = 768;
    window.document.dispatch("visibilitychange");
    assert.deepEqual(samples.at(-1), { width: 1024, height: 768 });
    stop();
  });
});

registerCoverageAudit();
