import { createHash, randomBytes } from "node:crypto";
import { lstat, readdir, realpath } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import { isAbsolute, join, relative } from "node:path";
import {
  listFsdbEntries,
  openFsdb,
  openFsdbObject,
  type FsdbDatabase,
  type FsdbObjectIdentity,
} from "@loomrealm/fsdb";
import { type PreparedHostraGame } from "@loomrealm/game-launcher-hostra";
import {
  projectHostraPreparedInstallation,
  type HostraPreparedInstallation,
} from "@loomrealm/game-launcher-hostra/prepared-installation";
import type { DesktopRendererBootstrapEnvelope } from "./desktop-bootstrap.js";

const CONTENT_VERSION = /^sha256:[0-9a-f]{64}$/;
const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 64;

export type DesktopContentPermission = "manifest" | "records" | "groups" | "resources";

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
  readonly trustedShell?: {
    readonly entryScript: Uint8Array;
    readonly bootstrap: (signal: AbortSignal) => Promise<DesktopRendererBootstrapEnvelope>;
  };
}

export interface DesktopContentService {
  readonly server: Server;
  readonly origin: URL;
  readonly view: PreparedDesktopContentView;
  readonly shell: URL | null;
  createGrant(options: {
    readonly permissions: readonly DesktopContentPermission[];
    readonly expiresAtUnixMs: number;
  }): DesktopContentGrant;
  revokeGrant(grant: DesktopContentGrant): void;
  access(grant: DesktopContentGrant): DesktopContentAccess;
  close(): Promise<void>;
}

interface TrustedShellRuntime {
  readonly entryScript: Uint8Array;
  readonly bootstrap: (signal: AbortSignal) => Promise<DesktopRendererBootstrapEnvelope>;
  readonly documentPath: string;
  readonly entryPath: string;
  readonly requests: Set<AbortController>;
}

function safeBootstrapJson(value: unknown): string {
  return JSON.stringify(value).replace(/</gu, "\\u003c").replace(/\u2028/gu, "\\u2028").replace(/\u2029/gu, "\\u2029");
}

