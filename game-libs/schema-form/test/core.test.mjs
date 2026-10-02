import assert from "node:assert/strict";
import test from "node:test";
import {
  SchemaFormError,
  openSchemaForm,
} from "../dist/index.js";

const baseSchema = (fields = []) => ({ version: 1, fields });
const stringField = (overrides = {}) => ({ key: "text", kind: "string", label: "Text", ...overrides });

function harness(overrides = {}) {
  const abort = new AbortController();
  const domains = [];
  const listeners = [];
  const updates = [];
  let handler;
  const frame = {
    id: "frame",
    params: null,
    signal: abort.signal,
    async call() { throw new Error("not used"); },
  };
  const scope = {
    createRenderDomain(state) {
      if (overrides.renderFailure) throw overrides.renderFailure;
      const domain = {
        state,
        closed: 0,
        replace() {},
        update(update) { updates.push(update); if (overrides.updateFailure) throw overrides.updateFailure; },
        emit() {},
        close() { domain.closed += 1; if (overrides.closeDomainFailure) throw overrides.closeDomainFailure; },
      };
      domains.push(domain);
      return domain;
    },
    createInputListener(options) {
      if (overrides.listenerFailure) throw overrides.listenerFailure;
      const listener = {
        options,
        closed: 0,
        on(_channel, next) { handler = next; return () => { handler = undefined; }; },
        setChannels() {},
        close() { listener.closed += 1; if (overrides.closeListenerFailure) throw overrides.closeListenerFailure; },
      };
      listeners.push(listener);
      return listener;
    },
  };
  return {
    abort, domains, frame, listeners, scope, updates,
    event(name, data = {}, targetKey = domains[0]?.state.roots[0].key) {
      handler?.({ domainId: "ignored", targetKey, name, data });
    },
  };
}

async function rejectedWithoutSync(scope, frame, request) {
  let promise;
  assert.doesNotThrow(() => { promise = openSchemaForm(scope, frame, request); });
  await assert.rejects(promise);
}

test("SchemaFormError exposes frozen public shape", () => {
  const cause = new Error("cause");
  const error = new SchemaFormError("SCHEMA_FORM_INVALID_SCHEMA", undefined, "schema", { cause });
  assert.equal(error.name, "SchemaFormError");
  assert.equal(error.message, "SCHEMA_FORM_INVALID_SCHEMA");
  assert.equal(error.code, "SCHEMA_FORM_INVALID_SCHEMA");
  assert.equal(error.path, "schema");
  assert.equal(error.cause, cause);
});

test("outer failures are Promise TypeError rejections", async () => {
  const h = harness();
  await rejectedWithoutSync(null, h.frame, { schema: baseSchema() });
  await rejectedWithoutSync(h.scope, null, { schema: baseSchema() });
  await rejectedWithoutSync(h.scope, h.frame, null);
  await assert.rejects(openSchemaForm(h.scope, h.frame, { schema: baseSchema(), cancelable: "yes" }), TypeError);
  assert.equal(h.domains.length, 0);
  assert.equal(h.listeners.length, 0);
});

test("closed schema validation covers field kinds and boundary declarations", async () => {
  const valid = baseSchema([
    stringField({ key: "", label: "bad" }),
  ]);
  await assert.rejects(openSchemaForm(harness().scope, harness().frame, { schema: valid }), { code: "SCHEMA_FORM_INVALID_SCHEMA", path: "schema.fields[0].key" });

  for (const [schema, path] of [
    [{ version: 2, fields: [] }, "schema"],
    [{ version: 1, fields: [], extra: true }, "schema"],
    [baseSchema([stringField({ extra: true })]), "schema.fields[0].extra"],
    [baseSchema([stringField(), stringField()]), "schema.fields[1].key"],
    [baseSchema([{ key: "x", kind: "future", label: "" }]), "schema.fields[0].kind"],
    [baseSchema([{ key: "x", kind: "select", label: "", options: [{ value: "a", label: "", extra: 1 }] }]), "schema.fields[0].options[0]"],
    [baseSchema([{ key: "x", kind: "string", label: "", minLength: 2, maxLength: 1 }]), "schema.fields[0].minLength"],
    [baseSchema([{ key: "x", kind: "number", label: "", default: Infinity }]), "schema.fields[0].default"],
  ]) {
    const h = harness();
    await assert.rejects(openSchemaForm(h.scope, h.frame, { schema }), { code: "SCHEMA_FORM_INVALID_SCHEMA", path });
    assert.equal(h.domains.length, 0);
  }

  const longKey = "😀".repeat(32);
  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, {
    schema: baseSchema([
      stringField({ key: longKey, label: "", description: "", placeholder: "", default: "" }),
      { key: "n", kind: "number", label: "", default: 0, min: 0, max: 1, integer: true },
      { key: "b", kind: "boolean", label: "", default: false, required: true },
      { key: "s", kind: "select", label: "", default: "", options: [{ value: "", label: "" }] },
    ]),
    cancelable: true,
  });
  assert.equal(h.domains[0].state.roots[0].children.length, 4);
  assert.deepEqual(h.domains[0].state.roots[0].children.map((node) => node.key).slice(0, 2), [
    h.domains[0].state.roots[0].key + ":f:0",
    h.domains[0].state.roots[0].key + ":f:1",
  ]);
  assert.equal(h.domains[0].state.roots[0].children[0].key.includes(longKey), false);
  h.event("cancel");
  assert.deepEqual(await pending, { type: "cancelled" });
});

