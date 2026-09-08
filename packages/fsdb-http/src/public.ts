import { createServer, type RequestListener, type Server } from "node:http";
import { isIP } from "node:net";
import type { Duplex } from "node:stream";
import { openFsdb, type FsdbDatabase, type OpenFsdbOptions } from "@loomrealm/fsdb";
import { makeHandler } from "./http.js";

export { openFsdb };
export type { FsdbDatabase, OpenFsdbOptions };

export interface ServeFsdbOptions extends OpenFsdbOptions {
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

export async function serveFsdb(options: ServeFsdbOptions): Promise<FsdbHttpService> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const db = await openFsdb(options);
  const server = createServer(makeHandler(db));
  const serverClosed = new Promise<void>((resolve) => server.once("close", resolve));
  server.on("connect", (_request, socket) => rejectAuthorityForm(socket));
  try {
    await listen(server, port, host);
  } catch (error) {
    await Promise.allSettled([closeServer(server), db.close()]);
    throw error;
  }
  const bound = server.address();
  if (!bound || typeof bound === "string") {
    await Promise.allSettled([closeServer(server), db.close()]);
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
        const dbClose = db.close();
        const closeRequest = server.listening
          ? new Promise<void>((resolve, reject) => server.close((error) => {
              if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(error);
              else resolve();
            }))
          : Promise.resolve();
        await Promise.all([closeRequest, serverClosed, dbClose]);
      })();
      return closing;
    },
  };
  return Object.freeze(service);
}
