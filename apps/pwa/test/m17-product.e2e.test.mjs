import test from "node:test";
import assert from "node:assert/strict";
import { openProduct, waitForDemo } from "./helpers/browser.mjs";

test("M17 composes Renderer Control/Data, same-origin Content, Input, Viewport, State and Web Presentation", async () => {
  const product = await openProduct();
  try {
    const { page } = product;
    await waitForDemo(page);
    await page.waitForFunction(() => document.querySelector("#loomrealm-demo")?.getAttribute("data-viewport") !== "pending");
    const render = await page.locator("#loomrealm-demo").evaluate((element) => ({
      content: element.getAttribute("data-content"),
      visits: Number(element.getAttribute("data-visits")),
      viewport: element.getAttribute("data-viewport"),
      presentation: document.documentElement.dataset.loomrealmPresentation,
      renderer: document.documentElement.dataset.loomrealmRenderer,
    }));
    assert.equal(render.content, "ready");
    assert.equal(render.visits, 1);
    assert.match(render.viewport, /^\d+x\d+$/);
    assert.equal(render.presentation, "ready");
    assert.equal(render.renderer, "installed");

    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__loomrealmPwa.statuses.some((entry) => entry?.status === "settled"), null, { timeout: 20_000 });
    const result = await page.evaluate(() => window.__loomrealmPwa.statuses.find((entry) => entry?.status === "settled")?.result);
    const desktopReference = Object.freeze({ kind: "root-outcome", outcome: { type: "completed", value: { result: "demo-complete", visits: 1, content: "ready" } } });
    assert.deepEqual(result, desktopReference);
  } finally { await product.close(); }
});
