# Web 渲染端模块设计

> 层级：模块设计  
> 状态：M8 Implemented / Qualified；M10 Input Preimplementation Closed  
> 稳定程度：M8 Implementation Closed / M10 Frozen Plan  
> 主要定义：Renderer Control holder、per-subsystem Data reconciliation、M10 Input gate/publisher/source placement、M11+ Render placement  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[ADR 0029](../../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 最近复核：2026-09-07

Renderer 不是 Frame/Call participant。它镜像 Main committed authority，并在 current Data peers上执行 Input/Render child protocol role behavior。

---

## 1. Current Shape

```text
@loomrealm/renderer
└── one Control holder
    ├── current {peer,snapshot} | null
    ├── per-subsystem Data slot
    │   ├── 0..1 current RendererDataPeer
    │   ├── 0..1 pending acquire
    │   └── 0..1 failed desired identity
    └── optional holder-lifetime canonical input source   // M10
```

M8已实现 Control-driven Data reconciliation。M10只在现有 current Data slot上增加 Input local state，不创建独立 connection/currentness layer。

---

## 2. Authority / Currentness

Main publishes committed：

```text
Runtime projection
Frame / Activation / InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

Renderer不得：

```text
create/recover Frame or Activation
modify Stack
compute failure unwind
create InputTarget from focus/Interest
revalidate Control revision/session/schema
mint Data authority/currentness
```

Control snapshot whole-replace；local current holder不是 Main remote-currentness proof。Old peer late state/terminal不得影响 replacement current。

---

## 3. Data Slot

Desired Data identity remains exactly：

```text
current Control peer
+ subsystemKey
+ generation
+ dataProfile
```

Data loss/provision failure不等于 Runtime/Frame failure。

fresh current Data peer建立新的 carrier-local Input/Render publication state；旧 slot的 handler/publisher settlement不得复活。

---

## 4. M10 Effective Input Gate

对 `(S,F,A,C)`：

```text
Effective
=
current matching Data
∧ current Control snapshot
∧ Main InputTarget == (S,F,A)
∧ mirrored F active with activationId A
∧ C ∈ current Interest[F]
∧ Producer(C) available
```

Interest / focus / component / carrier existence不能创建 authority。

Control 与 Data没有 cross-connection total order；Interest-first / Authority-first都通过 current facts重算收敛，不增加 ACK/revision join/barrier。

ADR 0029 的 Subsystem mutation gate不进入 Renderer Effective；Renderer无需知道业务是否暂时 suppress delivery。

---

## 5. Input Slot State

每个 current Data slot的 Input state只需要：

```text
current full Interest Registry
current Effective facts
one bounded User Input publisher
```

不得创建：

```text
InputTarget registry
Frame/Activation shadow state machine
Input Store/EventBus
currentness lease/heartbeat
```

Data retire立即销毁该 carrier-local Registry/Effective/publisher state。

---

## 6. Bounded Publisher

User Input coalescing/backpressure由 Renderer role拥有；`@loomrealm/data`只负责 validated serialized send。

```text
0..1 Data send inFlight
bounded pending input work
```

Frozen rules：

```text
State = latest pending per state channel between barriers
Event = ordered / no coalesce / bounded / may drop before emitted
Event = global State-coalescing barrier
Reset = teardown + global State-coalescing barrier
```

State不得跨 Event/Reset移动。Event overflow必须在 generic Data writer overflow之前 local-drop；不能把普通 Input backlog变成 Data local-fatal。

---

## 7. Lease / Producer Transitions

same-carrier old lease → new lease：

```text
old Effective false immediately
→ discard obsolete not-started old State/Event
→ best-effort Reset(old)
→ first new ordinary input only after Reset barrier
```

`.state` producer loss：Reset current lease并重新 baseline其它 remaining Effective states；return时 fresh baseline。

`.event` producer loss/return只影响 future Events。

---

## 8. Canonical Input Source

M10只允许一个窄 source seam：

```text
one optional source injected at Renderer holder construction
→ owned/consumed for holder lifetime
→ availability may change
→ no runtime producer registry
```

Source只提供：

```text
canonical channel availability
current self-contained State sample
future canonical transitions/events
```

Source不知道 Frame/Activation/Interest/Data/wire ordering，也不能直接调用 Data peer。

M10使用 deterministic source；M14 BrowserWindow DOM/Pointer/Gamepad mapping必须复用同一 seam/gate/publisher。

---

## 9. M11 Render Placement

Subsystem拥有 Domain Registry/State/revision；Renderer维护 authoritative replica + local presentation。

fresh Data：

```text
render.domains
→ fresh snapshot each Domain
→ patch/event
```

```text
Frame close != Domain destroy
Data retire != authoritative Domain destroy
```

Renderer MAY保留 stale presentation cache，但它不是 current authority proof。

---

## 10. Physical Realization

```text
M14 Hostra Desktop
    BrowserWindow
    Renderer Control WebSocket
    M9 Data WebSocket Broker
    real DOM/Gamepad input source
    presentation

M16 PWA
    Window + MessagePort Control/Data
    same logical Input/Render semantics
```

M10 不新增 Platform Port，也不实现 BrowserWindow。

---

## 11. Tests / Invariants

M10必须证明：

```text
Interest-first / Authority-first convergence
fresh Activation/Data state baseline
same-carrier Reset-before-new-input
Event/Reset barrier correctness
bounded Event overflow without Data local-fatal
producer loss/return
old holder/source/Data slot cannot emit after replacement
```

Final invariants：

1. Renderer不是 Frame RPC participant；
2. Control holder仍是唯一 local Control current record；
3. M8 Data currentness不被 Input重复实现；
4. M10 Input只组合 current facts；
5. one holder-lifetime source，无 producer registry；
6. one bounded publisher per current Data slot；
7. Input/Data/Frame/Render lifetimes保持独立；
8. Hostra/PWA physical差异不得改变 logical User Input semantics。
