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

const state = (roots, zIndex = 0) => ({ zIndex, roots });
const node = (key, data = {}, children = []) => ({
  key,
  tag: "sprite",
  attrs: {},
  data,
  children,
});

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

const PRIMITIVES = [
  null, true, false, 0, -0, 1, -1, 0.5, -0.5, 1e308, 5e-324,
  "", "a", "é", "𝒜", "😀", "ab😀cd", "\"quoted\"", "back\\slash",
  "tab\tnew\nline", "\u0000", "\u001f", "\u007f", "  ",
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
    return Array.from(
      { length: Math.floor(random() * breadth) },
      () => randomValid(depth - 1, breadth),
    );
  }
  const object = Object.create(random() < 0.1 ? null : Object.prototype);
  const count = Math.floor(random() * breadth);
  for (let index = 0; index < count; index += 1) {
    const key = PRIMITIVES[Math.floor(random() * PRIMITIVES.length)];
    if (typeof key === "string") object[key] = randomValid(depth - 1, breadth);
  }
  return object;
}

test("3,000 valid JSON values preserve depth and serialized byte equivalence", () => {
  for (let iteration = 0; iteration < 3_000; iteration += 1) {
    const value = randomValid(6, 6);
    assertJsonValue(value);
    const wire = stringifyJson(value);
    assert.equal(JSON.stringify(value), wire, `text mismatch at iteration ${iteration}`);
    assert.equal(utf8ByteLength(JSON.stringify(value)), utf8ByteLength(wire));
    assert.equal(depthOfValidated(value), jsonDepth(value), `depth mismatch at iteration ${iteration}`);
  }
});

test("depth 63/64/65 and serialization boundary fixtures remain equivalent", () => {
  const fixtures = [
    {}, [], { "": null }, [[]], { a: [] },
    JSON.parse('{"1":1,"0":0,"b":2,"a":1}'),
    Object.assign(Object.create(null), { proto: "null", works: true }),
    { nested: { unicode: ["𝒜", "😀", "\u0000", "\ud800"] } },
    { "-0": -0, number: -0 },
  ];
  for (const depth of [63, 64, 65]) {
    let value = 0;
    for (let index = 0; index < depth; index += 1) value = { child: value };
    fixtures.push(value);
  }
  for (const fixture of fixtures) {
    assertJsonValue(fixture);
    assert.equal(depthOfValidated(fixture), jsonDepth(fixture));
    assert.equal(stringifyJson(fixture), JSON.stringify(fixture));
  }
});

test("invalid JSON inputs keep TypeError classification through replace", () => {
  const sparse = [1];
  sparse[3] = 2;
  const cyclic = {};
  cyclic.self = cyclic;
  const getter = {};
  let getterCalls = 0;
  Object.defineProperty(getter, "value", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  const invalid = [
    undefined, NaN, Infinity, -Infinity, 10n, Symbol("x"), () => {}, sparse,
    { value: undefined }, { value: Symbol("x") }, getter,
    Object.assign([], { extra: 1 }), { [Symbol("key")]: 1 },
    new Number(1), new String("x"), cyclic, { toJSON: () => 1 },
  ];
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")]));
  for (const value of invalid) {
    assert.equal(isJsonValue(value), false);
    assert.throws(
      () => domain.replace(state([node("root", { bad: value })])),
      TypeError,
    );
  }
  assert.equal(getterCalls, 0);
  assert.deepEqual(Object.keys(manager.snapshotForQualification().domains[0].state.roots[0].data), []);
});

test("node data accepts depth 32 and rejects depth 33 atomically", () => {
  const deep = (containers) => {
    let value = 1;
    for (let index = 0; index < containers; index += 1) value = [value];
    return value;
  };
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root", { marker: "original" })]));
  domain.replace(state([node("root", { nested: deep(31) })]));
  assert.equal(jsonDepth(manager.snapshotForQualification().domains[0].state.roots[0].data), 32);
  assert.throws(() => domain.replace(state([node("root", { nested: deep(32) })])), RangeError);
  assert.equal(jsonDepth(manager.snapshotForQualification().domains[0].state.roots[0].data), 32);
  assert.throws(
    () => domain.replace(state([node("root", {
      nested: (() => {
        let value = "x".repeat(MAX_DATA_BYTES);
        for (let index = 0; index < 32; index += 1) value = [value];
        return value;
      })(),
    })])),
    /depth limit exceeded/,
  );
  assert.throws(
    () => domain.update({ nodes: [{ key: "root", data: { set: { nested: deep(32) } } }] }),
    RangeError,
  );
  assert.equal(jsonDepth(manager.snapshotForQualification().domains[0].state.roots[0].data), 32);
});

test("node data byte limit accepts exactly 262144 bytes and rejects the next byte", () => {
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")]));
  const exact = { s: "x".repeat(MAX_DATA_BYTES - utf8ByteLength('{"s":""}')) };
  assert.equal(utf8ByteLength(stringifyJson(exact)), MAX_DATA_BYTES);
  domain.replace(state([node("root", exact)]));
  assert.throws(
    () => domain.replace(state([node("root", { s: `${exact.s}x` })])),
    RangeError,
  );
  assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].data.s.length, exact.s.length);
});

function messageBoundaryState() {
  const empty = state(Array.from({ length: 4 }, (_, index) => node(`n${index}`, { s: "" })));
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
  return state(lengths.map((length, index) => node(`n${index}`, { s: "x".repeat(length) })));
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
  const domain = manager.createDomain(state(exact.roots.map((item) => node(item.key))));
  domain.replace(exact);
  const overflow = structuredClone(exact);
  overflow.roots[3].data.s += "x";
  assert.throws(() => domain.replace(overflow), RangeError);
  assert.equal(
    manager.snapshotForQualification().domains[0].state.roots[3].data.s.length,
    exact.roots[3].data.s.length,
  );
});

test("Object.prototype toJSON is ignored by Wire and RenderManager, including byte-limit bypass attempts", { concurrency: false }, () => {
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
    const domain = manager.createDomain(state([node("root", { value: 1 })]));
    domain.replace(state([node("root", { value: 2 })]));
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
    const domain = manager.createDomain(state([node("root", { values: [1, 2, 3] })]));
    domain.replace(state([node("root", { values: [4, 5, 6] })]));
    domain.update({ nodes: [{ key: "root", data: { set: { values: [7, 8] } } }] });
    assert.equal(calls, 0);
    assert.deepEqual(manager.snapshotForQualification().domains[0].state.roots[0].data.values, [7, 8]);
  } finally {
    if (original === undefined) delete Array.prototype.toJSON;
    else Object.defineProperty(Array.prototype, "toJSON", original);
  }
});
