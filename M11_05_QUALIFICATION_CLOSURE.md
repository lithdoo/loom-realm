# M11 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Ready**  
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

M11 implementation entry 已满足：

```text
M10 formal User Input fixtureSetRevision 2 qualification = pass
M10 = Implemented / Qualified / Closed
```

M11 不重新打开 M10 authority、Input 或 Data lifecycle 设计。

---

## 2. Closure Scope

必须实现：

```text
@loomrealm/subsystem
    exact createRenderDomain author surface
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
    same-generation reconnect / old-stream isolation
```

不属于 M11：DOM/Canvas/WebGL presentation、Content/resource resolution、component registry、layout/animation、PWA transport equivalence。

---

## 3. Conformance Claim Boundary

Render Update v1 Conformance Profile revision 1 定义三个 role：

```text
subsystem-sender
renderer-receiver
transport
```

M11 只形成以下完整 role claims：

```text
LoomRealm Render Update v1 Subsystem Sender Conformant
LoomRealm Render Update v1 Renderer Receiver Conformant
```

M11 **不声明**：

```text
LoomRealm Render Update v1 Transport Mapping Conformant
```

原因：transport role 包含 Hostra/PWA application-trace equivalence；该 claim 按 Phase 1 boundary 留到 M16。

因此 M11 的 `Qualified / Closed` 表示 Render application semantics + current Desktop/Hostra implementation 已闭合，不等于 cross-platform transport equivalence 已闭合。

---

## 4. Required Invariants

必须证明：

```text
business Domain authority only in Subsystem
Frame close != Domain destroy
Data retire != Domain destroy
same-generation reconnect != new wire Domain lifetime
fresh generation = fresh wire Render universe
fresh carrier starts with Registry + per-Domain Snapshot baseline
Domain/Node one-shot identity holds within wire lifetime
business Node key one-shot holds within business RenderDomain lifetime
live Node key keeps stable tag
Patch continuity is carrier-local R→R+1
Snapshot/Patch commit atomically
Event ordered/transient/no replay
old carrier cannot mutate current replica
Render stream failure != Runtime terminal / Frame unwind
```

fresh-generation semantics由 sender/receiver deterministic role fixtures证明；不得为了 M11 qualification 增加 Main/Platform test-only generation allocator。

---

## 5. Abstraction Budget

允许：

```text
one internal Subsystem RenderManager
RenderDomain handles
minimal Domain/tree validation/indexing
one publication coordinator
per-generation emitted identity history
per-carrier Domain cursors
one concrete Renderer Render Store per current Data slot identity
isolated candidate commit helpers
small sender/receiver qualification adapters
```

禁止：

```text
Generic Store / Observable / EventBus
generic conformance framework for future protocols
virtual DOM / reconciler
component/plugin registry
resource/content resolver
Render RPC / ACK / resync / replay
cross-Domain revision/transaction framework
Frame→Domain implicit ownership layer
generic replication framework
business-key → wire-key translation layer
test-only Data generation authority
```

---

## 6. Qualification Evidence

必须包含：

```text
Subsystem author/lifecycle tests
publication Registry/baseline/revision tests
Renderer atomic replica tests
identity/tombstone tests
Event ordering/drop tests
same-generation reconnect real vertical
Frame/Data independence
old-stream isolation
fresh-generation sender/receiver role fixtures
M10 full regression remains pass
Render Update v1 fixtureSetRevision 1 subsystem-sender obligations pass
Render Update v1 fixtureSetRevision 1 renderer-receiver obligations pass
```

实现回归与 formal conformance 必须分开记录；只有两者都通过才能声明 M11 Closed。

Transport role evidence不得混入 M11 closure claim。

---

## 7. Root Gate

M11 最终只有一个 root closure command：

```text
npm run test:m11
```

语义固定为：

```text
npm run test:m11
= M10 full regression + qualification
+ M11 Subsystem author/lifecycle tests
+ Render Update v1 subsystem-sender fixtureSetRevision 1 qualification
+ Render Update v1 renderer-receiver fixtureSetRevision 1 qualification
+ M11 Renderer replica/package tests
+ M11 Desktop/Hostra same-generation real vertical
+ M11 public boundary checks
```

不得用更窄的 package-only test 代替 root gate。

closure 后记录固定 evidence：

```text
doc/30-implementation/m11-qualification.md
```

该记录至少包含 protocol/version/fixtureSetRevision、两个 claimed role 的结果、real vertical、M10 regression 与最终 root gate 结果。

---

## 8. Closure Claim

允许最终声明：

```text
M11 Render = Implemented / Qualified / Closed
```

前提是本文件全部 evidence 已形成可执行结果。否则保持：

```text
Implemented / Qualification Pending
```

M11 Closed 后才进入 M12 Content implementation；Render transport-equivalence claim 仍留到 M16。
