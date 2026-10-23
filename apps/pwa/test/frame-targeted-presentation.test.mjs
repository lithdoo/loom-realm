import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createMainRuntimeControlPeer } from "@loomrealm/runtime-control";
import { createMainRendererControlPeer, prepareRendererHelloResultV2 } from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "@loomrealm/renderer";
import { attachRendererPresentation } from "@loomrealm/renderer/web-presentation";
import { defineSubsystem } from "@loomrealm/subsystem";
import { runSubsystem } from "@loomrealm/subsystem/host";
import { createSharedStateClient } from "@loomrealm/shared-state";
import { createSessionEventClient } from "@loomrealm/session-events";
import { PwaDataBroker } from "../dist/types/data-broker.js";
import { createMessagePortCarrier } from "../dist/types/message-port-carrier.js";

const scheduler = {
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
};
const policy = {
  scheduler,
  helloDeadlineMs: 1_000,
  frameDeadlineMs: 1_000,
  terminalCleanupDeadlineMs: 100,
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await turn();
  }
  assert.fail(`Timed out waiting for ${label}`);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function runtimeEndpoint() {
  const pending = deferred();
  let current = null;
  return {
    binding: {
      acquire(signal) {
        if (current !== null) return Promise.resolve(current);
        if (signal.aborted) return Promise.reject(signal.reason);
        signal.addEventListener("abort", () => pending.reject(signal.reason), { once: true });
        return pending.promise;
      },
    },
    provisioner: {
      async install(request, port) {
        current = {
          carrier: createMessagePortCarrier(port),
          generation: request.generation,
          dataProfile: request.dataProfile,
        };
        pending.resolve(current);
      },
      async revoke() {
        const value = current;
        current = null;
        void value?.carrier.close();
      },
    },
  };
}

function windowEndpoint() {
  const pending = deferred();
  let current = null;
  return {
    binding: {
      acquire(subsystemKey, generation, dataProfile, signal) {
        const matches = (value) => value !== null &&
          value.subsystemKey === subsystemKey && value.generation === generation && value.dataProfile === dataProfile;
        if (matches(current)) return Promise.resolve(current.carrier);
        if (signal.aborted) return Promise.reject(signal.reason);
        return pending.promise.then((value) => {
          if (!matches(value)) throw new Error("PWA Renderer Data tuple mismatch");
          return value.carrier;
        });
      },
    },
    bridge: {
      async request(message) {
        if (message.type === "renderer-data/install") {
          current = {
            subsystemKey: message.subsystemKey,
            generation: message.generation,
            dataProfile: message.dataProfile,
            carrier: createMessagePortCarrier(message.port),
          };
          pending.resolve(current);
        } else {
          const value = current;
          current = null;
          void value?.carrier.close();
        }
      },
    },
  };
}

