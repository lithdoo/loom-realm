import test from "node:test";
import assert from "node:assert/strict";
import { openProduct } from "./helpers/browser.mjs";
import {
  executable,
  expectedPresentationEvent,
  gameEntryText,
  launchManifestText,
  presentation,
  presentationSource,
} from "../../../test/frame-targeted-presentation-v1/browser-fixture.mjs";

const fixture = Object.freeze({
  gameEntryText,
  launchManifestText,
  presentation,
  executable,
  presentationSource,
});

test("a real PWA Custom Element delivers top-frame through Workers to its exact Frame", { timeout: 45_000 }, async () => {
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
        executables: [{
          logicalModule: "subsystems/game.mjs",
          mime: "text/javascript",
          body: new Blob([value.executable], { type: "text/javascript" }),
        }],
      });
      await window.__loomrealmPwaQualification.launch(installed.installationId, value.presentation);
    }, fixture);

    const probe = page.locator("#frame-event-probe");
    await probe.waitFor({ state: "attached", timeout: 20_000 });
    await page.waitForFunction(() => {
      const element = document.querySelector("#frame-event-probe");
      return document.documentElement.dataset.loomrealmRenderer === "installed" &&
        element?.dataset.contextReady === "true" &&
        typeof element.sendTopFrameEvent === "function";
    }, null, { timeout: 20_000 });

    await probe.evaluate((element) => element.sendTopFrameEvent());
    await page.waitForFunction(() => document.querySelector("#frame-event-probe")?.hasAttribute("data-delivered"), null, { timeout: 20_000 });
    const delivered = JSON.parse(await probe.getAttribute("data-delivered"));
    assert.deepEqual(delivered, {
      ...expectedPresentationEvent,
      source: {
        subsystemKey: "game",
        domainId: delivered.source.domainId,
        targetKey: "probe",
      },
    });
    assert.match(delivered.source.domainId, /^d[0-9a-z]+$/u);
  } finally {
    await product.close();
  }
});
