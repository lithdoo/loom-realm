import { appendFileSync } from "node:fs";
import { startDesktopProduct } from "./product-composition.js";

const eventLog = process.env.LOOMREALM_M15_EVENT_LOG;
const observe = eventLog === undefined ? undefined : (event: Readonly<Record<string, unknown> & { type: string }>) => {
  appendFileSync(eventLog, `${JSON.stringify({ at: Date.now(), pid: process.pid, ...event })}\n`, "utf8");
};

let product: Awaited<ReturnType<typeof startDesktopProduct>> | null = null;
let signalTermination: Promise<void> | null = null;
const entryLifetime = new AbortController();
const installationRoot = process.env.LOOMREALM_DESKTOP_INSTALLATION_ROOT;
if (installationRoot === undefined) throw new Error("LOOMREALM_DESKTOP_INSTALLATION_ROOT is required");
const terminate = (signal: NodeJS.Signals) => {
  entryLifetime.abort(new Error(`Desktop received ${signal}`));
  signalTermination ??= (product === null ? Promise.resolve() : product.close()).catch((cause) => {
    process.stderr.write(`Desktop termination failed: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  });
};
process.once("SIGTERM", () => terminate("SIGTERM"));
process.once("SIGINT", () => terminate("SIGINT"));

void startDesktopProduct({
  installationRoot,
  signal: entryLifetime.signal,
  ...(observe === undefined ? {} : { observe }),
}).then((started) => { product = started; }, (cause) => {
  observe?.({ type: "startup-failed", cause: cause instanceof Error ? cause.stack ?? cause.message : String(cause) });
  process.stderr.write(`Desktop startup failed: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`);
  process.exitCode = 1;
});