test("schema accepts 0/128 fields, empty options, byte budget and Unicode boundaries", async () => {
  for (const fields of [[], Array.from({ length: 128 }, (_, index) => stringField({ key: `f${index}` }))]) {
    const h = harness();
    const pending = openSchemaForm(h.scope, h.frame, { schema: baseSchema(fields), cancelable: true });
    h.event("cancel");
    await pending;
  }
  await assert.rejects(openSchemaForm(harness().scope, harness().frame, {
    schema: baseSchema(Array.from({ length: 129 }, (_, index) => stringField({ key: `f${index}` }))),
  }), { code: "SCHEMA_FORM_INVALID_SCHEMA", path: "schema" });
  const emptyOptions = harness();
  const emptyPending = openSchemaForm(emptyOptions.scope, emptyOptions.frame, {
    schema: baseSchema([{ key: "s", kind: "select", label: "", options: [] }]), cancelable: true,
  });
  emptyOptions.event("cancel");
  await emptyPending;

  await assert.rejects(openSchemaForm(harness().scope, harness().frame, { schema: baseSchema([stringField({ key: "\ud800" })]) }), {
    code: "SCHEMA_FORM_INVALID_SCHEMA", path: "schema.fields[0].key",
  });
  await assert.rejects(openSchemaForm(harness().scope, harness().frame, { schema: baseSchema([stringField({ key: "a".repeat(129) })]) }), {
    code: "SCHEMA_FORM_INVALID_SCHEMA", path: "schema.fields[0].key",
  });

  const exact = { version: 1, title: "", fields: [] };
  exact.title = "x".repeat(65_536 - Buffer.byteLength(JSON.stringify(exact)));
  assert.equal(Buffer.byteLength(JSON.stringify(exact)), 65_536);
  const exactHarness = harness();
  const exactPending = openSchemaForm(exactHarness.scope, exactHarness.frame, { schema: exact, cancelable: true });
  exactHarness.event("cancel");
  await exactPending;
  await assert.rejects(openSchemaForm(harness().scope, harness().frame, { schema: { ...exact, title: exact.title + "x" } }), {
    code: "SCHEMA_FORM_INVALID_SCHEMA", path: "schema",
  });
});

test("initial value validation and canonical precedence preserve false, zero and empty string", async () => {
  const schema = baseSchema([
    stringField({ default: "default" }),
    { key: "n", kind: "number", label: "N", default: 9 },
    { key: "b", kind: "boolean", label: "B", default: true },
    { key: "s", kind: "select", label: "S", default: "x", options: [{ value: "", label: "Empty" }, { value: "x", label: "X" }] },
  ]);
  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, { schema, initialValue: { text: "", n: 0, b: false, s: "" } });
  h.event("submit", { values: { text: "", n: 0, b: false, s: "" } });
  assert.deepEqual(await pending, { type: "submitted", value: { text: "", n: 0, b: false, s: "" } });

  for (const initialValue of [{ extra: 1 }, { n: NaN }, { b: 0 }, { s: "no" }]) {
    const failure = harness();
    await assert.rejects(openSchemaForm(failure.scope, failure.frame, { schema, initialValue }), { code: "SCHEMA_FORM_INVALID_INITIAL_VALUE" });
    assert.equal(failure.domains.length, 0);
  }
  const initial = { text: "" };
  initial.text = "x".repeat(65_536 - Buffer.byteLength(JSON.stringify(initial)));
  const boundarySchema = baseSchema([stringField()]);
  const boundary = harness();
  const open = openSchemaForm(boundary.scope, boundary.frame, { schema: boundarySchema, initialValue: initial, cancelable: true });
  boundary.event("cancel");
  await open;
  await assert.rejects(openSchemaForm(harness().scope, harness().frame, { schema: boundarySchema, initialValue: { text: initial.text + "x" } }), {
    code: "SCHEMA_FORM_INVALID_INITIAL_VALUE", path: "initialValue",
  });
});

