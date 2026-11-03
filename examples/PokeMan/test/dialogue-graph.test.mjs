import assert from "node:assert/strict";
import test from "node:test";
import { createPokeManDialogueGraphSubsystem } from "../subsystems/dialogue.mjs";

test("Dialogue runtime permits a legal cycle and caches immutable records for the Frame", async () => {
  const values = new Map([
    ["a", { lines: [{ text: "A" }], choices: [{ text: "next", target: "b" }] }],
    ["b", { lines: [{ text: "B" }], choices: [{ text: "next", target: "a" }] }],
  ]);
  const reads = new Map();
  let opens = 0;
  class FakeDialogue {
    controls = { confirm() {}, previous() {}, next() {}, history() {}, cancel() {} };
    async openConversation() {
      opens += 1;
      return opens < 3 ? { type: "submitted", choiceId: "0" } : { type: "cancelled" };
    }
    appendHistory() {}
    close() {}
  }
  const scope = {
    content: { async record(_namespace, key) {
      reads.set(key, (reads.get(key) ?? 0) + 1);
      return { value: structuredClone(values.get(key)) };
    } },
    state: {},
    presentationEvents: {},
  };
  const subsystem = createPokeManDialogueGraphSubsystem(scope, {
    RPGDialogue: FakeDialogue,
    createControlsConsumer: () => ({ close() {} }),
  });
  const outcome = await subsystem.frame({
    params: { dialogueKey: "a", source: { mapId: 4, npc: { instanceId: "professor", npcId: "professor" } } },
    signal: new AbortController().signal,
  });
  assert.deepEqual(outcome, { type: "cancelled" });
  assert.deepEqual(Object.fromEntries(reads), { a: 1, b: 1 });
});
