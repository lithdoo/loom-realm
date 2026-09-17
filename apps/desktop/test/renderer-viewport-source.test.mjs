import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopRendererViewportSource } from "../dist/renderer-viewport-source.js";

class Events {
  listeners = new Map();
  addEventListener = (name, listener) => {
    const values = this.listeners.get(name) ?? new Set(); values.add(listener); this.listeners.set(name, values);
  };
  removeEventListener = (name, listener) => this.listeners.get(name)?.delete(listener);
  dispatch(name, event = {}) { for (const listener of this.listeners.get(name) ?? []) listener({ type: name, ...event }); }
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
    innerWidth: 640.9,
    innerHeight: 480.2,
    devicePixelRatio: 1,
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    dispatch: events.dispatch.bind(events),
    runFrame() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); },
  };
}

test("Desktop viewport source samples document layout viewport, resamples visible, and ignores DPR-only", () => {
  const window = fakeWindow();
  const samples = [];
  const source = createDesktopRendererViewportSource(window);
  const stop = source.start((sample) => samples.push({ ...sample }));
  assert.deepEqual(samples, [{ width: 640.9, height: 480.2 }]);
  assert.throws(() => source.start(() => {}), /already started/);

  window.innerWidth = 800;
  window.innerHeight = 600;
  window.dispatch("resize");
  assert.equal(samples.length, 1);
  window.runFrame();
  assert.deepEqual(samples.at(-1), { width: 800, height: 600 });

  window.devicePixelRatio = 2;
  window.dispatch("resize");
  window.runFrame();
  assert.equal(samples.length, 2);

  window.document.visibilityState = "hidden";
  window.document.dispatch("visibilitychange");
  assert.equal(samples.length, 2);
  window.document.visibilityState = "visible";
  window.innerWidth = 1024;
  window.innerHeight = 768;
  window.document.dispatch("visibilitychange");
  assert.deepEqual(samples.at(-1), { width: 1024, height: 768 });

  const before = samples.length;
  stop();
  window.innerWidth = 10;
  window.innerHeight = 10;
  window.dispatch("resize");
  window.runFrame();
  window.document.dispatch("visibilitychange");
  assert.equal(samples.length, before);
});

test("Desktop viewport source coalesces a resize burst to the last size and drops late rAF after stop", () => {
  const window = fakeWindow();
  const samples = [];
  const source = createDesktopRendererViewportSource(window);
  const stop = source.start((sample) => samples.push({ ...sample }));
  assert.equal(samples.length, 1);

  window.innerWidth = 700;
  window.innerHeight = 500;
  window.dispatch("resize");
  window.innerWidth = 900;
  window.innerHeight = 700;
  window.dispatch("resize");
  window.innerWidth = 1280;
  window.innerHeight = 720;
  window.dispatch("resize");
  assert.equal(samples.length, 1);
  window.runFrame();
  assert.deepEqual(samples.at(-1), { width: 1280, height: 720 });
  assert.equal(samples.length, 2);

  window.dispatch("resize");
  stop();
  window.innerWidth = 320;
  window.innerHeight = 240;
  window.runFrame();
  assert.equal(samples.length, 2);
});
