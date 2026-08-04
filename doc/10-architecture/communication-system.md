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

Desktop 中 Subsystem 主动连接 Main Control WebSocket。

### Subsystem Control v1

```text
connected
→ subsystem.hello
→ connection-bound descriptor.key
→ identified
→ optional initializing
→ ready
```

正常 shutdown：

```text
Main shutdown intent
→ subsystem.shutdown
→ optional status(stopping)
→ Supervisor confirms exit
→ stopped
```

`spawn success ≠ connected ≠ identified ≠ ready`；`shutdown Response / stopping ≠ stopped`。v1 无 application heartbeat/reconnect/resume/restart。

### Frame / Call v1

```text
Batch A  Identity / Authority / Lifecycle / Activation       Frozen
Batch B  RPC Wire Schema / Direction / Local Semantics        Frozen
Batch C  Transaction / Commit Barrier / Rollback              Frozen
Batch D-F                                                     Draft
```

Frozen methods：

```text
Main → Subsystem
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close

Subsystem → Main
    frame.call
    frame.return
```

全部是 JSON-RPC Request，closed schema。

Batch C communication requirements：

- outbound `frame.call / frame.return` pending 时 Subsystem SDK 必须 quiesce 对应 Frame 的 ordinary input dispatch；
- ordinary `frame.call` 不依赖 Main→Subsystem `frame.suspend`；Caller suspension 由 call acceptance commit + success Response 确认；
- Main MUST complete `frame.call` Response before dependent Child `frame.initialize / frame.activate`；
- Main MUST complete `frame.return` Response before dependent `frame.close / frame.resume`；
- 因此 same-Subsystem recursive call 不要求 bidirectional nested-request handler reentrancy；
- post-commit failure不得恢复 revoked Activation。

## 4. Main ⇄ Renderer Control Plane

Renderer 与 Main 一条 session-level Control Connection，负责 Runtime State、Frame Stack/lifecycle mirror/current Activation/InputTarget、Data Grant/revoke/replace、session diagnostics/reconnect。

Renderer 不拥有 Frame authority，也不是 Batch B Frame RPC participant。

Batch C 冻结的 causal constraints：

```text
frame.activate ACK
    happens-before Child Activation/InputTarget publication

frame.resume ACK
    happens-before Caller replacement Activation/InputTarget publication
```

并且：

```text
old Activation commit revoked
    happens-before
任何后续 Renderer revision 不再把它标为 current
```

Main MAY 发布或 coalesce `InputTarget=null` transitional revision，但 MUST NOT：

- 提前发布尚未被目标 Subsystem ACK 的 Activation；
- 重新发布 revoked Activation；
- 发布两个同时有效 ordinary InputTargets。

Renderer Control wire Schema 后续单独冻结，但不得改变这些 Batch C ordering guarantees。

## 5. System Data Plane

每有效 Runtime Container 与 Renderer 最多一条长期双向 Data Connection，可同时承载 0..N Render Context + 0..N Frame Input Context。zero-Frame Subsystem 也可以维护 Render/Data Connection。

## 6. Renderer–Subsystem Protocol Domains

```text
Connection Layer
    auth / identity / version / liveness / replace / close

Render Update
    independent Render identity / state / event / recovery

User Input
    current Frame + Activation ordinary input routing
```

三个域共享 WebSocket/MessagePort，但 Sequence、backpressure、recovery、failure isolation 独立。Connection heartbeat 只属于 Data Connection Layer，不是 Subsystem Control heartbeat。

## 7. User Input Identity 与 Transaction Gap

普通输入合法至少要求：

```text
Frame exists
AND lifecycle == active
AND activationId == currentActivationId
AND Frame == Main-authorized InputTarget
```

revoked/old Activation MUST reject。

Batch C transaction gap 允许：

```text
InputTarget = null
```

例如 Caller call accepted 后到 Child activate ACK 前，或 Child return accepted 后到 Caller resume ACK 前。

Subsystem sender-side mutation gate 必须在 outbound call/return pending 时阻止新的 ordinary input 继续进入业务 Handler；User Input Protocol 后续决定队列/drop/reset 的 wire 细节。

## 8. Render Update Identity

Render Update 使用独立 Render identity，不使用 `frameId + activationId` 作为 Render lifecycle identity。Activation replacement 不启动 Render epoch，也不要求 Render resync。

## 9. Frame / Render / Data Independence

以下都不是公共协议规则：

```text
Frame active      → Render visible
Frame suspended   → Render hidden
Frame closed      → Render destroyed
Frame create      → Data Connection create
Frame closed      → Data Connection close
```

## 10. Content Plane

Readonly Content API 提供 manifest/record/group/resource，不承载 User Input、Render State、Runtime Tick、Frame Stack、Activation 或 Runtime Bootstrap 控制。

## 11. Transport Profiles

Desktop：Control/Data = localhost WebSocket，Content = HTTP。

PWA：Control/Data = MessagePort，Content = same-origin Fetch/Service Worker。

PWA Control Transport Profile 尚未冻结，但 MUST 精确保持 Subsystem Control v1 与 Frame Batch A/B/C 应用语义。Transport adapter MUST NOT：

- 把 `frame.call` 改成依赖嵌套反向 Request；
- 在 activate/resume ACK 前发布新 Activation；
- 以 MessagePort/Worker convenience 恢复旧 Activation；
- 添加 caller/close reason/system method 等 wire 变体。

## 12. Renderer Reconnect

```text
reconnect Main Control
→ restore committed Session / Runtime / Stack
→ restore current Activation / InputTarget
→ rebuild authorized Data Connections
→ User Input only current Activation
→ Render independently restores
```

不得恢复 revoked Activation，不得从 transitional/uncommitted local state推导 authority。

## 13. Backpressure / Retry Boundaries

```text
Subsystem Control v1
    no silent drop / state-changing app retry

Frame / Call
    Batch C fixes transaction barriers
    Batch D freezes timeout/retry/idempotency/ambiguous delivery

User Input
    continuous may coalesce / discrete bounded ordered

Render
    recoverable state may coalesce per Render/Scope
```

JSON-RPC Response delivery loss after commit 的 ambiguous handling 属于 Batch D，通信层不得自行把它当普通 retry。

## 14. Security / Authority Principles

- 所有 wire message 视为不可信；
- Control hello 绑定 Launch Attempt / key / credential；
- Frame operation 必须来自 frame 所属 connection-bound Subsystem；
- Caller receiver 由 Main 决定；
- Subsystem 不能创建公共 frameId / activationId；
- User Input 校验 active/current Activation；
- Data Connection 绑定合法 Grant；
- Render Update 限制 Subsystem Render namespace；
- Content API 只接受逻辑资源 identity。

## 15. 当前契约状态

已冻结：Game Package v2 Desktop subset、Desktop Node.js Launcher v1、Subsystem Control v1、Frame / Call Batch A/B/C。

下一冻结目标：

```text
Frame / Call Batch D
    semantic error / timeout / retry / idempotency / cancellation
```

随后 Batch E Runtime unwind、Batch F limits/fixtures/profile，再冻结 Main⇄Renderer Control、Data Connection、User Input、Render Update、Render State。
