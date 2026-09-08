import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDesktopContentService, prepareDesktopContentView } from "../dist/index.js";

async function fixture(resourceBytes = Buffer.from([0, 255, 1, 2])) {
  const parent = await mkdtemp(join(tmpdir(), "desktop-content-"));
  const installationRoot = join(parent, "game");
  const fsdbRoot = join(installationRoot, "[FSDB]内容");
  const struct = join(fsdbRoot, "[struct]角色");
  const extend = join(fsdbRoot, "[extend]角色");
  const group = join(fsdbRoot, "[group]队伍");
  const resource = join(fsdbRoot, "[resource]图像");
  await Promise.all([
    mkdir(struct, { recursive: true }), mkdir(extend, { recursive: true }),
    mkdir(group, { recursive: true }), mkdir(join(resource, "ui", "icons"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(installationRoot, "game.json"), JSON.stringify({
      subsystems: [{ key: "world" }], formatVersion: 1,
      initial: { input: { z: 1, a: 2 }, subsystem: "world" },
    }, null, 2)),
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
  return { parent, installationRoot, fsdbRoot, struct, resource, resourceBytes, async cleanup() { await rm(parent, { recursive: true, force: true }); } };
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

test("prepared view serves deterministic manifest and the complete logical FSDB projection", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const view = await prepareDesktopContentView(f);
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

test("authorization, route validation, method, HEAD, cache, and confidentiality semantics are closed", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const view = await prepareDesktopContentView(f);
  const service = await createDesktopContentService({ view }); t.after(() => service.close());
  const grant = service.createGrant({ permissions: ["records"], expiresAtUnixMs: Date.now() + 60_000 });
  const access = service.access(grant);
  assert.equal((await fetch(pathFor(access, "/records/struct.%E8%A7%92%E8%89%B2/hero"))).status, 401);
  assert.equal((await request(access, "/resources/resource.%E5%9B%BE%E5%83%8F/ui/icons/potion")).status, 403);
  assert.equal((await request(access, "/records/struct.%E8%A7%92%E8%89%B2/%2e%2e")).status, 400);
  assert.equal((await request(access, "/records/struct.%E8%A7%92%E8%89%B2/missing")).status, 404);
  const wrongInstallation = new URL(pathFor(access, "/manifest"));
  wrongInstallation.pathname = wrongInstallation.pathname.replace(access.installationId, "unknown-installation");
  assert.equal((await fetch(wrongInstallation, { headers: { Authorization: `Bearer ${access.token}` } })).status, 404);
  const method = await request(access, "/records/struct.%E8%A7%92%E8%89%B2/hero", { method: "POST" });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "GET, HEAD");

  const first = await request(access, "/records/struct.%E8%A7%92%E8%89%B2/hero");
  const etag = first.headers.get("etag");
  const head = await request(access, "/records/struct.%E8%A7%92%E8%89%B2/hero", { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(await head.text(), ""); assert.equal(head.headers.get("etag"), etag);
  const cached = await request(access, "/records/struct.%E8%A7%92%E8%89%B2/hero", { headers: { "If-None-Match": etag } });
  assert.equal(cached.status, 304); assert.equal(await cached.text(), "");

  const expired = service.access(service.createGrant({ permissions: ["manifest"], expiresAtUnixMs: 1 }));
  assert.equal((await request(expired, "/manifest")).status, 401);
  const error = await request(access, "/records/struct.%E8%A7%92%E8%89%B2/missing");
  const problem = await error.text();
  assert.equal(error.headers.get("content-type"), "application/problem+json");
  assert.equal(problem.includes(access.token), false);
  assert.equal(problem.includes(f.parent), false);
});

test("deployment limits and source drift map to bounded Content failures", async (t) => {
  const f = await fixture(Buffer.alloc(1024 * 1024, 0x61)); t.after(() => f.cleanup());
  const limitedView = await prepareDesktopContentView(f);
  const limited = await createDesktopContentService({ view: limitedView, maxBodyBytes: 16 }); t.after(() => limited.close());
  const limitedAccess = limited.access(limited.createGrant({ permissions: ["resources"], expiresAtUnixMs: Date.now() + 60_000 }));
  assert.equal((await request(limitedAccess, "/resources/resource.%E5%9B%BE%E5%83%8F/ui/icons/potion")).status, 413);
  await limited.close();

  const drift = await fixture(); t.after(() => drift.cleanup());
  const driftView = await prepareDesktopContentView(drift);
  const service = await createDesktopContentService({ view: driftView }); t.after(() => service.close());
  const access = service.access(service.createGrant({ permissions: ["records"], expiresAtUnixMs: Date.now() + 60_000 }));
  await writeFile(join(drift.struct, "hero.json"), '{"changed":true}');
  assert.equal((await request(access, "/records/struct.%E8%A7%92%E8%89%B2/hero")).status, 409);
});

test("bounded concurrent admission reports 429 without corrupting the admitted read", async (t) => {
  const f = await fixture(Buffer.alloc(8 * 1024 * 1024, 0x5a)); t.after(() => f.cleanup());
  const view = await prepareDesktopContentView(f);
  const service = await createDesktopContentService({ view, maxConcurrentRequests: 1 }); t.after(() => service.close());
  const access = service.access(service.createGrant({ permissions: ["resources"], expiresAtUnixMs: Date.now() + 60_000 }));
  const suffix = "/resources/resource.%E5%9B%BE%E5%83%8F/ui/icons/potion";
  const [first, second] = await Promise.all([request(access, suffix), request(access, suffix)]);
  assert.deepEqual([first.status, second.status].sort((a, b) => a - b), [200, 429]);
  const success = first.status === 200 ? first : second;
  assert.equal((await success.arrayBuffer()).byteLength, f.resourceBytes.length);
});
