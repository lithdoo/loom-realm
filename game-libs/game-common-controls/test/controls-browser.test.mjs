import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const browserBundle = fileURLToPath(new URL("../dist/browser/device-input.browser.js", import.meta.url));

async function openPage(t, html = "<!doctype html><body></body>") {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(html);
  await page.addScriptTag({ path: browserBundle });
  return page;
}

async function mount(page, tag = "game-controls-input", owner = "controls") {
  await page.evaluate(({ tag, owner }) => {
    globalThis.deviceEvents = globalThis.deviceEvents ?? [];
    const element = document.createElement(tag);
    element.receiveRenderContext({
      emitCustomEvent(name, data, options) { deviceEvents.push({ owner, name, data, options }); },
    });
    document.body.append(element);
  }, { tag, owner });
}

function controls(events, owner = "controls") {
  return events.filter((event) => event.owner === owner);
}

test("controls element publishes top-frame keyboard edges and prevents mapped defaults", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div><button id='next'>next</button></body>");
  await mount(page);
  await page.evaluate(() => document.querySelector("#surface").focus());
  const untrusted = await page.evaluate(() => {
    const before = deviceEvents.length;
    const event = new KeyboardEvent("keydown", { code: "KeyZ", bubbles: true, cancelable: true });
    const continued = window.dispatchEvent(event);
    return { continued, added: deviceEvents.length - before, prevented: event.defaultPrevented };
  });
  assert.equal(untrusted.continued, true);
  assert.equal(untrusted.prevented, false);
  assert.equal(untrusted.added, 0);
  await page.keyboard.down("KeyZ");
  await page.keyboard.down("KeyZ");
  await page.keyboard.down("Tab");
  const result = await page.evaluate(() => ({
    active: document.activeElement.id,
    tags: ["game-keyboard-input", "game-pointer-input", "game-gamepad-input", "game-controls-input"].map((tag) => customElements.get(tag) !== undefined),
    events: deviceEvents,
  }));
  assert.deepEqual(result.tags, [true, true, true, true]);
  assert.equal(result.active, "surface");
  const published = controls(result.events);
  assert.deepEqual(published.map((event) => [event.options.channel, event.name, event.data.action, event.data.button, event.data.repeat, event.data.down]), [
    ["controls.state", "input.state", undefined, undefined, undefined, []],
    ["controls.state", "input.state", undefined, undefined, undefined, ["south"]],
    ["controls.event", "input.event", "down", "south", false, undefined],
    ["controls.event", "input.event", "down", "south", true, undefined],
    ["controls.state", "input.state", undefined, undefined, undefined, ["south", "select"]],
    ["controls.event", "input.event", "down", "select", false, undefined],
  ]);
  assert.equal(published.every((event) => event.options.broadcast === "top-frame"), true);
});

