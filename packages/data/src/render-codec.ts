import type { JsonObject } from "@loomrealm/wire";
import { assertJsonValue, stringifyJson, utf8ByteLength } from "@loomrealm/wire";
import type {
  RenderDomainsV1,
  RenderEventV1,
  RenderPatchV1,
  RenderSnapshotV1,
} from "./model.js";
import {
  array,
  assertBoundedJson,
  boundedString,
  exact,
  fail,
  int32,
  MAX_PAYLOAD_BYTES,
  object,
  positiveSafe,
} from "./validation-common.js";

function renderId(value: unknown, label: string, max = 128): string {
  return boundedString(value, "render", label, 1, max);
}

function attrs(raw: unknown): void {
  const a = object(raw, "render", "attrs");
  const keys = Object.keys(a);
  if (keys.length > 256) fail("render", "attrs member limit");
  for (const k of keys) {
    boundedString(k, "render", "attrs key", 1, 128);
    const v = a[k];
    if (typeof v !== "string") fail("render", "attrs value must string");
    boundedString(v, "render", "attrs value", 0, 4096);
  }
}

function renderData(raw: unknown): JsonObject {
  const d = object(raw, "render", "data");
  assertBoundedJson(d, "render");
  if (utf8ByteLength(stringifyJson(d)) > MAX_PAYLOAD_BYTES) fail("render", "render data byte limit");
  return d;
}

function renderNode(
  raw: unknown,
  seen: Set<string>,
  depth: number,
  counter: { n: number },
): void {
  if (depth > 30) fail("render", "render tree depth limit");
  const n = exact(raw, ["key", "tag", "attrs", "data", "children"], [], "render");
  const key = renderId(n.key, "node key");
  if (seen.has(key)) fail("render", "duplicate node key");
  seen.add(key);
  renderId(n.tag, "tag", 256);
  attrs(n.attrs);
  renderData(n.data);
  const children = array(n.children, "render", "children");
  counter.n += 1;
  if (counter.n > 16384) fail("render", "node count limit");
  for (const c of children) renderNode(c, seen, depth + 1, counter);
}

function renderRoots(raw: unknown): void {
  const roots = array(raw, "render", "roots");
  const seen = new Set<string>();
  const counter = { n: 0 };
  for (const r of roots) renderNode(r, seen, 1, counter);
}

function nullableRenderId(v: unknown, label: string): void {
  if (v !== null) renderId(v, label);
}

function stringDelta(raw: unknown, json: boolean): void {
  const d = exact(raw, [], ["set", "remove"], "render");
  if (d.set === undefined && d.remove === undefined) fail("render", "empty delta");
  let nonempty = false;
  if (d.set !== undefined) {
    const s = object(d.set, "render", "delta.set");
    const keys = Object.keys(s);
    if (keys.length) nonempty = true;
    for (const k of keys) {
      if (json) {
        assertJsonValue(s[k]);
      } else if (typeof s[k] !== "string") {
        fail("render", "string delta value");
      }
    }
  }
  if (d.remove !== undefined) {
    const r = array(d.remove, "render", "delta.remove");
    if (r.length) nonempty = true;
    const seen = new Set<string>();
    for (const x of r) {
      if (typeof x !== "string" || seen.has(x)) fail("render", "invalid delta remove");
      seen.add(x);
      if (d.set !== undefined && Object.prototype.hasOwnProperty.call(d.set, x)) {
        fail("render", "delta set/remove overlap");
      }
    }
  }
  if (!nonempty) fail("render", "empty delta");
}

function renderOp(raw: unknown): void {
  const base = object(raw, "render", "op");
  const op = base.op;
  if (op === "insert") {
    const p = exact(base, ["op", "parentKey", "beforeKey", "node"], [], "render");
    nullableRenderId(p.parentKey, "parentKey");
    nullableRenderId(p.beforeKey, "beforeKey");
    renderNode(p.node, new Set<string>(), 1, { n: 0 });
  } else if (op === "remove") {
    const p = exact(base, ["op", "key"], [], "render");
    renderId(p.key, "key");
  } else if (op === "move") {
    const p = exact(base, ["op", "key", "parentKey", "beforeKey"], [], "render");
    renderId(p.key, "key");
    nullableRenderId(p.parentKey, "parentKey");
    nullableRenderId(p.beforeKey, "beforeKey");
  } else if (op === "update") {
    const p = exact(base, ["op", "key"], ["attrs", "data"], "render");
    renderId(p.key, "key");
    if (p.attrs === undefined && p.data === undefined) fail("render", "empty update");
    if (p.attrs !== undefined) stringDelta(p.attrs, false);
    if (p.data !== undefined) stringDelta(p.data, true);
  } else {
    fail("render", "unknown patch op");
  }
}

export function validateRenderDomains(raw: unknown): RenderDomainsV1 {
  const p = exact(raw, ["type", "domains"], [], "render");
  if (p.type !== "render.domains") fail("render", "wrong type");
  const domains = array(p.domains, "render", "domains");
  if (domains.length > 256) fail("render", "domain limit");
  const seen = new Set<string>();
  for (const d of domains) {
    const id = renderId(d, "domainId");
    if (seen.has(id)) fail("render", "duplicate domainId");
    seen.add(id);
  }
  return p as unknown as RenderDomainsV1;
}

export function validateRenderSnapshot(raw: unknown): RenderSnapshotV1 {
  const p = exact(raw, ["type", "domainId", "revision", "zIndex", "roots"], [], "render");
  if (p.type !== "render.snapshot") fail("render", "wrong type");
  renderId(p.domainId, "domainId");
  positiveSafe(p.revision, "render", "revision");
  int32(p.zIndex, "render", "zIndex");
  renderRoots(p.roots);
  return p as unknown as RenderSnapshotV1;
}

export function validateRenderPatch(raw: unknown): RenderPatchV1 {
  const p = exact(raw, ["type", "domainId", "baseRevision", "revision", "ops"], ["zIndex"], "render");
  if (p.type !== "render.patch") fail("render", "wrong type");
  renderId(p.domainId, "domainId");
  const base = positiveSafe(p.baseRevision, "render", "baseRevision");
  const rev = positiveSafe(p.revision, "render", "revision");
  if (base === Number.MAX_SAFE_INTEGER || rev !== base + 1) {
    fail("render", "invalid patch revision step");
  }
  if (p.zIndex !== undefined) int32(p.zIndex, "render", "zIndex");
  const ops = array(p.ops, "render", "ops");
  if (ops.length > 4096) fail("render", "patch op limit");
  if (ops.length === 0 && p.zIndex === undefined) fail("render", "empty patch");
  for (const op of ops) renderOp(op);
  return p as unknown as RenderPatchV1;
}

export function validateRenderEvent(raw: unknown): RenderEventV1 {
  const p = exact(raw, ["type", "domainId", "targetKey", "name", "data"], [], "render");
  if (p.type !== "render.event") fail("render", "wrong type");
  renderId(p.domainId, "domainId");
  renderId(p.targetKey, "targetKey");
  boundedString(p.name, "render", "event name", 1, 128);
  renderData(p.data);
  return p as unknown as RenderEventV1;
}
