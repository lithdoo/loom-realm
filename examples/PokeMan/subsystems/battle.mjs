import { cancelled, completed, defineSubsystem, failed } from "@loomrealm/subsystem";
import { BattlePresentationBuilder } from "@loomrealm-game/battle/presentation";
import { BattleSimulationBuilder } from "@loomrealm-game/battle/simulation";
import { DeepSeekDecision } from "@loomrealm-game/battle/decision";
import { DEEPSEEK_SESSION_CONFIG_KEY, isExactDeepSeekSessionConfig } from "./deepseek-config.mjs";
import { readBattleContracts, settleBattleContracts } from "./business-state.mjs";
import { resolveLabTutorialBattle } from "./battle-content.mjs";

export const DEEPSEEK_RESPONSES_ENDPOINT = "https://api.deepseek.com/responses";

const PAUSE_PROMPTS = Object.freeze({
  "host-background": Object.freeze({
    messageKey: "battle-host-background-paused",
    text: "战斗已暂停。游戏曾进入后台。",
    actions: Object.freeze([
      Object.freeze({ id: "continue", label: "继续战斗" }),
      Object.freeze({ id: "exit", label: "退出战斗" }),
    ]),
  }),
  "decision-circuit": Object.freeze({
    messageKey: "battle-decision-circuit-paused",
    text: "AI 决策连续失败，战斗已暂停。",
    actions: Object.freeze([
      Object.freeze({ id: "retry", label: "重试决策" }),
      Object.freeze({ id: "exit", label: "退出战斗" }),
    ]),
  }),
});

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validInput(value) {
  return exact(value, ["scenarioId", "source"]) && value.scenarioId === "lab-rival-tutorial"
    && exact(value.source, ["mapId", "rival"]) && value.source.mapId === 4
    && exact(value.source.rival, ["instanceId", "npcId"])
    && value.source.rival.instanceId === "rival-lab" && value.source.rival.npcId === "rival-lab";
}

export function createBattleClock(host = globalThis) {
  return Object.freeze({
    nowMs: () => host.performance?.now?.() ?? Date.now(),
    schedule(delayMs, callback) {
      const handle = host.setTimeout(callback, delayMs);
      return () => host.clearTimeout(handle);
    },
  });
}

export function createDeepSeekTransport(apiKey, fetchImpl = globalThis.fetch) {
  if (typeof apiKey !== "string" || apiKey.length === 0 || typeof fetchImpl !== "function") throw new TypeError("A configured DeepSeek transport is required");
  return Object.freeze({
    async postResponses(bodyText, signal) {
      const response = await fetchImpl(DEEPSEEK_RESPONSES_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: bodyText,
        signal,
      });
      return Object.freeze({ status: response.status, bodyText: await response.text() });
    },
  });
}

async function readDeepSeekConfiguration(state, signal) {
  const snapshot = await state.read([DEEPSEEK_SESSION_CONFIG_KEY], { signal });
  const record = snapshot?.records?.[0];
  if (!exact(snapshot, ["revision", "records"]) || snapshot.records.length !== 1
      || !exact(record, ["key", "version", "value"])
      || record.key?.namespace !== DEEPSEEK_SESSION_CONFIG_KEY.namespace || record.key?.key !== DEEPSEEK_SESSION_CONFIG_KEY.key
      || !Number.isSafeInteger(record.version) || record.version < 0 || !isExactDeepSeekSessionConfig(record.value)) {
    throw new TypeError("DeepSeek SessionConfig is unavailable or malformed");
  }
  return record.value;
}

function validMessageResult(value, prompt) {
  return exact(value, ["messageKey", "actionId"]) && value.messageKey === prompt.messageKey
    && prompt.actions.some((action) => action.id === value.actionId);
}

async function defaultSubscribeLifecycle(scope, listener) {
  return scope.events.subscribe(["host.lifecycle"], (event) => {
    if (event.channel === "host.lifecycle" && (event.type === "background" || event.type === "foreground")) listener(event.type);
  });
}

