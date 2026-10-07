import test from "node:test";
import assert from "node:assert/strict";
import { openProduct, waitForDemo } from "./helpers/browser.mjs";
import { runDesktopEquivalenceReference } from "./helpers/desktop-equivalence.mjs";

test("M17 composes the browser product and matches a real Desktop/Hostra business run", { timeout: 30_000 }, async () => {
  const desktop = await runDesktopEquivalenceReference();
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
    assert.deepEqual(result, desktop.outcome);
    assert.equal(desktop.render.attrs["data-content"], render.content);
    assert.equal(Number(desktop.render.attrs["data-visits"]), render.visits);
    assert.equal(desktop.render.attrs["data-viewport"], render.viewport);
    assert.deepEqual(desktop.state, [{ key: { namespace: "demo", key: "visits" }, value: render.visits }]);
    assert.equal(desktop.rendererFailure, null);
    assert.equal(desktop.rendererCleaned, true);
  } finally { await product.close(); }
});
