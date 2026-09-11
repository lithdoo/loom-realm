import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BrowserWindow, MessageChannelMain, type App } from "electron";
import { createHostraRuntimeHosting, prepareHostraGame } from "@loomrealm/game-launcher-hostra";
import { runMain, type MainSessionResult } from "@loomrealm/main";
import { createDesktopContentService, prepareDesktopContentView, type DesktopContentGrant } from "./content-service.js";
import { DesktopDataConnectionBroker } from "./data-broker.js";
import { DESKTOP_BOOTSTRAP_CHANNEL, type DesktopRendererBootstrapEnvelope } from "./desktop-bootstrap.js";
import { ElectronRendererControlBinding } from "./electron-renderer-control.js";
import { WindowRendererDataSettlement } from "./window-data-binding.js";

const runnerPolicy = Object.freeze({
  helloDeadlineMs: 10_000,
  frameDeadlineMs: 10_000,
  terminalCleanupDeadlineMs: 1_000,
  terminationGraceMs: 1_000,
});
const mainPolicy = Object.freeze({
  runtimeBootstrapDeadlineMs: 10_000,
  frameDeadlineMs: 10_000,
  shutdownDeadlineMs: 10_000,
  terminationDeadlineMs: 3_000,
});

export interface DesktopProduct {
  readonly window: BrowserWindow;
  readonly main: Promise<MainSessionResult>;
  close(): Promise<void>;
}

export interface DesktopProductOptions {
  readonly installationRoot?: string;
  readonly observe?: (event: Readonly<Record<string, unknown> & { type: string }>) => void;
}

export async function startDesktopProduct(application: App, options: DesktopProductOptions = {}): Promise<DesktopProduct> {
  const observe = (event: Readonly<Record<string, unknown> & { type: string }>) => { try { options.observe?.(Object.freeze(event)); } catch {} };
  const installationRoot = options.installationRoot ?? fileURLToPath(new URL("../../../examples/essentials-v21.1/", import.meta.url));
  const prepared = await prepareHostraGame({ source: { installationRoot }, runnerPolicy });
  const view = await prepareDesktopContentView(prepared);
  const entryScript = await readFile(new URL("./browser/renderer.js", import.meta.url));
  const presentation = JSON.parse(await readFile(new URL("../../../examples/essentials-v21.1/presentation.json", import.meta.url), "utf8")) as unknown;
  const content = await createDesktopContentService({ view, trustedShell: { entryScript } });
  if (content.shell === null) throw new Error("Desktop shell unavailable");
  const runtimeGrant = content.createGrant({ permissions: ["records", "groups", "resources"], expiresAtUnixMs: Date.now() + 86_400_000 });
  const runtimeAccess = content.access(runtimeGrant);
  const broker = new DesktopDataConnectionBroker({ observeCandidate: (event) => observe({ ...event, type: `data-${event.type}` }) });
  const rendererControl = new ElectronRendererControlBinding();
  const controller = new AbortController();
  const runtimeHosting = createHostraRuntimeHosting({
    launchPlan: prepared.launchPlan,
    contentAccess: { origin: runtimeAccess.origin.href, installationId: runtimeAccess.installationId, token: runtimeAccess.token },
    onRuntimeDataProvisioner: broker.onRuntimeDataProvisioner,
  });
  const main = runMain({
    bootstrap: prepared.logicalBootstrap,
    policy: mainPolicy,
    signal: controller.signal,
    platform: Object.freeze({
      scheduler: Object.freeze({ schedule(delayMs: number, callback: () => void) { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); } }),
      opaqueMaterial: Object.freeze({ generate: () => randomBytes(32).toString("base64url") }),
      runtimeHosting,
      rendererControl: rendererControl.binding,
      dataConnections: broker.sink,
    }),
  });
  void main.then(
    (result) => observe({ type: "main-settled", result: result.kind }),
    () => observe({ type: "main-rejected" }),
  );

  const window = new BrowserWindow({
    width: 800,
    height: 600,
    show: true,
    webPreferences: {
      preload: fileURLToPath(new URL("./browser/preload.cjs", import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  let documentSettlement: WindowRendererDataSettlement | null = null;
  let documentGrant: DesktopContentGrant | null = null;
  let closing: Promise<void> | null = null;

  const retireDocument = () => {
    if (documentSettlement !== null || documentGrant !== null) observe({ type: "document-retired" });
    documentSettlement?.close(); documentSettlement = null;
    if (documentGrant !== null) content.revokeGrant(documentGrant);
    documentGrant = null;
  };
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => { if (url !== content.shell!.href) event.preventDefault(); });
  window.webContents.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) retireDocument(); });
  window.webContents.on("did-finish-load", () => {
    retireDocument();
    const controlCandidate = rendererControl.fulfillNextDocument();
    if (controlCandidate === null) { window.webContents.close(); return; }
    const dataChannel = new MessageChannelMain();
    documentSettlement = new WindowRendererDataSettlement(dataChannel.port1 as never);
    broker.attachWindowRenderer(controlCandidate.rendererControlToken, documentSettlement);
    documentGrant = content.createGrant({ permissions: ["resources"], expiresAtUnixMs: Date.now() + 86_400_000 });
    const access = content.access(documentGrant);
    const envelope: DesktopRendererBootstrapEnvelope = Object.freeze({
      channel: DESKTOP_BOOTSTRAP_CHANNEL,
      rendererControlToken: controlCandidate.rendererControlToken,
      content: Object.freeze({ origin: access.origin.href, installationId: access.installationId, token: access.token }),
      presentation,
    });
    observe({ type: "document-bootstrap", rendererIdentity: createHash("sha256").update(controlCandidate.rendererControlToken).digest("hex") });
    window.webContents.postMessage(DESKTOP_BOOTSTRAP_CHANNEL, envelope, [controlCandidate.port, dataChannel.port2]);
  });

  const close = (): Promise<void> => {
    if (closing !== null) return closing;
    closing = Promise.resolve().then(async () => {
      retireDocument();
      if (!window.isDestroyed()) window.destroy();
      controller.abort(new Error("Desktop product shutdown"));
      await main;
      rendererControl.close();
      observe({ type: "renderer-control-closed" });
      broker.close();
      observe({ type: "data-broker-closed" });
      content.revokeGrant(runtimeGrant);
      await content.close();
      observe({ type: "content-closed" });
      observe({ type: "product-closed" });
    });
    return closing;
  };
  window.on("closed", () => { void close().finally(() => application.quit()); });
  await window.loadURL(content.shell.href);
  return Object.freeze({ window, main, close });
}
