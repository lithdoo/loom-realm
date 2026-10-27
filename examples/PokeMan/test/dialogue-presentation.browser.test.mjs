import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(root, "presentation/dialogue.browser.js");
const cssPath = path.join(root, "presentation/dialogue.css");
const spritePath = path.join(root, "[FSDB]PokeMan/[resource]Graphics/Characters/Professor.png");
const spriteBytes = await readFile(spritePath);
const spriteVersion = `sha256:${createHash("sha256").update(spriteBytes).digest("hex")}`;
const tags = [
  "lr-dialogue-view",
  "lr-dialogue-characters",
  "lr-dialogue-character",
  "lr-dialogue-conversation",
  "lr-dialogue-text",
  "lr-dialogue-choices",
  "lr-dialogue-choice",
  "lr-dialogue-controls",
  "lr-dialogue-control-hint",
  "lr-dialogue-history",
  "lr-dialogue-history-entry",
];
const actions = ["confirm", "previous", "next", "history", "cancel"];
const version = `sha256:${"a".repeat(64)}`;

function executablePath() {
  return [
    process.env.LOOMREALM_CHROMIUM_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find(existsSync);
}

async function pageFixture(t, { reduced = false } = {}) {
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ path: cssPath });
  await page.addScriptTag({ path: scriptPath });
  await page.evaluate(() => {
    globalThis.makeDialogueFixture = ({ text = "这是一段用于测试逐字显示的中文长文本。", choices = [], characters = [], historyEntries = [] } = {}) => {
      const emitted = [];
      const view = document.createElement("lr-dialogue-view");
      const characterList = document.createElement("lr-dialogue-characters");
      for (const item of characters) {
        const character = document.createElement("lr-dialogue-character");
        character.setAttribute("character-id", item.id);
        character.setAttribute("display-name", item.name ?? item.id);
        character.setAttribute("active", item.active ? "true" : "false");
        characterList.append(character);
      }
      const conversation = document.createElement("lr-dialogue-conversation");
      conversation.receiveRenderContext({ resources: { resource: async () => { throw new Error("unconfigured resource"); } }, emitCustomEvent(name, data = {}) { emitted.push({ name, data }); } });
      conversation.setAttribute("conversation-id", "conversation-1");
      conversation.setAttribute("speaker-name", "向导");
      const textElement = document.createElement("lr-dialogue-text");
      textElement.setAttribute("text", text);
      const choiceList = document.createElement("lr-dialogue-choices");
      for (const item of choices) {
        const choice = document.createElement("lr-dialogue-choice");
        choice.setAttribute("choice-id", item.id);
        choice.setAttribute("text", item.text ?? item.id);
        choice.setAttribute("enabled", item.enabled === false ? "false" : "true");
        choiceList.append(choice);
      }
      conversation.append(textElement, choiceList);
      const controls = document.createElement("lr-dialogue-controls");
      for (const action of ["confirm", "previous", "next", "history", "cancel"]) {
        const hint = document.createElement("lr-dialogue-control-hint");
        hint.setAttribute("action", action);
        hint.setAttribute("label", action);
        hint.setAttribute("enabled", "false");
        controls.append(hint);
      }
      const history = document.createElement("lr-dialogue-history");
      history.setAttribute("visible", "false");
      for (const item of historyEntries) {
        const entry = document.createElement("lr-dialogue-history-entry");
        entry.setAttribute("entry-id", item.id);
        if (item.speaker) entry.setAttribute("speaker-name", item.speaker);
        entry.setAttribute("text", item.text);
        history.append(entry);
      }
      view.append(characterList, conversation, controls, history);
      document.body.append(view);
      return { view, characterList, conversation, textElement, choiceList, controls, history, emitted };
    };
  });
  return page;
}