function serveTrustedShell(
  req: IncomingMessage,
  res: ServerResponse,
  shell: TrustedShellRuntime | undefined,
): boolean {
  if (shell === undefined) return false;
  const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  if (pathname === shell.entryPath) {
    if (req.method !== "GET" && req.method !== "HEAD") { problem(res, "CONTENT_METHOD_NOT_ALLOWED", true); return true; }
    const body = Buffer.from(shell.entryScript);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.setHeader("Content-Length", body.byteLength);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(req.method === "HEAD" ? undefined : body);
    return true;
  }
  if (pathname !== shell.documentPath) return false;
  if (req.method !== "GET" && req.method !== "HEAD") { problem(res, "CONTENT_METHOD_NOT_ALLOWED", true); return true; }
  if (req.headers["sec-fetch-mode"] !== "navigate" || req.headers["sec-fetch-dest"] !== "document") {
    problem(res, "CONTENT_NOT_FOUND"); return true;
  }
  const controller = new AbortController();
  shell.requests.add(controller);
  const cancel = () => { if (!res.writableEnded) controller.abort(new Error("Desktop document request aborted")); };
  req.once("aborted", cancel); res.once("close", cancel);
  void shell.bootstrap(controller.signal).then((bootstrap) => {
    if (controller.signal.aborted) return;
    const body = Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' blob:; style-src 'self' blob: 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' ws://127.0.0.1:*; object-src 'none'; base-uri 'none'; frame-src 'none'"><script id="__loomrealm_bootstrap" type="application/json">${safeBootstrapJson(bootstrap)}</script><script type="module" src="${shell.entryPath}"></script></head><body></body></html>`, "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Length", body.byteLength);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(req.method === "HEAD" ? undefined : body);
  }, () => { if (!controller.signal.aborted && !res.headersSent) problem(res, "CONTENT_UNAVAILABLE"); }).finally(() => {
    shell.requests.delete(controller); req.off("aborted", cancel); res.off("close", cancel);
  });
  return true;
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

function publicManifest(installation: HostraPreparedInstallation): Uint8Array {
  const projection = {
    formatVersion: installation.formatVersion,
    initial: { subsystem: installation.initial.subsystemKey, input: installation.initial.input },
    subsystems: installation.subsystemKeys.map((key) => ({ key })),
  };
  return Buffer.from(canonicalJson(projection), "utf8");
}

async function preparedFsdbRoot(canonicalRoot: string): Promise<string> {
  const entries = await readdir(canonicalRoot, { withFileTypes: true });
  const candidates = entries.filter((entry) =>
    entry.isDirectory() && !entry.isSymbolicLink() && /^\[FSDB\].+$/u.test(entry.name),
  );
  if (candidates.length !== 1) throw new TypeError("Prepared installation must contain exactly one FSDB root");
  const candidate = join(canonicalRoot, candidates[0]!.name);
  const stat = await lstat(candidate);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TypeError("Invalid prepared installation FSDB root");
  const canonicalFsdbRoot = await realpath(candidate);
  const within = relative(canonicalRoot, canonicalFsdbRoot);
  if (within === "" || isAbsolute(within) || within === ".." || within.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || within.includes("/") || within.includes("\\")) {
    throw new TypeError("Invalid prepared installation FSDB root");
  }
  return canonicalFsdbRoot;
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
  prepared: PreparedHostraGame,
): Promise<PreparedDesktopContentView> {
  const installation = projectHostraPreparedInstallation(prepared);
  const db = await openFsdb({ root: await preparedFsdbRoot(installation.canonicalRoot) });
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
    const manifestBytes = publicManifest(installation);
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
        return closing ?? (closing = db.close());
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

type ContentProblemCode =
  | "CONTENT_REQUEST_INVALID" | "CONTENT_AUTH_REQUIRED" | "CONTENT_PERMISSION_DENIED"
  | "INSTALLATION_NOT_FOUND" | "INSTALLATION_INCOMPLETE" | "CONTENT_NOT_FOUND"
  | "CONTENT_METHOD_NOT_ALLOWED" | "CONTENT_VERSION_MISMATCH" | "CONTENT_TOO_LARGE"
  | "CONTENT_SCHEMA_INVALID" | "CONTENT_INTEGRITY_FAILED" | "RANGE_INVALID"
  | "CONTENT_PRESSURE" | "CONTENT_UNAVAILABLE";

interface ContentProblemFact { readonly status: number; readonly title: string; }

const PROBLEMS: Readonly<Record<ContentProblemCode, ContentProblemFact>> = Object.freeze({
  CONTENT_REQUEST_INVALID: { status: 400, title: "Bad Request" },
  CONTENT_AUTH_REQUIRED: { status: 401, title: "Unauthorized" },
  CONTENT_PERMISSION_DENIED: { status: 403, title: "Forbidden" },
  INSTALLATION_NOT_FOUND: { status: 404, title: "Installation Not Found" },
  INSTALLATION_INCOMPLETE: { status: 409, title: "Installation Incomplete" },
  CONTENT_NOT_FOUND: { status: 404, title: "Content Not Found" },
  CONTENT_METHOD_NOT_ALLOWED: { status: 405, title: "Method Not Allowed" },
  CONTENT_VERSION_MISMATCH: { status: 409, title: "Content Version Mismatch" },
  CONTENT_TOO_LARGE: { status: 413, title: "Content Too Large" },
  CONTENT_SCHEMA_INVALID: { status: 422, title: "Content Schema Invalid" },
  CONTENT_INTEGRITY_FAILED: { status: 422, title: "Content Integrity Failed" },
  RANGE_INVALID: { status: 416, title: "Range Not Satisfiable" },
  CONTENT_PRESSURE: { status: 429, title: "Too Many Requests" },
  CONTENT_UNAVAILABLE: { status: 500, title: "Internal Server Error" },
});

function problem(res: ServerResponse, code: ContentProblemCode, allow = false): void {
  const fact = PROBLEMS[code];
  const body = Buffer.from(JSON.stringify({ type: `urn:loomrealm:content:${code.toLowerCase()}`, title: fact.title, status: fact.status, code }), "utf8");
  res.statusCode = fact.status;
  res.setHeader("Content-Type", "application/problem+json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", body.length);
  if (allow) res.setHeader("Allow", "GET, HEAD");
  res.end(body);
}

function selectedBodyHasValidSchema(kind: ContentIndexEntry["kind"], body: Uint8Array): boolean {
  if (kind === "resource") return true;
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(body); }
  catch { return false; }
  try {
    if (kind === "record") {
      const value: unknown = JSON.parse(text);
      return value !== null && typeof value === "object" && !Array.isArray(value);
    }
    const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
    if (lines.length === 1 && lines[0] === "") return true;
    for (const line of lines) {
      if (line === "" || line.endsWith("\r")) return false;
      const value: unknown = JSON.parse(line);
      if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    }
    return true;
  } catch { return false; }
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
  const trustedShellOptions = options.trustedShell;
  if (trustedShellOptions !== undefined && (trustedShellOptions === null || typeof trustedShellOptions !== "object" || !(trustedShellOptions.entryScript instanceof Uint8Array) || typeof trustedShellOptions.bootstrap !== "function")) {
    throw new TypeError("Invalid trusted Desktop shell");
  }
  const trustedShell: TrustedShellRuntime | undefined = trustedShellOptions === undefined ? undefined : {
    entryScript: trustedShellOptions.entryScript,
    bootstrap: trustedShellOptions.bootstrap,
    documentPath: `/_lr/window/${randomBytes(32).toString("base64url")}`,
    entryPath: `/_lr/static/${randomBytes(24).toString("base64url")}/renderer.js`,
    requests: new Set(),
  };
  const grants = new Map<string, DesktopContentGrant>();
  let active = 0;

  const server = createServer((req, res) => {
    req.resume();
    if (serveTrustedShell(req, res, trustedShell)) return;
    void (async () => {
      if (req.method !== "GET" && req.method !== "HEAD") return problem(res, "CONTENT_METHOD_NOT_ALLOWED", true);
      let route: Route | null;
      try { route = parseRoute(req.url); } catch { return problem(res, "CONTENT_REQUEST_INVALID"); }
      if (!route) return problem(res, "CONTENT_NOT_FOUND");
      const token = bearer(req);
      const grant = token ? grants.get(token) : undefined;
      if (!grant || grant.expiresAtUnixMs <= Date.now()) return problem(res, "CONTENT_AUTH_REQUIRED");
      if (route.installationId !== view.installationId || grant.installationId !== route.installationId) return problem(res, "INSTALLATION_NOT_FOUND");
      if (!grant.permissions.includes(route.permission)) return problem(res, "CONTENT_PERMISSION_DENIED");
      if (active >= maxConcurrentRequests) return problem(res, "CONTENT_PRESSURE");
      active++;
      try {
        if (view.state !== "open" || view.db.state !== "open") return problem(res, "INSTALLATION_INCOMPLETE");
        if (route.kind === "manifest") {
          if (view.manifestBytes.byteLength > maxBodyBytes) return problem(res, "CONTENT_TOO_LARGE");
          successHeaders(res, "application/json; charset=utf-8", view.manifestVersion, view.manifestBytes.byteLength, false);
          if (notModified(req, view.manifestVersion)) { res.statusCode = 304; return res.end(); }
          res.statusCode = 200;
          return res.end(req.method === "HEAD" ? undefined : view.manifestBytes);
        }
        const entry = view.index.get(indexKey(route.kind, route.namespace, route.key));
        if (!entry) return problem(res, "CONTENT_NOT_FOUND");
        if (entry.length > BigInt(maxBodyBytes)) return problem(res, "CONTENT_TOO_LARGE");
        const controller = new AbortController();
        const cancel = () => controller.abort();
        req.once("aborted", cancel);
        res.once("close", cancel);
        const lease = await openFsdbObject(view.db, entry.identity, controller.signal).catch(() => null);
        req.off("aborted", cancel);
        res.off("close", cancel);
        if (!lease) return problem(res, view.db.state === "open" ? "CONTENT_NOT_FOUND" : "INSTALLATION_INCOMPLETE");
        try {
          const unchanged = notModified(req, entry.contentVersion);
          const chunks: Buffer[] = [];
          const hash = createHash("sha256");
          let length = 0;
          for await (const chunk of lease.stream) {
            const bytes = Buffer.from(chunk as Uint8Array);
            length += bytes.length;
            if (length > maxBodyBytes) return problem(res, "CONTENT_TOO_LARGE");
            hash.update(bytes);
            chunks.push(bytes);
          }
          const actual = `sha256:${hash.digest("hex")}`;
          if (!CONTENT_VERSION.test(actual) || actual !== entry.contentVersion || BigInt(length) !== entry.length) return problem(res, "CONTENT_INTEGRITY_FAILED");
          const body = Buffer.concat(chunks, length);
          if (!selectedBodyHasValidSchema(entry.kind, body)) return problem(res, "CONTENT_SCHEMA_INVALID");
          successHeaders(res, entry.mime, entry.contentVersion, body.length, true);
          res.statusCode = unchanged ? 304 : 200;
          res.end(req.method === "HEAD" || unchanged ? undefined : body);
        } finally { await lease.close(); }
      } finally { active--; }
    })().catch(() => {
      if (!res.headersSent) problem(res, "CONTENT_UNAVAILABLE");
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
    shell: trustedShell === undefined ? null : new URL(trustedShell.documentPath, origin),
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
    revokeGrant(grant: DesktopContentGrant): void {
      if (grants.get(grant?.token) === grant) grants.delete(grant.token);
    },
    close() {
      closing ??= (async () => {
        grants.clear();
        if (trustedShell !== undefined) for (const request of trustedShell.requests) request.abort(new Error("Desktop Content service closed"));
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await view.close();
      })();
      return closing;
    },
  });
  return service;
}
