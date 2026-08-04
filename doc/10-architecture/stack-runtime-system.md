# 栈式运行系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：调用栈、Frame 生命周期、Activation、事务提交、错误边界和 ordinary Input Target  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)  
> 下层契约：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. 设计目标

栈式运行系统为 Subsystem 提供单一、可推理的 LIFO call / ordinary User Input 模型。Frame 只属于 Main 控制的调用/输入域，不属于 Runtime lifecycle 或 Render lifecycle。

## 2. Authority

Main 是 Frame identity、Frame→Subsystem、caller relationship、lifecycle、Stack、Activation、ordinary Input eligibility、InputTarget、transaction commit 与 control-error classification 的唯一权威。

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

Activation 是 one-shot ordinary input epoch：never reused / resumed / rolled back。Frame outcome=`completed/cancelled/failed`，与 lifecycle 分离。v1 没有 Frame ready/status。

## 4. Stable Stack

稳定状态：Stack empty，或 Stack Top=active+current Activation，所有 lower live Frames=suspended+no Activation。

事务期间允许 Top starting/closing、zero active Frame、`InputTarget=null`，但禁止两个 active Frames/current Activations/ordinary InputTargets。

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

七个方法全部为 JSON-RPC Request。Caller relationship 不下发；`frame.close` 无 reason；`frame.resume` 同时交付 Child outcome + replacement Activation；`frame.call` 不是 long-running result RPC。

## 6. Mutation Serialization

Main 对单一 Stack 的 commit-sensitive mutation MUST 串行执行。同一 Frame 的 `frame.call / frame.return` pending 时不得开始第二个普通 call/return。

Subsystem 发出 outbound `frame.call / frame.return` 后建立 mutation gate：Response 前停止新的 ordinary input dispatch，并禁止第二个 call/return。该 gate 不是公共 lifecycle state。

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

`frame.activate` ACK happens-before corresponding InputTarget publication。

Batch C 的“Explicit Error = 本次 RPC postcondition 未 commit”只描述 commit evidence；**Batch D 决定该 Error 后 Runtime 是否仍可继续使用**：

- `frame.initialize` 的合法业务拒绝只有 `FRAME_INITIALIZE_REJECTED`，可作为已知 no-commit 的业务失败收敛；
- 合法 `frame.activate` 的 identity/lifecycle/Activation semantic rejection 是 control divergence；标准 JSON-RPC/schema/method error 是 protocol-fatal；timeout/loss 是 ambiguous；这些都进入 Runtime failure path；
- 因此 activate failure 时不得发布 F0/A0，也不得假定可以继续用普通 `frame.close` 做局部 rollback；具体 cleanup / initial failure convergence 由 Batch E 冻结。

## 8. Child Call Acceptance

稳定起点：`F1/A1` 是当前 active Stack Top / InputTarget。

合法 `frame.call(F1,A1,target,input)` 在 Main precondition validation 后原子 commit：

```text
F1 active → suspended
A1 revoke permanently
allocate F2 / caller=F1 / state=starting
push F2
InputTarget = null
```

然后返回 `{childFrameId:F2}`。

`frame.call Success` = logical Child accepted + Caller suspension committed + Child identity committed；不等于 Child active。

ordinary call 不额外发送 `frame.suspend`。Main MUST 完成 call Response 后才依赖 Child `frame.initialize / frame.activate`。

## 9. Child Activation

```text
frame.initialize(F2,input)
→ ACK
→ generate A2
→ frame.activate(F2,A2)
→ ACK
→ commit F2 active + A2
→ publish InputTarget F2/A2
```

Call acceptance 后不得再发布 F1/A1；activate ACK 前不得发布 F2/A2。`InputTarget=null` gap 合法。

失败收敛必须先按 Batch D 分类：

```text
FRAME_INITIALIZE_REJECTED
    → target Runtime healthy
    → Child failed outcome
    → fresh Activation resume surviving Caller

initialize/activate timeout or response ambiguity
    → target Runtime failed
    → Batch E unwind

initialize/activate divergence/protocol error
    → target Runtime failed
    → Batch E unwind
```

无论哪种 post-accept failure，都不得恢复 F1/A1。**“forward recovery”不等于 Main 可以在 Runtime-fatal 情况下自行 close/pop/resume；Runtime 已不可信时必须进入 Batch E 的 deterministic unwind。**

## 10. Return / Resume

合法 `frame.return(F2,A2,result)` 被 Main acceptance-commit：

```text
F2.outcome = result
A2 revoke permanently
F2 → closing
InputTarget = null
```

然后 Main返回 success；return success 不等于 Child closed 或 Caller resumed。

正常 healthy 路径：

```text
frame.close(F2) → ACK
→ F2 closed / pop
→ fresh A3
→ frame.resume(F1,A3,F2,result) → ACK
→ F1 active + A3
→ publish F1/A3
```

close ACK 前不能 pop；resume ACK 前不能发布 A3。Return acceptance 不可 rollback。

如果 close/resume 出现 timeout、divergence 或 protocol-fatal error，不能继续按正常 healthy 路径猜测或 retry；相关 Runtime 进入 failure path，Batch E 决定后续 Stack 收敛，同时 accepted outcome 与 revoked Activation 保持不可逆。

