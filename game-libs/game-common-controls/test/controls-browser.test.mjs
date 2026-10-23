import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const browserBundle = fileURLToPath(new URL("../dist/browser/device-input.browser.js", import.meta.url));

async function pageWithControls(t, setup = () => {}) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent("<!doctype html><body><div id='game' tabindex='0'>game</div></body>");
  await page.evaluate(setup);
  await page.addScriptTag({ path: browserBundle });
  await page.evaluate(() => {
    globalThis.controlsEvents = [];
    const controls = document.createElement("game-controls-input");
    controls.receiveRenderContext({ emitCustomEvent(name, data, options) { controlsEvents.push({ name, data, options }); } });
    document.body.append(controls);
    document.querySelector("#game").focus();
  });
  return page;
}

const logicalEvents = (events) => events.filter(({ options }) => options.channel === "controls.event").map(({ data }) => data);

test("controls component registers and maps all fourteen trusted keyboard codes in normative order", async (t) => {
  const page = await pageWithControls(t);
  const mapping = [
    ["ArrowUp", "up"], ["ArrowDown", "down"], ["ArrowLeft", "left"], ["ArrowRight", "right"],
    ["KeyZ", "south"], ["KeyX", "east"], ["KeyC", "west"], ["KeyV", "north"],
    ["KeyQ", "leftBumper"], ["KeyE", "rightBumper"], ["ShiftLeft", "leftTrigger"], ["ControlLeft", "rightTrigger"],
    ["Enter", "start"], ["Tab", "select"],
  ];
  for (const [code] of mapping) await page.keyboard.press(code);
  const result = await page.evaluate(() => ({
    registered: customElements.get("game-controls-input") !== undefined,
    events: controlsEvents,
    active: document.activeElement?.id,
  }));
  assert.equal(result.registered, true);
  assert.equal(result.active, "game", "captured Tab must have its default action prevented");
  assert.deepEqual(logicalEvents(result.events).map(({ action, button, repeat }) => [action, button, repeat]),
    mapping.flatMap(([, button]) => [["down", button, false], ["up", button, false]]));
  for (const event of result.events) {
    assert.equal(event.options.broadcast, "top-frame");
    assert.ok(event.options.channel === "controls.state" || event.options.channel === "controls.event");
  }
  for (let index = 0; index < result.events.length; index += 1) {
    if (result.events[index].options.channel !== "controls.event" || result.events[index].data.repeat) continue;
    assert.equal(result.events[index - 1].options.channel, "controls.state");
  }
});

test("controls gamepad sampling is standard-only, thresholded, ordered, and multi-pad OR", async (t) => {
  const page = await pageWithControls(t, () => {
    const makePad = (index, mapping = "standard") => ({
      index, connected: true, mapping, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0 })),
    });
    globalThis.pads = [makePad(1), makePad(2), makePad(3, "")];
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => globalThis.pads });
  });
  await page.evaluate(() => {
    controlsEvents.length = 0;
    const indexes = [12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7, 9, 8];
    for (const index of indexes) pads[0].buttons[index].value = 0.5;
    pads[2].buttons[0].value = 1;
  });
  await page.waitForFunction(() => controlsEvents.filter(({ options }) => options.channel === "controls.event").length === 14);
  let events = await page.evaluate(() => controlsEvents);
  assert.equal(events.filter(({ options }) => options.channel === "controls.state").length, 1, "one frame emits one complete State");
  assert.deepEqual(logicalEvents(events).map(({ button }) => button), [
    "up", "down", "left", "right", "south", "east", "west", "north",
    "leftBumper", "rightBumper", "leftTrigger", "rightTrigger", "start", "select",
  ]);
  assert.deepEqual(events.at(-15).data.down, [
    "up", "down", "left", "right", "south", "east", "west", "north",
    "leftBumper", "rightBumper", "leftTrigger", "rightTrigger", "start", "select",
  ]);
  await page.evaluate(() => {
    pads[1].buttons[0].value = 1;
    pads[0].buttons[0].value = 0;
    controlsEvents.length = 0;
  });
  await page.waitForTimeout(50);
  assert.deepEqual(await page.evaluate(() => controlsEvents), [], "another standard pad keeps south effectively down");
  await page.evaluate(() => { controlsEvents.length = 0; pads = [pads[0], pads[2]]; });
  await page.waitForFunction(() => controlsEvents.some(({ options, data }) => options.channel === "controls.event" && data.button === "south"));
  events = await page.evaluate(() => controlsEvents);
  assert.deepEqual(logicalEvents(events), [{ action: "up", button: "south", repeat: false }]);
  assert.equal(events[0].options.channel, "controls.state");
});

