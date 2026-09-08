import { createHash } from "node:crypto";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import {
  describeFsdb,
  getFsdbSnapshotId,
  openFsdbObject,
  type FsdbDatabase,
  type FsdbObjectIdentity,
} from "@loomrealm/fsdb";
import { BadTargetError, parseTarget, type Route } from "./router.js";

const JSON_TYPE = "application/json; charset=utf-8";

function errorResponse(res: ServerResponse, status: number, allow = false): void {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  if (allow) res.setHeader("Allow", "GET, HEAD");
  res.end();
}

function entityTags(value: string): Array<{ weak: boolean; opaque: string }> | undefined {
  const tags: Array<{ weak: boolean; opaque: string }> = [];
  let offset = 0;
  while (offset < value.length) {
    while (/[\s,]/.test(value[offset] ?? "")) offset++;
    if (offset >= value.length) break;
    const match = /^(W\/)?"([^"\x00-\x1f\x7f]*)"/.exec(value.slice(offset));
    if (!match) return undefined;
    tags.push({ weak: Boolean(match[1]), opaque: match[2]! });
    offset += match[0].length;
    while (/\s/.test(value[offset] ?? "")) offset++;
    if (offset < value.length && value[offset] !== ",") return undefined;
  }
  return tags;
}

function precondition(req: IncomingMessage, etag: string): 200 | 304 | 412 {
  const opaque = etag.slice(3, -1);
  const ifMatch = req.headers["if-match"];
  if (ifMatch !== undefined && ifMatch.trim() !== "*") return 412;
  const ifNone = req.headers["if-none-match"];
  if (ifNone !== undefined) {
    if (ifNone.trim() === "*") return 304;
    if (entityTags(ifNone)?.some((tag) => tag.opaque === opaque)) return 304;
  }
  return 200;
}

function etag(snapshotId: string, sourceTag: string): string {
  return `W/"${snapshotId}-${sourceTag}"`;
}

function conditionalHeaders(res: ServerResponse, currentEtag: string, decision: 304 | 412): void {
  res.statusCode = decision;
  res.setHeader("ETag", currentEtag);
  res.setHeader("Cache-Control", decision === 304 ? "no-cache" : "no-store");
  res.end();
}

function sendBuffer(req: IncomingMessage, res: ServerResponse, db: FsdbDatabase, bytes: Uint8Array): void {
  if (db.state !== "open") return errorResponse(res, 503);
  const hash = createHash("sha256").update(bytes).digest("base64url").slice(0, 22);
  const currentEtag = etag(getFsdbSnapshotId(db), hash);
  const decision = precondition(req, currentEtag);
  if (decision !== 200) return conditionalHeaders(res, currentEtag, decision);
  res.statusCode = 200;
  res.setHeader("Content-Type", JSON_TYPE);
  res.setHeader("Content-Length", bytes.byteLength);
  res.setHeader("ETag", currentEtag);
  res.setHeader("Cache-Control", "no-cache");
  res.end(req.method === "HEAD" ? undefined : bytes);
}

function identity(route: Exclude<Route, { type: "outside" | "descriptor" }>): FsdbObjectIdentity {
  return route.type === "entry"
    ? { type: "entry", kind: route.kind, table: route.table, key: route.key }
    : { type: "metadata", kind: route.kind, table: route.table, metadata: route.metadata };
}

async function sendObject(req: IncomingMessage, res: ServerResponse, db: FsdbDatabase, route: Exclude<Route, { type: "outside" | "descriptor" }>): Promise<void> {
  const controller = new AbortController();
  let lease: Awaited<ReturnType<typeof openFsdbObject>> = null;
  const cancel = () => {
    if (lease) void lease.close();
    else controller.abort();
  };
  req.once("aborted", cancel);
  res.once("close", cancel);
  try {
    try { lease = await openFsdbObject(db, identity(route), controller.signal); }
    catch (error) {
      if (controller.signal.aborted) return;
      return errorResponse(res, db.state === "stale" || db.state === "closed" ? 503 : 500);
    }
    if (!lease) return errorResponse(res, 404);
    const currentEtag = etag(getFsdbSnapshotId(db), lease.descriptor.sourceTag);
    const decision = precondition(req, currentEtag);
    if (decision !== 200) return conditionalHeaders(res, currentEtag, decision);
    res.statusCode = 200;
    res.setHeader("Content-Type", lease.descriptor.contentType);
    res.setHeader("Content-Length", lease.descriptor.length.toString());
    res.setHeader("ETag", currentEtag);
    res.setHeader("Cache-Control", "no-cache");
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    try { await pipeline(lease.stream, res); } catch { res.destroy(); }
  } finally {
    req.off("aborted", cancel);
    res.off("close", cancel);
    await lease?.close().catch(() => undefined);
  }
}

export function makeHandler(db: FsdbDatabase): RequestListener {
  // Core validates the opaque brand synchronously here without exposing internals.
  getFsdbSnapshotId(db);
  return (req, res) => {
    req.resume();
    void (async () => {
      let route: Route;
      try { route = parseTarget(req.url); }
      catch (error) { return errorResponse(res, error instanceof BadTargetError ? 400 : 500); }
      if (route.type === "outside") return errorResponse(res, 404);
      if (req.method !== "GET" && req.method !== "HEAD") return errorResponse(res, 405, true);
      if (route.type === "descriptor") return sendBuffer(req, res, db, describeFsdb(db));
      await sendObject(req, res, db, route);
    })().catch(() => {
      if (!res.headersSent) errorResponse(res, 500);
      else res.destroy();
    });
  };
}
