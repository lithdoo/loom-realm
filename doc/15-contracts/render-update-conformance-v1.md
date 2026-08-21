# Render Update Protocol v1 Conformance Profile

> 层级：正式契约 / Conformance Profile  
> 状态：Active / Normative / Frozen  
> Profile 版本：1  
> fixtureSetRevision：1  
> 适用协议：`loomrealm.render-update / 1`  
> 依赖：[Render Update Protocol v1](./render-update-v1.md)、[Renderer Data Application Profile v1](./renderer-data-profile-v1.md)、[ADR 0022](../decisions/0022-render-update-v1-freeze-closure.md)  
> 最近复核：2026-08-21

本文定义 Frozen Render Update v1 如何被独立实现验证；与主协议冲突时以主协议为准。

---

## 1. Conformance Claim

只允许完整角色声明：

```text
LoomRealm Render Update v1 Subsystem Sender Conformant
LoomRealm Render Update v1 Renderer Receiver Conformant
LoomRealm Render Update v1 Transport Mapping Conformant
```

报告至少包含：

```text
protocol = loomrealm.render-update
protocolVersion = 1
fixtureSetRevision = 1
role = subsystem-sender | renderer-receiver | transport
result = pass
```

不建立 partial compatibility：

```text
snapshot-only
patch-lite
no-event
known-tag-only
reconnect-without-history
```

---

## 2. Fixture Manifest Contract

概念 manifest：

```ts
interface RenderUpdateFixtureManifestV1 {
  readonly fixtureFormatVersion: 1;
  readonly protocol: "loomrealm.render-update";
  readonly protocolVersion: 1;
  readonly fixtureSetRevision: 1;
  readonly fixtures: readonly RenderUpdateFixtureDescriptorV1[];
}

interface RenderUpdateFixtureDescriptorV1 {
  readonly id: string;
  readonly role:
    | "subsystem-sender"
    | "renderer-receiver"
    | "transport";
  readonly group:
    | "wire-schema"
    | "limits"
    | "registry-lifecycle"
    | "baseline-revision"
    | "snapshot"
    | "patch"
    | "event"
    | "fresh-carrier"
    | "continuity-recovery"
    | "transport-equivalence";
}
```

未来 executable corpus 可以采用 JSON fixtures + deterministic generators；不得改变本 revision 规定的 expected accept/reject/drop/retire/state outcome。

---

## 3. Normalized Observable State

Renderer harness 至少可观察：

```text
current Data carrier current|retired
current generation
current Domain Registry
per-domain publication state unbaselined|baselined
per-domain current revision
per-domain zIndex
per-domain roots/tree
observed one-shot Domain/Node history when available
logical Event delivery trace
continuity/protocol failure class
stale-presentation-cache marker after Data retirement
```

不要求实现暴露真实内部 Map/tree/index。

Patch case 必须证明：

```text
failure → previous committed state unchanged
success → one atomic authoritative commit
```

---

## 4. Frozen Hard Limits

```text
application message UTF-8 bytes        <= 1,048,576
JSON container nesting depth           <= 64
render.domains entries                 <= 256
RenderNode count / Domain State        <= 16,384
Render tree depth                      <= 30
Patch operations                       <= 4,096
attrs members / Node                   <= 256
Render data array elements             <= 16,384
Render data object members             <= 16,384
Render data/event-data compact size    <= 262,144 UTF-8 bytes
Render data relative container depth   <= 32
```

Strings：

```text
domainId            1..128 UTF-8 bytes
Node key            1..128
tag                 1..256
Event name          1..128
attrs member key    1..128
attrs member value  0..4096
generic data key    0..256
```

`zIndex`：

```text
-2,147,483,648 .. 2,147,483,647
```

每个 hard boundary至少验证：

```text
exactly-at → ACCEPT
one-over   → REJECT + retire when inbound protocol message
```

UTF-8 fixtures必须覆盖多字节字符，防止 UTF-16 `.length` 实现错误。

---

## 5. Wire / Closed Schema

Required：

```text
wire-valid-domains
wire-valid-snapshot
wire-valid-patch
wire-valid-event
wire-top-level-not-object
wire-invalid-json
wire-unpaired-surrogate
wire-unknown-type
wire-extra-top-level-member
wire-missing-required-member
wire-wrong-member-type
wire-message-exact-byte-limit
wire-message-one-byte-over
wire-json-depth-exact-limit
wire-json-depth-one-over
wire-duplicate-source-member-follows-wire-jsonparse
```

Exact schemas：

```text
render.domains   {type, domains}
render.snapshot  {type, domainId, revision, zIndex, roots}
render.patch     {type, domainId, baseRevision, revision, ops, zIndex?}
render.event     {type, domainId, targetKey, name, data}
RenderNode       {key, tag, attrs, data, children}
insert           {op, parentKey, beforeKey, node}
remove           {op, key}
move             {op, key, parentKey, beforeKey}
update           {op, key, attrs?, data?}
Delta            {set?, remove?}
```

Source-level duplicate member不要求 second tokenizer；observable result跟随 frozen Wire/ECMAScript `JSON.parse`。