test("blocked focus targets follow the closed set and open shadow ancestry", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0' role='button'></div></body>");
  await mount(page);
  await page.evaluate(() => {
    const add = (element) => document.body.append(element);
    const input = document.createElement("input");
    input.id = "input";
    const area = document.createElement("textarea");
    area.id = "area";
    const select = document.createElement("select");
    select.id = "select";
    const button = document.createElement("button");
    button.id = "button";
    const link = document.createElement("a");
    link.id = "link";
    link.href = "#x";
    const plain = document.createElement("a");
    plain.id = "plain";
    plain.tabIndex = 0;
    const editable = document.createElement("div");
    editable.id = "editable";
    editable.contentEditable = "true";
    const buttonInner = document.createElement("span");
    buttonInner.id = "button-inner";
    buttonInner.tabIndex = 0;
    button.append(buttonInner);
    add(input); add(area); add(select); add(button); add(link); add(plain); add(editable);
    const host = document.createElement("div");
    host.id = "host";
    const shadow = host.attachShadow({ mode: "open" });
    const inner = document.createElement("span");
    inner.id = "inner";
    inner.tabIndex = 0;
    shadow.append(inner);
    add(host);
    const editableHost = document.createElement("div");
    editableHost.id = "editable-host";
    editableHost.contentEditable = "true";
    const editableShadow = editableHost.attachShadow({ mode: "open" });
    const editableInner = document.createElement("span");
    editableInner.id = "editable-inner";
    editableInner.tabIndex = 0;
    editableShadow.append(editableInner);
    add(editableHost);
    const fieldHost = document.createElement("div");
    fieldHost.id = "field-host";
    const fieldShadow = fieldHost.attachShadow({ mode: "open" });
    const field = document.createElement("input");
    field.id = "shadow-field";
    fieldShadow.append(field);
    add(fieldHost);
    globalThis.focusTarget = (id) => {
      const roots = ["#host", "#editable-host", "#field-host"].map((selector) => document.querySelector(selector)?.shadowRoot);
      const found = document.getElementById(id) ?? roots.reduce((match, root) => match ?? root?.getElementById(id) ?? null, null);
      found.focus();
    };
  });
  const probe = async (id) => {
    await page.evaluate((target) => {
      deviceEvents.length = 0;
      focusTarget(target);
    }, id);
    await page.keyboard.down("KeyX");
    await page.keyboard.up("KeyX");
    return page.evaluate(() => deviceEvents.map((event) => event.options.channel));
  };
  assert.deepEqual(await probe("surface"), ["controls.state", "controls.event", "controls.state", "controls.event"]);
  for (const id of ["input", "area", "select", "button", "link", "editable", "shadow-field", "button-inner", "editable-inner"]) {
    assert.deepEqual(await probe(id), [], id);
  }
  assert.deepEqual(await probe("plain"), ["controls.state", "controls.event", "controls.state", "controls.event"]);
  assert.deepEqual(await probe("inner"), ["controls.state", "controls.event", "controls.state", "controls.event"]);
  const tab = await page.evaluate(() => {
    document.querySelector("#link").focus();
    deviceEvents.length = 0;
    return document.activeElement.id;
  });
  assert.equal(tab, "link");
  await page.keyboard.down("Tab");
  const afterTab = await page.evaluate(() => ({ active: document.activeElement.id, events: deviceEvents.length }));
  assert.notEqual(afterTab.active, "link");
  assert.equal(afterTab.events, 0);
});

test("capture loss clears keyboard without an up, and the next repeat is a new logical down", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div><input id='field'></body>");
  await mount(page);
  await page.locator("#surface").focus();
  await page.keyboard.down("KeyZ");
  await page.locator("#field").focus();
  await page.keyboard.up("KeyZ");
  await page.keyboard.down("KeyZ");
  const duringField = await page.evaluate(() => deviceEvents.map((event) => [event.options.channel, event.data.down, event.data.action, event.data.repeat]));
  assert.deepEqual(duringField, [
    ["controls.state", [], undefined, undefined],
    ["controls.state", ["south"], undefined, undefined],
    ["controls.event", undefined, "down", false],
    ["controls.state", [], undefined, undefined],
  ]);
  await page.locator("#surface").focus();
  await page.keyboard.down("KeyZ");
  const regained = await page.evaluate(() => deviceEvents.slice(-2).map((event) => [event.options.channel, event.data.down, event.data.action, event.data.repeat]));
  assert.deepEqual(regained, [
    ["controls.state", ["south"], undefined, undefined],
    ["controls.event", undefined, "down", false],
  ]);
});

