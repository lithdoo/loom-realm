import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHostraRuntimeHosting, prepareHostraGame } from "@loomrealm/game-launcher-hostra";
import { runMain, type MainSessionResult } from "@loomrealm/main";
import { createDesktopContentService, prepareDesktopContentView, type DesktopContentGrant, type PreparedDesktopContentView } from "./content-service.js";
import { DesktopDataConnectionBroker } from "./data-broker.js";
import { DESKTOP_BOOTSTRAP_CHANNEL, type DesktopRendererBootstrapEnvelope } from "./desktop-bootstrap.js";
import { connectHostraRpc, type HostraRpc } from "./hostra-rpc.js";
import { createLoopbackDataSettlement, type LoopbackDataSettlement } from "./loopback-data-settlement.js";
import { LoopbackRendererControlBinding, type LoopbackRendererDocument } from "./loopback-renderer-control.js";

const runnerPolicy = Object.freeze({
  helloDeadlineMs: 10_000,
  frameDeadlineMs: 10_000,
  terminalCleanupDeadlineMs: 100,
  terminationGraceMs: 100,
});
const mainPolicy = Object.freeze({
  runtimeBootstrapDeadlineMs: 10_000,
  frameDeadlineMs: 10_000,
  shutdownDeadlineMs: 100,
  terminationDeadlineMs: 250,
});

export interface DesktopProduct {
  readonly windowId: string;
  readonly main: Promise<MainSessionResult>;
  readonly closed: Promise<void>;
  close(): Promise<void>;
}

export interface DesktopProductOptions {
  readonly installationRoot?: string;
  readonly signal?: AbortSignal;
  readonly observe?: (event: Readonly<Record<string, unknown> & { type: string }>) => void;
}

