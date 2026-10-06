import test from "node:test";
import assert from "node:assert/strict";
import { openProduct, productUrl, waitForDemo } from "./helpers/browser.mjs";

test("reload, navigation, and BFCache-style history restore always create a fresh fenced Session", async () => {
  const product = await openProduct();
  try {
    const { page } = product;
    await waitForDemo(page);
    const first = await page.evaluate(() => window.__loomrealmPwa.sessionEpoch);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction((prior) => document.documentElement.dataset.loomrealmProduct === "ready" && window.__loomrealmPwa.sessionEpoch !== prior, first, { timeout: 30_000 });
    await waitForDemo(page);
    const second = await page.evaluate(() => window.__loomrealmPwa.sessionEpoch);
    await page.goto(`${productUrl}?navigation=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((prior) => document.documentElement.dataset.loomrealmProduct === "ready" && window.__loomrealmPwa.sessionEpoch !== prior, second, { timeout: 30_000 });
    const third = await page.evaluate(() => window.__loomrealmPwa.sessionEpoch);
    await page.goto(new URL("blank.html", productUrl).href);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForFunction((prior) => document.documentElement.dataset.loomrealmProduct === "ready" && window.__loomrealmPwa.sessionEpoch !== prior, third, { timeout: 30_000 });
    const fourth = await page.evaluate(() => window.__loomrealmPwa.sessionEpoch);
    assert.equal(new Set([first, second, third, fourth]).size, 4);
  } finally { await product.close(); }
});
