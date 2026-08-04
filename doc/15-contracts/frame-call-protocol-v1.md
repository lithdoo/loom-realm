# Main ⇄ Subsystem Frame / Call Protocol v1

> 层级：正式契约  
> 状态：Draft；Batch A / B / C / D / E 已 Normative / Frozen  
> 协议版本：1（目标版本）  
> 稳定程度：Batch A-E Frozen；Batch F Evolving  
> 主要定义：已 ready Runtime Container 中 Frame/Input Context 的身份、生命周期、Activation、RPC wire surface、调用事务、错误/超时、Runtime failure unwind 与公开提交屏障  
> 依赖：[栈式运行系统](../10-architecture/stack-runtime-system.md)、[模块子系统模型](../10-architecture/subsystem-model.md)、[Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)  
> 决策记录：[ADR 0010：Batch A](../decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)、[ADR 0011：Batch B](../decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)、[ADR 0012：Batch C](../decisions/0012-freeze-frame-call-protocol-v1-batch-c.md)、[ADR 0013：Batch D](../decisions/0013-freeze-frame-call-protocol-v1-batch-d.md)、[ADR 0014：Batch E](../decisions/0014-freeze-frame-call-protocol-v1-batch-e.md)  
> 最近复核：2026-08-04

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

```text
Batch A  Identity / Authority / Lifecycle / Activation       ← Frozen
Batch B  RPC Wire Schema / Direction / Local Semantics        ← Frozen
Batch C  Transaction / Commit Barrier / Rollback              ← Frozen
Batch D  Error / timeout / retry / cancellation               ← Frozen
Batch E  Runtime failure unwind                                ← Frozen
Batch F  Limits / fixtures / profile/version completion       ← Draft / Next
```

只有 Batch F 尚未完成。后续工作 MUST NOT 静默修改 Batch A-E 已 Frozen 的 identity、wire、transaction、error 或 failure-unwind 语义。

Runtime Bootstrap、Subsystem identity、Runtime ready / shutdown / stopped / failed 由独立 [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md) 定义。Frame / Call 不定义 Render lifecycle、Renderer Data Connection lifecycle 或 User Input payload schema。

---

# Part I · Batch A — Normative / Frozen

## 1. Scope 与 Authority

Frame 是 Main-owned call / ordinary User Input control object。

Main 是以下公共状态的唯一权威：

```text
frameId
Frame → descriptor.key assignment
callerFrameId
Frame lifecycle
Frame Stack
terminal Frame outcome
current activationId
ordinary Input eligibility
current InputTarget
```

Subsystem 维护自身 Frame/Input Context，并按 Main 签发的 Activation 校验 ordinary User Input；Subsystem MUST NOT 自行创建公共 `frameId`、修改 Stack / Caller / Frame→Subsystem assignment、签发 `activationId` 或改变公共 InputTarget。

Renderer 只持有 Main 已 commit 状态的只读镜像。

建立任何 Frame 前，目标 Runtime MUST 已 `ready` 且没有 Main-owned shutdown intent。Frame / Call MUST NOT 启动、restart 或等待 Runtime Bootstrap。

## 2. Frame Identity

`frameId` MUST：

```text
Main-generated
Session-scoped unique
opaque
immutable
never reused within the Session
```

每个 Frame 创建时永久绑定 exactly one 已声明 `descriptor.key`，生命周期内不得 migrate。

`callerFrameId` 在创建时确定并 immutable：

```text
initial Frame  → null
called Frame   → direct caller frameId
```

PID、Worker identity、Connection ID、Render identity 或 Legacy `systemId` MUST NOT 代替 Frame identity。

## 3. Frame Lifecycle

公共 lifecycle state 只有：

```ts
type FrameLifecycleState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";
```

不得增加 `initialized / ready / failed / cancelled / completed` 作为 Frame lifecycle state。

```text
starting
    Frame identity 已分配，正在建立本地 Context 或等待首次 Activation commit

active
    当前 Stack Top；exactly one current Activation；可成为 ordinary InputTarget

suspended
    仍 live / 在 Stack 中；无有效 Activation；不可作为 ordinary call/return/input authority

closing
    terminal cleanup 已开始；无有效 Activation；不可普通 call/return/input

closed
    terminal；不再 live；frameId 永不复用
```

正常转换：

```text
starting → active ↔ suspended → closing → closed
active → closing
starting → closing
suspended → closing
```

稳定状态：Stack empty，或 exactly one active Frame 且为 Stack Top，所有 lower live Frames 为 suspended。事务与 failure recovery 期间 MAY 暂时 zero active Frame，但 MUST NOT 有两个 ordinary InputTargets。

## 4. No Frame Ready

v1 不定义：

```text
Frame ready
Frame initialized
frame.ready
frame.status
```

`frame.initialize` 成功只表示目标 Frame/Input Context 已建立，可继续首次 Activation control。

## 5. Activation

Activation 表示 Frame 的一次 ordinary User Input 有效 epoch。

