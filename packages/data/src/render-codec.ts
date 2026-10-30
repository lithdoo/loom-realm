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
  for (const key of Object.keys(value)) {
    scalarString(key, "render", "attrs key");
    scalarString(value[key], "render", "attrs value", true);
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

function nullableRenderId(value: unknown, label: string): void {
  if (value !== null) renderId(value, label);
}

function stringDelta(raw: unknown, json: boolean): void {
  const delta = exact(raw, [], ["set", "remove"], "render");
  if (delta.set === undefined && delta.remove === undefined) fail("render", "empty delta");
  let nonempty = false;
  if (delta.set !== undefined) {
    const values = json ? renderData(delta.set) : object(delta.set, "render", "delta.set");
    const keys = Object.keys(values);
    if (keys.length > 0) nonempty = true;
    for (const key of keys) {
      scalarString(key, "render", json ? "data delta key" : "attrs delta key", json);
      if (!json) scalarString(values[key], "render", "attrs delta value", true);
    }
  }
  if (delta.remove !== undefined) {
    const removed = array(delta.remove, "render", "delta.remove");
    if (removed.length > 0) nonempty = true;
    const seen = new Set<string>();
    for (const value of removed) {
      const key = scalarString(value, "render", json ? "data delta key" : "attrs delta key", json);
      if (seen.has(key)) fail("render", "duplicate delta remove key");
      seen.add(key);
      if (delta.set !== undefined && Object.prototype.hasOwnProperty.call(delta.set, key)) {
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
    const value = exact(base, ["op", "parentKey", "beforeKey", "node"], [], "render");
    nullableRenderId(value.parentKey, "parentKey");
    nullableRenderId(value.beforeKey, "beforeKey");
    renderNode(value.node, new Set<string>());
  } else if (op === "remove") {
    const value = exact(base, ["op", "key"], [], "render");
    renderId(value.key, "key");
  } else if (op === "move") {
    const value = exact(base, ["op", "key", "parentKey", "beforeKey"], [], "render");
    renderId(value.key, "key");
    nullableRenderId(value.parentKey, "parentKey");
    nullableRenderId(value.beforeKey, "beforeKey");
  } else if (op === "update") {
    const value = exact(base, ["op", "key"], ["attrs", "data"], "render");
    renderId(value.key, "key");
    if (value.attrs === undefined && value.data === undefined) fail("render", "empty update");
    if (value.attrs !== undefined) stringDelta(value.attrs, false);
    if (value.data !== undefined) stringDelta(value.data, true);
  } else {
    fail("render", "unknown patch op");
  }
}

export function validateRenderDomains(raw: unknown): RenderDomainsV1 {
  const message = exact(raw, ["type", "domains"], [], "render");
  if (message.type !== "render.domains") fail("render", "wrong type");
  const domains = array(message.domains, "render", "domains");
  const seen = new Set<string>();
  for (const value of domains) {
    const id = renderId(value, "domainId");
    if (seen.has(id)) fail("render", "duplicate domainId");
    seen.add(id);
  }
  return message as unknown as RenderDomainsV1;
}

export function validateRenderSnapshot(raw: unknown): RenderSnapshotV1 {
  const message = exact(raw, ["type", "domainId", "revision", "zIndex", "roots"], [], "render");
  if (message.type !== "render.snapshot") fail("render", "wrong type");
  renderId(message.domainId, "domainId");
  positiveSafe(message.revision, "render", "revision");
  signedSafe(message.zIndex, "render", "zIndex");
  renderRoots(message.roots);
  return message as unknown as RenderSnapshotV1;
}

export function validateRenderPatch(raw: unknown): RenderPatchV1 {
  const message = exact(raw, ["type", "domainId", "baseRevision", "revision", "ops"], ["zIndex"], "render");
  if (message.type !== "render.patch") fail("render", "wrong type");
  renderId(message.domainId, "domainId");
  const base = positiveSafe(message.baseRevision, "render", "baseRevision");
  const revision = positiveSafe(message.revision, "render", "revision");
  if (base === Number.MAX_SAFE_INTEGER || revision !== base + 1) {
    fail("render", "invalid patch revision step");
  }
  if (message.zIndex !== undefined) signedSafe(message.zIndex, "render", "zIndex");
  const ops = array(message.ops, "render", "ops");
  if (ops.length === 0 && message.zIndex === undefined) fail("render", "empty patch");
  for (const op of ops) renderOp(op);
  return message as unknown as RenderPatchV1;
}

export function validateRenderEvent(raw: unknown): RenderEventV1 {
  const message = exact(raw, ["type", "domainId", "targetKey", "name", "data"], [], "render");
  if (message.type !== "render.event") fail("render", "wrong type");
  renderId(message.domainId, "domainId");
  renderId(message.targetKey, "targetKey");
  scalarString(message.name, "render", "event name");
  renderData(message.data);
  return message as unknown as RenderEventV1;
}