test("classic artifact registers every canonical tag and collision preflight is atomic", async (t) => {
  const source = await readFile(scriptPath, "utf8");
  assert.doesNotMatch(source, /^\s*(?:import|export)\s/m);
  const page = await pageFixture(t);
  assert.deepEqual(await page.evaluate((names) => names.map((name) => [name, typeof customElements.get(name)]), tags), tags.map((tag) => [tag, "function"]));

  const collisionBrowser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => collisionBrowser.close());
  const collisionPage = await collisionBrowser.newPage();
  await collisionPage.setContent("<!doctype html><html><body></body></html>");
  await collisionPage.evaluate(() => customElements.define("lr-dialogue-choice", class extends HTMLElement {}));
  const failure = collisionPage.waitForEvent("pageerror");
  await collisionPage.addScriptTag({ path: scriptPath });
  assert.match((await failure).message, /collision/);
  assert.equal(await collisionPage.evaluate(() => customElements.get("lr-dialogue-view") === undefined), true);
});

test("READY/ACTIVE visibility, first-active layout, fallback, and semantic hints are deterministic", async (t) => {
  const page = await pageFixture(t);
  assert.equal(await page.evaluate(() => {
    const view = document.createElement("lr-dialogue-view");
    const controls = document.createElement("lr-dialogue-controls");
    for (const action of ["confirm", "previous", "next", "history"]) {
      const hint = document.createElement("lr-dialogue-control-hint");
      hint.setAttribute("action", action);
      hint.setAttribute("enabled", action === "confirm" ? "true" : "false");
      controls.append(hint);
    }
    view.append(controls);
    document.body.append(view);
    const hidden = view.shadowRoot.querySelector(".modal").hidden;
    view.remove();
    return hidden;
  }), true, "an incomplete canonical control set must remain hidden");
  const initial = await page.evaluate(() => {
    const fixture = makeDialogueFixture({
      characters: [
        { id: "inactive", active: false },
        { id: "first", name: "甲", active: true },
        { id: "second", name: "乙", active: true },
      ],
    });
    globalThis.fixture = fixture;
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    return {
      hidden: modal.hidden,
      inert: fixture.view.inert,
      slotDisplay: getComputedStyle(fixture.view.shadowRoot.querySelector("slot")).display,
      presented: [...fixture.characterList.children].map((character) => character._presented),
    };
  });
  assert.deepEqual(initial, { hidden: true, inert: true, slotDisplay: "contents", presented: [false, true, false] });

  const active = await page.evaluate(() => {
    const { view, controls, characterList } = fixture;
    controls.querySelector('[action="confirm"]').setAttribute("enabled", "true");
    const modal = view.shadowRoot.querySelector(".modal");
    const activeCharacter = characterList.children[1];
    activeCharacter.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Missing", contentVersion: `sha256:${"a".repeat(64)}` } });
    return {
      hidden: modal.hidden,
      inert: view.inert,
      withCharacter: modal.classList.contains("with-character"),
      columns: getComputedStyle(modal).gridTemplateColumns.split(" ").map((value) => Number.parseFloat(value)),
      fallback: activeCharacter._spriteStatus,
      label: modal.getAttribute("aria-label"),
      hints: [...controls.children].map((hint) => hint.shadowRoot.querySelector(".hint").textContent),
      physical: controls.shadowRoot.textContent,
    };
  });
  assert.equal(active.hidden, false);
  assert.equal(active.inert, false);
  assert.equal(active.withCharacter, true);
  assert.ok(Math.abs(active.columns[0] / (active.columns[0] + active.columns[1]) - 0.32) < 0.01);
  assert.equal(active.fallback, "fallback");
  assert.equal(active.label, "对话");
  assert.deepEqual(active.hints, ["继续", "上一个", "下一个", "历史", "返回"]);
  assert.doesNotMatch(active.physical, /Enter|Space|Arrow|Gamepad|\[A\]|\[B\]|\[Y\]/i);

  const noCharacter = await page.evaluate(() => {
    for (const character of fixture.characterList.children) character.setAttribute("active", "false");
    const modal = fixture.view.shadowRoot.querySelector(".modal");
    return {
      withCharacter: modal.classList.contains("with-character"),
      columns: getComputedStyle(modal).gridTemplateColumns,
    };
  });
  assert.equal(noCharacter.withCharacter, false);
  assert.equal(noCharacter.columns.split(" ").length, 1, "transient speaker/no active character must use full width");
});

