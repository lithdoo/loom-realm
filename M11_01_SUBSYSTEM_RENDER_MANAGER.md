# M11 / 01 — Subsystem RenderManager

> 状态：**Implementation Frozen / Ready**  
> 阶段：M11 Render  
> 落地顺序：01  
> 最近复核：2026-09-07  
> 正式协议：[Render Update v1](doc/15-contracts/render-update-v1.md)  
> 架构：[渲染系统](doc/10-architecture/rendering-system.md)  
> 目标：实现 Subsystem-owned business Render Domain 与最小 author surface；不得引入 presentation 或 generic state abstraction。

> **M11/01 只建立 business Render authority。publication、Renderer replica、DOM/Canvas/WebGL 与 Content 均不属于本步。**

---

## 1. Frozen Position

```text
Subsystem business state
→ RenderManager
→ business Render Domains
→ authoritative desired Render state
```

Dependency order：

```text
M11_01
→ M11_02 publication
→ M11_03 Renderer Store
→ M11_04 vertical
→ M11_05 qualification
```

Subsystem 是 Render authority。Main、Renderer、Frame、Data carrier 都不拥有 business Render Domain lifecycle。

---

## 2. Frozen Author Surface

`RenderManager` 是 SDK internal implementation，不直接暴露给 business Definition。author-facing surface 固定为：

```text
SubsystemScope.createRenderDomain(initialState) → RenderDomain

RenderDomain.replace(state)
RenderDomain.emit(event)
RenderDomain.close()
```

其中：

```text
state = { zIndex, roots }
event = { targetKey, name, data }
```

固定：

```text
createRenderDomain requires a complete initial authoritative state
replace atomically replaces one business Domain desired state
emit expresses transient presentation intent only
close destroys this business Domain
```

SDK mint `domainId`；author 不提供也不管理：

```text
domainId
generation
Registry
revision
Snapshot/Patch
publication cursor
carrier identity
```

Node `key` 与 `tag` 由 author state 提供；`tag`、`attrs`、`data` 保持 opaque，不引入 component registry 或 presentation schema。

---

## 3. Lifetime

必须保持：

```text
Frame create  != Domain create
Frame active  != Domain show
Frame suspend != Domain hide
Frame close   != Domain destroy
Data retire   != Domain destroy
```

若业务希望 Domain 与 Frame 同生共死，只能由业务代码显式管理。

`close()` 幂等；Runtime terminal 最终关闭全部仍存活 Domain。

---

## 4. Local Identity / Correctness

必须验证：

```text
SDK-minted domainId local uniqueness
Node key Domain-wide uniqueness
live key keeps stable tag
removed Node key cannot be reintroduced in the same business RenderDomain lifetime
updates apply atomically
invalid create creates no Domain
invalid replace preserves previous authoritative state
Runtime cleanup releases all Domains
```

business-level Node key one-shot intentionally stronger than wire minimum：它避免 author mutation validity 依赖“该 key 是否已经 emitted”的 publication history，也避免 business-key → wire-key translation layer。

fresh generation 可以重新导出仍 live 的 keys；这不是 key reuse。新 business RenderDomain 也是新的 local Domain lifetime。

M11/01 不分配 Data generation，不维护 carrier publication revision；wire Domain one-shot history与 publication cursor 由 M11/02 负责。

---

## 5. Event Boundary

`emit(event)`：

```text
ordered intent
transient
non-authoritative
no historical replay
```

Event 不改变 business Domain state。若当前没有可合法发布的 current carrier/baseline，Event 不得成为未来连接的 replay backlog。

具体 emitted barrier/backpressure 由 M11/02 Frozen Render v1 publication rules负责。

---

## 6. Abstraction Budget

允许：

```text
one internal RenderManager per Subsystem instance
RenderDomain handles
Domain records
minimal tree/index helpers required for validation
immutable/detached authoritative state representation
```

禁止：

```text
public Generic RenderManager service locator
Generic Store / Observable / EventBus
virtual DOM / reconciler
component registry / plugin system
layout / animation engine
Content/resource resolver
Render RPC
Frame→Domain implicit registry
Data carrier reader/writer
business-key → wire-key identity translation layer
cross-Domain transaction framework
```

---

## 7. Evidence

完成条件：

```text
exact author surface frozen
create/replace/emit/close semantics tests
Domain lifecycle tests
Node identity/tag invariants
atomic invalid-update tests
Frame independence tests
Runtime cleanup tests
business Definition remains dependent only on @loomrealm/subsystem
```

M10 已正式 Qualified / Closed；M11/01 implementation gate 已开启。
