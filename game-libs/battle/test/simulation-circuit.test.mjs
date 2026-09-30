import assert from "node:assert/strict";
import { test } from "node:test";

import { BattleReplayBuilder, BattleSimulationBuilder, validateResolvedBattleDefinition } from "../dist/simulation.js";
import { ensureDecision } from "../dist/simulation/plan.js";
import { DecisionInbox, ScheduledEventQueue } from "../dist/simulation/queues.js";
import { createInitialState } from "../dist/simulation/state.js";
import { processOneTick } from "../dist/simulation/tick.js";
import { RecordingPresentation } from "../dist/presentation.js";

const flush = async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); };
const point = (x, y) => ({ x, y });
const forwardRange = { width: 1, height: 2, originX: 0, originY: 1, coefficientUnits: [[1000], [0]] };

class FakeBattleClock {
  now = 0;
  nextId = 1;
  tasks = [];
  nowMs() { return this.now; }
  schedule(delayMs, callback) {
    const task = { id: this.nextId++, due: this.now + delayMs, callback, cancelled: false };
    this.tasks.push(task);
    return () => { task.cancelled = true; };
  }
  advance(ms) {
    const target = this.now + ms;
    while (true) {
      const task = this.tasks.filter((item) => !item.cancelled && item.due <= target).sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!task) break;
      task.cancelled = true;
      this.now = task.due;
      task.callback();
    }
    this.now = target;
  }
  jump(ms) {
    this.now += ms;
    const task = this.tasks.filter((item) => !item.cancelled && item.due <= this.now).sort((a, b) => a.due - b.due || a.id - b.id)[0];
    if (task) { task.cancelled = true; task.callback(); }
  }
}

class ManualDecision {
  requests = [];
  decide(request, signal) {
    return new Promise((resolve, reject) => this.requests.push({ request, signal, resolve, reject }));
  }
  fail(index, code = `failure-${index}`, category = "attempt_failure") {
    const item = this.requests[index];
    item.resolve({
      type: "failed", requestId: item.request.requestId, generation: item.request.generation,
      error: { category, code },
    });
  }
  complete(index, plan) {
    const item = this.requests[index];
    item.resolve({ type: "completed", requestId: item.request.requestId, generation: item.request.generation, plan });
  }
}

class CountingPresentation extends RecordingPresentation {
  pauseCount = 0;
  resumeCount = 0;
  pause() { this.pauseCount += 1; super.pause(); }
  resume() { this.resumeCount += 1; super.resume(); }
}

function definition() {
  return {
    battleId: "battle:circuit", sceneEpoch: 1, battleSeed: "circuit-seed", tickDurationMs: 200,
    moveTicks: 2, protectionTicks: 0, maxPathSteps: 6,
    map: { ref: { mapId: 1 }, width: 7, height: 7, passable: Array.from({ length: 7 }, () => Array(7).fill(true)) },
    actors: [
      {
        actorId: "a", team: "ally", tile: point(2, 3), direction: 6, maxHp: 5,
        character: { namespace: "resource.Graphics", key: "Characters/A" },
        skills: [{ skillId: "strike", baseDamage: 5, windupTicks: 0, recoveryTicks: 0, range: forwardRange, effect: "strike" }],
      },
      {
        actorId: "b", team: "enemy", tile: point(3, 3), direction: 4, maxHp: 5,
        character: { namespace: "resource.Graphics", key: "Characters/B" },
        skills: [{ skillId: "strike", baseDamage: 5, windupTicks: 0, recoveryTicks: 0, range: forwardRange, effect: "strike" }],
      },
    ],
  };
}

function liveRuntime(decision = new ManualDecision()) {
  const clock = new FakeBattleClock();
  const presentation = new CountingPresentation();
  const runtime = new BattleSimulationBuilder({
    clock, signal: new AbortController().signal, decision, presentation,
  }).build(definition());
  return { runtime, clock, presentation, decision };
}

async function establishTwoFailures(live) {
  live.runtime.run();
  await flush();
  assert.equal(live.decision.requests.length, 2);
  live.decision.fail(0, "network-a");
  live.decision.fail(1, "totally-different-code-b");
  await flush();
  live.clock.advance(200);
  assert.equal(live.runtime.getSnapshot().currentTick, 1);
  assert.equal(live.runtime.getSnapshot().status, "running");
  live.clock.advance(200);
  assert.equal(live.decision.requests.length, 4);
}

