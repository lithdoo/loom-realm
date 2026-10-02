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
    "@loomrealm/renderer-control": "/packages/renderer-control/dist/index.js",
    "@loomrealm/data": "/packages/data/dist/index.js",
    "@loomrealm/subsystem": "/packages/subsystem/dist/index.js",
    "@loomrealm/subsystem/host": "/packages/subsystem/dist/host/index.js",
    "@loomrealm/renderer": "/packages/renderer/dist/index.js",
    "@loomrealm/renderer/web-presentation": "/packages/renderer/dist/web-presentation.js",
    "@loomrealm-game/schema-form": "/game-libs/schema-form/dist/index.js",
  },
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
        <link rel="stylesheet" href="/game-libs/schema-form/dist/browser/schema-form.browser.css">
        <script src="/game-libs/schema-form/dist/browser/schema-form.browser.js"></script>
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

async function browserPage(t) {
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  return browser.newPage();
}

async function setup(page, origin, { cancelable = true } = {}) {
  await page.goto(origin);
  await page.evaluate(async ({ cancelable }) => {
    const [foundation, runtimeControl, rendererControl, subsystem, subsystemHost, renderer, presentation, schemaForm] = await Promise.all([
      import("@loomrealm/foundation/testing"),
      import("@loomrealm/runtime-control"),
      import("@loomrealm/renderer-control"),
      import("@loomrealm/subsystem"),
      import("@loomrealm/subsystem/host"),
      import("@loomrealm/renderer"),
      import("@loomrealm/renderer/web-presentation"),
      import("@loomrealm-game/schema-form"),
    ]);
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
    const statuses = [];
    const returns = [];
    const observations = [];
    const mainRuntime = runtimeControl.createMainRuntimeControlPeer({
      carrier: runtimePair.left,
      scheduler,
      frameDeadlineMs: 5_000,
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
          try {
            const result = await schemaForm.openSchemaForm(scope, frame, {
              cancelable,
              schema: {
                version: 1,
                title: "Qualified Form",
                description: "Real Schema Form path",
                fields: [
                  { key: "name", kind: "string", label: "Name", required: true },
                  { key: "enabled", kind: "boolean", label: "Enabled", default: false },
                ],
                validateOnChange: `(data) => data.name.length < 2 ? { name: "Too short" } : null`,
                validateOnSubmit: `(data) => data.name === "blocked" ? { name: "Blocked" } : null`,
              },
            });
            observations.push({ observation: "resolved", result });
            return subsystem.completed({ observation: "resolved", result });
          } catch (error) {
            const rejection = {
              observation: "rejected",
              name: error?.name,
              ...(typeof error?.code === "string" ? { code: error.code } : {}),
            };
            observations.push(rejection);
            return subsystem.completed(rejection);
          }
        },
      })),
      runtimeControl: { async acquire() { return runtimePair.right; } },
      runtimePolicy: { scheduler, helloDeadlineMs: 5_000, frameDeadlineMs: 5_000, terminalCleanupDeadlineMs: 1_000 },
      launch: { subsystemKey: "forms", bootstrapToken: "secret", controlProtocolVersions: [1] },
      data: {
        async acquire() {
          return { carrier: dataPair.left, generation: 1, dataProfile: "loomrealm.renderer-data/1" };
        },
      },
    });
    runtime.catch(() => {});

    const holder = renderer.createRendererControlHolder({
      async acquire(subsystemKey, generation, dataProfile) {
        if (subsystemKey !== "forms" || generation !== 1 || dataProfile !== "loomrealm.renderer-data/1") throw new Error("Unexpected Data authority");
        return dataPair.right;
      },
    });
    const projectorFailures = [];
    const projector = new presentation.WebProjector({
      document,
      resourceClient: { async resource() { throw new Error("unused"); } },
      reportFailure(error) { projectorFailures.push(String(error)); },
    });
    const nodeEvents = [];
    const detach = presentation.attachRendererPresentation(holder, {
      reevaluate(source, emitNodeEvent) {
        projector.reevaluate(source, (event) => {
          nodeEvents.push(structuredClone(event));
          emitNodeEvent(event);
        });
      },
    });
    const snapshot = {
      sessionId: "schema-form-qualification",
      revision: 1,
      runtimes: [{ subsystemKey: "forms", state: "ready" }],
      stack: [{ frameId: "form-frame", subsystemKey: "forms", lifecycle: "active", activationId: "form-activation" }],
      inputTarget: { subsystemKey: "forms", frameId: "form-frame", activationId: "form-activation" },
      dataAuthorities: [{ subsystemKey: "forms", generation: 1, dataProfile: "loomrealm.renderer-data/1" }],
    };
    const publisher = rendererControl.createMainRendererControlPeer({
      carrier: rendererPair.left,
      acceptHello() {
        return { kind: "accepted", snapshot, preparedHelloText: rendererControl.prepareRendererHelloResultV1(snapshot) };
      },
    });
    await holder.connect({ carrier: rendererPair.right, rendererControlToken: "renderer-token" });
    await mainRuntime.identified;
    await waitFor(() => statuses.some((status) => status.state === "ready"), "Subsystem ready");
    await mainRuntime.frame.initialize({ frameId: "form-frame", input: null });
    await mainRuntime.frame.activate({ frameId: "form-frame", activationId: "form-activation" });
    await waitFor(() => document.querySelector("lr-schema-form") !== null, "projected Schema Form");
    globalThis.schemaQualification = {
      mainRuntime, runtime, returns, observations, nodeEvents, statuses, publisher, projector, detach, projectorFailures, waitFor,
      async finish() {
        await waitFor(() => returns.length === 1, "Frame return");
        await waitFor(() => document.querySelector("lr-schema-form") === null, "Schema Form removal");
        const returned = structuredClone(returns[0].result);
        return { returned, projectorFailures: [...projectorFailures] };
      },
    };
  }, { cancelable });
}

