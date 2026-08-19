# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem-owned Render Domain、Renderer Store、presentation、Frame/Data independence 与 User Input boundary  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[通信系统](./communication-system.md)、[模块子系统模型](./subsystem-model.md)  
> 最近复核：2026-08-19

## 1. 设计目标

```text
Subsystem business state
→ declarative Render Domain desired state
→ Render Update Protocol
→ Renderer Domain Store
→ local presentation mapping
→ DOM / Canvas / WebGL / other backend
```

Renderer Store 是 authoritative Render state 的只读 replica；UI object、cache、animation、GPU/DOM resource 属于 derived presentation state。

Platform 只提供 Renderer Hosting、Data carrier、Content/device/browser environment；不拥有 Render Domain authority。

---

## 2. 核心原则

> Render 完全由 Subsystem 控制。Main 不维护 Render Domain Registry，Frame 不拥有 Domain，Renderer/Platform 不从 Frame Stack 推导 Domain lifecycle。

不存在平台级自动规则：

```text
frame.activate → show Domain
frame.suspend  → hide Domain
frame.resume   → restore Domain
frame.close    → destroy Domain
Frame failure unwind → destroy affected Domains
Data carrier retire → destroy authoritative Domain
```

Subsystem 可以因自身业务事件显式修改/关闭 Domain，但必须通过 Render capability + Render Update表达。

---

## 3. Render Domain

每个 Subsystem Runtime MAY同时拥有 `0..N` Domains：

```text
Subsystem
├── Domain world     zIndex=0
├── Domain hud       zIndex=100
└── Domain overlay   zIndex=200
```

Domain 是：

```text
Render lifecycle unit
atomic authoritative-state unit
Renderer global composition unit
```

Domain identity 在 current Subsystem/Data authority scope 内由 `domainId`标识；精确 lifecycle/one-shot 规则以 Render Update v1 为准。

Domain 不属于 Frame，也不要求存在 active Frame。

---

## 4. Global Composition

每个 Domain拥有 Subsystem-authoritative `zIndex`：

```text
lower zIndex  → below
higher zIndex → above
```

Frame Stack MUST NOT充当 Render z-order。

相同 zIndex tie-break只需 deterministic/non-semantic；不能使用 connection/reconnect arrival order作为业务语义。

---

## 5. Domain Tree

概念：

```ts
interface RenderNode {
  readonly key: string;
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly data: JsonObject;
  readonly children: readonly RenderNode[];
}
```

Domain拥有 `0..N` ordered roots；roots/children顺序属于 authoritative state。

### key

stable logical identity，精确 uniqueness/one-shot 规则以 Render Update v1 为准。

### tag

opaque string。Render Core 不定义：

```text
known/unknown tag
Component Registry/Factory
module loading
per-tag schema discovery
DOM/Canvas/WebGL mapping
```

这些属于 Subsystem/Renderer implementation agreement，不形成 application protocol。

### attrs/data

保持 plain data，不允许 Function、DOM object、Port、class instance、callback 等 executable/platform object。

---

## 6. Renderer Domain Store

Renderer 按 `(subsystemKey, domainId)`维护 authoritative replica，可内部索引：

```text
revision
zIndex
roots/tree
key → node
key → parent
```

wire仍保持 recursive Tree；内部 index 不形成第二种协议模型。

每次 authoritative update 必须完整 validate candidate 后 atomic commit。

---

## 7. Render Update State Model

```text
render.domains
    full Domain Registry / lifecycle authority

render.snapshot(revision)
    full baseline / full commit

render.patch(baseRevision, revision)
    exact R→R+1 incremental commit

render.event
    transient presentation impulse
```

Patch 使用 stable key 寻址，不引入 generic JSON Patch/path language。

---

## 8. Revision / Recovery

Domain revision 是 authoritative publication commit number，不是 transport sequence/replay cursor。

baseline 后：

```text
R → R+1
```

Patch 只有在 exact base/revision chain上应用，并以 whole candidate atomic commit。

fresh Data Connection：

```text
current Domain Registry
→ fresh Snapshot every current Domain
→ ordinary Patch/Event
```

authoritative continuity failure通过 retire current Data carrier + fresh baseline恢复。