`activationId` MUST：

```text
Main-generated
Session-scoped unique
opaque
immutable
never reused
```

```text
starting    currentActivationId = null
active      currentActivationId = exactly one valid activationId
suspended   currentActivationId = null
closing     currentActivationId = null
closed      currentActivationId = null
```

Main MUST 在首次 active 以及每次 suspended Frame 重新获得控制权时生成全新 Activation。

```text
Activation never rolls back.
Activation never resumes.
Revoked Activation never becomes valid again.
```

ordinary User Input 合法至少要求：

```text
Frame exists
AND lifecycle == active
AND provided activationId == currentActivationId
AND Frame == Main-authorized InputTarget
```

## 6. Outcome 与 Lifecycle 分离

Frame outcome：

```text
completed
cancelled
failed
```

Outcome 描述一次调用如何结束；lifecycle 描述 Frame control object 是否仍 live。即使 outcome=`failed`，Frame 仍通过 `closing → closed` 收敛，不存在公共 lifecycle=`failed`。

## 7. Runtime / Render / Data Independence

以下不是公共协议推导：

```text
Frame active    → Render visible
Frame suspend   → Render hidden/frozen
Frame close     → Render destroyed
Frame create    → Data Connection create
Frame close     → Data Connection close
```

Frame lifecycle MUST NOT 启动、停止或 restart Runtime，也不能替代 `subsystem.shutdown`。

---

# Part II · Batch B — Normative / Frozen

## 8. Wire Surface

Frame / Call v1 运行在已通过 `subsystem.hello` 认证的 Main ⇄ Subsystem Control Connection 上，使用 JSON-RPC 2.0。

完整方法集合只有七个 JSON-RPC Request：

```text
Main → Subsystem
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close

Subsystem → Main
    frame.call
    frame.return
```

`params` MUST 是 JSON Object。

v1 不定义：

```text
system.call
system.return
frame.ready
frame.status
frame.result
frame.cancel
frame.abort
frame.unwind
frame.ping
frame.render.*
```

## 9. `JsonValue` 与 Closed Schema

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
```

不得传输 `undefined`、NaN / Infinity、Function、BigInt、Host handle/object 等非 JSON value。

RPC params、success result、`FrameOutcome`、`FrameFailure` 与 Frozen semantic error data 均为 closed schema，概念上 `additionalProperties=false`。结构错误使用 JSON-RPC `-32602 Invalid params`。

v1 不提供开放式 `metadata / context / extensions / extra` bag。

## 10. FrameOutcome Wire Schema

```ts
type FrameOutcome =
  | {
      readonly type: "completed";
      readonly value: JsonValue;
    }
  | {
      readonly type: "cancelled";
    }
  | {
      readonly type: "failed";
      readonly error: FrameFailure;
    };

interface FrameFailure {
  readonly code: string;
  readonly message?: string;
  readonly data?: JsonValue;
}
```

`completed.value` REQUIRED；无业务返回值显式使用 `null`。

`FrameOutcome.failed` 是 terminal business/call outcome，不是 JSON-RPC Error。

## 11. `frame.initialize`

```ts
interface FrameInitializeParams {
  readonly frameId: string;
  readonly input: JsonValue;
}
interface FrameInitializeResult {}
```

成功表示目标 Subsystem 已建立 Frame/Input Context；Main 公共 lifecycle 仍为 `starting`，没有 Activation/InputTarget。

MUST NOT 携带 `callerFrameId`；Caller relationship 只由 Main Registry 权威维护。

## 12. `frame.activate`

```ts
interface FrameActivateParams {
  readonly frameId: string;
  readonly activationId: string;
}
interface FrameActivateResult {}
```

只用于首次 `starting → active`。`activationId` 必须是 Main 新生成值。恢复 suspended Frame必须使用 `frame.resume`。

## 13. `frame.suspend`

```ts
interface FrameSuspendParams {
  readonly frameId: string;
  readonly activationId: string;
}
interface FrameSuspendResult {}
```

成功 postcondition：目标 Subsystem 已永久 reject/revoke 当前 `(frameId, activationId)` ordinary-input epoch。

ordinary caller-initiated `frame.call` 不使用 `frame.suspend` 建立 Caller suspension。该 RPC 只保留为 Main 主动 quiesce/控制原语，不是 failure-unwind 的必需步骤。

## 14. `frame.resume`

```ts
interface FrameResumeParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly returnedFrameId: string;
  readonly result: FrameOutcome;
}
interface FrameResumeResult {}
```

`activationId` 是 replacement Activation。Subsystem MUST 把“交付 Child Outcome + 安装 replacement Activation”作为一个不可分割的局部操作。

## 15. `frame.close`

```ts
interface FrameCloseParams {
  readonly frameId: string;
}
interface FrameCloseResult {}
```

成功表示目标 Frame/Input Context 已删除，未来普通输入被拒绝。v1 不携带 `reason / outcome / callerFrameId / activationId / subsystemKey`。

`frame.close` 不隐式停止 Runtime、销毁 Render、关闭 Data Connection 或删除共享业务状态。

## 16. `frame.call`

```ts
interface FrameCallParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly targetSubsystemKey: string;
  readonly input: JsonValue;
}
interface FrameCallResult {
  readonly childFrameId: string;
}
```

Main 验证 authenticated source owns Caller、Frame 是 active Stack Top、Activation current、目标 Subsystem 已声明且 Runtime ready/no-shutdown-intent。

same-Subsystem / recursive call 合法，但必须建立新的 `childFrameId`。

`frame.call` 只建立 Child call，不等待 Child 最终业务结果。

## 17. `frame.return`

```ts
interface FrameReturnParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly result: FrameOutcome;
}
interface FrameReturnResult {}
```

Main 验证 source ownership、active Stack Top、current Activation。`frame.return` 不携带 Caller/target identity；Receiver 由 Main-owned caller relationship 决定。

## 18. Result Delivery

Child 最终结果只沿：

```text
Child
    frame.return(result)
        ↓
