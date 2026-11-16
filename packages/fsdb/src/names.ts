const WHITE_SPACE = /^\p{White_Space}|\p{White_Space}$/u;
const FORBIDDEN = /[\\/<>:"|?*\0]|\p{Cc}|\p{Cs}/u;
const DEVICE = /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/iu;
const encoder = new TextEncoder();

export function canonicalName(value: string): string {
  const normalized = value.normalize("NFC");
  const bytes = encoder.encode(normalized).byteLength;
  if (
    bytes < 1 || bytes > 200 || normalized.startsWith(".") ||
    normalized.startsWith("$") || normalized.endsWith(".") ||
    WHITE_SPACE.test(normalized) || FORBIDDEN.test(normalized) ||
    DEVICE.test(normalized.split(".", 1)[0]!)
  ) throw new Error("Invalid FSDB name");
  return normalized;
}

/** Logical database path: one or more NameSegments joined by `/`. */
export function canonicalDatabasePath(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || value.startsWith("/") || value.endsWith("/") || value.includes("//")) {
    throw new Error("Invalid database path");
  }
  return value.split("/").map((segment) => canonicalName(segment)).join("/");
}

export function resourceExtension(fileName: string): { leaf: string; extension: string } {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) throw new Error("Invalid resource candidate");
  const extension = fileName.slice(dot + 1);
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(extension)) throw new Error("Invalid resource extension");
  return { leaf: canonicalName(fileName.slice(0, dot)), extension };
}
