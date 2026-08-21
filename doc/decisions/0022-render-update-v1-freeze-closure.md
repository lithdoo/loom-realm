# ADR 0022：Render Update v1 freeze closure

> 状态：Accepted  
> 日期：2026-08-21  
> 影响范围：Render Update Protocol v1、Render Update Conformance v1、未来 `@loomrealm/data` Render codec/validator、Subsystem RenderManager、Renderer Render Store、M8/M11 qualification  
> 依赖：[Render Update Protocol v1](../15-contracts/render-update-v1.md)、[Renderer Data Application Profile v1](../15-contracts/renderer-data-profile-v1.md)、[Wire package design](../../packages/wire/DESIGN.md)  
> 不改变：四种 Render message kind、Subsystem-owned Render authority、Frame/Input/Content boundary、无 ACK/NACK/replay/resync 的方向

## 背景

Render Update v1 的主干语义已经稳定，但在首次实现前仍存在会迫使两端自行选择的边缘事实：

```text
Data generation 与 Render Domain wire lifetime 的关系
fresh carrier 上每个 Domain 何时可接 Patch/Event
revision 是否跨 carrier 比较
Event 是否构成 pending authoritative state 的 ordering barrier
stale Event 应 drop 还是 retire stream
Snapshot 如何约束 one-shot key history
empty Patch / empty Update 是否允许
zIndex tie 是否确定
hard limits / exact schema / validation order
```

这些不是 implementation tuning；它们会改变跨实现 observable behavior，因此必须在 v1 freeze 前关闭。

本 ADR 接受最终 closure；主协议是 normative source of truth。本文记录为什么这样关闭，不取代主协议正文。

---

## 决策 1：current v1 直接闭合并 Frozen

当前不存在已部署第三方 Render v1 compatibility obligation，因此：

```text
close current v1 directly
no fake v2
no legacy compatibility alias
```

Frozen v1 保持只有：

```text
render.domains
render.snapshot
render.patch
render.event
```

不加入 ACK/NACK/resync RPC、Component Profile、tag semantic grammar 或第五种消息。

---

## 决策 2：区分 business Domain 与 generation-scoped wire Domain

Subsystem business Render Domain lifetime 不由 Data carrier拥有。

Render wire identity 固定为：

```text
(Session, subsystemKey, DataAuthority generation, domainId)
```

因此：

```text
same-generation carrier reconnect
    → same wire Domain/Node lifetime
    → fresh publication baseline only

fresh DataAuthority generation
    → fresh Render wire universe
    → business Domain MAY survive and be re-exported
```

这同时满足：

```text
Data carrier retire != business Domain destroy
fresh generation = fresh Data application authority epoch
```

Node one-shot history与 wire Domain lifetime一致。

---

## 决策 3：fresh carrier 使用 per-Domain baseline state

每个 current carrier + Domain：

```text
unbaselined → baselined(R)
```

fresh carrier 第一条 Render message MUST 是 current `render.domains`。

Registry 中每个 Domain独立从 unbaselined 开始：

```text
first authoritative state = Snapshot
Patch before Snapshot       = protocol-fatal
well-formed Event before baseline = drop
```

不存在 global Render ready/baseline-complete message。Registry 可在 baseline 过程中继续变化。

---

## 决策 4：revision continuity 是 carrier-local

fresh carrier baseline Snapshot 的 revision 可为任意 positive safe integer。

同一 carrier baseline 后：

```text
next authoritative commit = currentRevision + 1
```

Receiver不得把旧 carrier曾观察的 numeric revision作为 fresh carrier acceptance gate。Numeric equality没有跨 carrier state-equality语义；full Snapshot才是 fresh carrier authority。

revision 到 `Number.MAX_SAFE_INTEGER` 后不得 wrap/reuse。

---

## 决策 5：明确 emitted boundary

`emitted` 固定指：

> application unit 已被 current carrier 的 ordered send boundary 成功接受。

一旦 emitted：

```text
no retract
no reorder
no adapter/application retry
```

remote delivery ambiguity由 carrier loss + fresh baseline恢复，不使用 ACK。

---

## 决策 6：Event 是 transient message，也是 ordering/coalescing barrier

Event 本身：

```text
ordered
transient
non-authoritative
no replay
may be lost
```

如果 Event 被保留等待发送，sender MUST确保 Event wire position 之前已经 emitted 足够 authoritative state，使 target lifetime 在该位置成立。

因此 retained Event 是 pending authoritative coalescing barrier：不得把它依赖的 commit 移到 Event 后或 coalesce away。

