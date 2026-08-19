# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Renderer Control、Data Connection、Frame-scoped User Input、Render Store/Presentation 与 Renderer-facing Platform ports  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[平台组合系统](../../10-architecture/platform-composition-system.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Data Connection v1](../../15-contracts/renderer-subsystem-data-connection-v1.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)  
> 最近复核：2026-08-19

Renderer 不是 Frame / Call participant。它镜像 Main committed authority，并处理建立后的 Data application protocols。Renderer Core 保持平台无关；具体 BrowserWindow/Window、WebSocket/MessagePort、DOM/device integration 由 Platform/Presentation adapter 提供。

## 1. 内部模块

```text
Web Renderer
├── Renderer Control Binding Adapter
├── Control State Store
├── Data Connection Registry
├── Render Replication Manager
├── local presentation mapping
├── Global Domain Composer
├── Frame Interest Registry
├── Input Producer Registry
├── Effective Input Resolver
├── User Input Router
├── Content Client
└── Presentation State
```

presentation mapping 可以内部使用 Component Registry、React/Vue/Web Component、DOM/Canvas/WebGL 等机制；这些不是 LoomRealm protocol surface。

## 2. Renderer-facing Platform Ports

Renderer 消费 Platform Composition 的局部投影：

```text
RendererControlBinding
    current Main ⇄ Renderer Control carrier

RendererDataBinding
    current/fresh per-Subsystem Data carriers

ContentBinding
    platform Content transport

Presentation/Input Environment
    local browser/device primitives
```

这些 binding 不拥有 Renderer/Main authority。Renderer Core 不自行决定物理 endpoint，也不在没有 current DataAuthority 时建立 Data Connection。

## 3. Renderer Control Authority

Renderer 从 Main 获得：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority {subsystemKey, generation, connectionProfile}
```

Renderer 不得自行 create/recover Frame or Activation、modify Stack、compute Runtime failure unwind、从 DOM focus 创建 InputTarget、从 Render Domain 推导 input authority。

Control loss/replacement：

```text
InputTarget := null
stop ordinary input
invalidate old DataAuthority usage
retire old Data Connections
```

随后 fresh Renderer Control hello + full Snapshot 恢复。

Renderer Control 与 Data Connection 没有 cross-connection total order。

## 4. Data Connection

Renderer 只依据 current DataAuthority 安装/持有：

```text
Session + current Renderer + subsystemKey + generation
```

每个 Subsystem 最多一条 current carrier。actual carrier 由 Platform Data Connection Broker 协调 Renderer 与 Subsystem 两端。

```text
Data loss != Runtime failure
Data loss != Frame unwind
```

same generation 仍授权时，old carrier retired 后可安装 fresh carrier。

## 5. User Input：Frame Interest Registry

```text
Effective(F,A,C)
=
current matching Data Connection
∧ Main current InputTarget == (S,F,A)
∧ mirrored Frame F active/current Activation A
∧ C ∈ Interest[F]
∧ Producer(C) available
```

Renderer 维护：

```text
InterestRegistry = Map<frameId, Set<channel>>
```

Subsystem 通过 Data Connection 发布 full Frame Interest Registry snapshot；每次 publication 原子替换整个 registry。

```text
Interest = Frame-scoped configuration
Interest has no activationId
Interest is not authority
fresh Data Connection Interest Registry = empty
```

Renderer 不解释 `push/pop/call/return/caller/child/unwind`，只组合 current Control authority、Interest Registry、Producer availability 与 current Data Connection。

## 6. Cross-plane Ordering

```text
Interest first
    → store registry atomically
    → unknown/non-authoritative Frame entry inert
    → later authority may make it effective

Authority first
    → target exists but Interest[F] absent
    → no ordinary input
    → later Interest may make it effective
```

不需要 cross-plane ACK/barrier/revision join。stale Interest entry 不能创建 authority，且 frameId never reused。

## 7. Input Lifecycle

新 child：

```text
F2/A2 current target
Interest[F2] absent
    → no input

later Interest[F2]
    → input may become effective
```

caller suspension/resume，若同一 Data carrier 存活：

```text
F1/A1 suspended
Interest[F1] retained

F1 resumes with fresh A3
Interest[F1] already present
    → may become effective immediately
```

旧 A1 的 Input State/Event 不得被重解释为 A3 输入。

fresh Data Connection：

```text
Interest Registry = empty
retained Input State = empty
```

Subsystem 重新发布 current full Frame Interest Registry。

## 8. State / Event / Reset

`.state` 每次 Effective false→true 建立 fresh self-contained current baseline。典型触发包括 Interest added、InputTarget switch、fresh Activation、fresh Data Connection、Producer restore。

`.event` false→true future-only/no replay。

Reset scoped to `(frameId, activationId)`，清理 Activation-scoped retained state，不改变 Frame Interest。

## 9. Render Authority

Subsystem 是 Domain Registry / State / revision 唯一 authority；Renderer 是 read-only replica + presentation engine。

`tag` 是 opaque string。Frame Stack 不充当 Render z-order，Domain/Node 不产生 Input authority。

fresh Data carrier：

```text
render.domains(current Registry)
→ fresh render.snapshot every current Domain
→ ordinary render.patch / render.event
```

baseline 后 Patch 严格按 revision chain 原子提交；Event transient，不修改 authoritative Store。

## 10. Backpressure

```text
small diff                 → Patch
large/complex/backpressure → full Snapshot
Event                       → bounded queue; may drop
```

authoritative state progress 优先于 transient Event backlog。具体容量/heuristic 属于 implementation。

## 11. Platform Realizations

```text
Hostra Desktop
    Renderer Hosting       Hostra/Electron BrowserWindow
    Renderer Control       localhost WebSocket
    Renderer Data          authenticated localhost carrier
    Content                localhost HTTP

PWA
    Renderer Hosting       browser Window
    Renderer Control       MessagePort
    Renderer Data          MessageChannel / transferred Port
    Content                Fetch / Service Worker
```

Renderer Core 对两者使用相同 Control/Data/Input/Render semantics。

## 12. Renderer Reload

```text
fresh Renderer Control
→ full Authority Snapshot
→ Platform/Broker establishes fresh Data Connections
→ User Input registry empty → Subsystem republishes → fresh State baselines
→ Render Registry → fresh Snapshots → Patch/Event
```

不得恢复 old Activation、old carrier Interest Registry、historical Input Event 或 historical Render Patch/Event chain。

## 13. Core Invariants

- Renderer不是 Frame RPC participant；
- Renderer Core platform-neutral；
- Renderer只镜像 Main committed authority；
- actual Data carrier由 Platform Data Connection Broker建立；
- User Input Interest 是 Frame-scoped registry；
- Interest不创建 Main authority；
- Renderer不解释 push/pop/call/return/unwind；
- fresh Data Connection Interest Registry empty；
- fresh Activation可复用 Frame Interest，但不可复用旧 Input State/Event；
- Domain/Node不产生 Input authority；
- Render lifecycle independent of Frame/Data carrier；
- Host carrier/bootstrap机制不进入 application protocol；
- Hostra/PWA physical differences不改变 logical application trace。
