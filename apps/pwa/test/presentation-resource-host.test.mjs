import assert from "node:assert/strict";
import test from "node:test";
import { createPresentationResourceClient, PresentationResourceError } from "../../../packages/renderer/dist/internal/presentation-resource-client.js";
import { createPwaRendererResourceClient } from "../dist/types/renderer-host.js";

const VERSION = `sha256:${"a".repeat(64)}`;
const OTHER = `sha256:${"b".repeat(64)}`;

function headers({ version = VERSION, mime = "text/plain", etag = `"${version}"` } = {}) {
  const value = new Headers();
  if (version !== null) value.set("x-loom-content-version", version);
  if (mime !== null) value.set("content-type", mime);
  if (etag !== null) value.set("etag", etag);
  return value;
}

function ok(body, fields) {
  return new Response(Buffer.from(body), { status: 200, headers: headers(fields) });
}

function problem(status) {
  return new Response("", { status, headers: headers({ version: null, mime: "application/problem+json", etag: null }) });
}

function bind(fetchImpl, lifetime = new AbortController()) {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    return fetchImpl(String(url), init, calls.length);
  };
  const client = createPresentationResourceClient(createPwaRendererResourceClient("demo", lifetime.signal), lifetime.signal);
  return {
    calls,
    client,
    lifetime,
    restore() { globalThis.fetch = previous; },
  };
}

async function codeOf(promise) {
  try {
    await promise;
  } catch (error) {
    assert.equal(error instanceof PresentationResourceError, true);
    return error.code;
  }
  assert.fail("expected PresentationResourceError");
}

test("PWA presentation resources keep Content problem codes through the façade", async () => {
  const routes = new Map([
    ["/databases/GameData/", "parent-logo"],
    ["/databases/ModData/", "mod-logo"],
  ]);
  const harness = bind((url) => {
    for (const [path, body] of routes) if (url.includes(path)) return ok(body);
    return problem(404);
  });
  try {
    const parent = await harness.client.resource("GameData", "resource.Assets", "logo", VERSION);
    const mod = await harness.client.resource("ModData", "resource.Assets", "logo", VERSION);
    assert.equal(new TextDecoder().decode(parent.bytes), "parent-logo");
    assert.equal(new TextDecoder().decode(mod.bytes), "mod-logo");
    assert.equal(parent.contentVersion, VERSION);
    assert.equal(harness.calls.some((url) => url.includes("/databases/GameData/$db/")), true);
    assert.equal(harness.calls.some((url) => url.includes("/databases/ModData/$db/")), true);
    parent.bytes[0] = 0;
    const again = await harness.client.resource("GameData", "resource.Assets", "logo", VERSION);
    assert.equal(again.bytes[0], "p".charCodeAt(0));
    assert.notEqual(parent.bytes, again.bytes);
    assert.equal(await codeOf(harness.client.resource("Missing", "resource.Assets", "logo", VERSION)), "CONTENT_NOT_FOUND");
    assert.equal(await codeOf(harness.client.resource("GameData", "resource.Assets", "logo", OTHER)), "CONTENT_CONFLICT");
  } finally {
    harness.restore();
  }
});

test("PWA presentation maps status, metadata, network, and cancellation", async () => {
  const cases = [
    { status: 409, code: "CONTENT_CONFLICT" },
    { status: 422, code: "CONTENT_INVALID" },
    { status: 503, code: "CONTENT_UNAVAILABLE" },
  ];
  for (const item of cases) {
    const harness = bind(() => problem(item.status));
    try {
      assert.equal(await codeOf(harness.client.resource("GameData", "resource.Assets", "logo", VERSION)), item.code);
    } finally {
      harness.restore();
    }
  }
  const missingVersion = bind(() => ok("logo", { version: null }));
  try {
    assert.equal(await codeOf(missingVersion.client.resource("GameData", "resource.Assets", "logo", VERSION)), "CONTENT_INVALID");
  } finally {
    missingVersion.restore();
  }
  const illegalVersion = bind(() => ok("logo", { version: "v1" }));
  try {
    assert.equal(await codeOf(illegalVersion.client.resource("GameData", "resource.Assets", "logo", VERSION)), "CONTENT_INVALID");
  } finally {
    illegalVersion.restore();
  }
  const missingEtag = bind(() => ok("logo", { etag: null }));
  try {
    assert.equal(await codeOf(missingEtag.client.resource("GameData", "resource.Assets", "logo", VERSION)), "CONTENT_INVALID");
  } finally {
    missingEtag.restore();
  }
  const missingMime = bind(() => ok("logo", { mime: null }));
  try {
    assert.equal(await codeOf(missingMime.client.resource("GameData", "resource.Assets", "logo", VERSION)), "CONTENT_INVALID");
  } finally {
    missingMime.restore();
  }
  const offline = bind(() => { throw new TypeError("network down"); });
  try {
    assert.equal(await codeOf(offline.client.resource("GameData", "resource.Assets", "logo", VERSION)), "CONTENT_UNAVAILABLE");
  } finally {
    offline.restore();
  }
  const cancelled = bind(() => ok("logo"));
  try {
    const signal = AbortSignal.abort();
    assert.equal(await codeOf(cancelled.client.resource("GameData", "resource.Assets", "logo", VERSION, { signal })), "CONTENT_CANCELLED");
    assert.equal(cancelled.calls.length, 0);
  } finally {
    cancelled.restore();
  }
  const tornDown = bind(() => ok("logo"));
  try {
    tornDown.lifetime.abort();
    assert.equal(await codeOf(tornDown.client.resource("GameData", "resource.Assets", "logo", VERSION)), "CONTENT_CANCELLED");
    assert.equal(tornDown.calls.length, 0);
  } finally {
    tornDown.restore();
  }
});
