import {
  getInstallation,
  markInstallationInvalid,
  readInstallationObject,
} from "./installation-store.js";

function problem(status: number, code: string): Response {
  return new Response(JSON.stringify({ type: `https://loomrealm.dev/problems/${code.toLowerCase()}`, title: code, status, code }), { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

function decode(value: string): string | null {
  let result: string;
  try { result = decodeURIComponent(value); } catch { return null; }
  if (result.length === 0 || result === "." || result === ".." || /[\\/\0]|\p{Cc}|\p{Cs}/u.test(result)) return null;
  return result;
}

async function hash(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer));
  return `sha256:${[...digest].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export async function realizeExecutableRequest(request: Request, parts: readonly string[]): Promise<Response> {
  if (request.method !== "GET") return problem(405, "METHOD_NOT_ALLOWED");
  const installationId = decode(parts[0] ?? "");
  const logicalParts = parts.slice(1).map(decode);
  if (installationId === null || logicalParts.length === 0 || logicalParts.some((value) => value === null)) return problem(400, "SUBSYSTEM_MODULE_INVALID");
  const logicalModule = (logicalParts as string[]).join("/");
  const installation = await getInstallation(installationId);
  if (installation === null) return problem(404, "INSTALLATION_NOT_FOUND");
  if (installation.state !== "complete") return problem(409, "INSTALLATION_INCOMPLETE");
  const entry = installation.executableIndex.find((candidate) => candidate.logicalModule === logicalModule);
  if (entry === undefined) return problem(404, "SUBSYSTEM_MODULE_NOT_FOUND");
  let bytes: Uint8Array;
  try { bytes = await readInstallationObject(installation.rootId, entry.contentVersion); }
  catch { await markInstallationInvalid(installationId); return problem(422, "CONTENT_INTEGRITY_FAILED"); }
  if (bytes.byteLength !== entry.size || await hash(bytes) !== entry.contentVersion) {
    await markInstallationInvalid(installationId);
    return problem(422, "CONTENT_INTEGRITY_FAILED");
  }
  return new Response(bytes.slice().buffer as ArrayBuffer, { status: 200, headers: {
    "Content-Type": "text/javascript; charset=utf-8",
    "Content-Length": String(entry.size),
    "X-Loom-Content-Version": entry.contentVersion,
    "ETag": `"${entry.contentVersion}"`,
    "Cache-Control": "no-store",
  } });
}
