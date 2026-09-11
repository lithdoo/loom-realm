import { appendFileSync } from "node:fs";
import { app } from "electron";
import { startDesktopProduct } from "../../apps/desktop/dist/product-composition.js";

const eventLog = process.env.LOOMREALM_M15_EVENT_LOG;
if (!eventLog) throw new Error("Missing LOOMREALM_M15_EVENT_LOG");
const candidatePorts = new Map();
let currentCandidate = null;
const observe = (event) => {
  if (event.type === "data-physical") candidatePorts.set(event.candidateId, event.rendererPort);
  if (event.type === "data-current") currentCandidate = event.candidateId;
  if (event.type === "data-retired" && currentCandidate === event.candidateId) currentCandidate = null;
  appendFileSync(eventLog, `${JSON.stringify({ at: Date.now(), ...event })}\n`, "utf8");
};
globalThis.__m15DropCurrentData = () => {
  const port = candidatePorts.get(currentCandidate);
  if (!Number.isSafeInteger(port)) throw new Error("No current Data port");
  const socket = process._getActiveHandles().find((handle) => handle?.constructor?.name === "Socket" && handle.localPort === port);
  if (!socket) throw new Error(`Current Data socket ${port} not found`);
  socket.destroy();
};
let product = null;
let quitting = false;

app.on("before-quit", (event) => {
  if (quitting || product === null) return;
  event.preventDefault();
  quitting = true;
  void product.close().then(() => app.quit(), () => { process.exitCode = 1; app.quit(); });
});

void app.whenReady().then(async () => {
  product = await startDesktopProduct(app, { observe });
}).catch((cause) => {
  observe({ type: "startup-failed", cause: cause instanceof Error ? cause.message : String(cause) });
  process.exitCode = 1;
  app.quit();
});
