# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Stabilizing  
> 主要定义：Subsystem-owned business Render Domain、generation-scoped Render wire lifecycle、Renderer authoritative replica/presentation、Data/Frame/Input independence  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)  
> 被以下文档使用：[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 正式化：[Render Update v1](../15-contracts/render-update-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-21

---

## 1. Goal

```text
Subsystem business state
→ declarative business Render Domains
→ generation-scoped Render publication
→ Renderer authoritative replica
→ local presentation
```

Render协议复制 authoritative presentation state，不把 Renderer变成 business authority，也不把 DOM/Canvas/WebGL命令暴露给 Subsystem。

---

## 2. Authority

Subsystem拥有：

```text
business Render Domain lifecycle
Domain desired state
Domain zIndex
Render tree authoritative state
publication intent
transient Render Event source
```

Renderer拥有：

```text
current authoritative replica when Data stream current
stale presentation cache after stream loss if product chooses
local component/presentation mapping
DOM/Canvas/WebGL resources
paint/frame scheduling
```

Main不拥有 Render Domain state。

---

## 3. Two Lifetimes

必须区分：

```text
business Render Domain lifetime
!=
Render Update wire Domain lifetime
```

业务 Domain属于 Subsystem Runtime business state。

Frozen Render v1 wire identity：

```text
(Session, subsystemKey, DataAuthority generation, domainId)
```

因此：

```text
same-generation Data carrier replacement
    → fresh publication baseline
    → same wire Domain/Node lifetime

fresh DataAuthority generation
    → fresh Render wire universe
    → business Domain MAY survive and be re-exported
```

这避免把 ordinary Data reconnect误建模成 Domain recreate，同时明确 generation 是 Data application authority epoch。

---

## 4. Domain Model

一个 Runtime：

```text
0..N business Render Domains
```

当前 generation 导出的每个 wire Domain：

```text
domainId one-shot within generation
zIndex
0..N ordered roots
recursive keyed nodes
carrier-local revision continuity after baseline
```

Domain不是 Frame；同一个 business Domain可以服务多个 Frame，也可以在 zero active Frame时继续存在。

---

## 5. Render Update Model

Frozen v1：

```text
render.domains
render.snapshot
render.patch
render.event
```

```text
Registry  → generation-scoped wire Domain lifecycle
Snapshot  → full authoritative baseline/commit
Patch     → strict carrier-local revision incremental commit
Event     → transient presentation impulse + ordering barrier
```

Renderer必须原子应用 authoritative commit，不暴露半更新 tree。

---

## 6. Data Profile / Carrier

Render Update运行在：

```text
loomrealm.renderer-data/1
```

当前 Profile静态绑定 Render Update v1。

```text
DataPlane single dispatcher
→ render.* messages
→ Render Store
```

Render implementation不得自己竞争读取 raw Data carrier。

---

## 7. Fresh Data Carrier / Per-Domain Baseline

fresh current Data carrier：

```text
first Render message = current render.domains
```

Registry 中每个 Domain独立：

```text
unbaselined
→ fresh render.snapshot
→ baselined(R)
→ patch/event
```

不存在 global Render ready。Registry可以在部分 Domain尚未 baseline 时继续变化。

旧 carrier sender cursor/Renderer Patch base不得继承为 fresh carrier authority。

same-generation fresh carrier 不创建新 wire Domain lifecycle。

---

## 8. Frame Independence

禁止隐式关系：

```text
Frame create  → create Domain
Frame active  → show Domain
Frame suspend → hide Domain
Frame close   → destroy Domain
```

如果业务希望某 Domain与某 Frame同生共死，应由 business/SDK local ownership policy显式控制，不能升级成 protocol semantics。

---

## 9. Data Independence / Stale Cache

```text
Data carrier retired
    → current Render publication authority ends
    ↛ business Domain destroyed
```

Renderer MAY保留最后合法 Store用于视觉连续性，但此时只可视为：

```text
stale presentation cache
```

它不是：

```text
current authoritative replica
fresh Patch base
Input authority
DataAuthority proof
```

恢复必须使用 fresh Registry + Snapshots。

---

## 10. Runtime Independence

business Render Domain属于 Subsystem Runtime业务 state的一部分。

Runtime terminal最终释放本 Runtime business Domains/resource；这是 Runtime cleanup，不表示 Frame/Data拥有 Domain lifecycle。

未来新 Runtime通常通过 fresh Data generation建立新的 Render wire universe。

---

## 11. Node Identity

Render node `key` 是 wire Domain-wide logical identity；同一 wire Domain lifetime内 one-shot。

```text
removed published key
→ same key cannot represent later new node lifetime
```

live key保持 stable `tag`。

same-generation reconnect保留该 identity history；fresh generation创建新的 wire universe。

---

## 12. Logical Ordering

Domain 内：

```text
roots order
children order
```

都是 authoritative logical sibling order。

Domain 间：

```text
higher zIndex = above lower zIndex
```

相同 zIndex 使用 Frozen Render v1 的 `domainId` UTF-8 lexical tie-break。

这定义 logical ordering，不规定 CSS/DOM/Canvas/WebGL realization。

---

## 13. Presentation Mapping

`tag` 是 opaque string。

Render Core不定义：

```text
known component registry
component module loading
DOM tag semantics
Canvas/WebGL object model
unknown-tag authoritative error
```

Renderer product/implementation决定如何解释 presentation tag；presentation-local failure不改变 authoritative Render Store validity。

---

## 14. Resource References

Render `data` MAY携 logical resource reference，但不得携：

```text
filesystem path capability
Content bearer
absolute privileged local URL
resource bytes as hidden capability channel
```

Renderer Resource Client通过 Content boundary解析资源。

Render Core不冻结 product-specific resource-reference schema。

---

## 15. Event Boundary

Render Event：

```text
ordered
transient
non-authoritative
no replay
may be lost
```

不能作为 persistent correctness唯一来源。

well-formed Event若 Domain/baseline/target不再 applicable：

```text
drop only
```

retained Event同时是 sender-side authoritative coalescing barrier：Event依赖的 target lifetime必须在 Event wire position前已经由 authoritative state建立。

---

## 16. Input Boundary

Render focus/component存在不能创造 User Input authority。

User Input ordinary gate仍是：

```text
Main InputTarget(S,F,A)
∩ Interest[F]
∩ Producer(C)
∩ current matching Data connection
```

Renderer presentation MAY作为某个 Producer实现的输入源，但 Render Domain本身不拥有 InputTarget。

---

## 17. Failure Boundary

Render v1区分：

```text
representation/schema/limit invalid
    → Data stream fatal

authoritative Registry/Snapshot/Patch continuity invalid
    → Data stream fatal

well-formed stale Event
    → drop

presentation-local failure
    → renderer product policy
```

Render Data stream failure：

```text
!= Runtime terminal failure
!= Frame unwind
```

---

## 18. Cross-platform Presentation

Hostra/PWA共享相同：

```text
wire identity/lifecycle
generation relationship
Registry/per-Domain baseline
revision/commit semantics
Patch algebra
Event ordering/barrier/drop semantics
logical stacking order
hard limits
failure/recovery
```

允许不同：

```text
DOM implementation
Canvas/WebGL implementation
resource cache
paint cadence
browser capability
internal tree/index strategy
```

---

## 19. Final Invariants

1. business Render authority在 Subsystem；
2. Renderer只维护 current replica + optional stale presentation cache；
3. Main/Frame不拥有 Render lifecycle；
4. Render wire identity包含 DataAuthority generation；
5. same-generation reconnect不创建新 wire Domain lifecycle；
6. fresh generation创建新的 Render wire universe，但不强制 business Domain销毁；
7. fresh carrier用 Registry + per-Domain fresh Snapshot重建 baseline；
8. Frame close/suspend不隐式 destroy/hide business Domain；
9. Data retire不 destroy business Domain；
10. Node key在 wire Domain lifetime内 one-shot；
11. roots/children/zIndex/tie-break构成确定 logical ordering；
12. tag是 opaque presentation identifier；
13. retained Render Event是 transient ordering barrier；stale Event drop；
14. stale Store不是 current authority/Patch base；
15. Render state不携 physical resource capability；
16. Render/presentation不能生成 Main InputTarget；
17. Render stream failure不等于 Runtime/Frame failure。