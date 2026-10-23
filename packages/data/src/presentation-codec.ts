import type { PresentationEventV1, PresentationInterestV1 } from "./model.js";
import {
  array,
  assertPayload,
  boundedString,
  exact,
  fail,
  MAX_JSON_DEPTH,
  utf8LexicalLess,
} from "./validation-common.js";

export const MAX_PRESENTATION_DATA_DEPTH = MAX_JSON_DEPTH + 1;
export const MAX_PRESENTATION_MESSAGE_DEPTH = MAX_PRESENTATION_DATA_DEPTH + 1;

function text(value: unknown, label: string, max = 128): string {
  return boundedString(value, "presentation", label, 1, max);
}

function channel(value: unknown): string {
  const result = text(value, "channel", 256);
  for (const character of result) {
    const code = character.codePointAt(0)!;
    if (code <= 0x1f || code === 0x7f) fail("presentation", "channel contains control character");
  }
  return result;
}

function eventName(value: unknown): string {
  const result = text(value, "name", 128);
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
  if (frames.length > 128) fail("presentation", "frame interest limit exceeded");
  let previousFrame: string | null = null;
  let pairs = 0;
  for (const rawFrame of frames) {
    const frame = exact(rawFrame, ["frameId", "channels"], [], "presentation");
    const frameId = text(frame.frameId, "frameId");
    if (previousFrame !== null && !utf8LexicalLess(previousFrame, frameId)) {
      fail("presentation", "frames must be uniquely sorted");
    }
    previousFrame = frameId;
    const channels = array(frame.channels, "presentation", "channels");
    if (channels.length < 1 || channels.length > 64) {
      fail("presentation", "channels per frame limit exceeded");
    }
    let previousChannel: string | null = null;
    for (const rawChannel of channels) {
      const current = channel(rawChannel);
      if (previousChannel !== null && !utf8LexicalLess(previousChannel, current)) {
        fail("presentation", "channels must be uniquely sorted");
      }
      previousChannel = current;
      pairs += 1;
      if (pairs > 4096) fail("presentation", "interest pair limit exceeded");
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
  text(message.sourceSubsystemKey, "sourceSubsystemKey", 256);
  text(message.domainId, "domainId");
  text(message.targetKey, "targetKey");
  text(message.frameId, "frameId");
  text(message.activationId, "activationId");
  channel(message.channel);
  eventName(message.name);
  assertPayload(message.data, "presentation", MAX_PRESENTATION_DATA_DEPTH);
  return message as unknown as PresentationEventV1;
}