Main
        ↓
Caller
    frame.resume(returnedFrameId, result, replacement activationId)
```

无独立 `frame.result`，也不得拆成 `frame.resume(result) → frame.activate(newActivation)`。

---

# Part III · Batch C — Normative / Frozen

## 19. Batch C Scope

Batch C 冻结 Initial / Child Call / Return-Resume transaction、Stack mutation serialization、acceptance/commit point、Activation/InputTarget causal barrier、pre/post-commit rollback boundary 与 same-Subsystem recursion ordering。

Batch D/E 对失败类型与 Runtime-failure recovery 进行补充，但 MUST NOT 改变 Batch C 已 commit 事实。

## 20. Stack Mutation Serialization

Main MUST 对单一 Frame Stack 的 commit-sensitive mutation 串行执行。同一时刻最多一个 Stack Mutation Transaction 可以修改：

```text
Frame lifecycle
Stack membership/order
current Activation
InputTarget
terminal Frame outcome
```

Failure unwind 与正常 transaction 共享同一个 serialization authority。

## 21. RPC Commit Evidence

正常 JSON-RPC Success Response = 该 RPC 的局部 postcondition 已知 commit。

正常 JSON-RPC Error Response = 该 RPC 的局部 postcondition 已知未 commit：

```text
initialize Error → no committed target Frame Context
activate Error   → new Activation not installed
suspend Error    → requested revoke not committed
resume Error     → outcome delivery + replacement Activation not committed
close Error      → target Frame Context not confirmed deleted
```

`Explicit Error = no-commit evidence` 不等于 Runtime 一定 healthy；Batch D 再分类 recoverable / divergence / protocol-fatal。

Timeout/loss 导致 applied/not-applied unknown 时属于 ambiguous，按 Batch D Runtime failure处理。

## 22. Sender Mutation Gate

Subsystem 发出 `frame.call` / `frame.return` 后直到 Response 前 MUST 建立内部 mutation gate：停止新的 ordinary input dispatch，禁止第二个 call/return。

只有明确 recoverable pre-commit Error 才允许解除 gate 并继续当前 Activation。Success commit 对应 suspended/closing 本地状态；fatal Explicit Error 或 ambiguous result 进入 Runtime failure，不得释放回旧 Activation。

## 23. No Nested Reverse Request Requirement

v1 MUST NOT 依赖：

```text
Subsystem → Main Request pending
while Main → same Subsystem Request and waits Response
```

Main MUST：

```text
complete frame.call Response
    before dependent Child initialize/activate

complete frame.return Response
    before dependent close/resume
```

same-Subsystem recursive call 不要求 transport-level nested request-handler reentrancy。

## 24. Initial Frame Establishment

```text
allocate F0
F0.state = starting
F0.callerFrameId = null
Stack = [F0]
InputTarget = null

frame.initialize(F0,input)
→ ACK

A0 = fresh activationId
frame.activate(F0,A0)
→ ACK

Main commit:
F0.state = active
F0.currentActivationId = A0
InputTarget = F0/A0
```

冻结：

```text
frame.activate ACK
    happens-before
corresponding InputTarget publication
```

Failure clarification：

- `FRAME_INITIALIZE_REJECTED`：无 remote Context commit，Runtime healthy；Main 可 retire F0，higher-level Session/bootstrap处理 business failure；
- initialize/activate timeout、divergence、protocol error：相关 Runtime terminal failed，MUST NOT假设还能通过普通 `frame.close` 局部修复，进入 Batch E；
- 任意失败路径都不得发布未 ACK 的 F0 Activation/InputTarget。

## 25. Call Acceptance Commit

稳定起点：F1/A1 是 active Stack Top/InputTarget。

合法 `frame.call(F1,A1,target,input)` precondition通过后，Main 原子 commit：

```text
revoke F1/A1
F1.state = suspended
F1.currentActivationId = null

