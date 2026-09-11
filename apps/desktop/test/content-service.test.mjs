import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareHostraGame } from "@loomrealm/game-launcher-hostra";
import { createDesktopContentService, prepareDesktopContentView } from "../dist/index.js";

const runnerPolicy = Object.freeze({ helloDeadlineMs: 5_000, frameDeadlineMs: 5_000, terminalCleanupDeadlineMs: 1_000, terminationGraceMs: 100 });

async function fixture(resourceBytes = Buffer.from([0, 255, 1, 2])) {
  const parent = await mkdtemp(join(tmpdir(), "desktop-content-"));
  const installationRoot = join(parent, "game");
  const subsystems = join(installationRoot, "subsystems");
  const fsdbRoot = join(installationRoot, "[FSDB]内容");
  const struct = join(fsdbRoot, "[struct]角色");
  const extend = join(fsdbRoot, "[extend]角色");
  const group = join(fsdbRoot, "[group]队伍");
  const resource = join(fsdbRoot, "[resource]图像");
  await Promise.all([
    mkdir(subsystems, { recursive: true }),
    mkdir(struct, { recursive: true }), mkdir(extend, { recursive: true }),
    mkdir(group, { recursive: true }), mkdir(join(resource, "ui", "icons"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(installationRoot, "game.json"), JSON.stringify({
      subsystems: [{ key: "world" }], formatVersion: 1,
      initial: { input: { z: 1, a: 2 }, subsystem: "world" },
    }, null, 2)),
    writeFile(join(installationRoot, "launch.hostra.json"), JSON.stringify({ formatVersion: 1, subsystems: [{ key: "world", module: "subsystems/world.mjs" }] })),
    writeFile(join(subsystems, "world.mjs"), "export default () => ({ frame() {} });"),
    writeFile(join(struct, ".info.meta"), '{"type":"object"}'),
    writeFile(join(struct, "hero.json"), '{"name":"Hero"}'),
    writeFile(join(extend, ".info.meta"), '{"type":"object"}'),
    writeFile(join(extend, ".extend.meta"), '{"field":"hero","struct":"角色"}\n'),
    writeFile(join(extend, "hero.json"), '{"hp":10}'),
    writeFile(join(group, ".info.meta"), '{"type":"object"}'),
    writeFile(join(group, ".desc.meta"), "队伍"),
    writeFile(join(group, "party.jsonl"), '{"hero":"hero"}\n'),
    writeFile(join(resource, ".desc.meta"), "图像"),
    writeFile(join(resource, "ui", "icons", "potion.png"), resourceBytes),
  ]);
  const prepared = await prepareHostraGame({ source: { installationRoot }, runnerPolicy });
  return { parent, installationRoot, fsdbRoot, struct, resource, resourceBytes, prepared, async cleanup() { await rm(parent, { recursive: true, force: true }); } };
}

function hash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function pathFor(access, suffix) {
  return new URL(`/_lr/v1/games/${encodeURIComponent(access.installationId)}${suffix}`, access.origin);
}

function request(access, suffix, init = {}) {
  return fetch(pathFor(access, suffix), {
    ...init,
    headers: { Authorization: `Bearer ${access.token}`, ...init.headers },
  });
}

function shellRequest(url, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.once("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.once("error", reject);
    req.end();
  });
}

async function assertProblem(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("content-type"), "application/problem+json");
  assert.deepEqual(await response.json(), {
    type: `urn:loomrealm:content:${code.toLowerCase()}`,
    title: {
      CONTENT_AUTH_REQUIRED: "Unauthorized",
      CONTENT_PERMISSION_DENIED: "Forbidden",
      CONTENT_REQUEST_INVALID: "Bad Request",
      CONTENT_NOT_FOUND: "Content Not Found",
      INSTALLATION_NOT_FOUND: "Installation Not Found",
      CONTENT_METHOD_NOT_ALLOWED: "Method Not Allowed",
      CONTENT_TOO_LARGE: "Content Too Large",
      INSTALLATION_INCOMPLETE: "Installation Incomplete",
      CONTENT_SCHEMA_INVALID: "Content Schema Invalid",
      CONTENT_PRESSURE: "Too Many Requests",
    }[code],
    status,
    code,
  });
}

