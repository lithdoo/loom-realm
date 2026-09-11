const VERSION = /^sha256:[0-9a-f]{64}$/;

export type RendererResourceErrorCode = "not-found" | "conflict" | "invalid" | "unavailable" | "cancelled";

export class RendererResourceError extends Error {
  constructor(readonly code: RendererResourceErrorCode) {
    super(code);
    this.name = "RendererResourceError";
  }
}

export interface RendererContentAccess {
  readonly origin: string | URL;
  readonly installationId: string;
  readonly token: string;
}

export interface RendererResource {
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly contentVersion: string;
}

export interface RendererResourceClient {
  resource(namespace: string, key: string, expectedContentVersion: string, signal?: AbortSignal): Promise<RendererResource>;
}

function segment(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value === "." || value === ".." || /[\\/\0]|\p{Cc}|\p{Cs}/u.test(value) || /^[A-Za-z]:/.test(value) || value.startsWith("\\\\") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) throw new TypeError("Invalid resource segment");
}

function signal(value: unknown): value is AbortSignal {
  return value !== null && typeof value === "object" && typeof (value as AbortSignal).aborted === "boolean" && typeof (value as AbortSignal).addEventListener === "function" && typeof (value as AbortSignal).removeEventListener === "function";
}

function mapStatus(status: number): RendererResourceError {
  if (status === 404) return new RendererResourceError("not-found");
  if (status === 409) return new RendererResourceError("conflict");
  if (status === 422) return new RendererResourceError("invalid");
  return new RendererResourceError("unavailable");
}

export function createRendererResourceClient(access: RendererContentAccess, lifetimeSignal: AbortSignal): RendererResourceClient {
  if (access === null || typeof access !== "object" || !signal(lifetimeSignal) || typeof access.installationId !== "string" || access.installationId.length === 0 || typeof access.token !== "string" || access.token.length === 0) throw new TypeError("Invalid Renderer Content access");
  let origin: URL;
  try { origin = new URL(access.origin); } catch { throw new TypeError("Invalid Renderer Content origin"); }
  if ((origin.protocol !== "http:" && origin.protocol !== "https:") || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new TypeError("Invalid Renderer Content origin");
  const base = new URL(`_lr/v1/games/${encodeURIComponent(access.installationId)}/resources/`, origin);
  const NativeURL = URL;
  const trustedFetch = globalThis.fetch.bind(globalThis);
  const cache = new Map<string, { readonly bytes: Uint8Array; readonly mime: string; readonly contentVersion: string }>();

  return Object.freeze({
    resource(namespace: string, key: string, expectedContentVersion: string, localSignal?: AbortSignal): Promise<RendererResource> {
      segment(namespace);
      if (typeof key !== "string") throw new TypeError("Invalid resource key");
      const parts = key.split("/");
      for (const part of parts) segment(part);
      if (typeof expectedContentVersion !== "string" || !VERSION.test(expectedContentVersion)) throw new TypeError("Invalid expected Content version");
      if (localSignal !== undefined && !signal(localSignal)) throw new TypeError("Invalid resource AbortSignal");
      if (localSignal?.aborted || lifetimeSignal.aborted) return Promise.reject(new RendererResourceError("cancelled"));
      const cacheKey = `${access.installationId}\0${namespace}\0${key}\0${expectedContentVersion}`;
      const cached = cache.get(cacheKey);
      if (cached) return Promise.resolve(Object.freeze({ ...cached, bytes: Uint8Array.from(cached.bytes) }));
      return (async () => {
        const controller = new AbortController();
        const cancel = () => controller.abort();
        lifetimeSignal.addEventListener("abort", cancel, { once: true });
        localSignal?.addEventListener("abort", cancel, { once: true });
        try {
          const path = `${encodeURIComponent(namespace)}/${parts.map(encodeURIComponent).join("/")}`;
          const response = await trustedFetch(new NativeURL(path, base), { headers: { Authorization: `Bearer ${access.token}` }, signal: controller.signal });
          if (!response.ok) throw mapStatus(response.status);
          const actual = response.headers.get("x-loom-content-version");
          const mime = response.headers.get("content-type");
          if (!actual || !VERSION.test(actual) || response.headers.get("etag") !== `"${actual}"` || !mime) throw new RendererResourceError("invalid");
          if (actual !== expectedContentVersion) throw new RendererResourceError("conflict");
          const bytes = Uint8Array.from(new Uint8Array(await response.arrayBuffer()));
          const stored = Object.freeze({ bytes, mime, contentVersion: actual });
          cache.set(cacheKey, stored);
          return Object.freeze({ ...stored, bytes: Uint8Array.from(bytes) });
        } catch (error) {
          if (error instanceof RendererResourceError) throw error;
          if (controller.signal.aborted) throw new RendererResourceError("cancelled");
          throw new RendererResourceError("unavailable");
        } finally {
          lifetimeSignal.removeEventListener("abort", cancel);
          localSignal?.removeEventListener("abort", cancel);
        }
      })();
    },
  });
}