test("required is interaction-only and built-in text/precedence are exact", async () => {
  const schema = baseSchema([
    stringField({ required: true, minLength: 2, maxLength: 3 }),
    { key: "n", kind: "number", label: "N", required: true, min: 2, max: 3, integer: true },
    { key: "s", kind: "select", label: "S", required: true, options: [] },
  ]);
  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, { schema, cancelable: true });
  h.event("change", { values: { text: "", n: null, s: null } });
  const data = h.updates.at(-1).nodes.map((node) => node.data.set);
  assert.equal(data[0].error, "Required");
  assert.equal(data[1].error, "Required");
  assert.equal(data[2].error, "Required");
  h.event("change", { values: { text: "a", n: 1, s: null } });
  const next = h.updates.at(-1).nodes.map((node) => node.data.set);
  assert.equal(next[0].error, "Must be at least 2 characters");
  assert.equal(next[1].error, "Must be at least 2");
  h.event("cancel");
  await pending;
});

test("validators compile and execute synchronously with detached frozen snapshots", async () => {
  for (const source of ["(", "42"]) {
    const h = harness();
    await assert.rejects(openSchemaForm(h.scope, h.frame, { schema: { ...baseSchema(), validateOnSubmit: source } }), {
      code: "SCHEMA_FORM_VALIDATOR_FAILED", path: "schema.validateOnSubmit",
    });
    assert.equal(h.domains.length, 0);
  }
  const schema = {
    ...baseSchema([stringField({ required: true }), { key: "other", kind: "string", label: "Other" }]),
    validateOnChange: `(data) => { if (!Object.isFrozen(data)) throw new Error("not frozen"); return { text: "script", other: "cross" }; }`,
    validateOnSubmit: `() => Promise.resolve(null)`,
  };
  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, { schema, cancelable: true });
  h.event("change", { values: { text: "", other: "ok" } });
  const latest = h.updates.at(-1).nodes.map((node) => node.data.set);
  assert.equal(latest[0].value, "");
  assert.equal(latest[0].error, "Required");
  assert.equal(latest[1].error, "cross");
  h.event("submit", { values: { text: "ok", other: "ok" } });
  await assert.rejects(pending, { code: "SCHEMA_FORM_INVALID_VALIDATOR_RESULT", path: "schema.validateOnSubmit" });
  assert.equal(h.domains[0].closed, 1);
  assert.equal(h.listeners[0].closed, 1);
});

test("validator result shape and error-map byte budget fail closed", async () => {
  const invalidSources = [
    `() => "error"`, `() => false`, `() => []`, `() => ({ text: 1 })`,
    `() => ({ unknown: "bad" })`, `() => ({ text: "" })`,
    `() => Object.create({ inherited: "bad" })`,
    `() => { const x = {}; Object.defineProperty(x, "text", { get() { return "bad"; }, enumerable: true }); return x; }`,
  ];
  for (const source of invalidSources) {
    const h = harness();
    const pending = openSchemaForm(h.scope, h.frame, { schema: { ...baseSchema([stringField()]), validateOnSubmit: source } });
    h.event("submit", { values: { text: "x" } });
    await assert.rejects(pending, { code: "SCHEMA_FORM_INVALID_VALIDATOR_RESULT" });
  }
  const empty = { text: "" };
  const exactLength = 65_536 - Buffer.byteLength(JSON.stringify(empty));
  const pass = harness();
  const passPending = openSchemaForm(pass.scope, pass.frame, {
    schema: { ...baseSchema([stringField()]), validateOnSubmit: `() => ({ text: "x".repeat(${exactLength}) })` },
    cancelable: true,
  });
  pass.event("submit", { values: { text: "x" } });
  assert.equal(pass.updates.at(-1).nodes[0].data.set.error.length, exactLength);
  pass.event("cancel");
  await passPending;
  const over = harness();
  const overPending = openSchemaForm(over.scope, over.frame, {
    schema: { ...baseSchema([stringField()]), validateOnSubmit: `() => ({ text: "x".repeat(${exactLength + 1}) })` },
  });
  over.event("submit", { values: { text: "x" } });
  await assert.rejects(overPending, { code: "SCHEMA_FORM_INVALID_VALIDATOR_RESULT" });
});

