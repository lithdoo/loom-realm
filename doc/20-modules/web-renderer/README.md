# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Renderer Control、Renderer Data Profile、Frame-scoped User Input、Render Store/Presentation 与 Renderer-facing Platform ports  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)、[Data Connection v1](../../15-contracts/renderer-subsystem-data-connection-v1.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)  
> 最近复核：2026-08-19

Renderer 不是 Frame/Call participant。它镜像 Main committed authority，并在 Platform提供的 current Data carriers 上执行 Data Profile child protocols。

---

## 1. Internal Modules

```text
Web Renderer
├── RendererControlBinding Adapter
├── Control Store
├── RendererDataBinding Adapter
├── Data Connection Registry
├── one Data dispatcher
│   ├── Input Manager
│   └── Render Replication Manager
├── Frame Interest Registry
├── Input Producer Registry
├── Effective Input Resolver
├── Render Domain Store / Composer
├── Content Client
└── Presentation Environment
```

Presentation mapping可使用 DOM/Canvas/WebGL/framework internals；不是 LoomRealm protocol surface。

---

## 2. Renderer-facing Platform Ports

```text
RendererControlBinding
    current Main ⇄ Renderer Control carrier

RendererDataBinding
    per-Subsystem current/fresh {generation,dataProfile,carrier}

ContentClient
    logical Content API

Presentation/Input Environment
    browser/device primitives
```

Renderer Core不自行发现 physical endpoint，也不在无 current DataAuthority时建立 Data Connection。

---

## 3. Renderer Control Store

Main发布：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

当前 `dataProfile`：

```text
loomrealm.renderer-data/1
```

Renderer不：

```text
create/recover Frame or Activation
modify Stack
compute Runtime failure unwind
create InputTarget from DOM/Render/Interest
```

Control loss：

```text
InputTarget := null
stop ordinary input
invalidate DataAuthority
retire old Data Connections
```

---

## 4. Data Connection Registry

Current key：

```text
Session + current Renderer + subsystemKey + generation
```

且 bound `dataProfile` MUST匹配 current authority。

每 Subsystem最多 one current carrier。

```text
same S/G/P old retired → fresh carrier allowed
profile change → fresh generation required
```

Data loss不失败 Runtime、不 unwind Frame。

---

## 5. One Data Dispatcher

Renderer只建立一个 connection-wide Data reader：

```text
MessageCarrier
        ↓
JSON text parse
        ↓
Data Profile dispatcher
   ┌────┴────┐
 input.*   render.*
```

Input/Render Manager不得分别竞争读取 raw carrier。

PWA/Hostra都使用 string application unit。

---

## 6. User Input

```text
Effective(F,A,C)
=
current matching Data S/G/P
∧ Main InputTarget == (S,F,A)
∧ mirrored F active/current A
∧ C ∈ Interest[F]
∧ Producer(C) available
```

Renderer维护：

```text
InterestRegistry = Map<frameId, Set<channel>>
```

Interest是 Frame-scoped config、无 activationId、不是 authority。

Renderer不解释 push/pop/call/return/unwind，只组合 current facts。

---

## 7. Cross-plane Ordering

Control 与 Data无 total order。

```text
Interest first
    → store/inert until matching authority

Authority first
    → no input until Interest[F]
```

不需要 cross-plane ACK/barrier/revision join。

stale unknown/closed Frame Interest可以暂存但永远不能创建 authority。

---

## 8. Input Lifecycle

fresh Data carrier：

```text
Interest Registry = empty
retained Input State = empty
```

Subsystem重新发布 full current registry。

fresh Activation：

```text
Interest[F] may remain
old Activation State/Event MUST NOT remain
```

`.state` 每次 Effective false→true fresh baseline；`.event` future-only；Reset只清当前 Activation-scoped State，不改 Interest。

---

## 9. Render Replica

Subsystem拥有 Domain Registry/State/revision；Renderer只维护 authoritative replica + presentation。

fresh Data carrier：

```text
render.domains
→ fresh snapshot each Domain
→ patch/event
```

Patch严格 revision chain原子提交；Event transient/no replay。

```text
Frame close != Domain destroy
Data retire != authoritative Domain destroy
```

---

## 10. Renderer Reload

```text
fresh Renderer Control
→ full Snapshot
→ Broker/Platform provisions Data carriers for current S/G/P
→ User Input empty registry then republish/baseline
→ Render Registry + fresh Snapshots
```

不得恢复：

```text
old Activation
old carrier Interest registry
historical Input Event
historical Render Patch/Event chain
```

---

## 11. Platform Realizations

```text
Hostra Desktop
    Control    WebSocket text
    Data       authenticated WebSocket text
    Hosting    BrowserWindow
    Content    HTTP

PWA
    Control    MessagePort postMessage(string)
    Data       transferred MessagePort postMessage(string)
    Hosting    Window
    Content    Fetch/SW
```

Port transfer是 Platform bootstrap；application payload仍 JSON text string。

---

## 12. Backpressure

```text
Renderer Control → latest full Snapshot
Input State      → latest coalescible baseline/state
Input Event      → bounded ordered lossy queue
Render commit    → protocol revision rules
Render Event     → bounded transient queue
```

不允许无界历史队列或 adapter retry。

---

## 13. Tests

至少：

```text
fake RendererControlBinding
fake RendererDataBinding
unknown/unsupported profile no current install
single Data dispatcher demux
Control/Data ordering independence
Interest[F] gating
fresh carrier empty input state
fresh Activation no old state
fresh Render baseline
Control loss retires all Data
Hostra/PWA same abstract Renderer trace
```

---

## 14. Final Invariants

1. Renderer不是 Frame RPC participant；
2. Renderer Core platform-neutral；
3. Renderer只镜像 Main committed authority；
4. DataAuthority使用 S/G/dataProfile；
5. Platform/Broker建立 actual Data carrier；
6. one Data dispatcher统一 Input/Render demux；
7. Interest Frame-scoped且不创建 authority；
8. Control/Data无跨连接 total order；
9. fresh Data Interest/State empty；
10. fresh Activation可复用 Interest但不可复用 old State/Event；
11. Render lifecycle independent from Frame/Data carrier；
12. WebSocket/MessagePort application unit统一 JSON text string。
