import { internalFailure, realizeContentRequest } from "./service-worker-content.js";
import { realizeExecutableRequest } from "./service-worker-executable.js";
import type { PwaServiceWorkerGenerationV1 } from "./bootstrap-protocol.js";

declare const __LOOMREALM_SW_GENERATION__: string;

const worker = self as unknown as ServiceWorkerGlobalScope;
const generation = __LOOMREALM_SW_GENERATION__;
const runtimeInfo: PwaServiceWorkerGenerationV1 = Object.freeze({ protocolVersion: 1, buildId: "loomrealm-pwa-v1", generation });

worker.addEventListener("install", () => {
  // v1 deliberately does not call skipWaiting(). Existing Sessions retain
  // their accepted generation until the next fresh Window bootstrap.
});

worker.addEventListener("activate", () => {
  // v1 deliberately does not claim uncontrolled clients.
});

worker.addEventListener("message", (event: ExtendableMessageEvent) => {
  const value = event.data as Record<string, unknown> | null;
  const reply = event.ports[0];
  if (reply === undefined || value === null || typeof value !== "object" || Array.isArray(value)) return;
  if (Object.keys(value).length !== 2 || value.type !== "loomrealm.pwa.sw-hello" || value.version !== 1) return;
  reply.postMessage(runtimeInfo);
  reply.close();
});

worker.addEventListener("fetch", (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (url.origin !== worker.location.origin) return;
  if (url.pathname === "/_lr/internal/runtime-info") {
    event.respondWith(Promise.resolve(new Response(JSON.stringify(runtimeInfo), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } })));
    return;
  }
  const executablePrefix = "/_lr/internal/executables/";
  if (url.pathname.startsWith(executablePrefix)) {
    const parts = url.pathname.slice(executablePrefix.length).split("/");
    event.respondWith(realizeExecutableRequest(event.request, parts).catch(internalFailure));
    return;
  }
  const contentPrefix = "/_lr/v1/games/";
  if (url.pathname.startsWith(contentPrefix)) {
    const parts = url.pathname.slice(contentPrefix.length).split("/");
    event.respondWith(realizeContentRequest(event.request, url, parts).catch(internalFailure));
  }
});
