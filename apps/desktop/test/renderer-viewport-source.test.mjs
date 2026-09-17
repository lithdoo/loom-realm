import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopRendererViewportSource } from "../dist/renderer-viewport-source.js";

class FakeWindow {
  innerWidth = 640;
  innerHeight = 480;
  listeners = new Map();
  document = {
    visibilityState: "visible",
    listeners: new Map(),
    addEventListener: (name, listener) => {
      const values = this.document.listeners.get(name) ?? new Set();
      values.add(listener);
      this.document.listeners.set(name, values);
    },
    removeEventListener: (name, listener) => {
      this.document.listeners.get(name)?.delete(listener);
    },
  };
  addEventListener = (name, listener) => {
    const values = this.listeners.get(name) ?? new Set();
    values.add(listener);
    this.listeners.set(name, values);
  };
  removeEventListener = (name, listener) => {
    this.listeners.get(name)?.delete(listener);
  };
  dispatch(name) {
    for (const listener of this.listeners.get(name) ?? []) listener({ type: name });
  }
  dispatchDocument(name) {
    for (const listener of this.document.listeners.get(name) ?? []) listener({ type: name });
  }
}

test("document layout viewport source samples innerWidth/innerHeight initially and on resize", () => {
  const window = new FakeWindow();
  const source = createDesktopRendererViewportSource(window);
  const samples = [];
  const stop = source.start((sample) => samples.push({ ...sample }));
  assert.deepEqual(samples, [{ width: 640, height: 480 }]);
  window.innerWidth = 800.9;
  window.innerHeight = 600.2;
  window.dispatch("resize");
  assert.deepEqual(samples, [{ width: 640, height: 480 }, { width: 800.9, height: 600.2 }]);
  // Same CSS logical size (e.g. DPR-only change): source re-reports; equal
  // suppression happens downstream at the holder/publisher.
  window.dispatch("resize");
  assert.equal(samples.length, 3);
  stop();
  window.innerWidth = 42;
  window.dispatch("resize");
  assert.equal(samples.length, 3);
});

test("visibility recovery resamples only when returning to visible", () => {
  const window = new FakeWindow();
  const source = createDesktopRendererViewportSource(window);
  const samples = [];
  const stop = source.start((sample) => samples.push({ ...sample }));
  assert.equal(samples.length, 1);
  window.document.visibilityState = "hidden";
  window.innerWidth = 1024;
  window.innerHeight = 768;
  window.dispatchDocument("visibilitychange");
  assert.equal(samples.length, 1);
  window.document.visibilityState = "visible";
  window.dispatchDocument("visibilitychange");
  assert.deepEqual(samples[1], { width: 1024, height: 768 });
  stop();
});

test("stop removes listeners and source guards its contract", () => {
  const window = new FakeWindow();
  const source = createDesktopRendererViewportSource(window);
  const stop = source.start(() => {});
  assert.equal(window.listeners.get("resize")?.size, 1);
  assert.equal(window.document.listeners.get("visibilitychange")?.size, 1);
  stop();
  stop();
  assert.equal(window.listeners.get("resize")?.size ?? 0, 0);
  assert.equal(window.document.listeners.get("visibilitychange")?.size ?? 0, 0);
  assert.throws(() => source.start(null), /Invalid Desktop viewport sink/);
  assert.throws(() => createDesktopRendererViewportSource(null), /Invalid Desktop viewport Window/);
  const restarted = source.start(() => {});
  restarted();
});
