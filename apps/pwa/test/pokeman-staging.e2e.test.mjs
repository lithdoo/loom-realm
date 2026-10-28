import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { openProduct } from "./helpers/browser.mjs";
import { createPokeManRoutePlanner } from "./helpers/pokeman.mjs";

const initial = Object.freeze({ mapId: 3, x: 3, y: 8, direction: 2 });

async function waitForMap(page, target) {
  await page.waitForFunction((state) => {
    const view = document.querySelector("lr-map-view");
    const player = document.querySelector("lr-map-sprite")?._latestData;
    return document.documentElement.dataset.loomrealmProduct === "ready"
      && view?.dataset.mapVisualState === "ready"
      && view?._latestData?.mapId === state.mapId
      && player?.x === state.x
      && player?.y === state.y
      && player?.direction === state.direction
      && player?.motion === null
      && window.__loomrealmPwa.failure === null;
  }, target, { timeout: 25_000 });
}

async function act(page, steps) {
  for (const step of steps) {
    await page.keyboard.press(step.code);
    await waitForMap(page, step.expected);
  }
  return steps.at(-1)?.expected;
}

async function waitForDialogue(page, text) {
  await page.waitForFunction((expected) => {
    const view = document.querySelector("lr-dialogue-view");
    return view?.shadowRoot.querySelector(".modal")?.hidden === false
      && view.querySelector("lr-dialogue-text")?.getAttribute("text") === expected;
  }, text, { timeout: 25_000 });
}

async function revealAndConfirm(page) {
  await page.keyboard.press("KeyZ");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true, null, { timeout: 25_000 });
  await page.keyboard.press("KeyZ");
}

// Observes the complete hidden transition history of the live Dialogue shell.
// Each mutation's resulting state is derived from the MutationRecord itself
// (oldValue === null → attribute added → hidden true; oldValue !== null →
// removed → false) so a transient false → true → false flash inside a single
// MutationObserver batch cannot pass unnoticed.
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

