import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createHostraRuntimeHosting, prepareHostraGame } from "@loomrealm/game-launcher-hostra";
import { runMain } from "@loomrealm/main";
import { createRealmStateAuthority } from "@loomrealm/realm-state";
import { createRendererControlHolder } from "@loomrealm/renderer";
import { inspectRendererRenderForQualification } from "../../../../packages/renderer/dist/internal/render-qualification.js";
import { createDesktopContentService, DesktopDataConnectionBroker, prepareDesktopContentView } from "../../../desktop/dist/index.js";
import { DEMO_EXECUTABLE } from "../../dist/types/installation-bundle.js";

const runnerPolicy = Object.freeze({ helloDeadlineMs: 5_000, frameDeadlineMs: 5_000, terminalCleanupDeadlineMs: 250, terminationGraceMs: 100 });
const mainPolicy = Object.freeze({ runtimeBootstrapDeadlineMs: 5_000, frameDeadlineMs: 5_000, shutdownDeadlineMs: 2_000, terminationDeadlineMs: 1_000 });
const scheduler = Object.freeze({ schedule(delayMs, callback) { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); } });

async function waitFor(predicate, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export async function runDesktopEquivalenceReference() {
  const root = await mkdtemp(path.join(os.tmpdir(), "loomrealm-pwa-equivalence-"));
  const controller = new AbortController();
  const broker = new DesktopDataConnectionBroker({ candidateId: (() => { let value = 0; return () => `pwa-equivalence-${++value}`; })() });
  let service = null;
  let authority = null;
  try {
    await Promise.all([
      mkdir(path.join(root, "subsystems"), { recursive: true }),
      mkdir(path.join(root, "[FSDB]content", "[struct]demo"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(root, "game.json"), JSON.stringify({ formatVersion: 1, state: { records: [{ namespace: "demo", key: "visits", value: 0 }] }, initial: { subsystem: "demo", input: { source: "pwa" } }, subsystems: [{ key: "demo" }] })),
      writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({ formatVersion: 1, subsystems: [{ key: "demo", module: "subsystems/demo.mjs" }] })),
      writeFile(path.join(root, "subsystems", "demo.mjs"), DEMO_EXECUTABLE),
      writeFile(path.join(root, "[FSDB]content", "[struct]demo", ".info.meta"), '{"type":"object"}'),
      writeFile(path.join(root, "[FSDB]content", "[struct]demo", "config.json"), '{"message":"ready"}'),
    ]);
    const prepared = await prepareHostraGame({ source: { installationRoot: root }, runnerPolicy });
    authority = createRealmStateAuthority(prepared.state);
    const view = await prepareDesktopContentView(prepared);
    service = await createDesktopContentService({ view });
    const access = service.access(service.createGrant({ permissions: ["records"], expiresAtUnixMs: Date.now() + 60_000 }));
    let emitInput = null;
    const input = Object.freeze({
      start(emit) {
        emitInput = emit;
        emit({ kind: "availability", channel: "keyboard.event", available: true });
        return () => { emitInput = null; };
      },
    });
    const viewport = Object.freeze({ start(emit) { emit({ width: 1280, height: 720 }); return () => {}; } });
    let holder = null;
    let rendererFailure = null;
    const rendererControl = Object.freeze({
      acquire(token, signal) {
        if (signal.aborted || holder !== null) return Promise.reject(signal.reason ?? new Error("Renderer already acquired"));
        const pair = createMemoryCarrierPair();
        holder = createRendererControlHolder(broker.rendererDataBinding(token), input, viewport);
        void holder.connect({ carrier: pair.right, rendererControlToken: token }).catch((cause) => { rendererFailure = cause; });
        return Promise.resolve(pair.left);
      },
    });
    const runtimeHosting = createHostraRuntimeHosting({
      launchPlan: prepared.launchPlan,
      realmStateAuthority: authority,
      contentAccess: { origin: access.origin.href, installationId: access.installationId, token: access.token },
      onRuntimeDataProvisioner: broker.onRuntimeDataProvisioner,
    });
    const result = runMain({
      bootstrap: prepared.logicalBootstrap,
      policy: mainPolicy,
      signal: controller.signal,
      platform: Object.freeze({ scheduler, opaqueMaterial: Object.freeze({ generate: () => randomBytes(32).toString("base64url") }), runtimeHosting, rendererControl, dataConnections: broker.sink }),
    });
    await waitFor(() => holder !== null && inspectRendererRenderForQualification(holder, "demo")?.domains[0]?.baselined === true, "Desktop logical Render baseline");
    const render = structuredClone(inspectRendererRenderForQualification(holder, "demo").domains[0].roots[0]);
    await waitFor(() => emitInput !== null, "Desktop input source");
    emitInput({ kind: "event", channel: "keyboard.event", payload: { action: "down", code: "Enter", repeat: false } });
    const outcome = await result;
    const state = await authority.read([{ namespace: "demo", key: "visits" }]);
    await waitFor(() => holder.current() === null, "Desktop Renderer cleanup");
    return Object.freeze({ outcome, render, state: state.records.map(({ key, value }) => ({ key, value })), rendererFailure, rendererCleaned: holder.current() === null });
  } finally {
    controller.abort(new Error("Desktop equivalence cleanup"));
    broker.close();
    authority?.terminate();
    await service?.close();
    await rm(root, { recursive: true, force: true });
  }
}
