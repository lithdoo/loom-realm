import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { ContentReadError } from "../dist/index.js";
import { createBoundContentClient, createSameOriginContentClient } from "../dist/host/index.js";

const recordBytes = Buffer.from('{"hero":{"name":"Pika"}}');
const groupBytes = Buffer.from('{"hero":"hero"}\n{"party":["闪光","伙伴"]}\n');
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
    const isRecord = req.url.includes("/records/");
    const isGroup = req.url.includes("/groups/");
    if (isGroup && req.url.endsWith("/bad-mime")) {
      const version = hash(groupBytes);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("X-Loom-Content-Version", version);
      res.setHeader("ETag", `"${version}"`);
      return res.end(groupBytes);
    }
    if (isGroup && req.url.endsWith("/bad-rows")) {
      const version = hash(groupBytes);
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("X-Loom-Content-Version", version);
      res.setHeader("ETag", `"${version}"`);
      return res.end('{"id":1}\nnot-json\n');
    }
    if (isGroup && req.url.endsWith("/bad-version")) {
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      return res.end(groupBytes);
    }
    if (isGroup && req.url.endsWith("/blank-lines")) {
      const bytes = Buffer.from('{"a":1}\n\n{"b":2}\n\n');
      const version = hash(bytes);
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("X-Loom-Content-Version", version);
      res.setHeader("ETag", `"${version}"`);
      return res.end(bytes);
    }
    if (isGroup && req.url.endsWith("/empty")) {
      const version = hash(Buffer.alloc(0));
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("X-Loom-Content-Version", version);
      res.setHeader("ETag", `"${version}"`);
      return res.end();
    }
    const bytes = isRecord ? recordBytes : isGroup ? groupBytes : resourceBytes;
    const version = hash(bytes);
    res.setHeader("Content-Type", isRecord ? "application/json; charset=utf-8" : isGroup ? "application/x-ndjson; charset=utf-8" : "image/png");
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
  assert.deepEqual(Object.keys(client("http://127.0.0.1:1/").value).sort(), ["group", "record", "resource"]);
});

test("local validation is synchronous and starts zero HTTP requests", async (t) => {
  const fixture = await serverFixture(); t.after(() => fixture.close());
  const content = client(fixture.origin).value;
  assert.throws(() => content.record("bad/name", "key"), TypeError);
  assert.throws(() => content.resource("resource.images", "../secret"), TypeError);
  assert.throws(() => content.record("struct.hero", "hero", null), TypeError);
  assert.throws(() => content.record("struct.hero", "hero", { unknown: true }), TypeError);
  assert.throws(() => content.record("struct.hero", "hero", { signal: {} }), TypeError);
  assert.throws(() => content.group("bad/group", "key"), TypeError);
  assert.throws(() => content.group("group.party", "hierarchical/keys"), TypeError);
  assert.throws(() => content.group("group.party", ".."), TypeError);
  assert.throws(() => content.group("group.party", "party", { unknown: true }), TypeError);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(content.record("struct.hero", "hero", { signal: controller.signal }), (error) => error instanceof ContentReadError && error.code === "CONTENT_CANCELLED");
  await assert.rejects(content.group("group.party", "party", { signal: controller.signal }), (error) => error instanceof ContentReadError && error.code === "CONTENT_CANCELLED");
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

test("group reads preserve JSONL row order, version bytes, strict NDJSON shape, and error mapping", async (t) => {
  const fixture = await serverFixture(); t.after(() => fixture.close());
  const bound = client(fixture.origin);

  const party = await bound.value.group("group.party", "party");
  assert.deepEqual(party.rows, [{ hero: "hero" }, { party: ["闪光", "伙伴"] }]);
  assert.equal(party.contentVersion, hash(groupBytes));
  assert.ok(fixture.requests.some((path) => path.endsWith("/groups/group.party/party")));

  assert.throws(() => party.rows.push({ injected: true }), TypeError);
  try { party.rows[0].hero = "poison"; } catch {}
  assert.deepEqual((await bound.value.group("group.party", "party")).rows, [{ hero: "hero" }, { party: ["闪光", "伙伴"] }]);

  const empty = await bound.value.group("group.party", "empty");
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.contentVersion, hash(Buffer.alloc(0)));

  const blankLines = await bound.value.group("group.party", "blank-lines");
  assert.deepEqual(blankLines.rows, [{ a: 1 }, { b: 2 }]);

  await assert.rejects(bound.value.group("group.party", "missing"), (error) => error.code === "CONTENT_NOT_FOUND");
  await assert.rejects(bound.value.group("group.party", "conflict"), (error) => error.code === "CONTENT_CONFLICT");
  await assert.rejects(bound.value.group("group.party", "invalid"), (error) => error.code === "CONTENT_INVALID");
  await assert.rejects(bound.value.group("group.party", "bad-mime"), (error) => error.code === "CONTENT_INVALID");
  await assert.rejects(bound.value.group("group.party", "bad-rows"), (error) => error.code === "CONTENT_INVALID");
  await assert.rejects(bound.value.group("group.party", "bad-version"), (error) => error.code === "CONTENT_INVALID");

  bound.lifetime.abort();
  await assert.rejects(bound.value.group("group.party", "party"), (error) => error.code === "CONTENT_CANCELLED");
});

test("same-origin PWA Content client shares decoding semantics and never sends bearer auth", async () => {
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  const originalFetch = globalThis.fetch;
  const observed = [];
  Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("https://game.test/app") });
  globalThis.fetch = async (url, init) => {
    observed.push({ url: String(url), headers: init?.headers ?? {} });
    if (String(url).includes("/groups/")) {
      const version = hash(groupBytes);
      return new Response(groupBytes, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "X-Loom-Content-Version": version, ETag: `"${version}"` } });
    }
    const version = hash(recordBytes);
    return new Response(recordBytes, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "X-Loom-Content-Version": version, ETag: `"${version}"` } });
  };
  try {
    const lifetime = new AbortController();
    const content = createSameOriginContentClient({ installationId: "installation" }, lifetime.signal);
    assert.deepEqual((await content.record("struct.hero", "hero")).value, { hero: { name: "Pika" } });
    assert.equal(observed[0].url, "https://game.test/_lr/v1/games/installation/records/struct.hero/hero");
    const party = await content.group("group.party", "party");
    assert.deepEqual(party.rows, [{ hero: "hero" }, { party: ["闪光", "伙伴"] }]);
    assert.equal(party.contentVersion, hash(groupBytes));
    assert.equal(observed[1].url, "https://game.test/_lr/v1/games/installation/groups/group.party/party");
    Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("https://game.test/pwa/pokeman/worker-runner.js") });
    observed.length = 0;
    await createSameOriginContentClient({ installationId: "installation" }, lifetime.signal).record("struct.hero", "hero");
    assert.equal(observed[0].url, "https://game.test/pwa/pokeman/_lr/v1/games/installation/records/struct.hero/hero");
    assert.deepEqual(observed[0].headers, {});
    assert.throws(() => createSameOriginContentClient({ installationId: "installation", token: "forbidden" }, lifetime.signal), TypeError);
  } finally {
    globalThis.fetch = originalFetch;
    if (locationDescriptor) Object.defineProperty(globalThis, "location", locationDescriptor);
    else delete globalThis.location;
  }
});
