import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { MAP_ONLY_NPC_PLACEMENTS } from "../../../examples/PokeMan/subsystems/map.mjs";
import { createPokeManPwaFixture } from "../../../examples/PokeMan/scripts/prepare-pwa-content.mjs";
import { openProduct } from "./helpers/browser.mjs";
import { createPokeManRoutePlanner } from "./helpers/pokeman.mjs";

const executablePaths = Object.freeze({
  base: join(import.meta.dirname, "..", "dist", "qualification", "pokeman-base-subsystem.mjs"),
  map: join(import.meta.dirname, "..", "dist", "qualification", "pokeman-map-subsystem.mjs"),
  dialogue: join(import.meta.dirname, "..", "dist", "qualification", "pokeman-dialogue-subsystem.mjs"),
});

const movements = Object.freeze([
  Object.freeze({ direction: 2, code: "ArrowDown", dx: 0, dy: 1 }),
  Object.freeze({ direction: 4, code: "ArrowLeft", dx: -1, dy: 0 }),
  Object.freeze({ direction: 6, code: "ArrowRight", dx: 1, dy: 0 }),
  Object.freeze({ direction: 8, code: "ArrowUp", dx: 0, dy: -1 }),
]);

const renderDataDiagnostic = process.env.LOOMREALM_RENDER_DATA_DIAGNOSTIC === "1";

async function mapSnapshot(page) {
  return page.evaluate(() => {
    const view = document.querySelector("lr-map-view");
    const sprites = [...document.querySelectorAll("lr-map-sprite")].map((element) => element._latestData);
    const player = sprites[0];
    return {
      mapId: view?._latestData?.mapId ?? null,
      visual: view?.dataset.mapVisualState ?? null,
      player: player ? { x: player.x, y: player.y, direction: player.direction, motion: player.motion } : null,
      npcs: sprites.slice(1).map((npc) => ({ x: npc.x, y: npc.y, direction: npc.direction })),
      product: document.documentElement.dataset.loomrealmProduct ?? null,
      presentation: document.documentElement.dataset.loomrealmPresentation ?? null,
      renderer: document.documentElement.dataset.loomrealmRenderer ?? null,
      failure: window.__loomrealmPwa.failure,
      sessionEpoch: window.__loomrealmPwa.sessionEpoch,
    };
  });
}

async function waitForState(page, expected) {
  await page.waitForFunction((target) => {
    const view = document.querySelector("lr-map-view");
    const player = document.querySelector("lr-map-sprite")?._latestData;
    return view?.dataset.mapVisualState === "ready"
      && view?._latestData?.mapId === target.mapId
      && player?.x === target.x
      && player?.y === target.y
      && player?.direction === target.direction
      && player?.motion === null
      && document.documentElement.dataset.loomrealmProduct === "ready"
      && window.__loomrealmPwa.failure === null;
  }, expected, { timeout: 20_000 });
}

async function runActions(page, actions, history, samples = null) {
  for (const action of actions) {
    history.push(Object.freeze({ code: action.code, expected: action.expected }));
    const before = samples === null ? null : await page.evaluate(() => ({
      at: performance.now(),
      visualEpoch: document.querySelector("lr-map-view")?._latestData?.visualEpoch ?? null,
    }));
    await page.keyboard.press(action.code);
    await waitForState(page, action.expected);
    if (before !== null) {
      const after = await page.evaluate(() => ({
        at: performance.now(),
        visualEpoch: document.querySelector("lr-map-view")?._latestData?.visualEpoch ?? null,
      }));
      samples.push(Object.freeze({
        code: action.code,
        durationMs: after.at - before.at,
        refresh: after.visualEpoch !== before.visualEpoch,
      }));
    }
  }
  return actions.at(-1)?.expected ?? null;
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
}

function traceTaskSummary(events) {
  const names = new Map();
  for (const event of events) {
    if (event.ph === "M" && event.name === "thread_name") {
      names.set(`${event.pid}:${event.tid}`, event.args?.name ?? "unknown");
    }
  }
  const tasks = events.filter((event) => /RunTask$/u.test(event.name) && typeof event.dur === "number");
  const summarize = (matching) => {
    const selected = tasks.filter((event) => matching(names.get(`${event.pid}:${event.tid}`) ?? ""));
    const durations = selected.map((event) => event.dur / 1_000);
    return {
      count: durations.length,
      longTasks: durations.filter((duration) => duration >= 50).length,
      maxMs: durations.length === 0 ? 0 : Math.max(...durations),
      p95Ms: percentile(durations, 0.95) ?? 0,
    };
  };
  return {
    main: summarize((name) => /CrRendererMain/u.test(name)),
    worker: summarize((name) => /Worker/u.test(name)),
    threads: [...new Set(names.values())].sort(),
  };
}