如果 Event 尚未 emitted，sender MAY按 bounded-backpressure policy丢弃；丢弃后 barrier消失。

---

## 决策 7：失败明确分三类

### Protocol-fatal

任何 message 的 representation/schema/hard-limit 错误：

```text
→ retire current Data Connection
```

### Authoritative continuity failure

Registry/Snapshot/Patch 的 lifecycle/revision/precondition/candidate 错误：

```text
→ retire current Data Connection
```

### Transient Event applicability miss

合法 Event 但：

```text
Domain absent
Domain unbaselined
target missing/stale
```

```text
→ drop only
```

presentation-local component/DOM/Canvas/WebGL failure不改变 authoritative Render validity，也不得伪造成 Runtime/Frame failure。

---

## 决策 8：Snapshot 与 one-shot key history

Snapshot 是 full replacement，但不是 identity reset。

同一 wire Domain lifetime：

```text
live→live key keeps tag
absent→present key must be never-published-fresh
present→absent key becomes permanently consumed
```

same-generation fresh carrier baseline 可以再次包含此前仍 live 的 keys；fresh generation 才重置 wire identity universe。

---

## 决策 9：禁止结构性 empty mutation

Patch：

```text
ops.length > 0 OR zIndex present
```

因此 empty ops + no zIndex非法。

Update 必须包含 attrs/data 至少一个；每个提供的 Delta 必须至少有 non-empty set/remove 之一。

协议不要求检测 semantic no-op；写回相同值仍可形成 commit。

---

## 决策 10：zIndex logical order完全确定

```text
higher zIndex = logically above
```

同值 tie-break：

```text
UTF-8 byte lexical(domainId)
smaller below larger
```

Registry order不参与 stacking。协议只冻结 logical order，不规定 DOM/CSS/Canvas 实现。

---

## 决策 11：Wire / exact schema / hard limits Frozen

Application unit：

```text
one UTF-8 JSON text string
= exactly one Render message object
```

解析沿用 frozen Wire / ECMAScript `JSON.parse` observable semantics，不增加 duplicate-member tokenizer。Parse 后 protocol object仍 exact closed schema。

Connection-wide：

```text
message bytes                  <= 1,048,576
JSON container depth           <= 64
```

Identity/labels：

```text
domainId             1..128 UTF-8 bytes
Node key             1..128
tag                  1..256
Event name           1..128
attrs key            1..128
attrs value          0..4096
generic data key     0..256
```

Structural：

```text
Domains / Registry             <= 256
Nodes / Domain                 <= 16,384
tree depth                     <= 30
Patch ops                      <= 4,096
attrs / Node                   <= 256
data array elements            <= 16,384
data object members            <= 16,384
data/event-data compact bytes  <= 262,144
data relative depth            <= 32
zIndex                         signed 32-bit integer
```

Patch intermediate candidate after every op也必须处于 hard structural bounds 内。

---

## 决策 12：Data loss 后旧 Store 只是 presentation cache

Data stream不再 current 时：

```text
last valid Render Store MAY remain visually
BUT
it is not current authoritative replica
it is not fresh Patch base
it does not create Input/Data authority
```

恢复统一：

```text
fresh current carrier
→ Registry
→ fresh Snapshot each current Domain
→ Patch/Event
```

---

## 决策 13：Conformance matrix 属于 Frozen design，执行实现属于 qualification

`render-update-conformance-v1.md` 冻结 `fixtureSetRevision = 1` 的 required scenario matrix。

这份 matrix 本身属于协议设计闭环；未来 `@loomrealm/data` / Subsystem / Renderer 实现必须把它 materialize 为 executable tests 才能声明实现 conformant，但“尚未写实现测试代码”不再阻止 v1 semantic freeze。

这与 Frame / Call v1 的治理方式一致：协议先冻结可观察事实与 conformance obligations，实现随后证明自己满足它们。

---

## 结果

Render Update v1 自本 ADR Accepted 起进入：

```text
Active / Normative / Frozen
```

以后以下变化必须新 protocol version：

```text
message kinds/schema
wire Domain identity/lifetime scope
Registry/baseline semantics
revision continuity scope
Patch algebra/atomicity
Node one-shot/tag rules
Event barrier/drop semantics
zIndex logical ordering
hard limits
encoding/validation/failure/recovery
```

implementation tuning 仍不冻结：

```text
Event queue concrete capacity/drop preference
Patch-vs-Snapshot heuristic
internal tree/index representation
presentation scheduler/paint cadence
DOM/Canvas/WebGL mapping
component implementation
```