export async function startDesktopProduct(options: DesktopProductOptions = {}): Promise<DesktopProduct> {
  const observe = (event: Readonly<Record<string, unknown> & { type: string }>) => { try { options.observe?.(Object.freeze(event)); } catch {} };
  let hostra: HostraRpc | null = null;
  let content: Awaited<ReturnType<typeof createDesktopContentService>> | null = null;
  let preparedView: PreparedDesktopContentView | null = null;
  let runtimeGrant: DesktopContentGrant | null = null;
  let documentGrant: DesktopContentGrant | null = null;
  let documentControl: LoopbackRendererDocument | null = null;
  let documentData: LoopbackDataSettlement | null = null;
  let broker: DesktopDataConnectionBroker | null = null;
  let rendererControl: LoopbackRendererControlBinding | null = null;
  let main: Promise<MainSessionResult> | null = null;
  let windowId: string | null = null;
  let termination: Promise<void> | null = null;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
  let startupFailure: unknown = null;
  let startupComplete = false;
  const controller = new AbortController();
  let detachExternalSignal = () => {};

  const retireDocument = (cause: unknown = new Error("Desktop document retired")) => {
    if (documentControl !== null || documentData !== null || documentGrant !== null) observe({ type: "document-retired" });
    documentControl?.retire(cause); documentControl = null;
    documentData?.close(); documentData = null;
    if (documentGrant !== null) content?.revokeGrant(documentGrant);
    documentGrant = null;
  };

  const beginTermination = (reason: unknown, closeWindow: boolean): Promise<void> => {
    if (termination !== null) return termination;
    observe({ type: "termination-began", reason: reason instanceof Error ? reason.message : String(reason) });
    termination = (async () => {
      controller.abort(reason);
      observe({ type: "termination-main-aborted" });
      let mainFailure: unknown = null;
      if (main !== null) {
        observe({ type: "termination-await-main" });
        try { await main; } catch (cause) { mainFailure = cause; }
        observe({ type: "termination-main-finished" });
      }
      retireDocument(reason);
      rendererControl?.close();
      observe({ type: "renderer-control-closed" });
      broker?.close();
      observe({ type: "data-broker-closed" });
      if (runtimeGrant !== null) content?.revokeGrant(runtimeGrant);
      runtimeGrant = null;
      try { await content?.close(); } catch {}
      if (content === null) try { await preparedView?.close(); } catch {}
      observe({ type: "content-closed" });
      if (closeWindow && hostra !== null && windowId !== null) {
        try { await hostra.closeWindow(windowId); } catch {}
      }
      try { await hostra?.close(); } catch {}
      detachExternalSignal();
      observe({ type: "product-closed" });
      if (mainFailure !== null) throw mainFailure;
    })();
    void termination.then(resolveClosed, resolveClosed);
    return termination;
  };

  const triggerTermination = (reason: unknown, closeWindow: boolean): void => {
    if (!startupComplete) {
      controller.abort(reason);
      return;
    }
    void beginTermination(reason, closeWindow).catch(() => {});
  };

  if (options.signal !== undefined) {
    const onAbort = () => triggerTermination(options.signal!.reason, false);
    if (options.signal.aborted) onAbort();
    else {
      options.signal.addEventListener("abort", onAbort, { once: true });
      detachExternalSignal = () => options.signal!.removeEventListener("abort", onAbort);
    }
  }

  const assertStarting = () => { if (controller.signal.aborted) throw controller.signal.reason; };

  try {
    observe({ type: "startup-stage", stage: "connect-hostra" });
    hostra = await connectHostraRpc();
    assertStarting();
    observe({ type: "startup-stage", stage: "prepare" });
    const installationRoot = options.installationRoot ?? fileURLToPath(new URL("../../../examples/essentials-v21.1/", import.meta.url));
    const prepared = await prepareHostraGame({ source: { installationRoot }, runnerPolicy });
    const view = await prepareDesktopContentView(prepared);
    preparedView = view;
    assertStarting();
    const entryScript = await readFile(new URL("./browser/renderer.js", import.meta.url));
    const presentation = JSON.parse(await readFile(new URL("../../../examples/essentials-v21.1/presentation.json", import.meta.url), "utf8")) as unknown;
    broker = new DesktopDataConnectionBroker({ observeCandidate: (event) => observe({ ...event, type: `data-${event.type}` }) });
    rendererControl = new LoopbackRendererControlBinding();
    content = await createDesktopContentService({
      view,
      trustedShell: {
      entryScript,
      bootstrap: async (signal): Promise<DesktopRendererBootstrapEnvelope> => {
        retireDocument(new Error("Fresh top-level document navigation"));
        const control = await rendererControl!.beginDocument(signal);
        let settlement: LoopbackDataSettlement | null = null;
        let grant: DesktopContentGrant | null = null;
        try {
          settlement = await createLoopbackDataSettlement();
          if (signal.aborted) throw signal.reason;
          broker!.attachWindowRenderer(control.rendererControlToken, settlement);
          grant = content!.createGrant({ permissions: ["resources"], expiresAtUnixMs: Date.now() + 86_400_000 });
          const access = content!.access(grant);
          documentControl = control;
          documentData = settlement;
          documentGrant = grant;
          observe({ type: "document-bootstrap", rendererIdentity: createHash("sha256").update(control.rendererIdentity).digest("hex") });
          return Object.freeze({
            channel: DESKTOP_BOOTSTRAP_CHANNEL,
            rendererControlToken: control.rendererControlToken,
            rendererIdentity: control.rendererIdentity,
            controlEndpoint: control.controlEndpoint,
            dataSettlementEndpoint: settlement.endpoint,
            content: Object.freeze({ origin: access.origin.href, installationId: access.installationId, token: access.token }),
            presentation,
          });
        } catch (cause) {
          control.retire(cause); settlement?.close(); if (grant !== null) content!.revokeGrant(grant);
          throw cause;
        }
      },
      },
    });
    assertStarting();
    observe({ type: "startup-stage", stage: "content" });
    if (content.shell === null) throw new Error("Desktop shell unavailable");
    runtimeGrant = content.createGrant({ permissions: ["records", "groups", "resources"], expiresAtUnixMs: Date.now() + 86_400_000 });
    const runtimeAccess = content.access(runtimeGrant);

    const runtimeHosting = createHostraRuntimeHosting({
      launchPlan: prepared.launchPlan,
      contentAccess: { origin: runtimeAccess.origin.href, installationId: runtimeAccess.installationId, token: runtimeAccess.token },
      onRuntimeDataProvisioner: broker.onRuntimeDataProvisioner,
    });
    main = runMain({
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
    observe({ type: "startup-stage", stage: "main" });
    void main.then(
      (result) => {
        observe({ type: "main-settled", result: result.kind });
        if (result.kind !== "shutdown") triggerTermination(new Error(`Main settled: ${result.kind}`), true);
      },
      (cause) => { observe({ type: "main-rejected", cause: cause instanceof Error ? cause.stack ?? cause.message : String(cause) }); triggerTermination(cause, false); },
    );
    const requestedWindowId = `loomrealm-${randomBytes(16).toString("base64url")}`;
    const detachEvents = hostra.onEvent((event) => {
      if (event.type === "window.closed" && event.data.windowId === windowId) triggerTermination(new Error("Hostra Window closed"), false);
      if (event.type === "host.shuttingDown") triggerTermination(new Error("Hostra shutting down"), false);
    });
    windowId = await hostra.openWindow({ id: requestedWindowId, title: "LoomRealm", width: 800, height: 600, loadUrl: content.shell.href });
    observe({ type: "startup-stage", stage: "window-open", windowId });
    void hostra.closed.then((cause) => { detachEvents(); triggerTermination(cause, false); });
    assertStarting();
    startupComplete = true;
    const productMain = main;
    const productWindowId = windowId;
    return Object.freeze({
      windowId: productWindowId,
      main: productMain,
      closed,
      close: () => beginTermination(new Error("Desktop product close requested"), true),
    });
  } catch (cause) {
    startupFailure = cause;
    try { await beginTermination(cause, windowId !== null); } catch {}
    throw startupFailure;
  }
}