test("T-DEC-023/025/026/027/033/035: third provider-neutral failure latches after ordered signals, invokes same-Tick command, and preserves it while paused", async () => {
  const live = liveRuntime();
  const run = live.runtime.run();
  await flush();
  live.decision.fail(0, "network");
  live.decision.fail(1, "rate-limited");
  await flush();
  live.clock.advance(200);
  assert.equal(live.runtime.getSnapshot().status, "running");
  live.clock.advance(200);

  live.decision.fail(2, "opaque-third-code");
  live.decision.complete(3, { path: [point(4, 3)] });
  await flush();
  live.clock.advance(200);

  const paused = live.runtime.getSnapshot();
  assert.equal(paused.currentTick, 3);
  assert.equal(paused.status, "paused");
  assert.equal(live.presentation.pauseCount, 1);
  assert.equal(live.decision.requests.length, 5, "b's prefetch command must be invoked before circuit pause");
  assert.equal(live.decision.requests[4].request.actorId, "b");
  assert.equal(live.decision.requests[4].signal.aborted, false);
  const pausedActor = paused.actors.find((actor) => actor.actorId === "b");
  assert.equal(pausedActor.decision, "thinking");

  live.decision.complete(4, { path: [] });
  await flush();
  live.clock.advance(10_000);
  assert.equal(live.runtime.getSnapshot().currentTick, 3);
  assert.equal(live.decision.requests[4].signal.aborted, false);

  live.runtime.resume();
  assert.equal(live.presentation.resumeCount, 1);
  live.clock.advance(199);
  assert.equal(live.runtime.getSnapshot().currentTick, 3);
  live.clock.advance(1);
  assert.equal(live.runtime.getSnapshot().currentTick, 4);
  assert.equal(live.runtime.getReplay().decisions.some((item) => item.requestId === live.decision.requests[4].request.requestId), true);
  live.runtime.cancel();
  assert.deepEqual(await run, { type: "cancelled" });
});

test("T-DEC-024/028/029: reducer emits success before rejection, no signal for stale/session-fatal, and keeps stable actor order", () => {
  const resolved = validateResolvedBattleDefinition(definition());
  const state = createInitialState(resolved);
  const requests = new Map();
  for (const actor of [...state.actors.values()].sort((a, b) => a.actorId.localeCompare(b.actorId))) {
    const command = ensureDecision(resolved, state, actor, [], "initial", 0);
    requests.set(command.request.requestId, command.request);
  }
  state.currentTick = 1;
  state.status = "running";
  const inbox = new DecisionInbox();
  const a = state.actors.get("a").decision;
  const b = state.actors.get("b").decision;
  inbox.enqueue({ actorId: "b", completion: { type: "completed", requestId: b.requestId, generation: b.generation, plan: { path: [point(99, 99)] } } });
  inbox.enqueue({ actorId: "a", completion: { type: "failed", requestId: "stale-request", generation: a.generation - 1, error: { category: "attempt_failure", code: "ignored" } } });
  requests.set("stale-request", { ...requests.get(a.requestId), requestId: "stale-request", generation: a.generation - 1 });
  const output = processOneTick(resolved, state, new ScheduledEventQueue(), inbox, [], requests);
  assert.deepEqual(output.decisionHealthSignals, ["success"]);
  assert.equal(output.decisionRecords[0].consumeOutcome.type, "stale");
  assert.equal(output.decisionRecords[1].consumeOutcome.type, "rejected");

  const fatalState = createInitialState(resolved);
  const fatalRequests = new Map();
  const fatalActor = fatalState.actors.get("a");
  const fatalCommand = ensureDecision(resolved, fatalState, fatalActor, [], "initial", 0);
  fatalRequests.set(fatalCommand.request.requestId, fatalCommand.request);
  fatalState.currentTick = 1;
  fatalState.status = "running";
  const fatalInbox = new DecisionInbox();
  fatalInbox.enqueue({ actorId: "a", completion: {
    type: "failed", requestId: fatalCommand.request.requestId, generation: fatalCommand.request.generation,
    error: { category: "session_fatal", code: "arbitrary-opaque-fatal" },
  } });
  const fatal = processOneTick(resolved, fatalState, new ScheduledEventQueue(), fatalInbox, [], fatalRequests);
  assert.deepEqual(fatal.decisionHealthSignals, []);
  assert.deepEqual(fatal.terminalCandidate, { type: "failure", source: "decision", code: "arbitrary-opaque-fatal" });
});

