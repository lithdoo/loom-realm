import assert from "node:assert/strict";
import test from "node:test";
import { completed, failed, FrameCallRejectedError } from "@loomrealm/subsystem";
import { createPokeManDialogueSubsystem } from "../subsystems/dialogue.mjs";
import { createPokeManMapSubsystem, MAP_ONLY_NPC_PLACEMENTS } from "../subsystems/map.mjs";

const turn = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
};

function mapHarness(options = {}) {
  const log = [];
  const mapTerminal = deferred();
  const child = deferred();
  const consumers = [];
  const trackers = [];
  let interact;
  let entering;
  let callCount = 0;
  const handler = {
    controls: {
      setMoveIntent(value) { log.push(["move", value]); },
      confirm() {
        log.push(["confirm"]);
        if (options.confirmInteraction !== false) interact?.(professorEvent());
      },
    },
    onMapEntering(listener) { entering = listener; return () => {}; },
    onNPCInteract(listener) { interact = listener; return () => {}; },
    run(initial) { log.push(["run", initial]); return mapTerminal.promise; },
  };
  class MapBuilder {
    build(value) { log.push(["build", value]); return handler; }
  }
  const createDirections = () => {
    let direction = null;
    const tracker = {
      get direction() { return direction; },
      acceptState(state) {
        log.push(["state", [...state.down]]);
        direction = ["up", "down", "left", "right"].findLast((item) => state.down.includes(item)) ?? null;
      },
      acceptEvent(event) {
        log.push(["event", event]);
        if (["up", "down", "left", "right"].includes(event.button) && !event.repeat) {
          if (event.action === "down") direction = event.button;
          else if (event.action === "up" && direction === event.button) direction = null;
        }
      },
      reset() { log.push(["reset"]); direction = null; },
    };
    trackers.push(tracker);
    return tracker;
  };
  const createConsumer = (_events, _frame, handlers) => {
    const consumer = {
      handlers,
      closed: false,
      close() { if (!this.closed) { this.closed = true; log.push(["close"]); } },
    };
    consumers.push(consumer);
    handlers.onState?.({ down: [] });
    return consumer;
  };
  const scope = { presentationEvents: {} };
  const frame = {
    params: { mapId: 4, x: 10, y: 7, characterName: "Player" },
    signal: new AbortController().signal,
    async call(key, input) {
      callCount += 1;
      log.push(["call", key, input]);
      if (options.callError) throw options.callError;
      if (options.childOutcome) return options.childOutcome;
      return child.promise;
    },
  };
  const subsystem = createPokeManMapSubsystem(scope, {
    RPGMapBuilder: MapBuilder,
    createControlsConsumer: createConsumer,
    createDirectionalControlsTracker: createDirections,
  });
  return {
    frame,
    handler,
    mapTerminal,
    child,
    consumers,
    trackers,
    log,
    entering: () => entering,
    interact(event = professorEvent()) { interact?.(event); },
    callCount: () => callCount,
    run: () => subsystem.frame(frame),
  };
}

function professorEvent() {
  return {
    mapId: 4,
    npc: { instanceId: "professor", npcId: "professor", x: 10, y: 6 },
    player: { x: 10, y: 7, direction: 8 },
  };
}

test("Professor alone is interactable in the production placement table", () => {
  const placements = Object.values(MAP_ONLY_NPC_PLACEMENTS).flat();
  assert.deepEqual(placements.filter((placement) => placement.interactable), [{
    instanceId: "professor",
    npcId: "professor",
    x: 10,
    y: 6,
    direction: 2,
    interactable: true,
  }]);
});