test("typewriter text is not a live region while dialog, choice, and history semantics remain intact", async (t) => {
  const page = await pageFixture(t, { reduced: true });
  const semantics = await page.evaluate(() => {
    const fixture = makeDialogueFixture({
      text: "逐字文本只应视觉更新，不应反复触发辅助技术播报。",
      choices: [{ id: "continue", text: "继续" }],
      historyEntries: [{ id: "intro", speaker: "博士", text: "欢迎" }],
    });
    fixture.controls.querySelector('[action="confirm"]').setAttribute("enabled", "true");
    const visibleText = fixture.textElement.shadowRoot.querySelector(".text");
    const composedLiveAncestor = (start) => {
      let current = start;
      while (current) {
        if (current instanceof Element && current.hasAttribute("aria-live")) return current.getAttribute("aria-live");
        const root = current.getRootNode();
        current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
      }
      return null;
    };
    return {
      visibleText: visibleText.textContent,
      liveAncestor: composedLiveAncestor(visibleText),
      conversationLive: fixture.conversation.shadowRoot.querySelector(".conversation").getAttribute("aria-live"),
      dialog: {
        role: fixture.view.shadowRoot.querySelector(".modal").getAttribute("role"),
        modal: fixture.view.shadowRoot.querySelector(".modal").getAttribute("aria-modal"),
        label: fixture.view.shadowRoot.querySelector(".modal").getAttribute("aria-label"),
      },
      choices: {
        role: fixture.choiceList.shadowRoot.querySelector(".choice-list").getAttribute("role"),
        optionRole: fixture.choiceList.children[0].shadowRoot.querySelector(".choice").getAttribute("role"),
      },
      historyLabelledBy: fixture.history.shadowRoot.querySelector(".history").getAttribute("aria-labelledby"),
      historyHeading: fixture.history.shadowRoot.querySelector("h2").textContent,
    };
  });
  assert.deepEqual(semantics, {
    visibleText: "逐字文本只应视觉更新，不应反复触发辅助技术播报。",
    liveAncestor: null,
    conversationLive: null,
    dialog: { role: "dialog", modal: "true", label: "对话" },
    choices: { role: "listbox", optionRole: "option" },
    historyLabelledBy: "pokeman-dialogue-history-heading",
    historyHeading: "HISTORY",
  });
});

test("reveal, exact submits, disabled navigation, wrap-around, and pointer boundary work", async (t) => {
  const page = await pageFixture(t);
  const result = await page.evaluate(async () => {
    const fixture = makeDialogueFixture({
      text: "逐字显示必须先完成，再允许提交。",
      choices: [
        { id: "disabled", enabled: false },
        { id: "one" },
        { id: "two" },
      ],
    });
    fixture.controls.querySelector('[action="confirm"]').setAttribute("enabled", "true");
    fixture.controls.querySelector('[action="previous"]').setAttribute("enabled", "true");
    fixture.controls.querySelector('[action="next"]').setAttribute("enabled", "true");
    fixture.conversation.receiveRenderEvent({ name: "commit", data: {} });
    const revealOnly = { complete: fixture.conversation._revealComplete, emitted: structuredClone(fixture.emitted) };
    fixture.conversation.receiveRenderEvent({ name: "choice-next", data: {} });
    const first = fixture.conversation._selectedChoiceId;
    fixture.conversation.receiveRenderEvent({ name: "choice-previous", data: {} });
    const wrappedBack = fixture.conversation._selectedChoiceId;
    fixture.conversation.receiveRenderEvent({ name: "choice-next", data: {} });
    const wrappedForward = fixture.conversation._selectedChoiceId;
    fixture.conversation.receiveRenderEvent({ name: "commit", data: {} });
    for (const type of ["pointerdown", "pointerup", "click", "touchstart", "touchend"]) {
      fixture.choiceList.children[1].dispatchEvent(new Event(type, { bubbles: true, composed: true }));
      fixture.history.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
    }
    return {
      revealOnly,
      first,
      wrappedBack,
      wrappedForward,
      emitted: fixture.emitted,
      disabledAria: fixture.choiceList.children[0].shadowRoot.querySelector(".choice").getAttribute("aria-disabled"),
      selectedAria: fixture.choiceList.children[1].shadowRoot.querySelector(".choice").getAttribute("aria-selected"),
      marker: fixture.choiceList.children[1].shadowRoot.querySelector(".marker").textContent,
    };
  });
  assert.deepEqual(result.revealOnly, { complete: true, emitted: [] });
  assert.equal(result.first, "one");
  assert.equal(result.wrappedBack, "two");
  assert.equal(result.wrappedForward, "one");
  assert.deepEqual(result.emitted, [{ name: "submit", data: { conversationId: "conversation-1", choiceId: "one" } }]);
  assert.equal(result.disabledAria, "true");
  assert.equal(result.selectedAria, "true");
  assert.equal(result.marker, "✓");

  const noChoice = await page.evaluate(() => {
    document.body.replaceChildren();
    const fixture = makeDialogueFixture({ text: "" });
    fixture.controls.querySelector('[action="confirm"]').setAttribute("enabled", "true");
    fixture.conversation.setPresented(true);
    fixture.conversation.receiveRenderEvent({ name: "commit", data: {} });
    return fixture.emitted;
  });
  assert.deepEqual(noChoice, [{ name: "submit", data: { conversationId: "conversation-1" } }]);
});