## 11. Pre/Post Commit Failure

```text
Pre-commit failure
    may abort
    old valid Activation may remain valid

Post-commit failure
    never restores committed-revoked state
    but recovery owner depends on Batch D classification
```

具体解释：

- recoverable explicit rejection：可以在仍可信 Runtime 上进行协议定义的 forward compensation；
- timeout/loss/divergence/protocol failure：Runtime 已不可信，不做局部 resync/retry，由 Batch E 执行 Runtime-failure unwind；
- 任何路径都不得恢复 revoked Activation，也不得抹掉 accepted terminal outcome。

## 12. Batch D Request Outcome

每个 Frame Request 必须有 finite deadline，并按三种结果处理：

```text
Success
    known committed

Explicit Error
    known not committed

Timeout / Response loss / pending-request connection loss
    ambiguous applied/not-applied
    → Runtime failure
```

这里 `Explicit Error = known not committed` **不等于“Error 一定可恢复”**。Error 是否允许继续使用 Runtime，必须再经过 Batch D 的 recoverable / divergence / protocol-fatal 分类。

v1 不自动 retry/replay，也不定义 operationId/idempotency journal。timeout 后的迟到 Response 不改变已经 commit 的 Runtime failure。

## 13. Recoverable Error Boundary

普通可恢复拒绝只包括：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

前两个发生在 Call Acceptance Commit 前，因此 Caller 保持 active/current Activation。

`FRAME_INITIALIZE_REJECTED` 表示 target Runtime healthy 且 Frame Context 未 commit；若 Child call 已 acceptance-commit，则把 rejection 的 `FrameFailure` 转为 Child failed outcome，再以 fresh Activation resume Caller。

## 14. Control Divergence Boundary

以下表示 Main 与 Subsystem 的 Frame authority/state 已分叉：

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
```

以及 Frozen method/schema 的 JSON-RPC protocol error。

这些情况不是局部 Stack rollback 条件，而是相关 Runtime terminal failure。Batch E 再决定 Stack suffix 如何 unwind。

## 15. `frame.suspend` / Cancellation

`frame.suspend` 不参与 ordinary caller-initiated call establishment，仅作为 Main 主动 quiesce / terminal preparation 原语。ACK 后 commit active→suspended、old Activation revoke、InputTarget clear。

如果该 RPC 返回 divergence/protocol error 或产生 ambiguous timeout，也不能把“postcondition未 commit”误读成“Runtime仍可信”；Batch D failure classification优先决定是否进入 Runtime failure path。

v1 无 caller-driven `frame.cancel`。`cancelled` outcome 仅表示当前 active Frame 自行 `frame.return({type:"cancelled"})`。

## 16. Renderer Causal Boundary

Main⇄Renderer wire 尚未冻结，但必须遵守：未收到目标 Subsystem activate/resume ACK 不得发布新 Activation；old Activation revoked 后不得再次发布；`InputTarget=null` 合法；MAY coalesce transitional revision，但不能越过 safety barrier。

Frame RPC timeout/divergence 不通过 Renderer resync 修复。

## 17. Same-Subsystem / Recursive Call

same-Subsystem call 与跨 Subsystem call 使用完全相同 transaction：新 childFrameId、新 Activation、正常 push/pop、Caller old Activation revoke。

允许同一 Runtime Container 内 F1 suspended / F2 suspended / F3 active，共享一条 Control Connection，但不得本地函数调用绕过 Main。

## 18. Frame / Render 边界

禁止把 `frame.initialize/activate/suspend/resume/close` 隐式映射成 Render create/show/hide/resync/destroy。Frame lifecycle 同样不控制 Runtime spawn/shutdown 或 Data Connection lifecycle。

## 19. 架构不变量

1. Main 是 Frame/Stack/Activation/InputTarget/error classification 唯一权威；
2. lifecycle 与 outcome 分离；Activation 永不复用/恢复/rollback；
3. Batch B wire surface exactly seven Requests；
4. 单 Stack mutation 串行；
5. ordinary `frame.call` 不依赖 reverse `frame.suspend`；
6. call/return Response 先于 dependent reverse RPC；
7. activate/resume ACK 先于对应 InputTarget publication；
8. post-commit failure 永远不能恢复已 revoke/accepted 的状态，但具体 recovery owner 必须服从 Batch D error classification；
9. Explicit Error=no-commit evidence，不等于 recoverable；
10. ambiguous Frame RPC 不 retry，相关 Runtime failed；
11. control divergence/protocol mismatch Runtime-fatal；
12. Runtime-fatal Frame failure 不做局部 Frame resync/close 假设，交 Batch E unwind；
13. no caller-driven Frame cancellation；
14. same-Subsystem recursion 不依赖 nested request-handler reentrancy；
15. Frame lifecycle 不控制 Render/Runtime/Data Connection。

## 20. 相关文档

- [Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)；
- [程序主系统模块设计](../20-modules/main-system/README.md)；
- [通信系统](./communication-system.md)。
