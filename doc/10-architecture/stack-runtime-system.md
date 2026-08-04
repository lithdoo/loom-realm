# 栈式运行系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：调用栈、Frame 生命周期、Activation、事务提交、错误边界、Runtime failure unwind 与 ordinary InputTarget  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)  
> 下层契约：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. 设计目标

栈式运行系统为 Subsystem 提供单一、可推理的 LIFO call / ordinary User Input 模型。Frame 只属于 Main 控制的调用/输入域，不属于 Runtime lifecycle 或 Render lifecycle。

Frame / Call Batch A-E 已 Frozen；Batch F 只负责 limits/fixtures/profile/version completion。

## 2. Authority

Main 是 Frame identity、Frame→Subsystem、caller relationship、lifecycle、Stack、terminal outcome、Activation、ordinary Input eligibility、InputTarget、transaction commit、error classification 与 Runtime-failure unwind 的唯一权威。

Subsystem 维护内部 Frame/Input Context；Renderer 只镜像 Main 已 commit 的 Stack/Activation/InputTarget。

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

Activation 是 one-shot ordinary-input epoch：never reused / resumed / rolled back。Frame outcome=`completed/cancelled/failed`，与 lifecycle 分离。v1 无 Frame ready/status/failed lifecycle。

## 4. Stable Stack

稳定状态：Stack empty，或 Stack Top=active+current Activation，所有 lower live Frames=suspended+no Activation。

正常 transaction / failure recovery期间允许 Top starting/closing、zero active Frame、`InputTarget=null`，但禁止两个 active Frames/current Activations/ordinary InputTargets。

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

七个方法全部为 JSON-RPC Request。无 Caller wire、close reason、`frame.result/frame.cancel/frame.abort/frame.unwind`。

## 6. Mutation Serialization

Main 对单一 Stack 的 commit-sensitive mutation MUST 串行执行。normal call/return 与 Runtime failure unwind 使用同一 serialization domain。

Subsystem outbound `frame.call / frame.return` pending 时建立 mutation gate：Response 前停止新的 ordinary input dispatch，并禁止第二个 call/return。

## 7. Normal Initial / Call / Return

Initial：

```text
allocate starting F0
→ initialize ACK
→ activate(fresh A0) ACK
→ commit active/A0
→ publish InputTarget F0/A0
```

Call：

```text
F1/A1 active
→ Call Acceptance Commit
   F1 suspended / A1 revoked
   Child F2 starting+push
   InputTarget=null
→ frame.call Success
→ Child initialize/activate
→ activate ACK
→ F2 active / publish F2/A2
```

Return：

```text
F2/A2 active
→ Return Acceptance Commit
   outcome terminal
   A2 revoked
   F2 closing
   InputTarget=null
→ frame.return Success
→ close ACK / pop
→ resume Caller(fresh A3) ACK
→ publish F1/A3
```

ordinary call 不发送 reverse `frame.suspend`；call/return Response先于 dependent reverse RPC；activate/resume ACK先于对应 InputTarget publication。

## 8. Batch D Failure Boundary

每个 Request finite deadline：

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous
```

`Explicit Error = no-commit evidence` 不等于 Runtime healthy。Recoverable 只有：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

Divergence/protocol error/ambiguous timeout均 Runtime-fatal；不 retry/replay/resync。

## 9. Runtime Failure Input to Batch E

Batch E 的输入是：

```text
one or more descriptor.key Runtime = terminal failed
```

来源可包括 unexpected exit、Control loss、`status(failed)`、`FRAME_CONTROL_TIMEOUT`、`FRAME_CONTROL_DIVERGENCE`、`FRAME_CONTROL_PROTOCOL_ERROR`。

Batch E 不重新判断 failure 严重性，只处理 Stack convergence。

## 10. Failed Runtime Set / Unwind Root

Main recovery维护：

```text
failedRuntimeKeys
```

并计算：

```text
unwindRoot = live Stack 中最下面/最老的 Frame
             where frame.subsystemKey ∈ failedRuntimeKeys
```

`root..top` 全部属于 affected/doomed suffix。

例如：

```text
F1 A
F2 B   ← B failed, lowest B
F3 C
F4 B
F5 D
```

必须 unwind F2..F5。不能只删 B Frame，也不能从最近的 F4 开始。

该规则直接覆盖 same-Subsystem recursion。

## 11. Failure Unwind Barrier

Main 建立 Failure Unwind Barrier 后：

```text
stop new normal call/return for affected suffix
clear affected ordinary InputTarget
do not publish new affected Activation
do not send normal Frame RPC to failed Runtime
```

Barrier 是 Main-private recovery transaction phase，不是公共 lifecycle。

只承认 Main 已 commit 的 transaction facts：Call/Return Acceptance 是否 commit、已 revoked Activation、已 accepted outcome都按现有 Main state处理，不猜测另一种历史。

## 12. Top→Bottom Cleanup

Affected suffix MUST Top→Bottom cleanup。

### Failed Runtime Frame

不再发送 `activate/suspend/resume/close`。Main直接撤销公共 authority并：

```text
live → closing → closed → remove
```

这里 `closed` 表示不再是 Main live Frame，不表示远端 Context有 ACK；failed Runtime资源由 Supervisor/termination清理。

### Healthy Runtime Frame

尽量保留 Runtime，只清 doomed Frame：

- initialize 明确未 commit：无 remote Context，直接 retire；
- Context 已存在：Main先撤销公共 Activation/InputTarget、commit `closing`，然后发送一次 `frame.close`；
- 已有 close Request pending：使用原 Request结果，不重复发送；
- 不要求 suspend-before-close；Batch A允许 active→closing，额外 suspend只增加 failure surface。

healthy close ACK 后正常确认 Context删除并 pop。

## 13. Cleanup Failure / Fixed-point Expansion

Recovery cleanup仍服从 Batch D。healthy Runtime 的 pending/close/resume 出现 timeout/loss/divergence/protocol error/unexpected failure时：

```text
failedRuntimeKeys += runtimeKey
→ recompute lowest root across whole live Stack
```

如果新 failed Runtime在旧 root下方还有更老 Frame，root必须下移。

例如：

```text
F1 D
F2 A
F3 B   ← initial B failure
F4 C
F5 D
```

先 root=F3；cleanup F5 使 D timeout，则 D failed，而 D 在 F1 还有 Frame，因此新 root=F1，最终整个 Stack unwind。

Recovery重复直到 fixed point。

## 14. Pending RPC at Failure Barrier

目标 Runtime已 failed：late Response diagnostic-only。

目标 Runtime仍 healthy但 Frame已 doomed：既有 Request不重发，按原 deadline只处理一次：

```text
Success
    → 承认局部 postcondition，仅用于 cleanup knowledge

