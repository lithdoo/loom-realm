import { canonicalName } from "./names.js";
import type { MetadataName, TableKind } from "./model.js";

export type Route =
  | { readonly type: "outside" }
  | { readonly type: "descriptor" }
  | { readonly type: "entry"; readonly kind: TableKind; readonly table: string; readonly key: string }
  | { readonly type: "metadata"; readonly kind: TableKind; readonly table: string; readonly metadata: MetadataName };

export class BadTargetError extends Error {}

const KINDS = new Set<TableKind>(["struct", "extend", "group", "resource"]);
const META = new Set<MetadataName>(["$info", "$extend", "$desc"]);

function decode(raw: string, allowMetadata = false): string {
  if (raw.length === 0) throw new BadTargetError();
  let value: string;
  try { value = decodeURIComponent(raw); } catch { throw new BadTargetError(); }
  if (/[\\/\0]|\p{Cc}|\p{Cs}/u.test(value)) throw new BadTargetError();
  const normalized = value.normalize("NFC");
  if (allowMetadata && META.has(normalized as MetadataName)) return normalized;
  try { return canonicalName(normalized); } catch { throw new BadTargetError(); }
}

export function parseTarget(raw: string | undefined): Route {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("#")) throw new BadTargetError();
  const question = raw.indexOf("?");
  const path = question < 0 ? raw : raw.slice(0, question);
  if (question >= 0 && raw.slice(question + 1).length > 0) throw new BadTargetError();
  if (path !== "/fsdb/v1" && !path.startsWith("/fsdb/v1/")) return { type: "outside" };
  if (path === "/fsdb/v1") return { type: "descriptor" };
  const rawParts = path.slice(1).split("/");
  if (rawParts.some((part) => part.length === 0)) throw new BadTargetError();
  const kind = rawParts[2] as TableKind;
  if (!KINDS.has(kind)) throw new BadTargetError();
  if (rawParts.length < 5) throw new BadTargetError();
  const table = decode(rawParts[3]!);
  const entryParts = rawParts.slice(4);
  if (kind !== "resource" && entryParts.length !== 1) throw new BadTargetError();
  const first = decode(entryParts[0]!, true);
  if (META.has(first as MetadataName)) {
    if (entryParts.length !== 1) throw new BadTargetError();
    return { type: "metadata", kind, table, metadata: first as MetadataName };
  }
  const keyParts = [first, ...entryParts.slice(1).map((part) => decode(part))];
  return { type: "entry", kind, table, key: keyParts.join("/") };
}
