import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createSubsystemDataPeer } from "@loomrealm/data";
import {
  createMainRendererControlPeer,
  prepareRendererHelloResultV1,
} from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "../dist/index.js";

const authority = {
  subsystemKey: "demo",
  generation: 1,
  dataProfile: "loomrealm.renderer-data/1",
};

const snapshot = (
  sessionId,
  revision,
  active = true,
  generation = 1,
  activationId = "a1",
) => ({
  sessionId,
  revision,
  runtimes: [{ subsystemKey: "demo", state: "ready" }],
  stack: active ? [{
    frameId: "root",
    subsystemKey: "demo",
    lifecycle: "active",
    activationId,
  }] : [],
  inputTarget: active
    ? { subsystemKey: "demo", frameId: "root", activationId }
    : null,
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

async function turn() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await turn();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

test("source is Control-epoch scoped, restarts on replacement, and ignores late old emit", async () => {
  const emits = [];
  let starts = 0;
  let stops = 0;
  const source = {
    start(emit) {
      starts += 1;
      emits.push(emit);
      return () => {
        stops += 1;
        if (stops === 1) throw new Error("contained stop failure");
      };
    },
  };
  const holder = createRendererControlHolder(undefined, source);
  const a = createMemoryCarrierPair();
  const mainA = main(a, "a");
  await holder.connect({ carrier: a.right, rendererControlToken: "a" });
  assert.equal(starts, 1);

  const b = createMemoryCarrierPair();
  main(b, "b");
  await holder.connect({ carrier: b.right, rendererControlToken: "b" });
  assert.equal(starts, 2);
  assert.equal(stops, 1);
  assert.doesNotThrow(() => emits[0]({
    kind: "availability",
    channel: "keyboard.event",
    available: true,
  }));

  mainA.retire();
  await turn();
  assert.equal(holder.current().snapshot.sessionId, "b");
});

test("source start failure discards staged facts, keeps Control current, and does not retry in epoch", async () => {
  let starts = 0;
  const source = {
    start(emit) {
      starts += 1;
      emit({ kind: "state", channel: "keyboard.state", payload: { down: ["KeyA"] } });
      emit({ kind: "availability", channel: "keyboard.state", available: true });
      return undefined;
    },
  };
  const pair = createMemoryCarrierPair();
  const publisher = main(pair, "a");
  const holder = createRendererControlHolder(undefined, source);
  await holder.connect({ carrier: pair.right, rendererControlToken: "a" });
  assert.equal(holder.current().snapshot.sessionId, "a");
  assert.equal(starts, 1);
  publisher.publish(snapshot("a", 2));
  await turn();
  assert.equal(starts, 1);
});

test("fresh source State and paired transition flow only through gate and current Data", async () => {
  const control = createMemoryCarrierPair();
  const publisher = main(control, "a");
  const data = createMemoryCarrierPair();
  const received = [];
  const accepted = () => ({ kind: "accepted" });
  const subsystem = createSubsystemDataPeer({
    binding: {
      carrier: data.left,
      subsystemKey: "demo",
      generation: 1,
      dataProfile: "loomrealm.renderer-data/1",
    },
    handlers: {
      onInputState(message) {
        received.push(message);
        return accepted();
      },
      onInputEvent(message) {
        received.push(message);
        return accepted();
      },
      onInputReset(message) {
        received.push(message);
        return accepted();
      },
    },
  });
  let sourceEmit;
  let stopCount = 0;
  const source = {
    start(emit) {
      sourceEmit = emit;
      emit({ kind: "state", channel: "keyboard.state", payload: { down: [] } });
      emit({ kind: "availability", channel: "keyboard.state", available: true });
      emit({ kind: "availability", channel: "keyboard.event", available: true });
      return () => { stopCount += 1; };
    },
  };
  const holder = createRendererControlHolder({ async acquire() { return data.right; } }, source);
  await holder.connect({ carrier: control.right, rendererControlToken: "a" });
  await subsystem.input.sendInterest({
    type: "input.interest",
    frames: [{ frameId: "root", channels: ["keyboard.event", "keyboard.state"] }],
  });
  await waitFor(() => received.length === 1, "fresh State baseline");
  sourceEmit({ kind: "state", channel: "keyboard.state", payload: { down: ["KeyA"] } });
  sourceEmit({
    kind: "event",
    channel: "keyboard.event",
    payload: { action: "down", code: "KeyA", repeat: false },
  });
  await waitFor(() => received.length === 3, "paired State and Event");
  assert.deepEqual(received.map((message) => message.type), [
    "input.state",
    "input.state",
    "input.event",
  ]);
  assert.deepEqual(received[1].payload, { down: ["KeyA"] });

  publisher.retire();
  await waitFor(() => stopCount === 1, "source stop");
  sourceEmit({
    kind: "event",
    channel: "keyboard.event",
    payload: { action: "up", code: "KeyA", repeat: false },
  });
  await turn();
  assert.equal(received.length, 3);
  await subsystem.close();
});

test("Control generation replacement retires old Data before new Input facts enter the gate", async () => {
  const control = createMemoryCarrierPair();
  const publisher = main(control, "a");
  const acquisitions = [];
  const accepted = () => ({ kind: "accepted" });
  const source = {
    start(emit) {
      emit({ kind: "state", channel: "keyboard.state", payload: { down: ["KeyA"] } });
      emit({ kind: "availability", channel: "keyboard.state", available: true });
      return () => {};
    },
  };
  const holder = createRendererControlHolder({
    async acquire(_key, generation) {
      const pair = createMemoryCarrierPair();
      const received = [];
      const subsystem = createSubsystemDataPeer({
        binding: {
          carrier: pair.left,
          subsystemKey: "demo",
          generation,
          dataProfile: "loomrealm.renderer-data/1",
        },
        handlers: {
          onInputState(message) { received.push(message); return accepted(); },
          onInputEvent(message) { received.push(message); return accepted(); },
          onInputReset(message) { received.push(message); return accepted(); },
        },
      });
      acquisitions.push({ generation, received, subsystem });
      return pair.right;
    },
  }, source);
  await holder.connect({ carrier: control.right, rendererControlToken: "a" });
  await waitFor(() => acquisitions.length === 1, "generation 1 Data");
  await acquisitions[0].subsystem.input.sendInterest({
    type: "input.interest",
    frames: [{ frameId: "root", channels: ["keyboard.state"] }],
  });
  await waitFor(() => acquisitions[0].received.length === 1, "generation 1 baseline");

  publisher.publish(snapshot("a", 2, true, 2, "a2"));
  await waitFor(() => acquisitions.length === 2, "generation 2 Data");
  await turn();
  assert.deepEqual(
    acquisitions[0].received.map(({ type, activationId }) => [type, activationId]),
    [["input.state", "a1"]],
  );

  await acquisitions[1].subsystem.input.sendInterest({
    type: "input.interest",
    frames: [{ frameId: "root", channels: ["keyboard.state"] }],
  });
  await waitFor(() => acquisitions[1].received.length === 1, "generation 2 baseline");
  assert.deepEqual(
    acquisitions[1].received.map(({ type, activationId }) => [type, activationId]),
    [["input.state", "a2"]],
  );
  publisher.retire();
  await acquisitions[1].subsystem.terminal;
});
