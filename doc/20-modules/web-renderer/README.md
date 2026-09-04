# Web 渲染端模块设计

> 层级：模块设计  
> 状态：M8 Implemented / Qualified；M9+ Planned
> 稳定程度：M8 Implementation Closed
> 主要定义：M7 Renderer Control local holder，以及 M8+ Renderer Data/Input/Render/Content slice placement  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[ADR 0027](../../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)、[Data Connection v1](../../15-contracts/renderer-subsystem-data-connection-v1.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)  
> 最近复核：2026-09-04

Renderer 不是 Frame/Call participant。它只镜像 Main committed authority，并在后续 current Data carriers 上执行 Renderer Data Profile child protocols。

M8 已实施 Control-driven per-subsystem Data peer reconciliation；Input/Render/Content 业务状态仍不提前建 registry/framework。

---

## 1. M7 Current Module Shape

```text
@loomrealm/renderer
└── Control holder/orchestration
    ├── current peer reference/identity
    └── current RendererAuthoritySnapshotV1 | null
```

逻辑 state exactly：

```text
{peer, snapshot} | null
```

M7 不创建：

```text
Control Store framework
RendererControlBinding adapter
Data Connection Registry
Input Manager
Render Store
ObserverHub/EventBus
currentness lease/epoch/heartbeat
Data/Input/Render empty modules
```

`RendererControlBinding` 是 **Main-facing Platform candidate-slot capability**，不是 Renderer-facing port。Renderer 只消费已经交给它的 renderer-control peer/carrier-side protocol role。

---

## 2. M7 Renderer Control Holder

Main publishes committed：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

M7 Main implementation实际固定：

```text
dataAuthorities = []
```

Renderer role不：

```text
create/recover Frame or Activation
modify Stack
compute Runtime failure unwind
create InputTarget from DOM/Render/Interest
revalidate protocol revision/session/schema
```

Whole accepted Snapshot原子替换；不得逐字段更新。

---

## 3. Initial Hello Handoff

Renderer-control peer：

```text
send renderer.hello(id=1)
→ validate hello Result Snapshot R
→ return initial accepted R
```

Renderer role必须先原子安装：

```text
current = {peer, snapshot:R}
```

之后才开始消费该 peer later `renderer.state`。

Later-state surface可以是 lazy `AsyncIterable`、explicit start或等价机制；不得为了 handoff建立第二个 queue/Store。

---

## 4. Replacement / Local Currentness

Main replacement可能先撤销 old participant，旧 Renderer稍后才观察 carrier close/terminal。

因此：

```text
local current != null
→ locally accepted Control mirror exists
→ this Renderer has not yet observed peer terminal
→ NOT an independent proof that Main still considers it current
```

B 已在本地安装后：

```text
A late Snapshot     → ignore
A late terminal     → ignore for B
A inFlight late msg → ignore if A no longer local current peer
```

只有：

```text
terminalPeer === current.peer
```

才：

```text
current = null
```

不得新增 lease、epoch、heartbeat或第二套 currentness protocol。

---

## 5. Control Loss

Current peer terminal：

```text
current = null
```

本地立即视为：

```text
InputTarget unavailable
DataAuthority unavailable
ordinary input authority unavailable
```

M8+ real Data Connection出现后，其 consumer按 current Main authority/DataAuthority retirement 关闭 current Data；M7 不预建 Data registry。

Render stale-presentation cache属于 M11 Render Store，不属于 Control holder。

---

## 6. Renderer-facing Platform Capabilities

M7 Renderer package**没有** Renderer Control Platform port。

Future real Renderer consumers：

```text
M8+
    RendererDataBinding / current Data connection integration

M12+
    ContentClient

M14/M16 concrete product
    DOM/Canvas/WebGL/presentation/input environment
    BrowserWindow/Window bootstrap
```

Renderer Core不得自行发现 WebSocket URL、MessagePort、ticket、Process/Worker或 Main internal state。

---

## 7. M8 Data Connection Slice

M8 adds real consumers around frozen authority：

