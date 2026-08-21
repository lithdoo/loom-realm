# ADR 0022：Render Update v1 freeze closure baseline

> 状态：Proposed  
> 日期：2026-08-21  
> 影响范围：Render Update Protocol v1、未来 `@loomrealm/data` Render codec/validator、Subsystem RenderManager、Renderer Render Store、M8/M11 conformance  
> 依赖：[Render Update Protocol v1](../15-contracts/render-update-v1.md)、[Renderer Data Application Profile v1](../15-contracts/renderer-data-profile-v1.md)、[Wire package design](../../packages/wire/DESIGN.md)  
> 不改变：四种 Render message kind、Domain/Node one-shot identity、Snapshot/Patch/Event 语义、Patch algebra、fresh-carrier recovery、Frame/Input/Data authority boundary

## 背景

Render Update v1 已经进入 `Active Design / Closure Candidate`。当前核心语义已经闭合：

```text
Subsystem → Renderer only
render.domains
render.snapshot
render.patch
render.event

Domain Registry owns lifecycle
Snapshot owns full authoritative baseline/commit
Patch owns strict R→R+1 atomic incremental commit
Event owns transient presentation impulse
```

当前正式契约仍明确剩余：

```text
hard wire/tree numeric limits
identifier byte limits/grammar
zIndex range
closed-schema encoding details
Snapshot/Patch/Event/Registry fixture matrix
```

如果这些边界不在首次实现前写死，Desktop/PWA、Subsystem/Renderer 两端会被迫自行选择大小、depth、identifier、schema rejection 和 validation order，最终会形成不可证明的“看起来兼容”。

本 ADR 的目标不是重新设计 Render，而是给 current v1 建立 freeze closure baseline。

---

## 决策 1：继续直接收口 current v1，不创建 fake v2

当前不存在已部署的第三方 Render Update v1 compatibility obligation。

因此本次 closure：

```text
update current v1 directly
no Render Update v2
no compatibility alias
no fifth Render message kind
no ACK/NACK/resync RPC
no Component Profile
no tag semantic grammar
```

后续一旦 v1 正式 Frozen，任何不兼容 wire/application semantics 变化必须走正常版本演进。

---

## 决策 2：统一 application-unit 与 representation baseline

Render Update v1 application unit：

```text
one carrier application unit
= one UTF-8 JSON text string
= exactly one Render Update message object
```

Connection-wide hard gate：

```text
max application message UTF-8 bytes    1,048,576
max JSON container nesting depth       64
```

所有字符串必须是有效 Unicode scalar sequence；unpaired surrogate 必须拒绝。

Render Update 不增加第二套 JSON tokenizer/parser。解析沿用 Wire：

```text
raw string
→ @loomrealm/wire parseJsonText semantics
→ parsed JsonValue
→ Render Update closed-schema/domain validation
```

---

## 决策 3：identifier 与 label limits

Current v1 freeze candidate：

```text
domainId            1..128 UTF-8 bytes
Node key            1..128 UTF-8 bytes
tag                 1..256 UTF-8 bytes
Event name          1..128 UTF-8 bytes
attrs member key    1..128 UTF-8 bytes
attrs member value  0..4096 UTF-8 bytes
JSON object key     1..256 UTF-8 bytes where not otherwise specialized
```

语义：

```text
domainId/key
    non-empty opaque identity strings
    no semantic grammar
    no normalization
    one-shot lifecycle rules remain owned by Render protocol

tag
    opaque label only
    no known-tag registry
    no component discovery/loading semantics

Event name
    opaque presentation-event name
    no global registry
```

这些字段按 actual UTF-8 byte count 验证，不按 JavaScript UTF-16 `.length`。

---

## 决策 4：structural hard limits

Current v1 freeze candidate：

```text
max domains in one render.domains Registry     256
max RenderNode count in one Domain State       16,384
max Render tree depth                           30
max Patch operations                            4,096
max attrs members per Node                      256
max array elements inside Render data           16,384
max object members inside Render data object    16,384
max Render data/event-data serialized bytes     262,144
max Render data relative container depth        32
```

`Render tree depth`：root Node depth = 1；沿 `children` 每下降一层 +1。

Node count 计算整个 `roots[]` forest 的全部 live Node；inserted subtree 也必须在 candidate/final validation 中计入。

`data` / Event `data` 的 size 是该 JSON object 自身按 Render/Wire mapping 序列化后的 UTF-8 bytes；同时仍受整条 application message 1 MiB 上限约束。

这些是 interoperability/resource-safety limits，不是 Renderer implementation capacity 目标。实现可以内部使用更高容量，但不能拒绝处于 v1 合法 hard boundary 内的消息。

