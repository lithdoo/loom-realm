import assert from "node:assert/strict";
import test from "node:test";
import {
  choice,
  character,
  conversationId,
  findNode,
  findTag,
  harness,
  history,
  openStarted,
  request,
  turn,
} from "./helpers.mjs";

test("canonical tree, attrs, caller data, defaults, and custom zIndex are exact", async () => {
  const conversationData = { voice: "elder" };
  const characterData = { placement: "left" };
  const choiceData = { icon: "yes" };
  const fixture = harness();
  fixture.dialogue.setHistory([history("h1", { speakerName: "Past", text: "Earlier" })]);
  const { pending } = await openStarted(fixture, request({
    speakerName: "Elder",
    text: "Choose",
    conversationData,
    characters: [character("elder", { displayName: "Village Elder", data: characterData })],
    choices: [choice("yes", { data: choiceData }), choice("no", { enabled: false })],
  }));
  const state = fixture.latest();
  assert.equal(state.zIndex, 2_147_483_646);
  assert.deepEqual(state.roots.map((node) => node.tag), ["lr-dialogue-view"]);
  const root = state.roots[0];
  assert.equal(root.key, "dialogue");
  assert.deepEqual(root.attrs, { version: "0" });
  assert.deepEqual(root.children.map((node) => [node.key, node.tag]), [
    ["characters", "lr-dialogue-characters"],
    ["conversation", "lr-dialogue-conversation"],
    ["controls", "lr-dialogue-controls"],
    ["history", "lr-dialogue-history"],
  ]);
  assert.deepEqual(findNode(state, "conversation").children.map((node) => [node.key, node.tag]), [
    ["text", "lr-dialogue-text"],
    ["choices", "lr-dialogue-choices"],
  ]);
  assert.equal(findNode(state, "conversation").data, conversationData);
  assert.equal(findTag(state, "lr-dialogue-character")[0].data, characterData);
  assert.equal(findTag(state, "lr-dialogue-choice")[0].data, choiceData);
  assert.deepEqual(findTag(state, "lr-dialogue-character")[0].attrs, {
    "character-id": "elder",
    "display-name": "Village Elder",
    active: "true",
  });
  assert.deepEqual(findTag(state, "lr-dialogue-choice").map((node) => node.attrs.enabled), ["true", "false"]);
  assert.deepEqual(findTag(state, "lr-dialogue-control-hint").map((node) => node.attrs), [
    { action: "confirm", label: "confirm", enabled: "true" },
    { action: "previous", label: "previous", enabled: "true" },
    { action: "next", label: "next", enabled: "true" },
    { action: "history", label: "history", enabled: "true" },
    { action: "cancel", label: "cancel", enabled: "false" },
  ]);
  fixture.dialogue.close();
  await assert.rejects(pending);

  const custom = harness({ dialogueOptions: { zIndex: -17 } });
  const { pending: customPending } = await openStarted(custom, request());
  assert.equal(custom.latest().zIndex, -17);
  custom.dialogue.close();
  await assert.rejects(customPending);
});

test("READY ACTIVE READY supports sequential Conversations with one persistent listener/domain", async () => {
  const fixture = harness();
  const { pending: first } = await openStarted(fixture, request());
  const firstId = conversationId(fixture);
  fixture.submit(firstId);
  assert.deepEqual(await first, { type: "submitted" });
  assert.deepEqual(findTag(fixture.latest(), "lr-dialogue-control-hint").map((node) => node.attrs.enabled), ["false", "false", "false", "false", "false"]);

  const { pending: second } = await openStarted(fixture, request({ text: "Again" }));
  const secondId = conversationId(fixture);
  assert.notEqual(secondId, firstId);
  fixture.submit(secondId);
  assert.deepEqual(await second, { type: "submitted" });
  assert.deepEqual(fixture.counts(), {
    listenerCreates: 1,
    listenerCloses: 0,
    domainCreates: 1,
    domainCloses: 0,
    unsubscribeCount: 0,
  });
  fixture.dialogue.close();
  assert.equal(fixture.counts().domainCloses, 1);
  assert.equal(fixture.counts().listenerCloses, 1);
  assert.equal(fixture.counts().unsubscribeCount, 3);
});

test("second concurrent open rejects asynchronously without replacing the active projection", async () => {
  const fixture = harness();
  const { pending: first } = await openStarted(fixture, request({ text: "First" }));
  const stateCount = fixture.states.length;
  let second;
  assert.doesNotThrow(() => { second = fixture.dialogue.openConversation(request({ text: "Second" })); });
  await assert.rejects(second);
  assert.equal(fixture.states.length, stateCount);
  fixture.submit(conversationId(fixture));
  assert.deepEqual(await first, { type: "submitted" });
});

