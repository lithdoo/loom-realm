import { completed, defineSubsystem, failed } from "@loomrealm/subsystem";
import { RPGDialogue } from "@loomrealm-game/rpg-dialogue";
import { createControlsConsumer } from "@loomrealm-game/common-controls/subsystem";

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

export default defineSubsystem((scope) => createPokeManDialogueSubsystem(scope));
