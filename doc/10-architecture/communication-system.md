# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：控制面、System 数据面、内容面、协议职责域、事务因果与恢复边界  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[运行承载系统](./runtime-hosting-system.md)  
> 最近复核：2026-08-04

## 1. 设计目标

Main、Subsystem、Renderer 在 Process/Worker 和不同 Transport 中保持一致应用语义，同时避免 Main 转发高频 User Input / Render Update。

核心原则：Runtime Control、Frame/Call、Renderer Control、System Data Connection、User Input、Render Update、Content 是不同协议域；共享 Transport 不代表共享 identity/lifecycle/error/transaction model。

## 2. 三类通信平面

```text
Control Plane
    Subsystem ⇄ Main
        Subsystem Control Protocol v1
        Frame / Call Protocol v1

    Renderer ⇄ Main
        Session / Runtime / Stack / Activation / InputTarget / Grants

System Data Plane
    Subsystem ⇄ Renderer
        Connection Layer
        Render Update Protocol
        User Input Protocol

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

## 3. Main ⇄ Subsystem Control Plane

Subsystem Control v1：

```text
connected
→ subsystem.hello
→ connection-bound descriptor.key
→ identified
→ optional initializing
→ ready
```

正常 shutdown：Main shutdown intent → `subsystem.shutdown` → optional stopping → Supervisor confirms exit → stopped。`spawn success ≠ connected ≠ identified ≠ ready`；v1 无 application heartbeat/reconnect/resume/restart。

### Frame / Call v1

```text
Batch A  Identity / Authority / Lifecycle / Activation       Frozen
Batch B  RPC Wire Schema / Direction / Local Semantics        Frozen
Batch C  Transaction / Commit Barrier / Rollback              Frozen
Batch D  Error / timeout / retry / cancellation               Frozen
Batch E-F                                                     Draft
```

Frozen methods exactly seven JSON-RPC Requests：

```text
Main → Subsystem
    frame.initialize / activate / suspend / resume / close

Subsystem → Main
    frame.call / return
```

Batch C communication requirements：

- outbound `frame.call / frame.return` pending 时 Subsystem SDK quiesce 对应 Frame 的 ordinary input；
- ordinary call 不依赖 reverse `frame.suspend`；
- Main completes call Response before dependent Child initialize/activate；
- Main completes return Response before dependent close/resume；
- same-Subsystem recursion 不要求 nested reverse-request handler reentrancy；
- post-commit failure不得恢复 revoked Activation。

Batch D communication requirements：

```text
Success Response
    known committed

Explicit Error Response
    known not committed

Timeout / Response loss / pending-request connection loss
    ambiguous
    → Runtime failure
```

全部 Frame Request MUST 有 finite deadline；v1 不做 application-level retry/replay，不定义 operationId/idempotency journal。timeout 后迟到 Response 只用于 diagnostics。

## 4. Error Classification

Frame recoverable semantic errors：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

其中 initialize rejection 表示 target Runtime healthy、Context 未 commit；已 accepted Child 以 `FrameOutcome.failed` + fresh Caller Activation forward-resolve。

Control divergence：

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
```

这些错误、Frozen method/schema 的 JSON-RPC protocol error，以及 ambiguous timeout 均是 Runtime-fatal，不允许通信层自行 resync/retry。

Frame semantic error 复用 `-32000 + error.data.code`。Runtime failure diagnostics 至少区分 `FRAME_CONTROL_TIMEOUT / FRAME_CONTROL_DIVERGENCE / FRAME_CONTROL_PROTOCOL_ERROR`。

## 5. Main ⇄ Renderer Control Plane

Renderer 与 Main 一条 session-level Control Connection，负责 Runtime State、Frame Stack/lifecycle mirror/current Activation/InputTarget、Data Grant/revoke/replace、session diagnostics/reconnect。

Renderer 不拥有 Frame authority，也不是 Frame RPC participant。