---

## 6. Wire Domain Lifetime / Generation

Required：

```text
same-generation-reconnect-preserves-wire-domain-lifetime
same-generation-reconnect-preserves-node-one-shot-history-at-sender
fresh-generation-creates-new-render-wire-universe
fresh-generation-may-reexport-surviving-business-domain
same-string-domain-id-new-generation-is-fresh-wire-identity
same-string-node-key-new-generation-is-fresh-wire-identity
```

不得把 ordinary same-generation carrier replacement解释为 Domain recreation。

---

## 7. Registry / Lifecycle

Required：

```text
fresh-carrier-first-render-message-domains
registry-empty-valid
registry-full-replacement-atomic
registry-duplicate-domain-rejected
registry-exact-count-limit
registry-one-over-count-limit
domain-absent-present-absent
domain-present-present-same-lifetime
emitted-domain-id-one-shot-within-generation
removed-domain-id-reintroduced-same-generation-rejected
unemitted-coalesced-domain-does-not-consume-wire-id
registry-removal-retires-authoritative-replica
pending-domain-messages-discarded-after-removal
registry-order-does-not-affect-stacking
```

---

## 8. Per-Domain Baseline / Revision

Required：

```text
registry-add-domain-starts-unbaselined
unbaselined-first-authoritative-message-snapshot
patch-before-baseline-retires-data
wellformed-event-before-baseline-drops
registry-may-change-before-all-domains-baselined
newly-added-domain-baselines-independently
removed-unbaselined-domain-needs-no-snapshot
fresh-snapshot-arbitrary-positive-revision
fresh-snapshot-not-compared-with-old-carrier-revision
fresh-snapshot-same-numeric-revision-different-carrier-valid
post-baseline-snapshot-exact-plus-one
post-baseline-snapshot-stale-rejected
post-baseline-snapshot-gap-rejected
patch-base-matches-current
patch-revision-exactly-plus-one
patch-base-mismatch-rejected
patch-gap-revision-rejected
revision-never-wraps
```

---

## 9. Snapshot / Identity History

Required：

```text
snapshot-zero-root-domain
snapshot-multiple-roots-preserve-order
snapshot-atomic-replacement
snapshot-node-key-domain-wide-unique
snapshot-node-key-duplicate-rejected
snapshot-live-key-tag-stable
snapshot-live-key-tag-change-rejected
snapshot-fresh-key-introduced
snapshot-previously-removed-key-reintroduced-rejected
snapshot-removal-consumes-key
same-generation-fresh-baseline-can-contain-still-live-key
snapshot-invalid-tree-no-partial-commit
snapshot-exact-node-count-limit
snapshot-one-over-node-count-limit
snapshot-exact-tree-depth-limit
snapshot-one-over-tree-depth-limit
```

---

## 10. zIndex / Logical Domain Order

Required：

```text
zindex-min
zindex-max
zindex-below-min
zindex-above-max
higher-zindex-above-lower
same-zindex-domainid-utf8-lexical-tiebreak
registry-order-not-stacking-order
```

Conformance只比较 logical ordering，不比较 DOM/CSS implementation details。

---

## 11. Patch Shape / Atomicity

Required：

```text
patch-no-partial-apply
patch-exact-op-count-limit
patch-one-over-op-count-limit
patch-empty-ops-without-zindex-rejected
patch-empty-ops-with-zindex-valid
patch-zindex-only-commit
patch-zindex-and-ops-one-atomic-commit
semantic-noop-not-required-to-reject
```

失败后：

```text
revision unchanged
zIndex unchanged
tree unchanged
```

每个 op 后的 intermediate candidate也必须满足 hard structural limits。

---

## 12. Insert

Required：

```text
insert-root
insert-child
insert-before-sibling
insert-append
insert-subtree
insert-duplicate-key-rejected
insert-key-seen-earlier-in-domain-lifetime-rejected
insert-subtree-internal-duplicate-key-rejected
insert-before-key-not-destination-sibling-rejected
insert-over-intermediate-node-count-rejected
insert-over-intermediate-tree-depth-rejected
insert-then-later-op-targets-new-key
```

---

## 13. Remove / Tombstone

Required：

```text
remove-leaf
remove-subtree-cascade
remove-missing-key-rejected
remove-descendants-become-domain-lifetime-consumed
remove-then-reinsert-same-patch-rejected
remove-then-update-same-patch-rejected
remove-then-move-same-patch-rejected
remove-then-use-as-parent-rejected
remove-then-use-as-before-key-rejected
move-child-before-remove-parent-preserves-child
```

---

## 14. Move

Required：

```text
move-reorder-same-parent
move-reparent
move-root-to-child
move-child-to-root
move-detach-then-resolve-before-key
move-before-self-rejected
move-under-descendant-rejected
move-missing-target-rejected
move-missing-parent-rejected
move-missing-before-key-rejected
move-before-key-not-destination-sibling-rejected
```

---

## 15. Update / Delta

Required：

