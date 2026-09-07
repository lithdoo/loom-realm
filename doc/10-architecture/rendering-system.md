# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Stabilizing overall / **M11 implementation slice Frozen**  
> 主要定义：Subsystem-owned business Render Domain、generation-scoped Render wire lifecycle、Renderer authoritative replica/presentation、Data/Frame/Input independence  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)  
> 被以下文档使用：[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 正式化：[Render Update v1](../15-contracts/render-update-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> M11 实施：[M11 / 01](https://github.com/lithdoo/loom-realm/blob/main/M11_01_SUBSYSTEM_RENDER_MANAGER.md) → [M11 / 05](https://github.com/lithdoo/loom-realm/blob/main/M11_05_QUALIFICATION_CLOSURE.md)  
> 最近复核：2026-09-07

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

M11 author boundary进一步冻结：成功创建的 live business Domains `<= 256`，保证 current business state始终可形成 Frozen Render v1 Registry。

当前 generation 导出的每个 wire Domain：

```text
domainId one-shot within generation
zIndex
0..N ordered roots
recursive keyed nodes
carrier-local revision continuity after baseline
```

Domain不是 Frame；同一个 business Domain可以服务多个 Frame，也可以在 zero active Frame时继续存在。

### 4.1 M11 Frozen Author Projection

M11 exact author seam：

```text
SubsystemScope.createRenderDomain(initialState) → RenderDomain
RenderDomain.replace(state): void
RenderDomain.emit(event): void
RenderDomain.close(): void
```

`RenderManager` 是 SDK internal implementation，不是 public service。Author不观察 domainId/generation/Registry/revision/Snapshot/Patch/carrier/send outcome。

成功 author mutation固定：

```text
validate Frozen Render v1 representability
→ detach caller-owned value
→ atomic local commit
→ synchronous return
```

SDK-minted `domainId` 在一个 Subsystem Runtime instance 内不复用。business Node key 在一个 business RenderDomain lifetime 内采用 stronger one-shot rule：一旦从 authoritative state移除，不得作为 later new Node lifetime重新引入。

Exact TypeScript surface / local error model以 [M11 / 01](https://github.com/lithdoo/loom-realm/blob/main/M11_01_SUBSYSTEM_RENDER_MANAGER.md) 为 implementation source of truth。

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

如果业务希望某 Domain与某 Frame同生共死，应由 business代码显式管理，不能升级成 protocol semantics，也不建立 Frame→Domain implicit registry。

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

M11 business author boundary使用更强 local invariant：Node key一旦从同一 business RenderDomain lifetime移除，即使尚未 emitted，也不得重新引入。该 local规则不改变 Frozen wire identity语义，只消除 business-key→wire-key translation与 emitted-history-dependent author validation。

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

M11 Renderer Store保持 internal，不新增 public Render subscription/presentation API；physical presentation consumer属于 M14。

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

M11 publication进一步冻结：

```text
no current carrier
→ Event不得保留到 future carrier

current carrier + Domain unbaselined
→ Event MAY bounded-pend in current carrier lifetime
→ establishing Snapshot MUST emit before Event

carrier loss / Domain removal
→ pending Event discarded
```

因此 current-carrier pending Event不是历史 replay backlog。

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

M11 author invalid usage / hard-limit rejection是 synchronous local TypeError / RangeError，不升级 Data/Runtime/Frame。

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

M11 formal qualification只关闭 Render Update v1 `subsystem-sender` 与 `renderer-receiver` role；包含 Hostra/PWA application-trace equivalence 的 `transport` role 留到 M16。

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
10. Node key在 wire Domain lifetime内 one-shot；M11 business boundary使用更强 Domain-lifetime one-shot；
11. roots/children/zIndex/tie-break构成确定 logical ordering；
12. tag是 opaque presentation identifier；
13. retained Render Event是 transient ordering barrier；current-carrier pending不跨 carrier replay；
14. stale Store不是 current authority/Patch base；
15. Render state不携 physical resource capability；
16. Render/presentation不能生成 Main InputTarget；
17. Render stream failure不等于 Runtime/Frame failure；
18. M11 author API synchronous local-only，成功值始终可表示为 Frozen Render v1；
19. M11 Renderer Store internal-only，不新增 public Render subscription surface。