test("History switches synchronously, preserves local state, pauses reveal, and handles empty history", async (t) => {
  const page = await pageFixture(t);
  await page.evaluate(() => {
    globalThis.fixture = makeDialogueFixture({
      text: "这段文字足够长，用于观察打开历史记录时逐字显示会暂停，并在返回后继续。",
      choices: [{ id: "one" }, { id: "two" }],
      characters: [{ id: "guide", active: true }],
    });
    fixture.controls.querySelector('[action="confirm"]').setAttribute("enabled", "true");
    fixture.controls.querySelector('[action="history"]').setAttribute("enabled", "true");
    fixture.conversation.receiveRenderEvent({ name: "choice-next", data: {} });
  });
  await page.waitForFunction(() => fixture.conversation._revealIndex > 0);
  const state = await page.evaluate(async () => {
    const { view, conversation, characterList, history } = fixture;
    const modal = view.shadowRoot.querySelector(".modal");
    const beforeRect = modal.getBoundingClientRect().toJSON();
    const beforeIndex = conversation._revealIndex;
    history.setAttribute("visible", "true");
    const synchronous = { mode: view._mode, presented: conversation._presented, historyMode: modal.classList.contains("history-mode") };
    history.receiveRenderEvent({ name: "scroll-to-latest", data: {} });
    history.receiveRenderEvent({ name: "scroll-up", data: {} });
    history.receiveRenderEvent({ name: "scroll-down", data: {} });
    await new Promise((resolve) => setTimeout(resolve, 90));
    const pausedIndex = conversation._revealIndex;
    const duringRect = modal.getBoundingClientRect().toJSON();
    const displays = {
      character: getComputedStyle(characterList).display,
      conversation: getComputedStyle(conversation).display,
      history: getComputedStyle(history).display,
    };
    const empty = history.shadowRoot.querySelector(".empty");
    history.setAttribute("visible", "false");
    const preservedSelection = conversation._selectedChoiceId;
    await new Promise((resolve) => setTimeout(resolve, 70));
    return {
      beforeRect, duringRect, beforeIndex, pausedIndex, resumedIndex: conversation._revealIndex,
      synchronous, displays, emptyHidden: empty.hidden, emptyText: empty.textContent,
      eventMode: history._lastEventMode, events: history._events, preservedSelection,
    };
  });
  assert.deepEqual(state.synchronous, { mode: "history", presented: false, historyMode: true });
  assert.equal(state.eventMode, "history", "visible reconciliation must finish before scroll-to-latest");
  assert.equal(state.pausedIndex, state.beforeIndex);
  assert.ok(state.resumedIndex > state.pausedIndex);
  assert.equal(state.preservedSelection, "one");
  assert.deepEqual(state.displays, { character: "none", conversation: "none", history: "block" });
  assert.equal(state.emptyHidden, false);
  assert.equal(state.emptyText, "暂无历史记录");
  assert.deepEqual(state.events, ["scroll-to-latest", "scroll-up", "scroll-down"]);
  assert.deepEqual({ x: state.duringRect.x, y: state.duringRect.y, width: state.duringRect.width, height: state.duringRect.height }, { x: state.beforeRect.x, y: state.beforeRect.y, width: state.beforeRect.width, height: state.beforeRect.height });
});