test("Map semantic south/start confirm suppresses repeats and tears down A1 before exact child call", async () => {
  const fixture = mapHarness();
  const pending = fixture.run();
  await turn();
  assert.equal(fixture.consumers.length, 1);
  fixture.consumers[0].handlers.onEvent({ action: "down", button: "south", repeat: true });
  assert.equal(fixture.callCount(), 0);
  fixture.consumers[0].handlers.onEvent({ action: "down", button: "south", repeat: false });
  await turn();
  assert.equal(fixture.callCount(), 1);
  const call = fixture.log.find((entry) => entry[0] === "call");
  assert.deepEqual(call, ["call", "dialogue", {
    dialogueKey: "professor-vertical-slice",
    source: { mapId: 4, npc: { instanceId: "professor", npcId: "professor" } },
  }]);
  const callIndex = fixture.log.indexOf(call);
  assert.deepEqual(fixture.log.slice(callIndex - 3, callIndex).map(([name]) => name), ["move", "reset", "close"]);
  assert.equal(fixture.consumers[0].closed, true);

  fixture.child.resolve(completed({ dialogueKey: "professor-vertical-slice", conclusion: "ready" }));
  await turn();
  assert.equal(fixture.consumers.length, 2, "A2 must create a fresh consumer");
  assert.equal(fixture.trackers.length, 2, "A2 must create a fresh tracker");
  assert.notEqual(fixture.consumers[0], fixture.consumers[1]);
  fixture.consumers[1].handlers.onEvent({ action: "down", button: "start", repeat: false });
  await turn();
  assert.equal(fixture.callCount(), 2, "start must use the same semantic confirm route");
  fixture.child.resolve(completed({ dialogueKey: "professor-vertical-slice", conclusion: "cancelled" }));
  fixture.mapTerminal.resolve(completed({ map: "done" }));
  assert.deepEqual(await pending, completed({ map: "done" }));
});

test("Map one-slot rendezvous ignores non-Professor and duplicate interactions", async () => {
  const fixture = mapHarness({ confirmInteraction: false });
  const pending = fixture.run();
  await turn();
  fixture.interact({ ...professorEvent(), npc: { instanceId: "rival-lab", npcId: "rival-lab" } });
  await turn();
  assert.equal(fixture.callCount(), 0);
  fixture.interact();
  fixture.interact();
  await turn();
  assert.equal(fixture.callCount(), 1);
  fixture.child.resolve(completed({ dialogueKey: "professor-vertical-slice", conclusion: "not-yet" }));
  await turn();
  fixture.mapTerminal.resolve(completed(null));
  await pending;
});

for (const code of ["FRAME_CALL_TARGET_NOT_FOUND", "FRAME_CALL_TARGET_UNAVAILABLE"]) {
  test(`Map maps ${code} to the stable call rejection failure`, async () => {
    const fixture = mapHarness({ callError: new FrameCallRejectedError(code) });
    const pending = fixture.run();
    await turn();
    fixture.interact();
    assert.deepEqual(await pending, failed({
      code: "POKEMAN_DIALOGUE_CALL_REJECTED",
      data: { callCode: code },
    }));
  });
}

test("Map maps non-rejection call errors to an invariant failure", async () => {
  const fixture = mapHarness({ callError: new TypeError("bad call") });
  const pending = fixture.run();
  await turn();
  fixture.interact();
  assert.deepEqual(await pending, failed({ code: "POKEMAN_DIALOGUE_MAP_INVARIANT_FAILED" }));
});

for (const [name, childOutcome, expected] of [
  ["invalid completed", completed({ dialogueKey: "professor-vertical-slice", conclusion: "ready", extra: true }), failed({ code: "POKEMAN_DIALOGUE_RESULT_INVALID" })],
  ["failed child", failed({ code: "CHILD_BROKE" }), failed({ code: "POKEMAN_DIALOGUE_CHILD_FAILED", data: { childCode: "CHILD_BROKE" } })],
  ["cancelled child", { type: "cancelled" }, failed({ code: "POKEMAN_DIALOGUE_CHILD_CANCELLED" })],
]) {
  test(`Map fails closed for ${name}`, async () => {
    const fixture = mapHarness({ childOutcome });
    const pending = fixture.run();
    await turn();
    fixture.interact();
    assert.deepEqual(await pending, expected);
    assert.equal(fixture.consumers.length, 1, "failure must not start A2 controls");
  });
}

test("Map latches terminal outcome while child is active without settling early or creating A2", async () => {
  const fixture = mapHarness();
  let settled = false;
  const pending = fixture.run().finally(() => { settled = true; });
  await turn();
  fixture.interact();
  await turn();
  fixture.mapTerminal.resolve(failed({ code: "MAP_TERMINAL" }));
  await turn();
  assert.equal(settled, false, "caller handler must remain pending while frame.call is committed");
  fixture.child.resolve(completed({ dialogueKey: "professor-vertical-slice", conclusion: "ready" }));
  assert.deepEqual(await pending, failed({ code: "MAP_TERMINAL" }));
  assert.equal(fixture.consumers.length, 1, "latched terminal must not create transient A2 controls");
});