test("gamepad baseline, threshold, OR, disconnect, and keyboard sharing use one controls publication", async (t) => {
  const page = await openPage(t);
  await page.evaluate(() => {
    const pad = (index, mapping, values) => ({
      index, connected: true, mapping, axes: [1, 1, 1, 1],
      buttons: values.map((value) => ({ value })),
    });
    const values = () => Array(17).fill(0);
    globalThis.pads = [
      pad(0, "standard", values()),
      null,
      null,
      pad(3, "", values()),
      pad(4, "standard", values()),
    ];
    globalThis.pads[0].buttons[0].value = 1;
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => globalThis.pads });
  });
  await mount(page);
  await page.waitForFunction(() => deviceEvents.some((event) => event.options.channel === "controls.state"));
  const baseline = await page.evaluate(() => deviceEvents);
  assert.equal(baseline.some((event) => event.name === "input.event"), false);
  assert.deepEqual(baseline.at(-1).data.down, ["south"]);
  await page.evaluate(() => {
    globalThis.pads[0].buttons[0].value = 0.4;
    globalThis.pads[4].buttons[12].value = 0.5;
    globalThis.pads[4].buttons[9].value = 0.5;
  });
  await page.waitForFunction(() => deviceEvents.some((event) => event.name === "input.event" && event.data.action === "up"));
  const crossed = await page.evaluate((from) => deviceEvents.slice(from), baseline.length);
  const state = crossed.find((event) => event.name === "input.state");
  const edges = crossed.filter((event) => event.name === "input.event");
  assert.equal(crossed.indexOf(state), 0);
  assert.deepEqual(state.data.down, ["up", "start"]);
  assert.deepEqual(edges.map((event) => [event.data.action, event.data.button, event.data.repeat]), [
    ["down", "up", false],
    ["up", "south", false],
    ["down", "start", false],
  ]);
  await page.locator("body").focus();
  await page.keyboard.down("KeyZ");
  const beforeDisconnect = await page.evaluate(() => {
    globalThis.disconnectFrom = deviceEvents.length;
    globalThis.pads[4].connected = false;
    return disconnectFrom;
  });
  await page.waitForFunction((from) => deviceEvents.slice(from).some((event) => event.data.action === "up" && event.data.button === "start"), beforeDisconnect);
  const released = await page.evaluate((from) => deviceEvents.slice(from).filter((event) => event.name === "input.event").map((event) => [event.data.action, event.data.button]), beforeDisconnect);
  assert.deepEqual(released, [["up", "up"], ["up", "start"]]);
  const held = await page.evaluate(() => deviceEvents.filter((event) => event.name === "input.state").at(-1).data.down);
  assert.deepEqual(held, ["south"]);
});

test("Pocket Block unmapped AYANEO pad publishes all four canonical D-pad directions", async (t) => {
  const page = await openPage(t);
  await page.evaluate(() => {
    globalThis.pocketPad = {
      index: 2, connected: true, id: "AYANEO Controller (Vendor: 4001 Product: 0428)",
      mapping: "", axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true, value: () => [globalThis.pocketPad],
    });
  });
  await mount(page);
  await page.waitForFunction(() => deviceEvents.some((event) => event.options.channel === "controls.state"));
  assert.deepEqual(
    await page.evaluate(() => deviceEvents.find((event) => event.options.channel === "controls.state").data.down),
    [],
  );

  for (const [index, direction] of [[12, "up"], [13, "down"], [14, "left"], [15, "right"]]) {
    for (const [value, action] of [[1, "down"], [0, "up"]]) {
      const before = await page.evaluate(() => deviceEvents.length);
      await page.evaluate(({ index, value }) => { pocketPad.buttons[index].value = value; }, { index, value });
      await page.waitForFunction(({ before, direction, action }) =>
        deviceEvents.slice(before).some((event) =>
          event.options.channel === "controls.event"
          && event.data.action === action
          && event.data.button === direction
        ), { before, direction, action });
      const batch = await page.evaluate((from) => deviceEvents.slice(from), before);
      const edgeIndex = batch.findIndex((event) =>
        event.options.channel === "controls.event"
        && event.data.action === action
        && event.data.button === direction
      );
      assert.ok(edgeIndex > 0, direction + " " + action + " must follow controls.state");
      const state = batch[edgeIndex - 1];
      assert.equal(state.options.channel, "controls.state");
      assert.equal(state.options.broadcast, "top-frame");
      assert.deepEqual(state.data.down, action === "down" ? [direction] : []);
      assert.equal(batch[edgeIndex].data.repeat, false);
    }
  }

  await page.evaluate(() => { pocketPad.buttons[12].value = 1; });
  await page.waitForFunction(() => deviceEvents.some((event) =>
    event.options.channel === "controls.state" && event.data.down.includes("up")
  ));
  const beforeDisconnect = await page.evaluate(() => {
    const from = deviceEvents.length;
    pocketPad.connected = false;
    return from;
  });
  await page.waitForFunction((from) => deviceEvents.slice(from).some((event) =>
    event.options.channel === "controls.event" && event.data.action === "up" && event.data.button === "up"
  ), beforeDisconnect);
  assert.deepEqual(
    await page.evaluate(() => deviceEvents.filter((event) => event.options.channel === "controls.state").at(-1).data.down),
    [],
  );
});

