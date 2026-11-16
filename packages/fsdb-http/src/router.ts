import { canonicalName } from "@loomrealm/fsdb/names";
import type { FsdbMetadataName, FsdbTableKind } from "@loomrealm/fsdb";

export type Route =
  | { readonly type: "outside" }
  | { readonly type: "descriptor" }
  | { readonly type: "entry"; readonly kind: FsdbTableKind; readonly table: string; readonly key: string }
  | { readonly type: "metadata"; readonly kind: FsdbTableKind; readonly table: string; readonly metadata: FsdbMetadataName };

export type RootRoute =
  | { readonly type: "outside" }
  | { readonly type: "database"; readonly databasePath: string; readonly local: Exclude<Route, { readonly type: "outside" }> };

export class BadTargetError extends Error {}

const KINDS = new Set<FsdbTableKind>(["struct", "extend", "group", "resource"]);
const META = new Set<FsdbMetadataName>(["$info", "$extend", "$desc"]);

function decode(raw: string, allowMetadata = false): string {
  if (raw.length === 0) throw new BadTargetError();
  let value: string;
  try { value = decodeURIComponent(raw); } catch { throw new BadTargetError(); }
  if (/[\\/\0]|\p{Cc}|\p{Cs}/u.test(value)) throw new BadTargetError();
  const normalized = value.normalize("NFC");
  if (allowMetadata && META.has(normalized as FsdbMetadataName)) return normalized;
  try { return canonicalName(normalized); } catch { throw new BadTargetError(); }
}

function requestPath(raw: string | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("#")) throw new BadTargetError();
  const question = raw.indexOf("?");
  const path = question < 0 ? raw : raw.slice(0, question);
  if (question >= 0 && raw.slice(question + 1).length > 0) throw new BadTargetError();
  if (path !== "/fsdb/v1" && !path.startsWith("/fsdb/v1/")) return null;
  return path;
}

function parseLocal(rawParts: readonly string[]): Exclude<Route, { readonly type: "outside" }> {
  if (rawParts.length === 0) return { type: "descriptor" };
  if (rawParts.some((part) => part.length === 0)) throw new BadTargetError();
  const kind = rawParts[0] as FsdbTableKind;
  if (!KINDS.has(kind) || rawParts.length < 3) throw new BadTargetError();
  const table = decode(rawParts[1]!);
  const entryParts = rawParts.slice(2);
  if (kind !== "resource" && entryParts.length !== 1) throw new BadTargetError();
  const first = decode(entryParts[0]!, true);
  if (META.has(first as FsdbMetadataName)) {
    if (entryParts.length !== 1) throw new BadTargetError();
    return { type: "metadata", kind, table, metadata: first as FsdbMetadataName };
  }
  const keyParts = [first, ...entryParts.slice(1).map((part) => decode(part))];
  return { type: "entry", kind, table, key: keyParts.join("/") };
}

/** Borrowed single-database handler routes. Kind is the first segment. */
export function parseTarget(raw: string | undefined): Route {
  const path = requestPath(raw);
  if (path === null) return { type: "outside" };
  if (path === "/fsdb/v1") return { type: "descriptor" };
  const rawParts = path.slice("/fsdb/v1/".length).split("/");
  if (rawParts.some((part) => part.length === 0)) throw new BadTargetError();
  return parseLocal(rawParts);
}

/** Root-scoped routes: /fsdb/v1/{databasePath}/$db[/local...]. */
export function parseRootTarget(raw: string | undefined): RootRoute {
  const path = requestPath(raw);
  if (path === null) return { type: "outside" };
  if (path === "/fsdb/v1") return { type: "outside" };
  const rawParts = path.slice("/fsdb/v1/".length).split("/");
  if (rawParts.some((part) => part.length === 0)) throw new BadTargetError();
  const marker = rawParts.indexOf("$db");
  if (marker <= 0 || rawParts.indexOf("$db", marker + 1) !== -1) throw new BadTargetError();
  const databasePath = rawParts.slice(0, marker).map((part) => decode(part)).join("/");
  return { type: "database", databasePath, local: parseLocal(rawParts.slice(marker + 1)) };
}
