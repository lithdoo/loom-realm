# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem 的职责、状态所有权、Frame/Input 适配、outbound mutation gate、错误收敛与 Render 边界  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)  
> 下层契约：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. Subsystem 职责

Subsystem 是业务扩展单元。它负责自身权威业务状态、Frame/Input Context、ordinary User Input 校验、Render Context、Render Update、Content Client，以及 Frame / Call adapter。

平台不要求所有 Subsystem 采用相同 Tick、业务状态拆分、per-Frame Core/Projector 或 Render 内部结构。

## 2. Authority Boundary

```text
Main
    Runtime Registry
    Frame identity / caller / lifecycle
    Stack / transaction commit
    Activation / InputTarget
    Frame error classification

Subsystem Runtime
    authoritative business state
    Frame/Input Context
    outbound call/return mutation gate
    local Frame RPC deadline handling
    Render Registry / Render State
    shared resources/cache

Renderer
    committed Main state read-only mirror
    Data Connection Registry
    Frame Input Registry
    Render Store / presentation state
```

Subsystem MUST NOT 直接修改 Main Stack、创建公共 `frameId/activationId`、维护第二份公共 Caller/Stack authority、伪造其他 Subsystem identity 或使用 PID/Worker/Connection ID 代替协议身份。

## 3. Frame / Container / Render

```text
Subsystem
    descriptor.key

Runtime Container
    Desktop Process / PWA Dedicated Worker

Frame
    Main-owned call / ordinary User Input Context

Render
    Subsystem-owned presentation Context
```

one Runtime Container 可承载 0..N Frame/Input Context + 0..N Render Context。Frame 与 Render 没有公共一一 ownership。

## 4. Frozen Frame Model

```text
frameId
    Main-generated / Session unique / never reused

Frame → Subsystem
    permanent descriptor.key assignment

callerFrameId
    Main-owned / immutable

lifecycle
    starting / active / suspended / closing / closed

outcome
    completed / cancelled / failed

Activation
    active only / one-shot / never reused / never rolled back
```

v1 无 Frame `ready / initialized / frame.status`。`callerFrameId` 不下发给 initialize/return；业务如需调用来源，应显式放在 `input`。

## 5. Frozen RPC Surface

```text
Main → Subsystem
    frame.initialize({ frameId, input })
    frame.activate({ frameId, activationId })
    frame.suspend({ frameId, activationId })
    frame.resume({ frameId, activationId, returnedFrameId, result })
    frame.close({ frameId })

Subsystem → Main
    frame.call({ frameId, activationId, targetSubsystemKey, input }) → { childFrameId }
    frame.return({ frameId, activationId, result }) → {}
```

全部为 JSON-RPC Request；source identity 来自 authenticated Control Connection；无 `system.call/system.return/frame.result/frame.cancel`；close 无 reason；resume=Child outcome+replacement Activation。

## 6. FrameOutcome

```ts
type FrameOutcome =
  | { type: "completed"; value: JsonValue }
  | { type: "cancelled" }
  | { type: "failed"; error: FrameFailure };
```

`completed.value` 必填；无业务返回值=`null`。Outcome 不是 lifecycle；`FrameOutcome.failed` 也不是 JSON-RPC Error。

## 7. Outbound Mutation Gate

Subsystem 发送 outbound `frame.call` / `frame.return` 后，直到收到 Response 前必须建立内部 mutation gate：停止新的 ordinary input dispatch，禁止第二个 call/return。该 gate 不是公共 lifecycle state。

结果处理：

```text
Success
    → commit Batch C local state

Explicit recoverable Error
    → gate releases
    → Frame remains active/current Activation remains valid

Timeout / Response loss / pending-request connection loss
    → commit state unknown
    → gate MUST NOT release back to old Activation
    → Runtime failure path
```

因此 SDK 不能把 timeout 当成“没发生过”。

## 8. `frame.call` Local Commit

ordinary call 不使用 reverse `frame.suspend`。

当 Caller 收到成功 `{childFrameId}`：Caller local Context→suspended、old activationId永久 revoke、mutation gate→committed suspension。success 不表示 Child 已 initialize/active。

Main 必须先完成 call Response，再发送 dependent Child initialize/activate；same-Subsystem recursive call 不要求入站 call handler pending 时处理反向 Request。

## 9. `frame.return` Local Commit

Subsystem 发送 `frame.return` 后进入 mutation gate。若收到成功 `{}`：terminal outcome accepted、old activationId永久 revoke、local Frame Context→closing。

success 不表示 `frame.close` 已完成，也不表示 Caller 已 resumed。Subsystem 等待 Main 后续 `frame.close(frameId)`。

## 10. Incoming Control Operations

### initialize

