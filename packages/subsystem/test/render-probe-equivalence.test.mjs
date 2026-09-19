/**
 * Equivalence proof for the safe RenderManager probe optimization: validated
 * depth and serialization match Wire without invoking inherited toJSON.
 * Domain accept/reject, error class, and snapshot immutability stay unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertJsonValue,
  isJsonValue,
  jsonDepth,
  stringifyJson,
  utf8ByteLength,
} from "@loomrealm/wire";
import { RenderManager } from "../dist/internal/render-manager.js";

const MAX_DATA_BYTES = 262_144;
const MAX_MESSAGE_BYTES = 1_048_576;
const PROBE_DOMAIN_ID = "d".repeat(128);

const PRIMITIVES = [
  null, true, false, 0, -0, 1, -1, 0.5, -0.5, 1e308, 5e-324, Number.MAX_VALUE,
  "", "a", "中", "文", "😀", "ab😀cd", "\"quoted\"", "back\\slash", "tab\tnew\nline",
  "\u0000", "\u001f", "\u007f", "日本語",
  "key with spaces", "0", "-0", "1e2", "4294967295",
];

let seed = 0x2f6e2b1;
function random() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function randomValid(depth, breadth) {
  const pick = random();
  if (depth <= 0 || pick < 0.45) {
    return PRIMITIVES[Math.floor(random() * PRIMITIVES.length)];
  }
  if (pick < 0.75) {
    const length = Math.floor(random() * breadth);
    const array = [];
    for (let index = 0; index < length; index += 1) {
      array.push(randomValid(depth - 1, breadth));
    }
    return array;
  }
  const object = Object.create(random() < 0.1 ? null : Object.prototype);
  const count = Math.floor(random() * breadth);
  for (let index = 0; index < count; index += 1) {
    const key = PRIMITIVES[Math.floor(random() * PRIMITIVES.length)];
    if (typeof key !== "string") continue;
    object[key] = randomValid(depth - 1, breadth);
  }
  return object;
}

function depthOfValidated(value) {
  let maximum = 0;
  const stack = [{ value, depth: 0 }];
  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined || entry.value === null || typeof entry.value !== "object") continue;
    const containerDepth = entry.depth + 1;
    if (containerDepth > maximum) maximum = containerDepth;
    if (Array.isArray(entry.value)) {
      for (let index = 0; index < entry.value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(entry.value, String(index));
        assert.ok(descriptor && "value" in descriptor);
        stack.push({ value: descriptor.value, depth: containerDepth });
      }
    } else {
      for (const key of Object.keys(entry.value)) {
        const descriptor = Object.getOwnPropertyDescriptor(entry.value, key);
        assert.ok(descriptor && "value" in descriptor);
        stack.push({ value: descriptor.value, depth: containerDepth });
      }
    }
  }
  return maximum;
}

function node(data = {}, children = []) {
  return { key: "k", tag: "t", attrs: {}, data, children };
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

test("3,000 valid JSON values preserve depth and serialized byte equivalence", () => {
  for (let iteration = 0; iteration < 3000; iteration += 1) {
    const value = randomValid(6, 6);
    assertJsonValue(value);
    assert.equal(
      JSON.stringify(value),
      stringifyJson(value),
      `iteration ${iteration}: ${JSON.stringify(value).slice(0, 120)}`,
    );
    assert.equal(depthOfValidated(value), jsonDepth(value), `depth mismatch at iteration ${iteration}`);
    assert.equal(utf8ByteLength(JSON.stringify(value)), utf8ByteLength(stringifyJson(value)));
  }
});

test("boundary fixtures: empty structures, deep chains, integer-like key ordering, unicode", () => {
  const fixtures = [
    {}, [], { "": null }, [[]], { a: [] },
    JSON.parse('{"1":1,"0":0,"b":2,"a":1}'),
    (() => {
      const object = {};
      object["2"] = "x";
      object["10"] = "y";
      object["b"] = "z";
      object["a"] = "w";
      return object;
    })(),
    { nested: { deep: { deeper: { deepest: ["😀", "中文", "\u0000"] } } } },
    { "-0": -0, num: -0 },
    Object.assign(Object.create(null), { proto: "null", works: true }),
  ];
  for (const depth of [63, 64, 65]) {
    let value = 0;
    for (let index = 0; index < depth; index += 1) value = { child: value };
    fixtures.push(value);
  }
  for (const fixture of fixtures) {
    assertJsonValue(fixture);
    assert.equal(JSON.stringify(fixture), stringifyJson(fixture), JSON.stringify(fixture).slice(0, 120));
    assert.equal(depthOfValidated(fixture), jsonDepth(fixture));
  }
  const nested64 = fixtures.at(-2);
  const nested65 = fixtures.at(-1);
  assert.equal(jsonDepth(nested64), 64);
  assert.equal(jsonDepth(nested65), 65);
  assert.ok(jsonDepth(nested64) <= 64);
  assert.ok(jsonDepth(nested65) > 64);
});

test("reject-set parity: every invalid value still throws TypeError through the domain path", () => {
  function sparse() {
    const array = [1];
    array[3] = 2;
    return array;
  }
  function cyclic() {
    const object = { self: null };
    object.self = object;
    return object;
  }
  const invalid = [
    undefined, NaN, Infinity, -Infinity, 10n, Symbol("x"), () => {}, sparse(),
    { u: undefined }, { s: Symbol("x") }, { get a() { return 1; } },
    Object.assign([], { extra: 1 }), { [Symbol("k")]: 1 },
    new Number(1), new String("x"), cyclic(),
    { toJSON: () => 1 },
  ];
  for (const value of invalid) {
    assert.equal(isJsonValue(value), false, `expected invalid: ${String(value)}`);
    const manager = new RenderManager();
    const domain = manager.createDomain({ zIndex: 0, roots: [node()] });
    assert.throws(
      () => domain.replace({ zIndex: 0, roots: [node({ bad: value })] }),
      (error) => error instanceof TypeError && /must be plain JSON/.test(error.message),
      `expected domain reject: ${String(value)}`,
    );
    assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].data.bad, undefined);
  }
});

test("depth and byte limits still reject at exactly the same boundaries", () => {
  const manager = new RenderManager();
  const domain = manager.createDomain({ zIndex: 0, roots: [node()] });
  const deep = (count) => {
    let value = 1;
    for (let index = 0; index < count; index += 1) value = [value];
    return value;
  };
  // Node-data depth: {d: deep(n)} has jsonDepth n+1. MAX_DATA_DEPTH is 32.
  domain.replace({ zIndex: 0, roots: [node({ d: deep(31) })] });
  assert.equal(jsonDepth({ d: deep(31) }), 32);
  assert.equal(jsonDepth({ d: deep(32) }), 33);
  assert.throws(() => domain.replace({ zIndex: 0, roots: [node({ d: deep(32) })] }), RangeError);
  assert.throws(() => domain.replace({ zIndex: 0, roots: [node({ d: deep(33) })] }), RangeError);
  assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].data.d.length, 1);

  const dataBytes = (count) => utf8ByteLength(stringifyJson({ s: "x".repeat(count) }));
  const exact = MAX_DATA_BYTES - dataBytes(0);
  assert.equal(dataBytes(exact), MAX_DATA_BYTES);
  assert.ok(dataBytes(exact + 1) > MAX_DATA_BYTES);
  domain.replace({ zIndex: 0, roots: [node({ s: "x".repeat(exact) })] });
  assert.throws(() => domain.replace({ zIndex: 0, roots: [node({ s: "x".repeat(exact + 1) })] }), RangeError);
  assert.throws(() => domain.replace({ zIndex: 0, roots: [node({ s: "x".repeat(300_000) })] }), RangeError);
  assert.equal(JSON.stringify({ z: -0 }), stringifyJson({ z: -0 }));
  assert.equal(JSON.stringify({ z: -0 }), '{"z":0}');
  domain.replace({ zIndex: 0, roots: [node({ z: -0 })] });
  assert.ok(Object.is(manager.snapshotForQualification().domains[0].state.roots[0].data.z, -0));
});

test("accepted domain snapshots stay detached and frozen", () => {
  const manager = new RenderManager();
  const source = {
    zIndex: 0,
    roots: [node({ nested: { value: 1, list: ["😀"] } }, [node({ leaf: true })])],
  };
  source.roots[0].children[0].key = "child";
  const domain = manager.createDomain(source);
  const snapshot = manager.snapshotForQualification().domains[0].state;
  source.roots[0].data.nested.value = 9;
  source.roots[0].data.nested.list[0] = "changed";
  source.zIndex = 7;
  assert.equal(snapshot.roots[0].data.nested.value, 1);
  assert.equal(snapshot.roots[0].data.nested.list[0], "😀");
  assert.equal(snapshot.zIndex, 0);
  assert.throws(() => {
    snapshot.roots[0].data.nested.value = 2;
  }, TypeError);
  domain.replace({ zIndex: 3, roots: [node({ nested: { value: 4 } })] });
  assert.equal(snapshot.roots[0].data.nested.value, 1);
  assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].data.nested.value, 4);
});

const stateWithRoots = (roots, zIndex = 0) => ({ zIndex, roots });
const keyedNode = (key, data = {}, children = []) => ({
  key,
  tag: "sprite",
  attrs: {},
  data,
  children,
});

function messageBoundaryState() {
  const empty = stateWithRoots(Array.from({ length: 4 }, (_, index) => keyedNode(`n${index}`, { s: "" })));
  const emptyMessage = {
    type: "render.snapshot",
    domainId: PROBE_DOMAIN_ID,
    revision: Number.MAX_SAFE_INTEGER,
    zIndex: empty.zIndex,
    roots: empty.roots,
  };
  let remaining = MAX_MESSAGE_BYTES - utf8ByteLength(stringifyJson(emptyMessage));
  const lengths = [];
  for (let index = 0; index < 4; index += 1) {
    const length = Math.min(MAX_DATA_BYTES - utf8ByteLength('{"s":""}'), remaining);
    lengths.push(length);
    remaining -= length;
  }
  assert.equal(remaining, 0);
  return stateWithRoots(lengths.map((length, index) => keyedNode(`n${index}`, { s: "x".repeat(length) })));
}

test("whole-message byte limit accepts exactly 1048576 bytes and rejects the next byte atomically", () => {
  const exact = messageBoundaryState();
  const probe = {
    type: "render.snapshot",
    domainId: PROBE_DOMAIN_ID,
    revision: Number.MAX_SAFE_INTEGER,
    zIndex: exact.zIndex,
    roots: exact.roots,
  };
  assert.equal(utf8ByteLength(stringifyJson(probe)), MAX_MESSAGE_BYTES);
  const manager = new RenderManager();
  const domain = manager.createDomain(stateWithRoots(exact.roots.map((item) => keyedNode(item.key))));
  domain.replace(exact);
  const overflow = structuredClone(exact);
  overflow.roots[3].data.s += "x";
  assert.throws(() => domain.replace(overflow), RangeError);
  assert.equal(
    manager.snapshotForQualification().domains[0].state.roots[3].data.s.length,
    exact.roots[3].data.s.length,
  );
});

test("Object.prototype toJSON is ignored by Wire and RenderManager", { concurrency: false }, () => {
  const original = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON");
  let calls = 0;
  try {
    Object.defineProperty(Object.prototype, "toJSON", {
      configurable: true,
      writable: true,
      value() {
        calls += 1;
        this.mutatedByToJSON = true;
        return 0;
      },
    });
    const sample = { safe: { value: 1 } };
    assertJsonValue(sample);
    assert.equal(stringifyJson(sample), '{"safe":{"value":1}}');
    assert.equal(JSON.stringify(sample), "0");
    assert.equal(calls, 1);
    calls = 0;

    const manager = new RenderManager();
    const domain = manager.createDomain(stateWithRoots([keyedNode("root", { value: 1 })]));
    domain.replace(stateWithRoots([keyedNode("root", { value: 2 })]));
    domain.update({ nodes: [{ key: "root", data: { set: { value: 3 } } }] });
    assert.equal(calls, 0);
    assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].data.value, 3);

    const overflow = messageBoundaryState();
    overflow.roots[3].data.s += "x";
    assert.throws(() => domain.replace(overflow), RangeError);
    assert.equal(calls, 0);
  } finally {
    if (original === undefined) delete Object.prototype.toJSON;
    else Object.defineProperty(Object.prototype, "toJSON", original);
  }
});

test("Array.prototype toJSON is ignored and never invokes external code", { concurrency: false }, () => {
  const original = Object.getOwnPropertyDescriptor(Array.prototype, "toJSON");
  let calls = 0;
  try {
    Object.defineProperty(Array.prototype, "toJSON", {
      configurable: true,
      writable: true,
      value() {
        calls += 1;
        throw new Error("external toJSON must not run");
      },
    });
    const sample = { values: [1, 2, 3] };
    assertJsonValue(sample);
    assert.equal(stringifyJson(sample), '{"values":[1,2,3]}');
    assert.throws(() => JSON.stringify(sample), /external toJSON/);
    assert.equal(calls, 1);
    calls = 0;

    const manager = new RenderManager();
    const domain = manager.createDomain(stateWithRoots([keyedNode("root", { values: [1, 2, 3] })]));
    domain.replace(stateWithRoots([keyedNode("root", { values: [4, 5, 6] })]));
    domain.update({ nodes: [{ key: "root", data: { set: { values: [7, 8] } } }] });
    assert.equal(calls, 0);
    assert.deepEqual(manager.snapshotForQualification().domains[0].state.roots[0].data.values, [7, 8]);
  } finally {
    if (original === undefined) delete Array.prototype.toJSON;
    else Object.defineProperty(Array.prototype, "toJSON", original);
  }
});

test("same dense fixture: probe before/after and motion-only RenderDomain.update", () => {
  const width = 128;
  const height = 96;
  const values = new Array(width * height * 3).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      values[x + y * width] = 384 + ((x + y) % 8);
      values[x + y * width + width * height] = 48 + ((x + 2 * y) % 48);
      values[x + y * width + 2 * width * height] = 384 + ((x + 3 * y) % 8);
    }
  }
  const chunks = [];
  for (let cy = 0; cy < 12; cy += 1) {
    for (let cx = 0; cx < 16; cx += 1) {
      const cells = new Array(192).fill(0);
      for (let z = 0; z < 3; z += 1) {
        for (let ly = 0; ly < 8; ly += 1) {
          for (let lx = 0; lx < 8; lx += 1) {
            const x = cx * 8 + lx;
            const y = cy * 8 + ly;
            if (x < width && y < height) cells[(z * 8 + ly) * 8 + lx] = values[x + y * width + z * width * height];
          }
        }
      }
      chunks.push(Object.freeze({ chunkX: cx, chunkY: cy, cells: Object.freeze(cells) }));
    }
  }
  const ref = { namespace: "resource.Graphics", key: "Tilesets/t", contentVersion: "v1" };
  const dense = Object.freeze({
    sceneEpoch: 1, visualEpoch: 1, motionId: null,
    viewportWidth: 1920, viewportHeight: 1080,
    mapId: 1, mapWidth: 128, mapHeight: 96, cameraX: 1024, cameraY: 448,
    tileset: ref, autotiles: Object.freeze([null, null, null, null, null, null, null]),
    tileVisuals: Object.freeze([]), chunks: Object.freeze(chunks), cameraMotion: null,
  });
  const sprite = {
    sceneEpoch: 1, visualEpoch: 1, motionId: 1, x: 64, y: 48,
    screenX: 944, screenY: 512, direction: 2, pattern: 0, sprite: ref, motion: null,
  };
  const state = {
    zIndex: 0,
    roots: [{
      key: "viewport", tag: "lr-map-view", attrs: {}, data: dense,
      children: [{ key: "player", tag: "lr-map-sprite", attrs: {}, data: sprite, children: [] }],
    }],
  };
  assertJsonValue(state);
  const encoded = JSON.stringify(state);
  assert.equal(encoded, stringifyJson(state));
  assert.equal(depthOfValidated(state), jsonDepth(state));
  assert.ok(utf8ByteLength(encoded) < 1_048_576);

  const samples = 80;
  const legacyTimes = [];
  const optimizedTimes = [];
  for (let index = 0; index < samples; index += 1) {
    const legacyStart = performance.now();
    assertJsonValue(state);
    const legacyDepth = jsonDepth(state);
    const legacyBytes = utf8ByteLength(stringifyJson(state));
    legacyTimes.push(performance.now() - legacyStart);

    const optimizedStart = performance.now();
    assertJsonValue(state);
    const optimizedDepth = depthOfValidated(state);
    const optimizedBytes = utf8ByteLength(JSON.stringify(state));
    optimizedTimes.push(performance.now() - optimizedStart);

    assert.equal(legacyDepth, optimizedDepth);
    assert.equal(legacyBytes, optimizedBytes);
  }
  legacyTimes.sort((a, b) => a - b);
  optimizedTimes.sort((a, b) => a - b);

  const manager = new RenderManager();
  const domain = manager.createDomain(state);
  const motionOnly = {
    nodes: [
      { key: "viewport", data: { set: { motionId: 1, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 1024, fromCameraY: 448 } } } },
      { key: "player", data: { set: { motionId: 1, motion: { id: 1, durationMs: 250, fromY: 48, fromScreenX: 944, fromScreenY: 512 } } } },
    ],
  };
  const updateTimes = [];
  for (let index = 0; index < 200; index += 1) {
    const start = performance.now();
    domain.update(motionOnly);
    updateTimes.push(performance.now() - start);
  }
  updateTimes.sort((a, b) => a - b);
  const snapshot = manager.snapshotForQualification().domains[0].state;
  assert.equal(snapshot.roots[0].data.motionId, 1);
  assert.equal(snapshot.roots[0].data.cameraMotion.durationMs, 250);
  assert.equal(snapshot.roots[0].children[0].data.motionId, 1);
  assert.equal(snapshot.chunks, undefined);

  const report = {
    fixture: "dense 1080 (80 chunks)",
    encodedChars: encoded.length,
    encodedUtf8Bytes: utf8ByteLength(encoded),
    jsonDepth: jsonDepth(state),
    probeLegacyMs: {
      p50: percentile(legacyTimes, 0.5),
      p95: percentile(legacyTimes, 0.95),
      max: legacyTimes[legacyTimes.length - 1],
    },
    probeOptimizedMs: {
      p50: percentile(optimizedTimes, 0.5),
      p95: percentile(optimizedTimes, 0.95),
      max: optimizedTimes[optimizedTimes.length - 1],
    },
    motionOnlyUpdateMs: {
      p50: percentile(updateTimes, 0.5),
      p95: percentile(updateTimes, 0.95),
      max: updateTimes[updateTimes.length - 1],
    },
  };
  process.stdout.write(`C2_PROBE_BENCH ${JSON.stringify(report)}\n`);
  assert.ok(
    report.probeOptimizedMs.p50 <= report.probeLegacyMs.p50 * 1.25 + 1,
    `optimized probe p50 ${report.probeOptimizedMs.p50}ms is slower than legacy ${report.probeLegacyMs.p50}ms`,
  );
});