function dialogueHarness(options = {}) {
  const calls = [];
  const consumers = [];
  const instances = [];
  const results = [...(options.results ?? [
    { type: "submitted" },
    { type: "submitted", choiceId: "ready" },
    { type: "submitted" },
  ])];
  class Dialogue {
    constructor(scope, frame, dialogueOptions) {
      if (options.constructError) throw options.constructError;
      this.requests = [];
      this.history = [];
      this.closed = false;
      this.commands = [];
      this.controls = Object.fromEntries(["confirm", "previous", "next", "history", "cancel"].map((name) => [name, () => this.commands.push(name)]));
      calls.push(["dialogue", scope, frame, dialogueOptions]);
      instances.push(this);
    }
    async openConversation(request) {
      this.requests.push(request);
      const result = results.shift();
      if (result instanceof Error) throw result;
      return result;
    }
    appendHistory(entry) { this.history.push(entry); }
    close() { this.closed = true; calls.push(["dialogue.close"]); }
  }
  const createConsumer = (_events, _frame, handlers) => {
    const consumer = { handlers, closed: false, close() { this.closed = true; calls.push(["controls.close"]); } };
    consumers.push(consumer);
    calls.push(["controls"]);
    return consumer;
  };
  const contentVersion = `sha256:${"a".repeat(64)}`;
  const scope = {
    presentationEvents: {},
    content: {
      async record(...args) {
        calls.push(["record", ...args]);
        if (options.recordError) throw options.recordError;
        return { value: options.npc ?? { name: "博士", sprite: { namespace: "resource.Graphics", key: "Characters/Professor" } } };
      },
      async resource(...args) {
        calls.push(["resource", ...args]);
        if (options.resourceError) throw options.resourceError;
        return { contentVersion: options.contentVersion ?? contentVersion };
      },
    },
  };
  const frame = {
    id: "dialogue",
    params: Object.hasOwn(options, "params") ? options.params : {
      dialogueKey: "professor-vertical-slice",
      source: { mapId: 4, npc: { instanceId: "professor", npcId: "professor" } },
    },
    signal: new AbortController().signal,
    async call() { throw new Error("Dialogue child does not call another subsystem"); },
  };
  const subsystem = createPokeManDialogueSubsystem(scope, { RPGDialogue: Dialogue, createControlsConsumer: createConsumer });
  return { frame, scope, calls, consumers, instances, run: () => subsystem.frame(frame), contentVersion };
}

test("Dialogue rejects closed-schema input before every side effect", async () => {
  const valid = {
    dialogueKey: "professor-vertical-slice",
    source: { mapId: 4, npc: { instanceId: "professor", npcId: "professor" } },
  };
  const invalid = [
    null,
    {},
    { ...valid, extra: true },
    { ...valid, dialogueKey: "other" },
    { ...valid, source: { ...valid.source, extra: true } },
    { ...valid, source: { ...valid.source, mapId: 0 } },
    { ...valid, source: { ...valid.source, mapId: 1.5 } },
    { ...valid, source: { ...valid.source, npc: { ...valid.source.npc, extra: true } } },
    { ...valid, source: { ...valid.source, npc: { ...valid.source.npc, instanceId: "rival" } } },
  ];
  for (const params of invalid) {
    const fixture = dialogueHarness({ params });
    assert.deepEqual(await fixture.run(), failed({ code: "POKEMAN_DIALOGUE_INPUT_INVALID" }));
    assert.deepEqual(fixture.calls, []);
    assert.equal(fixture.consumers.length, 0);
    assert.equal(fixture.instances.length, 0);
  }
});