建立 target-side Frame/Input Context；不依赖 Caller relationship，不代表 active。

合法业务拒绝使用 `FRAME_INITIALIZE_REJECTED`，并携带 `FrameFailure`。该 rejection 表示 Context 未 commit、Runtime 仍 healthy；不得用 `-32602` 表示游戏业务输入不满足条件。

### activate / suspend / resume / close

这些 Main-issued lifecycle operation 在双方 state一致且 Runtime healthy 时应成功。若 Subsystem 因 Frame identity/lifecycle/Activation mismatch 拒绝合法请求，说明 control divergence，Runtime 必须进入 failure path，而不是尝试私有 resync。

`resume` 同时交付 Child Outcome + replacement Activation；`close` 不隐式关闭 Runtime/Data Connection、共享业务状态或 Render。

## 11. Semantic Error / Failure Classification

Recoverable Frame semantic errors：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

前两个由 Main 在 call acceptance 前返回；Subsystem 收到后可解除 mutation gate 并继续当前 active Frame。

Control divergence：

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
```

收到 divergence error、Frozen method/schema protocol error 或 ambiguous timeout 时，Subsystem MUST 停止正常 Frame processing并进入 Runtime failure path。

Runtime 可通过 `subsystem.status(state="failed")` 报告：

```text
FRAME_CONTROL_TIMEOUT
FRAME_CONTROL_DIVERGENCE
FRAME_CONTROL_PROTOCOL_ERROR
```

如果 Control Connection 已丢失，则 Main 直接按 Subsystem Control loss 处理。

## 12. Deadline / No Retry

全部 Frame Request MUST 有 finite deadline。Subsystem SDK 对 `frame.call / frame.return` 不得自动 retry/replay，也不得使用 JSON-RPC id 作为幂等 operation identity。

v1 不定义 operationId/idempotencyKey/dedup journal/replay cache。

一旦 timeout failure 已 commit，迟到 Response 只做 diagnostics，不能恢复 Runtime、Frame 或 Activation。

## 13. Ordinary Input Router

```text
User Input
→ verify Data Connection
→ find frameId
→ require lifecycle == active
→ require activationId == current Activation
→ require not blocked by outbound mutation gate
→ dispatch business Handler
```

revoked/old Activation 永久拒绝。mutation gate timeout 后不得恢复旧输入 dispatch；Runtime 进入 failure path。

## 14. Cancellation Boundary

v1 不支持 caller-driven `frame.cancel`。suspended Caller 无远程取消 Child 的公共能力。

`FrameOutcome.cancelled` 仍合法，但只表示当前 active Frame 自己通过 `frame.return({type:"cancelled"})` 结束。Session termination 使用更高层 shutdown。

## 15. Same-Subsystem / Recursive Call

same-Subsystem call 合法但仍必须 new childFrameId/new Child Activation/normal Main Stack push-pop/Caller old Activation revoke。不得通过本地函数调用绕过 Main。

## 16. Failure Boundary

```text
Pre-commit Explicit Error
    known not committed
    local gate may release

Post-commit failure
    never restore revoked Activation
    never erase accepted outcome

Ambiguous timeout/loss
    commit state unknown
    no retry / no guess
    Runtime failure
```

Runtime failed 后 multi-Frame unwind 由 Batch E 冻结。

## 17. Render / Data Independence

Render create/update/visibility/order/destroy/recovery 完全属于 Subsystem/Render Protocol。Frame lifecycle 不控制 Render/Data Connection/Runtime lifecycle。

## 18. Internal Freedom

Subsystem 可以共享 world state、Execution Loop、Repository cache、Render Manager，也可以为不同 Frame 建立内部 session。平台只要求 Frozen external Contract 正确。

## 19. 第一阶段 `loom.map`

建议内部：

```text
Subsystem Control Adapter
Frame / Call Adapter + Mutation Gate + Deadline Handler
Frame Input Adapter
Runtime Execution Loop / Core
Render Manager / Projector
Repository Cache
```

这些结构不是所有 Subsystem 的公共要求。

## 20. 架构不变量

1. Frame/Stack/Activation/error authority = Main；
2. Subsystem 不维护第二份公共 Caller/Stack authority；
3. Frame/Activation identity 不复用；
4. Batch B exact seven Requests；
5. outbound call/return pending 必须有 mutation gate；
6. Success/Explicit Error/Ambiguous 三种结果不可混淆；
7. ambiguous timeout 不解除 gate继续旧 Activation，不 retry；
8. recoverable initialize rejection 不使 Runtime failed；
9. divergence/protocol error Runtime-fatal；
10. no caller-driven Frame cancellation；
11. post-commit failure不能恢复旧 Activation；
12. Frame lifecycle 不控制 Render/Data Connection/Runtime lifecycle。