test("PWA MessagePort broker carries a browser top-frame event to the exact Runtime Frame", { timeout: 10_000 }, async () => {
  const runner = runtimeEndpoint();
  const window = windowEndpoint();
  const broker = new PwaDataBroker(window.bridge, "epoch-presentation");
  const terminated = deferred();
  const hosted = Object.freeze({
    runtimeControl: Object.freeze({ acquire: async () => { throw new Error("not broker-owned in this vertical"); } }),
    terminated: terminated.promise,
    requestTermination: async () => terminated.resolve(),
  });
  broker.onRuntimeDataProvisioner(hosted, runner.provisioner);
  broker.sink.replace(Object.freeze({
    rendererControlToken: "renderer-token",
    entries: Object.freeze([Object.freeze({
      subsystemKey: "game",
      generation: 1,
      dataProfile: "loomrealm.renderer-data/3",
      runtime: hosted,
    })]),
  }));

  const runtimeControl = createMemoryCarrierPair();
  const delivered = [];
  let listenerReady = false;
  const state = createSharedStateClient();
  const events = createSessionEventClient();
  let runtimeReady = false;
  const runtime = runSubsystem({
    definition: defineSubsystem((scope) => {
      scope.createRenderDomain({
        zIndex: 0,
        roots: [{ key: "controls", tag: "game-controls-input", attrs: {}, data: {}, children: [] }],
      });
      return {
        async frame(frame) {
          const listener = scope.presentationEvents.createListener({ frame, channels: ["controls.event"] });
          listener.on("controls.event", (event) => delivered.push(event));
          listenerReady = true;
          return new Promise(() => {});
        },
      };
    }),
    runtimeControl: { acquire: async () => runtimeControl.right },
    runtimePolicy: policy,
    launch: { subsystemKey: "game", bootstrapToken: "secret", controlProtocolVersions: [1] },
    data: runner.binding,
    state: Object.freeze({ client: state, terminate: () => state.terminate() }),
    events: Object.freeze({ client: events, terminate: () => events.terminate() }),
  });
  void runtime.catch(() => {});
  const main = createMainRuntimeControlPeer({
    carrier: runtimeControl.left,
    scheduler,
    frameDeadlineMs: 1_000,
    shutdownDeadlineMs: 1_000,
    authenticateHello: ({ key, bootstrapToken }) => key === "game" && bootstrapToken === "secret"
      ? { kind: "accepted" } : { kind: "rejected", code: "BOOTSTRAP_AUTHENTICATION_FAILED" },
    handlers: {
      onStatus: (status) => { if (status.state === "ready") runtimeReady = true; },
      onFrameCall: () => ({ kind: "semantic-error", error: { code: "FRAME_CALL_TARGET_NOT_FOUND" } }),
      onFrameReturn: () => ({ kind: "success", result: {} }),
    },
  });
  await main.identified;
  await waitFor(() => runtimeReady, "Runtime ready status");

  const holder = createRendererControlHolder(window.binding);
  let emitNodeEvent = null;
  let presentation = null;
  const detach = attachRendererPresentation(holder, {
    reevaluate(source, emit) {
      emitNodeEvent = emit;
      presentation = source.read();
    },
  });
  const snapshot = {
    sessionId: "S",
    revision: 1,
    runtimes: [{ subsystemKey: "game", state: "ready" }],
    stack: [{ frameId: "frame", subsystemKey: "game", lifecycle: "active", activationId: "a1" }],
    dataAuthorities: [{ subsystemKey: "game", generation: 1, dataProfile: "loomrealm.renderer-data/3" }],
  };
  const rendererControl = createMemoryCarrierPair();
  const publisher = createMainRendererControlPeer({
    carrier: rendererControl.left,
    acceptHello: () => ({ kind: "accepted", snapshot, preparedHelloText: prepareRendererHelloResultV2(snapshot) }),
  });
  await holder.connect({ carrier: rendererControl.right, rendererControlToken: "renderer-token" });
  await broker.whenIdle();
  await main.frame.initialize({ frameId: "frame", input: null });
  await main.frame.activate({ frameId: "frame", activationId: "a1" });
  await waitFor(() => listenerReady && presentation?.subsystems[0]?.domains.length > 0, "PWA Runtime listener and RenderNode");

  const domain = presentation.subsystems[0].domains[0];
  for (let attempt = 0; attempt < 50 && delivered.length === 0; attempt += 1) {
    emitNodeEvent({
      sessionId: "S",
      subsystemKey: "game",
      generation: 1,
      domainId: domain.domainId,
      targetKey: "controls",
      name: "input.event",
      data: { action: "down", button: "south", repeat: false },
      options: { broadcast: "top-frame", channel: "controls.event" },
    });
    await turn();
  }
  assert.equal(delivered.length, 1);
  assert.deepEqual(delivered[0], {
    channel: "controls.event",
    name: "input.event",
    data: { action: "down", button: "south", repeat: false },
    source: { subsystemKey: "game", domainId: domain.domainId, targetKey: "controls" },
  });

  publisher.retire();
  detach();
  await main.control.shutdown({ reason: "session-end" });
  await runtime;
  terminated.resolve();
  await broker.close();
});
