import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron as electron } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronRoot = path.dirname(fileURLToPath(import.meta.resolve("electron")));
const changes = (page) => page.evaluate(() => globalThis.__m15Input.changes);
const execute = promisify(execFile);

test("production Desktop input source runs in a real focused Electron Renderer", { timeout: 30_000 }, async (t) => {
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({
    executablePath: path.join(electronRoot, "dist", process.platform === "win32" ? "electron.exe" : "electron"),
    args: [path.join(root, "test", "helpers", "m15-input-main.mjs")], env: environment,
  });
  t.after(() => application.close().catch(() => {}));
  const page = await application.firstWindow();
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  await page.bringToFront();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.focus());
  await page.waitForFunction(() => document.hasFocus());
  await page.evaluate(() => globalThis.__m15Input.start());
  await page.waitForFunction(() => globalThis.__m15Input.changes.some(({ kind, channel, available }) => kind === "availability" && channel === "pointer.event" && available === true));

  const beforeSynthetic = (await changes(page)).length;
  await page.evaluate(() => dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse", pointerId: 91, clientX: 30, clientY: 40, buttons: 1 })));
  assert.equal((await changes(page)).length, beforeSynthetic);

  await page.evaluate(() => { globalThis.__rawPointers = []; for (const name of ["pointerdown", "pointermove", "pointerup"]) addEventListener(name, (event) => globalThis.__rawPointers.push({ type: event.type, trusted: event.isTrusted, pointerType: event.pointerType, buttons: event.buttons })); });
  if (process.platform === "win32") {
    const physical = await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return { bounds: window.getContentBounds(), handle: window.getNativeWindowHandle().readBigUInt64LE().toString() };
    });
    const bounds = physical.bounds;
    const x = bounds.x + 100; const y = bounds.y + 80;
    await execute("powershell.exe", ["-NoProfile", "-Command", `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class M15Mouse { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint dx,uint dy,uint data,UIntPtr extra); }'; [M15Mouse]::SetForegroundWindow([IntPtr]::new([long]${physical.handle})); [M15Mouse]::SetCursorPos(${x},${y}); Start-Sleep -Milliseconds 100; [M15Mouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [M15Mouse]::mouse_event(8,0,0,0,[UIntPtr]::Zero); [M15Mouse]::mouse_event(16,0,0,0,[UIntPtr]::Zero); [M15Mouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`]);
  } else if (process.platform === "linux") {
    await application.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents;
      if (!contents) throw new Error("missing BrowserWindow WebContents");
      contents.sendInputEvent({ type: "mouseMove", x: 100, y: 80 });
      contents.sendInputEvent({ type: "mouseDown", x: 100, y: 80, button: "left", clickCount: 1 });
      contents.sendInputEvent({ type: "mouseDown", x: 100, y: 80, button: "right", clickCount: 1, modifiers: ["leftbuttondown"] });
      contents.sendInputEvent({ type: "mouseUp", x: 100, y: 80, button: "right", clickCount: 1, modifiers: ["leftbuttondown", "rightbuttondown"] });
      contents.sendInputEvent({ type: "mouseUp", x: 100, y: 80, button: "left", clickCount: 1, modifiers: ["leftbuttondown"] });
    });
  } else {
    await page.mouse.move(100, 80);
    await page.mouse.down({ button: "left" });
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await page.mouse.up({ button: "left" });
  }
  const pointer = (await changes(page)).filter(({ channel, kind }) => channel === "pointer.event" && kind === "event");
  assert.deepEqual(pointer.map(({ payload }) => [payload.action, payload.button]), [["down", "primary"], ["down", "secondary"], ["up", "secondary"], ["up", "primary"]], `raw=${JSON.stringify(await page.evaluate(() => globalThis.__rawPointers))}`);
  assert.equal(pointer.every(({ payload }) => payload.pointer.pointerId === 1), true);
  assert.deepEqual(pointer.slice(0, 2).map(({ payload }) => payload.pointer.buttons), [["primary"], ["primary", "secondary"]]);

  await page.evaluate(() => globalThis.__m15Input.setPad(0));
  await page.waitForFunction(() => globalThis.__m15Input.changes.some(({ channel, kind, payload }) => channel === "gamepad.state" && kind === "state" && payload.gamepads.length === 1));
  const firstPad = (await changes(page)).filter(({ channel, kind }) => channel === "gamepad.state" && kind === "state").at(-1).payload.gamepads[0].gamepadId;
  await page.evaluate(() => globalThis.__m15Input.setPad(0.6));
  await page.waitForFunction(() => globalThis.__m15Input.changes.some(({ channel, kind, payload }) => channel === "gamepad.event" && kind === "event" && payload.button === "south"));
  const gamepadChanges = await changes(page);
  const gamepadEventIndex = gamepadChanges.findIndex(({ channel, kind, payload }) => channel === "gamepad.event" && kind === "event" && payload.button === "south");
  const precedingStateIndex = gamepadChanges.findLastIndex(({ channel, kind }, index) => index < gamepadEventIndex && channel === "gamepad.state" && kind === "state");
  assert.ok(precedingStateIndex >= 0 && precedingStateIndex < gamepadEventIndex);
  assert.equal(gamepadChanges[gamepadEventIndex].payload.value, 600_000);
  const stateCountBeforeRemoval = gamepadChanges.filter(({ channel, kind }) => channel === "gamepad.state" && kind === "state").length;
  await page.evaluate(() => globalThis.__m15Input.setPad(null));
  await page.waitForFunction((count) => {
    const states = globalThis.__m15Input.changes.filter(({ channel, kind }) => channel === "gamepad.state" && kind === "state");
    return states.length > count && states.at(-1).payload.gamepads.length === 0;
  }, stateCountBeforeRemoval);
  await page.evaluate(() => globalThis.__m15Input.setPad(0));
  await page.waitForFunction((id) => globalThis.__m15Input.changes.some(({ channel, kind, payload }) => channel === "gamepad.state" && kind === "state" && payload.gamepads.some((pad) => pad.gamepadId > id)), firstPad);

  const lifecycleStart = (await changes(page)).length;
  await page.evaluate(() => globalThis.__m15Input.setLifecycle("hidden", false));
  await page.evaluate(() => globalThis.__m15Input.setLifecycle("visible", true));
  await page.waitForFunction((start) => {
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
