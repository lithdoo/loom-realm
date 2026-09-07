# M10 / 04 — User Input Vertical Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M10 User Input  
> 落地顺序：04  
> 最近复核：2026-09-07  
> 前置：[M10 / 01](M10_01_SUBSYSTEM_INPUT_MANAGER.md) → [M10 / 02](M10_02_RENDERER_INPUT_GATE.md) → [M10 / 03](M10_03_RENDERER_INPUT_PRODUCERS.md)  
> 依赖基线：M9 Desktop Data Broker / late provisioning qualified  
> 目标：在真实 M9 Data lifecycle 上跑通 Main authority → Renderer gate → User Input wire → Subsystem InputManager → business listener；只把 physical input source 保持 deterministic。

> **M10 vertical 不允许直接给 Subsystem 注入 input message，也不允许直接给 Renderer 注入 InputTarget/Interest。Control、Data、Input 都必须经过现有生产路径。**

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
→ Renderer input gate
→ deterministic canonical producer
→ input.state/event/reset
→ real SubsystemDataPeer
→ Subsystem InputManager
→ business InputListener
```

Node Runner / Hostra provisioning继续走 M6/M9 real path。

M10 不要求 BrowserWindow 或 physical Renderer Control WebSocket；这些仍是 M14。

---

## 2. Minimum Business Fixture

使用一个真实 `defineSubsystem()` test Definition：

```text
Frame activate
→ create InputListener(frame, [keyboard.state, keyboard.event])
→ receive canonical keyboard input
→ record/return business-observable result
```

Fixture业务只依赖 `@loomrealm/subsystem` author API，不 import：

```text
@loomrealm/data
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/platform-ports
```

---

## 3. Required Convergence Traces

### Interest first

```text
Data current
→ Subsystem publishes Interest[F]
→ Renderer has no matching InputTarget
→ no ordinary input
→ Main commits active F/A InputTarget
→ fresh State baseline
```

### Authority first

```text
Main commits F/A InputTarget
→ no Interest[F]
→ no ordinary input
→ Interest[F] arrives
→ fresh State baseline
```

两条 trace 的 business-observable result必须等价。

---

## 4. Activation Replacement

至少覆盖一次真实 nested Frame call：

```text
caller F/A1 active + input enabled
→ child call accepted
→ caller suspended / A1 revoked
→ child owns InputTarget
→ old caller producer changes do not reach caller business
→ child returns
→ caller resumes with fresh A2
→ same Desired Interest reused
→ fresh State baseline for A2
```

A1 State/Event 不得跨到 A2。

---

## 5. Data Reconnect

在 Frame/Activation 不变时退休 current Data connection：

```text
old Data retired
→ no Runtime failure / Frame unwind
→ M9 installs fresh same-authority Data connection
→ Subsystem republish full Interest Registry
→ Renderer receives fresh Registry
→ current Effective .state fresh baseline
→ historical Event not replayed
```

这条是 M10 对 M9 fresh physical lifecycle 的第一项 business-baseline qualification。

---

## 6. Producer Loss / Return

当前 lease 上使一个 `.state` producer unavailable：

```text
stop channel
→ Reset(F,A)
→ remaining Effective states rebaseline
```

producer return：

```text
false → true
→ fresh current State baseline
```

不改变 Main authority 或 Data generation。

---

## 7. Failure Boundaries

必须证明：

```text
stale well-formed input
→ drop

Data carrier loss
→ input unavailable / reconnect path
→ no Runtime failure

Control current loss
→ all ordinary input disabled

malformed/protocol-invalid User Input
→ Data profile terminal semantics
→ no direct Runtime failure / Frame unwind
```

M10 不添加 retry/replay/reconnect policy。

---

## 8. No Bypass Rule

Vertical fixture不得：

```text
call InputManager private delivery method
write wire JSON directly
set Renderer Interest Registry directly
set Renderer InputTarget directly
construct fake current Data peer outside M9 broker
```

唯一可控 test seam 是 physical/canonical producer behavior 与已有 Platform/transport deterministic fixtures。

---

## 9. Done

M10/04 完成意味着第一次真实证明：

```text
Main InputTarget authority
× Subsystem Desired Interest
× Renderer Producer
× current M9 Data connection
→ business-observable User Input
```

下一步：[M10 / 05 — Qualification and Closure](M10_05_QUALIFICATION_CLOSURE.md)。
