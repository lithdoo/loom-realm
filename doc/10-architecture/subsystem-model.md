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

结果必须先按两层判断：

```text
Layer 1: commit evidence
    Success        → known committed
    Explicit Error → known not committed
    Timeout/loss   → unknown / ambiguous

Layer 2: Runtime health classification
    recoverable Error → Runtime remains healthy
    divergence/protocol Error → Runtime failed
    ambiguous timeout/loss → Runtime failed
```

只有 **recoverable Explicit Error** 才允许：

```text
release mutation gate
→ keep current active Frame/Activation
→ continue normal Frame processing
```

收到 divergence/protocol-fatal Explicit Error 时，即使对应 Main operation known not committed，也 MUST NOT 把 gate解除回旧业务状态继续运行；Subsystem 必须停止正常 Frame processing并进入 Runtime failure path。

Timeout / Response loss 同样不得解除 gate回旧 Activation。

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

这些 Main-issued lifecycle operation 在双方 state一致且 Runtime healthy 时必须成功。若 Subsystem 因 Frame identity/lifecycle/Activation mismatch 拒绝合法请求，说明 control divergence，Runtime 必须进入 failure path，而不是尝试私有 resync。

`resume` 同时交付 Child Outcome + replacement Activation；`close` 不隐式关闭 Runtime/Data Connection、共享业务状态或 Render。

## 11. Semantic Error / Failure Classification

Recoverable Frame semantic errors：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

前两个由 Main 在 call acceptance 前返回；Subsystem 收到后可解除 mutation gate并继续当前 active Frame。

`FRAME_INITIALIZE_REJECTED` 是 Main→target Subsystem initialize 的业务拒绝；target Runtime保持 healthy。它不是 outbound call/return gate 的通用“恢复信号”。

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

revoked/old Activation 永久拒绝。mutation gate timeout/fatal Error 后不得恢复旧输入 dispatch；Runtime 进入 failure path。

## 14. Cancellation Boundary

v1 不支持 caller-driven `frame.cancel`。suspended Caller 无远程取消 Child 的公共能力。

`FrameOutcome.cancelled` 仍合法，但只表示当前 active Frame 自己通过 `frame.return({type:"cancelled"})` 结束。Session termination 使用更高层 shutdown。

## 15. Same-Subsystem / Recursive Call

same-Subsystem call 合法但仍必须 new childFrameId/new Child Activation/normal Main Stack push-pop/Caller old Activation revoke。不得通过本地函数调用绕过 Main。

如果 same-Subsystem recursive call 所在 Runtime 自身进入 terminal failure，则该 Runtime 内的 Caller/Child Context 都不再是 surviving healthy Caller；不得在 Subsystem 内部自行 resume lower Frame。具体 suffix unwind 由 Main 的 Batch E policy 决定。

## 16. Failure Boundary

```text
Recoverable Explicit Error
    known not committed
    Runtime healthy
    gate may release where operation semantics allow

Fatal Explicit Error
    known not committed
    Runtime untrusted
    no local resync / no gate release to normal processing

Post-commit failure
    never restore revoked Activation
    never erase accepted outcome

Ambiguous timeout/loss
    commit state unknown
    no retry / no guess
    Runtime failure
```

“no-commit”与“Runtime healthy”是两个不同维度，SDK/adapter MUST NOT 合并成一个布尔错误分支。

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
6. Success/Explicit Error/Ambiguous commit evidence不可混淆；
7. Explicit Error=no-commit 不等于 Runtime healthy；
8. 只有 recoverable Error允许 gate 回到 normal processing；
9. ambiguous timeout/fatal Error 不解除 gate继续旧 Activation，不 retry；
10. recoverable initialize rejection 不使 Runtime failed；
11. divergence/protocol error Runtime-fatal；
12. no caller-driven Frame cancellation；
13. post-commit failure不能恢复旧 Activation；
14. same-Subsystem failed Runtime不能在本地自行恢复 lower Frame；
15. Frame lifecycle 不控制 Render/Data Connection/Runtime lifecycle。
