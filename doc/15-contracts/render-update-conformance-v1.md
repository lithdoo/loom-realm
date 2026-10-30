# Render Update Protocol v1 Conformance Profile

> 层级：正式契约 / Conformance Profile  
> 状态：Proposed pre-release correction / implementation and qualification pending  
> Profile 版本：1  
> fixtureSetRevision：2  
> 适用协议：`loomrealm.render-update / 1`  
> 依赖：[Render Update Protocol v1](./render-update-v1.md)、[Renderer Data Application Profile v1](./renderer-data-profile-v1.md)、[ADR 0022](../decisions/0022-render-update-v1-freeze-closure.md)、[ADR 0039](../decisions/0039-render-update-v1-resource-budget-correction.md)  
> 最近复核：2026-10-30

本文定义修订后 Render Update v1 的可观察语义与 conformance obligations；与主协议冲突时以主协议为准。

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
    | "capacity-neutrality"
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

## 4. Protocol Invariants and Capacity Neutrality

Protocol conformance 不定义统一的 message byte、JSON depth、identifier byte length、collection count、tree depth、Patch operation count、payload size、queue count 或 retained-byte cap。身份字符串必须非空且为 Unicode scalar strings；revision/baseRevision 为 positive safe integer；zIndex 为 signed safe integer。

框架不得仅因为输入超过历史实现数字或自行添加的容量阈值而拒绝有效消息。Revision 2 使用在 conformance harness 平台能够正常处理的代表性 fixture，覆盖超过旧阈值的有效输入：

- message UTF-8 bytes 超过历史 1 MiB；
- JSON nesting depth 超过历史 64；
- identity/tag/Event strings 超过历史 128 / 256 / 4096-byte thresholds；
- Registry / Node count 超过历史 256 / 16384；
- tree depth 超过历史 30；
- Patch operations 超过历史 4096；
- attrs / JSON members、array elements 超过历史 256 / 16384；
- Render data 超过历史 256 KiB 和 relative depth 32。

这些 fixture 只证明旧数字不再是 protocol rejection rule，不建立新的最大值。对应的 required fixture ids：

~~~text
legacy-message-over-1mib-not-protocol-rejected
legacy-json-depth-over-64-not-protocol-rejected
legacy-identity-tag-event-string-over-old-byte-cap-not-protocol-rejected
legacy-registry-over-256-not-protocol-rejected
legacy-node-count-over-16384-not-protocol-rejected
legacy-tree-depth-over-30-not-protocol-rejected
legacy-patch-ops-over-4096-not-protocol-rejected
legacy-attrs-and-json-members-over-old-counts-not-protocol-rejected
legacy-render-data-over-256kib-not-protocol-rejected
event-backlog-not-dropped-by-framework-capacity
serialization-error-is-local-call-failure-not-peer-protocol-fatal
local-candidate-exception-discards-candidate-not-peer-protocol-fatal
~~~

测试运行环境若因实际平台故障无法执行，记录为该环境的 execution failure，不得将其转化为协议级 numeric cap。

Conformance 继续验证：

- exact wire representation / closed schema；
- authority、identity、lifecycle、revision continuity；
- Patch operation preconditions、final structural invariants 与 atomic commit；
- Event ordering、applicability、no replay；
- 真实 serialization / local operation exception 不得伪装成 peer protocol violation；
- queue capacity 不得成为框架拒绝或静默丢弃消息的理由。

ResourceBudgetPolicy、ResourceBudgetExceeded、local-resource-exhaustion 和 sender/receiver budget compatibility 不属于本协议或 Conformance。

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
```

---

## 10. zIndex / Logical Domain Order

Required：

```text
zindex-min-safe-integer-valid
zindex-max-safe-integer-valid
zindex-below-min-safe-integer-rejected
zindex-above-max-safe-integer-rejected
higher-zindex-above-lower
same-zindex-domainid-utf8-lexical-tiebreak
registry-order-not-stacking-order
```

`zindex-min-safe-integer-valid` / `zindex-max-safe-integer-valid` 分别使用 `Number.MIN_SAFE_INTEGER` / `Number.MAX_SAFE_INTEGER`；相邻范围外值拒绝。任何 int32-only implementation 都不 conformant。

Conformance只比较 logical ordering，不比较 DOM/CSS implementation details。

---

## 11. Patch Shape / Atomicity

Required：

```text
patch-no-partial-apply
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

每个 op 按序应用并满足其自身前置条件；不得为固定 numeric cap 重扫全树；最终 candidate 满足 framework structural invariants。

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
generic-data-empty-key-valid
update-data-set-empty-key-valid
update-data-remove-empty-key-valid
render-manager-data-empty-key-authoring-valid
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
patch-insert-then-event-targets-new-lifetime
event-before-remove-targets-old-lifetime
event-order-preserved
event-not-coalesced
event-loss-not-replayed
event-backlog-is-not-dropped-by-framework-capacity
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
outbound-single-pass-json-serialization-before-send
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

## 22. Conformance Revision / Compatibility Boundary

任何实现声明 Render Update v1 conformant，必须满足 fixtureSetRevision 2 的全部 relevant role obligations。

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
application-unit encoding
failure/recovery
```

fixtureSetRevision 2 记录 ADR0039 的首次发布前 capacity-cap correction。它移除框架人为的 numeric hard limits 与容量触发的 queue drop，并增加超过历史阈值的代表性有效 fixture、无容量触发丢弃、single-pass serialization、实际本地异常分类和 atomicity 测试。Fixture revision 只版本化 conformance corpus，不是 wire protocol version；不得借 fixture revision 改变 message schema、direction、authority、ordering、revision、atomicity 或其他 wire-observable semantics。