test("Dialogue resolves the exact Professor producer and owns A/History/B/C ready flow", async () => {
  const fixture = dialogueHarness();
  assert.deepEqual(await fixture.run(), completed({ dialogueKey: "professor-vertical-slice", conclusion: "ready" }));
  const signalOptions = { signal: fixture.frame.signal };
  assert.deepEqual(fixture.calls.slice(0, 2), [
    ["record", "struct.NPC", "professor", signalOptions],
    ["resource", "resource.Graphics", "Characters/Professor", signalOptions],
  ]);
  const dialogue = fixture.instances[0];
  assert.equal(dialogue.requests.length, 3);
  const professor = {
    characterId: "professor",
    displayName: "博士",
    active: true,
    data: { sprite: { namespace: "resource.Graphics", key: "Characters/Professor", contentVersion: fixture.contentVersion } },
  };
  assert.deepEqual(dialogue.requests, [
    { conversation: { speakerName: "博士", text: "你终于来了。", choices: [], data: {} }, characters: [professor] },
    { conversation: { speakerName: "博士", text: "准备好出发了吗？", choices: [
      { choiceId: "ready", text: "准备好了", data: {} },
      { choiceId: "not-yet", text: "还没有", data: {} },
    ], data: {} }, characters: [professor] },
    { conversation: { speakerName: "博士", text: "很好，出发吧。", choices: [], data: {} }, characters: [professor] },
  ]);
  assert.deepEqual(dialogue.history, [
    { entryId: "professor-greeting", speakerName: "博士", text: "你终于来了。" },
    { entryId: "professor-question", speakerName: "博士", text: "准备好出发了吗？" },
  ]);
  assert.equal(dialogue.closed, true);
  assert.equal(fixture.consumers[0].closed, true);
  assert.deepEqual(fixture.calls.slice(-2).map(([name]) => name), ["controls.close", "dialogue.close"]);
});

test("Dialogue maps only non-repeat down events to semantic controls", async () => {
  const gate = deferred();
  const fixture = dialogueHarness({ results: [gate.promise] });
  const pending = fixture.run();
  await turn();
  const handlers = fixture.consumers[0].handlers;
  for (const [button, command] of [
    ["south", "confirm"], ["start", "confirm"], ["up", "previous"],
    ["down", "next"], ["select", "history"], ["east", "cancel"],
  ]) handlers.onEvent({ action: "down", button, repeat: false });
  handlers.onEvent({ action: "down", button: "south", repeat: true });
  handlers.onEvent({ action: "up", button: "east", repeat: false });
  handlers.onEvent({ action: "down", button: "west", repeat: false });
  assert.deepEqual(fixture.instances[0].commands, ["confirm", "confirm", "previous", "next", "history", "cancel"]);
  gate.resolve({ type: "cancelled" });
  assert.deepEqual(await pending, completed({ dialogueKey: "professor-vertical-slice", conclusion: "cancelled" }));
});

for (const [name, results, conclusion, text] of [
  ["not-yet branch", [{ type: "submitted" }, { type: "submitted", choiceId: "not-yet" }, { type: "submitted" }], "not-yet", "准备好以后再来找我。"],
  ["A cancel", [{ type: "cancelled" }], "cancelled", null],
  ["B cancel", [{ type: "submitted" }, { type: "cancelled" }], "cancelled", null],
  ["C cancel", [{ type: "submitted" }, { type: "submitted", choiceId: "ready" }, { type: "cancelled" }], "cancelled", "很好，出发吧。"],
]) {
  test(`Dialogue completes the ${name} as a business result`, async () => {
    const fixture = dialogueHarness({ results });
    assert.deepEqual(await fixture.run(), completed({ dialogueKey: "professor-vertical-slice", conclusion }));
    if (text !== null) assert.equal(fixture.instances[0].requests.at(-1).conversation.text, text);
    assert.equal(fixture.instances[0].closed, true);
    assert.equal(fixture.consumers[0].closed, true);
  });
}

for (const options of [
  { recordError: new Error("record") },
  { resourceError: new Error("resource") },
  { npc: { name: "博士", sprite: { namespace: "resource.Graphics", key: "Characters/Wrong" } } },
  { contentVersion: "latest" },
]) {
  test(`Dialogue maps Content failure ${JSON.stringify(Object.keys(options))}`, async () => {
    const fixture = dialogueHarness(options);
    assert.deepEqual(await fixture.run(), failed({ code: "POKEMAN_DIALOGUE_CONTENT_FAILED" }));
    assert.equal(fixture.instances.length, 0);
    assert.equal(fixture.consumers.length, 0);
  });
}

test("Dialogue maps unexpected session results and exceptions and still cleans up", async () => {
  for (const results of [[{ type: "submitted", choiceId: "unexpected" }], [new Error("session")]]) {
    const fixture = dialogueHarness({ results });
    assert.deepEqual(await fixture.run(), failed({ code: "POKEMAN_DIALOGUE_SESSION_FAILED" }));
    assert.equal(fixture.instances[0].closed, true);
    assert.equal(fixture.consumers[0].closed, true);
  }
});