test("READY hides and inerts retained DOM while stopping background reveal", async (t) => {
  const page = await pageFixture(t);
  await page.evaluate(() => {
    globalThis.fixture = makeDialogueFixture({ text: "这是一段很长的文字，用来确认对话结束进入 READY 后仍保留的 DOM 不会在后台继续逐字显示。" });
    fixture.controls.querySelector('[action="confirm"]').setAttribute("enabled", "true");
  });
  await page.waitForFunction(() => fixture.conversation._revealIndex > 0);
  const result = await page.evaluate(async () => {
    for (const hint of fixture.controls.children) hint.setAttribute("enabled", "false");
    const index = fixture.conversation._revealIndex;
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      index,
      later: fixture.conversation._revealIndex,
      retained: document.querySelector("lr-dialogue-conversation") === fixture.conversation,
      hidden: fixture.view.shadowRoot.querySelector(".modal").hidden,
      inert: fixture.view.inert,
      presented: fixture.conversation._presented,
    };
  });
  assert.deepEqual(result, { index: result.index, later: result.index, retained: true, hidden: true, inert: true, presented: false });
});

test("sprite consumer validates exact versioned PNG data, crops 4x4 without smoothing, and cleans up", async (t) => {
  const page = await pageFixture(t);
  const result = await page.evaluate(async (expectedVersion) => {
    const calls = [];
    const closed = [];
    const draws = [];
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function () {
      return {
        imageSmoothingEnabled: true,
        clearRect() {},
        drawImage(...args) { draws.push({ args: args.slice(1), smoothing: this.imageSmoothingEnabled }); },
      };
    };
    globalThis.createImageBitmap = async () => ({ width: 16, height: 20, close() { closed.push("closed"); } });
    const character = document.createElement("lr-dialogue-character");
    character.setAttribute("character-id", "guide");
    character.setAttribute("active", "true");
    character.receiveRenderContext({ resources: { async resource(...args) { calls.push(args); return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion: expectedVersion }; } } });
    document.body.append(character);
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Guide", contentVersion: expectedVersion } });
    while (character._spriteStatus === "loading") await new Promise((resolve) => setTimeout(resolve, 0));
    const valid = { status: character._spriteStatus, calls: calls.map(([namespace, key, contentVersion, options]) => [namespace, key, contentVersion, options.signal instanceof AbortSignal]), draws, closed: [...closed], canvas: [character.shadowRoot.querySelector("canvas").width, character.shadowRoot.querySelector("canvas").height] };
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Guide" } });
    await Promise.resolve();
    const invalid = { status: character._spriteStatus, callCount: calls.length };
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    return { valid, invalid };
  }, version);
  assert.deepEqual(result.valid.calls, [["resource.Graphics", "Characters/Guide", version, true]]);
  assert.equal(result.valid.status, "ready");
  assert.deepEqual(result.valid.canvas, [4, 5]);
  assert.deepEqual(result.valid.draws, [{ args: [0, 0, 4, 5, 0, 0, 4, 5], smoothing: false }]);
  assert.deepEqual(result.valid.closed, ["closed"]);
  assert.deepEqual(result.invalid, { status: "fallback", callCount: 1 });
});

