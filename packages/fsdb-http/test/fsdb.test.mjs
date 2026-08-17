import { test as nodeTest } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, rename, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer, get as httpGet, request as nodeRequest } from "node:http";
import { Readable } from "node:stream";
import { createFsdbHttpHandler, openFsdb, serveFsdb } from "../dist/index.js";
import { asDatabase } from "../dist/database.js";
import { makeHandler } from "../dist/http.js";
import { fixture, rawRequest, request } from "./helpers.mjs";

const coveredConformance = new Set();
function conformance(ids, title, fn) {
  for (const id of ids) coveredConformance.add(id);
  return nodeTest(`${ids.join(", ")}: ${title}`, fn);
}

conformance(["API-001", "API-002", "API-003", "FDB-001", "FDB-005", "FDB-006", "FDB-008", "FDB-009", "FDB-010", "LIFE-001"], "opens a Unicode Well-formed snapshot", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const db = await openFsdb({ root: f.root }); t.after(() => db.close());
  assert.equal(db.name, "游戏数据");
  assert.equal(db.state, "open");
  assert.deepEqual(Object.keys(db).sort(), ["close", "name", "state"]);
  assert.equal("snapshot" in db, false);
  assert.throws(() => createFsdbHttpHandler({ name: db.name, state: "open", close: db.close }));
});

conformance(["FDB-003", "FDB-007", "FDB-011"], "rejects normalization, ResourceKey, and structured-content ambiguity", async (t) => {
  const a = await fixture(); t.after(() => a.cleanup());
  await writeFile(join(a.struct, "e\u0301.json"), "{}");
  await writeFile(join(a.struct, "é.json"), "{}");
  await assert.rejects(openFsdb({ root: a.root }));

  const b = await fixture(); t.after(() => b.cleanup());
  await writeFile(join(b.resource, "说明.webp"), "duplicate key");
  await assert.rejects(openFsdb({ root: b.root }));

  const c = await fixture(); t.after(() => c.cleanup());
  await writeFile(join(c.struct, "坏数据.json"), "[]");
  await assert.rejects(openFsdb({ root: c.root }));
});

conformance(["FDB-002", "FDB-004", "FDB-008", "FDB-009", "FDB-012"], "canonicalizes physical spelling and validates reserved names/text", async (t) => {
  const a = await fixture(); t.after(() => a.cleanup());
  await writeFile(join(a.struct, "e\u0301.json"), "{}");
  await writeFile(join(a.struct, ".info.meta"), "true");
  await writeFile(join(a.root, "[extend]角色", ".extend.meta"), "\n");
  const db = await openFsdb({ root: a.root }); await db.close();
  if (process.platform !== "win32") {
    const invalidUtf8 = Buffer.concat([Buffer.from(a.struct), Buffer.from("/"), Buffer.from([0xff]), Buffer.from(".json")]);
    await writeFile(invalidUtf8, "{}");
    await assert.rejects(openFsdb({ root: a.root }));
  }

  const b = await fixture(); t.after(() => b.cleanup());
  await writeFile(join(b.struct, "$reserved.json"), "{}");
  await assert.rejects(openFsdb({ root: b.root }));

  const c = await fixture(); t.after(() => c.cleanup());
  await writeFile(join(c.struct, "bom.json"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("{}") ]));
  await assert.rejects(openFsdb({ root: c.root }));

  const d = await fixture(); t.after(() => d.cleanup());
  await writeFile(join(d.root, "notes.txt"), "auxiliary");
  await mkdir(join(d.root, "backup"));
  const auxiliary = await openFsdb({ root: d.root }); await auxiliary.close();
});

conformance(["ROOT-001", "ROOT-003"], "resolves a relative root once and rejects bad root identity", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const previous = process.cwd();
  try {
    process.chdir(f.parent);
    const db = await openFsdb({ root: "[FSDB]游戏数据" });
    process.chdir(previous);
    assert.equal(db.name, "游戏数据"); await db.close();
  } finally { process.chdir(previous); }
  const invalid = join(f.parent, "database"); await mkdir(invalid);
  await assert.rejects(openFsdb({ root: invalid }));
});

