import { cancelled, completed, defineSubsystem, failed } from "@loomrealm/subsystem";
import { RPGDialogue } from "@loomrealm-game/rpg-dialogue";
import { createControlsConsumer } from "@loomrealm-game/common-controls/subsystem";
import { applyEventStateMutation } from "./business-state.mjs";

const CONTENT_VERSION = /^sha256:[0-9a-f]{64}$/;

function exactObject(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function validInput(input) {
  return exactObject(input, ["dialogueKey", "source"])
    && input.dialogueKey === "professor-vertical-slice"
    && exactObject(input.source, ["mapId", "npc"])
    && Number.isSafeInteger(input.source.mapId)
    && input.source.mapId > 0
    && exactObject(input.source.npc, ["instanceId", "npcId"])
    && input.source.npc.instanceId === "professor"
    && input.source.npc.npcId === "professor";
}

async function resolveProfessor(scope, frame) {
  const record = await scope.content.record("struct.NPC", "professor", { signal: frame.signal });
  const npc = record?.value;
  if (!exactObject(npc, ["name", "sprite"])
      || typeof npc.name !== "string" || npc.name.length === 0
      || !exactObject(npc.sprite, ["namespace", "key"])
      || npc.sprite.namespace !== "resource.Graphics"
      || npc.sprite.key !== "Characters/Professor") {
    throw new TypeError("Invalid Professor NPC content");
  }
  const resource = await scope.content.resource(npc.sprite.namespace, npc.sprite.key, { signal: frame.signal });
  if (!CONTENT_VERSION.test(resource?.contentVersion ?? "")) {
    throw new TypeError("Invalid Professor sprite contentVersion");
  }
  return {
    characterId: "professor",
    displayName: npc.name,
    active: true,
    data: {
      sprite: {
        namespace: npc.sprite.namespace,
        key: npc.sprite.key,
        contentVersion: resource.contentVersion,
      },
    },
  };
}

function businessResult(conclusion) {
  return completed({ dialogueKey: "professor-vertical-slice", conclusion });
}

function submittedWithoutChoice(result) {
  return exactObject(result, ["type"]) && result.type === "submitted";
}

function cancelledResult(result) {
  return exactObject(result, ["type"]) && result.type === "cancelled";
}

function selectedResult(result) {
  return exactObject(result, ["type", "choiceId"])
    && result.type === "submitted"
    && (result.choiceId === "ready" || result.choiceId === "not-yet");
}

export function createPokeManDialogueSubsystem(scope, dependencies = {}) {
  const Dialogue = dependencies.RPGDialogue ?? RPGDialogue;
  const createConsumer = dependencies.createControlsConsumer ?? createControlsConsumer;

  return {
    async frame(frame) {
      if (!validInput(frame.params)) {
        return failed({ code: "POKEMAN_DIALOGUE_INPUT_INVALID" });
      }

      let professor;
      try {
        professor = await resolveProfessor(scope, frame);
      } catch {
        return failed({ code: "POKEMAN_DIALOGUE_CONTENT_FAILED" });
      }

      let dialogue;
      let controls;
      try {
        dialogue = new Dialogue(scope, frame, { cancelable: true });
        controls = createConsumer(scope.presentationEvents, frame, {
          onEvent(event) {
            if (event.action !== "down" || event.repeat) return;
            switch (event.button) {
              case "south":
              case "start": dialogue.controls.confirm(); break;
              case "up": dialogue.controls.previous(); break;
              case "down": dialogue.controls.next(); break;
              case "select": dialogue.controls.history(); break;
              case "east": dialogue.controls.cancel(); break;
            }
          },
        });

        const first = await dialogue.openConversation({
          conversation: {
            speakerName: "博士",
            text: "你终于来了。",
            choices: [],
            data: {},
          },
          characters: [professor],
        });
        if (cancelledResult(first)) return businessResult("cancelled");
        if (!submittedWithoutChoice(first)) return failed({ code: "POKEMAN_DIALOGUE_SESSION_FAILED" });
        dialogue.appendHistory({
          entryId: "professor-greeting",
          speakerName: "博士",
          text: "你终于来了。",
        });

        const second = await dialogue.openConversation({
          conversation: {
            speakerName: "博士",
            text: "准备好出发了吗？",
            choices: [
              { choiceId: "ready", text: "准备好了", data: {} },
              { choiceId: "not-yet", text: "还没有", data: {} },
            ],
            data: {},
          },
          characters: [professor],
        });
        if (cancelledResult(second)) return businessResult("cancelled");
        if (!selectedResult(second)) return failed({ code: "POKEMAN_DIALOGUE_SESSION_FAILED" });
        dialogue.appendHistory({
          entryId: "professor-question",
          speakerName: "博士",
          text: "准备好出发了吗？",
        });

        const conclusion = second.choiceId;
        const third = await dialogue.openConversation({
          conversation: {
            speakerName: "博士",
            text: conclusion === "ready" ? "很好，出发吧。" : "准备好以后再来找我。",
            choices: [],
            data: {},
          },
          characters: [professor],
        });
        if (cancelledResult(third)) return businessResult("cancelled");
        if (!submittedWithoutChoice(third)) return failed({ code: "POKEMAN_DIALOGUE_SESSION_FAILED" });
        return businessResult(conclusion);
      } catch {
        return failed({ code: "POKEMAN_DIALOGUE_SESSION_FAILED" });
      } finally {
        controls?.close();
        dialogue?.close();
      }
    },
  };
}

function validGraphInput(input) {
  return exactObject(input, ["dialogueKey", "source"])
    && typeof input.dialogueKey === "string" && input.dialogueKey.length > 0
    && exactObject(input.source, ["mapId", "npc"]) && Number.isSafeInteger(input.source.mapId) && input.source.mapId > 0
    && exactObject(input.source.npc, ["instanceId", "npcId"])
    && typeof input.source.npc.instanceId === "string" && input.source.npc.instanceId.length > 0
    && typeof input.source.npc.npcId === "string" && input.source.npc.npcId.length > 0;
}

function validateGraphRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some((key) => !["lines", "choices", "mutation", "speakerName"].includes(key))
      || !Array.isArray(value.lines) || value.lines.length === 0
      || value.lines.some((line) => line === null || typeof line !== "object" || Array.isArray(line)
        || Object.keys(line).some((key) => !["speaker", "text"].includes(key))
        || typeof line.text !== "string" || line.text.length === 0
        || (line.speaker !== undefined && (typeof line.speaker !== "string" || line.speaker.length === 0)))
      || (value.mutation !== undefined && (typeof value.mutation !== "string" || value.mutation.length === 0))) throw new TypeError("Invalid Dialogue content");
  const choices = value.choices ?? [];
  if (!Array.isArray(choices) || choices.some((choice) => !exactObject(choice, ["text", "target"])
      || typeof choice.text !== "string" || choice.text.length === 0 || typeof choice.target !== "string" || choice.target.length === 0)) throw new TypeError("Invalid Dialogue choices");
  return { ...value, choices };
}

