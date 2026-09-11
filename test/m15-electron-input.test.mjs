import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronRoot = path.dirname(fileURLToPath(import.meta.resolve("electron")));
const changes = (page) => page.evaluate(() => globalThis.__m15Input.changes);

async function waitFor(page, label, predicate, arg) {
  try {
    await page.waitForFunction(predicate, arg, { timeout: 5_000 });
  } catch (cause) {
    const diagnostic = await page.evaluate(() => ({
      ready: document.documentElement.dataset.ready,
      focus: document.hasFocus(),
      visibility: document.visibilityState,
      changes: globalThis.__m15Input?.changes ?? null,
      rawKeys: globalThis.__rawKeys ?? null,
    })).catch(() => null);
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${label}: ${detail}; diagnostic=${JSON.stringify(diagnostic)}`);
  }
}

test("production Desktop input source runs in a real focused Electron Renderer", { timeout: 30_000 }, async (t) => {
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({
    executablePath: path.join(electronRoot, "dist", process.platform === "win32" ? "electron.exe" : "electron"),
    args: [path.join(root, "test", "helpers", "m15-input-main.mjs")], env: environment,
  });
  t.after(() => application.close().catch(() => {}));
  const page = await application.firstWindow();
  await waitFor(page, "renderer ready", () => document.documentElement.dataset.ready === "true");
  await page.bringToFront();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.focus());
  await waitFor(page, "renderer focus", () => document.hasFocus());
  await page.evaluate(() => globalThis.__m15Input.start());
  await waitFor(page, "pointer availability", () => globalThis.__m15Input.changes.some(({ kind, channel, available }) => kind === "availability" && channel === "pointer.event" && available === true));

  const beforeSynthetic = (await changes(page)).length;
  await page.evaluate(() => dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse", pointerId: 91, clientX: 30, clientY: 40, buttons: 1 })));
  assert.equal((await changes(page)).length, beforeSynthetic);

  await page.evaluate(() => {
    globalThis.__rawKeys = [];
    for (const name of ["keydown", "keyup"]) {
      addEventListener(name, (event) => globalThis.__rawKeys.push({
        type: event.type,
        trusted: event.isTrusted,
        code: event.code,
        repeat: event.repeat,
      }));
    }
  });
  await page.keyboard.press("ArrowRight");
  await waitFor(page, "trusted keyboard events", () => globalThis.__m15Input.changes.filter(({ channel, kind }) => channel === "keyboard.event" && kind === "event").length >= 2);

  const keyboard = (await changes(page)).filter(({ channel, kind }) => channel === "keyboard.event" && kind === "event");
  assert.deepEqual(keyboard.map(({ payload }) => [payload.action, payload.code, payload.repeat]), [
    ["down", "ArrowRight", false],
    ["up", "ArrowRight", false],
  ]);
  assert.deepEqual(await page.evaluate(() => globalThis.__rawKeys), [
    { type: "keydown", trusted: true, code: "ArrowRight", repeat: false },
    { type: "keyup", trusted: true, code: "ArrowRight", repeat: false },
  ]);

  await page.evaluate(() => globalThis.__m15Input.setPad(0));
  await waitFor(page, "gamepad attach", () => globalThis.__m15Input.changes.some(({ channel, kind, payload }) => channel === "gamepad.state" && kind === "state" && payload.gamepads.length === 1));
  const firstPad = (await changes(page)).filter(({ channel, kind }) => channel === "gamepad.state" && kind === "state").at(-1).payload.gamepads[0].gamepadId;
  await page.evaluate(() => globalThis.__m15Input.setPad(0.6));
  await waitFor(page, "gamepad button event", () => globalThis.__m15Input.changes.some(({ channel, kind, payload }) => channel === "gamepad.event" && kind === "event" && payload.button === "south"));
  const gamepadChanges = await changes(page);
  const gamepadEventIndex = gamepadChanges.findIndex(({ channel, kind, payload }) => channel === "gamepad.event" && kind === "event" && payload.button === "south");
  const precedingStateIndex = gamepadChanges.findLastIndex(({ channel, kind }, index) => index < gamepadEventIndex && channel === "gamepad.state" && kind === "state");
  assert.ok(precedingStateIndex >= 0 && precedingStateIndex < gamepadEventIndex);
  assert.equal(gamepadChanges[gamepadEventIndex].payload.value, 600_000);
  const stateCountBeforeRemoval = gamepadChanges.filter(({ channel, kind }) => channel === "gamepad.state" && kind === "state").length;
  await page.evaluate(() => globalThis.__m15Input.setPad(null));
  await waitFor(page, "gamepad detach", (count) => {
    const states = globalThis.__m15Input.changes.filter(({ channel, kind }) => channel === "gamepad.state" && kind === "state");
    return states.length > count && states.at(-1).payload.gamepads.length === 0;
  }, stateCountBeforeRemoval);
  await page.evaluate(() => globalThis.__m15Input.setPad(0));
  await waitFor(page, "gamepad reattach", (id) => globalThis.__m15Input.changes.some(({ channel, kind, payload }) => channel === "gamepad.state" && kind === "state" && payload.gamepads.some((pad) => pad.gamepadId > id)), firstPad);

  const lifecycleStart = (await changes(page)).length;
  await page.evaluate(() => globalThis.__m15Input.setLifecycle("hidden", false));
  await page.evaluate(() => globalThis.__m15Input.setLifecycle("visible", true));
  await waitFor(page, "lifecycle resume", (start) => {
    const later = globalThis.__m15Input.changes.slice(start);
    const unavailable = later.findIndex(({ kind, available }) => kind === "availability" && available === false);
    return document.hasFocus() && unavailable >= 0 && later.slice(unavailable + 1).some(({ kind, available }) => kind === "availability" && available === true);
  }, lifecycleStart);
  const resumed = await changes(page);
  const lastUnavailable = resumed.findLastIndex(({ kind, available }) => kind === "availability" && available === false);
  const firstAvailable = resumed.findIndex(({ kind, available }, index) => index > lastUnavailable && kind === "availability" && available === true);
  const baseline = resumed.findIndex(({ kind }, index) => index > lastUnavailable && kind === "state");
  assert.ok(baseline > lastUnavailable && baseline < firstAvailable);
});
