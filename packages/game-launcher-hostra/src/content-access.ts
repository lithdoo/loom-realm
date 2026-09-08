export const CONTENT_ACCESS_ENV_KEY = "LOOMREALM_HOSTRA_CONTENT_ACCESS";

export interface HostraContentAccess {
  readonly origin: string;
  readonly installationId: string;
  readonly token: string;
}

function logicalSegment(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value !== "." && value !== ".." && !/[\\/\0]|\p{Cc}|\p{Cs}/u.test(value);
}

export function validateHostraContentAccess(value: unknown): HostraContentAccess {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid Hostra Content access");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== 3 || !Object.hasOwn(object, "origin") || !Object.hasOwn(object, "installationId") || !Object.hasOwn(object, "token") || typeof object.origin !== "string" || !logicalSegment(object.installationId) || typeof object.token !== "string" || !/^[A-Za-z0-9_-]{32,}$/.test(object.token)) {
    throw new TypeError("Invalid Hostra Content access");
  }
  let origin: URL;
  try { origin = new URL(object.origin); } catch { throw new TypeError("Invalid Hostra Content access"); }
  if (origin.protocol !== "http:" || !["127.0.0.1", "::1", "localhost"].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || !origin.port) {
    throw new TypeError("Invalid Hostra Content access");
  }
  return Object.freeze({ origin: origin.href, installationId: object.installationId, token: object.token });
}

export function encodeHostraContentAccess(value: HostraContentAccess): string {
  const encoded = JSON.stringify(validateHostraContentAccess(value));
  if (Buffer.byteLength(encoded, "utf8") > 4096) throw new TypeError("Invalid Hostra Content access");
  return encoded;
}

export function parseHostraContentAccess(encoded: string): HostraContentAccess {
  if (typeof encoded !== "string" || Buffer.byteLength(encoded, "utf8") > 4096) throw new TypeError("Invalid Hostra Content access");
  try { return validateHostraContentAccess(JSON.parse(encoded)); }
  catch { throw new TypeError("Invalid Hostra Content access"); }
}