test("real Professor sprite renders a scaled 32x48 frame within desktop and narrow character stages", async (t) => {
  const page = await pageFixture(t, { reduced: true });
  await page.evaluate(async ({ bytes, contentVersion }) => {
    globalThis.fixture = makeDialogueFixture({
      text: "真实博士精灵尺寸资格测试。",
      characters: [{ id: "professor", name: "博士", active: true }],
    });
    const character = fixture.characterList.children[0];
    character.receiveRenderContext({
      resources: {
        async resource(namespace, key, expectedVersion) {
          if (namespace !== "resource.Graphics" || key !== "Characters/Professor" || expectedVersion !== contentVersion) {
            throw new Error("unexpected Professor resource request");
          }
          return { bytes: new Uint8Array(bytes), mime: "image/png", contentVersion };
        },
      },
    });
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Professor", contentVersion } });
    fixture.controls.querySelector('[action="confirm"]').setAttribute("enabled", "true");
    while (character._spriteStatus === "loading") await new Promise((resolve) => setTimeout(resolve, 0));
    if (character._spriteStatus !== "ready") throw new Error(`Professor sprite failed: ${character._spriteStatus}`);
  }, { bytes: [...spriteBytes], contentVersion: spriteVersion });

  for (const viewport of [{ width: 1280, height: 720 }, { width: 640, height: 480 }, { width: 360, height: 480 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const character = fixture.characterList.children[0];
      const canvas = character.shadowRoot.querySelector("canvas");
      const canvasRect = canvas.getBoundingClientRect();
      const stageRect = fixture.characterList.shadowRoot.querySelector(".character-stage").getBoundingClientRect();
      const modalRect = fixture.view.shadowRoot.querySelector(".modal").getBoundingClientRect();
      const conversationRect = fixture.conversation.getBoundingClientRect();
      return {
        intrinsic: { width: canvas.width, height: canvas.height },
        rendered: canvasRect.toJSON(),
        stage: stageRect.toJSON(),
        modal: modalRect.toJSON(),
        conversation: conversationRect.toJSON(),
        imageRendering: getComputedStyle(canvas).imageRendering,
      };
    });
    assert.deepEqual(geometry.intrinsic, { width: 32, height: 48 }, "the real 128x192 sheet must keep a 32x48 canvas backing store");
    assert.ok(geometry.rendered.width > geometry.intrinsic.width && geometry.rendered.height > geometry.intrinsic.height);
    assert.ok(Math.abs(geometry.rendered.width / geometry.rendered.height - 2 / 3) < 0.01, "rendering must preserve the frame aspect ratio");
    assert.ok(geometry.rendered.height / geometry.stage.height >= 0.54 && geometry.rendered.height / geometry.stage.height <= 0.56);
    assert.ok(geometry.rendered.left >= geometry.stage.left && geometry.rendered.right <= geometry.stage.right);
    assert.ok(geometry.rendered.top >= geometry.stage.top && geometry.rendered.bottom <= geometry.stage.bottom);
    assert.ok(geometry.stage.left >= geometry.modal.left && geometry.stage.right <= geometry.modal.right);
    assert.ok(geometry.stage.top >= geometry.modal.top && geometry.stage.bottom <= geometry.modal.bottom);
    assert.ok(geometry.conversation.width > 0 && geometry.conversation.height > 0);
    assert.equal(geometry.imageRendering, "pixelated");
  }
});

test("sprite load rejects MIME/grid errors and ignores stale or disconnected completions", async (t) => {
  const page = await pageFixture(t);
  const result = await page.evaluate(async (expectedVersion) => {
    const pending = [];
    const decoded = [];
    const closed = [];
    HTMLCanvasElement.prototype.getContext = () => ({ imageSmoothingEnabled: true, clearRect() {}, drawImage() {} });
    let decodeFails = false;
    globalThis.createImageBitmap = async (blob) => {
      decoded.push(blob.type);
      if (decodeFails) throw new Error("decode failed");
      return { width: 18, height: 16, close() { closed.push("closed"); } };
    };
    const character = document.createElement("lr-dialogue-character");
    character.setAttribute("active", "true");
    character.receiveRenderContext({ resources: { resource(namespace, key, contentVersion, { signal }) { return new Promise((resolve) => pending.push({ key, signal, resolve, contentVersion })); } } });
    document.body.append(character);
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/First", contentVersion: expectedVersion } });
    await Promise.resolve();
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Second", contentVersion: expectedVersion } });
    await Promise.resolve();
    const firstAborted = pending[0].signal.aborted;
    pending[0].resolve({ bytes: new Uint8Array([1]), mime: "image/png", contentVersion: expectedVersion });
    pending[1].resolve({ bytes: new Uint8Array([1]), mime: "image/png", contentVersion: expectedVersion });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const gridFallback = character._spriteStatus;
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Third", contentVersion: expectedVersion } });
    await Promise.resolve();
    pending[2].resolve({ bytes: new Uint8Array([1]), mime: "text/plain", contentVersion: expectedVersion });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const mimeFallback = character._spriteStatus;
    decodeFails = true;
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Fourth", contentVersion: expectedVersion } });
    await Promise.resolve();
    pending[3].resolve({ bytes: new Uint8Array([1]), mime: "image/png", contentVersion: expectedVersion });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const decodeFallback = character._spriteStatus;
    decodeFails = false;
    character.receiveRenderData({ sprite: { namespace: "resource.Graphics", key: "Characters/Fifth", contentVersion: expectedVersion } });
    await Promise.resolve();
    character.remove();
    const disconnectedAborted = pending[4].signal.aborted;
    pending[4].resolve({ bytes: new Uint8Array([1]), mime: "image/png", contentVersion: expectedVersion });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { firstAborted, disconnectedAborted, keys: pending.map((item) => item.key), decoded, closed, gridFallback, mimeFallback, decodeFallback, finalStatus: character._spriteStatus };
  }, version);
  assert.equal(result.firstAborted, true);
  assert.equal(result.disconnectedAborted, true);
  assert.deepEqual(result.keys, ["Characters/First", "Characters/Second", "Characters/Third", "Characters/Fourth", "Characters/Fifth"]);
  assert.deepEqual(result.decoded, ["image/png", "image/png"], "stale, non-PNG, and disconnected resources must not decode");
  assert.deepEqual(result.closed, ["closed"]);
  assert.equal(result.gridFallback, "fallback");
  assert.equal(result.mimeFallback, "fallback");
  assert.equal(result.decodeFallback, "fallback");
  assert.equal(result.finalStatus, "fallback");
});