conformance(["SAFE-001", "SAFE-002"], "recognized indirection fails while auxiliary indirection is ignored", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  try {
    await symlink(join(f.struct, "皮卡丘.json"), join(f.struct, "链接.json"), "file");
  } catch (error) {
    if (error.code === "EPERM") return t.skip("host cannot create symlinks");
    throw error;
  }
  await assert.rejects(openFsdb({ root: f.root }));
});

conformance(["ROOT-002", "SAFE-001", "SAFE-002"], "root junction resolves once and recognized descendant junction fails", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const rootLink = join(f.parent, "root-link");
  try { await symlink(f.root, rootLink, "junction"); } catch (error) {
    if (error.code === "EPERM") return t.skip("host cannot create junctions");
    throw error;
  }
  const linked = await openFsdb({ root: rootLink }); assert.equal(linked.name, "游戏数据"); await linked.close();
  const badTable = join(f.root, "[struct]链接表");
  await symlink(f.struct, badTable, "junction");
  await assert.rejects(openFsdb({ root: f.root }));
});

conformance(["HTTP-002", "HTTP-003", "HTTP-004", "HTTP-005", "HTTP-006", "HTTP-008", "STATUS-002", "STATUS-003", "STATUS-004", "STATUS-005", "STATUS-007", "MIME-001", "RESP-001", "RESP-002", "RESP-003", "CACHE-001", "CACHE-003"], "serves deterministic Unicode routes, metadata, bytes, status precedence, and HEAD", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const db = await openFsdb({ root: f.root }); t.after(() => db.close());
  const server = createServer(createFsdbHttpHandler(db));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address(); const origin = `http://127.0.0.1:${address.port}`;

  const descriptor = await request(origin, "/fsdb/v1");
  assert.equal(descriptor.status, 200);
  assert.equal(descriptor.headers.get("content-type"), "application/json; charset=utf-8");
  const descriptorText = await descriptor.text();
  assert.equal(descriptorText, "{\"name\":\"游戏数据\",\"tables\":[{\"kind\":\"extend\",\"name\":\"角色\"},{\"kind\":\"group\",\"name\":\"队伍\"},{\"kind\":\"resource\",\"name\":\"图片\"},{\"kind\":\"struct\",\"name\":\"角色\"}]}");

  const data = await request(origin, "/fsdb/v1/struct/%E8%A7%92%E8%89%B2/%E7%9A%AE%E5%8D%A1%E4%B8%98");
  assert.equal(data.status, 200); assert.equal(await data.text(), "{\"name\":\"皮卡丘\"}");
  assert.equal(data.headers.get("cache-control"), "no-cache");
  assert.equal(await (await request(origin, "/fsdb/v1/struct/角色/A+B")).text(), "{\"plus\":true}");

  const head = await request(origin, "/fsdb/v1/struct/角色/皮卡丘", { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(await head.text(), ""); assert.ok(head.headers.get("etag"));
  const resource = await request(origin, "/fsdb/v1/resource/图片/关都地区/真新镇");
  assert.equal(resource.headers.get("content-type"), "image/png");
  assert.deepEqual(new Uint8Array(await resource.arrayBuffer()), new Uint8Array([0, 255, 1, 2]));
  const opaqueText = await request(origin, "/fsdb/v1/resource/图片/说明");
  assert.equal(opaqueText.headers.get("content-type"), "text/plain");
  assert.equal(opaqueText.headers.get("content-type").includes("charset"), false);
  assert.equal((await request(origin, "/other", { method: "POST" })).status, 404);
  assert.equal((await request(origin, "/fsdb/v1/struct//x", { method: "POST" })).status, 400);
  const method = await request(origin, "/fsdb/v1/struct/角色/皮卡丘", { method: "POST" });
  assert.equal(method.status, 405); assert.equal(method.headers.get("allow"), "GET, HEAD");
  assert.equal((await request(origin, "/fsdb/v1/struct/角色/%2F")).status, 400);
  assert.equal((await request(origin, "/fsdb/v1?x=1")).status, 400);
  assert.equal((await request(origin, "/fsdb/v1/struct/角色/$extend")).status, 404);
  assert.equal((await request(origin, "/fsdb/v1/resource/图片/$info")).status, 404);
  assert.equal((await request(origin, "/fsdb/v1/group/队伍/$desc")).status, 200);
  assert.equal((await request(origin, "/fsdb/v1/group/队伍/主力")).headers.get("content-type"), "application/x-ndjson; charset=utf-8");
  assert.equal((await request(origin, "/fsdb/v1/struct/角色/$info")).headers.get("content-type"), "application/schema+json; charset=utf-8");
  assert.equal((await request(origin, "/fsdb/v1/struct/角色/$desc")).headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.equal((await request(origin, "/fsdb/v1/struct/角色/不存在", { headers: { "If-Match": "*" } })).status, 404);
  const missing = await request(origin, "/fsdb/v1/struct/角色/不存在");
  assert.equal(missing.headers.get("cache-control"), "no-store");
});

conformance(["HTTP-001", "HTTP-007", "HTTP-009", "HTTP-010", "HTTP-011", "HTTP-012", "STATUS-001", "SAFE-003", "SAFE-004"], "enforces raw request-target spelling and traversal safety", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const db = await openFsdb({ root: f.root }); t.after(() => db.close());
  const server = createServer(createFsdbHttpHandler(db));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  assert.match(await rawRequest(port, "http://localhost/fsdb/v1"), /^HTTP\/1\.1 400/);
  assert.match(await rawRequest(port, "*"), /^HTTP\/1\.1 400/);
  assert.match(await rawRequest(port, "/fsdb/v1#fragment"), /^HTTP\/1\.1 400/);
  const table = "%E8%A7%92%E8%89%B2";
  assert.match(await rawRequest(port, `/fsdb/v1/struct/${table}/%`), /^HTTP\/1\.1 400/);
  assert.match(await rawRequest(port, `/fsdb/v1/struct/${table}/%252F`), /^HTTP\/1\.1 404/);
  assert.match(await rawRequest(port, `/fsdb/v1/struct/${table}/%FF`), /^HTTP\/1\.1 400/);
  assert.match(await rawRequest(port, `/fsdb/v1/struct/${table}/%5C`), /^HTTP\/1\.1 400/);
  assert.match(await rawRequest(port, `/fsdb/v1/struct/${table}/%2E%2E`), /^HTTP\/1\.1 400/);
  assert.match(await rawRequest(port, `/fsdb/v1/struct/${table}/%E7%9A%AE%E5%8D%A1%E4%B8%98/`), /^HTTP\/1\.1 400/);
});

conformance(["MIME-002", "MIME-003", "MIME-004", "MIME-005"], "uses the frozen deterministic charset-free Resource MIME table", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const mapping = {
    avif: "image/avif", bmp: "image/bmp", css: "text/css", gif: "image/gif", html: "text/html",
    ico: "image/x-icon", jpeg: "image/jpeg", jpg: "image/jpeg", js: "text/javascript", mjs: "text/javascript",
    json: "application/json", md: "text/markdown", mp3: "audio/mpeg", mp4: "video/mp4", ogg: "audio/ogg",
    otf: "font/otf", png: "image/png", svg: "image/svg+xml", ttf: "font/ttf", txt: "text/plain",
    wasm: "application/wasm", wav: "audio/wav", webm: "video/webm", webp: "image/webp", woff: "font/woff",
    woff2: "font/woff2", unknown: "application/octet-stream",
  };
  let index = 0;
  for (const extension of Object.keys(mapping)) await writeFile(join(f.resource, `mime-${index++}.${extension}`), "x");
  const service = await serveFsdb({ root: f.root }); t.after(() => service.close());
  index = 0;
  for (const [extension, expected] of Object.entries(mapping)) {
    const response = await request(service.origin, `/fsdb/v1/resource/图片/mime-${index++}`);
    assert.equal(response.headers.get("content-type"), expected, extension);
    assert.equal(response.headers.get("content-type").includes("charset"), false, extension);
  }
});

