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

function decodeSegment(value: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(value); }
  catch { return null; }
  if (
    decoded.length === 0
    || decoded === "."
    || decoded === ".."
    || /[\\/\0:]|\p{Cc}|\p{Cs}/u.test(decoded)
  ) return null;
  return decoded;
}

function parseIdentity(url: URL, path: readonly string[]): ContentIdentity | null {
  if (url.search !== "") return null;
  const installationId = decodeSegment(path[0] ?? "");
  if (installationId === null) return null;
  const route = path[1];
  if (route === "manifest" && path.length === 2) return Object.freeze({ installationId, kind: "manifest" });
  if ((route === "records" || route === "groups") && path.length === 4) {
    const namespace = decodeSegment(path[2]!);
    const key = decodeSegment(path[3]!);
    if (namespace === null || key === null) return null;
    return Object.freeze({ installationId, kind: route === "records" ? "record" : "group", namespace, key });
  }
  if (route === "resources" && path.length >= 4) {
    const namespace = decodeSegment(path[2]!);
    const segments = path.slice(3).map(decodeSegment);
    if (namespace === null || segments.some((value) => value === null)) return null;
    return Object.freeze({ installationId, kind: "resource", namespace, key: (segments as string[]).join("/") });
  }
  return null;
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
    if (identity.kind === "manifest") return true;
    return entry.namespace === identity.namespace && entry.key === identity.key;
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
  const identity = parseIdentity(url, path);
  if (identity === null) return problem(400, "INVALID_CONTENT_ROUTE");
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