function traceCpuSummary(events) {
  const profiles = new Map();
  for (const event of events) {
    if (event.name !== "ProfileChunk") continue;
    const data = event.args?.data;
    const cpu = data?.cpuProfile;
    if (cpu === undefined) continue;
    const key = `${event.pid}:${event.tid}:${event.id ?? "profile"}`;
    let profile = profiles.get(key);
    if (profile === undefined) {
      profile = { nodes: new Map(), weighted: new Map(), total: 0 };
      profiles.set(key, profile);
    }
    for (const node of cpu.nodes ?? []) profile.nodes.set(node.id, node.callFrame ?? {});
    for (let index = 0; index < (cpu.samples?.length ?? 0); index += 1) {
      const nodeId = cpu.samples[index];
      const weight = data.timeDeltas?.[index] ?? 1;
      profile.total += weight;
      profile.weighted.set(nodeId, (profile.weighted.get(nodeId) ?? 0) + weight);
    }
  }
  let total = 0;
  let validation = 0;
  let stringify = 0;
  const functions = new Map();
  for (const profile of profiles.values()) {
    total += profile.total;
    for (const [nodeId, weight] of profile.weighted) {
      const frame = profile.nodes.get(nodeId) ?? {};
      const label = `${frame.functionName ?? "(anonymous)"} ${frame.url ?? ""}`;
      functions.set(label, (functions.get(label) ?? 0) + weight);
      if (/validat|assertJson|renderJsonValue|clonePresentationJson|cloneJsonValue/u.test(label)) validation += weight;
      if (/stringify|stringifyJsonValue/u.test(label)) stringify += weight;
    }
  }
  const top = [...functions].sort((left, right) => right[1] - left[1]).slice(0, 15)
    .map(([name, weight]) => ({ name, percent: total === 0 ? 0 : weight * 100 / total }));
  return {
    sampledMicros: total,
    validationPercent: total === 0 ? 0 : validation * 100 / total,
    stringifyPercent: total === 0 ? 0 : stringify * 100 / total,
    top,
  };
}

async function beginRenderDataDiagnostic(page, context) {
  await page.evaluate(() => {
    const state = { frameGaps: [], longTasks: [], running: true };
    let previous = performance.now();
    const frame = (at) => {
      if (!state.running) return;
      state.frameGaps.push(at - previous);
      previous = at;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    });
    observer.observe({ type: "longtask", buffered: true });
    globalThis.__renderDataDiagnostic = { state, observer };
  });
  const session = await context.newCDPSession(page);
  await session.send("Tracing.start", {
    categories: "toplevel,devtools.timeline,v8,blink.user_timing,disabled-by-default-v8.cpu_profiler",
    options: "sampling-frequency=10000",
    transferMode: "ReturnAsStream",
  });
  return async () => {
    const complete = new Promise((resolve) => session.once("Tracing.tracingComplete", resolve));
    await session.send("Tracing.end");
    const { stream } = await complete;
    let text = "";
    for (;;) {
      const part = await session.send("IO.read", { handle: stream });
      text += part.data;
      if (part.eof) break;
    }
    await session.send("IO.close", { handle: stream });
    await session.detach();
    const browser = await page.evaluate(() => {
      const diagnostic = globalThis.__renderDataDiagnostic;
      diagnostic.state.running = false;
      diagnostic.observer.disconnect();
      const view = document.querySelector("lr-map-view");
      const frameGaps = diagnostic.state.frameGaps.slice(1);
      return {
        longTasks: diagnostic.state.longTasks,
        frameGaps: {
          count: frameGaps.length,
          over50: frameGaps.filter((gap) => gap >= 50).length,
          maxMs: frameGaps.length === 0 ? 0 : Math.max(...frameGaps),
          p95Ms: frameGaps.length === 0 ? 0 : [...frameGaps].sort((left, right) => left - right)[Math.max(0, Math.ceil(frameGaps.length * 0.95) - 1)],
        },
        tiles: view?._latestData?.tiles?.length ?? 0,
      };
    });
    const events = JSON.parse(text).traceEvents;
    return { browser, tasks: traceTaskSummary(events), cpu: traceCpuSummary(events) };
  };
}

function responsiveFacingPlan(planner, state) {
  for (const first of movements) {
    const afterFirst = planner.transition(state, first);
    if (afterFirst.mapId !== state.mapId || Math.abs(afterFirst.x - state.x) + Math.abs(afterFirst.y - state.y) !== 1) continue;
    for (const second of movements) {
      if (first.dx * second.dx + first.dy * second.dy !== 0) continue;
      const afterSecond = planner.transition(afterFirst, second);
      if (afterSecond.mapId === state.mapId && Math.abs(afterSecond.x - afterFirst.x) + Math.abs(afterSecond.y - afterFirst.y) === 1) {
        return { first, second, afterFirst, afterSecond };
      }
    }
  }
  throw new Error(`No perpendicular facing qualification route from ${JSON.stringify(state)}`);
}