conformance(["COND-001", "COND-002", "COND-003", "COND-004", "COND-005", "COND-006", "COND-007", "CACHE-002", "CACHE-005"], "implements snapshot validators, preconditions, ignored dates/ranges, and reopen", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const service = await serveFsdb({ root: f.root }); t.after(() => service.close());
  const path = "/fsdb/v1/struct/角色/皮卡丘";
  const first = await request(service.origin, path);
  const tag = first.headers.get("etag"); assert.match(tag, /^W\//);
  const notModified = await request(service.origin, path, { headers: { "If-None-Match": tag } });
  assert.equal(notModified.status, 304); assert.equal(notModified.headers.get("cache-control"), "no-cache");
  assert.equal(notModified.headers.get("etag"), tag); assert.equal(await notModified.text(), "");
  assert.equal((await request(service.origin, path, { headers: { "If-None-Match": `\"other\", ${tag}` } })).status, 304);
  assert.equal((await request(service.origin, path, { headers: { "If-None-Match": "*" } })).status, 304);
  assert.equal((await request(service.origin, path, { headers: { "If-Match": tag } })).status, 412);
  assert.equal((await request(service.origin, path, { headers: { "If-Match": "*" } })).status, 200);
  assert.equal((await request(service.origin, path, { headers: { "If-Modified-Since": "Wed, 31 Dec 2099 23:59:59 GMT" } })).status, 200);
  assert.equal((await request(service.origin, path, { headers: { "If-Unmodified-Since": "Wed, 01 Jan 1997 00:00:00 GMT" } })).status, 200);
  const ranged = await request(service.origin, path, { headers: { Range: "bytes=0-1" } });
  assert.equal(ranged.status, 200); assert.equal(await ranged.text(), "{\"name\":\"皮卡丘\"}");
  assert.equal((await request(service.origin, path, { headers: { Range: "bytes=0-1", "If-Range": tag } })).status, 200);
  await service.close();
  const reopened = await serveFsdb({ root: f.root }); t.after(() => reopened.close());
  const second = await request(reopened.origin, path);
  assert.notEqual(second.headers.get("etag"), tag);
});