test("Choice keys are fresh per Conversation; Character and control keys follow frozen lifetime rules", async () => {
  const fixture = harness();
  const { pending: first } = await openStarted(fixture, request({ choices: [choice("yes")], characters: [character("alice")] }));
  const firstChoice = findTag(fixture.latest(), "lr-dialogue-choice")[0].key;
  const firstCharacter = findTag(fixture.latest(), "lr-dialogue-character")[0].key;
  const controlKeys = findTag(fixture.latest(), "lr-dialogue-control-hint").map((node) => node.key);
  fixture.submit(conversationId(fixture), { choiceId: "yes" });
  await first;

  const { pending: second } = await openStarted(fixture, request({ choices: [choice("yes")], characters: [character("alice")] }));
  assert.notEqual(findTag(fixture.latest(), "lr-dialogue-choice")[0].key, firstChoice);
  assert.equal(findTag(fixture.latest(), "lr-dialogue-character")[0].key, firstCharacter);
  assert.deepEqual(findTag(fixture.latest(), "lr-dialogue-control-hint").map((node) => node.key), controlKeys);
  fixture.submit(conversationId(fixture), { choiceId: "yes" });
  await second;

  const { pending: third } = await openStarted(fixture, request({ characters: [] }));
  fixture.submit(conversationId(fixture));
  await third;
  const { pending: fourth } = await openStarted(fixture, request({ characters: [character("alice")] }));
  assert.notEqual(findTag(fixture.latest(), "lr-dialogue-character")[0].key, firstCharacter);
  fixture.dialogue.close();
  await assert.rejects(fourth);
});

test("History set/append is retained, detached, atomic, READY-only, and refreshes removed identities", async () => {
  const fixture = harness();
  const source = history("a", { speakerName: "A", text: "one" });
  fixture.dialogue.setHistory([source]);
  const snapshot = fixture.dialogue.getHistorySnapshot();
  assert.deepEqual(snapshot, [source]);
  assert.notEqual(snapshot, fixture.dialogue.getHistorySnapshot());
  assert.throws(() => { snapshot[0].text = "changed"; });
  assert.equal(fixture.dialogue.getHistorySnapshot()[0].text, "one");
  fixture.dialogue.appendHistory(history("b"));
  assert.throws(() => fixture.dialogue.appendHistory(history("b")));
  assert.deepEqual(fixture.dialogue.getHistorySnapshot().map((entry) => entry.entryId), ["a", "b"]);

  const { pending } = await openStarted(fixture, request());
  const firstKey = findTag(fixture.latest(), "lr-dialogue-history-entry")[0].key;
  assert.throws(() => fixture.dialogue.setHistory([]));
  assert.throws(() => fixture.dialogue.appendHistory(history("c")));
  fixture.submit(conversationId(fixture));
  await pending;
  fixture.dialogue.setHistory([history("b")]);
  fixture.dialogue.setHistory([history("a"), history("b")]);
  const { pending: next } = await openStarted(fixture, request({ text: "Next" }));
  const readded = findTag(fixture.latest(), "lr-dialogue-history-entry").find((node) => node.attrs["entry-id"] === "a");
  assert.notEqual(readded.key, firstKey);
  fixture.dialogue.close();
  await assert.rejects(next);
});

test("keyboard and gamepad mappings route retained mode and transient events with cancel precedence", async () => {
  const fixture = harness({ dialogueOptions: { cancelable: true } });
  fixture.dialogue.setHistory([history("a")]);
  const { pending } = await openStarted(fixture, request({ choices: [choice("a"), choice("b")] }));
  fixture.emit("keyboard.event", { action: "down", code: "ArrowUp", repeat: false });
  fixture.emit("keyboard.event", { action: "down", code: "ArrowDown", repeat: false });
  fixture.emit("keyboard.event", { action: "down", code: "Enter", repeat: false });
  fixture.emit("keyboard.event", { action: "down", code: "Space", repeat: false });
  fixture.emit("keyboard.event", { action: "down", code: "Space", repeat: true });
  fixture.emit("gamepad.event", { action: "down", gamepadId: 0, button: "south", value: 1 });
  assert.deepEqual(fixture.events.map((event) => [event.targetKey, event.name]), [
    ["conversation", "choice-previous"],
    ["conversation", "choice-next"],
    ["conversation", "commit"],
    ["conversation", "commit"],
    ["conversation", "commit"],
  ]);

  const beforeHistory = fixture.operations.length;
  fixture.emit("gamepad.event", { action: "down", gamepadId: 0, button: "select", value: 1 });
  const historyOps = fixture.operations.slice(beforeHistory).map((entry) => entry.type === "domain.emit" ? entry.event.name : entry.type);
  assert.deepEqual(historyOps, ["domain.replace", "scroll-to-latest"]);
  assert.equal(findNode(fixture.latest(), "history").attrs.visible, "true");
  fixture.emit("gamepad.event", { action: "down", gamepadId: 0, button: "dpadUp", value: 1 });
  fixture.emit("gamepad.event", { action: "down", gamepadId: 0, button: "dpadDown", value: 1 });
  assert.deepEqual(fixture.events.slice(-2).map((event) => event.name), ["scroll-up", "scroll-down"]);
  fixture.emit("keyboard.event", { action: "down", code: "Escape", repeat: false });
  assert.equal(findNode(fixture.latest(), "history").attrs.visible, "false");
  assert.equal(await Promise.race([pending.then(() => "settled"), turn().then(() => "open")]), "open");
  fixture.emit("gamepad.event", { action: "down", gamepadId: 0, button: "east", value: 1 });
  assert.deepEqual(await pending, { type: "cancelled" });
});