test("reduced motion completes reveal immediately and modal geometry remains inside desktop/narrow viewports", async (t) => {
  const page = await pageFixture(t, { reduced: true });
  await page.evaluate(() => {
    globalThis.fixture = makeDialogueFixture({ text: "减少动态效果时不逐字等待。", characters: [{ id: "guide", active: true }], choices: [{ id: "one", text: "一个不会被裁切的长选项" }] });
    fixture.controls.querySelector('[action="confirm"]').setAttribute("enabled", "true");
  });
  assert.equal(await page.evaluate(() => fixture.conversation._revealComplete), true);
  for (const viewport of [{ width: 1280, height: 720 }, { width: 640, height: 480 }, { width: 360, height: 480 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const modal = fixture.view.shadowRoot.querySelector(".modal");
      const rect = modal.getBoundingClientRect();
      const conversation = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, columns: getComputedStyle(modal).gridTemplateColumns, choiceWidth: fixture.choiceList.children[0].getBoundingClientRect().width };
      fixture.history.setAttribute("visible", "true");
      fixture.history.receiveRenderEvent({ name: "scroll-to-latest", data: {} });
      const historyRect = modal.getBoundingClientRect();
      const history = {
        left: historyRect.left,
        top: historyRect.top,
        width: historyRect.width,
        height: historyRect.height,
        fullWidth: fixture.history.getBoundingClientRect().width > 0,
        emptyVisible: !fixture.history.shadowRoot.querySelector(".empty").hidden,
        conversationDisplay: getComputedStyle(fixture.conversation).display,
        characterDisplay: getComputedStyle(fixture.characterList).display,
      };
      fixture.history.setAttribute("visible", "false");
      return { conversation, history };
    });
    assert.ok(geometry.conversation.left >= 0 && geometry.conversation.top >= 0 && geometry.conversation.right <= viewport.width && geometry.conversation.bottom <= viewport.height);
    assert.ok(geometry.conversation.width > 0 && geometry.conversation.choiceWidth > 0);
    assert.deepEqual(
      { left: geometry.history.left, top: geometry.history.top, width: geometry.history.width, height: geometry.history.height },
      { left: geometry.conversation.left, top: geometry.conversation.top, width: geometry.conversation.width, height: geometry.conversation.height },
    );
    assert.deepEqual(
      { fullWidth: geometry.history.fullWidth, emptyVisible: geometry.history.emptyVisible, conversationDisplay: geometry.history.conversationDisplay, characterDisplay: geometry.history.characterDisplay },
      { fullWidth: true, emptyVisible: true, conversationDisplay: "none", characterDisplay: "none" },
    );
    if (viewport.width <= 640) assert.equal(geometry.conversation.columns.split(" ").length, 1);
  }
});
