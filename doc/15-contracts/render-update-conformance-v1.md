# Render Update Protocol v1 Conformance Profile

> 层级：正式契约 / Conformance Profile  
> 状态：Active Design / Closure Candidate  
> Profile 版本：1  
> 适用协议：`loomrealm.render-update / 1`  
> 依赖：[Render Update Protocol v1](./render-update-v1.md)、[Renderer Data Application Profile v1](./renderer-data-profile-v1.md)、[ADR 0022](../decisions/0022-render-update-v1-freeze-closure.md)  
> 最近复核：2026-08-21

本文定义 Render Update v1 如何被独立实现验证；与主协议冲突时以主协议为准。

在 ADR 0022 Accepted 且对应 hard limits 写回主协议前，本文中的数值边界属于 **freeze candidate**，不能单独用于宣称 `Frozen` conformance。

---

## 1. Conformance Claim

最终只允许完整角色声明：

```text
LoomRealm Render Update v1 Subsystem Sender Conformant
LoomRealm Render Update v1 Renderer Receiver Conformant
LoomRealm Render Update v1 Transport Mapping Conformant
```

报告至少包含：

```text
protocol = loomrealm.render-update
protocolVersion = 1
fixtureSetRevision = <tested revision>
role = subsystem-sender | renderer-receiver | transport
result = pass
```

不建立：

```text
snapshot-only compatible
patch-lite compatible
no-event compatible
known-tag compatible
```

声明支持 v1 就必须支持四种 message kind 与全部冻结语义。

---

## 2. Fixture Manifest

```ts
interface RenderUpdateFixtureManifestV1 {
  readonly fixtureFormatVersion: 1;
  readonly protocol: "loomrealm.render-update";
  readonly protocolVersion: 1;
  readonly fixtureSetRevision: number;
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
    | "snapshot"
    | "patch"
    | "event"
    | "fresh-carrier"
    | "continuity-recovery"
    | "transport-equivalence";
}
```

`fixtureSetRevision` 只描述 conformance corpus 版本，不进入 Render wire，也不是 replay/resume cursor。

---

## 3. Normalized Receiver State

Renderer harness 至少能够观察：

```text
current Data Connection identity / retired
current Domain Registry
per-domain current revision
per-domain current zIndex
per-domain authoritative roots/tree
per-domain seen domainId lifetime
per-domain seen Node key lifetime
presentation-delivered Event trace
continuity-failure reason class
```

测试只比较协议可观察结果，不要求实现暴露真实内部 Map/tree/index 结构。

Patch 测试必须证明：

```text
candidate isolated
failure => old committed state unchanged
success => exactly one atomic authoritative commit
```

---

## 4. Candidate Hard Limits

在 ADR 0022 promotion 前，本节为 freeze candidate。目标值：

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
Render data/event-data serialized size <= 262,144 bytes
Render data relative container depth   <= 32
```

String/identifier candidate：

```text
domainId            1..128 UTF-8 bytes
Node key            1..128 UTF-8 bytes
tag                 1..256 UTF-8 bytes
Event name          1..128 UTF-8 bytes
attrs member key    1..128 UTF-8 bytes
attrs member value  0..4096 UTF-8 bytes
JSON object key     1..256 UTF-8 bytes unless specialized above
```

`zIndex` candidate：

```text
safe integer
-2,147,483,648 .. 2,147,483,647
```

每个 hard limit 必须有 exactly-at 与 one-over fixture。

---

## 5. Wire / Closed Schema

基础：

```text
one carrier unit = one UTF-8 JSON text string
plain JSON-compatible values
no JSON-RPC wrapper
no Batch
no multiple Render messages in one carrier unit
unpaired surrogate rejected
```

Required fixture IDs：

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
```

Exact schemas：

```text
render.domains
    {type, domains}

render.snapshot
    {type, domainId, revision, zIndex, roots}

render.patch
    {type, domainId, baseRevision, revision, ops, zIndex?}

render.event
    {type, domainId, targetKey, name, data}

RenderNode
    {key, tag, attrs, data, children}

insert
    {op, parentKey, beforeKey, node}

remove
    {op, key}

move
    {op, key, parentKey, beforeKey}

update
    {op, key, attrs?, data?}

StringMapDelta / JsonObjectDelta
    {set?, remove?}
```

Unknown field 必须 fail closed；不得 silently ignore。

---

## 6. Identifier / UTF-8 Boundary

Fixture 必须同时覆盖 ASCII 与多字节 UTF-8。

至少：

```text
domain-id-exact-byte-limit
domain-id-one-byte-over
domain-id-empty-rejected
node-key-exact-byte-limit
node-key-one-byte-over
node-key-empty-rejected
tag-exact-byte-limit
tag-one-byte-over
event-name-exact-byte-limit
event-name-one-byte-over
attrs-key-exact-byte-limit
attrs-key-one-byte-over
attrs-value-exact-byte-limit
attrs-value-one-byte-over
utf8-multibyte-byte-count-not-js-length
```

Conformance harness MUST 按 encoded UTF-8 bytes 计算，不得按 UTF-16 code unit 数。

---

## 7. Domain Registry / Lifecycle

Required：

```text
fresh-connection-first-render-message-domains
registry-empty-valid
registry-full-replacement
registry-duplicate-domain-rejected
registry-exact-count-limit
registry-one-over-count-limit
domain-absent-present-absent
domain-id-one-shot-within-generation
removed-domain-never-reintroduced
message-before-domain-published-rejected
pending-domain-messages-discarded-after-removal
registry-coalesce-preserves-publication-barrier
```

Registry array order无 presentation 意义；fixture 不得要求特定排序副作用。

---

## 8. Snapshot

Required：

