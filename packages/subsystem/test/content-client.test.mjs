import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { ContentReadError } from "../dist/index.js";
import { createBoundContentClient } from "../dist/host/index.js";

const recordBytes = Buffer.from('{"hero":{"name":"Pika"}}');
const resourceBytes = Buffer.from([1, 2, 3, 255]);
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

async function serverFixture() {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    if (req.headers.authorization !== "Bearer test_token_abcdefghijklmnopqrstuvwxyz") { res.statusCode = 401; return res.end(); }
    if (req.url.endsWith("/missing")) { res.statusCode = 404; return res.end(); }
    if (req.url.endsWith("/conflict")) { res.statusCode = 409; return res.end(); }
    if (req.url.endsWith("/invalid")) { res.statusCode = 422; return res.end(); }
    const bytes = req.url.includes("/records/") ? recordBytes : resourceBytes;
    const version = hash(bytes);
    res.setHeader("Content-Type", req.url.includes("/records/") ? "application/json; charset=utf-8" : "image/png");
    res.setHeader("X-Loom-Content-Version", version);
    res.setHeader("ETag", `"${version}"`);
    res.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { requests, origin: `http://127.0.0.1:${port}/`, close: () => new Promise((resolve) => server.close(resolve)) };
}

function client(origin, lifetime = new AbortController()) {
  return { lifetime, value: createBoundContentClient({ origin, installationId: "installation", token: "test_token_abcdefghijklmnopqrstuvwxyz" }, lifetime.signal) };
}

test("ContentReadError and author surface have the exact frozen shape", () => {
  const error = new ContentReadError("CONTENT_NOT_FOUND");
  assert.equal(error.name, "ContentReadError");
  assert.equal(error.code, "CONTENT_NOT_FOUND");
  assert.equal(typeof error.message, "string");
  assert.deepEqual(Object.keys(client("http://127.0.0.1:1/").value).sort(), ["record", "resource"]);
});

test("local validation is synchronous and starts zero HTTP requests", async (t) => {
  const fixture = await serverFixture(); t.after(() => fixture.close());
  const content = client(fixture.origin).value;
  assert.throws(() => content.record("bad/name", "key"), TypeError);
  assert.throws(() => content.resource("resource.images", "../secret"), TypeError);
  assert.throws(() => content.record("struct.hero", "hero", null), TypeError);
  assert.throws(() => content.record("struct.hero", "hero", { unknown: true }), TypeError);
  assert.throws(() => content.record("struct.hero", "hero", { signal: {} }), TypeError);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(content.record("struct.hero", "hero", { signal: controller.signal }), (error) => error instanceof ContentReadError && error.code === "CONTENT_CANCELLED");
  assert.equal(fixture.requests.length, 0);
});

test("record/resource reads map errors, versions, hierarchy, cancellation, and value ownership", async (t) => {
  const fixture = await serverFixture(); t.after(() => fixture.close());
  const bound = client(fixture.origin);
  const first = await bound.value.record("struct.hero", "hero");
  assert.deepEqual(first.value, { hero: { name: "Pika" } });
  assert.equal(first.contentVersion, hash(recordBytes));
  try { first.value.hero.name = "poison"; } catch {}
  assert.deepEqual((await bound.value.record("struct.hero", "hero")).value, { hero: { name: "Pika" } });

  const resource = await bound.value.resource("resource.images", "ui/icons/potion");
  assert.deepEqual([...resource.bytes], [...resourceBytes]);
  assert.equal(resource.mime, "image/png");
  resource.bytes[0] = 99;
  assert.deepEqual([...(await bound.value.resource("resource.images", "ui/icons/potion")).bytes], [...resourceBytes]);
  assert.ok(fixture.requests.some((path) => path.endsWith("/resources/resource.images/ui/icons/potion")));

  await assert.rejects(bound.value.record("struct.hero", "missing"), (error) => error.code === "CONTENT_NOT_FOUND");
  await assert.rejects(bound.value.record("struct.hero", "conflict"), (error) => error.code === "CONTENT_CONFLICT");
  await assert.rejects(bound.value.record("struct.hero", "invalid"), (error) => error.code === "CONTENT_INVALID");
  bound.lifetime.abort();
  await assert.rejects(bound.value.record("struct.hero", "hero"), (error) => error.code === "CONTENT_CANCELLED");
});
