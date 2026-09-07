# M10 / 02 — Renderer Input Gate

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M10 User Input  
> 落地顺序：02  
> 最近复核：2026-09-07  
> 前置：[M10 / 01](M10_01_SUBSYSTEM_INPUT_MANAGER.md)  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> Renderer boundary：[Web Renderer](doc/20-modules/web-renderer/README.md)  
> 目标：在现有 M7 Control holder + M8 current Data slots 上实现唯一 Renderer input gate 与 bounded publisher；只组合 committed facts，不创建第二套 authority/currentness。

> **Renderer 不决定谁拥有输入。它只计算 `current Data × Main InputTarget × active F/A × Interest[F] × Producer(C)`，并把 Frozen State/Event/Reset ordering落到 current Data peer。**

---

## 1. Effective Gate

对 `(S,F,A,C)`：

```text
Effective
=
current Data for S/G/P
∧ current Control peer/snapshot exists
∧ Main InputTarget == (S,F,A)
∧ mirrored F is active with activationId A
∧ C ∈ current Interest[F]
∧ Producer(C) available
```

Interest、DOM focus、Render focus、carrier existence 都不能创建 authority。

Renderer 不知道也不镜像 Subsystem mutation gate；ADR 0029 的 suppressed-State convergence完全是 Subsystem-local behavior。

---

## 2. Placement / Local State

Input gate直接附着现有 Renderer holder/Data slot：

```text
Control holder
└── Data slot per subsystem
    ├── current RendererDataPeer
    └── current carrier-local Input state
        ├── Interest Registry
        ├── Effective facts
        └── bounded input publisher
```

Control snapshot仍 whole-replace；Data currentness仍由 M8 slot拥有。

不得创建：

```text
InputTarget registry
Frame shadow state machine
Activation history/currentness lease
cross-plane revision/join barrier
Store / ObserverHub / EventBus
```

---

## 3. Interest Handling

`input.interest` 是 current carrier的 full replacement Registry。

收到合法 Registry：

```text
atomically replace current Registry
→ recompute Effective from current facts
```

unknown/stale Frame Interest保持 inert；不是协议错误。

Control/Data arrival order均合法：

```text
Interest first → inert → authority later → Effective
Authority first → no Interest → Interest later → Effective
```

不增加 ACK、revision join、handshake 或 barrier。

---

## 4. Effective Transitions

`.state` `false → true`：

```text
queue one fresh self-contained current baseline
```

包括：

```text
Interest expand
fresh Activation/InputTarget
fresh carrier after Interest republish
Producer return
```

`.event` `false → true`：future-only，无 replay。

`true → false`：立即阻止新的 ordinary input进入 publisher；尚未开始 send 的 obsolete State/Event按 lifetime boundary丢弃。

---

## 5. Bounded Input Publisher

User Input ordering/backpressure 由 Renderer input gate拥有，`@loomrealm/data` 只提供 validated serialized send。

每个 current Data peer只有一个 publisher：

```text
0..1 send inFlight
bounded pending input state
```

observable rules exactly：

```text
State
    latest pending snapshot per Effective state channel between barriers
    MAY coalesce before emitted

Event
    ordered / never coalesced / future-only
    bounded; MAY drop before emitted
    retained Event is global State-coalescing barrier

Reset
    teardown barrier
    global State-coalescing barrier
    prioritized over obsolete old-lease pending State
```

禁止 State 跨 Event/Reset barrier coalesce/reorder。

Event overflow：

```text
drop not-yet-emitted Event according to bounded local policy
→ surviving Events preserve order
→ no replay
→ does not overflow generic Data writer into local-fatal
```

具体 queue capacity 是 implementation-local finite constant，不进入 wire/profile contract。

---

## 6. Lease Replacement

同一 current Data carrier：

```text
old (F1,A1) → new (F2,A2)
```

固定：

```text
mark old lease ineffective immediately
→ discard not-started obsolete old State/Event
→ best-effort queue Reset(F1,A1)
→ Reset barrier ordered before first ordinary input for new lease
```

即使 Control latest-state publication没有暴露中间 null target，也保持该顺序。

不同 Data carrier之间不创建跨 carrier ordering。

---

## 7. Producer Loss / Return

`.event` producer loss：停止 future Event，无 replay。

当前 Effective `.state` producer loss且 same lease/Data仍 current：

```text
stop affected channel
→ best-effort Reset(F,A)
→ after Reset rebaseline every remaining Effective .state channel
```

Producer return：

```text
.state → false→true fresh baseline
.event → future-only
```

不改变 Main authority、Data generation 或 Interest。

---

## 8. Data / Control Retirement

Data retired：

```text
Interest Registry discarded
Effective facts discarded
publisher retired
not-started State/Event/Reset discarded
old send settlement cannot resurrect slot
```

fresh Data peer从 empty Registry开始，等待 Subsystem republish。

Current Control peer terminal：

```text
InputTarget unavailable
→ all Effective=false immediately
```

Input/Data loss不创建 Runtime/Frame failure。

---

## 9. Abstraction Budget

允许：

```text
one private input gate attached to existing holder/Data slots
one current Interest Registry per current Data peer
one bounded publisher implementing Frozen State/Event/Reset semantics
```

禁止：

```text
Renderer InputManager mirroring Subsystem API
Generic authorization / queue / connection framework
InputTarget/currentness lease layer
cross-plane synchronizer
retry/replay/history
```

---

## 10. Done

M10/02 必须证明：

```text
Interest-first / authority-first convergence
fresh Activation/fresh carrier state baseline
same-carrier replacement Reset before new ordinary input
Event/Reset are global State-coalescing barriers
State cannot coalesce across retained Event/Reset
bounded Event overflow drops before Data writer overflow
Interest shrink / Control loss / Data retirement stop input immediately
old slot/publisher settlement cannot emit after replacement
```

下一步：[M10 / 03 — Renderer Input Producers](M10_03_RENDERER_INPUT_PRODUCERS.md)。
