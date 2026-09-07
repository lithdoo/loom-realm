import assert from "node:assert/strict";
import {
  assertAccepted, assertFatal, baseline, chain, committedDomain, expectAtomicFatal,
  expectOutboundAccepted, expectOutboundRejected, flatNodes, nestedData, node,
  objectMembers, patch, snapshot,
} from "./helpers/render-fixtures.mjs";

const insert = (key, parentKey = null, beforeKey = null, children = []) => ({
  op: "insert", parentKey, beforeKey, node: node(key, children),
});
const remove = (key) => ({ op: "remove", key });
const move = (key, parentKey = null, beforeKey = null) => ({ op: "move", key, parentKey, beforeKey });
const update = (key, attrs, data) => ({ op: "update", key, ...(attrs === undefined ? {} : { attrs }), ...(data === undefined ? {} : { data }) });
const keys = (store, domainId = "d1") => {
  const output = [];
  const visit = (entry) => { output.push(entry.key); entry.children.forEach(visit); };
  committedDomain(store, domainId).roots.forEach(visit);
  return output;
};
const apply = (store, ops, overrides = {}) => store.onPatch(patch(ops, overrides));
const baseTree = () => baseline([node("root", [node("a"), node("b")], { old: "1" }, { old: 1 })]);
const atomicReject = (ops, pattern, store = baseTree()) => expectAtomicFatal(store, () => apply(store, ops), pattern);

function exactDataBytes() {
  const overhead = Buffer.byteLength(JSON.stringify({ value: "" }));
  const data = { value: "x".repeat(262_144 - overhead) };
  assert.equal(Buffer.byteLength(JSON.stringify(data)), 262_144);
  return data;
}

function childKeys(store, key) {
  const stack = [...committedDomain(store).roots];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current.key === key) return current.children.map((child) => child.key);
    stack.push(...current.children);
  }
  throw new Error(`missing ${key}`);
}

