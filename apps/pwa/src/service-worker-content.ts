import {
  getInstallation,
  markInstallationInvalid,
  readInstallationObject,
  type PwaInstallationRecord,
  type StoredContentIndexEntry,
} from "./installation-store.js";

const encoder = new TextEncoder();

function problem(status: number, code: string, detail?: string): Response {
  return new Response(JSON.stringify({ type: `https://loomrealm.dev/problems/${code.toLowerCase()}`, title: code, status, code, ...(detail === undefined ? {} : { detail }) }), {
    status,
    headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" },
  });
}

function decodeSegment(value: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  if (decoded.length === 0 || decoded === "." || decoded === ".." || /[\\/\0]|\p{Cc}|\p{Cs}/u.test(decoded)) return null;
  return decoded;
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

function matchEntry(installation: PwaInstallationRecord, parts: readonly string[]): StoredContentIndexEntry | null {
  if (parts.length === 1 && parts[0] === "manifest") return installation.contentIndex.find(({ kind }) => kind === "manifest") ?? null;
  if (parts.length === 3 && parts[0] === "records") {
    const namespace = decodeSegment(parts[1]!); const key = decodeSegment(parts[2]!);
    if (namespace === null || key === null) return null;
    return installation.contentIndex.find((entry) => entry.kind === "record" && entry.namespace === namespace && entry.key === key) ?? null;
  }
  if (parts.length === 3 && parts[0] === "groups") {
    const namespace = decodeSegment(parts[1]!); const key = decodeSegment(parts[2]!);
    if (namespace === null || key === null) return null;
    return installation.contentIndex.find((entry) => entry.kind === "group" && entry.namespace === namespace && entry.key === key) ?? null;
  }
  if (parts.length >= 3 && parts[0] === "resources") {
    const namespace = decodeSegment(parts[1]!);
    const keys = parts.slice(2).map(decodeSegment);
    if (namespace === null || keys.some((value) => value === null)) return null;
    const key = (keys as string[]).join("/");
    return installation.contentIndex.find((entry) => entry.kind === "resource" && entry.namespace === namespace && entry.key === key) ?? null;
  }
  return null;
}

export async function realizeContentRequest(request: Request, url: URL, path: readonly string[]): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return problem(405, "METHOD_NOT_ALLOWED", "Only GET and HEAD are supported");
  const installationId = decodeSegment(path[0] ?? "");
  if (installationId === null) return problem(400, "INVALID_CONTENT_ROUTE");
  const installation = await completeInstallation(installationId);
  if (installation instanceof Response) return installation;
  const entry = matchEntry(installation, path.slice(1));
  if (entry === null) return problem(404, "CONTENT_NOT_FOUND");
  let bytes: Uint8Array;
  try { bytes = await readInstallationObject(installation.rootId, entry.contentVersion); }
  catch { await markInstallationInvalid(installationId); return problem(422, "CONTENT_INTEGRITY_FAILED"); }
  if (bytes.byteLength !== entry.size || await sha256(bytes) !== entry.contentVersion) {
    await markInstallationInvalid(installationId);
    return problem(422, "CONTENT_INTEGRITY_FAILED");
  }
  const headers = new Headers({
    "Content-Type": entry.mime,
    "Content-Length": String(entry.size),
    "X-Loom-Content-Version": entry.contentVersion,
    "ETag": `"${entry.contentVersion}"`,
    "Cache-Control": entry.kind === "manifest" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  if (request.headers.get("if-none-match") === `"${entry.contentVersion}"`) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : bytes.slice().buffer as ArrayBuffer, { status: 200, headers });
}

export function internalFailure(cause: unknown): Response {
  void cause;
  return new Response(encoder.encode(JSON.stringify({ type: "https://loomrealm.dev/problems/internal", title: "Internal Server Error", status: 500, code: "INTERNAL_ERROR" })), { status: 500, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}