test("prepared view serves deterministic manifest and the complete logical FSDB projection", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  await writeFile(join(f.installationRoot, "game.json"), JSON.stringify({
    formatVersion: 1,
    initial: { subsystem: "changed-after-prepare", input: null },
    subsystems: [{ key: "changed-after-prepare" }],
  }));
  const view = await prepareDesktopContentView(f.prepared);
  assert.deepEqual(Object.keys(view).sort(), ["close", "installationId", "state"]);
  assert.equal("db" in view, false);
  assert.equal("index" in view, false);
  const service = await createDesktopContentService({ view }); t.after(() => service.close());
  const grant = service.createGrant({
    permissions: ["manifest", "records", "groups", "resources"],
    expiresAtUnixMs: Date.now() + 60_000,
  });
  const access = service.access(grant);

  const manifest = await request(access, "/manifest");
  assert.equal(manifest.status, 200);
  const manifestBytes = Buffer.from(await manifest.arrayBuffer());
  assert.equal(manifestBytes.toString(), '{"formatVersion":1,"initial":{"input":{"a":2,"z":1},"subsystem":"world"},"subsystems":[{"key":"world"}]}');
  assert.equal(manifest.headers.get("x-loom-content-version"), hash(manifestBytes));
  assert.equal(manifest.headers.get("etag"), `"${hash(manifestBytes)}"`);

  const struct = await request(access, "/records/struct.%E8%A7%92%E8%89%B2/hero");
  assert.deepEqual(await struct.json(), { name: "Hero" });
  const extend = await request(access, "/records/extend.%E8%A7%92%E8%89%B2/hero");
  assert.deepEqual(await extend.json(), { hp: 10 });
  const group = await request(access, "/groups/group.%E9%98%9F%E4%BC%8D/party");
  assert.equal(await group.text(), '{"hero":"hero"}\n');
  assert.match(group.headers.get("content-type"), /^application\/x-ndjson/);
  const resource = await request(access, "/resources/resource.%E5%9B%BE%E5%83%8F/ui/icons/potion");
  assert.deepEqual(Buffer.from(await resource.arrayBuffer()), f.resourceBytes);
  assert.equal(resource.headers.get("content-type"), "image/png");
  assert.equal(resource.headers.get("x-loom-content-version"), hash(f.resourceBytes));
});

test("trusted shell mints a document lifetime only for a real GET navigation", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const view = await prepareDesktopContentView(f.prepared);
  let bootstrapCount = 0;
  const service = await createDesktopContentService({
    view,
    trustedShell: {
      entryScript: Buffer.from("export {};"),
      async bootstrap() {
        bootstrapCount += 1;
        return {
          channel: "loomrealm.desktop.renderer-bootstrap/1",
          rendererControlToken: "control-token",
          rendererIdentity: "renderer-identity",
          controlEndpoint: "ws://127.0.0.1:1",
          dataSettlementEndpoint: "ws://127.0.0.1:2",
          content: { origin: service.origin.href, installationId: view.installationId, token: "content-token" },
          presentation: {},
        };
      },
    },
  });
  t.after(() => service.close());
  const navigationHeaders = { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" };

  const head = await shellRequest(service.shell, { method: "HEAD", headers: navigationHeaders });
  assert.equal(head.status, 405);
  assert.equal(head.headers.allow, "GET");
  assert.equal(bootstrapCount, 0);

  const nonNavigation = await fetch(service.shell);
  assert.equal(nonNavigation.status, 404);
  assert.equal(bootstrapCount, 0);

  const get = await shellRequest(service.shell, { headers: navigationHeaders });
  assert.equal(get.status, 200);
  assert.match(get.body, /loomrealm\.desktop\.renderer-bootstrap\/1/u);
  assert.equal(bootstrapCount, 1);
});

