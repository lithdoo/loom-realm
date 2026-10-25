import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserRendererViewportSource } from "../dist/browser-window.js";

class Events {
  listeners = new Map();
  addEventListener = (name, listener) => {
    const values = this.listeners.get(name) ?? new Set();
    values.add(listener);
    this.listeners.set(name, values);
  };
  removeEventListener = (name, listener) => this.listeners.get(name)?.delete(listener);
  dispatch(name, event = {}) {
    for (const listener of this.listeners.get(name) ?? []) listener({ type: name, ...event });
  }
}

function fakeWindow() {
  const events = new Events();
  const document = new Events();
  document.visibilityState = "visible";
  let nextFrame = 0;
  const frames = new Map();
  return {
    ...events,
    document,
    innerWidth: 200,
    innerHeight: 100,
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    dispatch: events.dispatch.bind(events),
    runFrame() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); },
  };
}

test("shared browser viewport preserves layout viewport semantics and coalesces resize", () => {
  const window = fakeWindow();
  window.innerWidth = 640.5;
  window.innerHeight = 480.25;
  const samples = [];
  const stop = createBrowserRendererViewportSource(window).start((sample) => samples.push(sample));
  assert.deepEqual(samples, [{ width: 640.5, height: 480.25 }]);
  window.innerWidth = 800;
  window.dispatch("resize");
  window.innerWidth = 900;
  window.dispatch("resize");
  window.runFrame();
  assert.deepEqual(samples.at(-1), { width: 900, height: 480.25 });
  window.document.visibilityState = "hidden";
  window.document.dispatch("visibilitychange");
  assert.equal(samples.length, 2);
  window.document.visibilityState = "visible";
  window.document.dispatch("visibilitychange");
  assert.equal(samples.length, 3);
  stop();
});
