# Renderer–Subsystem 协议分层

> 层级：系统架构  
> 状态：Archived Design / Conceptual  
> 稳定程度：Evolving  
> 主要定义：Renderer 与 Subsystem 之间的数据面职责分层及其对 Main committed control state 的依赖  
> 依赖：[通信系统](./communication-system.md)、[运行承载系统](./runtime-hosting-system.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

本文只描述 Renderer ⇄ Subsystem 数据面的概念边界，不冻结 Data Connection / Render / User Input wire Schema，也不能覆盖正式契约。

Frame / Call v1 Batch A/B/C/D 已 Frozen，但全部 Frame RPC、transaction 和 Frame Control timeout/error classification 都属于 **Main ⇄ Subsystem Control Plane**。Renderer 不是 Frame / Call RPC participant，也不是 Frame Control recovery authority。

## 1. 基本拓扑

每个 Subsystem Runtime 与 Renderer 之间最多一条长期 Data Transport：Desktop WebSocket / PWA MessagePort。物理连接粒度是 Subsystem，不是 Frame，也不是 Render。

## 2. 三个数据协议域

```text
Renderer ⇄ Subsystem Runtime

Connection Layer
    connection identity / auth / lifecycle

Render Update Protocol
    Subsystem → Renderer presentation state/events

User Input Protocol
    Renderer → Subsystem ordinary input for Main-authorized Frame/Activation
```

三个域共享物理 Transport，但 identity、lifecycle、Sequence、recovery/backpressure 独立。

## 3. Control Plane 与 Data Plane 分离

```text
Main ⇄ Subsystem Control
    Subsystem Control v1
    Frame / Call v1
        initialize / activate / suspend / resume / close
        call / return
        transaction / acceptance barriers
        semantic error / timeout / failure classification

Main ⇄ Renderer Control
    committed Runtime / Stack / lifecycle / Activation / InputTarget mirror

Renderer ⇄ Subsystem Data
    User Input(frameId + current activationId)
    Render Update(independent Render identity)
```

禁止把 Frame control 复制到 Data Plane，例如 Renderer→Subsystem `frame.activate/frame.resume/frame.call`、Data Connection carrying `frame.return`，或通过 Data message 对 Frame timeout transaction做 retry/replay/resync。

## 4. Connection Layer

负责 Main Grant、Session/Subsystem/Connection identity、version/capability、liveness、replace/close。

不拥有 Frame lifecycle/Stack/Activation/InputTarget、Frame RPC deadline/error state、Render Registry 或 business state。

Data Connection reconnect MAY 恢复数据面连接，但 MUST NOT 被解释成 Frame Control reconnect/resume。

## 5. Render Update

Render Update 使用独立 Render identity：

```text
Subsystem Render Manager
→ Render Update
→ Renderer Render Store
→ Scheduler / DOM / Canvas / WebGL
```

```text
Activation replacement ≠ Render epoch replacement
Frame suspended ≠ Render hidden
Frame closed ≠ Render destroyed
Frame Control failure ≠ Render replay authority
```

## 6. User Input

```text
raw input
→ Renderer Input Router
→ Main-declared InputTarget
→ User Input Protocol
→ Subsystem Frame Input Handler
```

ordinary input 合法至少要求 Frame exists + active + activation current + Frame == Main-authorized InputTarget。旧/revoked Activation 永久无效。

Renderer 不生成 Activation，不恢复缓存旧 Activation，不根据 Render focus/z-order 自行改变公共 InputTarget。

## 7. Batch C Causal Dependency

```text
frame.activate ACK
    happens-before Child Activation/InputTarget publication

frame.resume ACK
    happens-before Caller replacement Activation/InputTarget publication
```

Main-generated activationId 本身不是 Renderer authority；Renderer 只能使用 Main 在 ACK 后发布的 committed value。

Call/Return transaction 中 `InputTarget=null` 合法；Renderer在 gap 停止 ordinary input，不沿用旧 target。old Activation revoke 后不得再次发布为 current。Main MAY coalesce intermediate Stack revision，但不得越过 safety barrier或发布两个 ordinary InputTargets。

## 8. Response Ordering 不进入 Data Plane

```text
frame.call Response
    before dependent Child initialize / activate

frame.return Response
    before dependent close / resume
```

这是 Main⇄Subsystem Control ordering rule，用于避免 same-Subsystem recursive call依赖 nested Request handler。Renderer/Data Connection不参与，也不通过 Data messages确认或重放 Frame transaction。

## 9. Batch D Failure Boundary

Frame Request 的控制结果：

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Renderer/Data Plane MUST NOT：

- 在 Frame timeout 后重新发送或重放 Frame operation；
- 用 Data reconnect 判断操作是否已 applied；
- 用本地 Stack/Input snapshot 修复 Main⇄Subsystem divergence；
- 接受迟到 Frame Response作为 authority恢复信号；
- 恢复 timeout 前 cached Activation。

Frame Control failure后，Renderer只服从 Main 后续发布的 committed Runtime/Frame failure state。具体 Stack unwind由 Batch E冻结。

## 10. 一条连接，多组 Context

Data Connection 可以同时服务 0..N Render Context + 0..N Frame Input Context。不存在平台级 `Frame owns Render`。

## 11. Main Dependency

Main 是 Session、Runtime readiness/failure、Frame identity/lifecycle/Stack、Caller、transaction/error classification、Activation、InputTarget 和 Data Grant 的权威。

稳定状态 Stack Top active+current Activation；其他 live Frames suspended；transaction state可以 Top starting/closing+null InputTarget。

## 12. Runtime Bootstrap / Connection

Data Connection只能在 Runtime ready 后按 Main Grant建立。Frame creation不承担 Runtime startup，也不决定 Data Connection lifecycle。

## 13. Cancellation Boundary

Renderer不能代表 suspended Caller发 `frame.cancel`。UI“取消/返回”只能作为当前 active Frame的 User Input，由该 Frame决定是否以 `FrameOutcome.cancelled` return。

## 14. Frame / Render Independence

Frame initialize/activate/suspend/resume/close不隐式 create/show/hide/resync/destroy Render；Render create/destroy不创建/关闭 Frame；Render/Data recovery不恢复旧 Activation或 Frame Control authority。

## 15. 当前协议拆分方向

```text
Renderer ⇄ Subsystem
├── Connection Protocol
├── Render Update Protocol
└── User Input Protocol

另有：Render State Contract
```

旧 Frame-scoped Data Protocol只作为迁移历史保留，不得把 Frame RPC、transaction/error recovery 或 Activation authority再引入 Data Plane。
