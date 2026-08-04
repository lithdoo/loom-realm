# 栈式运行系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：调用栈、Frame 生命周期、Activation、事务提交和 ordinary Input Target  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)  
> 下层契约：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. 设计目标

栈式运行系统为 Subsystem 提供单一、可推理的 LIFO call / ordinary User Input 模型。Frame 只属于 Main 控制的调用/输入域，不属于 Runtime lifecycle 或 Render lifecycle。

## 2. Authority

Main 是 Frame identity、Frame→Subsystem、caller relationship、lifecycle、Stack、Activation、ordinary Input eligibility 与 InputTarget 的唯一权威。

Subsystem 维护内部 Frame/Input Context；Renderer 只镜像 Main 当前已 commit 的 Stack/Activation/InputTarget。

## 3. Frame / Activation

```text
frameId
    Main-generated / Session unique / never reused

subsystemKey
    permanent descriptor.key assignment

callerFrameId
    Main-owned / immutable

lifecycle
    starting / active / suspended / closing / closed

currentActivationId
    non-null only when active
```

Activation 是 one-shot ordinary input epoch：never reused / resumed / rolled back。

Frame outcome = `completed / cancelled / failed`，与 lifecycle 分离。

v1 没有 Frame `ready / initialized / frame.status`。

## 4. Stable Stack

稳定状态：

```text
Stack empty
OR
Stack Top = active + current Activation
all lower live Frames = suspended + no Activation
```

事务期间允许：

```text
Top starting
Top closing
zero active Frame
InputTarget = null
```

但禁止两个 active Frames / current Activations / ordinary InputTargets。

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

七个方法全部为 JSON-RPC Request。Caller relationship 不下发；`frame.close` 无 reason；`frame.resume` 同时交付 Child outcome + replacement Activation；`frame.call` 不是 long-running result RPC。

## 6. Mutation Serialization

Main 对单一 Stack 的 commit-sensitive mutation MUST 串行执行。同一 Frame 的 `frame.call / frame.return` transaction pending 时不得开始第二个普通 call/return。

Subsystem 在发出 outbound `frame.call / frame.return` 后必须建立内部 mutation gate：在 Response 前停止新的 ordinary input dispatch，并禁止第二个 call/return。该 gate 不是公共 lifecycle state。

## 7. Initial Frame

```text
allocate F0 / starting / Stack=[F0] / no target
→ frame.initialize(F0)
→ ACK
→ generate A0
→ frame.activate(F0,A0)
→ ACK
→ commit F0 active + A0
→ publish InputTarget F0/A0
```

冻结：

```text
frame.activate ACK
    happens-before
corresponding InputTarget publication
```

initialize Error 可直接 abort；initialize ACK 后 activate Error 必须 close 已存在的 F0 Context，不得发布 F0/A0。

## 8. Child Call Acceptance

稳定起点：`F1/A1` 是当前 active Stack Top / InputTarget。

Main 对 `frame.call(F1,A1,target,input)` 完成 precondition validation 后原子 commit：

```text
F1 active → suspended
A1 revoke permanently
allocate F2 / caller=F1 / state=starting
push F2
InputTarget = null
```

之后返回 `{ childFrameId:F2 }`。

因此：

```text
frame.call Success
=
logical Child call accepted
+ Caller suspension committed
+ Child identity committed

frame.call Success ≠ Child active
```

ordinary call **不额外发送 `frame.suspend`**。Caller Subsystem 通过 `frame.call` Success 将本地 Caller Context commit 为 suspended，并永久丢弃 A1。

Main MUST 完成 `frame.call` Response 后才依赖 Child `frame.initialize / frame.activate`，避免 same-Subsystem recursive call 需要 nested request-handler reentrancy。

## 9. Child Activation

Call Response 完成后：

```text
frame.initialize(F2,input)
→ ACK
→ generate A2
→ frame.activate(F2,A2)
→ ACK
→ commit F2 active + A2
→ publish InputTarget F2/A2
```

Call acceptance 之后不得再发布 F1/A1；Child activate ACK 前不得发布 F2/A2。`InputTarget=null` gap 合法。

如果 Child initialize/activate 在 call success 后失败，F1/A1 不可恢复。Main 必须把 F2 以平台 failed outcome forward-resolve，并用 fresh Activation `frame.resume` F1。