test("window regain with an empty baseline republishes controls.state and no event", async (t) => {
  const page = await openPage(t, "<!doctype html><body></body>");
  await page.evaluate(() => { document.hasFocus = () => false; });
  await mount(page);
  const stillUnusable = await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    return deviceEvents.length;
  });
  assert.equal(stillUnusable, 0);
  await page.evaluate(() => {
    document.hasFocus = () => true;
    window.dispatchEvent(new Event("focus"));
  });
  const regained = await page.evaluate(() => deviceEvents);
  assert.deepEqual(regained.map((event) => [event.name, event.options.channel, event.options.broadcast, event.data.down, event.data.action]), [
    ["input.state", "controls.state", "top-frame", [], undefined],
  ]);
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(() => deviceEvents.length), 1, "empty regain must not start State refresh");
});

test("window blur publishes reconciliation State only, then a gamepad rescan baseline", async (t) => {
  const page = await openPage(t, "<!doctype html><body><div id='surface' tabindex='0'></div></body>");
  await page.evaluate(() => {
    globalThis.pad = {
      index: 1, connected: true, mapping: "standard", axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0 })),
    };
    pad.buttons[1].value = 1;
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [globalThis.pad] });
  });
  await mount(page);
  await page.locator("#surface").focus();
  await page.keyboard.down("ArrowUp");
  await page.evaluate(() => {
    const before = deviceEvents.length;
    document.hasFocus = () => false;
    window.dispatchEvent(new Event("blur"));
    globalThis.blurEvents = deviceEvents.slice(before);
  });
  const blurred = await page.evaluate(() => blurEvents);
  assert.deepEqual(blurred.map((event) => [event.name, event.data.down, event.data.action]), [
    ["input.state", [], undefined],
  ]);
  await page.evaluate(() => {
    const before = deviceEvents.length;
    document.hasFocus = () => true;
    window.dispatchEvent(new Event("focus"));
    globalThis.focusEvents = deviceEvents.slice(before);
  });
  const restored = await page.evaluate(() => focusEvents);
  assert.equal(restored.some((event) => event.name === "input.event"), false);
  assert.deepEqual(restored.at(-1).data.down, ["east"]);
});

test("refresh, disconnect, duplicate claim, and raw keyboard stay independent", async (t) => {
  const page = await openPage(t);
  await mount(page);
  const duplicate = await page.evaluate(() => {
    const element = document.createElement("game-controls-input");
    element.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ owner: "duplicate", name, data, options }); } });
    document.body.append(element);
    return element.getAttribute("data-input-disabled");
  });
  assert.equal(duplicate, "duplicate");
  await page.keyboard.down("KeyZ");
  await page.waitForTimeout(1100);
  const refreshed = await page.evaluate(() => deviceEvents.filter((event) => event.owner === "controls" && event.name === "input.state" && event.data.down?.includes("south")).length);
  assert.ok(refreshed >= 2);
  await page.keyboard.up("KeyZ");
  const afterEmpty = await page.evaluate(() => deviceEvents.length);
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(() => deviceEvents.length), afterEmpty);
  await page.keyboard.down("KeyX");
  await page.evaluate(() => document.querySelector("game-controls-input").remove());
  const stopped = await page.evaluate(() => deviceEvents.length);
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(() => deviceEvents.length), stopped);
  assert.equal(await page.evaluate(() => deviceEvents.at(-1).name === "input.state" && deviceEvents.at(-1).data.down?.length === 0), false);
  const reclaimed = await page.evaluate(() => {
    const element = document.createElement("game-controls-input");
    element.id = "reclaimed";
    element.receiveRenderContext({ emitCustomEvent(name, data, options) { deviceEvents.push({ owner: "reclaimed", name, data, options }); } });
    document.body.append(element);
    return element.hasAttribute("data-input-disabled");
  });
  assert.equal(reclaimed, false);
  await mount(page, "game-keyboard-input", "keyboard");
  await page.keyboard.down("KeyC");
  const both = await page.evaluate(() => deviceEvents.filter((event) => event.name === "input.event" && (event.data.button === "west" || event.data.code === "KeyC")));
  assert.deepEqual(both.map((event) => [event.owner, event.options.broadcast, event.options.channel]).sort(), [
    ["keyboard", true, "keyboard.event"],
    ["reclaimed", "top-frame", "controls.event"],
  ]);
});
