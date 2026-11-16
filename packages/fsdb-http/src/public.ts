import { lstat, realpath } from "node:fs/promises";
import { createServer, type RequestListener, type Server } from "node:http";
import { isIP } from "node:net";
import { isAbsolute, resolve } from "node:path";
import type { Duplex } from "node:stream";
import { FsdbResolutionError, SourceUnavailableError, openFsdb, type FsdbDatabase, type OpenFsdbOptions } from "@loomrealm/fsdb";
import { dispatchFsdb, errorResponse, makeHandler } from "./http.js";
import { BadTargetError, parseRootTarget } from "./router.js";

export { openFsdb };
export type { FsdbDatabase, OpenFsdbOptions };

export interface ServeFsdbOptions {
  /** Filesystem container Root that may contain multiple nested FSDBs. */
  readonly root: string;
  readonly host?: string;
  readonly port?: number;
}

export interface FsdbHttpService {
  readonly server: Server;
  readonly address: { readonly host: string; readonly port: number };
  readonly origin?: URL;
  close(): Promise<void>;
}

export function createFsdbHttpHandler(db: FsdbDatabase): RequestListener {
  return makeHandler(db);
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => { server.off("listening", onListening); reject(error); };
    const onListening = () => { server.off("error", onError); resolve(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function rejectAuthorityForm(socket: Duplex): void {
  socket.end("HTTP/1.1 400 Bad Request\r\nCache-Control: no-store\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
}

function failureStatus(error: unknown): number {
  if (error instanceof BadTargetError || (error instanceof FsdbResolutionError && error.code === "DATABASE_PATH_INVALID")) return 400;
  if (error instanceof FsdbResolutionError) {
    if (error.code === "DATABASE_NOT_FOUND") return 404;
    if (error.code === "DATABASE_PATH_AMBIGUOUS") return 409;
    if (error.code === "DATABASE_INVALID") return 422;
    return 503;
  }
  if (error instanceof SourceUnavailableError) return 503;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EMFILE" || code === "ENFILE" || code === "ENOMEM" || code === "EBUSY" || code === "EAGAIN") return 503;
  return 500;
}

async function containerRoot(root: string): Promise<string> {
  if (typeof root !== "string" || root.length === 0) throw new TypeError("Invalid options");
  const supplied = isAbsolute(root) ? root : resolve(process.cwd(), root);
  const canonical = await realpath(supplied);
  const stat = await lstat(canonical);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TypeError("Container root must be a directory");
  return canonical;
}

export async function serveFsdb(options: ServeFsdbOptions): Promise<FsdbHttpService> {
  if (options === null || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Invalid options");
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const root = await containerRoot(options.root);
  const opening = new Map<string, Promise<FsdbDatabase>>();
  const owned = new Set<FsdbDatabase>();
  const inflight = new Set<Promise<void>>();
  let admitting = true;

  function openDatabase(databasePath: string): Promise<FsdbDatabase> {
    const existing = opening.get(databasePath);
    if (existing) return existing;
    const pending = openFsdb({ root, path: databasePath }).then((db) => {
      owned.add(db);
      return db;
    }, (error: unknown) => {
      if (opening.get(databasePath) === pending) opening.delete(databasePath);
      throw error;
    });
    opening.set(databasePath, pending);
    return pending;
  }

  const server = createServer((req, res) => {
    req.resume();
    if (!admitting) return errorResponse(res, 503);
    const work = (async () => {
      let route;
      try { route = parseRootTarget(req.url); }
      catch (error) { return errorResponse(res, error instanceof BadTargetError ? 400 : 500); }
      if (route.type === "outside") return errorResponse(res, 404);
      let db: FsdbDatabase;
      try { db = await openDatabase(route.databasePath); }
      catch (error) { return errorResponse(res, failureStatus(error)); }
      await dispatchFsdb(req, res, db, route.local);
    })().catch((error: unknown) => {
      if (!res.headersSent) errorResponse(res, failureStatus(error));
      else res.destroy();
    });
    inflight.add(work);
    void work.finally(() => inflight.delete(work));
  });
  const serverClosed = new Promise<void>((resolveClosed) => server.once("close", resolveClosed));
  server.on("connect", (_request, socket) => rejectAuthorityForm(socket));
  try {
    await listen(server, port, host);
  } catch (error) {
    admitting = false;
    await Promise.allSettled([closeServer(server), ...[...owned].map((db) => db.close())]);
    throw error;
  }
  const bound = server.address();
  if (!bound || typeof bound === "string") {
    admitting = false;
    await Promise.allSettled([closeServer(server), ...[...owned].map((db) => db.close())]);
    throw new Error("Unsupported server address");
  }
  const address = Object.freeze({ host: bound.address, port: bound.port });
  const wildcard = bound.address === "0.0.0.0" || bound.address === "::";
  const origin = wildcard ? undefined : new URL(`http://${isIP(bound.address) === 6 ? `[${bound.address}]` : bound.address}:${bound.port}`);
  let closing: Promise<void> | undefined;
  const service: FsdbHttpService = {
    server,
    address,
    ...(origin ? { origin } : {}),
    close() {
      closing ??= (async () => {
        admitting = false;
        const closeRequest = server.listening
          ? new Promise<void>((resolveClosed, reject) => server.close((error) => {
              if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(error);
              else resolveClosed();
            }))
          : Promise.resolve();
        await Promise.allSettled([...inflight]);
        await Promise.allSettled([...opening.values()]);
        await Promise.all([...owned].map((db) => db.close()));
        await Promise.all([closeRequest, serverClosed]);
      })();
      return closing;
    },
  };
  return Object.freeze(service);
}
