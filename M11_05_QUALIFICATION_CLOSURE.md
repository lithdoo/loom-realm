# M11 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Waiting on M10 Closure**  
> 阶段：M11 Render  
> 落地顺序：05  
> 最近复核：2026-09-07  
> 前置：[M11 / 01](M11_01_SUBSYSTEM_RENDER_MANAGER.md) → [M11 / 02](M11_02_RENDER_PUBLICATION.md) → [M11 / 03](M11_03_RENDERER_STORE.md) → [M11 / 04](M11_04_VERTICAL_INTEGRATION.md)  
> 正式协议：[Render Update v1](doc/15-contracts/render-update-v1.md)  
> Conformance：[Render Update v1 Conformance](doc/15-contracts/render-update-conformance-v1.md)  
> 目标：定义 M11 唯一 implementation/qualification closure；不得以实现便利扩张 Frozen Render v1。

> **M11 closure = Subsystem-owned business Render Domains 经 current generation/current Data publication为 Registry + per-Domain authoritative commits，Renderer只维护 current replica；Frame/Data lifecycle不取得 Render ownership，fresh carrier以 fresh baseline恢复，transient Event不 replay。**

---

## 1. Entry Gate

M11 implementation 开始前必须满足：

```text
M10 formal User Input fixtureSetRevision 2 qualification = pass
M10 = Closed
```

M11 planning可以先冻结；不得让未关闭的 M10 regression/qualification debt与 Render implementation长期并行演化。

---

## 2. Closure Scope

必须实现：

```text
@loomrealm/subsystem
    minimal RenderManager / Domain author surface
    business Domain authoritative state
    transient Render Event intent

existing @loomrealm/data
    frozen Render Update v1 mechanics reused

@loomrealm/subsystem host
    generation/current-carrier publication
    Registry + Snapshot/Patch/Event

@loomrealm/renderer
    current authoritative Render Store
    atomic Registry/Snapshot/Patch application

Desktop/Hostra vertical
    reconnect / generation / old-stream isolation
```

不属于 M11：DOM/Canvas/WebGL presentation、Content/resource resolution、component registry、layout/animation、PWA transport equivalence。

---

## 3. Required Invariants

必须证明：

```text
business Domain authority only in Subsystem
Frame close != Domain destroy
Data retire != Domain destroy
same-generation reconnect != new wire Domain lifetime
fresh generation = fresh wire Render universe
fresh carrier starts with Registry + per-Domain Snapshot baseline
Domain/Node one-shot identity holds within wire lifetime
live Node key keeps stable tag
Patch continuity is carrier-local R→R+1
Snapshot/Patch commit atomically
Event ordered/transient/no replay
old carrier cannot mutate current replica
Render stream failure != Runtime terminal / Frame unwind
```

---

## 4. Abstraction Budget

允许：

```text
one Subsystem RenderManager
minimal Domain/tree validation/indexing
one publication coordinator
per-carrier Domain cursors
one Renderer Render Store per current Data slot
isolated candidate commit helpers
```

禁止：

```text
Generic Store / Observable / EventBus
virtual DOM / reconciler
component/plugin registry
resource/content resolver
Render RPC / ACK / resync / replay
cross-Domain revision/transaction framework
Frame→Domain implicit ownership layer
generic replication framework
```

---

## 5. Qualification Evidence

至少包含：

```text
Subsystem author/lifecycle tests
publication Registry/baseline/revision tests
Renderer atomic replica tests
identity/tombstone tests
Event ordering/drop tests
same-generation reconnect vertical
fresh-generation vertical
Frame/Data independence
old-stream isolation
M10 full regression remains pass
Render Update v1 conformance obligations pass
```

实现回归与 formal conformance 必须分开记录；只有两者都通过才能声明 M11 Closed。

---

## 6. Closure Claim

允许最终声明：

```text
M11 Render = Implemented / Qualified / Closed
```

前提是本文件全部 evidence 已形成可执行结果。否则保持：

```text
Implemented / Qualification Pending
```

M11 Closed 后才进入 M12 Content implementation。