test("new gamepad baseline and Keyboard plus Gamepad OR preserve reason semantics", async (t) => {
  const page = await pageWithControls(t, () => {
    globalThis.pads = [];
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => globalThis.pads });
  });
  await page.evaluate(() => {
    const pad = { index: 4, connected: true, mapping: "standard", axes: [], buttons: Array.from({ length: 17 }, () => ({ value: 0 })) };
    pad.buttons[0].value = 1;
    pads = [pad];
    controlsEvents.length = 0;
  });
  await page.waitForFunction(() => controlsEvents.some(({ options, data }) => options.channel === "controls.state" && data.down.includes("south")));
  assert.deepEqual(logicalEvents(await page.evaluate(() => controlsEvents)), [], "new-pad baseline must not synthesize down");
  await page.evaluate(() => { controlsEvents.length = 0; });
  await page.keyboard.down("KeyZ");
  assert.deepEqual(await page.evaluate(() => controlsEvents), [], "keyboard duplicates an already-effective pad press");
  await page.evaluate(() => { pads[0].buttons[0].value = 0; });
  await page.waitForTimeout(50);
  assert.deepEqual(await page.evaluate(() => controlsEvents), [], "keyboard keeps effective south down after pad release");
  await page.keyboard.up("KeyZ");
  const events = await page.evaluate(() => controlsEvents);
  assert.equal(events[0].options.channel, "controls.state");
  assert.deepEqual(logicalEvents(events), [{ action: "up", button: "south", repeat: false }]);
});

test("capture uses the closed blocked set, deep active Shadow DOM, and logical repeat rules", async (t) => {
  const page = await pageWithControls(t);
  await page.evaluate(() => {
    const elements = [
      Object.assign(document.createElement("input"), { id: "input" }),
      Object.assign(document.createElement("textarea"), { id: "textarea" }),
      Object.assign(document.createElement("select"), { id: "select" }),
      Object.assign(document.createElement("button"), { id: "button" }),
      Object.assign(document.createElement("a"), { id: "anchor", href: "#x" }),
    ];
    const editable = Object.assign(document.createElement("div"), { id: "editable", contentEditable: "true" });
    elements.push(editable);
    document.body.append(...elements);
    const host = document.createElement("div");
    host.id = "host";
    const shadow = host.attachShadow({ mode: "open" });
    const shadowInput = document.createElement("input");
    shadowInput.id = "shadow-input";
    shadow.append(shadowInput);
    document.body.append(host);
    const allowed = document.createElement("div");
    allowed.id = "allowed";
    allowed.tabIndex = 0;
    allowed.setAttribute("role", "button");
    document.body.append(allowed);
  });
  for (const selector of ["#input", "#textarea", "#select", "#button", "#anchor", "#editable"]) {
    await page.focus(selector);
    await page.keyboard.press("KeyZ");
  }
  await page.evaluate(() => document.querySelector("#host").shadowRoot.querySelector("input").focus());
  await page.keyboard.press("KeyZ");
  assert.deepEqual(logicalEvents(await page.evaluate(() => controlsEvents)), []);
  await page.focus("#allowed");
  await page.keyboard.press("KeyZ");
  assert.deepEqual(logicalEvents(await page.evaluate(() => controlsEvents)), [
    { action: "down", button: "south", repeat: false }, { action: "up", button: "south", repeat: false },
  ]);

  await page.evaluate(() => { controlsEvents.length = 0; document.querySelector("#game").focus(); });
  await page.keyboard.down("KeyX");
  await page.keyboard.down("KeyX");
  await page.evaluate(() => document.querySelector("#input").focus());
  await page.evaluate(() => document.querySelector("#game").focus());
  await page.keyboard.down("KeyX");
  await page.keyboard.up("KeyX");
  const events = await page.evaluate(() => controlsEvents);
  assert.deepEqual(logicalEvents(events), [
    { action: "down", button: "east", repeat: false },
    { action: "down", button: "east", repeat: true },
    { action: "down", button: "east", repeat: false },
    { action: "up", button: "east", repeat: false },
  ]);
  const captureLoss = events.findIndex(({ options, data }) => options.channel === "controls.state" && data.down.length === 0);
  assert.ok(captureLoss >= 0);
  assert.notEqual(events[captureLoss + 1]?.options.channel, "controls.event", "capture loss is State-only reconciliation");
});

