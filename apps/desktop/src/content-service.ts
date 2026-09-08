import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import { join } from "node:path";
import {
  listFsdbEntries,
  openFsdb,
  openFsdbObject,
  type FsdbDatabase,
  type FsdbObjectIdentity,
} from "@loomrealm/fsdb";
import { parseGameEntryV1, type ValidatedGameEntryV1 } from "@loomrealm/game-package";

const CONTENT_VERSION = /^sha256:[0-9a-f]{64}$/;
const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 64;

export type DesktopContentPermission = "manifest" | "records" | "groups" | "resources";

export interface PrepareDesktopContentViewOptions {
  readonly installationRoot: string;
  readonly fsdbRoot: string;
}

interface ContentIndexEntry {
  readonly kind: "record" | "group" | "resource";
  readonly namespace: string;
  readonly key: string;
  readonly identity: FsdbObjectIdentity;
  readonly contentVersion: string;
  readonly length: bigint;
  readonly mime: string;
}

export interface PreparedDesktopContentView {
  readonly installationId: string;
  readonly state: "open" | "closed";
  close(): Promise<void>;
}

interface PreparedDesktopContentViewState {
  readonly installationId: string;
  state: "open" | "closed";
  readonly db: FsdbDatabase;
  readonly manifestBytes: Uint8Array;
  readonly manifestVersion: string;
  readonly index: ReadonlyMap<string, ContentIndexEntry>;
  close(): Promise<void>;
}

export interface DesktopContentGrant {
  readonly installationId: string;
  readonly token: string;
  readonly permissions: readonly DesktopContentPermission[];
  readonly expiresAtUnixMs: number;
}

export interface DesktopContentAccess {
  readonly origin: URL;
  readonly installationId: string;
  readonly token: string;
}

export interface DesktopContentServiceOptions {
  readonly view: PreparedDesktopContentView;
  readonly host?: string;
  readonly port?: number;
  readonly maxBodyBytes?: number;
  readonly maxConcurrentRequests?: number;
}

export interface DesktopContentService {
  readonly server: Server;
  readonly origin: URL;
  readonly view: PreparedDesktopContentView;
  createGrant(options: {
    readonly permissions: readonly DesktopContentPermission[];
    readonly expiresAtUnixMs: number;
  }): DesktopContentGrant;
  access(grant: DesktopContentGrant): DesktopContentAccess;
  close(): Promise<void>;
}

const views = new WeakMap<object, PreparedDesktopContentViewState>();

function asView(value: PreparedDesktopContentView): PreparedDesktopContentViewState {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    throw new TypeError("Invalid prepared Content view");
  }
  const state = views.get(value);
  if (!state) throw new TypeError("Invalid prepared Content view");
  return state;
}

