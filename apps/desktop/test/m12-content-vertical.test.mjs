import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHostraRuntimeHosting, prepareHostraGame } from "@loomrealm/game-launcher-hostra";
import { runMain } from "@loomrealm/main";
import { createRendererResourceClient } from "@loomrealm/renderer/resource-client";
import { createDesktopContentService, prepareDesktopContentView } from "../dist/index.js";

const runnerPolicy = Object.freeze({ helloDeadlineMs: 5_000, frameDeadlineMs: 5_000, terminalCleanupDeadlineMs: 1_000, terminationGraceMs: 100 });
const mainPolicy = Object.freeze({ runtimeBootstrapDeadlineMs: 5_000, frameDeadlineMs: 5_000, shutdownDeadlineMs: 5_000, terminationDeadlineMs: 2_000 });
const scheduler = Object.freeze({ schedule(delayMs, callback) { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); } });
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

async function installation(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "loomrealm-m12-vertical-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const moduleRoot = path.join(root, "subsystems");
  const fsdbRoot = path.join(root, "[FSDB]content");
  const records = path.join(fsdbRoot, "[struct]actors");
  const resources = path.join(fsdbRoot, "[resource]images", "ui", "icons");
  await Promise.all([mkdir(moduleRoot, { recursive: true }), mkdir(records, { recursive: true }), mkdir(resources, { recursive: true })]);
  const recordBytes = Buffer.from('{"name":"Pikachu","level":25}');
  const resourceBytes = Buffer.from([0, 1, 2, 3, 254, 255]);
  await Promise.all([
    writeFile(path.join(root, "game.json"), JSON.stringify({ formatVersion: 1, initial: { subsystem: "root", input: null }, subsystems: [{ key: "root" }] })),
    writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({ formatVersion: 1, subsystems: [{ key: "root", module: "subsystems/root.mjs" }] })),
    writeFile(path.join(moduleRoot, "root.mjs"), `
      export default (scope) => {
        let observed;
        return {
          async initialize() {
            if (process.env.LOOMREALM_HOSTRA_CONTENT_ACCESS !== undefined) throw new Error("Content credential was not scrubbed");
            observed = await scope.content.record("struct.actors", "pikachu");
          },
          frame() { return { type: "completed", value: observed }; }
        };
      };
    `),
    writeFile(path.join(records, ".info.meta"), '{"type":"object"}'),
    writeFile(path.join(records, "pikachu.json"), recordBytes),
    writeFile(path.join(fsdbRoot, "[resource]images", ".desc.meta"), "images"),
    writeFile(path.join(resources, "potion.png"), resourceBytes),
  ]);
  const prepared = await prepareHostraGame({ source: { installationRoot: root }, runnerPolicy });
  const view = await prepareDesktopContentView(prepared);
  const service = await createDesktopContentService({ view });
  t.after(() => service.close());
  return { prepared, service, recordBytes, resourceBytes };
}

test("M12 Vertical A: production prepare → FSDB → Desktop HTTP → Hostra child → scope.content", { timeout: 15_000 }, async (t) => {
  const setup = await installation(t);
  const grant = setup.service.createGrant({ permissions: ["records"], expiresAtUnixMs: Date.now() + 60_000 });
  const access = setup.service.access(grant);
  const result = await runMain({
    bootstrap: setup.prepared.logicalBootstrap,
    policy: mainPolicy,
    platform: Object.freeze({
      scheduler,
      opaqueMaterial: Object.freeze({ generate: () => randomBytes(32).toString("base64url") }),
      runtimeHosting: createHostraRuntimeHosting({
        launchPlan: setup.prepared.launchPlan,
        contentAccess: { origin: access.origin.href, installationId: access.installationId, token: access.token },
      }),
    }),
  });
  assert.deepEqual(result, {
    kind: "root-outcome",
    outcome: { type: "completed", value: { value: { name: "Pikachu", level: 25 }, contentVersion: sha256(setup.recordBytes) } },
  });
});

test("M12 Vertical B: production prepare → FSDB → Desktop HTTP → Renderer ResourceClient", async (t) => {
  const setup = await installation(t);
  const access = setup.service.access(setup.service.createGrant({ permissions: ["resources"], expiresAtUnixMs: Date.now() + 60_000 }));
  const client = createRendererResourceClient(access, new AbortController().signal);
  const resource = await client.resource("resource.images", "ui/icons/potion", sha256(setup.resourceBytes));
  assert.deepEqual([...resource.bytes], [...setup.resourceBytes]);
  assert.equal(resource.mime, "image/png");
  assert.equal(resource.contentVersion, sha256(setup.resourceBytes));
});
