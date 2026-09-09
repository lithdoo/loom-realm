import assert from "node:assert/strict";
import test from "node:test";
import {
  createPresentationResourceClient,
  PresentationResourceError,
} from "../dist/internal/presentation-resource-client.js";
import { RendererResourceError } from "../dist/internal/resource-client.js";

const version = `sha256:${"b".repeat(64)}`;

test("presentation resource façade maps errors and returns caller-owned bytes", async () => {
  const source = new Uint8Array([1, 2, 3]);
  const lifetime = new AbortController();
  const client = createPresentationResourceClient({
    async resource(namespace, key, expected) {
      assert.deepEqual([namespace, key, expected], ["images", "icons/a.png", version]);
      return { bytes: source, mime: "image/png", contentVersion: version };
    },
  }, lifetime.signal);
  const first = await client.resource("images", "icons/a.png", version);
  first.bytes[0] = 9;
  const second = await client.resource("images", "icons/a.png", version);
  assert.deepEqual([...second.bytes], [1, 2, 3]);
  assert.notEqual(first.bytes, source);

  for (const [internal, external] of [
    ["not-found", "CONTENT_NOT_FOUND"],
    ["conflict", "CONTENT_CONFLICT"],
    ["invalid", "CONTENT_INVALID"],
    ["unavailable", "CONTENT_UNAVAILABLE"],
    ["cancelled", "CONTENT_CANCELLED"],
  ]) {
    const failing = createPresentationResourceClient({ async resource() { throw new RendererResourceError(internal); } }, lifetime.signal);
    await assert.rejects(failing.resource("images", "icons/a.png", version), (error) => error.code === external);
  }
});

test("presentation resource lifetime and caller cancellation both close reads", async () => {
  for (const owner of ["caller", "lifetime"]) {
    const lifetime = new AbortController();
    const caller = new AbortController();
    const client = createPresentationResourceClient({
      resource(namespace, key, expected, signal) {
        return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new RendererResourceError("cancelled")), { once: true }));
      },
    }, lifetime.signal);
    const pending = client.resource("images", "icons/a.png", version, { signal: caller.signal });
    (owner === "caller" ? caller : lifetime).abort();
    await assert.rejects(pending, (error) => error instanceof PresentationResourceError && error.code === "CONTENT_CANCELLED");
  }
});

test("post-teardown well-formed reads cancel before the private client is called", async () => {
  const lifetime = new AbortController();
  let calls = 0;
  const client = createPresentationResourceClient({ async resource() { calls += 1; throw new Error(); } }, lifetime.signal);
  lifetime.abort();
  await assert.rejects(client.resource("images", "icons/a.png", version), (error) => error.code === "CONTENT_CANCELLED");
  assert.equal(calls, 0);
});

test("malformed signal-like input is rejected before the private client is called", async () => {
  const lifetime = new AbortController();
  let calls = 0;
  const client = createPresentationResourceClient({ async resource() { calls += 1; throw new Error(); } }, lifetime.signal);
  const malformed = { aborted: false, addEventListener() {} };
  await assert.rejects(
    client.resource("images", "icons/a.png", version, { signal: malformed }),
    (error) => error instanceof PresentationResourceError && error.code === "CONTENT_INVALID",
  );
  assert.equal(calls, 0);
});
