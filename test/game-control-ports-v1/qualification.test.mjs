import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { openProduct } from "../../apps/pwa/test/helpers/browser.mjs";

const root = join(import.meta.dirname, "..", "..");
const text = async (...parts) => readFile(join(root, ...parts), "utf8");
function browserContent(entries) {
  return entries.map((entry) => ({
    kind: entry.kind,
    namespace: entry.namespace,
    key: entry.key,
    mime: entry.mime,
    body: entry.encoding === "base64"
      ? Uint8Array.from(atob(entry.body), (character) => character.charCodeAt(0))
      : entry.body,
  }));
}

async function installAndLaunch(page, fixture) {
  return page.evaluate(async (value) => {
    const content = value.content.map((entry) => ({
      kind: entry.kind,
      namespace: entry.namespace,
      key: entry.key,
      mime: entry.mime,
      body: new Blob([entry.body], { type: entry.mime }),
    }));
    const executables = value.executables.map((entry) => ({
      logicalModule: entry.logicalModule,
      mime: "text/javascript",
      body: new Blob([entry.source], { type: "text/javascript" }),
    }));
    const installed = await window.__loomrealmPwaQualification.install({
      formatVersion: 1,
      gameEntryText: value.gameEntryText,
      launchManifestText: value.launchManifestText,
      content,
      executables,
    });
    await window.__loomrealmPwaQualification.launch(installed.installationId, value.presentation);
    return installed.installationId;
  }, {
    ...fixture,
    content: await page.evaluate(browserContent, fixture.content),
  });
}

async function essentialsFixture() {
  const example = join(root, "examples", "essentials-v21.1");
  const fsdb = join(example, "[FSDB]essentials-v21.1");
  return {
    gameEntryText: await readFile(join(example, "game.json"), "utf8"),
    launchManifestText: await readFile(join(example, "launch.hostra.json"), "utf8"),
    presentation: JSON.parse(await readFile(join(example, "presentation.json"), "utf8")),
    executables: [
      { logicalModule: "subsystems/base.mjs", source: await text("apps", "pwa", "dist", "qualification", "base-subsystem.mjs") },
      { logicalModule: "subsystems/map.mjs", source: await text("apps", "pwa", "dist", "qualification", "map-subsystem.mjs") },
    ],
    content: [
      { kind: "record", namespace: "struct.Map", key: "1", mime: "application/json", encoding: "text", body: await readFile(join(fsdb, "[struct]Map", "1.json"), "utf8") },
      { kind: "record", namespace: "struct.MapTransfer", key: "1", mime: "application/json", encoding: "text", body: await readFile(join(fsdb, "[struct]MapTransfer", "1.json"), "utf8") },
      { kind: "record", namespace: "struct.Tileset", key: "1", mime: "application/json", encoding: "text", body: await readFile(join(fsdb, "[struct]Tileset", "1.json"), "utf8") },
      { kind: "record", namespace: "struct.NPC", key: "guide", mime: "application/json", encoding: "text", body: await readFile(join(fsdb, "[struct]NPC", "guide.json"), "utf8") },
      { kind: "resource", namespace: "resource.Graphics", key: "Characters/m14_player", mime: "image/png", encoding: "base64", body: await readFile(join(fsdb, "[resource]Graphics", "Characters", "m14_player.png")).then((value) => value.toString("base64")) },
      { kind: "resource", namespace: "resource.Graphics", key: "Characters/m14_npc", mime: "image/png", encoding: "base64", body: await readFile(join(fsdb, "[resource]Graphics", "Characters", "m14_npc.png")).then((value) => value.toString("base64")) },
      { kind: "resource", namespace: "resource.Graphics", key: "Tilesets/m14_tileset", mime: "image/png", encoding: "base64", body: await readFile(join(fsdb, "[resource]Graphics", "Tilesets", "m14_tileset.png")).then((value) => value.toString("base64")) },
      { kind: "resource", namespace: "resource.Presentation", key: "controls/device-input.browser.js", mime: "text/javascript", encoding: "text", body: await text("game-libs", "game-common-controls", "dist", "browser", "device-input.browser.js") },
      { kind: "resource", namespace: "resource.Presentation", key: "map/map.browser.js", mime: "text/javascript", encoding: "text", body: await readFile(join(fsdb, "[resource]Presentation", "map", "map.browser.js.js"), "utf8") },
      { kind: "resource", namespace: "resource.Presentation", key: "map/map.css", mime: "text/css", encoding: "text", body: await readFile(join(fsdb, "[resource]Presentation", "map", "map.css.css"), "utf8") },
      { kind: "resource", namespace: "resource.Presentation", key: "essentials/page.css", mime: "text/css", encoding: "text", body: await readFile(join(fsdb, "[resource]Presentation", "essentials", "page.css.css"), "utf8") },
    ],
  };
}

async function bundleSource(contents, sourcefile) {
  const result = await build({
    stdin: { contents, resolveDir: root, sourcefile },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "chrome140",
  });
  return result.outputFiles[0].text;
}