async function diagnostic(page) {
  return page.evaluate(() => {
    const state = globalThis.schemaQualification;
    return {
      nodeEvents: state.nodeEvents,
      returns: state.returns,
      observations: state.observations,
      statuses: state.statuses,
      projectorFailures: state.projectorFailures,
      formPresent: document.querySelector("lr-schema-form") !== null,
      body: document.body.innerHTML,
    };
  });
}

test("real Chromium submits through the complete Schema Form authority path", { timeout: TIMEOUT }, async (t) => {
  const server = await fixture(t);
  const page = await browserPage(t);
  await setup(page, server.origin);
  const nativeInput = page.locator("lr-schema-form-field").nth(0).locator("wa-input input");
  await nativeInput.fill("A");
  try {
    await page.waitForFunction(() => document.querySelector("lr-schema-form-field")?.shadowRoot?.querySelector(".error")?.textContent === "Too short", undefined, { timeout: 5_000 });
  } catch {
    assert.fail(`Change did not reconcile: ${JSON.stringify(await diagnostic(page))}`);
  }
  await nativeInput.fill("Alice");
  try {
    await page.waitForFunction(() => document.querySelector("lr-schema-form-field")?.shadowRoot?.querySelector(".error") === null, undefined, { timeout: 5_000 });
  } catch {
    assert.fail(`Valid Change did not reconcile: ${JSON.stringify(await diagnostic(page))}`);
  }
  await page.locator("lr-schema-form").locator('wa-button[variant="brand"] button').click();
  let result;
  try {
    result = await page.evaluate(() => globalThis.schemaQualification.finish());
  } catch (error) {
    assert.fail(`Submit did not finish: ${error}; ${JSON.stringify(await diagnostic(page))}`);
  }
  assert.deepEqual(result, {
    returned: { type: "completed", value: { observation: "resolved", result: { type: "submitted", value: { name: "Alice", enabled: false } } } },
    projectorFailures: [],
  });
  assert.ok(server.requests.includes("/game-libs/schema-form/dist/browser/schema-form.browser.js"));
  assert.ok(server.requests.includes("/game-libs/schema-form/dist/browser/schema-form.browser.css"));
});

test("real Chromium user Cancel resolves cancelled through the existing input channel", { timeout: TIMEOUT }, async (t) => {
  const server = await fixture(t);
  const page = await browserPage(t);
  await setup(page, server.origin, { cancelable: true });
  await page.locator("lr-schema-form").locator("wa-button").filter({ hasText: "Cancel" }).locator("button").click();
  const result = await page.evaluate(() => globalThis.schemaQualification.finish());
  assert.deepEqual(result.returned, { type: "completed", value: { observation: "resolved", result: { type: "cancelled" } } });
  assert.deepEqual(result.projectorFailures, []);
});

test("real Frame abort rejects openSchemaForm with AbortError and removes presentation", { timeout: TIMEOUT }, async (t) => {
  const server = await fixture(t);
  const page = await browserPage(t);
  await setup(page, server.origin, { cancelable: false });
  await page.evaluate(async () => {
    await globalThis.schemaQualification.mainRuntime.frame.closeFrame({ frameId: "form-frame" });
    await globalThis.schemaQualification.waitFor(() => globalThis.schemaQualification.observations.length === 1, "AbortError observation");
    await globalThis.schemaQualification.waitFor(() => document.querySelector("lr-schema-form") === null, "aborted form removal");
  });
  const result = await page.evaluate(async () => {
    const state = globalThis.schemaQualification;
    const observation = structuredClone(state.observations[0]);
    return { observation, projectorFailures: [...state.projectorFailures], formPresent: document.querySelector("lr-schema-form") !== null };
  });
  assert.deepEqual(result, {
    observation: { observation: "rejected", name: "AbortError" },
    projectorFailures: [],
    formPresent: false,
  });
});
