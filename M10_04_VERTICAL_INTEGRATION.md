# M10 / 04 — User Input Vertical Integration

> 状态：**Implemented / Regression Verified**
> 阶段：M10 User Input  
> 落地顺序：04  
> 最近复核：2026-09-07  
> 前置：[M10 / 01](M10_01_SUBSYSTEM_INPUT_MANAGER.md) → [M10 / 02](M10_02_RENDERER_INPUT_GATE.md) → [M10 / 03](M10_03_RENDERER_INPUT_PRODUCERS.md)  
> 修正决策：[ADR 0029](doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 依赖基线：M9 Desktop Data Broker / late provisioning qualified  
> 目标：在真实 M9 Data lifecycle 上跑通 Main authority → Renderer gate → User Input wire → Subsystem InputManager → business listener；仅 physical input source保持 deterministic。

> **M10 vertical 不允许直接注入 protocol message、InputTarget、Interest 或 current Data peer。Control、Data、Input 必须走生产路径；业务只通过冻结的 `@loomrealm/subsystem` InputListener surface观察结果。**

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
→ deterministic RendererInputSource
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
→ scope.createInputListener({
     frame,
     channels: ["keyboard.state", "keyboard.event"]
   })
→ listener.on("keyboard.state", ...)
→ listener.on("keyboard.event", ...)
→ canonical keyboard input
→ business-observable result
```

Fixture业务只依赖 `@loomrealm/subsystem` author API，不 import protocol/platform packages。

Handler收到 canonical **payload only**，不得通过测试 fixture暴露 frameId/activationId/wire envelope。

---

## 3. SDK Surface Vertical

必须直接证明冻结的 author semantics：

```text
channels own Interest contribution
on()/unsubscribe() do not alter Interest
setChannels preserves registrations
removed-channel handler dormant
re-add reactivates handler
unsubscribe idempotent
close idempotent
on/setChannels after close → TypeError
```

Retained local baseline：

```text
channel already in derived union + current retained State exists
→ newly registered state handler gets one synchronous current baseline

listener removes channel while another listener keeps union
→ handler dormant, retained State remains globally current
→ re-add channel
→ same handler gets one synchronous current baseline

union actually removes state channel
→ retained State cleared
→ later re-add waits for fresh Renderer baseline
```

`.event` handler registration/re-add never replays historical Event。

---

## 4. Deterministic Handler Ordering

真实 business fixture必须证明：

```text
same-channel handlers invoked in registration order
handler mutation during delivery does not alter current stable delivery snapshot
sync throw contained; later handlers still invoked
returned Promise not awaited before later handler invocation
never-settling Promise does not stall Data reader
rejected Promise contained; Data stays current
```

Multi-channel local State convergence按 canonical ASCII channel order；同 channel 内按 registration order。

---

## 5. Cross-plane Convergence

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

## 6. Real Activation Replacement

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

## 7. Recoverable Mutation Gate Trace

必须覆盖 ADR 0029 的真实 no-commit path：

```text
F/A active + retained State S0
→ business starts frame.call(missing/unavailable target)
→ local mutation gate closes; Main InputTarget remains F/A
→ producer changes to S1
→ Renderer sends S1
→ Subsystem retains S1 but does not deliver while gate closed
→ frame.call receives explicit recoverable pre-commit rejection
→ same F/A mutation gate reopens
→ InputManager synchronously invokes latest retained State handlers
→ only then frame.call Promise becomes rejected/observable to business catch
→ no historical Event replay
```

Test必须证明 business `catch` 开始执行时，同步 State handler side effect已经发生；异步 handler Promise completion不属于该 ordering guarantee。

成功 commit 对照：

```text
pending call while S1 suppressed
→ call commits / A revoked
→ S1 never delivered into old Activation
```

不得通过 Interest toggle 或新的 cross-plane message实现该收敛。

---

## 8. Data Reconnect

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

另用 role-level deterministic carrier fixture证明 fresh generation具有同样的 Interest/State/Event fresh-baseline语义；不为测试提前给 Main增加 generation allocator。

---

## 9. Renderer Source Lifecycle

Vertical必须使用冻结的：

```ts
createRendererControlHolder(data?, input?)
```

并证明：

```text
no current Control → no active source subscription
current Control install → source.start once
Control replacement/terminal → old source subscription invalidated/stopped
late emit from stopped subscription ignored
same holder later installs Control → same source object start again
fresh subscription starts with no inherited producer facts
```

`.state` producer return必须 fresh current sample先于 availability=true；否则 channel不得成为 available。

M14 browser source以后必须通过同一 surface，不允许另开 authority/input path。

---

## 10. Producer / Ordering / Backpressure

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
.state loss
→ producer sample cleared
→ Reset
→ remaining state rebaseline

return
→ fresh sample
→ availability=true
→ fresh State baseline if Effective
```

---

## 11. Failure Boundaries

必须证明：

```text
well-formed stale authority input → drop
protocol-invalid input → Data protocol terminal
Data carrier loss → Data reacquire path, no Runtime failure
Control current loss → all ordinary input disabled
business handler failure → local containment, no Data terminal
invalid author configuration → local TypeError/RangeError, no Data effect
invalid trusted source canonical payload → existing @loomrealm/data local-fatal boundary; no silent normalization
```

M10 不添加 retry/replay/reconnect policy。

---

## 12. No Bypass Rule

Vertical fixture不得：

```text
call InputManager private delivery method
write User Input wire directly
set Renderer Interest/InputTarget directly
construct fake current Data peer outside M9 Broker
bypass bounded input publisher
invoke business handler directly to fake baseline/convergence
```

唯一新增可控 seam 是 exact `RendererInputSource`。

---

## 13. Done

M10/04 完成第一次真实证明：

```text
Main InputTarget
× Subsystem Desired Interest
× Renderer Producer
× current M9 Data connection
→ deterministic business-observable User Input
```

包括：SDK surface semantics、handler ordering/isolation、cross-plane convergence、fresh Activation、recoverable mutation convergence、fresh Data baseline、source lifecycle、barrier/backpressure 与 failure isolation。

下一步：[M10 / 05 — Qualification and Closure](M10_05_QUALIFICATION_CLOSURE.md)。