export function createPokeManDialogueGraphSubsystem(scope, dependencies = {}) {
  const Dialogue = dependencies.RPGDialogue ?? RPGDialogue;
  const createConsumer = dependencies.createControlsConsumer ?? createControlsConsumer;
  const applyMutation = dependencies.applyEventStateMutation ?? applyEventStateMutation;
  return {
    async frame(frame) {
      if (!validGraphInput(frame.params)) return failed({ code: "POKEMAN_DIALOGUE_INPUT_INVALID" });
      let dialogue;
      let controls;
      try {
        dialogue = new Dialogue(scope, frame, { cancelable: true });
        controls = createConsumer(scope.presentationEvents, frame, {
          onEvent(event) {
            if (event.action !== "down" || event.repeat) return;
            if (event.button === "south" || event.button === "start") dialogue.controls.confirm();
            else if (event.button === "up") dialogue.controls.previous();
            else if (event.button === "down") dialogue.controls.next();
            else if (event.button === "select") dialogue.controls.history();
            else if (event.button === "east") dialogue.controls.cancel();
          },
        });
        let currentId = frame.params.dialogueKey;
        const visited = new Set();
        while (true) {
          if (visited.has(currentId)) throw new TypeError("Dialogue graph contains a runtime cycle");
          visited.add(currentId);
          const record = validateGraphRecord((await scope.content.record("struct.Dialogue", currentId, { signal: frame.signal }))?.value);
          let selectedTarget;
          for (const [index, line] of record.lines.entries()) {
            const final = index === record.lines.length - 1;
            const result = await dialogue.openConversation({
              conversation: {
                speakerName: line.speaker ?? record.speakerName ?? "",
                text: line.text,
                choices: final ? record.choices.map((choice, choiceIndex) => ({ choiceId: String(choiceIndex), text: choice.text, data: {} })) : [],
                data: {},
              },
              characters: [],
            });
            if (result?.type === "cancelled") return cancelled();
            if (result?.type !== "submitted") throw new TypeError("Dialogue presentation returned an invalid result");
            if (final && record.choices.length > 0) {
              const choiceIndex = Number(result.choiceId);
              if (!Number.isSafeInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= record.choices.length) throw new TypeError("Dialogue selected an invalid choice");
              selectedTarget = record.choices[choiceIndex].target;
            }
            dialogue.appendHistory({ entryId: `${currentId}:${index}`, speakerName: line.speaker ?? record.speakerName ?? "", text: line.text });
          }
          if (selectedTarget !== undefined) { currentId = selectedTarget; continue; }
          if (record.mutation !== undefined) {
            const mutation = (await scope.content.record("struct.EventStateMutation", record.mutation, { signal: frame.signal }))?.value;
            await applyMutation(scope.state, mutation, { signal: frame.signal });
          }
          return completed(currentId);
        }
      } catch {
        if (frame.signal.aborted) return cancelled();
        return failed({ code: "POKEMAN_DIALOGUE_GRAPH_FAILED" });
      } finally {
        controls?.close();
        dialogue?.close();
      }
    },
  };
}

export default defineSubsystem((scope) => createPokeManDialogueGraphSubsystem(scope));
