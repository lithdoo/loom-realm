import { canonicalDatabasePath, contentLogicalSegment } from "@loomrealm/fsdb/names";
import {
  getInstallation,
  markInstallationInvalid,
  readInstallationObject,
  type PwaInstallationRecord,
  type StoredContentIndexEntry,
} from "./installation-store.js";

const encoder = new TextEncoder();
const MAX_CONCURRENT_CONTENT_REQUESTS = 32;
let concurrentContentRequests = 0;

interface ContentIdentity {
  readonly installationId: string;
  readonly kind: "manifest" | "record" | "group" | "resource";
  readonly databasePath?: string;
  readonly namespace?: string;
  readonly key?: string;
}

function problem(status: number, code: string, detail?: string, headers?: HeadersInit): Response {
  return new Response(JSON.stringify({
    type: `https://loomrealm.dev/problems/${code.toLowerCase()}`,
    title: code,
    status,
    code,
    ...(detail === undefined ? {} : { detail }),
  }), {
    status,
    headers: {
      "Content-Type": "application/problem+json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

type IdentityParse =
  | { readonly type: "identity"; readonly identity: ContentIdentity }
  | { readonly type: "invalid-route" }
  | { readonly type: "invalid-database-path" };

function decodePercent(value: string): string | undefined {
  try { return decodeURIComponent(value); }
  catch { return undefined; }
}

function contentSegment(value: string): string | null {
  try { return contentLogicalSegment(value); }
  catch { return null; }
}

function parseIdentity(url: URL, path: readonly string[]): IdentityParse {
  if (url.search !== "") return { type: "invalid-route" };
  const decodedInstallation = decodePercent(path[0] ?? "");
  if (decodedInstallation === undefined) return { type: "invalid-route" };
  const installationId = contentSegment(decodedInstallation);
  if (installationId === null) return { type: "invalid-route" };
  const route = path[1];
  if (route === "manifest" && path.length === 2) return { type: "identity", identity: Object.freeze({ installationId, kind: "manifest" }) };
  if (route !== "databases") return { type: "invalid-route" };
  const marker = path.indexOf("$db", 2);
  if (marker < 0 || path.indexOf("$db", marker + 1) !== -1) return { type: "invalid-route" };
  if (marker <= 2) return { type: "invalid-database-path" };
  const encodedDatabase = path.slice(2, marker);
  if (encodedDatabase.some((part) => part.length === 0)) return { type: "invalid-database-path" };
  const decodedDatabase: string[] = [];
  for (const part of encodedDatabase) {
    const decoded = decodePercent(part);
    if (decoded === undefined) return { type: "invalid-route" };
    if (/[\\/\0]|\p{Cc}|\p{Cs}/u.test(decoded)) return { type: "invalid-database-path" };
    decodedDatabase.push(decoded);
  }
  let databasePath: string;
  try { databasePath = canonicalDatabasePath(decodedDatabase.join("/")); }
  catch { return { type: "invalid-database-path" }; }
  const rest = path.slice(marker + 1);
  const collection = rest[0];
  if ((collection === "records" || collection === "groups") && rest.length === 3) {
    const namespaceRaw = decodePercent(rest[1]!);
    const keyRaw = decodePercent(rest[2]!);
    if (namespaceRaw === undefined || keyRaw === undefined) return { type: "invalid-route" };
    const namespace = contentSegment(namespaceRaw);
    const key = contentSegment(keyRaw);
    if (namespace === null || key === null) return { type: "invalid-route" };
    return { type: "identity", identity: Object.freeze({ installationId, databasePath, kind: collection === "records" ? "record" : "group", namespace, key }) };
  }
  if (collection === "resources" && rest.length >= 3) {
    const namespaceRaw = decodePercent(rest[1]!);
    if (namespaceRaw === undefined) return { type: "invalid-route" };
    const namespace = contentSegment(namespaceRaw);
    const segments = rest.slice(2).map((part) => decodePercent(part));
    if (namespace === null || segments.some((value) => value === undefined)) return { type: "invalid-route" };
    const keys = (segments as string[]).map((part) => contentSegment(part));
    if (keys.some((value) => value === null)) return { type: "invalid-route" };
    return { type: "identity", identity: Object.freeze({ installationId, databasePath, kind: "resource", namespace, key: (keys as string[]).join("/") }) };
  }
  return { type: "invalid-route" };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer));
  return `sha256:${[...digest].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

async function completeInstallation(installationId: string): Promise<PwaInstallationRecord | Response> {
  const installation = await getInstallation(installationId);
  if (installation === null) return problem(404, "INSTALLATION_NOT_FOUND");
  if (installation.state !== "complete") return problem(409, "INSTALLATION_INCOMPLETE");
  return installation;
}

function matchEntry(installation: PwaInstallationRecord, identity: ContentIdentity): StoredContentIndexEntry | null {
  return installation.contentIndex.find((entry) => {
    if (entry.kind !== identity.kind) return false;
    if (identity.kind === "manifest") return entry.kind === "manifest";
    return entry.kind !== "manifest" && entry.databasePath === identity.databasePath && entry.namespace === identity.namespace && entry.key === identity.key;
  }) ?? null;
}

function ifNoneMatch(value: string | null, contentVersion: string): "match" | "miss" | "invalid" {
  if (value === null) return "miss";
  let cursor = 0;
  const skipWhitespace = () => {
    while (value[cursor] === " " || value[cursor] === "\t") cursor += 1;
  };
  skipWhitespace();
  if (value[cursor] === "*") {
    cursor += 1;
    skipWhitespace();
    return cursor === value.length ? "match" : "invalid";
  }
  let matched = false;
  let count = 0;
  while (cursor < value.length) {
    if (value.startsWith("W/", cursor)) cursor += 2;
    if (value[cursor] !== "\"") return "invalid";
    cursor += 1;
    let opaque = "";
    while (cursor < value.length && value[cursor] !== "\"") {
      const code = value.charCodeAt(cursor);
      if (!(code === 0x21 || (code >= 0x23 && code <= 0x7e) || (code >= 0x80 && code <= 0xff))) return "invalid";
      opaque += value[cursor];
      cursor += 1;
    }
    if (value[cursor] !== "\"") return "invalid";
    cursor += 1;
    count += 1;
    if (opaque === contentVersion) matched = true;
    skipWhitespace();
    if (cursor === value.length) break;
    if (value[cursor] !== ",") return "invalid";
    cursor += 1;
    skipWhitespace();
    if (cursor === value.length) return "invalid";
  }
  return count === 0 ? "invalid" : matched ? "match" : "miss";
}

async function realizeContentRequestInner(request: Request, url: URL, path: readonly string[]): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return problem(405, "METHOD_NOT_ALLOWED", "Only GET and HEAD are supported", { Allow: "GET, HEAD" });
  }
  const parsed = parseIdentity(url, path);
  if (parsed.type === "invalid-database-path") return problem(400, "DATABASE_PATH_INVALID");
  if (parsed.type !== "identity") return problem(400, "INVALID_CONTENT_ROUTE");
  const identity = parsed.identity;
  const installation = await completeInstallation(identity.installationId);
  if (installation instanceof Response) return installation;
  const entry = matchEntry(installation, identity);
  if (entry === null) return problem(404, "CONTENT_NOT_FOUND");

  const conditional = ifNoneMatch(request.headers.get("if-none-match"), entry.contentVersion);
  if (conditional === "invalid") return problem(400, "INVALID_IF_NONE_MATCH");

  let bytes: Uint8Array;
  try {
    bytes = await readInstallationObject(installation.rootId, entry.contentVersion);
  } catch {
    await markInstallationInvalid(installation.installationId, installation.generation, installation.rootId);
    return problem(422, "CONTENT_INTEGRITY_FAILED");
  }
  if (bytes.byteLength !== entry.size || await sha256(bytes) !== entry.contentVersion) {
    await markInstallationInvalid(installation.installationId, installation.generation, installation.rootId);
    return problem(422, "CONTENT_INTEGRITY_FAILED");
  }

  const headers = new Headers({
    "Content-Type": entry.mime,
    "Content-Length": String(entry.size),
    "X-Loom-Content-Version": entry.contentVersion,
    "ETag": `"${entry.contentVersion}"`,
    "Cache-Control": entry.kind === "manifest" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  if (conditional === "match") return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : bytes.slice().buffer as ArrayBuffer, { status: 200, headers });
}

export async function realizeContentRequest(request: Request, url: URL, path: readonly string[]): Promise<Response> {
  if (concurrentContentRequests >= MAX_CONCURRENT_CONTENT_REQUESTS) {
    return problem(429, "CONTENT_BUSY", "Content concurrency limit reached", { "Retry-After": "1" });
  }
  concurrentContentRequests += 1;
  try { return await realizeContentRequestInner(request, url, path); }
  finally { concurrentContentRequests -= 1; }
}

export function internalFailure(cause: unknown): Response {
  console.error("PWA Service Worker request failed", cause);
  return new Response(encoder.encode(JSON.stringify({
    type: "https://loomrealm.dev/problems/internal",
    title: "Internal Server Error",
    status: 500,
    code: "INTERNAL_ERROR",
  })), {
    status: 500,
    headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" },
  });
}
