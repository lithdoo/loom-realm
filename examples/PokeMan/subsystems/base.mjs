import { defineSubsystem } from "@loomrealm/subsystem";
import { ensureDeepSeekConfiguration } from "./deepseek-config.mjs";
import { ensurePokeManBaseline } from "./business-state.mjs";

export async function runBaseFrame(scope, frame, {
  ensureConfiguration = ensureDeepSeekConfiguration,
  ensureBaseline = ensurePokeManBaseline,
} = {}) {
  await ensureConfiguration(scope, frame);
  if (frame.signal.aborted) {
    const reason = frame.signal.reason;
    throw reason instanceof Error && reason.name === "AbortError"
      ? reason
      : new DOMException("Base Frame aborted", "AbortError");
  }
  const baseline = scope.state === undefined
    ? null
    : await ensureBaseline(scope.state, { signal: frame.signal });
  if (frame.signal.aborted) {
    const reason = frame.signal.reason;
    throw reason instanceof Error && reason.name === "AbortError"
      ? reason
      : new DOMException("Base Frame aborted", "AbortError");
  }
  const inputHost = scope.createRenderDomain({
    zIndex: 0,
    roots: [{
      key: "game-controls-input",
      tag: "game-controls-input",
      attrs: {},
      data: {},
      children: [],
    }],
  });
  try {
    const mapInput = baseline === null ? frame.params : {
      ...baseline.playerWorld,
      characterName: "Player",
    };
    return await frame.call("map", mapInput);
  } finally {
    inputHost.close();
  }
}

export default defineSubsystem((scope) => ({
  frame: (frame) => runBaseFrame(scope, frame),
}));
