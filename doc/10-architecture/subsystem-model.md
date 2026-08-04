# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem 的职责、Frame/Input 适配、mutation gate、错误收敛与 Runtime failure unwind 边界  
> 依赖：[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)  
> 下层契约：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. Subsystem 职责

Subsystem 负责自身业务状态、Frame/Input Context、ordinary User Input 校验、Render Context、Content Client 与 Frame / Call adapter。平台不要求 per-Frame Core/Render/Tick。

Frame / Call Batch A-E 已 Frozen。

## 2. Authority Boundary

```text
Main
    Runtime Registry
    Frame identity / caller / lifecycle / outcome
    Stack / transaction / Runtime-failure unwind
    Activation / InputTarget
    Frame error classification

Subsystem Runtime
    business state
    Frame/Input Context
    outbound call/return mutation gate
    local deadline/failure handling
    Render Registry / Render State

Renderer
    Main committed control-state mirror
    Data Connection / Frame Input / Render presentation
```

Subsystem不得创建公共 frameId/activationId、修改 Main Stack/Caller、维护第二份公共 recovery authority或从本地决定 lower Frame resume。

## 3. Frozen Frame Model / RPC

```text
lifecycle = starting / active / suspended / closing / closed
outcome   = completed / cancelled / failed
Activation = one-shot / never reused / never rolled back
```

RPC exactly seven：

```text
Main → Subsystem
    initialize / activate / suspend / resume / close
Subsystem → Main
    call / return
```

无 `frame.cancel/frame.abort/frame.unwind`、Caller wire、close reason、`system.call/system.return/frame.result`。

## 4. Mutation Gate

Subsystem outbound `frame.call / frame.return` pending 时停止新的 ordinary input dispatch并阻止第二个 call/return。

```text
Success
    → commit corresponding suspended/closing local state

Recoverable Explicit Error
    → release gate / current active Activation remains

Fatal Explicit Error or timeout/loss
    → MUST NOT release back to old Activation
    → Runtime failure path
```

`Explicit Error=no-commit` 不等于 recoverable。

## 5. Incoming Frame Control

`frame.initialize` 可用 `FRAME_INITIALIZE_REJECTED + FrameFailure` 做合法业务拒绝，表示 Context未 commit且 Runtime healthy。

合法 `activate/suspend/resume/close` 的 identity/lifecycle/Activation mismatch 是 control divergence，不做私有 resync。

`resume` 同时交付 Child Outcome + replacement Activation；`close` 不停止 Runtime、不清共享业务状态、不销毁 Render。

## 6. Batch D Runtime Failure Trigger

Subsystem自身 `frame.call/return` timeout、Control divergence 或 protocol error时：

```text
stop normal Frame processing
keep ambiguous mutation gate closed
report subsystem.status(failed) when Control is usable
```

诊断至少：

```text
FRAME_CONTROL_TIMEOUT
FRAME_CONTROL_DIVERGENCE
FRAME_CONTROL_PROTOCOL_ERROR
```

No retry/replay/idempotency journal。

## 7. Batch E：Subsystem 不拥有 Unwind

Runtime failure后 Stack如何收敛完全由 Main决定。

Subsystem MUST NOT：

```text
自行选择 lower Frame active
自行恢复旧 Activation
自行逐层 resume本 Runtime的 suspended Frame
根据本地 Context猜测 unwind root
```

尤其 same-Subsystem recursion：

```text
F1 A suspended
F2 A suspended
F3 A active
```

A Runtime一旦 terminal failed，F1/F2/F3都由 Main failure-unwind authority处理；Runtime自身不能尝试“退回 F2”。

## 8. Healthy Runtime 被卷入 Suffix

一个 Runtime本身健康，但其 Frame可能因为 ancestor Runtime failure成为 doomed descendant。

Main会对该 Frame撤销公共 authority并发送 `frame.close`。Subsystem应按普通 close语义删除对应 Frame/Input Context；Render/shared business state仍不由 Frame close隐式删除。

Recovery不要求 Main先额外发送 `frame.suspend`；`frame.close` terminal cleanup必须能从 Main已决定 closing 的 Frame安全删除本地 Context并拒绝旧输入。

## 9. Failed Runtime 上不再期待 Frame RPC

Runtime一旦已报告/进入 terminal failed：

```text
MUST NOT 发起新的正常 Frame operation
```

Main也不会依赖新的 normal Frame RPC清理该 Runtime上的 Frame。其 Frame会在 Main侧 logical retire，Runtime自身做有限 cleanup并尽快退出。

## 10. Late / Pending Request

Runtime已经 failed 后迟到 Frame Response不恢复状态。

如果 Runtime仍 healthy但 Main已经把某 Frame纳入 failure suffix，既有 Request可能完成；成功只影响本地 cleanup knowledge，不意味着 Activation一定会被 Main发布。Subsystem必须以 Main后续 `frame.close`/Control state为准，不自行恢复 InputTarget。

## 11. Outcome / Runtime Failure

已成功 `frame.return` 的 terminal outcome已经被 Main acceptance-commit，不会因为 Runtime随后 crash而被覆盖。

如果 Runtime在 root Frame没有 accepted outcome时失败，Main可能向 surviving Caller生成：

```text
FrameOutcome.failed.error.code = SUBSYSTEM_RUNTIME_FAILED
```

这是 Main产生的 Caller-visible platform outcome，不是 Subsystem自行 return的业务错误。

## 12. Ordinary Input Router

```text
input
→ locate frameId
→ require local Context active/current Activation
→ require no mutation gate
→ dispatch business Handler
```

revoked/old Activation永久拒绝。Main撤销 InputTarget/recovery开始后，新普通输入不应继续路由；`frame.close` 到达时必须终止该 Frame的本地 input authority。

## 13. Cancellation / Render Boundary

v1无 caller-driven `frame.cancel`；`cancelled`只由 active Frame自行 `frame.return({type:"cancelled"})`。

Frame close/unwind不隐式 create/hide/destroy Render，也不决定 Data Connection lifecycle。

## 14. 架构不变量

1. Frame/Stack/Activation/recovery authority=Main；
2. Subsystem无第二份 Caller/Stack/unwind authority；
3. exactly seven RPC；
4. call/return pending有 mutation gate；
5. timeout/ambiguous不释放旧 Activation、不 retry；
6. initialize business rejection可恢复；divergence/protocol fatal；
7. terminal failed Runtime不尝试本地 Frame recovery；
8. healthy doomed Frame接受 Main `frame.close` cleanup；
9. accepted outcome不因 Runtime crash改变；
10. no caller cancel / no abort-unwind wire；
11. Frame lifecycle不控制 Render/Data/Runtime lifecycle。