export function createPokeManBattleSubsystem(scope, dependencies = {}) {
  const readContracts = dependencies.readBattleContracts ?? readBattleContracts;
  const settleContracts = dependencies.settleBattleContracts ?? settleBattleContracts;
  const resolveBattle = dependencies.resolveLabTutorialBattle ?? resolveLabTutorialBattle;
  const readConfiguration = dependencies.readDeepSeekConfiguration ?? readDeepSeekConfiguration;
  const makeTransport = dependencies.createDeepSeekTransport ?? createDeepSeekTransport;
  const Decision = dependencies.DeepSeekDecision ?? DeepSeekDecision;
  const PresentationBuilder = dependencies.BattlePresentationBuilder ?? BattlePresentationBuilder;
  const SimulationBuilder = dependencies.BattleSimulationBuilder ?? BattleSimulationBuilder;
  const clockFactory = dependencies.createBattleClock ?? createBattleClock;
  const subscribeLifecycle = dependencies.subscribeLifecycle ?? defaultSubscribeLifecycle;

  return {
    async frame(frame) {
      if (!validInput(frame.params)) return failed({ code: "POKEMAN_BATTLE_INPUT_INVALID" });
      let runtime;
      let lifecycle;
      let removePauseListener;
      let childFailure;
      let foreground = true;
      let pendingPause;
      let promptInFlight = false;
      try {
        const authority = await readContracts(scope.state, { signal: frame.signal });
        const definition = await resolveBattle(scope.content, authority, { signal: frame.signal });
        const config = await readConfiguration(scope.state, frame.signal);
        const decision = dependencies.decision ?? new Decision({ transport: makeTransport(config.apiKey, dependencies.fetchImpl) });
        const presentation = dependencies.presentation ?? new PresentationBuilder(scope, frame).build();
        runtime = dependencies.runtime ?? new SimulationBuilder({
          clock: dependencies.clock ?? clockFactory(), signal: frame.signal, decision, presentation,
        }).build(definition);

        const showPendingPrompt = async () => {
          if (!foreground || promptInFlight || pendingPause === undefined) return;
          promptInFlight = true;
          const reason = pendingPause;
          pendingPause = undefined;
          const prompt = PAUSE_PROMPTS[reason];
          try {
            const outcome = await frame.call("message", prompt);
            if (outcome.type === "cancelled") { runtime.cancel(); return; }
            if (outcome.type === "failed") { childFailure = outcome.error.code; runtime.cancel(); return; }
            if (!validMessageResult(outcome.value, prompt)) { childFailure = "POKEMAN_MESSAGE_RESULT_INVALID"; runtime.cancel(); return; }
            if (outcome.value.actionId === "exit") runtime.cancel();
            else runtime.resume();
          } catch {
            childFailure = "POKEMAN_MESSAGE_CALL_FAILED";
            runtime.cancel();
          } finally {
            promptInFlight = false;
            if (pendingPause !== undefined) void showPendingPrompt();
          }
        };

        removePauseListener = runtime.onPause(({ reason }) => {
          pendingPause ??= reason;
          void showPendingPrompt();
        });
        lifecycle = await subscribeLifecycle(scope, (state) => {
          if (state === "background") {
            foreground = false;
            if (runtime.getSnapshot().status !== "paused") runtime.pause("host-background");
          } else {
            foreground = true;
            void showPendingPrompt();
          }
        });

        const result = await runtime.run();
        if (result.type === "cancelled") {
          return childFailure === undefined ? cancelled() : failed({ code: childFailure });
        }
        if (result.type === "failure") return failed({ code: `POKEMAN_BATTLE_${result.source.toUpperCase()}_FAILED`, data: { battleCode: result.code } });
        const snapshot = runtime.getSnapshot();
        const rival = snapshot.actors.find((actor) => actor.actorId === "rival");
        const player = snapshot.actors.find((actor) => actor.actorId === "player");
        if (rival === undefined || player === undefined) return failed({ code: "POKEMAN_BATTLE_FINAL_SNAPSHOT_INVALID" });
        const settlement = await settleContracts(scope.state, authority, { rival: rival.hp, player: player.hp });
        return completed({ battleId: snapshot.battleId, result: result.type, settlement: settlement.status === "committed" || settlement.status === "reconciled" ? "committed" : "not-applicable" });
      } catch (cause) {
        if (frame.signal.aborted) return cancelled();
        return failed({ code: "POKEMAN_BATTLE_INTEGRATION_FAILED", message: cause instanceof Error ? cause.message.slice(0, 512) : undefined });
      } finally {
        removePauseListener?.();
        lifecycle?.close();
        runtime?.close();
      }
    },
  };
}

export default defineSubsystem((scope) => createPokeManBattleSubsystem(scope));
