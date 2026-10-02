import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";

const packageRoot = path.resolve(import.meta.dirname, "..");
const bundlePath = path.join(packageRoot, "dist/browser/schema-form.browser.js");
const cssPath = path.join(packageRoot, "dist/browser/schema-form.browser.css");

function executablePath() {
  const candidates = [
    process.env.LOOMREALM_CHROMIUM_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  return candidates.find(existsSync);
}

async function pageWithBundle(t) {
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ path: cssPath });
  await page.addScriptTag({ path: bundlePath });
  return page;
}

test("classic bundle is isolated and CSS contains only the selected style layers", async () => {
  const [javascript, stylesheet] = await Promise.all([readFile(bundlePath, "utf8"), readFile(cssPath, "utf8")]);
  assert.doesNotMatch(javascript, /\bimport\s*\(/);
  assert.doesNotMatch(javascript, /\b(?:import|export)\s+(?:[^({*]|\{)/);
  assert.doesNotMatch(javascript, /(?:from\s*|import\s*)["'](?:lit|@awesome\.me|@loomrealm\/renderer)/);
  assert.match(stylesheet, /wa-theme-default/);
  assert.match(stylesheet, /wa-palette-default/);
  assert.match(stylesheet, /\/\* browser\/schema-form\.browser\.css \*\//);
  assert.doesNotMatch(stylesheet, /wa-visually-hidden|wa-cloak/);
});

test("bundle registers required elements and foreign LoomRealm collision defines neither", async (t) => {
  const page = await pageWithBundle(t);
  const registered = await page.evaluate(() => [
    "lr-schema-form", "lr-schema-form-field", "wa-input", "wa-textarea", "wa-checkbox",
    "wa-select", "wa-option", "wa-button", "wa-dialog", "wa-icon", "wa-tag", "wa-popup", "wa-spinner",
  ].map((tag) => [tag, customElements.get(tag) !== undefined]));
  assert.ok(registered.every(([, present]) => present), JSON.stringify(registered));

  const collisionContext = await page.context().browser().newContext();
  t.after(() => collisionContext.close());
  const collisionPage = await collisionContext.newPage();
  await collisionPage.setContent("<!doctype html><html><body></body></html>");
  await collisionPage.evaluate(() => customElements.define("lr-schema-form", class extends HTMLElement {}));
  const collisionError = collisionPage.waitForEvent("pageerror");
  await collisionPage.addScriptTag({ path: bundlePath });
  assert.match((await collisionError).message, /Schema Form browser element collision/);
  assert.deepEqual(await collisionPage.evaluate(() => ({
    root: customElements.get("lr-schema-form") !== undefined,
    field: customElements.get("lr-schema-form-field") !== undefined,
  })), { root: true, field: false });
});

test("Web Awesome namespace collision fails browser bootstrap", async (t) => {
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.evaluate(() => customElements.define("wa-input", class extends HTMLElement {}));
  const collisionError = page.waitForEvent("pageerror");
  await page.addScriptTag({ path: bundlePath });
  assert.match((await collisionError).message, /Schema Form browser element collision/);
  assert.equal(await page.evaluate(() => customElements.get("lr-schema-form") === undefined), true);
});

test("field controls keep stable DOM, exact event mapping, number drafts and select tokens", async (t) => {
  const page = await pageWithBundle(t);
  const result = await page.evaluate(async () => {
    const events = [];
    const root = document.createElement("lr-schema-form");
    root.receiveRenderContext({ resources: {}, emitCustomEvent(name, data = {}) { events.push({ name, data }); } });
    root.receiveRenderData({ title: "Form", cancelable: true });
    const stringField = document.createElement("lr-schema-form-field");
    const numberField = document.createElement("lr-schema-form-field");
    const selectField = document.createElement("lr-schema-form-field");
    const booleanField = document.createElement("lr-schema-form-field");
    root.append(stringField, numberField, selectField, booleanField);
    document.body.append(root);
    stringField.receiveRenderData({ key: "text", kind: "string", label: "Text", required: true, value: "", multiline: false, description: "Hint" });
    numberField.receiveRenderData({ key: "number", kind: "number", label: "Number", required: false, value: 1, integer: false });
    selectField.receiveRenderData({ key: "select", kind: "select", label: "Select", required: false, options: [{ value: "", label: "Empty" }, { value: "x", label: "X" }] });
    booleanField.receiveRenderData({ key: "boolean", kind: "boolean", label: "Boolean", required: false, value: false });
    await Promise.all([root.updateComplete, stringField.updateComplete, numberField.updateComplete, selectField.updateComplete, booleanField.updateComplete]);
    const stringControl = stringField.shadowRoot.querySelector("wa-input");
    const numberControl = numberField.shadowRoot.querySelector("wa-input");
    const selectControl = selectField.shadowRoot.querySelector("wa-select");
    const booleanControl = booleanField.shadowRoot.querySelector("wa-checkbox");

    stringControl.value = "hello";
    stringControl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    numberControl.value = "1.";
    numberControl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    selectControl.value = "o:0";
    selectControl.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    booleanControl.checked = true;
    booleanControl.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    const afterEvents = events.map((event) => structuredClone(event));

    numberField.receiveRenderData({ key: "number", kind: "number", label: "Changed", required: false, integer: false, error: "Required" });
    stringField.receiveRenderData({ key: "text", kind: "string", label: "Text 2", required: false, value: "server", multiline: false });
    await Promise.all([numberField.updateComplete, stringField.updateComplete]);
    const stable = stringField.shadowRoot.querySelector("wa-input") === stringControl &&
      numberField.shadowRoot.querySelector("wa-input") === numberControl;
    const preservedDraft = numberField.shadowRoot.querySelector("wa-input").value;
    const programmaticCount = events.length;

    const oldLabel = stringField.shadowRoot.querySelector(".label").textContent;
    let invalidThrew = false;
    try { stringField.receiveRenderData({ key: "text", kind: "string", label: "Bad", required: false, value: "changed", multiline: false, unknown: true }); }
    catch (error) { invalidThrew = error instanceof TypeError; }
    await stringField.updateComplete;

    return {
      afterEvents,
      stable,
      preservedDraft,
      programmaticCount,
      invalidThrew,
      labelAfterInvalid: stringField.shadowRoot.querySelector(".label").textContent,
      oldLabel,
      selectOptions: [...selectField.shadowRoot.querySelectorAll("wa-option")].map((option) => option.value),
      selectExplicitEmpty: selectField.readFormValue(),
      requiredMarker: stringField.shadowRoot.querySelector(".required") === null,
    };
  });
  assert.equal(result.afterEvents.length, 4);
  assert.deepEqual(result.afterEvents[0], { name: "change", data: { values: { text: "hello", number: 1, select: null, boolean: false } } });
  assert.equal(result.afterEvents[1].data.values.number, null);
  assert.equal(result.afterEvents[2].data.values.select, "");
  assert.equal(result.afterEvents[3].data.values.boolean, true);
  assert.equal(result.stable, true);
  assert.equal(result.preservedDraft, "1.");
  assert.equal(result.programmaticCount, 4);
  assert.equal(result.invalidThrew, true);
  assert.equal(result.labelAfterInvalid, result.oldLabel);
  assert.deepEqual(result.selectOptions, ["o:0", "o:1"]);
  assert.deepEqual(result.selectExplicitEmpty, { key: "select", value: "" });
  assert.equal(result.requiredMarker, true);
});

test("browser snapshots preserve prototype-like field keys as own properties", async (t) => {
  const page = await pageWithBundle(t);
  const result = await page.evaluate(async () => {
    const events = [];
    const root = document.createElement("lr-schema-form");
    root.receiveRenderContext({ resources: {}, emitCustomEvent(name, data = {}) { events.push({ name, data }); } });
    root.receiveRenderData({ cancelable: false });
    const keys = ["constructor", "toString", "__proto__"];
    const fields = keys.map((key) => {
      const field = document.createElement("lr-schema-form-field");
      field.receiveRenderData({ key, kind: "string", label: key, required: false, value: key, multiline: false });
      root.append(field);
      return field;
    });
    document.body.append(root);
    await Promise.all([root.updateComplete, ...fields.map((field) => field.updateComplete)]);
    const controls = fields.map((field) => field.shadowRoot.querySelector("wa-input"));
    controls.forEach((control, index) => { control.value = `value-${index}`; });
    controls[0].dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    const values = events[0].data.values;
    return {
      eventCount: events.length,
      own: keys.map((key) => Object.hasOwn(values, key)),
      values: keys.map((key) => values[key]),
      prototypeUnchanged: Object.getPrototypeOf(values) === Object.prototype,
    };
  });
  assert.equal(result.eventCount, 1);
  assert.deepEqual(result.own, [true, true, true]);
  assert.deepEqual(result.values, ["value-0", "value-1", "value-2"]);
  assert.equal(result.prototypeUnchanged, true);
});

test("modal cancel semantics, propagation blocking and local size limit are exact", async (t) => {
  const page = await pageWithBundle(t);
  const result = await page.evaluate(async () => {
    const events = [];
    const windowEvents = Object.fromEntries([
      "keydown", "keyup", "pointerdown", "pointermove", "pointerup", "pointercancel",
    ].map((name) => [name, 0]));
    for (const name of Object.keys(windowEvents)) {
      window.addEventListener(name, () => { windowEvents[name] += 1; });
    }
    const root = document.createElement("lr-schema-form");
    const field = document.createElement("lr-schema-form-field");
    root.append(field);
    document.body.append(root);
    root.receiveRenderContext({ resources: {}, emitCustomEvent(name, data = {}) { events.push({ name, data }); } });
    root.receiveRenderData({ cancelable: false });
    field.receiveRenderData({ key: "text", kind: "string", label: "", required: false, value: "", multiline: false });
    await Promise.all([root.updateComplete, field.updateComplete]);
    const dialog = root.shadowRoot.querySelector("wa-dialog");
    const denied = new CustomEvent("wa-hide", { bubbles: true, cancelable: true, composed: true });
    dialog.dispatchEvent(denied);
    const shell = root.shadowRoot.querySelector(".shell");
    shell.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, composed: true, key: "A" }));
    shell.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, composed: true, key: "A" }));
    for (const name of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      shell.dispatchEvent(new PointerEvent(name, { bubbles: true, composed: true, pointerId: 1 }));
    }
    const deniedEvents = events.length;

    root.receiveRenderData({ title: "Title", cancelable: true });
    await root.updateComplete;
    const allowed = new CustomEvent("wa-hide", { bubbles: true, cancelable: true, composed: true });
    root.shadowRoot.querySelector("wa-dialog").dispatchEvent(allowed);
    const input = field.shadowRoot.querySelector("wa-input");
    input.value = "x".repeat(131_100);
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await root.updateComplete;
    const oversizeCount = events.length;
    const showedSizeError = root.shadowRoot.querySelector(".size-error")?.textContent;
    input.value = "small";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await root.updateComplete;
    return {
      deniedPrevented: denied.defaultPrevented,
      allowedPrevented: allowed.defaultPrevented,
      deniedEvents,
      names: events.map((event) => event.name),
      oversizeCount,
      showedSizeError,
      sizeErrorCleared: root.shadowRoot.querySelector(".size-error") === null,
      windowEvents,
      label: root.shadowRoot.querySelector("wa-dialog").label,
      open: root.shadowRoot.querySelector("wa-dialog").open,
      lightDismiss: root.shadowRoot.querySelector("wa-dialog").lightDismiss,
    };
  });
  assert.equal(result.deniedPrevented, true);
  assert.equal(result.allowedPrevented, true);
  assert.equal(result.deniedEvents, 0);
  assert.deepEqual(result.names, ["cancel", "change"]);
  assert.equal(result.oversizeCount, 1);
  assert.equal(result.showedSizeError, "Form data is too large");
  assert.equal(result.sizeErrorCleared, true);
  assert.deepEqual(result.windowEvents, {
    keydown: 0,
    keyup: 0,
    pointerdown: 0,
    pointermove: 0,
    pointerup: 0,
    pointercancel: 0,
  });
  assert.equal(result.label, "Title");
  assert.equal(result.open, true);
  assert.equal(result.lightDismiss, false);
});

test("short dialog stays compact without creating a scroll range", async (t) => {
  const page = await pageWithBundle(t);
  await page.setViewportSize({ width: 1000, height: 600 });
  const result = await page.evaluate(async () => {
    const root = document.createElement("lr-schema-form");
    root.receiveRenderContext({ resources: {}, emitCustomEvent() {} });
    root.receiveRenderData({ title: "Compact", description: "One field", cancelable: true });
    const field = document.createElement("lr-schema-form-field");
    field.receiveRenderData({ key: "field", kind: "string", label: "Field", required: false, value: "", multiline: false });
    root.append(field);
    document.body.append(root);
    await Promise.all([root.updateComplete, field.updateComplete]);
    const dialogHost = root.shadowRoot.querySelector("wa-dialog");
    await dialogHost.updateComplete;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const nativeDialog = dialogHost.shadowRoot.querySelector("dialog");
    const waBody = dialogHost.shadowRoot.querySelector('[part="body"]');
    const shell = root.shadowRoot.querySelector(".shell");
    const body = root.shadowRoot.querySelector(".body");
    const dialogRect = nativeDialog.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    body.scrollTop = 100;
    return {
      dialogWidth: dialogRect.width,
      dialogHeight: dialogRect.height,
      shellHeight: shellRect.height,
      viewportHeight: innerHeight,
      waBodyOverflowY: getComputedStyle(waBody).overflowY,
      waBodyScrollable: waBody.scrollHeight > waBody.clientHeight,
      shellOverflowY: getComputedStyle(shell).overflowY,
      shellScrollable: shell.scrollHeight > shell.clientHeight,
      bodyOverflowY: getComputedStyle(body).overflowY,
      bodyOverflowX: getComputedStyle(body).overflowX,
      bodyScrollable: body.scrollHeight > body.clientHeight,
      bodyScrollTop: body.scrollTop,
    };
  });
  assert.ok(result.dialogWidth <= 600.5, JSON.stringify(result));
  assert.ok(result.dialogWidth >= 599.5, JSON.stringify(result));
  assert.ok(result.dialogHeight < result.viewportHeight * 0.8, JSON.stringify(result));
  assert.ok(result.shellHeight < result.viewportHeight * 0.8, JSON.stringify(result));
  assert.equal(result.waBodyOverflowY, "hidden");
  assert.equal(result.waBodyScrollable, false);
  assert.equal(result.shellOverflowY, "hidden");
  assert.equal(result.shellScrollable, false);
  assert.equal(result.bodyOverflowY, "auto");
  assert.equal(result.bodyOverflowX, "hidden");
  assert.equal(result.bodyScrollable, false);
  assert.equal(result.bodyScrollTop, 0);
});

test("real wheel scrolling is owned only by the long-form body and survives refresh", async (t) => {
  const page = await pageWithBundle(t);
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(async () => {
    const longText = "unbroken-content-".repeat(24);
    const root = document.createElement("lr-schema-form");
    let fields = [];
    let refreshes = 0;
    root.receiveRenderContext({
      resources: {},
      emitCustomEvent(name) {
        if (name !== "change") return;
        refreshes += 1;
        root.receiveRenderData({ title: "Long form refreshed", description: `refreshed-${longText}`, cancelable: true });
        fields[0].receiveRenderData({
          key: "field-0", kind: "string", label: longText, description: longText,
          error: `updated-${longText}`, required: false, value: "changed", multiline: false,
        });
      },
    });
    root.receiveRenderData({ title: "Long form", description: longText, cancelable: true });
    fields = Array.from({ length: 36 }, (_, index) => {
      const field = document.createElement("lr-schema-form-field");
      if (index === 35) {
        field.receiveRenderData({
          key: `field-${index}`, kind: "select", label: longText, description: longText,
          error: longText, required: false, value: "selected",
          options: [{ value: "selected", label: longText }],
        });
      } else {
        field.receiveRenderData({
          key: `field-${index}`, kind: "string", label: longText, description: longText,
          error: longText, required: false, value: longText, multiline: false,
        });
      }
      root.append(field);
      return field;
    });
    document.body.append(root);
    await Promise.all([root.updateComplete, ...fields.map((field) => field.updateComplete)]);
    const dialogHost = root.shadowRoot.querySelector("wa-dialog");
    await dialogHost.updateComplete;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    globalThis.schemaScrollFixture = {
      root,
      fields,
      body: root.shadowRoot.querySelector(".body"),
      get refreshes() { return refreshes; },
    };
  });

  const initial = await page.evaluate(() => {
    const { root, body } = globalThis.schemaScrollFixture;
    const dialogHost = root.shadowRoot.querySelector("wa-dialog");
    const nativeDialog = dialogHost.shadowRoot.querySelector("dialog");
    const waBody = dialogHost.shadowRoot.querySelector('[part="body"]');
    const shell = root.shadowRoot.querySelector(".shell");
    const header = root.shadowRoot.querySelector("header");
    const footer = root.shadowRoot.querySelector("footer");
    const bodyRect = body.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const dialogRect = nativeDialog.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    return {
      dialogWidth: dialogRect.width,
      dialogHeight: dialogRect.height,
      shellHeight: shellRect.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      waBodyOverflowY: getComputedStyle(waBody).overflowY,
      waBodyScrollable: waBody.scrollHeight > waBody.clientHeight,
      shellOverflowY: getComputedStyle(shell).overflowY,
      shellScrollable: shell.scrollHeight > shell.clientHeight,
      bodyOverflowY: getComputedStyle(body).overflowY,
      bodyOverflowX: getComputedStyle(body).overflowX,
      bodyOverscroll: getComputedStyle(body).overscrollBehavior,
      bodyScrollable: body.scrollHeight > body.clientHeight,
      bodyHorizontalRange: body.scrollWidth > body.clientWidth + 1,
      shellHorizontalRange: shell.scrollWidth > shell.clientWidth + 1,
      waBodyHorizontalRange: waBody.scrollWidth > waBody.clientWidth + 1,
      documentHasScrollRange: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight,
      headerAndFooterOutsideBody: header.parentElement === shell && footer.parentElement === shell && !body.contains(header) && !body.contains(footer),
      bodyStartsAfterHeader: bodyRect.top >= headerRect.bottom - 1,
      bodyEndsBeforeFooter: bodyRect.bottom <= footerRect.top + 1,
    };
  });
  assert.ok(initial.dialogWidth <= 600.5, JSON.stringify(initial));
  assert.ok(initial.dialogWidth <= initial.viewportWidth * 0.8 + 0.5, JSON.stringify(initial));
  assert.ok(initial.dialogHeight <= initial.viewportHeight * 0.8 + 0.5, JSON.stringify(initial));
  assert.ok(initial.shellHeight <= initial.viewportHeight * 0.8 + 0.5, JSON.stringify(initial));
  assert.equal(initial.waBodyOverflowY, "hidden");
  assert.equal(initial.waBodyScrollable, false);
  assert.equal(initial.shellOverflowY, "hidden");
  assert.equal(initial.shellScrollable, false);
  assert.equal(initial.bodyOverflowY, "auto");
  assert.equal(initial.bodyOverflowX, "hidden");
  assert.equal(initial.bodyOverscroll, "contain");
  assert.equal(initial.bodyScrollable, true);
  assert.equal(initial.bodyHorizontalRange, false);
  assert.equal(initial.shellHorizontalRange, false);
  assert.equal(initial.waBodyHorizontalRange, false);
  assert.equal(initial.documentHasScrollRange, false);
  assert.equal(initial.headerAndFooterOutsideBody, true);
  assert.equal(initial.bodyStartsAfterHeader, true);
  assert.equal(initial.bodyEndsBeforeFooter, true);

  const refresh = await page.evaluate(async () => {
    const fixture = globalThis.schemaScrollFixture;
    const { root, fields, body } = fixture;
    body.scrollTop = Math.min(160, body.scrollHeight - body.clientHeight);
    const scrollTopBefore = body.scrollTop;
    const headerTopBefore = root.shadowRoot.querySelector("header").getBoundingClientRect().top;
    const footerTopBefore = root.shadowRoot.querySelector("footer").getBoundingClientRect().top;
    const control = fields[0].shadowRoot.querySelector("wa-input");
    control.value = "changed";
    control.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await Promise.all([root.updateComplete, fields[0].updateComplete]);
    const currentBody = root.shadowRoot.querySelector(".body");
    return {
      refreshes: fixture.refreshes,
      sameBody: currentBody === body,
      scrollTopBefore,
      scrollTopAfter: currentBody.scrollTop,
      headerFixed: root.shadowRoot.querySelector("header").getBoundingClientRect().top === headerTopBefore,
      footerFixed: root.shadowRoot.querySelector("footer").getBoundingClientRect().top === footerTopBefore,
    };
  });
  assert.equal(refresh.refreshes, 1);
  assert.equal(refresh.sameBody, true);
  assert.ok(refresh.scrollTopBefore > 0);
  assert.ok(Math.abs(refresh.scrollTopAfter - refresh.scrollTopBefore) <= 1, JSON.stringify(refresh));
  assert.equal(refresh.headerFixed, true);
  assert.equal(refresh.footerFixed, true);

  const wheelBefore = await page.evaluate(() => {
    const { root, body } = globalThis.schemaScrollFixture;
    body.scrollTop = 0;
    return {
      bodyScrollTop: body.scrollTop,
      pageScrollTop: document.scrollingElement.scrollTop,
      headerTop: root.shadowRoot.querySelector("header").getBoundingClientRect().top,
      footerTop: root.shadowRoot.querySelector("footer").getBoundingClientRect().top,
    };
  });
  await page.locator("lr-schema-form").locator("form.shell > .body").hover();
  await page.mouse.wheel(0, 700);
  await page.waitForFunction(() => globalThis.schemaScrollFixture.body.scrollTop > 0);
  const wheelAfter = await page.evaluate(() => {
    const { root, body } = globalThis.schemaScrollFixture;
    return {
      bodyScrollTop: body.scrollTop,
      pageScrollTop: document.scrollingElement.scrollTop,
      headerTop: root.shadowRoot.querySelector("header").getBoundingClientRect().top,
      footerTop: root.shadowRoot.querySelector("footer").getBoundingClientRect().top,
    };
  });
  assert.equal(wheelBefore.bodyScrollTop, 0);
  assert.ok(wheelAfter.bodyScrollTop > 0, JSON.stringify({ wheelBefore, wheelAfter }));
  assert.equal(wheelAfter.pageScrollTop, wheelBefore.pageScrollTop);
  assert.equal(wheelAfter.headerTop, wheelBefore.headerTop);
  assert.equal(wheelAfter.footerTop, wheelBefore.footerTop);
});

test("focus returns after cancel and submit, and removed targets are ignored", async (t) => {
  const page = await pageWithBundle(t);
  const result = await page.evaluate(async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const deepActiveElement = () => {
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      return active;
    };
    const belongsTo = (node, ancestor) => {
      let current = node;
      while (current !== null) {
        if (current === ancestor) return true;
        const root = current.getRootNode();
        current = root instanceof ShadowRoot ? root.host : current.parentElement;
      }
      return false;
    };
    const run = async (action) => {
      const outside = document.createElement("button");
      outside.textContent = `outside-${action}`;
      document.body.append(outside);
      outside.focus();
      const root = document.createElement("lr-schema-form");
      const field = document.createElement("lr-schema-form-field");
      field.receiveRenderData({ key: "text", kind: "string", label: "Text", required: false, value: "ok", multiline: false });
      root.append(field);
      root.receiveRenderContext({
        resources: {},
        emitCustomEvent(name) {
          if (name === action) root.remove();
        },
      });
      root.receiveRenderData({ title: "Focus", cancelable: true });
      document.body.append(root);
      await Promise.all([root.updateComplete, field.updateComplete]);
      const dialog = root.shadowRoot.querySelector("wa-dialog");
      await dialog.updateComplete;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const focusedInside = belongsTo(deepActiveElement(), root);
      const buttons = [...root.shadowRoot.querySelectorAll("wa-button")];
      const button = action === "cancel"
        ? buttons.find((candidate) => candidate.textContent.trim() === "Cancel")
        : buttons.find((candidate) => candidate.getAttribute("variant") === "brand");
      button.shadowRoot.querySelector("button").click();
      await tick();
      await tick();
      const restored = document.activeElement === outside;
      outside.remove();
      return { focusedInside, restored };
    };
    const cancel = await run("cancel");
    const submit = await run("submit");

    let errors = 0;
    window.addEventListener("error", () => { errors += 1; });
    const removedTarget = document.createElement("button");
    document.body.append(removedTarget);
    removedTarget.focus();
    const root = document.createElement("lr-schema-form");
    root.receiveRenderContext({ resources: {}, emitCustomEvent() {} });
    root.receiveRenderData({ cancelable: false });
    document.body.append(root);
    await root.updateComplete;
    removedTarget.remove();
    root.remove();
    await tick();
    return { cancel, submit, removedTargetErrors: errors };
  });
  assert.deepEqual(result.cancel, { focusedInside: true, restored: true });
  assert.deepEqual(result.submit, { focusedInside: true, restored: true });
  assert.equal(result.removedTargetErrors, 0);
});
