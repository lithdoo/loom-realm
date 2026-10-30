import type { JsonObject } from "@loomrealm/wire";
import type {
  RenderDomainsV1,
  RenderEventV1,
  RenderPatchV1,
  RenderSnapshotV1,
} from "./model.js";
import {
  array,
  exact,
  fail,
  object,
  positiveSafe,
  scalarString,
  signedSafe,
} from "./validation-common.js";

function renderId(value: unknown, label: string): string {
  return scalarString(value, "render", label);
}

function attrs(raw: unknown): void {
  const value = object(raw, "render", "attrs");
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (cause) {
    fail("render", `invalid attrs: ${String(cause)}`);
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") fail("render", "attrs cannot contain symbol members");
    scalarString(key, "render", "attrs key");
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      fail("render", "attrs members must be enumerable data properties");
    }
    const v = descriptor.value;
    if (typeof v !== "string") fail("render", "attrs value must string");
    scalarString(v, "render", "attrs value", true);
  }
}

function renderData(raw: unknown): JsonObject {
  return object(raw, "render", "data");
}

function renderNode(raw: unknown, seen: Set<string>): void {
  const stack: unknown[] = [raw];
  while (stack.length > 0) {
    const current = stack.pop();
    const node = exact(current, ["key", "tag", "attrs", "data", "children"], [], "render");
    const key = renderId(node.key, "node key");
    if (seen.has(key)) fail("render", "duplicate node key");
    seen.add(key);
    renderId(node.tag, "tag");
    attrs(node.attrs);
    renderData(node.data);
    const children = array(node.children, "render", "children");
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }
}

function renderRoots(raw: unknown): void {
  const roots = array(raw, "render", "roots");
  const seen = new Set<string>();
  for (const root of roots) renderNode(root, seen);
}

function nullableRenderId(v: unknown, label: string): void {
  if (v !== null) renderId(v, label);
}

function stringDelta(raw: unknown, json: boolean): void {
  const d = exact(raw, [], ["set", "remove"], "render");
  if (d.set === undefined && d.remove === undefined) fail("render", "empty delta");
  let nonempty = false;
  if (d.set !== undefined) {
    const s = json ? renderData(d.set) : object(d.set, "render", "delta.set");
    const keys = Object.keys(s);
    if (keys.length) nonempty = true;
    for (const k of keys) {
      if (json) {
        scalarString(k, "render", "data delta key", true);
      } else {
        scalarString(k, "render", "attrs delta key");
        scalarString(s[k], "render", "attrs delta value", true);
      }
    }
  }
  if (d.remove !== undefined) {
    const r = array(d.remove, "render", "delta.remove");
    if (r.length) nonempty = true;
    const seen = new Set<string>();
    for (const x of r) {
      if (typeof x !== "string" || seen.has(x)) fail("render", "invalid delta remove");
      scalarString(x, "render", json ? "data delta key" : "attrs delta key", json);
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
    renderNode(p.node, new Set<string>());
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
  signedSafe(p.zIndex, "render", "zIndex");
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
  if (p.zIndex !== undefined) signedSafe(p.zIndex, "render", "zIndex");
  const ops = array(p.ops, "render", "ops");
  if (ops.length === 0 && p.zIndex === undefined) fail("render", "empty patch");
  for (const op of ops) renderOp(op);
  return p as unknown as RenderPatchV1;
}

export function validateRenderEvent(raw: unknown): RenderEventV1 {
  const p = exact(raw, ["type", "domainId", "targetKey", "name", "data"], [], "render");
  if (p.type !== "render.event") fail("render", "wrong type");
  renderId(p.domainId, "domainId");
  renderId(p.targetKey, "targetKey");
  scalarString(p.name, "render", "event name");
  renderData(p.data);
  return p as unknown as RenderEventV1;
}
