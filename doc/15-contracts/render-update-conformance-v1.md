# Render Update Protocol v1 Conformance Profile

> 层级：正式契约 / Conformance Profile  
> 状态：Active / Normative / Frozen  
> Profile 版本：1  
> fixtureSetRevision：2
> 适用协议：`loomrealm.render-update / 1`  
> 依赖：[Render Update Protocol v1](./render-update-v1.md)、[Renderer Data Application Profile v1](./renderer-data-profile-v1.md)、[ADR 0022](../decisions/0022-render-update-v1-freeze-closure.md)  
> 最近复核：2026-10-30

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
fixtureSetRevision = 2
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
  readonly fixtureSetRevision: 2;
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
    | "representation"
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

## 4. Representation and historical-cap correction

Conformance 验证 exact Wire JSON representation、closed schema、valid Unicode scalar sequence、non-empty identity/tag/Event-name/attrs-key、positive-safe revision/baseRevision 与 signed-safe `zIndex`。不定义 Framework message/depth/count/byte/string/queue hard cap。

Historical-cap fixtures MUST 证明曾经的阈值不再构成 reject/drop/retire rule；这些数值只是回归取样，不建立新的最大值：

```text
message > 1 MiB; JSON depth > 64
domains > 256; nodes > 16,384; tree depth > 30
Patch ops > 4,096; attrs/data members or array elements > historical counts
Render/Event data > 256 KiB; identity/tag/Event strings > historical byte thresholds
zIndex outside int32 but inside signed-safe range
writer/Event backlog > historical 1024/256 thresholds
```

Invalid scalar strings、unsafe integers、sparse/augmented arrays、accessors、symbols、exotic objects、cycles、non-finite/unsupported values仍必须拒绝。getter/Proxy exception 按相应 local boundary 传播，不得延迟接受。

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
wire-message-over-historical-byte-threshold-valid
wire-json-depth-over-historical-threshold-valid
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
registry-over-historical-count-threshold-valid
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
snapshot-over-historical-node-count-valid
snapshot-over-historical-tree-depth-valid
```

---

## 10. zIndex / Logical Domain Order

Required：

```text
zindex-signed-safe-min
zindex-signed-safe-max
zindex-unsafe-low-rejected
zindex-unsafe-high-rejected
zindex-outside-int32-inside-safe-valid
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
patch-over-historical-op-count-valid
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

每个 op 按 ordered candidate 验证局部 precondition；最终 candidate 在一次 atomic commit 前满足全部 structural invariants。

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
insert-over-historical-node-count-valid
insert-over-historical-tree-depth-valid
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
attrs-over-historical-member-count-valid
data-over-historical-size-valid
data-over-historical-relative-depth-valid
data-array-over-historical-count-valid
data-object-over-historical-member-count-valid
generic-data-empty-key-valid
generic-data-key-over-historical-byte-threshold-valid
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
event-over-historical-size-depth-member-thresholds-valid
patch-insert-then-event-targets-new-lifetime
event-before-remove-targets-old-lifetime
event-order-preserved
event-not-coalesced
event-loss-not-replayed
event-backlog-over-historical-threshold-retained-fifo
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
protocol-wire-representation-violation-retires-data
local-candidate-mechanics-failure-propagates-local-cause
local-candidate-mechanics-failure-no-partial-commit
local-candidate-mechanics-failure-retires-current-data-as-local-fatal
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
outbound-representation-acceptance-before-send
outbound-authoring-error-fails-current-call-without-retiring-peer
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

任何实现声明 Render Update v1 conformant，必须满足 fixtureSetRevision 2 的全部 relevant role obligations。

以下 protocol change 必须新版本：

```text
message kind/schema
wire Domain identity/lifetime scope
Registry/baseline rules
revision continuity scope
Snapshot one-shot semantics
Patch algebra/atomicity/no-op rules
Event barrier/applicability behavior
zIndex order
Wire representation and Framework invariants
application-unit encoding
failure/recovery
```

Revision 2 记录首次实质公开发布前的 same-identity correction：删除 arbitrary capacity rules、将 zIndex 扩为 signed-safe，并新增 generation/local-failure/stack-safe/indexed-COW/backlog regressions。之后 fixtureSetRevision MAY 增加证明当前 v1 invariant 的 coverage；不得静默恢复 Framework capacity gate。