allocate F2
F2.subsystemKey = target
F2.callerFrameId = F1
F2.state = starting
push F2

InputTarget = null
```

然后返回：

```text
{ childFrameId: F2 }
```

`frame.call Success` 表示 logical Child accepted + Caller suspension/identity committed，不表示 Child initialized/active/InputTarget published。

ordinary call 不发送 reverse `frame.suspend`。

## 26. Child Establishment

Main 完成 `frame.call` Success Response 后：

```text
frame.initialize(F2,input)
→ ACK

A2 = fresh activationId
frame.activate(F2,A2)
→ ACK

Main commit:
F2.state = active
F2.currentActivationId = A2
InputTarget = F2/A2
```

冻结：

```text
frame.activate(F2,A2) ACK
    happens-before
F2/A2 InputTarget publication
```

Call acceptance 后不得重新发布 F1/A1；Child activation ACK 前 `InputTarget=null` 合法。

Post-accept failure 必须按 Batch D/E 分类：

```text
FRAME_INITIALIZE_REJECTED
    → target Runtime healthy
    → Child failed outcome
    → fresh-resume surviving Caller

initialize/activate timeout/divergence/protocol error
    → target Runtime failed
    → Batch E deterministic unwind
```

所有路径都不得恢复 F1/A1。

## 27. `frame.suspend` Transaction Role

Main 主动 suspend：

```text
frame.suspend(F,A)
→ ACK
→ commit F active→suspended
→ revoke A
→ InputTarget=null
```

如果 Error/failure被 Batch D 分类 Runtime-fatal，则不得把“postcondition未 commit”误解为 Runtime仍可信；进入 Batch E。

## 28. Return Acceptance Commit

稳定起点：F2/A2 是 active Stack Top/InputTarget。

合法 `frame.return(F2,A2,result)` 被 Main 原子 acceptance-commit：

```text
F2.outcome = result
revoke A2
F2.currentActivationId = null
F2.state = closing
InputTarget = null
```

然后 Main返回 `{}`。

`frame.return Success` 表示 terminal outcome accepted + Activation revoked + cleanup begun；不表示 F2 closed/popped 或 Caller resumed。

Accepted outcome 永远不可撤销。

## 29. Normal Close / Resume

Runtime healthy 时：

```text
frame.close(F2)
→ ACK
→ F2 closed / pop

A3 = fresh activationId
frame.resume(F1,A3,F2,F2.outcome)
→ ACK
→ F1 active / A3
→ publish InputTarget F1/A3
```

冻结：

```text
close ACK   happens-before normal live-Stack removal
resume ACK  happens-before replacement InputTarget publication
```

如果 close/resume 发生 timeout/divergence/protocol-fatal，不继续 normal healthy path，而进入 Batch E。Return Acceptance 已保存的 outcome 与 revoked Activation保持不可逆。

## 30. Initial Frame Return

Initial Frame `callerFrameId=null` 正常 return：

```text
Return Acceptance
→ close ACK
→ closed/pop
→ Stack empty
→ InputTarget=null
```

Initial outcome 如何映射 Session completion/Game exit/Host navigation 不属于 Frame / Call。

## 31. Transaction Failure Principle

```text
Pre-commit recoverable failure
    → abort allowed

Post-commit
    → committed facts never roll back

Runtime-fatal failure
    → no local resync/retry
    → Batch E unwind
```

`forward recovery` 不表示在不可信 Runtime 上继续普通 close/resume；具体 recovery owner由 Batch D/E 决定。

## 32. Publication Barrier

Main⇄Renderer wire 尚未冻结，但 MUST：

1. 不发布尚未被目标 Subsystem ACK 的 Activation；
2. revoked Activation 后续 revision 不得重新 current；
3. `InputTarget=null` transitional state 合法；
4. 不得有两个 ordinary InputTargets；
5. MAY coalesce intermediate revisions，但不得越过 causal barrier。

## 33. Same-Subsystem / Recursive Call

same-Subsystem 与跨 Subsystem使用同一 transaction；仍需 new childFrameId/new Activation/normal Main Stack。禁止本地函数调用绕过 Main。

允许：

```text
Subsystem A / F1 suspended
Subsystem A / F2 suspended
Subsystem A / F3 active
```

共享 Runtime/Control Connection。

## 34. Batch C Frozen Invariants

1. 单一 Stack mutation 串行；
2. call/return pending 有 mutation gate；
3. Success 是 commit evidence，Explicit Error是 no-commit evidence；
4. call acceptance 原子 suspend Caller/revoke old Activation/push Child/clear InputTarget；
5. call Success 不等于 Child active；
6. call Response先于 dependent Child RPC；
7. ordinary call不使用 reverse suspend；
8. return acceptance 原子接受 outcome/revoke Activation/进入 closing/clear InputTarget；
9. return Success不等于 closed/resumed；
10. return Response先于 dependent close/resume；
11. normal close ACK先于 pop；
12. activate/resume ACK先于 InputTarget publish；
13. accepted outcome不可撤销；
14. revoked Activation永不恢复；
15. same-Subsystem recursion不依赖 nested request-handler reentrancy。

---

# Part IV · Batch D — Normative / Frozen

## 35. Batch D Scope

Batch D 冻结 semantic error registry、recoverable vs control-fatal classification、initialize business rejection、finite deadline、ambiguous delivery、no retry/replay、mutation-gate timeout convergence与 cancellation scope。

## 36. Request Result 三分法

```text
Success Response
    → RPC postcondition known committed