Batch C causal constraints：

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller replacement InputTarget publication
```

old Activation commit revoked 后，任何后续 Renderer revision 不得再把它标为 current。`InputTarget=null` transitional revision 合法；不得提前发布未 ACK Activation 或两个同时有效 ordinary InputTargets。

Batch D 的 Frame RPC timeout 不通过 Renderer Control 修复；Renderer 只观察 Main 最终 commit 的 Runtime/Frame failure state。

## 6. System Data Plane

每有效 Runtime Container 与 Renderer 最多一条长期双向 Data Connection，可同时承载 0..N Render Context + 0..N Frame Input Context。zero-Frame Subsystem 也可以维护 Render/Data Connection。

```text
Connection Layer
    auth / identity / version / liveness / replace / close

Render Update
    independent Render identity / state / event / recovery

User Input
    current Frame + Activation ordinary input routing
```

三个域共享 WebSocket/MessagePort，但 Sequence、backpressure、recovery、failure isolation 独立。

## 7. User Input 与 Transaction Gap

普通输入合法至少要求：Frame exists + active + activationId current + Frame == Main-authorized InputTarget。revoked/old Activation MUST reject。

Batch C transaction gap 允许 `InputTarget=null`。Subsystem mutation gate 在 outbound call/return pending 时阻止新的 ordinary input 进入业务 Handler；具体 drop/buffer/reset 留给 User Input Protocol。

Batch D timeout 时 mutation gate 不得被解除后继续旧 Activation；Runtime 进入 failure path。

## 8. Render / Frame Independence

Render Update 使用独立 Render identity。Activation replacement 不启动 Render epoch，也不要求 Render resync。

以下不是公共协议规则：Frame active→Render visible、suspended→hidden、closed→destroyed、Frame create/close→Data Connection create/close。

## 9. Transport Profiles

Desktop：Control/Data = localhost WebSocket，Content = HTTP。PWA：Control/Data = MessagePort，Content = same-origin Fetch/Service Worker。

PWA Control Transport Profile 尚未冻结，但 MUST 精确保持 Frame Batch A/B/C/D：

- method/field 不变；
- Response-before-dependent-RPC；
- activate/resume ACK-before-publish；
- post-commit no rollback；
- finite deadline；
- ambiguous timeout = Runtime failure；
- no automatic Frame RPC retry/replay。

Transport adapter 不得因底层可靠重传机制创造第二次 application operation。

## 10. Renderer Reconnect

Renderer reconnect 使用 Main 当前 committed Stack/lifecycle/Activation/InputTarget；不得恢复 revoked Activation，不得把 Frame Control timeout 解释成可恢复的 Renderer reconnect 问题。Render/Data Connection 独立恢复。

## 11. Backpressure / Retry Boundaries

```text
Subsystem Control
    no state-changing app retry

Frame / Call
    no state-changing app retry/replay
    ambiguous result → Runtime failure

User Input
    continuous may coalesce / discrete bounded ordered

Render
    recoverable state may coalesce per Render/Scope
```

不要把 User Input/Render 可重放或可合并的思想套到 Frame Control RPC。

## 12. Cancellation Boundary

v1 无 caller-driven `frame.cancel`。`FrameOutcome.cancelled` 仅表示 active Frame 自己 return cancelled。Session termination 使用 Session/Subsystem shutdown，不通过 Frame cancellation 表达。

## 13. Security / Authority Principles

所有 wire message 视为不可信；Control hello 绑定 Launch Attempt/key/credential；Frame operation 必须来自 frame 所属 connection-bound Subsystem；Caller receiver 由 Main 决定；Subsystem 不能创建公共 frameId/activationId；User Input 校验 active/current Activation；Data Connection 绑定合法 Grant；Render Update 限制 Subsystem namespace。

## 14. 当前契约状态

已冻结：Game Package v2 Desktop subset、Desktop Node.js Launcher v1、Subsystem Control v1、Frame / Call Batch A/B/C/D。

下一冻结目标：

```text
Frame / Call Batch E
    Runtime failure deterministic unwind
```

随后 Batch F limits/fixtures/profile，再冻结 Main⇄Renderer Control、Data Connection、User Input、Render Update、Render State。