```text
update-attrs-set
update-attrs-remove
update-data-set
update-data-remove
update-missing-attrs-and-data-rejected
update-empty-attrs-delta-rejected
update-empty-data-delta-rejected
update-empty-set-rejected
update-empty-remove-rejected
update-set-remove-same-member-rejected
update-remove-missing-member-rejected
update-key-not-allowed
update-tag-not-allowed
update-children-not-allowed
attrs-exact-member-count-limit
attrs-one-over-member-count-limit
data-exact-size-limit
data-one-byte-over-size-limit
data-exact-relative-depth-limit
data-one-over-relative-depth-limit
data-array-exact-count-limit
data-array-one-over-count-limit
data-object-exact-member-count-limit
data-object-one-over-member-count-limit
generic-data-empty-key-valid
generic-data-key-one-over-limit
```

---

## 16. Event / Barrier

Required：

```text
event-after-baseline-current-target-delivered
event-before-baseline-dropped
wellformed-event-unknown-domain-dropped
wellformed-event-after-domain-removal-dropped
wellformed-event-stale-target-dropped
malformed-event-retires-data
oversize-event-retires-data
patch-insert-then-event-targets-new-lifetime
event-before-remove-targets-old-lifetime
event-order-preserved
event-not-coalesced
event-loss-not-replayed
event-overflow-does-not-block-authoritative-progress
retained-event-blocks-authoritative-coalesce-across-barrier
dropped-unemitted-event-releases-coalescing-barrier
```

Protocol logical delivery不要求 physical paint/vsync。

---

## 17. Backpressure / Emitted Boundary

Required：

```text
emitted-means-current-carrier-ordered-send-accepted
emitted-authoritative-message-never-retracted
send-accepted-then-loss-no-retry
unsent-desired-state-may-rediff
snapshot-fallback-uses-next-revision
registry-unsent-latest-state-coalescing
retained-event-preserves-causal-wire-position
domain-removal-discards-pending-unsent-domain-messages
```

---

## 18. Carrier Loss / Recovery

Required：

```text
carrier-loss-ends-current-render-stream
old-store-becomes-stale-presentation-cache
old-store-not-patch-base
old-store-not-input-or-data-authority
fresh-carrier-registry-first
fresh-carrier-snapshot-each-current-domain
same-generation-reconnect-fresh-publication-baseline
same-generation-reconnect-does-not-recreate-wire-domain
reconnect-does-not-replay-event
reconnect-does-not-fail-runtime
reconnect-does-not-unwind-frame
```

---

## 19. Failure Classification

Required：

```text
protocol-invalid-json-retires-data
protocol-unknown-type-retires-data
protocol-closed-schema-violation-retires-data
protocol-hard-limit-violation-retires-data
continuity-domain-lifecycle-violation-retires-data
continuity-patch-before-baseline-retires-data
continuity-patch-base-mismatch-retires-data
continuity-patch-precondition-failure-retires-data
continuity-invalid-final-tree-retires-data
continuity-no-later-patch-applied-on-old-carrier
event-applicability-miss-drop-only
presentation-local-failure-does-not-mutate-authoritative-store
render-failure-does-not-fail-runtime
render-failure-does-not-unwind-frame
fresh-carrier-recovers-with-registry-snapshots
```

---

## 20. Sender Conformance

Subsystem sender必须证明：

```text
registry-before-domain-state
fresh-carrier-snapshot-before-patch
fresh-carrier-snapshot-before-retained-event-targeting-domain
revision-strict-plus-one-after-baseline
lastEmittedRevision-reset-per-carrier
same-generation-one-shot-history-retained
unsent-desired-state-may-rediff
emitted-authoritative-message-never-retracted
snapshot-fallback-uses-next-revision
domain-removal-discards-pending-unsent-domain-messages
retained-event-is-coalescing-barrier
no-ack-wait
no-event-replay
outbound-preflight-before-send
```

Sender 本地产生非法 v1 message 是 implementation/programming failure；不得依赖 Renderer 宽容解析。

---

## 21. Transport Mapping Equivalence

```text
Desktop WebSocket
    one complete text message
    = one UTF-8 JSON text application unit

PWA MessagePort
    postMessage(string)
    = one UTF-8 JSON text application unit
```

Required：

```text
websocket-text-unit
websocket-binary-not-render-application-unit
messageport-string-unit
messageport-structured-object-does-not-widen-model
message-boundary-preserved
per-direction-order-preserved
loss-observable
adapter-no-retry
adapter-no-duplicate
hostra-pwa-same-render-application-trace
```

---

## 22. Frozen Compatibility Boundary

任何实现声明 Render Update v1 conformant，必须满足 fixtureSetRevision 1 的全部 relevant role obligations。

以下 protocol change 必须新版本：

```text
message kind/schema
wire Domain identity/lifetime scope
Registry/baseline rules
revision continuity scope
Snapshot one-shot semantics
Patch algebra/atomicity/no-op rules
Event barrier/drop behavior
zIndex order
hard limits
application-unit encoding
failure/recovery
```

fixtureSetRevision 后续 MAY只增加“证明既有 Frozen v1 事实”的 coverage；不得借 fixture revision 改变 v1 semantics。