Explicit Error Response
    → RPC postcondition known not committed

Timeout / Response loss / pending-request connection loss
    → applied/not-applied unknown
    → ambiguous control state
```

Ambiguous MUST NOT 被伪装成 recoverable Error或根据本地猜测决定远端 commit。

## 37. Finite Deadline / No Retry

全部七个 Request MUST 有 finite deadline。具体毫秒数由 Host/Profile policy，Batch F 完成 profile/conformance要求。

v1 MUST NOT 在 timeout、loss、reconnect 后做 application-level automatic retry/replay，不定义：

```text
operationId
idempotencyKey
deduplication journal
replay cache
same-operation replay protocol
```

JSON-RPC `id` 只做单次 Request/Response correlation。

## 38. Ambiguous Result → Runtime Failure

Main→Subsystem lifecycle RPC ambiguous：Main MUST停止向该 Runtime发新的正常 Frame Control、不得 retry，并将 Runtime进入 terminal failure path。

Subsystem→Main `frame.call / frame.return` ambiguous：Subsystem MUST保持 mutation gate、停止 ordinary input/正常 Frame operation、不得继续旧 Activation，并进入 Runtime failure path；Control仍可用时 SHOULD `subsystem.status(state="failed")`。

Late Response 在 failure commit 后只用于 diagnostics，不恢复 Runtime/Frame/Activation，也不撤销 accepted outcome。

## 39. Semantic Error Envelope

复用：

```text
error.code = -32000
error.data.code = stable LoomRealm semantic code
```

```ts
type FrameRpcErrorData =
  | { readonly code: "FRAME_CALL_TARGET_NOT_FOUND" }
  | { readonly code: "FRAME_CALL_TARGET_UNAVAILABLE" }
  | {
      readonly code: "FRAME_INITIALIZE_REJECTED";
      readonly failure: FrameFailure;
    }
  | { readonly code: "FRAME_NOT_FOUND" }
  | { readonly code: "FRAME_STATE_MISMATCH" }
  | { readonly code: "ACTIVATION_MISMATCH" }
  | { readonly code: "FRAME_STACK_MISMATCH" }
  | { readonly code: "FRAME_OWNERSHIP_MISMATCH" };
```

closed schema；除 initialize rejection 的 `failure` 外无开放 metadata。

## 40. Recoverable Errors

仅：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

前两个只在 Call Acceptance 前发生，Caller保持 active/current Activation/Stack/InputTarget。

`FRAME_INITIALIZE_REJECTED` 表示合法业务拒绝：Context未 commit，target Runtime healthy。若 Child已 acceptance-commit，则 Main 使用 rejection `FrameFailure` 形成 Child `FrameOutcome.failed`，再 fresh-resume surviving Caller。

## 41. Control Divergence / Protocol Fatal

Runtime-fatal divergence：

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
```

合法 Main-issued `activate / suspend / resume / close` 的 identity/lifecycle/Activation semantic rejection属于 divergence。

Frozen method/schema出现标准 JSON-RPC：

```text
-32700 Parse error
-32600 Invalid Request
-32601 Method not found
-32602 Invalid params
-32603 Internal error
```

属于 protocol-fatal，不是游戏业务失败。业务 input拒绝不得滥用 `-32602`。

## 42. Runtime Failure Diagnostics

至少区分：

```text
FRAME_CONTROL_TIMEOUT
FRAME_CONTROL_DIVERGENCE
FRAME_CONTROL_PROTOCOL_ERROR
```

这些是 Runtime diagnostics / `SubsystemRuntimeError.code`，不直接等同 Caller-visible FrameFailure。

## 43. Cancellation Scope

v1 无 caller-driven `frame.cancel`。`FrameOutcome.cancelled` 只表示当前 active Frame 自行：

```text
frame.return({ result: { type:"cancelled" } })
```

Session termination 使用更高层 Session/Subsystem shutdown。

## 44. Batch D Frozen Invariants

1. 七方法全部 finite deadline；
2. Success=known commit；Explicit Error=known no-commit；timeout/loss=ambiguous；
3. no application retry/replay/idempotency journal；
4. late Response不恢复 failure；
5. 只有三个 Frozen recoverable semantic errors；
6. initialize business rejection不使 Runtime failed；
7. divergence/protocol errors Runtime-fatal；
8. call/return ambiguous时不得释放 gate回旧 Activation；
9. no caller-driven cancellation；
10. Runtime failed后的 Stack recovery由 Batch E。