---

## 决策 5：`zIndex` 冻结为 signed 32-bit integer range

```text
zIndex MUST be safe integer
-2,147,483,648 <= zIndex <= 2,147,483,647
```

协议只定义 Domain ordering input value，不定义 CSS/DOM/Canvas/WebGL 的具体映射。

Renderer implementation 可以使用任意内部 presentation strategy，但不能对合法 v1 zIndex 再施加 platform-specific protocol rejection。

---

## 决策 6：closed schema 必须 exact

所有 v1 protocol objects 都是 closed schema。

Exact key set：

```text
render.domains
    type, domains

render.snapshot
    type, domainId, revision, zIndex, roots

render.patch
    type, domainId, baseRevision, revision, ops
    optional: zIndex

render.event
    type, domainId, targetKey, name, data

RenderNode
    key, tag, attrs, data, children

insert
    op, parentKey, beforeKey, node

remove
    op, key

move
    op, key, parentKey, beforeKey

update
    op, key
    optional: attrs, data

StringMapDelta / JsonObjectDelta
    optional: set, remove
```

未知 member、missing required member、wrong primitive/container type 都必须拒绝；不得忽略 unknown fields 以实现“向前兼容”。

`undefined` 不存在于 application model；optional 表示 member absence。

---

## 决策 7：validation order 固定

Inbound receiver baseline：

```text
carrier string
→ actual UTF-8 byte gate
→ Wire parseJsonText
→ generic JSON representation/depth gate
→ top-level type discrimination
→ exact message schema
→ field/identifier/count/size limits
→ current Domain/lifecycle publication barrier
→ revision continuity
→ message-specific semantic/precondition validation
→ isolated candidate mutation when applicable
→ final candidate structural/one-shot/tag-stability validation
→ atomic commit/delivery
```

目的：

```text
representation invalid data never reaches Render authority logic
schema-invalid data never partially mutates store
Patch precondition failure never partially applies
final invalid candidate never becomes presentation authority
```

不冻结 human-readable error wording；冻结 accept/reject/retire behavior 与 authoritative state outcome。

---

## 决策 8：continuity failure 仍只退役 Data stream

以下继续属于 Render authoritative continuity failure：

```text
revision mismatch/gap
Patch precondition failure
invalid final candidate
hard schema/size/depth/identifier/structural-limit violation
malformed authoritative Render message
```

恢复保持：

```text
retire current Data Connection
→ if DataAuthority still current, establish fresh carrier
→ render.domains(current Registry)
→ fresh Snapshot for each current Domain
→ ordinary Patch/Event
```

不得升级为：

```text
Runtime terminal failure
Frame unwind
Render ACK/NACK/replay protocol
```

---

## 决策 9：fixture closure 必须验证 exact-at / one-over

所有 hard limit 必须至少有：

```text
exactly-at-limit → ACCEPT
one-over-limit   → REJECT / retire current Render Data stream
```

UTF-8 byte boundary fixture必须包含多字节字符，防止实现错误使用 UTF-16 code unit count。

Fixture corpus 至少覆盖：

```text
wire/schema
identifier-byte-boundary
message-byte-boundary
JSON-depth-boundary
registry-count-boundary
node-count-boundary
tree-depth-boundary
patch-op-boundary
attrs-boundary
data-size/depth-boundary
zIndex min/max/over-boundary
fresh-carrier baseline
revision continuity
Patch atomicity
one-shot identity
Event ordering/drop
continuity failure → fresh-carrier recovery
```

---

## 决策 10：不冻结 implementation tuning

继续不协议化：

```text
Event FIFO concrete capacity
Event drop-oldest/drop-newest policy
Patch-vs-Snapshot cost threshold
internal tree/index representation
copy-on-write/persistent-tree strategy
presentation scheduler
paint/vsync timing
DOM/Canvas/WebGL mapping
component factory/registry
```

这些选择不能改变 v1 wire acceptance、authoritative state、ordering/recovery observable semantics。

---

## 推进门槛

本 ADR 合并后仍不自动把 Render Update v1 标为 Frozen。

Promotion checklist：

```text
1. 把本 ADR 的 accepted hard limits/validation order写入 render-update-v1.md
2. 建立 Render Update v1 Conformance Profile / fixture manifest
3. 为每个 hard boundary建立 exact-at / one-over fixtures
4. 审核四种 message schema + Patch op schema 无开放字段
5. 审核 fresh-carrier / continuity failure traces
6. render-update-v1.md Remaining Closure Work 清零
7. contract index 更新为 Active / Normative / Frozen
```

在上述步骤完成前，协议仍保持 `Closure Candidate / Stabilizing`。