async function installMapContinuityProbe(page) {
  await page.evaluate(() => {
    const view = document.querySelector("lr-map-view");
    const originalCommit = view._commitAtomic.bind(view);
    window.__mapAtomicPromotes = [];
    window.__mapFacingRecords = [];
    const previousQualification = window.__loomrealmMovementQualification;
    window.__loomrealmMovementQualification = (record) => {
      if (typeof previousQualification === "function") previousQualification(record);
      window.__mapFacingRecords.push(record);
    };
    view._commitAtomic = function (prepared, sequence) {
      const oldScene = this._acceptedVisualScene;
      const replacement = oldScene && oldScene.view.sceneEpoch !== prepared.view.sceneEpoch;
      const oldVisuals = oldScene?.sprites.map((entry) => entry.visual).filter(Boolean) ?? [];
      const incomingVisuals = prepared.sprites.map((entry) => entry.visual).filter(Boolean);
      const before = replacement ? {
        oldMapId: oldScene.view.mapId,
        targetMapId: prepared.view.mapId,
        oldSpriteCount: oldVisuals.length,
        oldNpcCount: Math.max(0, oldVisuals.length - 1),
        targetSpriteCount: incomingVisuals.length,
        oldCompleteAndVisible: oldVisuals.every((visual) => visual.isConnected && !visual.hidden),
        targetCompleteAndDetached: incomingVisuals.length === this._spriteChildren().length
          && incomingVisuals.every((visual) => !visual.isConnected),
        visibleBefore: this.shadowRoot.querySelectorAll("canvas.sprite-visual:not([hidden])").length,
        stagingEpoch: this._stagingVisualScene?.sceneEpoch ?? null,
      } : null;
      const result = originalCommit(prepared, sequence);
      if (before && this._acceptedVisualScene === prepared) {
        window.__mapAtomicPromotes.push({
          ...before,
          visibleAfter: this.shadowRoot.querySelectorAll("canvas.sprite-visual:not([hidden])").length,
          targetAccepted: this._acceptedVisualScene.view.sceneEpoch === prepared.view.sceneEpoch,
          oldReleased: oldVisuals.every((visual) => !visual.isConnected),
          targetVisible: incomingVisuals.every((visual) => visual.isConnected && !visual.hidden),
        });
      }
      return result;
    };
  });
}

async function qualifyResponsiveFacing(page, planner, state, history) {
  const plan = responsiveFacingPlan(planner, state);
  history.push({ code: `${plan.first.code}(down)`, expected: plan.afterFirst });
  await page.keyboard.down(plan.first.code);
  await page.waitForFunction((target) => {
    const player = document.querySelector("lr-map-sprite")?._latestData;
    return player?.motion !== null && player?.x === target.x && player?.y === target.y && player?.direction === target.direction;
  }, plan.afterFirst, { timeout: 20_000 });
  const before = await page.evaluate(() => {
    const view = document.querySelector("lr-map-view");
    const player = document.querySelector("lr-map-sprite")._latestData;
    const visual = view._acceptedVisualScene.sprites[0].visual;
    window.__responsiveFacingVisual = visual;
    window.__mapFacingRecords.length = 0;
    return {
      player: structuredClone(player),
      view: structuredClone(view._latestData),
      startedAt: view._activeMotion.startedAt,
      cropKey: visual._cropKey,
    };
  });
  await page.keyboard.down(plan.second.code);
  await page.waitForFunction(({ direction, motionId }) => {
    const view = document.querySelector("lr-map-view");
    const player = document.querySelector("lr-map-sprite")?._latestData;
    const visual = view?._acceptedVisualScene?.sprites[0]?.visual;
    return player?.direction === direction && player?.motionId === motionId && visual?._cropKey.includes(`|${direction}|`)
      && window.__mapFacingRecords.some((record) => record.name === "browser-facing-paint" && record.detail.direction === direction);
  }, { direction: plan.second.direction, motionId: before.player.motionId }, { timeout: 20_000 });
  const facing = await page.evaluate(() => {
    const view = document.querySelector("lr-map-view");
    const player = document.querySelector("lr-map-sprite")._latestData;
    const visual = view._acceptedVisualScene.sprites[0].visual;
    const paint = window.__mapFacingRecords.find((record) => record.name === "browser-facing-paint");
    return {
      player: structuredClone(player),
      view: structuredClone(view._latestData),
      sameVisual: visual === window.__responsiveFacingVisual,
      startedAt: view._activeMotion.startedAt,
      paintAt: paint.at,
    };
  });
  assert.deepEqual({ ...facing.player, direction: before.player.direction }, before.player, "facing-only update must preserve the committed trajectory");
  assert.deepEqual(facing.view, before.view, "facing-only update must not mutate MapView trajectory or projection facts");
  assert.equal(facing.sameVisual, true);
  assert.equal(facing.startedAt, before.startedAt, "facing-only update must preserve the active Browser timeline");
  await page.keyboard.up(plan.first.code);
  await page.waitForFunction(({ motionId, target }) => {
    const player = document.querySelector("lr-map-sprite")?._latestData;
    return player?.motionId !== null && player.motionId !== motionId && player.x === target.x && player.y === target.y;
  }, { motionId: before.player.motionId, target: plan.afterSecond }, { timeout: 20_000 });
  const nextReceivedAt = await page.evaluate((motionId) => window.__mapFacingRecords.find((record) => record.name === "presentation-received"
    && record.detail.element === "map-sprite" && record.detail.motionId !== motionId)?.at, before.player.motionId);
  assert.equal(facing.paintAt < nextReceivedAt, true, "first facing paint must precede current-step completion/next-step presentation");
  await page.keyboard.up(plan.second.code);
  await waitForState(page, plan.afterSecond);
  history.push({ code: `${plan.second.code}(active facing)`, expected: plan.afterSecond });
  return plan.afterSecond;
}