test("staging PokeMan boots, runs continuous Professor Dialogue, resumes Map, and reloads", { timeout: 180_000 }, async () => {
  const fixture = JSON.parse(await readFile(new URL("../dist/staging/pwa/pokeman/pokeman-bundle.json", import.meta.url), "utf8"));
  const planner = createPokeManRoutePlanner(fixture);
  const product = await openProduct({ viewport: { width: 960, height: 720 } });
  try {
    const { page, context, diagnostics } = product;
    await waitForMap(page, initial);
    assert.equal(await page.locator("game-controls-input").count(), 1);
    assert.equal(await page.locator('game-controls-input[data-input-disabled="duplicate"]').count(), 0);
    assert.equal(await page.evaluate(() => typeof window.__loomrealmPwaQualification), "undefined", "Staging must not expose qualification controls");

    const scope = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/pwa/pokeman/");
      return registration ? new URL(registration.scope).pathname : null;
    });
    assert.equal(scope, "/pwa/pokeman/");

    const installationId = await page.evaluate(() => window.__loomrealmPwa.installationId);
    assert.match(installationId, /./);
    const map = await page.evaluate(async (id) => {
      const res = await fetch(`/pwa/pokeman/_lr/v1/games/${encodeURIComponent(id)}/records/struct.Map/3`);
      return { status: res.status, value: res.ok ? await res.json() : null };
    }, installationId);
    assert.equal(map.status, 200);
    assert.equal(map.value.tileset_id, 3);
    assert.equal(map.value.width, 31);

    const map2 = planner.planToMap(initial, 2);
    assert.equal(map2.length, 1);
    let state = await act(page, map2);
    assert.equal(state.mapId, 2);

    const collision = planner.planNpcCollision(state);
    if (collision.travel.length > 0) state = await act(page, collision.travel);
    const before = state;
    state = await act(page, [collision.collision]);
    assert.equal(state.mapId, before.mapId);
    assert.equal(state.x, before.x);
    assert.equal(state.y, before.y);

    const toMap4 = planner.planToMap(state, 4);
    state = await act(page, toMap4);
    const professor = planner.planNpcCollision(state);
    assert.equal(professor.npc.instanceId, "professor");
    if (professor.travel.length > 0) state = await act(page, professor.travel);
    state = await act(page, [professor.collision]);

    // The real staging build must contain the updated v1.1 Presentation.
    const stagedDialogue = await page.evaluate(async (id) => {
      const response = await fetch(`/pwa/pokeman/_lr/v1/games/${encodeURIComponent(id)}/resources/resource.Presentation/dialogue/dialogue.browser.js`);
      return { status: response.status, body: await response.text() };
    }, installationId);
    assert.equal(stagedDialogue.status, 200);
    assert.match(stagedDialogue.body, /_shellPresented/, "staged Presentation must carry the v1.1 shell latch");
    assert.match(stagedDialogue.body, /setInteractionActive/, "staged Presentation must carry the v1.1 interaction gate");
    assert.match(stagedDialogue.body, /30% minmax\(0, 70%\)/, "staged Presentation must carry the v1.1 30/70 layout");

    await page.evaluate(() => {
      window.__stagingMapBeforeDialogue = document.querySelector("lr-map-view");
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
    assert.equal((await page.evaluate(() => window.__dialogueSessionBirths)).at(-1).initialHidden, true,
      "a fresh Dialogue session must be created from the initial hidden READY baseline");
    assert.equal(await page.evaluate(() => document.querySelector("lr-map-view") === window.__stagingMapBeforeDialogue), true,
      "Dialogue overlays the Map without replacing the Map view");
    await verifyDialogueObserverDetectsFlash(page);
    await observeDialogueShell(page);

    // A → READY → B must keep one continuous visible shell.
    await revealAndConfirm(page);
    await waitForDialogue(page, "准备好出发了吗？");
    await assertDialogueNeverHidden(page, "Conversation A → READY → B");

    // History stays interactive and full-width while the Conversation pauses.
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => document.querySelector("lr-dialogue-view")?._mode === "history", null, { timeout: 25_000 });
    const historyLayout = await page.evaluate(() => {
      const view = document.querySelector("lr-dialogue-view");
      const modal = view.shadowRoot.querySelector(".modal");
      const history = view.querySelector("lr-dialogue-history");
      return {
        viewInert: view.inert,
        conversationDisplay: getComputedStyle(view.querySelector("lr-dialogue-conversation")).display,
        characterDisplay: getComputedStyle(view.querySelector("lr-dialogue-characters")).display,
        fullWidth: Math.abs(history.getBoundingClientRect().width - (modal.clientWidth - 32)) < 2,
      };
    });
    assert.deepEqual(historyLayout, { viewInert: false, conversationDisplay: "none", characterDisplay: "none", fullWidth: true },
      "History owns interaction at full modal content width");
    await page.keyboard.press("KeyX");
    await page.waitForFunction(() => document.querySelector("lr-dialogue-view")?._mode === "conversation", null, { timeout: 25_000 });
    await assertDialogueNeverHidden(page, "Conversation B History open/close");

    // History paused the reveal; finish it before choosing (first commit only
    // reveals), then submit the ready choice.
    await page.keyboard.press("KeyZ");
    await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true, null, { timeout: 25_000 });
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(() => document.querySelector('lr-dialogue-choice[choice-id="ready"]')?.isSelected() === true, null, { timeout: 25_000 });
    await page.keyboard.press("KeyZ");
    await waitForDialogue(page, "很好，出发吧。");
    await assertDialogueNeverHidden(page, "Conversation B → READY → C");
    await revealAndConfirm(page);
    await page.locator("lr-dialogue-view").waitFor({ state: "detached", timeout: 25_000 });
    await waitForMap(page, state);
    assert.equal(await page.evaluate(() => document.querySelector("lr-map-view") === window.__stagingMapBeforeDialogue), true,
      "the same Map view remains mounted after the Dialogue session closes");

    const move = [
      { direction: 2, code: "ArrowDown", dx: 0, dy: 1 },
      { direction: 4, code: "ArrowLeft", dx: -1, dy: 0 },
      { direction: 6, code: "ArrowRight", dx: 1, dy: 0 },
      { direction: 8, code: "ArrowUp", dx: 0, dy: -1 },
    ].map((candidate) => ({ candidate, expected: planner.transition(state, candidate) }))
      .find(({ expected }) => expected.mapId === state.mapId && (expected.x !== state.x || expected.y !== state.y));
    assert.ok(move, "resumed Map must accept movement");
    state = await act(page, [{ ...move.candidate, expected: move.expected }]);

    // A second NPC interaction creates a fresh Dialogue session that starts from
    // the initial hidden READY baseline again.
    const firstSessionElement = await page.evaluate(() => window.__dialogueSessionBirths.length);
    const repeatProfessor = planner.planNpcCollision(state);
    assert.equal(repeatProfessor.npc.instanceId, "professor");
    if (repeatProfessor.travel.length > 0) state = await act(page, repeatProfessor.travel);
    state = await act(page, [repeatProfessor.collision]);
    await page.keyboard.press("KeyZ");
    await waitForDialogue(page, "你终于来了。");
    assert.equal(await page.evaluate(() => window.__dialogueSessionBirths.length), firstSessionElement + 1,
      "the second interaction must create a fresh Dialogue presentation");
    assert.equal((await page.evaluate(() => window.__dialogueSessionBirths)).at(-1).initialHidden, true,
      "the fresh second session starts with an initial READY hidden shell");
    await page.keyboard.press("KeyX");
    await page.locator("lr-dialogue-view").waitFor({ state: "detached", timeout: 25_000 });
    await waitForMap(page, state);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForMap(page, initial);
    assert.equal(await page.locator("game-controls-input").count(), 1);
    assert.equal(await page.locator('game-controls-input[data-input-disabled="duplicate"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__loomrealmPwa.installationId), installationId, "Refresh must reuse installed content");
    assert.equal(await page.evaluate(() => window.__loomrealmPwa.failure), null);
    const forbidden = await context.request.get(new URL("/service-worker.js", page.url()).href);
    assert.equal(forbidden.status(), 404, "Staging Service Worker must not be exposed at origin root");
    assert.deepEqual(diagnostics.filter((entry) => entry.startsWith("pageerror:")), []);
  } catch (cause) {
    throw new Error(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\nDiagnostics: ${product.diagnostics.join("\n")}`);
  } finally {
    await product.close();
  }
});
