import test from "node:test";
import assert from "node:assert/strict";
import { openProduct } from "./helpers/browser.mjs";
import {
  battleExecutable,
  expectedPresentationEvent,
  gameEntryText,
  launchManifestText,
  presentation,
  presentationSource,
  worldExecutable,
} from "../../../test/frame-targeted-presentation-v1/browser-fixture.mjs";

const fixture = Object.freeze({
  gameEntryText,
  launchManifestText,
  presentation,
  battleExecutable,
  presentationSource,
  worldExecutable,
});

test("a real PWA World Custom Element delivers top-frame through Workers only to the Battle Frame", { timeout: 45_000 }, async () => {
  const product = await openProduct();
  try {
    const { page } = product;
    await page.evaluate(async (value) => {
      const installed = await window.__loomrealmPwaQualification.install({
        formatVersion: 1,
        gameEntryText: value.gameEntryText,
        launchManifestText: value.launchManifestText,
        content: [{
          kind: "resource",
          namespace: "resource.Presentation",
          key: "frame-event-probe.browser.js",
          mime: "text/javascript; charset=utf-8",
          body: new Blob([value.presentationSource], { type: "text/javascript; charset=utf-8" }),
        }],
        executables: [
          {
            logicalModule: "subsystems/world.mjs",
            mime: "text/javascript",
            body: new Blob([value.worldExecutable], { type: "text/javascript" }),
          },
          {
            logicalModule: "subsystems/battle.mjs",
            mime: "text/javascript",
            body: new Blob([value.battleExecutable], { type: "text/javascript" }),
          },
        ],
      });
      await window.__loomrealmPwaQualification.launch(installed.installationId, value.presentation);
    }, fixture);

    const source = page.locator("#frame-event-source");
    const target = page.locator("#frame-event-target");
    await source.waitFor({ state: "attached", timeout: 20_000 });
    await target.waitFor({ state: "attached", timeout: 20_000 });
    await page.waitForFunction(() => {
      const element = document.querySelector("#frame-event-source");
      return document.documentElement.dataset.loomrealmRenderer === "installed" &&
        element?.dataset.contextReady === "true" &&
        typeof element.sendTopFrameEvent === "function";
    }, null, { timeout: 20_000 });

    await source.evaluate((element) => element.sendTopFrameEvent());
    await page.waitForFunction(() => document.querySelector("#frame-event-target")?.hasAttribute("data-delivered"), null, { timeout: 20_000 });
    const delivered = JSON.parse(await target.getAttribute("data-delivered"));
    assert.deepEqual(delivered, {
      ...expectedPresentationEvent,
      source: {
        subsystemKey: "world",
        domainId: delivered.source.domainId,
        targetKey: "source",
      },
    });
    assert.match(delivered.source.domainId, /^d[0-9a-z]+$/u);
    assert.equal(await source.getAttribute("data-world-delivered"), null);
  } finally {
    await product.close();
  }
});