---

# Part V · Batch E — Normative / Frozen

## 45. Batch E Scope

Batch E 假定某个 Runtime 已由 Subsystem Control / Batch D 判定 terminal failed，只冻结：

```text
Runtime failure → Frame Stack deterministic unwind
multi-Frame / same-Runtime suffix impact
recovery fixed-point expansion
healthy descendant best-effort cleanup
failed-runtime logical Frame retirement
accepted outcome preservation
Caller-visible Runtime failure outcome
surviving Caller fresh resume
initial / zero-Frame failure convergence
```

Batch E 不重新判断 Runtime“是否应该失败”，也不新增 Frame wire method。

## 46. Runtime Failure Identity / Failed Set

Runtime failure以 `descriptor.key` 为单位，不以 `frameId / PID / Worker / Connection / activationId` 为单位。

Main 在一次 recovery transaction内维护：

```ts
failedRuntimeKeys: Set<string>
```

初始包含触发 recovery 的 failed Runtime。Recovery 中任何新 terminal Runtime failure MUST 加入同一集合。

## 47. Unwind Root / Affected Suffix

Main 在当前 live Stack 中计算：

```text
unwindRoot = lowest / oldest Stack Frame
             whose subsystemKey ∈ failedRuntimeKeys
```

从 root 到 Stack Top 的全部 Frame：

```text
affectedSuffix = Stack[root ... top]
```

都属于 doomed suffix，无论 descendant Runtime自身是否仍 healthy。

示例：

```text
bottom
F1  A
F2  B   ← B failed; lowest B
F3  C
F4  B
F5  D
 top
```

必须 unwind `F2..F5`，不能只删 F4/F2，也不能只从最近 B occurrence开始。

该规则自然覆盖 same-Subsystem recursion。

## 48. Failure Unwind Barrier / Serialization

Failure recovery与 Batch C normal transaction使用同一 Stack mutation serialization domain。

Main 建立 Failure Unwind Barrier 后：

1. affected suffix不再启动新的正常 call/return；
2. affected Frame不得获得新的普通 InputTarget；
3. 当前 affected InputTarget MUST 清空；
4. revoked Activation永不恢复；
5. failed Runtime不再接收正常 Frame Control RPC；
6. Renderer不得继续把 affected Frame作为有效 ordinary InputTarget。

Recovery期间 `InputTarget=null` 可以持续多个 RPC deadline。

## 49. Only Committed Main Facts Survive

Runtime failure与 transaction race时，Batch E只承认 Main 已 commit 的事实。

```text
Call Acceptance 未 commit
    → committed Child不存在，Caller原 authority仍按已 commit状态处理

Call Acceptance 已 commit
    → Caller suspended + old Activation revoked + Child starting/pushed均为事实

Return Acceptance 未 commit
    → 无 accepted terminal outcome

Return Acceptance 已 commit
    → outcome terminal且不可撤销
```

Pending/late Response不得越过 Batch D failure classification把 transaction恢复成正常 path。

## 50. Top→Bottom Unwind

Affected suffix MUST 按 LIFO Top→Bottom cleanup。

Main MUST NOT 从 root 向上任意删除，也不得在中间 doomed Frame上逐层执行正常 `frame.resume`。

Intermediate doomed Frame 的 accepted outcome如已存在仍保持不可变，但不会向同样 doomed 的 Caller逐层交付；最终只处理 final root 与其 surviving Caller 的边界。

## 51. Failed Runtime Frame Logical Retirement

若：

```text
frame.subsystemKey ∈ failedRuntimeKeys
```

Main MUST NOT 再发送：

```text
frame.activate
frame.suspend
frame.resume
frame.close
```

Main 直接撤销该 Frame 的公共 Activation/Input authority，并按 failure path将 live Frame收敛：

```text
starting/active/suspended/closing
    → closing
    → closed
    → remove from live Stack
```

这里是 Batch C `normal close ACK before pop` 的明确 failure-path exception：failed Runtime 已不能提供可信 ACK。

failure-path `closed` 只表示 Frame不再是 Main live control object，不表示远端 Context已物理确认删除；Runtime资源释放由 Supervisor/termination负责。

## 52. Healthy Descendant Best-effort Cleanup

Affected suffix 中仍 healthy 的 Runtime SHOULD 尽量保留 Runtime Container，只终止其 doomed Frame Context。

Main 先撤销 affected Frame 的公共 ordinary-input authority：

```text
currentActivationId = null
state = closing
InputTarget = null   // if it was current
```

然后：

- 如果 Main明确知道 `frame.initialize` postcondition从未 commit，则没有 remote Context，无需 `frame.close`；
- 如果 remote Context已确定存在，则发送一次 `frame.close(frameId)`；
- 如果 `frame.close` 已因 normal return/cleanup处于 pending，MUST 使用该既有 Request结果，不得重复发送；
- Batch E 不要求先额外 `frame.suspend`：`active → closing` 已由 Batch A允许，`frame.close` 是 terminal cleanup；额外 suspend只会增加新的 ambiguous failure surface。