async function dialogueFixture() {
  const baseSource = await bundleSource(`
    import { defineSubsystem } from "@loomrealm/subsystem";
    export default defineSubsystem((scope) => ({
      async frame(frame) {
        const domain = scope.createRenderDomain({ zIndex: 0, roots: [{ key: "game-controls-input", tag: "game-controls-input", attrs: {}, data: {}, children: [] }] });
        try { return await frame.call("dialogue", frame.params); }
        finally { domain.close(); }
      }
    }));
  `, "game-control-ports-dialogue-base.mjs");
  const dialogueSource = await bundleSource(`
    import { completed, defineSubsystem } from "@loomrealm/subsystem";
    import { createControlsConsumer } from "@loomrealm-game/common-controls/subsystem";
    import { RPGDialogue } from "@loomrealm-game/rpg-dialogue";
    export default defineSubsystem((scope) => ({
      async frame(frame) {
        const dialogue = new RPGDialogue(scope, frame);
        const consumer = createControlsConsumer(scope.presentationEvents, frame, {
          onEvent(event) {
            if (event.action === "down" && !event.repeat && event.button === "south") dialogue.controls.confirm();
          }
        });
        try {
          const result = await dialogue.openConversation({
            conversation: { text: "A deliberately long qualified Dialogue line that requires reveal before semantic confirmation submits.", choices: [], data: { qualified: true } },
            characters: []
          });
          return completed(result);
        } finally {
          consumer.close();
          dialogue.close();
        }
      }
    }));
  `, "game-control-ports-dialogue.mjs");
  return {
    gameEntryText: JSON.stringify({ formatVersion: 1, initial: { subsystem: "base", input: null }, subsystems: [{ key: "base" }, { key: "dialogue" }] }),
    launchManifestText: JSON.stringify({ formatVersion: 1, subsystems: [{ key: "base", module: "subsystems/base.mjs" }, { key: "dialogue", module: "subsystems/dialogue.mjs" }] }),
    presentation: {
      formatVersion: 1,
      styles: [{ namespace: "Presentation", key: "dialogue/rpg-dialogue.browser.css" }],
      scripts: [
        { namespace: "Presentation", key: "controls/device-input.browser.js" },
        { namespace: "Presentation", key: "dialogue/rpg-dialogue.browser.js" },
      ],
    },
    executables: [
      { logicalModule: "subsystems/base.mjs", source: baseSource },
      { logicalModule: "subsystems/dialogue.mjs", source: dialogueSource },
    ],
    content: [
      { kind: "resource", namespace: "resource.Presentation", key: "controls/device-input.browser.js", mime: "text/javascript", encoding: "text", body: await text("game-libs", "game-common-controls", "dist", "browser", "device-input.browser.js") },
      { kind: "resource", namespace: "resource.Presentation", key: "dialogue/rpg-dialogue.browser.js", mime: "text/javascript", encoding: "text", body: await text("game-libs", "rpg-dialogue", "dist", "browser", "rpg-dialogue.browser.js") },
      { kind: "resource", namespace: "resource.Presentation", key: "dialogue/rpg-dialogue.browser.css", mime: "text/css", encoding: "text", body: await text("game-libs", "rpg-dialogue", "dist", "browser", "rpg-dialogue.browser.css") },
    ],
  };
}

test("trusted Browser keyboard closes producer -> top-frame -> Consumer -> RPGMapControls -> movement", { timeout: 45_000 }, async () => {
  const product = await openProduct();
  try {
    const fixture = await essentialsFixture();
    await installAndLaunch(product.page, fixture);
    await product.page.locator("lr-map-view").waitFor({ state: "attached", timeout: 20_000 });
    await product.page.waitForFunction(() => document.querySelector("lr-map-view")?.dataset.mapVisualState === "ready" && document.querySelector("lr-map-sprite")?._latestData?.x === 10);
    assert.equal(await product.page.locator("game-controls-input").count(), 1);
    assert.match(fixture.executables[1].source, /createControlsConsumer/);
    await product.page.keyboard.press("ArrowRight");
    await product.page.waitForFunction(() => document.querySelector("lr-map-sprite")?._latestData?.x === 11);
    assert.deepEqual(await product.page.evaluate(() => {
      const player = document.querySelector("lr-map-sprite")._latestData;
      return { x: player.x, y: player.y, direction: player.direction };
    }), { x: 11, y: 8, direction: 6 });
  } finally {
    await product.close();
  }
});

test("trusted Browser KeyZ closes unified controls -> Dialogue semantic port -> submit -> result", { timeout: 45_000 }, async () => {
  const product = await openProduct();
  try {
    const fixture = await dialogueFixture();
    await installAndLaunch(product.page, fixture);
    await product.page.locator("lr-dialogue-conversation").waitFor({ state: "attached", timeout: 20_000 });
    assert.equal(await product.page.locator("game-controls-input").count(), 1);
    await product.page.keyboard.press("KeyZ");
    await product.page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true);
    await product.page.keyboard.press("KeyZ");
    await product.page.waitForFunction(() => window.__loomrealmPwa.statuses.some((entry) => entry?.status === "settled"), null, { timeout: 20_000 });
    const result = await product.page.evaluate(() => window.__loomrealmPwa.statuses.find((entry) => entry?.status === "settled")?.result);
    assert.deepEqual(result, {
      kind: "root-outcome",
      outcome: { type: "completed", value: { type: "submitted" } },
    });
    assert.deepEqual(product.diagnostics.filter((entry) => entry.startsWith("pageerror:")), []);
  } finally {
    await product.close();
  }
});
