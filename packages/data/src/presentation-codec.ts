import type { PresentationEventV1, PresentationInterestV1 } from "./model.js";
import {
  array,
  exact,
  fail,
  object,
  scalarString,
  utf8LexicalLess,
} from "./validation-common.js";

function text(value: unknown, label: string): string {
  return scalarString(value, "presentation", label);
}

function channel(value: unknown): string {
  const result = text(value, "channel");
  for (const character of result) {
    const code = character.codePointAt(0)!;
    if (code <= 0x1f || code === 0x7f) fail("presentation", "channel contains control character");
  }
  return result;
}

function eventName(value: unknown): string {
  const result = text(value, "name");
  for (const character of result) {
    const code = character.codePointAt(0)!;
    if (code <= 0x1f || code === 0x7f) fail("presentation", "name contains control character");
  }
  return result;
}

export function validatePresentationInterest(raw: unknown): PresentationInterestV1 {
  const message = exact(raw, ["type", "frames"], [], "presentation");
  if (message.type !== "presentation.interest") fail("presentation", "wrong type");
  const frames = array(message.frames, "presentation", "frames");
  let previousFrame: string | null = null;
  for (const rawFrame of frames) {
    const frame = exact(rawFrame, ["frameId", "channels"], [], "presentation");
    const frameId = text(frame.frameId, "frameId");
    if (previousFrame !== null && !utf8LexicalLess(previousFrame, frameId)) {
      fail("presentation", "frames must be uniquely sorted");
    }
    previousFrame = frameId;
    const channels = array(frame.channels, "presentation", "channels");
    if (channels.length < 1) fail("presentation", "each frame must contribute at least one channel");
    let previousChannel: string | null = null;
    for (const rawChannel of channels) {
      const current = channel(rawChannel);
      if (previousChannel !== null && !utf8LexicalLess(previousChannel, current)) {
        fail("presentation", "channels must be uniquely sorted");
      }
      previousChannel = current;
    }
  }
  return message as unknown as PresentationInterestV1;
}

export function validatePresentationEvent(raw: unknown): PresentationEventV1 {
  const message = exact(raw, [
    "type",
    "sourceSubsystemKey",
    "domainId",
    "targetKey",
    "frameId",
    "activationId",
    "channel",
    "name",
    "data",
  ], [], "presentation");
  if (message.type !== "presentation.event") fail("presentation", "wrong type");
  text(message.sourceSubsystemKey, "sourceSubsystemKey");
  text(message.domainId, "domainId");
  text(message.targetKey, "targetKey");
  text(message.frameId, "frameId");
  text(message.activationId, "activationId");
  channel(message.channel);
  eventName(message.name);
  object(message.data, "presentation", "data");
  return message as unknown as PresentationEventV1;
}