async function assertNpcProjection(page, mapId) {
  const expected = (MAP_ONLY_NPC_PLACEMENTS[mapId] ?? [])
    .map(({ x, y, direction }) => ({ x, y, direction }))
    .sort((left, right) => left.x - right.x || left.y - right.y || left.direction - right.direction);
  const observed = (await mapSnapshot(page)).npcs
    .sort((left, right) => left.x - right.x || left.y - right.y || left.direction - right.direction);
  assert.deepEqual(observed, expected, `Map ${mapId} NPC projection mismatch`);
}

async function waitForDialogue(page, text) {
  await page.waitForFunction((expected) => {
    const view = document.querySelector("lr-dialogue-view");
    const conversation = view?.querySelector("lr-dialogue-conversation");
    return view?.shadowRoot.querySelector(".modal")?.hidden === false
      && conversation?.querySelector("lr-dialogue-text")?.getAttribute("text") === expected;
  }, text, { timeout: 20_000 });
}

// Installs an observer that records the complete hidden transition history of
// the live Dialogue modal/backdrop. Each mutation's resulting state is derived
// from the MutationRecord itself (oldValue === null → attribute added → hidden
// true; oldValue !== null → removed → false) so a transient false → true →
// false flash inside a single MutationObserver batch cannot pass unnoticed.
async function observeDialogueShell(page) {
  await page.evaluate(() => {
    const view = document.querySelector("lr-dialogue-view");
    const modal = view.shadowRoot.querySelector(".modal");
    const backdrop = view.shadowRoot.querySelector(".backdrop");
    const history = { modal: [modal.hidden], backdrop: [backdrop.hidden] };
    const derive = (record) => {
      if (record.type !== "attributes" || record.attributeName !== "hidden") return;
      const key = record.target === modal ? "modal" : "backdrop";
      const next = record.oldValue === null;
      if (history[key].at(-1) !== next) history[key].push(next);
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) derive(record);
    });
    observer.observe(modal, { attributes: true, attributeFilter: ["hidden"], attributeOldValue: true });
    observer.observe(backdrop, { attributes: true, attributeFilter: ["hidden"], attributeOldValue: true });
    window.__dialogueShellHiddenHistory = history;
  });
}

// Self-check: prove the record-based derivation above catches a same-batch
// transient flash on a scratch element before trusting it for the real shell.
async function verifyDialogueObserverDetectsFlash(page) {
  const probe = await page.evaluate(async () => {
    const scratch = document.createElement("div");
    document.body.append(scratch);
    const transitions = [scratch.hidden];
    const derive = (record) => {
      if (record.type !== "attributes" || record.attributeName !== "hidden") return;
      const next = record.oldValue === null;
      if (transitions.at(-1) !== next) transitions.push(next);
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) derive(record);
    });
    observer.observe(scratch, { attributes: true, attributeFilter: ["hidden"], attributeOldValue: true });
    scratch.hidden = true;
    scratch.hidden = false;
    await new Promise((resolve) => setTimeout(resolve, 0));
    observer.disconnect();
    scratch.remove();
    return transitions;
  });
  assert.deepEqual(probe, [false, true, false],
    "the hidden-transition observer must detect a same-batch transient flash, not only the final state");
}

async function assertDialogueNeverHidden(page, stage) {
  const history = await page.evaluate(() => window.__dialogueShellHiddenHistory);
  for (const [key, transitions] of Object.entries(history)) {
    const firstVisible = transitions.indexOf(false);
    assert.notEqual(firstVisible, -1, `${stage}: Dialogue ${key} must be visible (${transitions})`);
    assert.equal(transitions.slice(firstVisible).includes(true), false,
      `${stage}: Dialogue ${key} must never become hidden between Conversations (${transitions})`);
  }
}

async function revealAndConfirm(page) {
  await page.keyboard.press("KeyZ");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true, null, { timeout: 20_000 });
  await page.keyboard.press("KeyZ");
}