成功 close ACK 后才正常确认该 healthy Runtime上的 Context删除并 pop。

## 53. Cleanup Failure → Failed Set Expansion

Recovery cleanup仍服从 Batch D。

healthy Runtime 的 pending/cleanup `initialize / activate / close / resume` 如果出现：

```text
timeout / Response loss / Control loss
divergence
protocol error
unexpected Runtime exit/status(failed)
```

则该 Runtime terminal failed：

```text
failedRuntimeKeys += runtimeKey
```

Main MUST 从整个当前 live Stack重新计算 lowest failed-runtime Frame，不得继续假设旧 root足够。

No retry / replay / local resync。

## 54. Fixed-point Root Expansion

Recovery重复：

```text
compute lowest failed-runtime root
→ unwind top-down
→ cleanup may fail and add Runtime keys
→ recompute root
```

直到 failed set / root达到 fixed point。

示例：

```text
F1  D
F2  A
F3  B   ← initial B failure
F4  C
F5  D
```

第一次 root=F3。cleanup F5 时 D 又失败，则 `failedRuntimeKeys={B,D}`；因为 D 还有更低的 F1，新 root必须移动到 F1，最终整个 Stack unwind。

## 55. Pending RPC During Failure Barrier

Barrier建立时可能已有 Request pending。

### Target Runtime 已 failed

不再把迟到 Response作为 recovery evidence；late Response diagnostic-only。

### Target Runtime 仍 healthy但 Frame已 doomed

既有 Request仍按原 finite deadline获得一次结果，不重发：

- Success：承认远端局部 postcondition，仅用于确定 cleanup状态；MUST NOT据此重新发布 doomed Activation/InputTarget；
- `FRAME_INITIALIZE_REJECTED`：Context absent，按无需 close处理；
- divergence/protocol error/timeout/loss：该 Runtime加入 failed set。

如果 `frame.activate` / `frame.resume` Success在 barrier后确认远端安装了一个 Activation，该 Activation视为已消耗且立即不可用于公共 authority：MUST NOT publish/reuse，随后按 doomed Frame cleanup。

## 56. Accepted Terminal Outcome Preservation

任何 Frame 已完成 Return Acceptance Commit 后：

```text
Frame.outcome = completed / cancelled / failed
```

该 outcome MUST survive Runtime crash、Control failure、close failure或后续 unwind。

Batch E MUST NOT 用 Runtime failure覆盖已 accepted outcome。

这对 final root 和 intermediate doomed Frame都成立；只是 intermediate doomed outcome不需要逐层交付。

## 57. Root Outcome / Caller-visible Runtime Failure

最终 unwind root 若已有 accepted terminal outcome：

```text
rootOutcome = existing accepted outcome
```

若：

```text
root.outcome == null
```

Main MUST 生成：

```ts
const rootOutcome: FrameOutcome = {
  type: "failed",
  error: {
    code: "SUBSYSTEM_RUNTIME_FAILED"
  }
};
```

Batch E 冻结 Caller-visible platform failure code：

```text
SUBSYSTEM_RUNTIME_FAILED
```

v1 不要求把 `FRAME_CONTROL_TIMEOUT / DIVERGENCE / PROTOCOL_ERROR`、failed `subsystemKey`、PID、exit code或timeout duration复制进 Caller-visible `FrameFailure.data`；这些保留为 Runtime diagnostics。

## 58. Surviving Caller

完整 suffix cleanup后，如果 root下方仍有 Frame，则其必须是 final root的 direct Caller。正常情况下：

```text
root.callerFrameId == survivingCaller.frameId
survivingCaller.state == suspended
survivingCaller.currentActivationId == null
```

只有在 Session intends to continue，且 Caller Runtime仍 `ready` / healthy / no-shutdown-intent 时才执行 recovery resume。

## 59. Recovery Resume

Main生成 fresh Activation：

```text
Anew = new activationId
```

发送：

```text
frame.resume({
  frameId: survivingCaller.frameId,
  activationId: Anew,
  returnedFrameId: root.frameId,
  result: rootOutcome
})
```

ACK 后 Main commit：

```text
survivingCaller.state = active
survivingCaller.currentActivationId = Anew
InputTarget = survivingCaller/Anew
```

冻结：

```text
recovery frame.resume ACK
    happens-before
new InputTarget publication
```

旧 Caller Activation绝不恢复。

## 60. Recovery Resume Failure

Recovery `frame.resume` 出现 timeout/loss/divergence/protocol-fatal或 Caller Runtime unexpected failure：

```text
failedRuntimeKeys += survivingCaller.subsystemKey
→ recompute lowest root
→ continue fixed-point unwind
```

不得 retry resume、恢复旧 Activation或手动选择另一个 Frame active。

