import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class DeterministicRendererControlBinding {
  slot = null;
  acquire(token, signal) {
    assert.equal(this.slot, null, "only one slot may be armed");
    const result = deferred();
    const slot = { token, signal, result, bound: false };
    this.slot = slot;
    const abort = () => {
      if (this.slot === slot) this.slot = null;
      result.reject(signal.reason ?? new Error("aborted"));
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    return result.promise;
  }
  async candidate() {
    const pair = createMemoryCarrierPair();
    const slot = this.slot;
    if (slot === null || slot.bound) {
      await pair.left.close();
      return { accepted: false, renderer: pair.right, token: null };
    }
    slot.bound = true;
    this.slot = null;
    slot.result.resolve(pair.left);
    return { accepted: true, renderer: pair.right, token: slot.token };
  }
}

test("deterministic Binding creates no participant without a slot and binds exactly one candidate", async () => {
  const binding = new DeterministicRendererControlBinding();
  const noSlot = await binding.candidate();
  assert.equal(noSlot.accepted, false);
  assert.deepEqual(await noSlot.renderer.closed, { kind: "closed" });

  const controller = new AbortController();
  const acquired = binding.acquire("token", controller.signal);
  const first = await binding.candidate();
  assert.equal(first.accepted, true);
  assert.equal(first.token, "token");
  assert.ok(await acquired);
  const extra = await binding.candidate();
  assert.equal(extra.accepted, false);
});

test("deterministic Binding abort cancellation cannot yield a late live carrier", async () => {
  const binding = new DeterministicRendererControlBinding();
  const controller = new AbortController();
  const acquired = binding.acquire("token", controller.signal);
  controller.abort(new Error("session ended"));
  await assert.rejects(acquired);
  const late = await binding.candidate();
  assert.equal(late.accepted, false);
  assert.deepEqual(await late.renderer.closed, { kind: "closed" });
});