async function completeProfessorDialogue(page) {
  await waitForDialogue(page, "你终于来了。");
  await verifyDialogueObserverDetectsFlash(page);
  await observeDialogueShell(page);
  await revealAndConfirm(page);
  await waitForDialogue(page, "准备好出发了吗？");
  await assertDialogueNeverHidden(page, "Conversation A → READY → B");
  await page.keyboard.press("KeyZ");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true, null, { timeout: 20_000 });
  const conversationId = await page.locator("lr-dialogue-conversation").getAttribute("conversation-id");
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => {
    const view = document.querySelector("lr-dialogue-view");
    return view?._mode === "history"
      && [...view.querySelectorAll("lr-dialogue-history-entry")].some((entry) => entry.getAttribute("text") === "你终于来了。");
  }, null, { timeout: 20_000 });
  await page.keyboard.press("KeyX");
  await page.waitForFunction((expectedId) => {
    const view = document.querySelector("lr-dialogue-view");
    return view?._mode === "conversation"
      && view.querySelector("lr-dialogue-conversation")?.getAttribute("conversation-id") === expectedId;
  }, conversationId, { timeout: 20_000 });
  await assertDialogueNeverHidden(page, "Conversation B History open/close");
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => document.querySelector('lr-dialogue-choice[choice-id="ready"]')?.isSelected() === true, null, { timeout: 20_000 });
  await page.keyboard.press("KeyZ");
  await waitForDialogue(page, "很好，出发吧。");
  await assertDialogueNeverHidden(page, "Conversation B → READY → C");
  await revealAndConfirm(page);
  await page.locator("lr-dialogue-view").waitFor({ state: "detached", timeout: 20_000 });
}