test("one active form, cancel, abort, cleanup failures and registration release", async () => {
  const h = harness({ closeDomainFailure: new Error("domain cleanup"), closeListenerFailure: new Error("listener cleanup") });
  const first = openSchemaForm(h.scope, h.frame, { schema: baseSchema(), cancelable: true });
  await assert.rejects(openSchemaForm(h.scope, h.frame, { schema: baseSchema(), validateOnSubmit: "(" }), {
    code: "SCHEMA_FORM_ALREADY_OPEN", path: undefined,
  });
  h.event("cancel");
  assert.deepEqual(await first, { type: "cancelled" });
  const reopened = openSchemaForm(h.scope, h.frame, { schema: baseSchema(), cancelable: true });
  h.abort.abort();
  await assert.rejects(reopened, { name: "AbortError" });
  assert.equal(h.domains.at(-1).closed, 1);
  assert.equal(h.listeners.at(-1).closed, 1);
});

test("resource creation failure cleans partial state and allows reopen", async () => {
  const failure = new Error("listener creation");
  const h = harness({ listenerFailure: failure });
  await assert.rejects(openSchemaForm(h.scope, h.frame, { schema: baseSchema() }), failure);
  assert.equal(h.domains[0].closed, 1);
  const good = harness();
  good.frame = h.frame;
  const pending = openSchemaForm(good.scope, h.frame, { schema: baseSchema(), cancelable: true });
  good.event("cancel");
  await pending;
});

test("malformed snapshots, wrong targets and over-limit events cause zero mutation", async () => {
  const schema = baseSchema([
    stringField(),
    { key: "n", kind: "number", label: "N" },
    { key: "b", kind: "boolean", label: "B" },
    { key: "s", kind: "select", label: "S", options: [{ value: "", label: "Empty" }] },
  ]);
  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, { schema, cancelable: true });
  for (const [data, target] of [
    [{ values: { text: "x", n: null, b: false } }],
    [{ values: { text: "x", n: null, b: false, s: null, extra: 1 } }],
    [{ values: { text: null, n: null, b: false, s: null } }],
    [{ values: { text: "x", n: Infinity, b: false, s: null } }],
    [{ values: { text: "x", n: null, b: false, s: "bad" } }],
    [{ values: { text: "x", n: null, b: false, s: null } }, "wrong"],
  ]) h.event("change", data, target);
  assert.equal(h.updates.length, 0);

  const exact = { values: { text: "", n: null, b: false, s: null } };
  exact.values.text = "x".repeat(131_072 - Buffer.byteLength(JSON.stringify(exact)));
  h.event("change", exact);
  assert.equal(h.updates.length, 1);
  h.event("change", { values: { ...exact.values, text: exact.values.text + "x" } });
  assert.equal(h.updates.length, 1);
  h.event("cancel");
  await pending;
});

test("Submit is independent from Change and projection removes unset values", async () => {
  const schema = baseSchema([
    stringField(), { key: "n", kind: "number", label: "N", default: 1 },
    { key: "b", kind: "boolean", label: "B" },
    { key: "s", kind: "select", label: "S", options: [{ value: "", label: "Empty" }] },
  ]);
  const h = harness();
  const pending = openSchemaForm(h.scope, h.frame, { schema });
  const initial = h.domains[0].state;
  assert.equal(initial.zIndex, 2_147_483_647);
  assert.equal(initial.roots[0].children[0].data.value, "");
  assert.equal(initial.roots[0].children[2].data.value, false);
  assert.equal(Object.hasOwn(initial.roots[0].children[3].data, "value"), false);
  h.event("change", { values: { text: "old", n: 2, b: true, s: "" } });
  h.event("change", { values: { text: "old", n: null, b: true, s: null } });
  assert.ok(h.updates.at(-1).nodes[1].data.remove.includes("value"));
  assert.ok(h.updates.at(-1).nodes[3].data.remove.includes("value"));
  h.event("submit", { values: { text: "fresh", n: 0, b: false, s: "" } });
  const result = await pending;
  assert.deepEqual(result, { type: "submitted", value: { text: "fresh", n: 0, b: false, s: "" } });
  assert.equal(Object.isFrozen(result.value), true);
  h.event("submit", { values: { text: "duplicate", n: null, b: false, s: null } });
  assert.equal(h.domains[0].closed, 1);
});