test("unavailable capture preserves browser defaults while active capture prevents them", async (t) => {
  const page = await pageWithControls(t);
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "native";
    const after = document.createElement("button");
    after.id = "after";
    document.body.append(input, after);
    input.focus();
    controlsEvents.length = 0;
  });
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "after");
  assert.deepEqual(await page.evaluate(() => controlsEvents), []);
  await page.focus("#game");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "game");
});

test("Window loss and regain reconcile to empty and Gamepad baseline using State only", async (t) => {
  const page = await pageWithControls(t, () => {
    globalThis.windowFocused = true;
    Object.defineProperty(document, "hasFocus", { configurable: true, value: () => globalThis.windowFocused });
    const pad = { index: 1, connected: true, mapping: "standard", axes: [], buttons: Array.from({ length: 17 }, () => ({ value: 0 })) };
    pad.buttons[0].value = 1;
    globalThis.pads = [pad];
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => globalThis.pads });
  });
  await page.keyboard.down("KeyX");
  await page.evaluate(() => {
    controlsEvents.length = 0;
    windowFocused = false;
    window.dispatchEvent(new Event("blur"));
  });
  let events = await page.evaluate(() => controlsEvents);
  assert.deepEqual(events.map(({ options, data }) => [options.channel, data]), [["controls.state", { down: [] }]]);
  await page.evaluate(() => {
    controlsEvents.length = 0;
    windowFocused = true;
    window.dispatchEvent(new Event("focus"));
  });
  events = await page.evaluate(() => controlsEvents);
  assert.deepEqual(events.map(({ options, data }) => [options.channel, data]), [["controls.state", { down: ["south"] }]]);
  await page.keyboard.up("KeyX");
});

test("unified and raw keyboard components can publish independently in the same Window", async (t) => {
  const page = await pageWithControls(t);
  await page.evaluate(() => {
    globalThis.rawEvents = [];
    const raw = document.createElement("game-keyboard-input");
    raw.receiveRenderContext({ emitCustomEvent(name, data, options) { rawEvents.push({ name, data, options }); } });
    document.body.append(raw);
    controlsEvents.length = 0;
  });
  await page.keyboard.press("KeyZ");
  const result = await page.evaluate(() => ({ controlsEvents, rawEvents }));
  assert.ok(result.controlsEvents.some(({ options }) => options.channel === "controls.event" && options.broadcast === "top-frame"));
  assert.ok(result.rawEvents.some(({ options }) => options.channel === "keyboard.event" && options.broadcast === true));
  assert.equal(result.controlsEvents.some(({ options }) => options.channel.startsWith("keyboard.")), false);
  assert.equal(result.rawEvents.some(({ options }) => options.channel.startsWith("controls.")), false);
});

test("browser collision banner guards the fourth Custom Element", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent("<!doctype html><body></body>");
  await page.evaluate(() => customElements.define("game-controls-input", class extends HTMLElement {}));
  const pageError = page.waitForEvent("pageerror");
  await page.addScriptTag({ path: browserBundle });
  assert.match((await pageError).message, /Game Common Controls element collision: game-controls-input/);
});

test("nonempty controls State refreshes, empty stops refresh, disconnect is silent, and duplicate ownership recovers", async (t) => {
  const page = await pageWithControls(t);
  await page.keyboard.down("KeyZ");
  await page.waitForTimeout(1_100);
  assert.ok(await page.evaluate(() => controlsEvents.filter(({ options, data }) => options.channel === "controls.state" && data.down.includes("south")).length) >= 2);
  await page.keyboard.up("KeyZ");
  await page.evaluate(() => { controlsEvents.length = 0; });
  await page.waitForTimeout(1_100);
  assert.deepEqual(await page.evaluate(() => controlsEvents), []);
  const duplicate = await page.evaluate(() => {
    const second = document.createElement("game-controls-input");
    second.receiveRenderContext({ emitCustomEvent() { controlsEvents.push({ duplicate: true }); } });
    document.body.append(second);
    return second.getAttribute("data-input-disabled");
  });
  assert.equal(duplicate, "duplicate");
  await page.evaluate(() => {
    document.querySelector("game-controls-input").remove();
    controlsEvents.length = 0;
  });
  await page.waitForTimeout(50);
  assert.deepEqual(await page.evaluate(() => controlsEvents), [], "disconnect must not synthesize State or Event");
  assert.equal(await page.evaluate(() => {
    const replacement = document.createElement("game-controls-input");
    replacement.receiveRenderContext({ emitCustomEvent() {} });
    document.body.append(replacement);
    return replacement.hasAttribute("data-input-disabled");
  }), false);
});