function codePointCompare(a: string, b: string): number {
  const aa = [...a];
  const bb = [...b];
  for (let index = 0; index < Math.min(aa.length, bb.length); index++) {
    const difference = aa[index]!.codePointAt(0)! - bb[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return aa.length - bb.length;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort(codePointCompare).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) throw new TypeError("Invalid public manifest");
      return `${JSON.stringify(key)}:${canonicalJson(descriptor.value)}`;
    }).join(",")}}`;
  }
  throw new TypeError("Invalid public manifest");
}

function publicManifest(game: ValidatedGameEntryV1): Uint8Array {
  const projection = {
    formatVersion: game.formatVersion,
    initial: { subsystem: game.initial.subsystem, input: game.initial.input },
    subsystems: game.subsystems.map(({ key }) => ({ key })),
  };
  return Buffer.from(canonicalJson(projection), "utf8");
}

function version(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function hashLease(db: FsdbDatabase, identity: FsdbObjectIdentity): Promise<string> {
  const lease = await openFsdbObject(db, identity, new AbortController().signal);
  if (!lease) throw new Error("Indexed FSDB entry disappeared");
  const hash = createHash("sha256");
  try {
    for await (const chunk of lease.stream) hash.update(chunk as Uint8Array);
    return `sha256:${hash.digest("hex")}`;
  } finally { await lease.close(); }
}

function indexKey(kind: string, namespace: string, key: string): string {
  return `${kind}\0${namespace}\0${key}`;
}

export async function prepareDesktopContentView(
  options: PrepareDesktopContentViewOptions,
): Promise<PreparedDesktopContentView> {
  if (options === null || typeof options !== "object" || typeof options.installationRoot !== "string" || typeof options.fsdbRoot !== "string") {
    throw new TypeError("Invalid Desktop Content preparation options");
  }
  const game = parseGameEntryV1(await readFile(join(options.installationRoot, "game.json"), "utf8"));
  const db = await openFsdb({ root: options.fsdbRoot });
  try {
    const mutable = new Map<string, ContentIndexEntry>();
    for (const descriptor of listFsdbEntries(db)) {
      const fsdbKind = descriptor.identity.kind;
      const kind = fsdbKind === "group" ? "group" : fsdbKind === "resource" ? "resource" : "record";
      const namespace = `${fsdbKind}.${descriptor.identity.table}`;
      const entry: ContentIndexEntry = Object.freeze({
        kind,
        namespace,
        key: descriptor.identity.key,
        identity: descriptor.identity,
        contentVersion: await hashLease(db, descriptor.identity),
        length: descriptor.length,
        mime: descriptor.contentType,
      });
      const lookup = indexKey(kind, namespace, entry.key);
      if (mutable.has(lookup)) throw new Error("Duplicate Content identity");
      mutable.set(lookup, entry);
    }
    const manifestBytes = publicManifest(game);
    let closing: Promise<void> | undefined;
    const state: PreparedDesktopContentViewState = {
      installationId: randomBytes(24).toString("base64url"),
      state: "open",
      db,
      manifestBytes: Uint8Array.from(manifestBytes),
      manifestVersion: version(manifestBytes),
      index: mutable as ReadonlyMap<string, ContentIndexEntry>,
      close() {
        state.state = "closed";
        closing ??= db.close();
        return closing;
      },
    };
    const view: PreparedDesktopContentView = Object.freeze({
      get installationId() { return state.installationId; },
      get state() { return state.state; },
      close: () => state.close(),
    });
    views.set(view, state);
    return view;
  } catch (error) {
    await db.close();
    throw error;
  }
}

function validLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("Invalid Content service limit");
  return value;
}

function validPermission(value: unknown): value is DesktopContentPermission {
  return value === "manifest" || value === "records" || value === "groups" || value === "resources";
}

function segment(raw: string): string {
  if (raw.length === 0) throw new TypeError("Invalid Content segment");
  let value: string;
  try { value = decodeURIComponent(raw); } catch { throw new TypeError("Invalid Content segment"); }
  if (value.length === 0 || value === "." || value === ".." || /[\\/\0]|\p{Cc}|\p{Cs}/u.test(value) || /^[A-Za-z]:/.test(value) || value.startsWith("\\\\") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
    throw new TypeError("Invalid Content segment");
  }
  return value;
}

type Route =
  | { readonly kind: "manifest"; readonly installationId: string; readonly permission: "manifest" }
  | { readonly kind: "record" | "group" | "resource"; readonly installationId: string; readonly namespace: string; readonly key: string; readonly permission: "records" | "groups" | "resources" };

function parseRoute(raw: string | undefined): Route | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("#") || raw.includes("?")) throw new TypeError("Invalid Content target");
  const parts = raw.slice(1).split("/");
  if (parts[0] !== "_lr" || parts[1] !== "v1" || parts[2] !== "games") return null;
  if (parts.length < 5) throw new TypeError("Invalid Content target");
  const installationId = segment(parts[3]!);
  if (parts[4] === "manifest" && parts.length === 5) return { kind: "manifest", installationId, permission: "manifest" };
  const collection = parts[4];
  if (parts.length < 7 || (collection !== "records" && collection !== "groups" && collection !== "resources")) throw new TypeError("Invalid Content target");
  const namespace = segment(parts[5]!);
  const keyParts = parts.slice(6).map(segment);
  if (collection !== "resources" && keyParts.length !== 1) throw new TypeError("Invalid Content target");
  const kind = collection === "records" ? "record" : collection === "groups" ? "group" : "resource";
  return { kind, installationId, namespace, key: keyParts.join("/"), permission: collection };
}

const PROBLEMS: Readonly<Record<number, { readonly title: string; readonly code: string }>> = Object.freeze({
  400: { title: "Bad Request", code: "CONTENT_REQUEST_INVALID" },
  401: { title: "Unauthorized", code: "CONTENT_AUTH_REQUIRED" },
  403: { title: "Forbidden", code: "CONTENT_PERMISSION_DENIED" },
  404: { title: "Not Found", code: "CONTENT_NOT_FOUND" },
  405: { title: "Method Not Allowed", code: "CONTENT_METHOD_NOT_ALLOWED" },
  409: { title: "Conflict", code: "CONTENT_VERSION_MISMATCH" },
  413: { title: "Content Too Large", code: "CONTENT_TOO_LARGE" },
  422: { title: "Unprocessable Content", code: "CONTENT_INTEGRITY_FAILED" },
  429: { title: "Too Many Requests", code: "CONTENT_PRESSURE" },
  500: { title: "Internal Server Error", code: "CONTENT_UNAVAILABLE" },
});

function problem(res: ServerResponse, status: number, allow = false): void {
  const fact = PROBLEMS[status] ?? PROBLEMS[500]!;
  const body = Buffer.from(JSON.stringify({ type: `urn:loomrealm:content:${fact.code.toLowerCase()}`, title: fact.title, status, code: fact.code }), "utf8");
  res.statusCode = status;
  res.setHeader("Content-Type", "application/problem+json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", body.length);
  if (allow) res.setHeader("Allow", "GET, HEAD");
  res.end(body);
}

function bearer(req: IncomingMessage): string | null {
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string") return null;
  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(authorization);
  return match?.[1] ?? null;
}

function notModified(req: IncomingMessage, contentVersion: string): boolean {
  const value = req.headers["if-none-match"];
  if (value === undefined) return false;
  return value.split(",").some((candidate) => candidate.trim() === "*" || candidate.trim() === `"${contentVersion}"`);
}

function successHeaders(res: ServerResponse, mime: string, contentVersion: string, length: bigint | number, immutable: boolean): void {
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Length", length.toString());
  res.setHeader("X-Loom-Content-Version", contentVersion);
  res.setHeader("ETag", `"${contentVersion}"`);
  res.setHeader("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
}

async function listen(server: Server, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { server.off("listening", onListening); reject(error); };
    const onListening = () => { server.off("error", onError); resolve(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

export async function createDesktopContentService(options: DesktopContentServiceOptions): Promise<DesktopContentService> {
  if (options === null || typeof options !== "object") throw new TypeError("Invalid Content service options");
  const publicView = options.view;
  const view = asView(publicView);
  if (view.state !== "open") throw new TypeError("Content view is closed");
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") throw new TypeError("Content service must use loopback");
  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError("Invalid Content service port");
  const maxBodyBytes = validLimit(options.maxBodyBytes, DEFAULT_MAX_BODY_BYTES);
  const maxConcurrentRequests = validLimit(options.maxConcurrentRequests, DEFAULT_MAX_CONCURRENT_REQUESTS);
  const grants = new Map<string, DesktopContentGrant>();
  let active = 0;

  const server = createServer((req, res) => {
    req.resume();
    void (async () => {
      if (req.method !== "GET" && req.method !== "HEAD") return problem(res, 405, true);
      let route: Route | null;
      try { route = parseRoute(req.url); } catch { return problem(res, 400); }
      if (!route) return problem(res, 404);
      const token = bearer(req);
      const grant = token ? grants.get(token) : undefined;
      if (!grant || grant.expiresAtUnixMs <= Date.now()) return problem(res, 401);
      if (route.installationId !== view.installationId || grant.installationId !== route.installationId) return problem(res, 404);
      if (!grant.permissions.includes(route.permission)) return problem(res, 403);
      if (active >= maxConcurrentRequests) return problem(res, 429);
      active++;
      try {
        if (view.state !== "open" || view.db.state !== "open") return problem(res, 409);
        if (route.kind === "manifest") {
          if (view.manifestBytes.byteLength > maxBodyBytes) return problem(res, 413);
          successHeaders(res, "application/json; charset=utf-8", view.manifestVersion, view.manifestBytes.byteLength, false);
          if (notModified(req, view.manifestVersion)) { res.statusCode = 304; return res.end(); }
          res.statusCode = 200;
          return res.end(req.method === "HEAD" ? undefined : view.manifestBytes);
        }
        const entry = view.index.get(indexKey(route.kind, route.namespace, route.key));
        if (!entry) return problem(res, 404);
        if (entry.length > BigInt(maxBodyBytes)) return problem(res, 413);
        const controller = new AbortController();
        const cancel = () => controller.abort();
        req.once("aborted", cancel);
        res.once("close", cancel);
        const lease = await openFsdbObject(view.db, entry.identity, controller.signal).catch(() => null);
        req.off("aborted", cancel);
        res.off("close", cancel);
        if (!lease) return problem(res, view.db.state === "open" ? 404 : 409);
        try {
          const unchanged = notModified(req, entry.contentVersion);
          if (req.method === "HEAD" || unchanged) {
            successHeaders(res, entry.mime, entry.contentVersion, entry.length, true);
            res.statusCode = unchanged ? 304 : 200;
            return res.end();
          }
          const chunks: Buffer[] = [];
          const hash = createHash("sha256");
          let length = 0;
          for await (const chunk of lease.stream) {
            const bytes = Buffer.from(chunk as Uint8Array);
            length += bytes.length;
            if (length > maxBodyBytes) return problem(res, 413);
            hash.update(bytes);
            chunks.push(bytes);
          }
          const actual = `sha256:${hash.digest("hex")}`;
          if (!CONTENT_VERSION.test(actual) || actual !== entry.contentVersion || BigInt(length) !== entry.length) return problem(res, 422);
          const body = Buffer.concat(chunks, length);
          successHeaders(res, entry.mime, entry.contentVersion, body.length, true);
          res.statusCode = 200;
          res.end(body);
        } finally { await lease.close(); }
      } finally { active--; }
    })().catch(() => {
      if (!res.headersSent) problem(res, 500);
      else res.destroy();
    });
  });
  await listen(server, port, host);
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unsupported Content service address");
  }
  const origin = new URL(`http://${isIP(address.address) === 6 ? `[${address.address}]` : address.address}:${address.port}`);
  let closing: Promise<void> | undefined;
  const service: DesktopContentService = Object.freeze({
    server,
    origin,
    view: publicView,
    createGrant(grantOptions: { readonly permissions: readonly DesktopContentPermission[]; readonly expiresAtUnixMs: number }): DesktopContentGrant {
      if (grantOptions === null || typeof grantOptions !== "object" || !Array.isArray(grantOptions.permissions) || grantOptions.permissions.length === 0 || grantOptions.permissions.some((permission) => !validPermission(permission)) || !Number.isSafeInteger(grantOptions.expiresAtUnixMs) || grantOptions.expiresAtUnixMs <= 0) {
        throw new TypeError("Invalid Content grant");
      }
      const grant = Object.freeze({
        installationId: view.installationId,
        token: randomBytes(32).toString("base64url"),
        permissions: Object.freeze([...new Set(grantOptions.permissions)]),
        expiresAtUnixMs: grantOptions.expiresAtUnixMs,
      });
      grants.set(grant.token, grant);
      return grant;
    },
    access(grant: DesktopContentGrant): DesktopContentAccess {
      if (grants.get(grant?.token) !== grant) throw new TypeError("Unknown Content grant");
      return Object.freeze({ origin: new URL(origin), installationId: grant.installationId, token: grant.token });
    },
    close() {
      closing ??= (async () => {
        grants.clear();
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await view.close();
      })();
      return closing;
    },
  });
  return service;
}
