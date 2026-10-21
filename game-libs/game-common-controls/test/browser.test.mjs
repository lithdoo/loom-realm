import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const browserBundle = fileURLToPath(new URL("../dist/browser/device-input.browser.js", import.meta.url));

test("device components register, route trusted keyboard input, and disable duplicates", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({ path: browserBundle });
  await page.evaluate(() => {
    globalThis.deviceEvents = [];
    const first = document.createElement("game-keyboard-input");
    first.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ owner: "first", name, data, options }); } });
    document.body.append(first);
    const duplicate = document.createElement("game-keyboard-input");
    duplicate.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ owner: "duplicate", name, data, options }); } });
    document.body.append(duplicate);
  });
  await page.keyboard.down("KeyA");
  await page.keyboard.up("KeyA");
  const result = await page.evaluate(() => ({
    tags: ["game-keyboard-input", "game-pointer-input", "game-gamepad-input"].map((tag) => customElements.get(tag) !== undefined),
    disabled: document.querySelectorAll("game-keyboard-input")[1].getAttribute("data-input-disabled"),
    events: deviceEvents,
  }));
  assert.deepEqual(result.tags, [true, true, true]);
  assert.equal(result.disabled, "duplicate");
  assert.equal(result.events.some(({ owner }) => owner === "duplicate"), false);
  const transitions = result.events.filter(({ name }) => name === "input.event");
  assert.deepEqual(transitions.map(({ data }) => [data.action, data.code, data.repeat]), [["down", "KeyA", false], ["up", "KeyA", false]]);
  for (const event of result.events) {
    assert.equal(event.options.broadcast, true);
    assert.ok(event.options.channel === "keyboard.state" || event.options.channel === "keyboard.event");
  }
});

test("pointer component emits State before edge Event on exact channels", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 200, height: 100 } });
  await page.setContent("<!doctype html><body style='margin:0;width:100vw;height:100vh'></body>");
  await page.addScriptTag({ path: browserBundle });
  await page.evaluate(() => {
    globalThis.deviceEvents = [];
    const pointer = document.createElement("game-pointer-input");
    pointer.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ name, data, options }); } });
    document.body.append(pointer);
  });
  await page.mouse.move(100, 25);
  await page.mouse.down();
  await page.mouse.up();
  const events = await page.evaluate(() => deviceEvents);
  const down = events.findIndex(({ name, data }) => name === "input.event" && data.action === "down");
  assert.ok(down > 0);
  assert.equal(events[down - 1].name, "input.state");
  assert.equal(events[down - 1].options.channel, "pointer.state");
  assert.equal(events[down].options.channel, "pointer.event");
  assert.equal(events[down].options.broadcast, true);
});