test("PokeMan installs and runs its Map plus child-Frame Dialogue route in real Chromium", { timeout: 180_000 }, async () => {
  const fixture = await createPokeManPwaFixture({ executablePaths });
  const planner = createPokeManRoutePlanner(fixture);
  const product = await openProduct({ viewport: renderDataDiagnostic
    ? { width: 1920, height: 1080 }
    : { width: 960, height: 720 } });
  const history = [];
  try {
    const { page, context, diagnostics } = product;
    const installationId = await page.evaluate(async (value) => {
      const decode = (entry) => Uint8Array.from(atob(entry.body), (character) => character.charCodeAt(0));
      const installed = await window.__loomrealmPwaQualification.install({
        formatVersion: 1,
        gameEntryText: value.gameEntryText,
        launchManifestText: value.launchManifestText,
        content: value.content.map((entry) => ({
          kind: entry.kind,
          namespace: entry.namespace,
          key: entry.key,
          mime: entry.mime,
          body: new Blob([decode(entry)], { type: entry.mime }),
        })),
        executables: value.executables.map((entry) => ({
          logicalModule: entry.logicalModule,
          mime: entry.mime,
          body: new Blob([entry.source], { type: entry.mime }),
        })),
      });
      await window.__loomrealmPwaQualification.launch(installed.installationId, value.presentation);
      return installed.installationId;
    }, fixture);

    const initial = Object.freeze({ mapId: 3, x: 3, y: 8, direction: 2 });
    await page.locator("lr-map-view").waitFor({ state: "attached", timeout: 20_000 });
    await waitForState(page, initial);
    assert.equal(await page.locator("game-controls-input").count(), 1, "Base must keep exactly one active controls producer while Map is active");
    assert.equal(await page.locator('game-controls-input[data-input-disabled="duplicate"]').count(), 0);
    assert.deepEqual(await mapSnapshot(page), {
      mapId: 3,
      visual: "ready",
      player: { x: 3, y: 8, direction: 2, motion: null },
      npcs: [{ x: 6, y: 8, direction: 4 }],
      product: "ready",
      presentation: "ready",
      renderer: "installed",
      failure: null,
      sessionEpoch: (await mapSnapshot(page)).sessionEpoch,
    });
    await assertNpcProjection(page, 3);

    await installMapContinuityProbe(page);
    let state = await qualifyResponsiveFacing(page, planner, initial, history);
    assert.equal(state.mapId, 3);

    // The initial contact transfer must enter Map 2 once and remain there,
    // rather than immediately bouncing back to Map 3.
    const toMap2 = planner.planToMap(state, 2);
    assert.ok(toMap2.length > 0);
    state = await runActions(page, toMap2, history);
    await page.waitForTimeout(500);
    let observed = await mapSnapshot(page);
    assert.deepEqual({ mapId: observed.mapId, x: observed.player.x, y: observed.player.y }, { mapId: 2, x: 8, y: 7 });
    await assertNpcProjection(page, 2);

    // Reach an adjacent tile and prove the rendered Map runtime rejects a
    // movement into the static NPC, without substituting an input-event count.
    const collision = planner.planNpcCollision(state);
    const beforeTravel = state;
    if (collision.travel.length > 0) state = await runActions(page, collision.travel, history);
    assert.ok(collision.travel.some((action) => action.expected.mapId === beforeTravel.mapId
      && (action.expected.x !== beforeTravel.x || action.expected.y !== beforeTravel.y)), "route must prove legal movement");
    const beforeCollision = await mapSnapshot(page);
    state = await runActions(page, [collision.collision], history);
    const afterCollision = await mapSnapshot(page);
    assert.deepEqual(
      { mapId: afterCollision.mapId, x: afterCollision.player.x, y: afterCollision.player.y },
      { mapId: beforeCollision.mapId, x: beforeCollision.player.x, y: beforeCollision.player.y },
    );

    const toProfessorMap = planner.planToMap(state, 4);
    assert.ok(toProfessorMap.length > 0);
    state = await runActions(page, toProfessorMap, history);
    await assertNpcProjection(page, 4);
    const professor = planner.planNpcCollision(state);
    assert.equal(professor.npc.instanceId, "professor");
    if (professor.travel.length > 0) state = await runActions(page, professor.travel, history);
    state = await runActions(page, [professor.collision], history);
    await page.evaluate(() => {
      window.__pokemanMapBeforeDialogue = document.querySelector("lr-map-view");
      window.__pokemanDialogueBeforeRepeat = null;
      // Records the initial hidden state of every lr-dialogue-view at creation
      // time, so a session's initial READY can be observed deterministically.
      const births = [];
      const originalCreateElement = document.createElement.bind(document);
      document.createElement = function (localName, options) {
        const element = originalCreateElement(localName, options);
        if (localName === "lr-dialogue-view") births.push({ initialHidden: element.shadowRoot.querySelector(".modal").hidden });
        return element;
      };
      window.__dialogueSessionBirths = births;
    });
    await page.keyboard.press("KeyZ");
    await waitForDialogue(page, "你终于来了。");
    assert.equal(await page.locator("lr-dialogue-view").count(), 1);
    assert.equal(await page.locator("game-controls-input").count(), 1);
    assert.equal(await page.evaluate(() => document.querySelector("lr-map-view") === window.__pokemanMapBeforeDialogue), true);
    assert.equal((await page.evaluate(() => window.__dialogueSessionBirths)).at(-1).initialHidden, true,
      "a fresh Dialogue session must be created from the initial hidden READY baseline");
    await page.evaluate(() => { window.__pokemanDialogueBeforeRepeat = document.querySelector("lr-dialogue-view"); });
    await completeProfessorDialogue(page);
    await waitForState(page, state);
    assert.equal(await page.evaluate(() => document.querySelector("lr-map-view") === window.__pokemanMapBeforeDialogue), true);

    const moves = [
      { direction: 2, code: "ArrowDown", dx: 0, dy: 1 },
      { direction: 4, code: "ArrowLeft", dx: -1, dy: 0 },
      { direction: 6, code: "ArrowRight", dx: 1, dy: 0 },
      { direction: 8, code: "ArrowUp", dx: 0, dy: -1 },
    ];
    const move = moves.map((candidate) => ({ candidate, expected: planner.transition(state, candidate) }))
      .find(({ expected }) => expected.mapId === state.mapId && (expected.x !== state.x || expected.y !== state.y));
    assert.ok(move, "Map A2 must have a legal movement from the Professor interaction tile");
    state = await runActions(page, [{ ...move.candidate, expected: move.expected }], history);
    const repeatProfessor = planner.planNpcCollision(state);
    assert.equal(repeatProfessor.npc.instanceId, "professor");
    if (repeatProfessor.travel.length > 0) state = await runActions(page, repeatProfessor.travel, history);
    state = await runActions(page, [repeatProfessor.collision], history);
    await page.keyboard.press("KeyZ");
    await waitForDialogue(page, "你终于来了。");
    assert.equal(await page.evaluate(() => document.querySelector("lr-dialogue-view") !== window.__pokemanDialogueBeforeRepeat), true,
      "second interaction must create a fresh Dialogue presentation");
    assert.equal((await page.evaluate(() => window.__dialogueSessionBirths)).at(-1).initialHidden, true,
      "the second fresh Dialogue session must start from the initial hidden READY baseline");
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => document.querySelector("lr-dialogue-view")?._mode === "history", null, { timeout: 20_000 });
    assert.equal(await page.locator("lr-dialogue-history-entry").count(), 0, "second Dialogue session must start with fresh History");
    await page.keyboard.press("KeyX");
    await page.waitForFunction(() => document.querySelector("lr-dialogue-view")?._mode === "conversation", null, { timeout: 20_000 });
    await page.keyboard.press("KeyX");
    await page.locator("lr-dialogue-view").waitFor({ state: "detached", timeout: 20_000 });
    await waitForState(page, state);

    for (const targetMapId of [2, 8, 2, 5, 7]) {
      const actions = planner.planToMap(state, targetMapId);
      assert.ok(actions.length > 0, `Map ${state.mapId} must route to Map ${targetMapId}`);
      state = await runActions(page, actions, history);
      observed = await mapSnapshot(page);
      assert.equal(observed.mapId, targetMapId);
      assert.equal(observed.visual, "ready");
      assert.equal(observed.failure, null);
      if ([4, 5, 7, 8].includes(targetMapId)) await assertNpcProjection(page, targetMapId);
    }

    const longTraversal = planner.planDistance(state, renderDataDiagnostic ? 70 : 20);
    assert.ok(longTraversal.length >= 20, "Map 7 qualification must cross multiple projection boundaries");
    const projectionShiftsBefore = await page.evaluate(() => document.querySelector("lr-map-view")?._projectionShifts ?? 0);
    const diagnosticSamples = [];
    const finishDiagnostic = renderDataDiagnostic ? await beginRenderDataDiagnostic(page, context) : null;
    state = await runActions(page, longTraversal, history, renderDataDiagnostic ? diagnosticSamples : null);
    const diagnostic = finishDiagnostic === null ? null : await finishDiagnostic();
    const continuity = await page.evaluate(() => {
      const view = document.querySelector("lr-map-view");
      return {
        promotes: window.__mapAtomicPromotes,
        surfaces: {
          shifts: view._projectionShifts,
          allocations: view._surfaceAllocations,
          resizes: view._surfaceResizes,
          fullPasses: view._fullRasterPasses,
          live: view._liveSurfaceCount,
          liveSet: view._liveSurfaces.size,
          active: view._layers.length,
          pool: view._surfacePool.length,
        },
      };
    });
    assert.ok(continuity.promotes.length >= 6, "real route must observe every cross-map atomic promote");
    assert.equal(continuity.promotes.some((record) => record.oldNpcCount > 0), true, "at least one transfer must retain old NPC pixels");
    for (const record of continuity.promotes) {
      assert.equal(record.oldCompleteAndVisible, true, `${record.oldMapId}->${record.targetMapId}: old scene must remain complete before promote`);
      assert.equal(record.targetCompleteAndDetached, true, `${record.oldMapId}->${record.targetMapId}: target scene must be complete and detached before promote`);
      assert.equal(record.visibleBefore, record.oldSpriteCount);
      assert.equal(record.visibleAfter, record.targetSpriteCount);
      assert.equal(record.targetAccepted, true);
      assert.equal(record.oldReleased, true);
      assert.equal(record.targetVisible, true);
    }
    assert.ok(continuity.surfaces.shifts >= 2, "long Map 7 traversal must perform multiple incremental projection shifts");
    assert.equal(continuity.surfaces.live, continuity.surfaces.liveSet);
    assert.ok(continuity.surfaces.pool <= 4, "surface reuse pool must remain fixed-budget");
    assert.ok(continuity.surfaces.live <= continuity.surfaces.active + 4, "live surfaces must be bounded by active depths plus the pool budget");
    if (diagnostic !== null) {
      const refresh = diagnosticSamples.filter((sample) => sample.refresh);
      const report = {
        subject: process.env.GITHUB_SHA ?? "local-worktree",
        route: "PokeMan Map 7 real PWA Worker → Data → Renderer → browser",
        viewport: "1920x1080",
        movements: diagnosticSamples.length,
        projectionShifts: continuity.surfaces.shifts - projectionShiftsBefore,
        action: {
          p50Ms: percentile(diagnosticSamples.map((sample) => sample.durationMs), 0.5),
          p95Ms: percentile(diagnosticSamples.map((sample) => sample.durationMs), 0.95),
          p99Ms: percentile(diagnosticSamples.map((sample) => sample.durationMs), 0.99),
          maxMs: Math.max(...diagnosticSamples.map((sample) => sample.durationMs)),
          refreshCount: refresh.length,
          refreshMaxMs: refresh.length === 0 ? 0 : Math.max(...refresh.map((sample) => sample.durationMs)),
        },
        ...diagnostic,
      };
      assert.equal(report.movements >= 20, true);
      assert.equal(report.projectionShifts >= 2, true);
      assert.equal(report.browser.longTasks.filter((entry) => entry.duration >= 100).length, 0, JSON.stringify(report.browser));
      assert.equal(report.tasks.main.count > 0, true, JSON.stringify(report.tasks));
      assert.equal(report.tasks.worker.count > 0, true, JSON.stringify(report.tasks));
      assert.equal(report.tasks.main.maxMs < 100, true, JSON.stringify(report.tasks.main));
      assert.equal(report.tasks.worker.maxMs < 100, true, JSON.stringify(report.tasks.worker));
      const artifacts = join(import.meta.dirname, "..", "..", "..", "artifacts");
      await mkdir(artifacts, { recursive: true });
      await writeFile(join(artifacts, "render-data-runtime-pwa-diagnostic.json"), `${JSON.stringify(report, null, 2)}\n`);
      process.stdout.write(`RENDER_DATA_PWA_DIAGNOSTIC ${JSON.stringify(report)}\n`);
    }

    const routes = await page.evaluate(async (id) => {
      const requests = {
        map: `/_lr/v1/games/${encodeURIComponent(id)}/records/struct.Map/3`,
        presentation: `/_lr/v1/games/${encodeURIComponent(id)}/resources/resource.Presentation/map/map.browser.js`,
        baseExecutable: `/_lr/internal/executables/${encodeURIComponent(id)}/subsystems/base.mjs`,
        mapExecutable: `/_lr/internal/executables/${encodeURIComponent(id)}/subsystems/map.mjs`,
        dialogueExecutable: `/_lr/internal/executables/${encodeURIComponent(id)}/subsystems/dialogue.mjs`,
      };
      const output = {};
      for (const [name, url] of Object.entries(requests)) {
        const response = await fetch(url);
        output[name] = {
          status: response.status,
          mime: response.headers.get("content-type"),
          version: response.headers.get("x-loom-content-version"),
          body: await response.text(),
        };
      }
      return output;
    }, installationId);
    assert.equal(routes.map.status, 200);
    assert.equal(routes.map.mime, "application/json; charset=utf-8");
    assert.match(routes.map.version, /^sha256:[0-9a-f]{64}$/);
    assert.equal(JSON.parse(routes.map.body).tileset_id, 3);
    assert.equal(routes.presentation.status, 200);
    assert.match(routes.presentation.mime, /^text\/javascript/);
    assert.match(routes.presentation.version, /^sha256:[0-9a-f]{64}$/);
    assert.equal(routes.baseExecutable.status, 200);
    assert.match(routes.baseExecutable.mime, /^text\/javascript/);
    assert.match(routes.baseExecutable.version, /^sha256:[0-9a-f]{64}$/);
    assert.match(routes.baseExecutable.body, /game-controls-input/);
    assert.equal(routes.mapExecutable.status, 200);
    assert.match(routes.mapExecutable.mime, /^text\/javascript/);
    assert.match(routes.mapExecutable.version, /^sha256:[0-9a-f]{64}$/);
    assert.match(routes.mapExecutable.body, /RPGMapBuilder/);
    assert.equal(routes.dialogueExecutable.status, 200);
    assert.match(routes.dialogueExecutable.mime, /^text\/javascript/);
    assert.match(routes.dialogueExecutable.version, /^sha256:[0-9a-f]{64}$/);
    assert.match(routes.dialogueExecutable.body, /professor-vertical-slice/);
    assert.doesNotMatch(routes.mapExecutable.body, /from\s*["']@loomrealm/u);

    await context.setOffline(true);
    try {
      const offline = await page.evaluate(async (id) => {
        const response = await fetch(`/_lr/v1/games/${encodeURIComponent(id)}/resources/resource.Graphics/Characters/Player`);
        return {
          status: response.status,
          mime: response.headers.get("content-type"),
          version: response.headers.get("x-loom-content-version"),
          signature: [...new Uint8Array(await response.arrayBuffer()).slice(0, 8)],
        };
      }, installationId);
      assert.deepEqual(offline, {
        status: 200,
        mime: "image/png",
        version: offline.version,
        signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      });
      assert.match(offline.version, /^sha256:[0-9a-f]{64}$/);
    } finally {
      await context.setOffline(false);
    }

    const previousEpoch = (await mapSnapshot(page)).sessionEpoch;
    await page.evaluate(() => window.__loomrealmPwaQualification.restart());
    await page.waitForFunction((epoch) => window.__loomrealmPwa.sessionEpoch !== epoch, previousEpoch, { timeout: 20_000 });
    await page.locator("lr-map-view").waitFor({ state: "attached", timeout: 20_000 });
    await waitForState(page, initial);
    assert.equal(await page.locator("game-controls-input").count(), 1);
    assert.equal(await page.locator('game-controls-input[data-input-disabled="duplicate"]').count(), 0);
    await assertNpcProjection(page, 3);
    const restarted = await mapSnapshot(page);
    assert.notEqual(restarted.sessionEpoch, previousEpoch);
    assert.equal(restarted.failure, null);
    assert.equal(restarted.presentation, "ready");
    assert.equal(restarted.renderer, "installed");
    assert.deepEqual(diagnostics.filter((entry) => entry.startsWith("pageerror:")), []);
    assert.equal(await page.evaluate(() => window.__loomrealmPwa.statuses.some((entry) => entry?.status === "failed")), false);
  } catch (cause) {
    const snapshot = await mapSnapshot(product.page).catch(() => null);
    throw new Error(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\nActions: ${JSON.stringify(history)}\nSnapshot: ${JSON.stringify(snapshot)}\nDiagnostics: ${product.diagnostics.join("\n")}`);
  } finally {
    await product.close();
  }
});
