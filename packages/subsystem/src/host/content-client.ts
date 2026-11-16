import { canonicalDatabasePath, contentLogicalSegment } from "@loomrealm/fsdb/names";
import { parseJsonText, type JsonValue } from "@loomrealm/wire";
import {
  ContentReadError,
  type ContentClient,
  type ContentGroup,
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

export interface SameOriginContentAccess {
  readonly installationId: string;
}

function named(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(label);
  try { return contentLogicalSegment(value); }
  catch { throw new TypeError(label); }
}

function databasePath(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Invalid database path");
  try { return canonicalDatabasePath(value); }
  catch { throw new TypeError("Invalid database path"); }
}

function resourceKey(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError("Invalid Content resource key");
  return value.split("/").map((part) => named(part, "Invalid Content resource key")).join("/");
}

function encodePath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
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

function ndjsonMediaType(response: Response): void {
  const mime = response.headers.get("content-type");
  const essence = mime?.split(";")[0]?.trim().toLowerCase();
  if (mime === null || essence !== "application/x-ndjson") throw new ContentReadError("CONTENT_INVALID");
}

function parseNdjsonRows(text: string): JsonValue[] {
  const rows: JsonValue[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    rows.push(parseJsonText(line));
  }
  return rows;
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

interface ContentFetchBinding {
  readonly installationId: string;
  readonly base: URL;
  readonly headers: Readonly<Record<string, string>>;
}

function createContentClient(binding: ContentFetchBinding, lifetimeSignal: AbortSignal): ContentClient {
  async function readContent<T>(path: string, signal: AbortSignal | undefined, consume: (response: Response) => Promise<T>): Promise<T> {
    const combined = combineSignal(signal, lifetimeSignal);
    try {
      const response = await fetch(new URL(path, binding.base), { headers: binding.headers, signal: combined.signal });
      if (!response.ok) throw mapStatus(response.status);
      return await consume(response);
    } catch (error) {
      if (error instanceof ContentReadError) throw error;
      if (combined.signal.aborted) throw new ContentReadError("CONTENT_CANCELLED");
      throw new ContentReadError("CONTENT_UNAVAILABLE");
    } finally { combined.close(); }
  }

  return Object.freeze({
    record(databasePathValue: string, namespaceValue: string, keyValue: string, options?: ContentReadOptions): Promise<ContentRecord> {
      const path = databasePath(databasePathValue);
      const namespace = named(namespaceValue, "Invalid Content segment");
      const key = named(keyValue, "Invalid Content segment");
      const signal = readOptions(options);
      if (signal?.aborted || lifetimeSignal.aborted) return Promise.reject(new ContentReadError("CONTENT_CANCELLED"));
      return readContent(`databases/${encodePath(path)}/$db/records/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`, signal, async (response) => {
        const observedVersion = contentVersion(response);
        let value: JsonValue;
        try { value = parseJsonText(await response.text()); }
        catch { throw new ContentReadError("CONTENT_INVALID"); }
        return Object.freeze({ value, contentVersion: observedVersion });
      });
    },
    group(databasePathValue: string, namespaceValue: string, keyValue: string, options?: ContentReadOptions): Promise<ContentGroup> {
      const path = databasePath(databasePathValue);
      const namespace = named(namespaceValue, "Invalid Content segment");
      const key = named(keyValue, "Invalid Content segment");
      const signal = readOptions(options);
      if (signal?.aborted || lifetimeSignal.aborted) return Promise.reject(new ContentReadError("CONTENT_CANCELLED"));
      return readContent(`databases/${encodePath(path)}/$db/groups/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`, signal, async (response) => {
        const observedVersion = contentVersion(response);
        ndjsonMediaType(response);
        let rows: JsonValue[];
        try { rows = parseNdjsonRows(await response.text()); }
        catch { throw new ContentReadError("CONTENT_INVALID"); }
        return Object.freeze({ rows: Object.freeze(rows), contentVersion: observedVersion });
      });
    },
    resource(databasePathValue: string, namespaceValue: string, keyValue: string, options?: ContentReadOptions): Promise<ContentResource> {
      const path = databasePath(databasePathValue);
      const namespace = named(namespaceValue, "Invalid Content segment");
      const key = resourceKey(keyValue);
      const signal = readOptions(options);
      if (signal?.aborted || lifetimeSignal.aborted) return Promise.reject(new ContentReadError("CONTENT_CANCELLED"));
      return readContent(`databases/${encodePath(path)}/$db/resources/${encodeURIComponent(namespace)}/${encodePath(key)}`, signal, async (response) => {
        const observedVersion = contentVersion(response);
        const mime = response.headers.get("content-type");
        if (!mime) throw new ContentReadError("CONTENT_INVALID");
        return Object.freeze({ bytes: Uint8Array.from(new Uint8Array(await response.arrayBuffer())), mime, contentVersion: observedVersion });
      });
    },
  });
}

function contentOrigin(value: string | URL): URL {
  let origin: URL;
  try { origin = new URL(value); } catch { throw new TypeError("Invalid Content origin"); }
  if ((origin.protocol !== "http:" && origin.protocol !== "https:") || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
    throw new TypeError("Invalid Content origin");
  }
  return origin;
}

/** Desktop bearer-bound client. The token remains mandatory. */
export function createBoundContentClient(access: BoundContentAccess, lifetimeSignal: AbortSignal): ContentClient {
  if (access === null || typeof access !== "object" || !abortSignal(lifetimeSignal) || typeof access.installationId !== "string" || access.installationId.length === 0 || typeof access.token !== "string" || access.token.length === 0) {
    throw new TypeError("Invalid bound Content access");
  }
  const origin = contentOrigin(access.origin);
  return createContentClient({
    installationId: access.installationId,
    base: new URL(`_lr/v1/games/${encodeURIComponent(access.installationId)}/`, origin),
    headers: Object.freeze({ Authorization: `Bearer ${access.token}` }),
  }, lifetimeSignal);
}

/** PWA same-origin client. It never manufactures or sends LoomRealm bearer material. */
export function createSameOriginContentClient(access: SameOriginContentAccess, lifetimeSignal: AbortSignal): ContentClient {
  if (access === null || typeof access !== "object" || Object.keys(access).length !== 1 || !abortSignal(lifetimeSignal)) {
    throw new TypeError("Invalid same-origin Content access");
  }
  named(access.installationId, "Invalid Content segment");
  if (typeof location !== "object" || (location.protocol !== "http:" && location.protocol !== "https:") || location.search !== "" || location.hash !== "" || location.href.includes("@")) {
    throw new TypeError("Same-origin Content requires an HTTP(S) realm");
  }
  const slash = location.pathname.lastIndexOf("/");
  const directory = new URL(slash < 0 ? "/" : location.pathname.slice(0, slash + 1), location.origin);
  return createContentClient({
    installationId: access.installationId,
    base: new URL(`_lr/v1/games/${encodeURIComponent(access.installationId)}/`, directory),
    headers: Object.freeze({}),
  }, lifetimeSignal);
}
