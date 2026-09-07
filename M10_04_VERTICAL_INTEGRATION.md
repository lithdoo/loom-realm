# M10 / 04 — User Input Vertical Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M10 User Input  
> 落地顺序：04  
> 最近复核：2026-09-07  
> 前置：[M10 / 01](M10_01_SUBSYSTEM_INPUT_MANAGER.md) → [M10 / 02](M10_02_RENDERER_INPUT_GATE.md) → [M10 / 03](M10_03_RENDERER_INPUT_PRODUCERS.md)  
> 修正决策：[ADR 0029](doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 依赖基线：M9 Desktop Data Broker / late provisioning qualified  
> 目标：在真实 M9 Data lifecycle 上跑通 Main authority → Renderer gate → User Input wire → Subsystem InputManager → business listener；仅 physical input source保持 deterministic。

> **M10 vertical 不允许直接注入 protocol message、InputTarget、Interest 或 current Data peer。Control、Data、Input 必须走生产路径。**

---

## 1. Production-shaped Vertical

```text
real LogicalGameBootstrap
→ real @loomrealm/main
→ real Runtime Control / Frame authority
→ real Renderer Control peer + holder
→ real M9 Desktop authority feed / Broker
→ real paired Data WebSocket
→ real RendererDataPeer
→ Renderer input gate + bounded publisher
→ deterministic canonical input source
→ input.state/event/reset
→ real SubsystemDataPeer
→ Subsystem InputManager
→ business InputListener
```

Node Runner / Hostra provisioning继续走 M6/M9 real path。

M10 不要求 BrowserWindow 或 physical Renderer Control WebSocket；它们仍是 M14。

---

## 2. Minimum Business Fixture

使用真实 `defineSubsystem()` test Definition：

```text
Frame activate
→ create InputListener(frame, [keyboard.state, keyboard.event])
→ canonical keyboard input
→ business-observable result
```

Fixture业务只依赖 `@loomrealm/subsystem` author API，不 import protocol/platform packages。

---

## 3. Cross-plane Convergence

必须分别跑：

```text
Interest first
    Data current
    → Interest[F]
    → no InputTarget / no input
    → Main commits F/A
    → fresh State baseline

Authority first
    Main commits F/A
    → no Interest / no input
    → Interest[F]
    → fresh State baseline
```

两条 trace 的最终 business-observable current State必须等价。

---

## 4. Real Activation Replacement

至少一次 nested Frame call：

```text
caller F/A1 active + input enabled
→ child call accepted
→ caller A1 revoked / suspended
→ child owns InputTarget
→ old caller ordinary input stops
→ child returns
→ caller fresh A2
→ Desired Interest reused
→ fresh A2 State baseline
```

A1 State/Event不得跨到 A2。

---

## 5. Recoverable Mutation Gate Trace

必须覆盖 ADR 0029 的真实 no-commit path：

```text
F/A active + retained State S0
→ business starts frame.call(missing/unavailable target)
→ local mutation gate closes; Main InputTarget remains F/A
→ producer changes to S1
→ Renderer sends S1
→ Subsystem retains S1 but does not deliver while gate closed
→ frame.call returns explicit recoverable pre-commit rejection
→ same F/A mutation gate reopens
→ business observes latest State S1
→ no historical Event replay
```

并覆盖成功 commit 对照：

```text
pending call while S1 suppressed
→ call commits / A revoked
→ S1 never delivered into old Activation
```

不得通过 Interest toggle 或新的 cross-plane message实现该收敛。

---

## 6. Data Reconnect

Frame/Activation不变时退休 current Data：

```text
old Data retired
→ no Runtime failure / Frame unwind
→ old retained State/publication state discarded
→ M9 installs fresh same-authority Data
→ Subsystem republishes full DesiredRegistry
→ Renderer receives fresh Registry
→ Effective .state fresh baseline
→ historical Event not replayed
```

这条是 M10 对 M9 physical lifecycle 的 business-baseline qualification。

另用 role-level deterministic carrier fixture证明 fresh generation具有同样的 Interest/State/Event fresh-baseline语义；不为测试提前给 Main增加 generation allocator。

---

## 7. Local Listener / Handler Behavior

真实 business fixture还必须证明：

```text
second .state listener added while current State retained
→ receives current local baseline without extra wire baseline

.event listener added late
→ no historical Event

handler throws/rejects
→ other matching listener still runs
→ Data remains current
```

非法 author channel/union configuration：

```text
local atomic rejection
→ old DesiredRegistry unchanged
→ no wire send
→ Data remains current
```

---

## 8. Producer / Ordering / Backpressure

必须通过 production input gate证明：

```text
paired transition → post-transition State before Event
Event is global State-coalescing barrier
Reset is global State-coalescing barrier
State cannot coalesce across either barrier
bounded Event overflow drops un-emitted Event
→ surviving Event order preserved
→ Data writer queue does not fail from Input backlog
```

Producer loss/return：

```text
.state loss → Reset → remaining state rebaseline
return → fresh State baseline
```

---

## 9. Failure Boundaries

必须证明：

```text
well-formed stale authority input → drop
protocol-invalid input → Data protocol terminal
Data carrier loss → Data reacquire path, no Runtime failure
Control current loss → all ordinary input disabled
business handler failure → local containment, no Data terminal
```

M10 不添加 retry/replay/reconnect policy。

---

## 10. No Bypass Rule

Vertical fixture不得：

```text
call InputManager private delivery method
write User Input wire directly
set Renderer Interest/InputTarget directly
construct fake current Data peer outside M9 Broker
bypass bounded input publisher
```

唯一新增可控 seam 是 holder-lifetime canonical input source。

---

## 11. Done

M10/04 完成第一次真实证明：

```text
Main InputTarget
× Subsystem Desired Interest
× Renderer Producer
× current M9 Data connection
→ stable business-observable User Input
```

包括：cross-plane convergence、fresh Activation、recoverable mutation convergence、fresh Data baseline、barrier/backpressure 与 business error isolation。

下一步：[M10 / 05 — Qualification and Closure](M10_05_QUALIFICATION_CLOSURE.md)。