## 10. `frame.suspend`

`frame.suspend` 不参与 ordinary caller-initiated call establishment。

它保留为 Main 主动 quiesce / terminal preparation 原语。ACK 后 Main 才可 commit active→suspended、old Activation revoke、InputTarget clear。

任何后续重新 active 都必须获得新 Activation；不得恢复被 suspend/revoke 的旧 Activation。

## 11. Return Acceptance

稳定起点：`F2/A2` 为 active Stack Top。

合法 `frame.return(F2,A2,result)` 被 Main 接受时原子 commit：

```text
F2.outcome = result
A2 revoke permanently
F2 → closing
InputTarget = null
```

然后 Main 返回 success。

```text
frame.return Success
=
terminal outcome accepted
+ old Activation revoked
+ cleanup begun

frame.return Success ≠ Child closed
frame.return Success ≠ Caller resumed
```

Return acceptance 不可 rollback。

Main MUST 完成 `frame.return` Response 后才依赖 `frame.close / frame.resume`。

## 12. Close / Pop / Resume

```text
frame.close(F2)
→ ACK
→ commit F2 closed
→ pop F2
```

只有 close ACK 后 F2 才能从 live Stack 移除。

若存在 Caller F1：

```text
generate fresh A3
→ frame.resume(F1,A3,returnedFrameId=F2,result)
→ ACK
→ commit F1 active + A3
→ publish InputTarget F1/A3
```

冻结：

```text
frame.resume ACK
    happens-before
corresponding Caller InputTarget publication
```

不得再调用 `frame.activate(F1,A3)`。

如果返回的是 initial Frame，close/pop 后 Stack empty / InputTarget null；Session completion policy 属于更高层。

## 13. Failure Boundary

```text
Pre-commit failure
    may abort
    old valid Activation may remain valid

Post-commit failure
    forward recovery only
    never restore revoked Activation
    never erase accepted terminal outcome
```

Runtime crash / ambiguous transport / retry policy分别由 Batch D/E 冻结。

## 14. Renderer Causal Boundary

Main⇄Renderer wire 尚未冻结，但必须遵守：

- 未收到目标 Subsystem activate/resume ACK，不得发布该 Activation；
- old Activation commit revoked 后不得再次发布为 current；
- intermediate `InputTarget=null` 合法；
- MAY coalesce transitional Stack revisions，但不能越过 causal safety barrier。

Renderer 不根据 Render focus/z-order 自行改变 InputTarget。

## 15. Same-Subsystem / Recursive Call

same-Subsystem call 与跨 Subsystem call 使用完全相同 transaction：新 `childFrameId`、新 Activation、正常 push/pop、Caller old Activation revoke。

允许同一 Runtime Container 内：

```text
F1 suspended
F2 suspended
F3 active
```

共享一条 Control Connection，但不得本地函数调用绕过 Main。

## 16. Frame / Render 边界

以下全部禁止作为平台隐式规则：

```text
frame.initialize → create Render
frame.activate   → show Render
frame.suspend    → hide/freeze Render
frame.resume     → Render resync
frame.close      → destroy Render
```

Frame lifecycle 同样不控制 Runtime spawn/shutdown 或 System Data Connection lifecycle。

## 17. 架构不变量

1. Main 是 Frame/Stack/Activation/InputTarget 唯一权威；
2. lifecycle=`starting/active/suspended/closing/closed`，outcome 与 lifecycle 分离；
3. Activation 永不复用/恢复/rollback；
4. Batch B wire surface exactly seven Requests；
5. 单 Stack mutation 串行；
6. ordinary `frame.call` 不依赖反向 `frame.suspend`；
7. `frame.call` Success 先于 dependent Child initialize/activate；
8. `frame.return` Success 先于 dependent close/resume；
9. activate/resume ACK 先于对应 InputTarget publication；
10. post-commit failure 只能 forward recovery；
11. same-Subsystem recursive call 不依赖 nested request-handler reentrancy；
12. Frame lifecycle 不控制 Render/Runtime/Data Connection。

## 18. 相关文档

- [Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)；
- [程序主系统模块设计](../20-modules/main-system/README.md)；
- [通信系统](./communication-system.md)。