conformance(["SAFE-005", "LIFE-002", "LIFE-003", "LIFE-007", "STATUS-006", "CACHE-004"], "makes replacement stale before preconditions and closes idempotently", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const db = await openFsdb({ root: f.root });
  const server = createServer(createFsdbHttpHandler(db));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const oldTag = (await request(`http://127.0.0.1:${port}`, "/fsdb/v1/struct/角色/皮卡丘")).headers.get("etag");
  const original = join(f.struct, "皮卡丘.json");
  const replacement = join(f.struct, "replacement.tmp");
  await writeFile(replacement, "{\"name\":\"changed\"}");
  await rename(replacement, original);
  assert.equal((await request(`http://127.0.0.1:${port}`, "/fsdb/v1/struct/角色/皮卡丘", { headers: { "If-None-Match": oldTag } })).status, 503);
  assert.equal(db.state, "stale");
  await Promise.all([db.close(), db.close()]);
  assert.equal(db.state, "closed");
});

conformance(["API-005", "API-007", "API-008", "API-009", "HTTP-014"], "owns standalone lifecycle and rejects CONNECT authority-form", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const service = await serveFsdb({ root: f.root });
  assert.equal(service.address.host, "127.0.0.1"); assert.ok(service.address.port > 0); assert.ok(service.origin);
  assert.equal("db" in service, false);
  assert.match(await rawRequest(service.address.port, "localhost:80", "CONNECT"), /^HTTP\/1\.1 400/);
  await new Promise((resolve) => service.server.close(resolve));
  await Promise.all([service.close(), service.close()]);
});

conformance(["API-004", "LIFE-004", "BOUNDARY-002"], "handler borrows db and new files stay invisible until reopen", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const db = await openFsdb({ root: f.root });
  const server = createServer(createFsdbHttpHandler(db));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  await new Promise((resolve) => server.close(resolve));
  assert.equal(db.state, "open");
  await writeFile(join(f.struct, "新增.json"), "{}");
  const secondServer = createServer(createFsdbHttpHandler(db));
  await new Promise((resolve) => secondServer.listen(0, "127.0.0.1", resolve));
  const { port } = secondServer.address();
  assert.equal((await request(`http://127.0.0.1:${port}`, "/fsdb/v1/struct/角色/新增")).status, 404);
  await new Promise((resolve) => secondServer.close(resolve)); await db.close();
  const reopened = await openFsdb({ root: f.root });
  const third = createServer(createFsdbHttpHandler(reopened));
  await new Promise((resolve) => third.listen(0, "127.0.0.1", resolve));
  const address = third.address();
  assert.equal((await request(`http://127.0.0.1:${address.port}`, "/fsdb/v1/struct/角色/新增")).status, 200);
  await new Promise((resolve) => third.close(resolve)); await reopened.close();
});

