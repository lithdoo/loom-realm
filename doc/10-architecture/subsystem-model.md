# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem 的职责、状态所有权、Frame/Input 适配、outbound mutation gate 与 Render 边界  
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
    Connection authorization

Subsystem Runtime
    authoritative business state
    Frame/Input Context
    outbound call/return mutation gate
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

v1 无 Frame `ready / initialized / frame.status`。

`callerFrameId` 不下发给 `frame.initialize` / `frame.return`。业务如果需要调用来源，必须显式放在业务 `input`，不能依赖 Main-owned Caller relationship 作为隐式业务 API。

## 5. Frozen RPC Surface

```text
Main → Subsystem
    frame.initialize({ frameId, input })
    frame.activate({ frameId, activationId })
    frame.suspend({ frameId, activationId })
    frame.resume({ frameId, activationId, returnedFrameId, result })
    frame.close({ frameId })

Subsystem → Main
    frame.call({ frameId, activationId, targetSubsystemKey, input })
        → { childFrameId }
    frame.return({ frameId, activationId, result })
        → {}
```

全部为 JSON-RPC Request；source identity 来自 authenticated Control Connection；无 `system.call/system.return/frame.result`；close 无 reason；resume=Child outcome+replacement Activation。

## 6. FrameOutcome

```ts
type FrameOutcome =
  | { type: "completed"; value: JsonValue }
  | { type: "cancelled" }
  | { type: "failed"; error: FrameFailure };
```

`completed.value` 必填；无业务返回值=`null`。Outcome 不是 lifecycle；`FrameOutcome.failed` 也不是 JSON-RPC Error。

## 7. Outbound Mutation Gate

Batch C 要求 Subsystem 在发送 outbound `frame.call` 或 `frame.return` 后，直到收到 Response 前对该 Frame 建立内部 mutation gate。

pending 期间 MUST：

```text
停止向业务 Handler 派发新的 ordinary input
禁止第二个 frame.call
禁止第二个 frame.return
```

该 gate 不是公共 Frame lifecycle state。

如果收到 pre-commit Error：解除 gate，Frame 保持 active，旧 current Activation 仍有效。

## 8. `frame.call` Local Commit

ordinary `frame.call` 不使用 reverse `frame.suspend` 建立 Caller suspension。

当 Caller 收到成功 `{childFrameId}`：

```text
Caller local Context → suspended
old activationId → permanently revoked
mutation gate → committed suspension
```

该 success 只表示 logical Child call accepted，不表示 Child 已 initialize/active。

因此 Subsystem MUST NOT 在 call success 后继续使用 Caller old Activation，也不得等待 `frame.suspend` 才把 Caller 视为 suspended。

Main 必须先完成 call Response，再发送 dependent Child initialize/activate；same-Subsystem recursive call 因此不要求入站 call handler pending 时处理反向 Request。

## 9. `frame.return` Local Commit

Subsystem 发送 `frame.return` 后进入 mutation gate。

若收到成功 `{}`：

```text
terminal outcome accepted
old activationId permanently revoked
local Frame Context → closing
```

success 不表示 `frame.close` 已完成，也不表示 Caller 已 resumed。Subsystem 必须等待 Main 后续 `frame.close(frameId)` 清理 Context。

Main 先完成 return Response，之后才依赖 close/resume，因此 same-Subsystem return 也不要求 handler reentrancy。

## 10. Incoming Control Operations

### initialize

建立 target-side Frame/Input Context；不依赖 Caller relationship，不代表 active。

### activate

安装首次 Activation。ACK 后 Main 才可发布对应 InputTarget。

### suspend

不参与 ordinary call establishment。仅作为 Main 主动 quiesce / terminal preparation 原语。成功后 old Activation 永久 revoke。

### resume

一个不可分割的控制操作：同时交付 Child Outcome + 安装 replacement Activation。ACK 后 Main 才可发布 Caller new InputTarget。

### close

删除 Frame/Input Context。只携带 `frameId`，不隐式关闭 Runtime/Data Connection、删除共享业务状态或销毁 Render。

## 11. Ordinary Input Router

```text
User Input
→ verify Data Connection
→ find frameId
→ require lifecycle == active
→ require activationId == current Activation
→ require not blocked by outbound mutation gate
→ validate User Input ordering
→ dispatch business Handler
```

revoked/old Activation 永久拒绝。

Batch C 只冻结 gate 必须停止业务 dispatch；具体 input drop/buffer/reset semantics 由 User Input Protocol 冻结。

## 12. Same-Subsystem / Recursive Call

same-Subsystem call 合法但必须：

```text
new childFrameId
new Child Activation
normal Main Stack push/pop
Caller old Activation revoke
```

允许一个 Runtime 内：

```text
F1 suspended
F2 suspended
F3 active
```

不得通过本地函数调用绕过 `frame.call/frame.return` 和 Main transaction authority。

## 13. Failure Boundary

```text
Pre-commit Error
    local gate releases
    old Activation may remain current

Post-commit failure
    never restore revoked Activation
    never erase accepted outcome
    forward recovery only
```

具体 semantic code/timeout/ambiguous Response-loss 由 Batch D 冻结；Runtime crash multi-Frame unwind 由 Batch E 冻结。

## 14. Render / Data Independence

Render create/update/visibility/order/destroy/recovery 完全属于 Subsystem/Render Protocol。

以下不是平台规则：

```text
Frame active → Render visible
Frame suspended → Render hidden
Frame closed → Render destroyed
Frame create/close → Data Connection create/close
```

## 15. Internal Freedom

Subsystem 可以共享 world state、Execution Loop、Repository cache、Render Manager，也可以为不同 Frame 建立内部 session。平台只要求 Frozen external Contract 正确。

## 16. 第一阶段 `loom.map`

建议内部：

```text
Subsystem Control Adapter
Frame / Call Adapter + Mutation Gate
Frame Input Adapter
Runtime Execution Loop / Core
Render Manager / Projector
Repository Cache
```

这些结构不是所有 Subsystem 的公共要求。

## 17. 架构不变量

1. Frame/Stack/Activation transaction authority = Main；
2. Subsystem 不维护第二份公共 Caller/Stack authority；
3. Frame/Activation identity 不复用；
4. Batch B exact seven Requests；
5. outbound call/return pending 必须有 mutation gate；
6. call success 本地 commit Caller suspended/revoked，不等待 reverse `frame.suspend`；
7. return success 本地 commit Child closing/revoked，不等于 close/resume 完成；
8. activate/resume ACK 后 Main 才可发布新 Activation；
9. post-commit failure不能恢复旧 Activation；
10. same-Subsystem recursion 不依赖 nested handler reentrancy；
11. Frame lifecycle 不控制 Render/Data Connection/Runtime lifecycle。
