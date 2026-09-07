# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Stabilizing overall / **M11 implementation slice Frozen**  
> 主要定义：Subsystem-owned business Render Domain、generation-scoped Render wire lifecycle、Renderer authoritative replica/presentation、Data/Frame/Input independence  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)  
> 被以下文档使用：[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 正式化：[Render Update v1](../15-contracts/render-update-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> M11 实施：[M11 / 01](../../M11_01_SUBSYSTEM_RENDER_MANAGER.md) → [M11 / 05](../../M11_05_QUALIFICATION_CLOSURE.md)  
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
Domain desired state / zIndex / tree
transient Render Event intent
```

Renderer拥有：

```text
current authoritative replica when Data stream current
optional stale presentation cache after stream loss
local presentation/resources/paint scheduling
```

Main不拥有 Render Domain state。Frame/Data/Renderer currentness都不能创造或销毁 business Domain authority。

---

## 3. Two Lifetimes

```text
business Render Domain lifetime
!= Render Update wire Domain lifetime
!= Data carrier lifetime
```

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

ordinary reconnect不是 Domain recreation。

---

## 4. Frozen M11 Author Projection

M11 把 business Render authority投影成一个窄的同步 local capability：

```text
SubsystemScope.createRenderDomain(initialState) → RenderDomain
RenderDomain.replace(state)
RenderDomain.emit(event)
RenderDomain.close()
```

`RenderManager` 只存在于 SDK internal implementation，不是 author service。

Author 不观察：

```text
domainId / generation / Registry / revision
Snapshot / Patch / carrier / send outcome
```

成功 author mutation 固定：

```text
validate Frozen Render-v1 representability
→ detach caller-owned value
→ atomic local commit
→ return synchronously
```

Author usage error是 local error，不是 Data/Runtime/Frame failure。

SDK-minted `domainId` 在一个 Subsystem Runtime instance 内不复用。business Node key 在一个 business RenderDomain lifetime 内采用 stronger one-shot rule：一旦从 authoritative state移除，不得作为新 Node lifetime重新引入。该 stronger local rule用于避免 emitted-history-dependent author validation 与 identity translation layer。

Exact TypeScript surface / local error model 以 [M11 / 01](../../M11_01_SUBSYSTEM_RENDER_MANAGER.md) 为 implementation source of truth。

---

## 5. Domain Model

一个 Runtime：

```text
0..256 live business Render Domains
```

上限直接保证任意成功 local state均可形成 Frozen Render v1 Registry。

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

## 6. Render Update Model

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

## 7. Data Profile / Carrier

Render Update运行在：

```text
loomrealm.renderer-data/1
```

```text
DataPlane single dispatcher
→ render.* messages
→ internal Renderer Render Store
```

Render implementation不得竞争读取 raw carrier，也不创建第二套 Data currentness。

---

## 8. Fresh Carrier / Baseline

fresh current Data carrier：

```text
first Render message = current render.domains
```

每个 current Domain独立：

```text
unbaselined
→ fresh render.snapshot
→ baselined(R)
→ patch/event
```

不存在 global Render ready。旧 carrier sender cursor/Renderer Patch base不得继承为 fresh authority。

same-generation reconnect保留 wire one-shot identity history，但重建 carrier-local Registry/baseline/revision。

---

## 9. Event Boundary

Render Event：

```text
ordered
transient
non-authoritative
no replay
may be lost
```

Author `emit` 只对 current business target合法。

Publication：

```text
no carrier
→ Event not retained for future carrier

current carrier + Domain unbaselined
→ Event MAY remain bounded/current-carrier pending
→ establishing Snapshot must emit first

carrier loss / Domain removal
→ pending Event discarded
```

因此 current-carrier pending 不等于历史 replay。保留的未 emitted Event是 sender authoritative coalescing barrier；drop-before-emitted释放 barrier。

---

## 10. Frame / Data / Runtime Independence

禁止隐式关系：

```text
Frame create  → create Domain
Frame active  → show Domain
Frame suspend → hide Domain
Frame close   → destroy Domain
Data retire   → destroy Domain
```

业务需要同生共死时显式调用 Domain `close()`；不建立 Frame→Domain ownership registry。

Runtime terminal最终释放本 Runtime business Domains/resource，这是 Runtime cleanup，不表示 Frame/Data拥有 Domain lifecycle。

---

## 11. Renderer Store / Stale Cache

Renderer Store挂在现有 Data-slot currentness上，M11 不新增 public Store/subscription API。

Data retire 后最后合法 state MAY保留为：

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

恢复必须 fresh Registry + Snapshots。

---

## 12. Node Identity / Ordering

Wire Node key在 wire Domain lifetime内 one-shot；live key保持 stable `tag`。same-generation reconnect保留该 history；fresh generation创建 fresh wire universe。

Domain 内 roots/children order 是 authoritative sibling order。

Domain 间：

```text
higher zIndex = above lower zIndex
same zIndex → domainId UTF-8 lexical tie-break
```

不规定 CSS/DOM/Canvas/WebGL realization。

---

## 13. Presentation / Content / Input Boundaries

`tag` 是 opaque presentation identifier。Render Core不定义 component registry、component loading、DOM tag semantics 或 unknown-tag authoritative error。

Render `data` MAY携 logical resource reference，但不得携 filesystem capability、Content bearer、privileged URL 等 physical capability；资源解析属于 M12 Content。

Render Domain存在不能创建 InputTarget。User Input authority仍由 Main InputTarget + Interest + Producer + current Data决定。

---

## 14. Failure Boundary

Render v1区分：

```text
representation/schema/limit invalid
→ Data stream fatal

authoritative continuity invalid
→ Data stream fatal

well-formed stale Event
→ drop only

presentation-local failure
→ renderer product policy
```

```text
Render/Data stream failure
!= Runtime terminal
!= Frame unwind
```

fresh current Data仍通过 Registry + Snapshots恢复。

---

## 15. Cross-platform / M11 Qualification

Hostra/PWA必须共享相同 logical Render semantics；physical presentation/transport可以不同。

M11 formal qualification只关闭：

```text
subsystem-sender
renderer-receiver
```

包含 Hostra/PWA trace equivalence 的 `transport` role 留到 M16。

---

## 16. Final Invariants

1. business Render authority只在 Subsystem；
2. exact author API同步 local-only，成功值始终可表示为 Frozen Render v1；
3. business Domain / wire Domain / carrier lifetime分离；
4. SDK domainId在一个 Runtime instance内不复用；
5. business Node key采用 Domain-lifetime one-shot stronger invariant；
6. same-generation reconnect保留 wire identity history并重建 baseline；
7. fresh generation创建新的 Render wire universe；
8. fresh carrier以 Registry + per-Domain Snapshot建立 authority；
9. Frame/Data不拥有 business Domain lifecycle；
10. Renderer Store internal-only，stale cache不是 current authority；
11. Snapshot/Patch原子提交；
12. Event transient/no replay，current-carrier pending不是 future-carrier history；
13. Render state不携 physical resource capability；
14. Render/presentation不能生成 Main InputTarget；
15. Render stream failure不等于 Runtime/Frame failure。