conformance(["LIFE-005", "LIFE-006", "LIFE-007", "LIFE-009"], "close drains admitted reads and client abort does not make source stale", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  await writeFile(join(f.resource, "large.bin"), Buffer.alloc(4 * 1024 * 1024, 0x61));
  const db = await openFsdb({ root: f.root });
  const server = createServer(createFsdbHttpHandler(db));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  await new Promise((resolve, reject) => {
    const req = httpGet(`http://127.0.0.1:${port}/fsdb/v1/resource/图片/large`, (res) => {
      res.once("data", () => req.destroy());
      res.once("close", resolve);
    });
    req.on("error", (error) => error.code === "ECONNRESET" ? undefined : reject(error));
  });
  assert.equal(db.state, "open");
  assert.equal((await request(`http://127.0.0.1:${port}`, "/fsdb/v1/struct/角色/皮卡丘")).status, 200);

  let finishResponse;
  const firstChunk = new Promise((resolve, reject) => {
    const req = httpGet(`http://127.0.0.1:${port}/fsdb/v1/resource/图片/large`, (res) => {
      res.once("data", () => { res.pause(); resolve(() => res.resume()); });
      finishResponse = new Promise((done) => res.on("end", done));
    });
    req.on("error", reject);
  });
  const resume = await firstChunk;
  let closed = false;
  const closing = db.close().then(() => { closed = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(db.state, "closed"); assert.equal(closed, false);
  resume(); await finishResponse; await closing;
  await db.close();
});

conformance(["HTTP-013", "STATUS-007", "RESP-003"], "request content is ignored and errors are body/path safe", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const service = await serveFsdb({ root: f.root }); t.after(() => service.close());
  const withBody = await new Promise((resolve, reject) => {
    const req = nodeRequest(new URL("/fsdb/v1/struct/角色/皮卡丘", service.origin), { method: "GET", headers: { "Content-Length": "7" } }, (res) => {
      let body = ""; res.setEncoding("utf8"); res.on("data", (chunk) => { body += chunk; }); res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject); req.end("ignored");
  });
  assert.equal(withBody.status, 200); assert.equal(withBody.body, "{\"name\":\"皮卡丘\"}");
  const headError = await request(service.origin, "/fsdb/v1/struct/角色/不存在", { method: "HEAD" });
  assert.equal(headError.status, 404); assert.equal(await headError.text(), "");
  const error = await request(service.origin, "/fsdb/v1/struct//bad");
  const body = await error.text(); assert.equal(body, ""); assert.equal(body.includes(f.parent), false);
});

conformance(["API-006"], "standalone listen failure rejects without retaining the owned server", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const blocker = createServer();
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => blocker.close(resolve)));
  const { port } = blocker.address();
  await assert.rejects(serveFsdb({ root: f.root, host: "127.0.0.1", port }));
  await new Promise((resolve) => blocker.close(resolve));
  const recovered = await serveFsdb({ root: f.root, host: "127.0.0.1", port });
  assert.equal(recovered.address.port, port);
  await recovered.close();
});

conformance(["API-009"], "wildcard bind reports address but no fabricated client origin", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const service = await serveFsdb({ root: f.root, host: "0.0.0.0" }); t.after(() => service.close());
  assert.equal(service.address.host, "0.0.0.0"); assert.ok(service.address.port > 0);
  assert.equal(service.origin, undefined);
});

