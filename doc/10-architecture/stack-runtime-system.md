# 栈式运行系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：调用栈、Frame 生命周期、Activation、事务提交、错误边界、Runtime failure unwind 与 ordinary InputTarget  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)  
> 下层契约：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-05

## 1. 设计目标

栈式运行系统为 Subsystem 提供单一、可推理的 LIFO call / ordinary User Input 模型。Frame 只属于 Main 控制的调用/输入域，不属于 Runtime lifecycle 或 Render lifecycle。

Frame / Call Protocol v1 已整体 Active / Normative / Frozen。A-F 只保留为设计溯源，不是独立兼容等级。

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

七个方法全部为 JSON-RPC Request。无 Caller wire、close reason、`frame.result/frame.cancel/frame.abort/frame.unwind/frame.version/frame.capabilities`。

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

## 8. Failure Boundary

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

## 9. Runtime Failure Input

Failure unwind输入是 one or more `descriptor.key` Runtime terminal failed。来源可包括 unexpected exit、Control loss、`status(failed)`、`FRAME_CONTROL_TIMEOUT`、`FRAME_CONTROL_DIVERGENCE`、`FRAME_CONTROL_PROTOCOL_ERROR`。

Recovery不重新判断 failure严重性，只处理 Stack convergence。

## 10. Failed Runtime Set / Unwind Root

Main recovery维护 `failedRuntimeKeys`，并计算：

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

## 11. Failure Unwind Barrier

Main 建立 barrier 后：

```text
stop new normal call/return for affected suffix
clear affected ordinary InputTarget
do not publish new affected Activation
do not send normal Frame RPC to failed Runtime
```

Barrier 是 Main-private recovery phase，不是公共 lifecycle。只承认 Main已 commit transaction facts。

## 12. Top→Bottom Cleanup

Affected suffix MUST Top→Bottom cleanup。

### Failed Runtime Frame

不再发送 `activate/suspend/resume/close`。Main直接撤销公共 authority并：

```text
live → closing → closed → remove
```

`closed` 表示不再是 Main live Frame，不表示远端 Context有 ACK；failed Runtime资源由 Supervisor/termination清理。

### Healthy Runtime Frame

尽量保留 Runtime，只清 doomed Frame：

- initialize明确未 commit：无 remote Context，直接 retire；
- Context存在：Main先撤销公共 Activation/InputTarget、commit `closing`，然后发送一次 `frame.close`；
- 已有 close pending：使用原 Request结果，不重复发送；
- 不要求 suspend-before-close。

healthy close ACK 后正常确认 Context删除并 pop。

## 13. Cleanup Failure / Fixed-point Expansion

Healthy cleanup或 recovery resume若 timeout/loss/divergence/protocol error/unexpected failure：

```text
failedRuntimeKeys += runtimeKey
→ recompute lowest root across whole live Stack
```

新 failed Runtime若在旧 root下方还有 Frame，root必须下移。Recovery重复直到 fixed point。

## 14. Pending RPC at Failure Barrier

目标 Runtime已 failed：late Response diagnostic-only。

目标 Runtime仍 healthy但 Frame已 doomed：既有 Request不重发，按原 deadline只处理一次。Success只用于 cleanup knowledge；`FRAME_INITIALIZE_REJECTED`表示 Context absent；fatal/ambiguous使 Runtime failed。

Barrier后到达的 activate/resume Success只证明远端曾安装 Activation；该 Activation已消耗但不得 publish/reuse。

## 15. Accepted Outcome / Root Outcome

Return Acceptance后的 `completed/cancelled/failed` 永远不能被 Runtime crash/cleanup failure覆盖。

Final root：已有 outcome就保留；否则生成：

```text
FrameOutcome.failed.error.code = "SUBSYSTEM_RUNTIME_FAILED"
```

Runtime diagnostic细节不要求进入 Caller-visible failure data。

## 16. Surviving Caller Recovery

完整 suffix cleanup后，root下方 direct Caller若 Runtime healthy且 Session继续：

```text
Anew = fresh Activation
frame.resume(Caller,Anew,returnedFrameId=root,result=rootOutcome)
→ ACK
→ Caller active/Anew
→ publish InputTarget
```

resume ACK happens-before publication。Resume failure使 Caller Runtime加入 failed set并重新计算 root。

Final state只允许 healthy Caller active 或 Stack empty/InputTarget=null。

## 17. Frame v1 Interop Profile

栈语义现在还受完整 v1 profile约束：

```text
no JSON-RPC Batch
Request ID positive safe integer / sender Connection lifetime no reuse
plain JSON values only
max message 1 MiB
max JSON depth 64
max business JsonValue 512 KiB
frameId / activationId <=128 UTF-8 bytes
targetSubsystemKey <=256 UTF-8 bytes
seven Frame deadlines 1s..5min sender-local monotonic
```

这些限制不改变 Stack state machine，但保证 Desktop/PWA实现对同一 Stack trace有相同可接受 wire集合。

## 18. Transport / Version Boundary

Desktop one complete WebSocket text message=one JSON-RPC application message；PWA Control Port建立后 one plain JSON `postMessage` object=one application message。PWA Structured Clone不得扩大 Frame value model。

Frame v1无 `frame.hello/version/capabilities`；`subsystem.hello.protocolVersions`仍只协商 Subsystem Control。Frame version由 deployment profile静态绑定。

## 19. Initial / Zero-Frame / Session Policy

Final root是 initial Frame：清 suffix后 Stack empty，不 resume；无 accepted outcome时记录 `SUBSYSTEM_RUNTIME_FAILED` 供 Session层处理。

Failed Runtime无 live Frame：Frame Stack不自动变化。Session termination/bootstrap-abort已占优时不要求为继续游戏而 resume Caller。

## 20. Renderer / Render Boundary

Recovery期间 Renderer只看 Main committed state，不恢复 cached Activation。Frame unwind不控制 Render/Data lifecycle。

## 21. 架构不变量

1. Main 是 Frame/Stack/Activation/InputTarget/outcome/recovery唯一权威；
2. lifecycle/outcome分离；Activation永不复用/恢复；
3. exact seven Requests；
4. normal/failure Stack mutation共享串行域；
5. ordinary call不依赖 reverse suspend；
6. Response-before-dependent-RPC；ACK-before-publication；
7. ambiguous/divergence/protocol failure Runtime-fatal且 no retry；
8. lowest failed-runtime Frame决定 whole suffix；
9. failed Runtime Frame logical retire；healthy descendant best-effort close；
10. cleanup failure扩展 failed set/root；
11. accepted outcome不可覆盖；root无 outcome=`SUBSYSTEM_RUNTIME_FAILED`；
12. intermediate doomed Frame不逐层 resume；
13. surviving Caller fresh resume；
14. Frame v1 JSON/ID/limit/deadline/transport profile Frozen；
15. no Frame handshake/downgrade/partial compatibility；
16. Frame lifecycle不控制 Render/Runtime/Data Connection。
