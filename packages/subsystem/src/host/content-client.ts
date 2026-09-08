import { parseJsonText, type JsonValue } from "@loomrealm/wire";
import {
  ContentReadError,
  type ContentClient,
  type ContentReadOptions,
  type ContentRecord,
  type ContentResource,
} from "../content.js";

const VERSION = /^sha256:[0-9a-f]{64}$/;

export interface BoundContentAccess {
  readonly origin: string | URL;
  readonly installationId: string;
  readonly token: string;
}

function segment(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value === "." || value === ".." || /[\\/\0]|\p{Cc}|\p{Cs}/u.test(value) || /^[A-Za-z]:/.test(value) || value.startsWith("\\\\") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
    throw new TypeError("Invalid Content segment");
  }
}

function resourceKey(value: unknown): asserts value is string {
  if (typeof value !== "string") throw new TypeError("Invalid Content resource key");
  const parts = value.split("/");
  if (parts.length === 0) throw new TypeError("Invalid Content resource key");
  for (const part of parts) segment(part);
}

function abortSignal(value: unknown): value is AbortSignal {
  return value !== null && typeof value === "object" && typeof (value as AbortSignal).aborted === "boolean" && typeof (value as AbortSignal).addEventListener === "function" && typeof (value as AbortSignal).removeEventListener === "function";
}

function readOptions(value: ContentReadOptions | undefined): AbortSignal | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid Content read options");
  if (Object.keys(value).some((key) => key !== "signal")) throw new TypeError("Unknown Content read option");
  if (Object.hasOwn(value, "signal") && value.signal !== undefined && !abortSignal(value.signal)) throw new TypeError("Invalid Content AbortSignal");
  return value.signal;
}

function mapStatus(status: number): ContentReadError {
  if (status === 404) return new ContentReadError("CONTENT_NOT_FOUND");
  if (status === 409) return new ContentReadError("CONTENT_CONFLICT");
  if (status === 422) return new ContentReadError("CONTENT_INVALID");
  return new ContentReadError("CONTENT_UNAVAILABLE");
}

function contentVersion(response: Response): string {
  const value = response.headers.get("x-loom-content-version");
  if (!value || !VERSION.test(value) || response.headers.get("etag") !== `"${value}"`) throw new ContentReadError("CONTENT_INVALID");
  return value;
}

function combineSignal(local: AbortSignal | undefined, lifetime: AbortSignal): { readonly signal: AbortSignal; close(): void } {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  lifetime.addEventListener("abort", cancel, { once: true });
  local?.addEventListener("abort", cancel, { once: true });
  if (lifetime.aborted || local?.aborted) controller.abort();
  return {
    signal: controller.signal,
    close() {
      lifetime.removeEventListener("abort", cancel);
      local?.removeEventListener("abort", cancel);
    },
  };
}

function encodeResourceKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function createBoundContentClient(access: BoundContentAccess, lifetimeSignal: AbortSignal): ContentClient {
  if (access === null || typeof access !== "object" || !abortSignal(lifetimeSignal) || typeof access.installationId !== "string" || access.installationId.length === 0 || typeof access.token !== "string" || access.token.length === 0) {
    throw new TypeError("Invalid bound Content access");
  }
  let origin: URL;
  try { origin = new URL(access.origin); } catch { throw new TypeError("Invalid Content origin"); }
  if ((origin.protocol !== "http:" && origin.protocol !== "https:") || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new TypeError("Invalid Content origin");
  const base = new URL(`_lr/v1/games/${encodeURIComponent(access.installationId)}/`, origin);

  async function readContent<T>(path: string, signal: AbortSignal | undefined, consume: (response: Response) => Promise<T>): Promise<T> {
    const combined = combineSignal(signal, lifetimeSignal);
    try {
      const response = await fetch(new URL(path, base), { headers: { Authorization: `Bearer ${access.token}` }, signal: combined.signal });
      if (!response.ok) throw mapStatus(response.status);
      return await consume(response);
    } catch (error) {
      if (error instanceof ContentReadError) throw error;
      if (combined.signal.aborted) throw new ContentReadError("CONTENT_CANCELLED");
      throw new ContentReadError("CONTENT_UNAVAILABLE");
    } finally { combined.close(); }
  }

  return Object.freeze({
    record(namespace: string, key: string, options?: ContentReadOptions): Promise<ContentRecord> {
      segment(namespace); segment(key);
      const signal = readOptions(options);
      if (signal?.aborted || lifetimeSignal.aborted) return Promise.reject(new ContentReadError("CONTENT_CANCELLED"));
      return (async () => {
        return readContent(`records/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`, signal, async (response) => {
          const observedVersion = contentVersion(response);
          let value: JsonValue;
          try { value = parseJsonText(await response.text()); }
          catch { throw new ContentReadError("CONTENT_INVALID"); }
          return Object.freeze({ value, contentVersion: observedVersion });
        });
      })();
    },
    resource(namespace: string, key: string, options?: ContentReadOptions): Promise<ContentResource> {
      segment(namespace); resourceKey(key);
      const signal = readOptions(options);
      if (signal?.aborted || lifetimeSignal.aborted) return Promise.reject(new ContentReadError("CONTENT_CANCELLED"));
      return (async () => {
        return readContent(`resources/${encodeURIComponent(namespace)}/${encodeResourceKey(key)}`, signal, async (response) => {
          const observedVersion = contentVersion(response);
          const mime = response.headers.get("content-type");
          if (!mime) throw new ContentReadError("CONTENT_INVALID");
          return Object.freeze({ bytes: Uint8Array.from(new Uint8Array(await response.arrayBuffer())), mime, contentVersion: observedVersion });
        });
      })();
    },
  });
}
