import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TIMEOUT = 30_000;
const importMap = JSON.stringify({
  imports: {
    "@loomrealm/foundation": "/packages/foundation/dist/index.js",
    "@loomrealm/foundation/testing": "/packages/foundation/dist/testing/index.js",
    "@loomrealm/wire": "/packages/wire/dist/index.js",
    "@loomrealm/platform-ports": "/packages/platform-ports/dist/index.js",
    "@loomrealm/runtime-control": "/packages/runtime-control/dist/index.js",
    "@loomrealm/shared-state": "/packages/shared-state/dist/index.js",
    "@loomrealm/session-events": "/packages/session-events/dist/index.js",
    "@loomrealm/renderer-control": "/packages/renderer-control/dist/index.js",
    "@loomrealm/data": "/packages/data/dist/index.js",
    "@loomrealm/subsystem": "/packages/subsystem/dist/index.js",
    "@loomrealm/subsystem/host": "/packages/subsystem/dist/host/index.js",
    "@loomrealm/renderer": "/packages/renderer/dist/index.js",
    "@loomrealm/renderer/web-presentation": "/packages/renderer/dist/web-presentation.js",
    "@loomrealm-game/rpg-dialogue": "/game-libs/rpg-dialogue/dist/index.js"
  }
});

function executablePath() {
  return [
    process.env.LOOMREALM_CHROMIUM_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find(existsSync);
}

async function fixture(t) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    requests.push(url.pathname);
    if (url.pathname === "/") {
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><html><head>
        <script type="importmap">${importMap}</script>
        <link rel="stylesheet" href="/game-libs/rpg-dialogue/dist/browser/rpg-dialogue.browser.css">
        <script src="/game-libs/rpg-dialogue/dist/browser/rpg-dialogue.browser.js"></script>
      </head><body></body></html>`);
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(1));
    if ((relative.startsWith("packages/") || relative.startsWith("game-libs/")) && relative.includes("/dist/")) {
      try {
        response.setHeader("content-type", relative.endsWith(".css") ? "text/css" : "text/javascript");
        response.end(await readFile(path.join(root, relative)));
      } catch {
        response.statusCode = 404;
        response.end();
      }
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { origin: `http://127.0.0.1:${server.address().port}`, requests };
}

async function setup(page, origin) {
  await page.goto(origin);
  await page.evaluate(async () => {
    const [foundation, runtimeControl, rendererControl, sharedState, sessionEvents, subsystem, subsystemHost, renderer, presentation, dialogueModule] = await Promise.all([
      import("@loomrealm/foundation/testing"),
      import("@loomrealm/runtime-control"),
      import("@loomrealm/renderer-control"),
      import("@loomrealm/shared-state"),
      import("@loomrealm/session-events"),
      import("@loomrealm/subsystem"),
      import("@loomrealm/subsystem/host"),
      import("@loomrealm/renderer"),
      import("@loomrealm/renderer/web-presentation"),
      import("@loomrealm-game/rpg-dialogue"),
    ]);
    let activeDialogue = null;
    const waitFor = async (predicate, label) => {
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const scheduler = {
      schedule(ms, callback) {
        const timer = setTimeout(callback, ms);
        return () => clearTimeout(timer);
      },
    };
    const runtimePair = foundation.createMemoryCarrierPair();
    const dataPair = foundation.createMemoryCarrierPair();
    const rendererPair = foundation.createMemoryCarrierPair();
    const eventHub = sessionEvents.createSessionEventHub();
    const eventsClient = sessionEvents.createSessionEventClient(eventHub.createBinding("dialogue"));
    const presentationPublisher = eventHub.createDelegatedPublisher("web-presentation");
    const statuses = [];
    const returns = [];
    const observations = [];
    const renderEvents = [];
    const nodeEvents = [];
    const mainRuntime = runtimeControl.createMainRuntimeControlPeer({
      carrier: runtimePair.left,
      scheduler,
      frameDeadlineMs: 10_000,
      shutdownDeadlineMs: 5_000,
      authenticateHello: () => ({ kind: "accepted" }),
      handlers: {
        onStatus(status) { statuses.push(status); },
        onFrameCall() { return { kind: "failure", error: { code: "UNEXPECTED_CALL" } }; },
        onFrameReturn(params) { returns.push(params); return { kind: "success", result: {} }; },
      },
    });
    const runtime = subsystemHost.runSubsystem({
      definition: subsystem.defineSubsystem((scope) => ({
        async frame(frame) {
          const dialogue = new dialogueModule.RPGDialogue(scope, frame, { cancelable: false, zIndex: 123 });
          activeDialogue = dialogue;
          try {
            dialogue.setHistory([{ entryId: "intro", speakerName: "Guide", text: "Welcome" }]);
            const first = await dialogue.openConversation({
              conversation: {
                speakerName: "Guide",
                text: "This first qualified line is deliberately long enough to remain partially revealed until confirm completes it.",
                choices: [
                  { choiceId: "disabled", text: "Disabled", enabled: false, data: { icon: "lock" } },
                  { choiceId: "yes", text: "Continue", data: { icon: "confirm" } },
                ],
                data: { windowStyle: "qualified-first" },
              },
              characters: [{ characterId: "guide", displayName: "Guide", active: true, data: { portrait: "guide" } }],
            });
            dialogue.appendHistory({ entryId: "first", speakerName: "Guide", text: "Continue" });
            const second = await dialogue.openConversation({
              conversation: {
                text: "This second qualified line is also deliberately long so the first confirm is always reveal-only.",
                choices: [],
                data: { windowStyle: "qualified-second" },
              },
              characters: [],
            });
            const history = dialogue.getHistorySnapshot();
            observations.push({ first, second, history });
            return subsystem.completed({ first, second, history });
          } finally {
            dialogue.close();
          }
        },
      })),
      runtimeControl: { async acquire() { return runtimePair.right; } },
      runtimePolicy: { scheduler, helloDeadlineMs: 5_000, frameDeadlineMs: 10_000, terminalCleanupDeadlineMs: 1_000 },
      launch: { subsystemKey: "dialogue", bootstrapToken: "secret", controlProtocolVersions: [1] },
      data: {
        async acquire() {
          return { carrier: dataPair.left, generation: 1, dataProfile: "loomrealm.renderer-data/3" };
        },
      },
      state: (() => {
        const client = sharedState.createSharedStateClient();
        return Object.freeze({ client, terminate: () => client.terminate() });
      })(),
      events: (() => {
        return Object.freeze({ client: eventsClient, terminate: () => { eventsClient.terminate(); eventHub.terminate(); } });
      })(),
    });
    runtime.catch(() => {});

    const holder = renderer.createRendererControlHolder({
      async acquire(subsystemKey, generation, dataProfile) {
        if (subsystemKey !== "dialogue" || generation !== 1 || dataProfile !== "loomrealm.renderer-data/3") {
          throw new Error("Unexpected Data authority");
        }
        return dataPair.right;
      },
    }, undefined, {
      publish(event) {
        return presentationPublisher.publish(event.channel, event.type, event.payload, event.ownerSubsystemKey);
      },
    });
    const projectorFailures = [];
    const projector = new presentation.WebProjector({
      document,
      resourceClient: { async resource() { throw new Error("unused"); } },
      reportFailure(error) { projectorFailures.push(String(error)); },
    });
    const detach = presentation.attachRendererPresentation(holder, {
      reevaluate(source, emitNodeEvent) {
        projector.reevaluate(source, (event) => {
          nodeEvents.push(structuredClone(event));
          emitNodeEvent(event);
        });
      },
      deliverRenderEvent(event) {
        renderEvents.push(structuredClone(event));
        projector.deliverRenderEvent(event);
      },
    });
    const snapshot = {
      sessionId: "rpg-dialogue-qualification",
      revision: 1,
      runtimes: [{ subsystemKey: "dialogue", state: "ready" }],
      stack: [{ frameId: "dialogue-frame", subsystemKey: "dialogue", lifecycle: "active", activationId: "dialogue-activation" }],
      dataAuthorities: [{ subsystemKey: "dialogue", generation: 1, dataProfile: "loomrealm.renderer-data/3" }],
    };
    const publisher = rendererControl.createMainRendererControlPeer({
      carrier: rendererPair.left,
      acceptHello() {
        return { kind: "accepted", snapshot, preparedHelloText: rendererControl.prepareRendererHelloResultV2(snapshot) };
      },
    });
    await holder.connect({ carrier: rendererPair.right, rendererControlToken: "renderer-token" });
    await mainRuntime.identified;
    await waitFor(() => statuses.some((status) => status.state === "ready"), "Subsystem ready");
    await mainRuntime.frame.initialize({ frameId: "dialogue-frame", input: null });
    await mainRuntime.frame.activate({ frameId: "dialogue-frame", activationId: "dialogue-activation" });
    await waitFor(() => document.querySelector("lr-dialogue-conversation") !== null, "projected Dialogue");
    globalThis.dialogueQualification = {
      mainRuntime, runtime, returns, observations, renderEvents, nodeEvents, statuses, publisher, projector, detach,
      projectorFailures, waitFor,
      command(name) {
        activeDialogue.controls[name]();
      },
      ignoredKeyboard(code) {
        return presentationPublisher.publish("keyboard.event", "input.event", {
          domainId: "keyboard-device", targetKey: "keyboard-device",
          data: { action: "down", code, repeat: false },
        });
      },
      async finish() {
        await waitFor(() => returns.length === 1, "Frame return");
        await waitFor(() => document.querySelector("lr-dialogue-view") === null, "Dialogue teardown");
        return {
          returned: structuredClone(returns[0].result),
          observations: structuredClone(observations),
          renderEvents: structuredClone(renderEvents),
          nodeEvents: structuredClone(nodeEvents),
          projectorFailures: [...projectorFailures],
        };
      },
    };
  });
}

async function command(page, name) {
  await page.evaluate((value) => globalThis.dialogueQualification.command(value), name);
}

test("dialogue.controls reaches semantic routing, Render Events, Web Presentation, and Conversation result", { timeout: TIMEOUT }, async (t) => {
  const server = await fixture(t);
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await setup(page, server.origin);

  const firstId = await page.locator("lr-dialogue-conversation").getAttribute("conversation-id");
  assert.ok(firstId);
  assert.deepEqual(await page.evaluate(() => document.querySelector("lr-dialogue-conversation")._data), { windowStyle: "qualified-first" });
  assert.deepEqual(await page.evaluate(() => document.querySelector("lr-dialogue-character")._data), { portrait: "guide" });
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("lr-dialogue-choice")].map((choice) => choice._data)), [{ icon: "lock" }, { icon: "confirm" }]);

  assert.equal(await page.evaluate(() => document.querySelector("lr-dialogue-conversation")?._revealComplete), false);
  await page.evaluate(() => globalThis.dialogueQualification.ignoredKeyboard("Enter"));
  assert.equal(await page.evaluate(() => document.querySelector("lr-dialogue-conversation")?._revealComplete), false, "raw keyboard must not enter the Dialogue runtime");
  await command(page, "confirm");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true);
  assert.equal(await page.evaluate(() => globalThis.dialogueQualification.nodeEvents.length), 0, "reveal-first commit must not submit");
  await command(page, "next");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._selectedChoiceId === "yes");
  await command(page, "confirm");
  await page.waitForFunction((oldId) => {
    const conversation = document.querySelector("lr-dialogue-conversation");
    return conversation !== null && conversation.getAttribute("conversation-id") !== oldId;
  }, firstId);

  const secondId = await page.locator("lr-dialogue-conversation").getAttribute("conversation-id");
  assert.notEqual(secondId, firstId);
  await command(page, "history");
  await page.waitForFunction(() => {
    const history = document.querySelector("lr-dialogue-history");
    return history?.getAttribute("visible") === "true" && history._events.includes("scroll-to-latest");
  });
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("lr-dialogue-history-entry")].map((entry) => entry.getAttribute("entry-id"))), ["intro", "first"]);
  await command(page, "cancel");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-history")?.getAttribute("visible") === "false");
  assert.equal(await page.evaluate(() => globalThis.dialogueQualification.nodeEvents.length), 1, "History cancel must not submit the second Conversation");

  await command(page, "confirm");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true);
  await command(page, "confirm");
  const result = await page.evaluate(() => globalThis.dialogueQualification.finish());

  assert.deepEqual(result.returned, {
    type: "completed",
    value: {
      first: { type: "submitted", choiceId: "yes" },
      second: { type: "submitted" },
      history: [
        { entryId: "intro", speakerName: "Guide", text: "Welcome" },
        { entryId: "first", speakerName: "Guide", text: "Continue" },
      ],
    },
  });
  assert.deepEqual(result.observations, [{
    first: { type: "submitted", choiceId: "yes" },
    second: { type: "submitted" },
    history: [
      { entryId: "intro", speakerName: "Guide", text: "Welcome" },
      { entryId: "first", speakerName: "Guide", text: "Continue" },
    ],
  }]);
  assert.deepEqual(result.nodeEvents.map((event) => [event.name, event.data]), [
    ["submit", { conversationId: firstId, choiceId: "yes" }],
    ["submit", { conversationId: secondId }],
  ]);
  assert.deepEqual(result.renderEvents.map((event) => event.name), [
    "commit",
    "choice-next",
    "commit",
    "scroll-to-latest",
    "commit",
    "commit",
  ]);
  assert.deepEqual(result.projectorFailures, []);
  assert.ok(server.requests.includes("/game-libs/rpg-dialogue/dist/browser/rpg-dialogue.browser.js"));
  assert.ok(server.requests.includes("/game-libs/rpg-dialogue/dist/browser/rpg-dialogue.browser.css"));
});
