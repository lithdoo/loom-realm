# M10 / 02 — Renderer Input Gate

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M10 User Input  
> 落地顺序：02  
> 最近复核：2026-09-07  
> 前置：[M10 / 01](M10_01_SUBSYSTEM_INPUT_MANAGER.md)  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> Renderer boundary：[Web Renderer](doc/20-modules/web-renderer/README.md)  
> 目标：在现有 M7 Control mirror + M8 per-subsystem Data slot 上实现 Renderer sender gate；只组合 committed facts，不创建第二套 authority/currentness。

> **Renderer 不决定谁拥有输入。它只计算 `current Data × Main InputTarget × Interest[F] × Producer(C)` 的交集。**

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

---

## 2. Renderer-local State

每个 current Data slot只需要：

```text
current input.interest full Registry
current effective lease/channel facts
minimal retained producer state needed for fresh baseline/reset ordering
```

Control snapshot仍由现有 holder whole-replace；Data currentness仍由现有 M8 slot拥有。

不得创建：

```text
InputTarget registry
Frame shadow state machine
Activation history
cross-plane revision/join barrier
Generic Store / ObserverHub
```

---

## 3. Interest Handling

`input.interest` 是 Subsystem → Renderer 的 full replacement snapshot。

收到合法 Registry：

```text
replace current Registry atomically
→ recompute Effective for affected channels
```

unknown/stale Frame Interest 保留为 inert configuration；不是协议错误。

Control 与 Data 无 total order，因此两种顺序都合法：

```text
Interest first → inert → later authority activates
Authority first → no input → later Interest activates
```

不得增加 ACK、revision join、handshake 或 barrier。

---

## 4. Effective Transitions

### `.state` false → true

必须发送 fresh self-contained current baseline。

典型原因：

```text
Interest expand
fresh Activation/InputTarget
fresh Data peer
Producer returns
```

### `.event` false → true

只允许之后发生的 future Event；不 replay。

### true → false

立即停止生成新的 ordinary input。

原因包括：

```text
InputTarget revoke/replace
Frame no longer active
Interest shrink
Producer loss
Data retirement
Control loss
```

---

## 5. Lease Replacement

同一 current Data carrier 上：

```text
old (F1,A1) → new (F2,A2)
```

必须保证：

```text
stop old lease immediately
→ best-effort input.reset(F1,A1)
→ first ordinary input for A2
```

即使中间 `InputTarget=null` 被 Renderer Control latest-state publication coalesce 掉，也保持上述顺序。

不同 Subsystem/Data carrier 之间不建立跨 carrier ordering。

---

## 6. Producer Loss

`.event` producer loss：停止 future Event，无 replay。

当前 Effective `.state` producer loss且 lease/Data仍 current：

```text
stop affected state channel
→ best-effort Reset(F,A)
→ fresh baseline every remaining Effective .state channel
```

因为 Reset 清整个 `(F,A)` retained State。

---

## 7. Data / Control Loss

Data retired：

```text
Interest Registry discarded
carrier publication state discarded
old unsent input discarded
```

fresh Data peer从 empty Registry开始，等待 Subsystem republish。

Current Control peer terminal：

```text
InputTarget unavailable
→ all Effective=false immediately
```

两者都不创建 Runtime/Frame failure。

---

## 8. Abstraction Budget

允许：

```text
one private input gate attached to existing Renderer holder/Data slots
one current Interest Registry per current Data peer
bounded State/Event send policy required by Frozen protocol
```

禁止：

```text
Renderer InputManager mirroring Subsystem API
Generic authorization engine
InputTarget/currentness lease layer
cross-plane synchronizer
retry/replay queue
historical event/state log
```

---

## 9. Done

M10/02 必须证明：

```text
Interest-first and authority-first converge
fresh Activation produces fresh state baseline
same-carrier target replacement orders Reset before new input
Interest shrink stops immediately
stale Control/Data facts cannot emit input
Data reconnect does not replay Event
Control loss disables all ordinary input
```

下一步：[M10 / 03 — Renderer Input Producers](M10_03_RENDERER_INPUT_PRODUCERS.md)。
