import { createHash } from "node:crypto";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import { DatabaseImpl, SourceUnavailableError } from "./database.js";
import { JSON_TYPE } from "./mime.js";
import { tableId, type FileEntry } from "./model.js";
import { BadTargetError, parseTarget, type Route } from "./router.js";

function errorResponse(res: ServerResponse, method: string | undefined, status: number, allow = false): void {
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
  if (ifMatch !== undefined) {
    if (ifMatch.trim() !== "*") {
      const tags = entityTags(ifMatch);
      if (!tags?.some((tag) => !tag.weak && false)) return 412;
    }
  }
  const ifNone = req.headers["if-none-match"];
  if (ifNone !== undefined) {
    if (ifNone.trim() === "*") return 304;
    const tags = entityTags(ifNone);
    if (tags?.some((tag) => tag.opaque === opaque)) return 304;
  }
  return 200;
}

function etag(snapshotId: string, fingerprint: string): string {
  return `W/"${snapshotId}-${fingerprint}"`;
}

function lookup(db: DatabaseImpl, route: Exclude<Route, { type: "outside" | "descriptor" }>): FileEntry | undefined {
  const table = db.snapshot.tables.get(tableId(route.kind, route.table));
  return route.type === "entry" ? table?.entries.get(route.key) : table?.metadata.get(route.metadata);
}

async function sendBuffer(req: IncomingMessage, res: ServerResponse, db: DatabaseImpl, bytes: Buffer): Promise<void> {
  if (db.state !== "open") return errorResponse(res, req.method, 503);
  const hash = createHash("sha256").update(bytes).digest("base64url").slice(0, 22);
  const currentEtag = etag(db.snapshot.snapshotId, hash);
  const decision = precondition(req, currentEtag);
  if (decision !== 200) {
    res.statusCode = decision;
    res.setHeader("ETag", currentEtag);
    res.setHeader("Cache-Control", decision === 304 ? "no-cache" : "no-store");
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", JSON_TYPE);
  res.setHeader("Content-Length", bytes.length);
  res.setHeader("ETag", currentEtag);
  res.setHeader("Cache-Control", "no-cache");
  res.end(req.method === "HEAD" ? undefined : bytes);
}

async function sendFile(req: IncomingMessage, res: ServerResponse, db: DatabaseImpl, entry: FileEntry): Promise<void> {
  let opened: Awaited<ReturnType<DatabaseImpl["openValidated"]>>;
  try { opened = await db.openValidated(entry); } catch (error) {
    return errorResponse(res, req.method, error instanceof SourceUnavailableError ? 503 : 500);
  }
  const { handle, release } = opened;
  try {
    const currentEtag = etag(db.snapshot.snapshotId, entry.fingerprintText);
    const decision = precondition(req, currentEtag);
    if (decision !== 200) {
      res.statusCode = decision;
      res.setHeader("ETag", currentEtag);
      res.setHeader("Cache-Control", decision === 304 ? "no-cache" : "no-store");
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", entry.contentType);
    res.setHeader("Content-Length", entry.length);
    res.setHeader("ETag", currentEtag);
    res.setHeader("Cache-Control", "no-cache");
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = handle.createReadStream({ autoClose: false });
    try {
      await pipeline(stream, res);
    } catch {
      if (!req.aborted && !res.destroyed) db.markStale();
      res.destroy();
    }
  } finally {
    await handle.close().catch(() => undefined);
    release();
  }
}

export function makeHandler(db: DatabaseImpl): RequestListener {
  return (req, res) => {
    req.resume();
    void (async () => {
      let route: Route;
      try { route = parseTarget(req.url); } catch (error) {
        if (error instanceof BadTargetError) return errorResponse(res, req.method, 400);
        return errorResponse(res, req.method, 500);
      }
      if (route.type === "outside") return errorResponse(res, req.method, 404);
      if (req.method !== "GET" && req.method !== "HEAD") return errorResponse(res, req.method, 405, true);
      if (route.type === "descriptor") return sendBuffer(req, res, db, db.snapshot.descriptor);
      const entry = lookup(db, route);
      if (!entry) return errorResponse(res, req.method, 404);
      await sendFile(req, res, db, entry);
    })().catch(() => {
      if (!res.headersSent) errorResponse(res, req.method, 500);
      else res.destroy();
    });
  };
}