FRAME_INITIALIZE_REJECTED
    → Context absent

divergence/protocol/timeout
    → Runtime failed / expand root
```

如果 activate/resume Success在 barrier后确认远端安装了 Activation，该 Activation已消耗但不得 publish/reuse；Frame仍继续 doomed cleanup。

## 15. Accepted Outcome Preservation

Return Acceptance Commit 之后的：

```text
completed / cancelled / failed
```

永远不能被 Runtime crash/cleanup failure覆盖。

Intermediate doomed Frame的 outcome也保持 immutable，只是不向 doomed Caller逐层 resume。

## 16. Root Outcome

final root已有 accepted outcome：

```text
rootOutcome = existing outcome
```

否则 Main生成：

```text
FrameOutcome.failed.error.code = "SUBSYSTEM_RUNTIME_FAILED"
```

`FRAME_CONTROL_TIMEOUT / DIVERGENCE / PROTOCOL_ERROR`、subsystemKey、PID、exit code留在 diagnostics，不要求进入 Caller-visible failure data。

## 17. Surviving Caller Recovery

完整 suffix cleanup后，root下方若还有 Frame，应为 root direct Caller。

Session intends to continue 且 Caller Runtime仍 ready/healthy/no-shutdown-intent 时：

```text
Anew = fresh Activation
frame.resume(Caller,Anew,returnedFrameId=root,result=rootOutcome)
→ ACK
→ Caller active/Anew
→ publish InputTarget
```

resume ACK happens-before publication；旧 Activation永不恢复。

Resume timeout/divergence/protocol failure使 Caller Runtime也进入 failed set，再次 recompute root。

## 18. Final States

一次 recovery最终只能：

```text
healthy surviving Caller resumed with fresh Activation
```

或：

```text
Stack empty
InputTarget=null
```

不得 permanent half-unwound、two active Frames、two targets、revived Activation。

## 19. Initial / Zero-Frame Failure

final root是 initial Frame：清完整 suffix后 Stack empty，不 resume；root没有 accepted outcome时记录 `SUBSYSTEM_RUNTIME_FAILED` 交高层 Session处理；已 accepted outcome保持原值。

failed Runtime在 Stack无 live Frame：Batch E不修改现有 Stack/InputTarget；required Runtime failure是否结束 Session属于更高层 policy。

## 20. Session Termination Priority

Main 已建立 Session termination/bootstrap-abort 时，不要求为继续游戏而 resume surviving Caller。仍保持 failed Runtime terminal、revoked Activation不恢复、accepted outcome不撤销。

## 21. Renderer / Render Boundary

Recovery期间 Renderer只看 Main最终 committed state，不恢复 cached Activation，不猜 active Frame。`InputTarget=null` 合法。

Frame unwind不控制 Render/Data lifecycle：healthy descendant Frame close不等于 Render destroy；failed Runtime的 Data/Render cleanup属于独立 Runtime/Data/Render层。

## 22. No Recovery Wire / Fail Closed

v1 不新增：

```text
frame.abort
frame.unwind
recovery retry
operation replay
Frame state resync
```

极端 recovery race不能在 finite deadline安全完成时，相关 Runtime进入 failed set并继续 fixed-point unwind。

## 23. 架构不变量

1. Main 是 Frame/Stack/Activation/InputTarget/outcome/recovery唯一权威；
2. lifecycle 与 outcome分离；Activation永不复用/恢复/rollback；
3. exact seven Requests；
4. normal/failure Stack mutation共享串行域；
5. ordinary call不依赖 reverse suspend；
6. call/return Response先于 dependent reverse RPC；
7. activate/resume ACK先于 InputTarget publication；
8. Explicit Error=no-commit evidence，不等于 recoverable；
9. ambiguous/divergence/protocol failure Runtime-fatal且 no retry；
10. unwind root取 lowest failed-runtime Frame；
11. root..top whole suffix Top→Bottom unwind；
12. failed Runtime Frame logical retire可无 close ACK；
13. healthy descendant只 best-effort close；
14. cleanup failure扩展 failed set并重新计算 root；
15. accepted outcome不可覆盖；
16. root无 outcome使用 `SUBSYSTEM_RUNTIME_FAILED`；
17. intermediate doomed Frame不逐层 resume；
18. surviving Caller fresh resume，ACK-before-publish；
19. final state只能 healthy Caller active或 Stack empty；
20. no caller-driven cancel / no recovery abort-unwind wire；
21. Frame lifecycle不控制 Render/Runtime/Data Connection。
