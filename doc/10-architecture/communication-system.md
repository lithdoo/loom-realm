# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：控制面、数据面、内容面、协议职责域、事务因果与 failure recovery 边界  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)  
> 最近复核：2026-08-04

## 1. 三类通信平面

```text
Control Plane
    Subsystem ⇄ Main
        Subsystem Control v1
        Frame / Call v1

    Renderer ⇄ Main
        Runtime / Stack / Activation / InputTarget / Grants

System Data Plane
    Subsystem ⇄ Renderer
        Connection Layer
        Render Update
        User Input

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

共享 Transport 不代表共享 identity/lifecycle/error/recovery model。

## 2. Main ⇄ Subsystem Control

Subsystem Control v1 管 Runtime identity/ready/shutdown/failed；Frame / Call v1 管 Frame/Stack/Input authority。

```text
Frame / Call A-E Frozen
Batch F Next
```

Frame wire exactly seven Requests：

```text
Main → Subsystem
    initialize / activate / suspend / resume / close
Subsystem → Main
    call / return
```

## 3. Normal Frame Ordering

```text
call Response
    before dependent Child initialize/activate

return Response
    before dependent close/resume

activate/resume ACK
    before corresponding InputTarget publication
```

ordinary call无 reverse suspend；same-Subsystem recursion不依赖 nested reverse-request handler。

## 4. Error / Timeout Boundary

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous → Runtime failure
```

Frame Control不做 application retry/replay/idempotency journal。

Recoverable：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

Control divergence / Frozen JSON-RPC protocol error / ambiguous timeout Runtime-fatal。Runtime diagnostics至少：

```text
FRAME_CONTROL_TIMEOUT
FRAME_CONTROL_DIVERGENCE
FRAME_CONTROL_PROTOCOL_ERROR
```

## 5. Batch E Failure Recovery 在 Control Plane

Runtime failure unwind完全属于 Main⇄Subsystem Control/Stack authority，不进入 Renderer Data Plane。

```text
failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix Top→Bottom
→ failed Runtime Frame logical retire
→ healthy descendant frame.close
→ cleanup failure expands root
→ accepted outcome preserve
→ fresh final Caller resume or Stack empty
```

Data messages、Renderer reconnect、Render state snapshot都不能决定或确认 unwind root。

## 6. Failed Runtime 通信规则

一旦 Runtime terminal failed，Main不再依赖新的 normal Frame RPC清理其 Frame；Main直接 logical retire相关 Frame。迟到 Response只做 diagnostics。

健康 Runtime上的 doomed Frame仍可接收一次 best-effort `frame.close`；不要求额外 suspend-before-close。close失败按 Batch D让该 Runtime也 failed，并触发 fixed-point root expansion。

## 7. Main ⇄ Renderer Control

Renderer不是 Frame RPC participant，只观察 Main已 commit Runtime/Stack/lifecycle/Activation/InputTarget。

Batch C/E causal constraints：

```text
activate/resume ACK before publish
revoked Activation never republished
failure barrier may produce InputTarget=null
no two ordinary InputTargets
```

Recovery只有最终 surviving Caller `frame.resume` ACK后才可发布新 Activation。Renderer不得根据 cached Stack恢复旧 target。

## 8. System Data Plane

每有效 Runtime与 Renderer最多一条长期 Data Connection，可承载 0..N Render Context + 0..N Frame Input Context。

```text
Connection Layer
Render Update
User Input
```

三个域共享物理 Transport但 Sequence/recovery/backpressure独立。

## 9. User Input 与 Recovery

ordinary input合法至少要求：Frame exists + active + activationId current + Main-authorized InputTarget。

Call/return mutation gate和 Batch E Failure Unwind Barrier期间可以 `InputTarget=null`。revoked/old Activation必须 reject。

Frame Control Runtime failure不能通过 User Input resend/reset修复。

## 10. Render Independence

Frame active/suspended/closed/unwound不推导 Render visible/hidden/destroyed。Runtime failure可能使对应 Data/Render authority失效，但 Render/Data cleanup仍是独立协议问题。

## 11. Transport Profiles

Desktop：Control/Data=localhost WebSocket；PWA：Control/Data=MessagePort。

PWA Profile MUST保持 Frame A-E：

- exact methods/fields；
- Response-before-dependent-RPC；
- ACK-before-publication；
- finite deadline / ambiguous Runtime failure / no retry；
- lowest-root whole-suffix unwind；
- failed-runtime logical retire；
- fixed-point expansion；
- accepted outcome preservation；
- fresh final Caller resume。

Transport可靠交付机制不得创造第二次 application Frame operation。

## 12. Retry / Recovery Boundaries

```text
Subsystem Control
    no state-changing app retry

Frame / Call
    no state-changing app retry/replay
    no abort/unwind recovery RPC
    ambiguous result → Runtime failure

User Input
    continuous may coalesce / discrete ordered

Render
    recoverable state may snapshot/coalesce
```

不要把 Data Plane 的重放/恢复思想套到 Frame Control。

## 13. Cancellation

v1无 caller-driven `frame.cancel`。`FrameOutcome.cancelled`只表示 active Frame自行 return cancelled。Session termination使用高层 shutdown。

## 14. Security / Authority

所有 wire message视为不可信。Control hello绑定 key/credential；Frame operation验证所属 authenticated connection；Subsystem不能创建公共 frameId/activationId；Renderer不能生成/恢复 Activation；Failure unwind root/failed set只由 Main authority决定。

## 15. 当前状态

已冻结：Game Package Desktop subset、Desktop Node.js Launcher v1、Subsystem Control v1、Frame / Call Batch A-E。

下一冻结目标：

```text
Frame / Call Batch F
    limits / fixtures / profile / version completion
```

随后冻结 Main⇄Renderer Control、Data Connection、User Input、Render Update、Render State。