```text
Main DataAuthority {S,G,P}
+
current Renderer participant
+
Platform-provisioned paired carrier
→ current Data Connection
```

Connection identity：

```text
Session
+ current Renderer participant
+ subsystemKey
+ generation
+ matching dataProfile
```

Renderer local Control holder itself cannot mint remote currentness or Data currentness。

Data loss/provision failure != Runtime failure/Frame unwind。

---

## 8. M10 User Input Slice

Future effective gate：

```text
current matching Data S/G/P
∧ Main InputTarget == (S,F,A)
∧ mirrored F active/current A
∧ C ∈ Interest[F]
∧ Producer(C) available
```

Interest是 Frame-scoped config，不是 authority。

Renderer Control 与 Data无 cross-connection total order；不增加 ACK/revision join/barrier。

---

## 9. M11 Render Slice

Subsystem拥有 Domain Registry/State/revision；Renderer只维护 authoritative replica + local presentation。

fresh Data carrier：

```text
render.domains
→ fresh snapshot each Domain
→ patch/event
```

```text
Frame close != Domain destroy
Data retire != authoritative Domain destroy
```

Renderer MAY保留 stale presentation cache，但它不是 current Control/Data authority proof。

---

## 10. Reload / Replacement Across Later Slices

完整 future reload：

```text
fresh Renderer Control candidate
→ Main grants fresh current participant
→ full Snapshot
→ Renderer installs local current holder
→ Platform provisions current Data S/G/P
→ Input fresh baseline
→ Render fresh Registry/Snapshots
```

不得恢复：

```text
old Activation
old Renderer participant currentness
old carrier Interest registry
historical Input Event
historical Render Patch/Event chain
```

---

## 11. Physical Realizations

```text
M14 Hostra Desktop
    Renderer hosting        BrowserWindow
    Renderer Control        WebSocket text
    Data                    authenticated Data WebSocket
    Content                 HTTP/fs

M16 PWA
    Renderer hosting        Window
    Renderer Control        MessagePort postMessage(string)
    Data                    transferred MessagePort
    Content                 Fetch/SW/OPFS
```

Physical bootstrap/Port transfer属于 Platform；application payload仍是 JSON text string。

M14/M16 必须遵守同一 Frozen M7 currentness/replacement semantics，不创建 Hostra/PWA-specific Renderer authority protocol。

---

## 12. Backpressure Placement

```text
M7 Renderer Control  → latest full Snapshot / structural 1+1 bound
M10 Input State      → latest coalescible state
M10 Input Event      → bounded ordered lossy queue
M11 Render commit    → Render protocol revision rules
M11 Render Event     → bounded transient queue
```

M7 Holder自己没有 publication queue/history。

---

## 13. Tests

M7 必须覆盖：

```text
initial Snapshot before later-state consumption
atomic {peer,snapshot} install
whole Snapshot replacement
B replaces A
A late Snapshot ignored
A late/inFlight delivery ignored after B local current
A terminal cannot clear B
current terminal clears current
local current not treated as Main remote-currentness proof
no duplicate revision/session validator
no Store/EventBus/subscription framework
no Renderer-facing RendererControlBinding abstraction
```

M8/M10/M11 分别在真实 consumer出现后增加 Data/Input/Render tests；不得提前用 fake future registries作为 M7 closure。

---

## 14. Final Invariants Through M7

1. Renderer不是 Frame RPC participant；
2. Renderer Core platform-neutral；
3. M7 state exactly local `{peer,snapshot}|null`；
4. renderer-control peer owns protocol legality；Renderer role不重复 revision/session validator；
5. local holder不是 Main remote-currentness proof；
6. `RendererControlBinding` 不属于 Renderer-facing M7 API；
7. M7 Main DataAuthority list empty；real Data integration begins M8；
8. no Store/Registry/EventBus/lease/currentness framework in M7；
9. Data/Input/Render lifecycles保持独立；
10. Hostra/PWA application unit统一 JSON text string，physical realization分别 M14/M16。