无 ACK/NACK、Patch history replay、resume cursor、Renderer→Subsystem resync RPC。

---

## 9. Event / Presentation Ordering

`render.event` 是 transient presentation impulse，不修改 authoritative state。

Event 与同 Domain authoritative publications 保持协议定义的顺序边界；Renderer 不要求等待 physical paint/vsync 才处理下一条 application message。

stale/missing target Event 可 soft drop，不等待 target重现、不 replay、不 retarget。

---

## 10. Backpressure

```text
small diff          → Patch
large/backpressured → Snapshot
Event backlog       → bounded; may drop
```

Authoritative state progress优先于 transient Event backlog。

具体 Patch-vs-Snapshot threshold、Event queue capacity/drop preference 是 implementation choice。

---

## 11. Presentation / Platform Boundary

```text
Renderer Core
    authoritative Domain Store
        ↓
Presentation adapter
    tag/attrs/data/children mapping
        ↓
Platform presentation environment
    Hostra BrowserWindow / browser Window
    DOM / Canvas / WebGL / device APIs
```

Platform/Renderer Hosting 不改变 Render authoritative semantics。

Hostra Desktop 与 PWA 可以使用不同 Window lifecycle / backend details，但对相同 Render Update trace 应得到同一 logical Renderer Store。

---

## 12. User Input Boundary

Domain/Node/presentation object 不产生 ordinary InputTarget authority。

Presentation MAY 提供 `x.*` Input Producer，但 effective ordinary input 始终是：

```text
Effective(F,A,C)
=
current matching Data Connection
∧ Main current InputTarget == (S,F,A)
∧ current active Frame/Activation
∧ C ∈ Interest[F]
∧ Producer(C) available
```

因此：

```text
Render focus != InputTarget
Node existence != input authority
Domain zIndex != input routing
```

Frame-scoped Interest 与 Render Domain lifecycle 也互不拥有。

---

## 13. Frame / Data / Domain Independence

```text
Frame active != Domain visible
Frame suspend != Domain hidden
Frame close/unwind != Domain destroy
Activation replacement != Domain lifecycle
Data Connection retire != authoritative Domain destroy
Domain destroy != Frame close
```

Data outage时 Renderer MAY保留最后合法 presentation cache，但 cache不是 fresh authority proof；fresh carrier上的 authoritative recovery只能由 current Registry + fresh Snapshots建立。

---

## 14. Runtime Failure Boundary

Runtime terminal failure通常最终使 Main撤销相关 DataAuthority，但 Frame unwind、Data retire、Render Domain cleanup仍是不同 authority/lifecycle domain。

Renderer/Platform 不得因 Runtime process/Worker事实直接修改 authoritative Render Store；应按照 Renderer Control/Data/Render各自边界收敛。

---

## 15. 本地表现状态

可以只留 Renderer：

```text
DOM Element / component object
Canvas/WebGL resources
CSS animation
image cache
focus/scroll/hover
visual interpolation
```

这些不得修改业务规则、Frame Stack、Main InputTarget 或 recovery authority。

stable Node key可以用于连续 logical lifetime内保留合法 local presentation state；authoritative state始终来自 latest valid Domain commit。

---

## 16. 当前渲染不变量

1. 每个 Subsystem Runtime拥有 `0..N` Render Domains；
2. Domain是 Render lifecycle、atomic state、global composition unit；
3. Main/Frame/Platform不拥有 Domain lifecycle；
4. Domain拥有 zIndex + ordered roots；
5. Node=`key/tag/attrs/data/children` recursive plain-data model；
6. `tag` 是 opaque string；presentation mapping属于 implementation；
7. Snapshot是 recovery baseline；Patch是 incremental authoritative commit；Event是 transient impulse；
8. baseline 后 revision严格连续，Patch whole-candidate atomic；
9. continuity failure通过 fresh Data carrier + Registry/Snapshots恢复；
10. no ACK/NACK/Patch replay/resync RPC；
11. Frame/Data/Domain lifecycles相互独立；
12. User Input使用 Main authority + Frame Interest + Producer gate，不从 Render state推导 authority；
13. Hostra/PWA physical presentation差异不改变 logical Render Store semantics。