conformance(["FDB-008", "FDB-011"], "validates JSON Schema roots and .extend.meta record fields", async (t) => {
  const invalidSchema = await fixture(); t.after(() => invalidSchema.cleanup());
  await writeFile(join(invalidSchema.struct, ".info.meta"), "42");
  await assert.rejects(openFsdb({ root: invalidSchema.root }));

  const invalidField = await fixture(); t.after(() => invalidField.cleanup());
  await writeFile(join(invalidField.root, "[extend]角色", ".extend.meta"), "{\"field\":1,\"struct\":\"角色\"}\n");
  await assert.rejects(openFsdb({ root: invalidField.root }));

  const invalidStruct = await fixture(); t.after(() => invalidStruct.cleanup());
  await writeFile(join(invalidStruct.root, "[extend]角色", ".extend.meta"), "{\"field\":\"角色\",\"struct\":\"é\",\"desc\":1}\n");
  await assert.rejects(openFsdb({ root: invalidStruct.root }));
});

conformance(["SAFE-006"], "uses the identical FileHandle for fstat validation and response streaming", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const db = await openFsdb({ root: f.root }); t.after(() => db.close());
  let fstatHandle;
  let streamHandle;
  const server = createServer(makeHandler(asDatabase(db), {
    onFstat(handle) { fstatHandle = handle; },
    onStream(handle) { streamHandle = handle; },
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  assert.equal((await request(`http://127.0.0.1:${port}`, "/fsdb/v1/struct/角色/皮卡丘")).status, 200);
  assert.ok(fstatHandle); assert.strictEqual(streamHandle, fstatHandle);
});

conformance(["LIFE-008"], "attributes a post-header source stream error to source drift and marks stale", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  const db = await openFsdb({ root: f.root }); t.after(() => db.close());
  const server = createServer(makeHandler(asDatabase(db), {
    createReadStream() {
      let sent = false;
      return new Readable({
        read() {
          if (sent) return;
          sent = true;
          this.push(Buffer.from([0]));
          queueMicrotask(() => this.destroy(Object.assign(new Error("injected source failure"), { code: "EIO" })));
        },
      });
    },
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    const req = httpGet(`http://127.0.0.1:${port}/fsdb/v1/resource/图片/关都地区/真新镇`, (res) => {
      res.on("data", () => undefined);
      res.once("aborted", resolve);
      res.once("error", (error) => error.code === "ECONNRESET" ? resolve() : reject(error));
      res.once("close", resolve);
    });
    req.on("error", (error) => error.code === "ECONNRESET" ? resolve() : reject(error));
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(db.state, "stale");
});

conformance(["API-007", "API-008", "LIFE-006"], "service.close waits for an already-started external server.close", async (t) => {
  const f = await fixture(); t.after(() => f.cleanup());
  await writeFile(join(f.resource, "close-race.bin"), Buffer.alloc(4 * 1024 * 1024, 0x61));
  const service = await serveFsdb({ root: f.root });
  let finishResponse;
  const firstChunk = new Promise((resolve, reject) => {
    const req = httpGet(new URL("/fsdb/v1/resource/图片/close-race", service.origin), (res) => {
      res.once("data", () => { res.pause(); resolve(() => res.resume()); });
      finishResponse = new Promise((done) => res.once("end", done));
    });
    req.on("error", reject);
  });
  const resume = await firstChunk;
  service.server.close();
  let closed = false;
  const closing = service.close().then(() => { closed = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(closed, false);
  resume(); await finishResponse; await closing;
});

conformance(["BOUNDARY-001", "BOUNDARY-003"], "has no runtime framework dependency or higher-layer authority", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.dependencies ?? {}, {});
  const source = await readFile(new URL("../src/public.ts", import.meta.url), "utf8");
  assert.equal(/express|koa|fastify|hono|installationId|game package/i.test(source), false);
});

nodeTest("every mandatory conformance ID is attached to an executable behavioral test", async () => {
  const contract = await readFile(new URL("../CONFORMANCE.md", import.meta.url), "utf8");
  const mandatory = new Set(contract.match(/(?:FDB|ROOT|SAFE|API|HTTP|STATUS|MIME|RESP|COND|CACHE|LIFE|BOUNDARY)-\d{3}/g));
  assert.deepEqual([...coveredConformance].sort(), [...mandatory].sort());
});