test("authorization, route validation, method, HEAD, cache, and confidentiality semantics are closed", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const view = await prepareDesktopContentView(f.prepared);
  const service = await createDesktopContentService({ view }); t.after(() => service.close());
  const grant = service.createGrant({ permissions: ["records"], expiresAtUnixMs: Date.now() + 60_000 });
  const access = service.access(grant);
  await assertProblem(await fetch(pathFor(access, "/records/struct.%E8%A7%92%E8%89%B2/hero")), 401, "CONTENT_AUTH_REQUIRED");
  await assertProblem(await request(access, "/resources/resource.%E5%9B%BE%E5%83%8F/ui/icons/potion"), 403, "CONTENT_PERMISSION_DENIED");
  await assertProblem(await request(access, "/records/struct.%E8%A7%92%E8%89%B2/%2e%2e"), 400, "CONTENT_REQUEST_INVALID");
  await assertProblem(await request(access, "/records/struct.%E8%A7%92%E8%89%B2/missing"), 404, "CONTENT_NOT_FOUND");
  const wrongInstallation = new URL(pathFor(access, "/manifest"));
  wrongInstallation.pathname = wrongInstallation.pathname.replace(access.installationId, "unknown-installation");
  await assertProblem(await fetch(wrongInstallation, { headers: { Authorization: `Bearer ${access.token}` } }), 404, "INSTALLATION_NOT_FOUND");
  const method = await request(access, "/records/struct.%E8%A7%92%E8%89%B2/hero", { method: "POST" });
  const methodBody = method.clone();
  await assertProblem(methodBody, 405, "CONTENT_METHOD_NOT_ALLOWED");
  assert.equal(method.headers.get("allow"), "GET, HEAD");

  const first = await request(access, "/records/struct.%E8%A7%92%E8%89%B2/hero");
  const etag = first.headers.get("etag");
  const head = await request(access, "/records/struct.%E8%A7%92%E8%89%B2/hero", { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(await head.text(), ""); assert.equal(head.headers.get("etag"), etag);
  const cached = await request(access, "/records/struct.%E8%A7%92%E8%89%B2/hero", { headers: { "If-None-Match": etag } });
  assert.equal(cached.status, 304); assert.equal(await cached.text(), "");

  const expired = service.access(service.createGrant({ permissions: ["manifest"], expiresAtUnixMs: 1 }));
  await assertProblem(await request(expired, "/manifest"), 401, "CONTENT_AUTH_REQUIRED");
  const error = await request(access, "/records/struct.%E8%A7%92%E8%89%B2/missing");
  const problem = await error.text();
  assert.equal(error.headers.get("content-type"), "application/problem+json");
  assert.equal(problem.includes(access.token), false);
  assert.equal(problem.includes(f.parent), false);
});

test("deployment limits and source drift map to bounded Content failures", async (t) => {
  const f = await fixture(Buffer.alloc(1024 * 1024, 0x61)); t.after(() => f.cleanup());
  const limitedView = await prepareDesktopContentView(f.prepared);
  const limited = await createDesktopContentService({ view: limitedView, maxBodyBytes: 16 }); t.after(() => limited.close());
  const limitedAccess = limited.access(limited.createGrant({ permissions: ["resources"], expiresAtUnixMs: Date.now() + 60_000 }));
  await assertProblem(await request(limitedAccess, "/resources/resource.%E5%9B%BE%E5%83%8F/ui/icons/potion"), 413, "CONTENT_TOO_LARGE");
  await limited.close();

  const drift = await fixture(); t.after(() => drift.cleanup());
  const driftView = await prepareDesktopContentView(drift.prepared);
  const service = await createDesktopContentService({ view: driftView }); t.after(() => service.close());
  const access = service.access(service.createGrant({ permissions: ["records"], expiresAtUnixMs: Date.now() + 60_000 }));
  await writeFile(join(drift.struct, "hero.json"), '{"changed":true}');
  await assertProblem(await request(access, "/records/struct.%E8%A7%92%E8%89%B2/hero"), 409, "INSTALLATION_INCOMPLETE");
});

test("bounded concurrent admission reports 429 without corrupting the admitted read", async (t) => {
  const f = await fixture(Buffer.alloc(8 * 1024 * 1024, 0x5a)); t.after(() => f.cleanup());
  const view = await prepareDesktopContentView(f.prepared);
  const service = await createDesktopContentService({ view, maxConcurrentRequests: 1 }); t.after(() => service.close());
  const access = service.access(service.createGrant({ permissions: ["resources"], expiresAtUnixMs: Date.now() + 60_000 }));
  const suffix = "/resources/resource.%E5%9B%BE%E5%83%8F/ui/icons/potion";
  const [first, second] = await Promise.all([request(access, suffix), request(access, suffix)]);
  assert.deepEqual([first.status, second.status].sort((a, b) => a - b), [200, 429]);
  const success = first.status === 200 ? first : second;
  const rejected = first.status === 429 ? first : second;
  await assertProblem(rejected, 429, "CONTENT_PRESSURE");
  assert.equal((await success.arrayBuffer()).byteLength, f.resourceBytes.length);
});
