# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Renderer Control、Data Connection、User Input、Render Store/Patch/Event 与本地 presentation 实现  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Data Connection v1](../../15-contracts/renderer-subsystem-data-connection-v1.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)  
> 最近复核：2026-08-09

Renderer **不是 Frame / Call participant**。它镜像 Main committed authority，并处理建立后的 Data application protocols。

## 1. 内部模块

```text
Web Renderer
├── Main Renderer Control Connection
├── Control State Store
├── Data Connection Registry
├── Render Replication Manager
│   ├── Domain Registry
│   ├── Domain Store + revision
│   ├── key/parent indexes
│   ├── Snapshot Validator
│   ├── Atomic Patch Engine
│   └── Commit/Event Queue
├── local presentation mapping
├── Global Domain Composer
├── Input Interest Registry
├── Input Producer Registry
├── Effective Input Resolver
├── User Input Router
├── Resource Client
└── Presentation State
```

上述 `presentation mapping` 可以内部使用 Component Registry/Factory、React/Vue/Web Component、DOM/Canvas/WebGL 等任意机制；这些不是 LoomRealm protocol surface。

## 2. Renderer Control Authority

Renderer 从 Main 获得：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority {subsystemKey, generation, connectionProfile}
```

Renderer 不得自行：

```text
create/recover Frame or Activation
modify Stack
compute Runtime failure unwind
create InputTarget from DOM focus
infer input authority from Render Domain
```

Control loss/replacement：

```text
InputTarget := null
stop ordinary input
invalidate DataAuthority
retire old Data Connections
```

然后 fresh Renderer Control hello + full Snapshot恢复。

## 3. Data Connection

Renderer 只依据 current DataAuthority 建立/持有 Data Connection。

```text
Session + current Renderer + subsystemKey + generation
```

每个 Subsystem最多一个 current carrier。

actual Desktop WebSocket/ticket 或 PWA MessagePort 由 Host implementation 安全建立；不来自 Subsystem `ready`，也不进入 Renderer Control Snapshot。

```text
Data loss != Runtime failure
Data loss != Frame unwind
```

## 4. User Input

```text
Effective(C)
=
current matching Data Connection
∧ current Main InputTarget matches subsystem
∧ mirrored Frame active/current Activation matches
∧ C in current Interest
∧ Producer(C) available
```

fresh Data Connection：Interest empty。

`.state` 每次 non-effective→effective建立 fresh baseline；`.event` future-only/no replay；Reset/implicit reset处理 teardown。

标准 keyboard/pointer/gamepad canonical wire payload由 User Input v1本身定义。Renderer如何从 DOM/OS/device API生成 canonical payload 是本模块实现细节。

## 5. Render Authority

Subsystem 是 Domain Registry / State / revision唯一 authority；Renderer 是 read-only replica + presentation engine。

```text
Domain
    domainId
    zIndex
    revision
    roots[]

Node
    key       one-shot logical identity within Domain lifecycle
    tag       opaque string
    attrs     string→string
    data      JSON object
    children  ordered nodes
```

`tag` 不在 protocol层解析成 known/unknown component type。Renderer如何解释 tag 是本地 integration contract。

## 6. Fresh Render Baseline

```text
render.domains(current Registry)
→ fresh render.snapshot every current Domain
→ ordinary render.patch / render.event
```

旧 presentation cache MAY暂时显示，但 fresh Snapshot前：

```text
no Patch applies to cached authority
no Event targets cached lifetime
```

cache不是 recovery authority。

## 7. Domain Store / Patch

每个 current Domain MAY内部维护：

```text
revision
zIndex
recursive roots
nodeByKey
parentByKey
```

wire仍是递归 Tree。

baseline后 authoritative commit严格 `R→R+1`。

Patch：

```text
require base=current revision
→ isolated candidate
→ ordered insert/remove/move/update
→ final validation
→ atomic commit
```

失败不得 partial apply/skip later commit。

## 8. Event Barrier

`render.event` 是 transient presentation impulse，不修改 authoritative Store。

只有 current Domain + fresh baseline + existing targetKey 时才 dispatch；stale target直接 drop。

逻辑顺序：

```text
commit R
→ local reconciliation/lifetime install
→ Event
→ commit R+1
```

不要求等待 physical paint/vsync。

## 9. Backpressure

```text
small diff                 → Patch
large/complex/backpressure → full Snapshot(lastEmittedRevision+1)
Event                       → bounded queue; may drop
```

协议只要求 bounded、surviving Event order、no replay、authoritative progress优先；具体 Event capacity/drop strategy 是 Renderer implementation。

## 10. Presentation Mapping

Render Update只给出 authoritative plain data：

```text
key/tag/attrs/data/children
```

本模块自己决定：

```text
tag → local view/component/backend
code/module loading
mount/update/unmount
DOM/Canvas/WebGL resources
style/layout
animation/cache
per-tag attrs/data interpretation
```

这些实现失败属于 local presentation diagnostics，不改变合法 committed Domain Store，也不产生 Render protocol unknown-tag error。

Presentation 实现 MAY注册 `x.*` Input Producer，但 Producer仍通过 User Input Core的 Interest/InputTarget gate。

## 11. Global Composition

Domain `zIndex`：higher above lower。Frame Stack绝不充当 Render z-order。

相同 zIndex 的 tie-break只要求本实现 deterministic/non-semantic，不得使用 arrival/reconnect order作为业务语义。

## 12. Renderer Reload

```text
fresh Renderer Control
→ full Authority Snapshot
→ Host establishes fresh Data Connections
→ User Input: Interest empty → republish → State baselines
→ Render: Registry → fresh Snapshots → Patch/Event
```

不得恢复 cached old Activation、Interest、historical Input Event 或 historical Render Patch/Event chain。

## 13. Core Invariants

- Renderer不是 Frame RPC participant；
- Renderer只镜像 Main committed authority；
- Renderer Core执行 ordinary InputTarget sender gate；
- Data carrier只依据 current DataAuthority；
- Domain/Node不产生 Input authority；
- Render wire保持 recursive tree + exact revision chain；
- Patch原子提交；Event transient；
- continuity failure通过 fresh Data carrier + Snapshots恢复；
- component/presentation mapping完全属于实现；
- Host carrier/bootstrap机制不进入 application protocol；
- no Render ACK/NACK/replay/resync RPC。