```text
snapshot-fresh-baseline-arbitrary-positive-revision
snapshot-zero-root-domain
snapshot-multiple-roots-preserve-order
snapshot-atomic-replacement
snapshot-node-key-domain-wide-unique
snapshot-node-key-duplicate-rejected
snapshot-same-live-key-tag-stable
snapshot-invalid-tree-no-partial-commit
snapshot-exact-node-count-limit
snapshot-one-over-node-count-limit
snapshot-exact-tree-depth-limit
snapshot-one-over-tree-depth-limit
snapshot-zindex-min
snapshot-zindex-max
snapshot-zindex-below-min
snapshot-zindex-above-max
post-baseline-snapshot-exact-plus-one
post-baseline-snapshot-stale-rejected
post-baseline-snapshot-gap-rejected
```

fresh carrier 不能以旧 presentation cache 作为 authoritative Patch base。

---

## 9. Patch Revision / Atomicity

Required：

```text
patch-base-matches-current
patch-revision-exactly-plus-one
patch-base-mismatch-rejected
patch-gap-revision-rejected
patch-no-partial-apply
patch-exact-op-count-limit
patch-one-over-op-count-limit
patch-zindex-only-commit
patch-zindex-and-ops-one-atomic-commit
```

任何失败 Patch 后：

```text
revision unchanged
zIndex unchanged
tree unchanged
no partial presentation authority
```

---

## 10. Patch Insert

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
insert-over-final-node-count-rejected
insert-over-final-tree-depth-rejected
insert-then-later-op-targets-new-key
```

inserted subtree 的全部 key 都必须 fresh。

---

## 11. Patch Remove / Tombstone

Required：

```text
remove-leaf
remove-subtree-cascade
remove-missing-key-rejected
remove-then-reinsert-same-patch-rejected
remove-then-update-same-patch-rejected
remove-then-move-same-patch-rejected
remove-then-use-as-parent-rejected
remove-then-use-as-before-key-rejected
move-child-before-remove-parent-preserves-child
```

Patch-local tombstone 只服务当前 Patch validation；Domain-lifetime one-shot key rule跨 Patch 保持。

---

## 12. Patch Move

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

Harness 必须按 detach → resolve destination → insert 的协议顺序验证。

---

## 13. Patch Update / attrs / data

Required：

```text
update-attrs-set
update-attrs-remove
update-data-set
update-data-remove
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
```

嵌套 object 修改通过 top-level value replacement 表达；不引入 JSON Pointer/JSON Patch。

---

## 14. Event

Required：

```text
event-after-baseline-current-target-delivered
event-before-baseline-dropped
event-stale-target-dropped
event-unknown-domain-rejected-or-stream-fatal-per-main-contract
event-after-domain-removal-not-delivered
patch-insert-then-event-targets-new-lifetime
event-before-remove-targets-old-lifetime
event-order-preserved
event-not-coalesced
event-loss-not-replayed
event-overflow-does-not-block-authoritative-progress
event-data-exact-size-limit
event-data-one-byte-over-size-limit
```

Event 不修改 authoritative revision/store。

---

## 15. Fresh Carrier / Reconnect

Required：

```text
fresh-carrier-old-publication-cursor-discarded
fresh-carrier-registry-first
fresh-carrier-snapshot-each-current-domain
fresh-carrier-no-patch-before-domain-snapshot
same-generation-reconnect-fresh-baseline
same-generation-reconnect-preserves-business-domain-lifetime
reconnect-does-not-replay-event
reconnect-does-not-fail-runtime
reconnect-does-not-unwind-frame
```

新的 carrier publication baseline 不表示新的 RenderDomain business lifetime。

---

## 16. Continuity Failure / Recovery

Required：

```text
continuity-patch-base-mismatch-retires-data
continuity-patch-precondition-failure-retires-data
continuity-invalid-final-tree-retires-data
continuity-invalid-post-baseline-snapshot-retires-data
continuity-hard-limit-violation-retires-data
continuity-unknown-authoritative-message-fail-closed
continuity-no-later-patch-applied-on-old-carrier
continuity-no-runtime-failure
continuity-no-frame-unwind
continuity-fresh-carrier-recovers-with-registry-snapshots
```

不允许 harness 通过：

```text
skip bad commit
invent missing state
request snapshot via new RPC
replay patch history
```

来修复 trace。

---

## 17. Sender Conformance

Subsystem sender 必须证明：

```text
registry-before-domain-state
fresh-carrier-snapshot-before-patch
revision-strict-plus-one-after-baseline
lastEmittedRevision-reset-per-carrier
unsent-desired-state-may-rediff
emitted-authoritative-message-never-retracted
snapshot-fallback-uses-next-revision
domain-removal-discards-pending-unsent-domain-messages
no-ack-wait
no-event-replay
outbound-preflight-before-send
```

Sender 本地生成非法 v1 message 是 implementation/programming failure，不得依赖 Renderer 宽容接收。

---

## 18. Transport Mapping Equivalence

Transport role 只验证 application mapping：

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

## 19. Freeze Gate

Render Update v1 只有在以下全部完成后才可从 `Closure Candidate / Stabilizing` 提升为 `Active / Normative / Frozen`：

```text
ADR 0022 Accepted
hard limits copied into primary Render Update v1 contract
closed schema + validation order copied into primary contract
fixtureSetRevision 1 manifest fixed
all required exact-at/one-over fixtures materialized
independent sender/receiver implementation can consume corpus
fresh-carrier / continuity recovery traces pass
contract index updated
Remaining Closure Work = none
```

Frozen 后以下变化均属于 protocol compatibility change：

```text
message kind/schema
identifier grammar/limits
hard resource limits
revision rules
Patch algebra/preconditions
Domain/Node lifecycle identity
fresh-carrier recovery
continuity-failure behavior
application-unit encoding
```
