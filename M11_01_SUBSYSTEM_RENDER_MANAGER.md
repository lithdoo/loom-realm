# M11 / 01 — Subsystem RenderManager

> 状态：**Planned**  
> 阶段：M11 Render  
> 落地顺序：01  
> 最近复核：2026-09-07  
> 正式协议：[Render Update v1](doc/15-contracts/render-update-v1.md)  
> 架构：[渲染系统](doc/10-architecture/rendering-system.md)

M11/01只实现 Subsystem-owned business Render Domain 与最小 author surface；不实现 publication、Renderer store、DOM/Canvas/WebGL 或 Content。

---

## 1. Goal

```text
Subsystem business state
→ RenderManager
→ business Render Domains
→ authoritative desired Render state
```

Subsystem 是 Render authority。Main、Renderer、Frame、Data carrier 都不拥有 business Render Domain lifecycle。

---

## 2. Required Surface

实现一个 Subsystem-local `RenderManager`，负责：

```text
create Domain
update Domain authoritative state
emit transient Render Event intent
destroy Domain
Runtime terminal cleanup
```

Domain state至少表达：

```text
domainId
zIndex
ordered roots
recursive keyed nodes
```

`tag`、`attrs`、`data` 保持 opaque；不引入 component registry 或 presentation schema。

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

Domain 属于 Subsystem Runtime business state。若业务希望 Domain 与 Frame 同生共死，只能由业务代码显式管理。

---

## 4. Local Correctness

必须验证：

```text
domainId local uniqueness
Node key Domain-wide uniqueness
live key keeps stable tag
removed published identity cannot be silently reused later by publication layer
updates are applied atomically to local authoritative state
invalid update leaves previous state unchanged
Runtime cleanup releases all Domains
```

M11/01 不分配 Data generation，不维护 carrier publication revision。

---

## 5. Abstraction Budget

允许：

```text
one RenderManager per Subsystem instance
Domain records
minimal tree/index helpers required for validation
immutable/detached authoritative state representation
```

禁止：

```text
Generic Store / Observable / EventBus
virtual DOM / reconciler
component registry / plugin system
layout / animation engine
Content/resource resolver
Render RPC
Frame→Domain implicit registry
Data carrier reader/writer
cross-Domain transaction framework
```

---

## 6. Evidence

完成条件：

```text
minimal author API frozen
Domain lifecycle tests
Node identity/tag invariants
atomic invalid-update tests
Frame independence tests
Runtime cleanup tests
business Definition remains dependent only on @loomrealm/subsystem
```

M11/01 完成后进入 M11/02 publication；不得提前把 physical presentation 引入 Subsystem。