test("non-cancelable cancel does not settle", async () => {
  const fixture = harness();
  const { pending } = await openStarted(fixture, request());
  fixture.emit("keyboard.event", { action: "down", code: "Escape", repeat: false });
  assert.equal(await Promise.race([pending.then(() => "settled"), turn().then(() => "open")]), "open");
  fixture.submit(conversationId(fixture));
  assert.deepEqual(await pending, { type: "submitted" });
});

test("reverse submit revalidates correlation, mode, choice presence, identity, and enabled state", async () => {
  const fixture = harness();
  const { pending } = await openStarted(fixture, request({ choices: [choice("enabled"), choice("disabled", { enabled: false })] }));
  const id = conversationId(fixture);
  fixture.submit("stale", { choiceId: "enabled" });
  fixture.submit(id);
  fixture.submit(id, { choiceId: "missing" });
  fixture.submit(id, { choiceId: "disabled" });
  fixture.emit("keyboard.event", { action: "down", code: "Tab", repeat: false });
  fixture.submit(id, { choiceId: "enabled" });
  assert.equal(await Promise.race([pending.then(() => "settled"), turn().then(() => "open")]), "open");
  fixture.emit("keyboard.event", { action: "down", code: "Escape", repeat: false });
  fixture.submit(id, { choiceId: "enabled" });
  assert.deepEqual(await pending, { type: "submitted", choiceId: "enabled" });
  fixture.submit(id, { choiceId: "enabled" });
  assert.deepEqual(fixture.dialogue.getHistorySnapshot(), []);
});

test("close and abort settle once, clean resources, and enforce CLOSED behavior", async () => {
  const active = harness();
  const { pending } = await openStarted(active, request());
  active.dialogue.close();
  await assert.rejects(pending);
  assert.doesNotThrow(() => active.dialogue.close());
  await assert.rejects(active.dialogue.openConversation(request()));
  assert.throws(() => active.dialogue.setHistory([]));
  assert.throws(() => active.dialogue.appendHistory(history("x")));
  assert.throws(() => active.dialogue.getHistorySnapshot());
  assert.equal(active.counts().domainCloses, 1);

  const ready = harness();
  ready.dialogue.close();
  assert.deepEqual(ready.counts(), { listenerCreates: 0, listenerCloses: 0, domainCreates: 0, domainCloses: 0, unsubscribeCount: 0 });

  const aborted = harness();
  const { pending: abortedPending } = await openStarted(aborted, request());
  aborted.frameController.abort();
  await assert.rejects(abortedPending, (error) => error?.name === "AbortError");
  aborted.frameController.abort();
  assert.equal(aborted.counts().domainCloses, 1);
});

test("operation establishment failures reject returned promises and clean partial resources", async () => {
  const inputFailure = harness({ inputCreateError: new Error("input failed") });
  let inputPending;
  assert.doesNotThrow(() => { inputPending = inputFailure.dialogue.openConversation(request()); });
  await assert.rejects(inputPending, /input failed/);
  assert.equal(inputFailure.states.length, 0);

  const domainFailure = harness({ domainCreateError: new Error("domain failed") });
  const domainPending = domainFailure.dialogue.openConversation(request());
  await assert.rejects(domainPending, /domain failed/);
  assert.equal(domainFailure.counts().listenerCloses, 1);
  assert.equal(domainFailure.counts().unsubscribeCount, 3);
});

test("settle-once ignores repeated reverse submit and repeated physical commit", async () => {
  const fixture = harness();
  const { pending } = await openStarted(fixture, request());
  const id = conversationId(fixture);
  fixture.emit("keyboard.event", { action: "down", code: "Enter", repeat: false });
  fixture.emit("keyboard.event", { action: "down", code: "Enter", repeat: false });
  assert.equal(fixture.events.length, 2);
  fixture.submit(id);
  fixture.submit(id);
  assert.deepEqual(await pending, { type: "submitted" });
  const readyReplacements = fixture.operations.filter((entry) => entry.type === "domain.replace").length;
  assert.equal(readyReplacements, 1);
});
