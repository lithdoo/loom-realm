import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import test from "node:test";
import { createPokeManPwaFixture } from "../../../examples/PokeMan/scripts/prepare-pwa-content.mjs";
import { openProduct } from "./helpers/browser.mjs";

const executablePaths = Object.freeze({
  base: join(import.meta.dirname, "..", "dist", "qualification", "pokeman-base-subsystem.mjs"),
  map: join(import.meta.dirname, "..", "dist", "qualification", "pokeman-map-subsystem.mjs"),
  dialogue: join(import.meta.dirname, "..", "dist", "qualification", "pokeman-dialogue-subsystem.mjs"),
  battle: join(import.meta.dirname, "..", "dist", "qualification", "pokeman-battle-subsystem.mjs"),
  message: join(import.meta.dirname, "..", "dist", "qualification", "pokeman-message-subsystem.mjs"),
});

test("real PWA Base Worker observes DeepSeek 401 through the direct CORS path", {
  timeout: 120_000,
  skip: process.env.LOOMREALM_DEEPSEEK_CORS_QUALIFICATION !== "1",
}, async () => {
  const fixture = await createPokeManPwaFixture({ executablePaths });
  const syntheticInvalidKey = `synthetic-invalid-${Date.now()}-${randomUUID()}`;
  const product = await openProduct({ viewport: { width: 960, height: 720 } });
  try {
    const { page, context } = product;
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: "pokeman.deepseek.api-key",
      value: syntheticInvalidKey,
    });
    await page.evaluate(async (value) => {
      const decode = (entry) => Uint8Array.from(atob(entry.body), (character) => character.charCodeAt(0));
      const installed = await window.__loomrealmPwaQualification.install({
        formatVersion: 1,
        gameEntryText: value.gameEntryText,
        launchManifestText: value.launchManifestText,
        content: value.content.map((entry) => ({
          kind: entry.kind,
          namespace: entry.namespace,
          key: entry.key,
          mime: entry.mime,
          body: new Blob([decode(entry)], { type: entry.mime }),
        })),
        executables: value.executables.map((entry) => ({
          logicalModule: entry.logicalModule,
          mime: entry.mime,
          body: new Blob([entry.source], { type: entry.mime }),
        })),
      });
      window.__pokemanCorsLaunch = window.__loomrealmPwaQualification.launch(installed.installationId, value.presentation);
    }, fixture);

    await page.locator("lr-schema-form").waitFor({ state: "attached", timeout: 30_000 });
    await page.waitForFunction((expected) => document.querySelector("lr-schema-form-field")
      ?.shadowRoot?.querySelector("wa-input")?.value === expected, syntheticInvalidKey, { timeout: 30_000 });
    const providerResponse = context.waitForEvent("response", {
      predicate: (response) => response.url() === "https://api.deepseek.com/models",
      timeout: 30_000,
    });
    await page.evaluate(() => document.querySelector("lr-schema-form").submit());
    const response = await providerResponse;
    assert.equal(response.status(), 401);
    await page.waitForFunction(() => document.querySelector("lr-schema-form-field")
      ?.shadowRoot?.querySelector(".error")?.textContent?.includes("API Key 无效"), null, { timeout: 30_000 });
    assert.equal(await page.locator("lr-schema-form").count(), 1);
    assert.equal(await page.locator("lr-map-view").count(), 0);
    assert.equal(await page.locator("game-controls-input").count(), 0);
  } finally {
    await product.close();
  }
});
