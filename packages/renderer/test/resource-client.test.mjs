import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { createRendererResourceClient, RendererResourceError } from "../dist/internal/resource-client.js";

const bodies = new Map([
  ["v1", Buffer.from([1, 2, 3])],
  ["v2", Buffer.from([4, 5, 6])],
]);
const version = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

async function fixture() {
  let current = "v1";
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    if (req.headers.authorization !== "Bearer renderer_token") { res.statusCode = 401; return res.end(); }
    if (req.url.endsWith("/missing")) { res.statusCode = 404; return res.end(); }
    const bytes = bodies.get(current);
    const observed = version(bytes);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("X-Loom-Content-Version", observed);
    res.setHeader("ETag", `"${observed}"`);
    res.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}/`, get requests() { return requests; }, setCurrent(value) { current = value; }, close: () => new Promise((resolve) => server.close(resolve)) };
}

test("Renderer resource client validates locally before HTTP", async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const lifetime = new AbortController();
  const client = createRendererResourceClient({ origin: f.origin, installationId: "installation", token: "renderer_token" }, lifetime.signal);
  assert.throws(() => client.resource("bad/name", "key", version(bodies.get("v1"))), TypeError);
  assert.throws(() => client.resource("resource.images", "../key", version(bodies.get("v1"))), TypeError);
  assert.throws(() => client.resource("resource.images", "key", "bad-version"), TypeError);
  assert.equal(f.requests, 0);
  lifetime.abort();
  await assert.rejects(client.resource("resource.images", "key", version(bodies.get("v1"))), (error) => error instanceof RendererResourceError && error.code === "cancelled");
  assert.equal(f.requests, 0);
});

test("expected version, hierarchical routing, and immutable cache identity are enforced", async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const client = createRendererResourceClient({ origin: f.origin, installationId: "installation", token: "renderer_token" }, new AbortController().signal);
  const v1 = version(bodies.get("v1"));
  const first = await client.resource("resource.images", "ui/icons/potion", v1);
  assert.deepEqual([...first.bytes], [1, 2, 3]);
  assert.equal(first.contentVersion, v1);
  first.bytes[0] = 99;
  assert.deepEqual([...(await client.resource("resource.images", "ui/icons/potion", v1)).bytes], [1, 2, 3]);
  assert.equal(f.requests, 1);

  f.setCurrent("v2");
  const v2 = version(bodies.get("v2"));
  const second = await client.resource("resource.images", "ui/icons/potion", v2);
  assert.deepEqual([...second.bytes], [4, 5, 6]);
  assert.equal(f.requests, 2);
  await assert.rejects(client.resource("resource.images", "other", v1), (error) => error.code === "conflict");
  await assert.rejects(client.resource("resource.images", "missing", v2), (error) => error.code === "not-found");
});

test("client captures native fetch before business globals can be replaced", async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const client = createRendererResourceClient(
    { origin: f.origin, installationId: "installation", token: "renderer_token" },
    new AbortController().signal,
  );
  const nativeFetch = globalThis.fetch;
  let intercepted = 0;
  globalThis.fetch = async () => { intercepted++; throw new Error("business fetch replacement"); };
  try {
    const resource = await client.resource("resource.images", "captured", version(bodies.get("v1")));
    assert.deepEqual([...resource.bytes], [1, 2, 3]);
    assert.equal(intercepted, 0);
  } finally {
    globalThis.fetch = nativeFetch;
  }
});