export const patchEvidence = new Map([
  ["patch-no-partial-apply", () => atomicReject([update("root", { set: { committed: "no" } }), remove("missing")], /missing/)],
  ["patch-exact-op-count-limit", () => expectOutboundAccepted(patch(Array.from({ length: 4_096 }, () => update("root", { set: { x: "1" } }))))],
  ["patch-one-over-op-count-limit", () => expectOutboundRejected(patch(Array.from({ length: 4_097 }, () => update("root", { set: { x: "1" } }))), /op limit/)],
  ["patch-empty-ops-without-zindex-rejected", () => expectOutboundRejected(patch([]), /empty/)],
  ["patch-empty-ops-with-zindex-valid", () => expectOutboundAccepted(patch([], { zIndex: 1 }))],
  ["patch-zindex-only-commit", () => { const store = baseline(); assertAccepted(apply(store, [], { zIndex: 7 })); assert.equal(committedDomain(store).zIndex, 7); }],
  ["patch-zindex-and-ops-one-atomic-commit", () => { const store = baseline(); assertAccepted(apply(store, [insert("new")], { zIndex: 7 })); assert.equal(committedDomain(store).zIndex, 7); assert.deepEqual(keys(store), ["root", "new"]); }],
  ["semantic-noop-not-required-to-reject", () => { const store = baseTree(); assertAccepted(apply(store, [update("root", { set: { old: "1" } })])); }],

  ["insert-root", () => { const store = baseTree(); assertAccepted(apply(store, [insert("new")])); assert.deepEqual(committedDomain(store).roots.map(({ key }) => key), ["root", "new"]); }],
  ["insert-child", () => { const store = baseTree(); assertAccepted(apply(store, [insert("new", "root")])); assert.deepEqual(childKeys(store, "root"), ["a", "b", "new"]); }],
  ["insert-before-sibling", () => { const store = baseTree(); assertAccepted(apply(store, [insert("new", "root", "b")])); assert.deepEqual(childKeys(store, "root"), ["a", "new", "b"]); }],
  ["insert-append", () => { const store = baseTree(); assertAccepted(apply(store, [insert("new", "root", null)])); assert.deepEqual(childKeys(store, "root"), ["a", "b", "new"]); }],
  ["insert-subtree", () => { const store = baseTree(); assertAccepted(apply(store, [insert("new", null, null, [node("child")])])); assert.ok(keys(store).includes("child")); }],
  ["insert-duplicate-key-rejected", () => atomicReject([insert("a")], /already used/)],
  ["insert-key-seen-earlier-in-domain-lifetime-rejected", () => { const store = baseTree(); assertAccepted(apply(store, [remove("a")])); expectAtomicFatal(store, () => apply(store, [insert("a")], { baseRevision: 2, revision: 3 }), /already used/); }],
  ["insert-subtree-internal-duplicate-key-rejected", () => atomicReject([insert("new", null, null, [node("dup"), node("dup")])], /Duplicate/)],
  ["insert-before-key-not-destination-sibling-rejected", () => atomicReject([insert("new", null, "a")], /destination sibling/)],
  ["insert-over-intermediate-node-count-rejected", () => { const store = baseline(flatNodes(16_384)); expectAtomicFatal(store, () => apply(store, [insert("overflow")]), /count limit/); }],
  ["insert-over-intermediate-tree-depth-rejected", () => { const store = baseline([chain(30)]); expectAtomicFatal(store, () => apply(store, [insert("deep", "n30")]), /depth limit/); }],
  ["insert-then-later-op-targets-new-key", () => { const store = baseTree(); assertAccepted(apply(store, [insert("new"), update("new", { set: { x: "1" } })])); assert.ok(keys(store).includes("new")); }],

  ["remove-leaf", () => { const store = baseTree(); assertAccepted(apply(store, [remove("a")])); assert.equal(keys(store).includes("a"), false); }],
  ["remove-subtree-cascade", () => { const store = baseTree(); assertAccepted(apply(store, [remove("root")])); assert.deepEqual(keys(store), []); }],
  ["remove-missing-key-rejected", () => atomicReject([remove("missing")], /missing/)],
  ["remove-descendants-become-domain-lifetime-consumed", () => { const store = baseTree(); assertAccepted(apply(store, [remove("root")])); expectAtomicFatal(store, () => apply(store, [insert("a")], { baseRevision: 2, revision: 3 }), /already used/); }],
  ["remove-then-reinsert-same-patch-rejected", () => atomicReject([remove("a"), insert("a")], /already used/)],
  ["remove-then-update-same-patch-rejected", () => atomicReject([remove("a"), update("a", { set: { x: "1" } })], /missing/)],
  ["remove-then-move-same-patch-rejected", () => atomicReject([remove("a"), move("a")], /missing/)],
  ["remove-then-use-as-parent-rejected", () => atomicReject([remove("a"), insert("new", "a")], /parent/)],
  ["remove-then-use-as-before-key-rejected", () => atomicReject([remove("a"), insert("new", "root", "a")], /destination sibling/)],
  ["move-child-before-remove-parent-preserves-child", () => { const store = baseTree(); assertAccepted(apply(store, [move("a"), remove("root")])); assert.deepEqual(committedDomain(store).roots.map(({ key }) => key), ["a"]); }],

  ["move-reorder-same-parent", () => { const store = baseTree(); assertAccepted(apply(store, [move("b", "root", "a")])); assert.deepEqual(childKeys(store, "root"), ["b", "a"]); }],
  ["move-reparent", () => { const store = baseTree(); assertAccepted(apply(store, [move("b", "a")])); assert.deepEqual(childKeys(store, "a"), ["b"]); }],
  ["move-root-to-child", () => { const store = baseline([node("a"), node("b")]); assertAccepted(apply(store, [move("b", "a")])); assert.deepEqual(childKeys(store, "a"), ["b"]); }],
  ["move-child-to-root", () => { const store = baseTree(); assertAccepted(apply(store, [move("a")])); assert.deepEqual(committedDomain(store).roots.map(({ key }) => key), ["root", "a"]); }],
  ["move-detach-then-resolve-before-key", () => { const store = baseTree(); assertAccepted(apply(store, [move("a", "root", "b")])); assert.deepEqual(childKeys(store, "root"), ["a", "b"]); }],
  ["move-before-self-rejected", () => atomicReject([move("a", "root", "a")], /itself/)],
  ["move-under-descendant-rejected", () => atomicReject([move("root", "a")], /descendant/)],
  ["move-missing-target-rejected", () => atomicReject([move("missing")], /missing/)],
  ["move-missing-parent-rejected", () => atomicReject([move("a", "missing")], /parent/)],
  ["move-missing-before-key-rejected", () => atomicReject([move("a", "root", "missing")], /destination sibling/)],
  ["move-before-key-not-destination-sibling-rejected", () => atomicReject([move("a", null, "b")], /destination sibling/)],

  ["update-attrs-set", () => { const store = baseTree(); assertAccepted(apply(store, [update("root", { set: { fresh: "2" } })])); assert.equal(committedDomain(store).roots[0].attrs.fresh, "2"); }],
  ["update-attrs-remove", () => { const store = baseTree(); assertAccepted(apply(store, [update("root", { remove: ["old"] })])); assert.equal("old" in committedDomain(store).roots[0].attrs, false); }],
  ["update-data-set", () => { const store = baseTree(); assertAccepted(apply(store, [update("root", undefined, { set: { fresh: 2 } })])); assert.equal(committedDomain(store).roots[0].data.fresh, 2); }],
  ["update-data-remove", () => { const store = baseTree(); assertAccepted(apply(store, [update("root", undefined, { remove: ["old"] })])); assert.equal("old" in committedDomain(store).roots[0].data, false); }],
  ["update-missing-attrs-and-data-rejected", () => expectOutboundRejected(patch([update("root")]), /empty update/)],
  ["update-empty-attrs-delta-rejected", () => expectOutboundRejected(patch([update("root", {})]), /Delta|empty|set/)],
  ["update-empty-data-delta-rejected", () => expectOutboundRejected(patch([update("root", undefined, {})]), /Delta|empty|set/)],
  ["update-empty-set-rejected", () => expectOutboundRejected(patch([update("root", { set: {} })]), /empty/)],
  ["update-empty-remove-rejected", () => expectOutboundRejected(patch([update("root", { remove: [] })]), /empty/)],
  ["update-set-remove-same-member-rejected", () => expectOutboundRejected(patch([update("root", { set: { old: "2" }, remove: ["old"] })]), /both|set.*remove/)],
  ["update-remove-missing-member-rejected", () => atomicReject([update("root", { remove: ["missing"] })], /missing member/)],
  ["update-key-not-allowed", () => expectOutboundRejected(patch([{ ...update("root", { set: { x: "1" } }), newKey: "x" }]), /closed schema/)],
  ["update-tag-not-allowed", () => expectOutboundRejected(patch([{ ...update("root", { set: { x: "1" } }), tag: "x" }]), /closed schema/)],
  ["update-children-not-allowed", () => expectOutboundRejected(patch([{ ...update("root", { set: { x: "1" } }), children: [] }]), /closed schema/)],

  ["attrs-exact-member-count-limit", () => { const store = baseline(); const set = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`a${i}`, ""])); assertAccepted(apply(store, [update("root", { set })])); }],
  ["attrs-one-over-member-count-limit", () => { const store = baseline(); const set = Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`a${i}`, ""])); expectAtomicFatal(store, () => apply(store, [update("root", { set })]), /attrs limit/); }],
  ["data-exact-size-limit", () => { const store = baseline(); assertAccepted(apply(store, [update("root", undefined, { set: exactDataBytes() })])); }],
  ["data-one-byte-over-size-limit", () => { const store = baseline(); const data = exactDataBytes(); data.value += "x"; expectAtomicFatal(store, () => apply(store, [update("root", undefined, { set: data })]), /byte limit/); }],
  ["data-exact-relative-depth-limit", () => { const store = baseline(); assertAccepted(apply(store, [update("root", undefined, { set: { deep: nestedData(31) } })])); }],
  ["data-one-over-relative-depth-limit", () => { const store = baseline(); expectAtomicFatal(store, () => apply(store, [update("root", undefined, { set: { deep: nestedData(32) } })]), /depth limit/); }],
  ["data-array-exact-count-limit", () => { const store = baseline(); assertAccepted(apply(store, [update("root", undefined, { set: { values: Array(16_384).fill(null) } })])); }],
  ["data-array-one-over-count-limit", () => { const store = baseline(); expectAtomicFatal(store, () => apply(store, [update("root", undefined, { set: { values: Array(16_385).fill(null) } })]), /array limit/); }],
  ["data-object-exact-member-count-limit", () => { const store = baseline(); assertAccepted(apply(store, [update("root", undefined, { set: { values: objectMembers(16_384) } })])); }],
  ["data-object-one-over-member-count-limit", () => { const store = baseline(); expectAtomicFatal(store, () => apply(store, [update("root", undefined, { set: { values: objectMembers(16_385) } })]), /member limit/); }],
  ["generic-data-empty-key-valid", () => { const store = baseline(); assertAccepted(apply(store, [update("root", undefined, { set: { "": 1 } })])); }],
  ["generic-data-key-one-over-limit", () => { const store = baseline(); expectAtomicFatal(store, () => apply(store, [update("root", undefined, { set: { ["é".repeat(129)]: 1 } })]), /key limit/); }],
]);