## 61. Recovery Final States

一次 Batch E recovery最终只允许：

```text
A. healthy surviving Caller resume ACK
   → exactly one active InputTarget

B. no surviving Caller
   → Stack empty
   → InputTarget = null
```

不得留下永久 half-unwound Stack、两个 active Frames、两个 InputTargets或 revived Activation。

## 62. Initial Frame Failure

如果 final root 是 initial Frame：

```text
callerFrameId = null
```

则 suffix清理后：

```text
Stack empty
InputTarget = null
```

不发送 `frame.resume`。

如果 initial root没有 accepted outcome，Main记录 `failed(SUBSYSTEM_RUNTIME_FAILED)` 供更高层 Session lifecycle处理；如果已 accepted terminal outcome，则保持原 outcome，Runtime crash不得覆盖。

Session如何映射为 Game error UI / navigation / termination不属于 Frame / Call。

## 63. Zero-live-Frame Runtime Failure

如果 terminal failed Runtime在当前 live Stack没有任何 Frame：

```text
no unwind root
```

Batch E MUST NOT 因此修改现有 Frame Stack/InputTarget。

后续 call该 Runtime时按 Batch D `FRAME_CALL_TARGET_UNAVAILABLE`。required Runtime failure是否导致整个 Session终止属于更高层 Session policy。

## 64. Session Termination Priority

如果 Main 已建立 Session termination / bootstrap-abort 等全局终止意图，则 global termination owner优先；Batch E 不要求为了继续游戏而 fresh-resume surviving Caller。

仍必须：failed Runtime不恢复、revoked Activation不恢复、accepted outcome不撤销。

## 65. Renderer / Render Boundary

Failure recovery期间 Main MUST 不再发布 affected旧 InputTarget。Renderer MUST等待 Main最终 committed state，不能恢复 cached Activation或猜测 active Frame。

Frame unwind仍不控制 Render lifecycle：healthy descendant Frame被 close不等于 Render destroyed；failed Runtime 的 Render/Data recovery属于对应独立协议/Runtime cleanup。

## 66. No New Recovery Wire / Fail Closed

Batch E 不新增：

```text
frame.abort
frame.unwind
frame.cancel
operation replay
recovery retry
Frame state resync
```

极端 recovery race若现有七方法无法在 finite deadline内安全完成，则 fail closed：把相关 Runtime加入 failed set并继续 fixed-point unwind，而不是引入 nested-request/replay/resync要求。

## 67. Batch E Frozen Invariants

1. Runtime failure是 `descriptor.key` 级事件；
2. Main recovery维护 `failedRuntimeKeys`；
3. unwind root = live Stack中最下面的 failed-runtime Frame；
4. root..top 全部是 affected suffix；
5. affected suffix Top→Bottom unwind；
6. failed Runtime不再收到正常 Frame RPC；
7. failed-runtime Frame可无 close ACK逻辑 retire/pop；
8. healthy descendant只做 best-effort Frame cleanup并尽量保留 Runtime；
9. recovery cleanup不额外要求 suspend-before-close；
10. cleanup failure使新 Runtime加入 failed set；
11. 新 failed Runtime可能使 root向下移动；
12. recovery持续到 fixed point；
13. no retry/replay/resync/new recovery RPC；
14. 只承认 Main 已 commit transaction facts；
15. accepted terminal outcome永远保留；
16. root无 accepted outcome时使用 `SUBSYSTEM_RUNTIME_FAILED`；
17. intermediate doomed Frame不逐层 resume；
18. surviving Caller是 final root下面的 direct Caller；
19. surviving Caller必须 fresh Activation；
20. recovery resume ACK先于 InputTarget publication；
21. resume failure扩展 failed set/root；
22. final state只能 successful healthy Caller resume或 Stack empty；
23. initial root failure无 Caller resume；
24. zero-live-Frame Runtime failure不自动改 Stack；
25. Session termination优先时不要求 recovery resume；
26. Runtime failure不增加 lifecycle=`failed`；
27. Frame unwind不控制 Render/Data lifecycle；
28. revoked Activation永远不能恢复。

---

# Part VI · Batch F — Draft / Non-Normative

## 68. Batch F — Completion

仍需最终冻结：

- wire numeric/string/nesting/payload limits；
- complete A-E conformance fixtures / golden traces；
- finite deadline Profile configuration requirements；
- Desktop WebSocket / PWA MessagePort transport-independent conformance；
- Frame / Call profile/version negotiation/binding completion；
- protocol overall status → Active / Normative / Frozen。

Batch F MUST NOT 静默改变 A-E 已冻结语义。

## 69. Related Documents

- [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)；
- [栈式运行系统](../10-architecture/stack-runtime-system.md)；
- [模块子系统模型](../10-architecture/subsystem-model.md)；
- [通信系统](../10-architecture/communication-system.md)；
- [Renderer–Subsystem 协议分层](../10-architecture/renderer-subsystem-protocol-layers.md)。
