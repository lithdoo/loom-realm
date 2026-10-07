import { preparePwaGame } from "@loomrealm/game-launcher-pwa";
import { runMain } from "@loomrealm/main";
import { createRealmStateAuthority } from "@loomrealm/realm-state";
import { parsePwaRuntimeInfoV1, parsePwaSessionBootstrapV1, sameServiceWorkerGeneration } from "./bootstrap-protocol.js";
import { getInstallation, readInstallationObject } from "./installation-store.js";
import { PwaPlatform } from "./pwa-platform.js";

const decoder = new TextDecoder("utf-8", { fatal: true });
let consumed = false;
const session = self as unknown as DedicatedWorkerGlobalScope;

session.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (consumed) return;
  consumed = true;
  void start(event.data).catch((cause) => {
    session.postMessage(Object.freeze({ type: "loomrealm.pwa.session-status", version: 1, status: "failed", detail: cause instanceof Error ? cause.message : "Session bootstrap failed" }));
    session.close();
  });
}, { once: true });

async function verifiedText(rootId: string, reference: { readonly contentVersion: string; readonly size: number }): Promise<string> {
  const bytes = await readInstallationObject(rootId, reference.contentVersion);
  if (bytes.byteLength !== reference.size) throw new Error("Installation object size mismatch");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer));
  const version = `sha256:${[...digest].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  if (version !== reference.contentVersion) throw new Error("Installation object integrity mismatch");
  return decoder.decode(bytes);
}

async function start(raw: unknown): Promise<void> {
  const bootstrap = parsePwaSessionBootstrapV1(raw);
  const runtimeResponse = await fetch("/_lr/internal/runtime-info", { cache: "no-store" });
  if (!runtimeResponse.ok) throw new Error("Service Worker runtime-info unavailable");
  const runtimeInfo = parsePwaRuntimeInfoV1(await runtimeResponse.json());
  if (!sameServiceWorkerGeneration(runtimeInfo, bootstrap.expectedServiceWorker)) throw new Error("Service Worker generation mismatch before PREPARE");
  const prepared = await preparePwaGame({ installationId: bootstrap.installationId }, {
    expectedServiceWorker: bootstrap.expectedServiceWorker,
    runnerPolicy: { helloDeadlineMs: 10_000, frameDeadlineMs: 10_000, terminalCleanupDeadlineMs: 250 },
    resolveModuleUrl: (logicalModule) => new URL(`/_lr/internal/executables/${encodeURIComponent(bootstrap.installationId)}/${logicalModule.split("/").map(encodeURIComponent).join("/")}`, location.origin).href,
    async openPublishedInstallation(installationId) {
      const installation = await getInstallation(installationId);
      if (installation === null || installation.state !== "complete") throw new Error("INSTALLATION_NOT_COMPLETE");
      const [gameEntryText, launchManifestText] = await Promise.all([
        verifiedText(installation.rootId, installation.gameEntry),
        verifiedText(installation.rootId, installation.launchManifest),
      ]);
      const current = await getInstallation(installationId);
      if (current?.state !== "complete" || current.generation !== installation.generation) throw new Error("INSTALLATION_INVALID");
      return Object.freeze({
        installationId,
        generation: installation.generation,
        gameEntryText,
        launchManifestText,
        executableIndex: installation.executableIndex.map(({ logicalModule, contentVersion, imports }) => Object.freeze({ logicalModule, contentVersion, imports })),
      });
    },
  });
  session.postMessage(Object.freeze({ type: "loomrealm.pwa.session-status", version: 1, status: "prepared", sessionEpoch: bootstrap.sessionEpoch }));
  let fatalListener: (() => void) | null = null;
  let fatal = false;
  const authority = createRealmStateAuthority(prepared.state, { onFatal() { fatal = true; fatalListener?.(); } });
  const realmStateFatal = Object.freeze({ subscribe(listener: () => void) { fatalListener = listener; if (fatal) queueMicrotask(listener); return () => { if (fatalListener === listener) fatalListener = null; }; } });
  const controller = new AbortController();
  const platform = new PwaPlatform({ launchPlan: prepared.launchPlan, sessionEpoch: bootstrap.sessionEpoch, bridgePort: bootstrap.windowBridgePort, realmStateAuthority: authority, realmStateFatal, observe: (event) => session.postMessage(Object.freeze({ type: "loomrealm.pwa.observation", version: 1, sessionEpoch: bootstrap.sessionEpoch, event })) });
  const onShutdown = (event: MessageEvent<unknown>) => {
    const value = event.data as Record<string, unknown> | null;
    if (value !== null && typeof value === "object" && Object.keys(value).length === 3 && value.type === "loomrealm.pwa.session-shutdown" && value.version === 1 && value.sessionEpoch === bootstrap.sessionEpoch) controller.abort();
  };
  session.addEventListener("message", onShutdown);
  try {
    session.postMessage(Object.freeze({ type: "loomrealm.pwa.session-status", version: 1, status: "main-started", sessionEpoch: bootstrap.sessionEpoch }));
    const result = await runMain({
      bootstrap: prepared.logicalBootstrap,
      platform: platform.main,
      signal: controller.signal,
      policy: { runtimeBootstrapDeadlineMs: 10_000, frameDeadlineMs: 10_000, shutdownDeadlineMs: 500, terminationDeadlineMs: 500 },
    });
    session.postMessage(Object.freeze({ type: "loomrealm.pwa.session-status", version: 1, status: "settled", sessionEpoch: bootstrap.sessionEpoch, result }));
  } finally {
    session.removeEventListener("message", onShutdown);
    platform.close();
    authority.terminate();
  }
}