test("T-DEC-029: session_fatal bypasses the availability threshold and terminates immediately", async () => {
  const live = liveRuntime();
  const run = live.runtime.run();
  await flush();
  live.decision.fail(0, "opaque-auth-or-anything", "session_fatal");
  await flush();
  live.clock.advance(200);
  assert.deepEqual(await run, { type: "failure", source: "decision", code: "opaque-auth-or-anything" });
  assert.equal(live.presentation.pauseCount, 0);
  assert.equal(live.runtime.getSnapshot().status, "closed");
});

test("T-DEC-030/031: circuit resume resets the guard, while ordinary pause/resume preserves an existing streak", async () => {
  const circuit = liveRuntime();
  const circuitRun = circuit.runtime.run();
  await flush();
  circuit.decision.fail(0);
  circuit.decision.fail(1);
  await flush();
  circuit.clock.advance(200);
  circuit.clock.advance(200);
  circuit.decision.fail(2);
  await flush();
  circuit.clock.advance(200);
  assert.equal(circuit.runtime.getSnapshot().status, "paused");
  circuit.runtime.resume();
  circuit.clock.advance(200);
  assert.equal(circuit.runtime.getSnapshot().status, "running", "one post-resume failure starts a new streak instead of re-tripping");
  circuit.runtime.cancel();
  await circuitRun;

  const ordinary = liveRuntime();
  const ordinaryRun = ordinary.runtime.run();
  await flush();
  ordinary.decision.fail(0);
  ordinary.decision.fail(1);
  await flush();
  ordinary.clock.advance(200);
  ordinary.runtime.pause();
  assert.equal(ordinary.decision.requests[0].signal.aborted, false);
  ordinary.clock.advance(5_000);
  ordinary.runtime.resume();
  ordinary.clock.advance(200);
  ordinary.decision.fail(2);
  await flush();
  ordinary.clock.advance(200);
  assert.equal(ordinary.runtime.getSnapshot().status, "paused", "ordinary resume must not clear the two-failure streak");
  ordinary.runtime.cancel();
  await ordinaryRun;
});

test("T-DEC-034: late-wake trip cuts logical time at Tick N and resume never replays the discarded wall-time backlog", async () => {
  const live = liveRuntime();
  const run = live.runtime.run();
  await flush();
  live.decision.fail(0);
  live.decision.fail(1);
  await flush();
  live.clock.advance(200);
  live.clock.advance(200);
  live.decision.fail(2);
  await flush();

  live.clock.jump(1_600);
  assert.equal(live.clock.now, 2_000);
  assert.equal(live.runtime.getSnapshot().currentTick, 3);
  assert.equal(live.runtime.getSnapshot().status, "paused");
  assert.deepEqual(live.presentation.projections.map((item) => item.tick), [0, 1, 2, 3]);

  live.runtime.resume();
  live.clock.advance(199);
  assert.equal(live.runtime.getSnapshot().currentTick, 3);
  live.clock.advance(1);
  assert.equal(live.runtime.getSnapshot().currentTick, 4);
  live.runtime.cancel();
  await run;
});

test("T-DEC-032/036: deterministic Replay consumes the same failure trace without a live guard or circuit pause", async () => {
  const live = liveRuntime();
  const liveRun = live.runtime.run();
  await flush();
  live.decision.fail(0, "one");
  live.decision.fail(1, "two");
  await flush();
  live.clock.advance(200);
  live.clock.advance(200);
  live.decision.fail(2, "three");
  live.decision.complete(3, { path: [point(4, 3)] });
  await flush();
  live.clock.advance(200);
  assert.equal(live.runtime.getSnapshot().status, "paused");
  assert.equal(live.decision.requests.length, 5);
  live.decision.fail(4, "fatal-after-human-resume", "session_fatal");
  await flush();
  live.runtime.resume();
  live.clock.advance(200);
  const result = await liveRun;
  assert.deepEqual(result, { type: "failure", source: "decision", code: "fatal-after-human-resume" });
  const record = live.runtime.getReplay();
  const liveSnapshot = live.runtime.getSnapshot();
  assert.equal(record.replayability.type, "deterministic");

  const replayClock = new FakeBattleClock();
  const replayPresentation = new CountingPresentation();
  const replay = new BattleReplayBuilder({
    clock: replayClock, signal: new AbortController().signal, presentation: replayPresentation,
  }).build(record);
  const replayRun = replay.run();
  await flush();
  replayClock.advance(800);
  assert.deepEqual(await replayRun, result);
  assert.equal(replayPresentation.pauseCount, 0);
  assert.deepEqual(replay.getSnapshot(), liveSnapshot);
  assert.deepEqual(replay.getReplay().decisions, record.decisions);
});
