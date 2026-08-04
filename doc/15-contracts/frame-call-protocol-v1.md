# Main ⇄ Subsystem Frame / Call Protocol v1

> 层级：正式契约  
> 状态：Draft；Batch A / B / C / D 已 Normative / Frozen  
> 协议版本：1（目标版本）  
> 稳定程度：Batch A / B / C / D Frozen；Batch E+ Evolving  
> 主要定义：已 ready Runtime Container 中 Frame/Input Context 的身份、生命周期、Activation、RPC wire surface、调用事务、错误/超时与公开提交屏障  
> 依赖：[栈式运行系统](../10-architecture/stack-runtime-system.md)、[模块子系统模型](../10-architecture/subsystem-model.md)、[Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)  
> 决策记录：[ADR 0010：Batch A](../decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)、[ADR 0011：Batch B](../decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)、[ADR 0012：Batch C](../decisions/0012-freeze-frame-call-protocol-v1-batch-c.md)、[ADR 0013：Batch D](../decisions/0013-freeze-frame-call-protocol-v1-batch-d.md)  
> 最近复核：2026-08-04

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

```text
Batch A  Identity / Authority / Lifecycle / Activation       ← Frozen
Batch B  RPC Wire Schema / Direction / Local Semantics        ← Frozen
Batch C  Transaction / Commit Barrier / Rollback              ← Frozen
Batch D  Error / timeout / retry / cancellation               ← Frozen
Batch E  Runtime failure unwind                                ← Draft
Batch F  Limits / fixtures / profile/version completion       ← Draft
```

只有明确标记为 Batch A / B / C / D 的语义已经成为 v1 Normative 基线。后续 Batch MUST NOT 静默修改这些语义。

Runtime Container Bootstrap、Subsystem identity、Runtime ready / shutdown / restart 由独立 [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md) 定义。Frame / Call 不定义 Render lifecycle、System Data Connection lifecycle 或 User Input payload schema。

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
current activationId
ordinary Input eligibility
current Input Target
```

Subsystem 维护自身 Frame/Input Context，并按 Main 签发的 Activation 校验 ordinary User Input；Subsystem MUST NOT 自行创建公共 `frameId`、修改 Stack / Caller / Frame→Subsystem assignment、签发 `activationId` 或改变公共 Input Target。

Renderer 只持有 Main 状态的只读镜像。

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

### `starting`

Main 已分配 Frame identity，正在建立目标 Frame/Input Context 或等待首次 Activation commit。

### `active`

Frame 位于当前 Stack Top，拥有 exactly one current Activation，可以成为 ordinary Input Target，并可在协议允许时发起 ordinary call / return。

### `suspended`

Frame 仍 live 且仍在 Stack，但没有有效 Activation，不接收 ordinary User Input，也不能作为普通 call / return authority。

`suspended` 不推导 business Tick、业务状态、Render 或 Data Connection 行为。

### `closing`

终止流程已被 Main 接受/启动；没有有效 Activation，不再允许 ordinary call / return / input。

### `closed`

terminal；Frame 不再 live，`frameId` 不得复用。

正常 lifecycle：

```text
starting → active ↔ suspended → closing → closed
```

额外允许：

```text
starting  → closing
suspended → closing
```

正常稳定状态：Stack 非空时 exactly one active Frame，且为 Stack Top；其他 live Frame 为 suspended。事务期间 MAY 短暂存在零 active Frame，但 MUST NOT 存在两个 ordinary Input Targets。

## 4. No Frame Ready

v1 不定义：

```text
Frame ready
Frame initialized
frame.ready
frame.status
```

`frame.initialize` 成功只表示 Frame/Input Context 已建立，可继续接受首次 Activation control operation。

## 5. Activation

Activation 表示 Frame 的一次 ordinary User Input 有效周期。

`activationId` MUST：

```text
Main-generated
Session-scoped unique
opaque
immutable
never reused
```

状态关系：

```text
starting    currentActivationId = null
active      currentActivationId = exactly one valid activationId
suspended   currentActivationId = null
closing     currentActivationId = null
closed      currentActivationId = null
```

Main MUST 在首次 active 以及每次 suspended Frame 被重新激活时生成全新的 Activation。

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
AND Frame == Main-authorized Input Target
```

## 6. Outcome 与 Lifecycle 分离

Frame outcome 类别：

```text
completed
cancelled
failed
```

Outcome 描述一次调用如何结束；lifecycle 描述 Frame Context 是否仍存在。即使 outcome=`failed`，cleanup 仍必须通过 `closing → closed`。

## 7. Render / Runtime / Data Independence

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

完整方法集合只有：

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

七个方法全部是 JSON-RPC Request。`params` 使用 JSON Object。

v1 不定义：

```text
system.call
system.return
frame.ready
frame.status
frame.result
frame.cancel
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

RPC params、success result、`FrameOutcome`、`FrameFailure` 均为 closed schema，概念上 `additionalProperties=false`。结构错误使用 JSON-RPC `-32602 Invalid params`。

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

`completed.value` REQUIRED；无业务返回值时显式使用 `null`。

`FrameOutcome.failed` 是终止 outcome，不是 JSON-RPC Error。

## 11. `frame.initialize`

```ts
interface FrameInitializeParams {
  readonly frameId: string;
  readonly input: JsonValue;
}
interface FrameInitializeResult {}
```

成功表示目标 Subsystem 已建立 Frame/Input Context；Main 公共 lifecycle 仍为 `starting`，没有 Activation，也没有 ordinary Input Target。

`frame.initialize` MUST NOT 携带 `callerFrameId`。Caller relationship 只由 Main Registry 权威维护。

## 12. `frame.activate`

```ts
interface FrameActivateParams {
  readonly frameId: string;
  readonly activationId: string;
}
interface FrameActivateResult {}
```

只用于首次 `starting → active`。`activationId` 必须是 Main 新生成值。恢复 suspended Frame 必须使用 `frame.resume`。

## 13. `frame.suspend`

```ts
interface FrameSuspendParams {
  readonly frameId: string;
  readonly activationId: string;
}
interface FrameSuspendResult {}
```

局部成功 postcondition：目标 Subsystem 已永久 revoke 当前 `(frameId, activationId)`，并停止把该 Frame 视为 ordinary-input eligible。

Batch C 明确：ordinary caller-initiated `frame.call` transaction **不使用 `frame.suspend` 作为建立步骤**。该 RPC 保留为 Main 主动 quiesce / terminal preparation 的控制原语；其恢复/失败策略不得绕过 Batch A/C 的 Activation 规则。

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

`activationId` 是 replacement Activation。Subsystem 必须把“交付 Child Outcome + 安装 replacement Activation”作为一个不可分割的局部控制操作。

## 15. `frame.close`

```ts
interface FrameCloseParams {
  readonly frameId: string;
}
interface FrameCloseResult {}
```

成功表示目标 Frame/Input Context 已删除。v1 不携带 `reason / outcome / callerFrameId / activationId / subsystemKey`。

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

Main 必须验证 Caller 属于请求 Connection、Frame 存在且为当前 active Stack Top、Activation 当前有效、目标 Subsystem 已声明且 Runtime ready/no-shutdown-intent。

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

Main 必须验证 Frame 是当前 active Stack Top 且 Activation 当前有效。

`frame.return` 不携带 `callerFrameId` 或 target Subsystem identity。Subsystem 只声明 outcome；Receiver 由 Main-owned caller relationship 决定。

## 18. Result Delivery Model

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

v1 没有独立 `frame.result`，也不得把 resume 拆成 `frame.resume(result) → frame.activate(newActivation)`。

---

# Part III · Batch C — Normative / Frozen

## 19. Batch C Scope

Batch C 冻结：

```text
Initial Frame Establishment
Child Call Establishment
Frame Return / Caller Resume
Stack mutation serialization
acceptance / commit points
Activation revoke / publish barriers
Renderer InputTarget causal constraints
partial failure rollback boundaries
same-Subsystem / recursive call reentrancy rule
```

Batch C 不冻结最终 semantic error code、timeout/retry、Runtime crash unwind 或 wire numeric limits。

## 20. Stack Mutation Serialization

Main MUST 对单一 Frame Stack 的 commit-sensitive mutation 串行执行。同一时刻最多一个 Stack Mutation Transaction 可以修改：

```text
Frame lifecycle
Stack membership/order
current Activation
InputTarget
terminal Frame outcome
```

同一 Frame 在 mutation transaction pending 时不得启动第二个 ordinary `frame.call` 或 `frame.return`。

## 21. RPC Commit Evidence

正常 JSON-RPC Success Response 是该 RPC 已冻结局部 postcondition 的 commit evidence。

正常 JSON-RPC Error Response 表示该 RPC 的 postcondition没有 commit：

```text
initialize Error → no committed target Frame Context
activate Error   → new Activation not installed
suspend Error    → requested revoke not committed
resume Error     → outcome delivery + replacement Activation not committed
close Error      → target Frame Context not confirmed deleted
```

如果通信故障使 applied/not-applied 不可确定，则属于 ambiguous state，MUST NOT 伪装成普通 recoverable Error；其处理由 Batch D 冻结。

## 22. Sender-side Mutation Gate

Subsystem 在发送 `frame.call` 或 `frame.return` 后，直到收到对应 Response 前 MUST 对该 Frame 建立内部 mutation gate。

该 gate 不是公共 lifecycle state，但 pending 期间 MUST：

```text
停止向业务 Handler 派发新的 ordinary input
不再发起第二个 frame.call
不再发起第二个 frame.return
```

如果 Main 在 acceptance commit 前返回 Error：

```text
mutation gate removed
Frame remains active
same current activationId remains valid
```

如果收到 Success，则发送方必须把该 Response 对应的 Batch C acceptance semantics 视为已经 commit。

## 23. No Nested Reverse Request Requirement

v1 MUST NOT 要求实现支持以下模式才能正确工作：

```text
Subsystem → Main Request pending
    while
Main → same Subsystem Request
    and Main waits for its Response
```

尤其 ordinary `frame.call` / `frame.return` MUST NOT 在对应 inbound Request 尚未完成时依赖同 Connection 上的反向 Frame Request。

因此 Main MUST：

```text
complete frame.call Response
    before dependent child initialize/activate RPC

complete frame.return Response
    before dependent close/resume RPC
```

该规则保证 same-Subsystem recursive call 不依赖 JSON-RPC handler reentrancy。

## 24. Initial Frame Establishment

Main 为 initial target 分配 `F0`：

```text
F0.callerFrameId = null
F0.state = starting
Stack = [F0]
InputTarget = null
```

随后：

```text
frame.initialize(F0, input)
→ ACK

A0 = new activationId

frame.activate(F0, A0)
→ ACK
```

收到 `frame.activate` ACK 后 Main 原子 commit：

```text
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

Renderer MUST NOT 在该 ACK 前观察到 F0/A0 为有效 InputTarget。

### Initial failure

`frame.initialize` explicit Error：Main abort F0，不存在 committed target Context，不发布 InputTarget。

`frame.initialize` ACK 后 `frame.activate` explicit Error：Main MUST 令 F0 进入 `closing`，发送 `frame.close(F0)`；close ACK 后 commit `closed` 并移出 live Stack。任何时候都不得发布 F0 InputTarget。

## 25. Call Pre-commit Validation

稳定起点：

```text
Stack top = F1
F1.state = active
F1.currentActivationId = A1
InputTarget = F1/A1
```

Subsystem 发送 `frame.call(F1, A1, targetSubsystemKey, input)` 后进入 mutation gate。

Main 必须在任何 acceptance commit 前验证 Batch B preconditions。

若拒绝：

```text
Stack unchanged
F1 remains active
A1 remains current/valid
InputTarget remains F1/A1
no child Frame exists
```

这是 ordinary call 唯一允许“回到完全原状态”的失败阶段。

## 26. Call Acceptance Commit

验证通过后 Main 分配新的 Child `F2`：

```text
F2.subsystemKey = targetSubsystemKey
F2.callerFrameId = F1
F2.state = starting
```

随后原子执行 Call Acceptance Commit：

```text
revoke F1/A1
F1.state = suspended
F1.currentActivationId = null

push F2
F2.state = starting

InputTarget = null
```

从该 commit 起：

```text
A1 permanently invalid
```

不得 rollback。

Main 完成该 commit 后发送：

```text
frame.call Result { childFrameId: F2 }
```

冻结：

```text
frame.call Success
=
logical Child call accepted
+ Caller suspension committed
+ Child identity committed
```

但：

```text
frame.call Success ≠ Child initialized
frame.call Success ≠ Child active
frame.call Success ≠ Child InputTarget published
```

Caller Subsystem 收到 Success 后 MUST 把自身 Caller Frame 视为 suspended，并把 A1 永久 revoke。ordinary call 不额外发送 `frame.suspend`。

## 27. Child Establishment After Call Response

Main MUST 先完成 `frame.call` Success Response，然后才能依赖：

```text
frame.initialize(F2, input)
→ ACK

A2 = new activationId

frame.activate(F2, A2)
→ ACK
```

收到 activate ACK 后 Main 原子执行 Child Activation Commit：

```text
F2.state = active
F2.currentActivationId = A2
InputTarget = F2/A2
```

冻结：

```text
frame.activate(F2/A2) ACK
    happens-before
Renderer can observe F2/A2 as InputTarget
```

Call Acceptance 后任何新的 Renderer revision MUST NOT 再把 F1/A1 作为 current InputTarget；Child Activation ACK 前 MUST NOT 发布 F2/A2。中间 `InputTarget=null` 合法。

## 28. Post-accept Child Establishment Failure

一旦 `frame.call` Success 已 commit，F1/A1 MUST NOT 恢复。

### Child initialize Error

根据 RPC atomicity rule，不存在 committed target Frame Context。Main 可将 F2 的 Main-side lifecycle 收敛为 `closing → closed` 并 pop，而无需向目标发送 `frame.close(F2)`。

随后 Main MUST 生成平台 `failed` FrameOutcome，并用全新的 Activation 恢复 F1：

```text
A3 = new activationId
frame.resume(F1, A3, returnedFrameId=F2, failedOutcome)
```

稳定 failure code 由 Batch D/E 冻结。

### Child activate Error

由于 initialize 已 ACK，目标 Frame Context 已存在，而 A2 未 commit。Main MUST：

```text
F2 → closing
frame.close(F2)
→ ACK
F2 → closed
pop F2
```

然后以平台 failed outcome + 全新 A3 执行 Caller resume。

绝对禁止恢复 A1。

## 29. `frame.suspend` Transaction Role

ordinary caller-initiated `frame.call` 不调用 `frame.suspend`。

`frame.suspend` 仅作为 Main 主动 quiesce / terminal preparation 的控制原语。其 ACK 后 Main 才可 commit：

```text
F active → suspended
old Activation permanently revoked
InputTarget = null
```

若普通 Error Response，则该 suspend postcondition没有 commit。

v1 不允许用 `frame.suspend` 创建可通过恢复旧 Activation 返回的状态；任何后续重新 active 都必须获得新的 Activation。

## 30. Return Pre-commit Validation

稳定起点：

```text
F2 = Stack Top
F2.state = active
F2.currentActivationId = A2
InputTarget = F2/A2
```

Subsystem 发送 `frame.return(F2, A2, result)` 后进入 mutation gate。

Main 在 acceptance commit 前验证 Connection ownership、Frame existence、Stack Top、active state、current Activation 与 result schema。

若拒绝：

```text
F2 remains active
A2 remains valid
Outcome not accepted
Stack unchanged
```

## 31. Return Acceptance Commit

验证通过后 Main 原子执行：

```text
F2.outcome = result
revoke A2
F2.currentActivationId = null
F2.state = closing
InputTarget = null
```

Stack 此时仍包含 closing F2，因为 target-side Context 尚未确认删除。

该 Return Acceptance Commit 不可逆：

```text
F2 cannot return again
F2 cannot call again
A2 permanently invalid
result is terminal outcome
```

Main 完成该 commit 后发送 `frame.return Result {}`。

冻结：

```text
frame.return Success
=
terminal outcome accepted
+ old Activation revoked
+ terminal cleanup begun
```

但：

```text
frame.return Success ≠ F2 closed
frame.return Success ≠ F2 popped
frame.return Success ≠ Caller resumed
```

Child Subsystem 收到 Success 后 MUST 把 F2 视为 closing，并等待 Main 后续 `frame.close`。

## 32. Child Close / Pop

Main MUST 先完成 `frame.return` Success Response，然后发送：

```text
frame.close(F2)
→ ACK
```

close ACK 前 F2 保持 `closing`。收到 ACK 后 Main commit：

```text
F2.state = closed
remove F2 from live Stack
```

冻结：

```text
frame.close ACK
    happens-before
F2 removal as a live Frame
```

## 33. Caller Resume

如果 `F2.callerFrameId = F1`，且 F2 已 closed/pop，Main 创建新 Activation A3：

```text
frame.resume({
    frameId: F1,
    activationId: A3,
    returnedFrameId: F2,
    result: F2.outcome
})
→ ACK
```

ACK 后 Main 原子执行 Caller Resume Commit：

```text
F1.state = active
F1.currentActivationId = A3
InputTarget = F1/A3
```

冻结：

```text
frame.resume ACK
    happens-before
corresponding Caller InputTarget publication
```

不得再发送 `frame.activate(F1, A3)`。

Return Acceptance 后任何新的 Renderer revision MUST NOT 再发布 F2/A2；resume ACK 前 MUST NOT 发布 F1/A3。中间 `InputTarget=null` 合法。

## 34. Initial Frame Return

如果返回 Frame 的 `callerFrameId == null`：

```text
return accepted
→ closing
→ frame.close ACK
→ closed / pop
→ Stack empty
→ InputTarget null
```

Initial Frame outcome 如何转换为 Session completion / Game exit / Host navigation 不属于 Frame / Call v1。

## 35. Return Cannot Roll Back

一旦 Return Acceptance Commit 完成，后续 `frame.close` failure、Caller `frame.resume` failure 或 Control failure MUST NOT：

```text
restore returned Frame active
restore old Activation
erase accepted outcome
```

这些故障只能进入 Batch D/E 定义的 forward recovery。

## 36. Publication Barriers

Batch C 不冻结 Main ⇄ Renderer wire Schema，但冻结 causal constraints：

1. Main MUST NOT 发布尚未被目标 Subsystem ACK 的 Activation。
2. 一旦 Activation 在 Main transaction 中 commit revoked，后续 revision MUST NOT 再把它作为 current。
3. Transaction gap MAY 发布 `InputTarget=null`。
4. Main MUST NOT 发布两个同时有效 ordinary Input Targets。
5. Renderer Control MAY coalesce intermediate Stack states。
6. Coalescing MUST NOT 越过 Activation/InputTarget safety barrier。

Renderer 可以只观察：

```text
F1/A1 → F2/A2
```

而不观察中间 `F1 suspended / F2 starting / null target`，但新 Activation 必须在对应 activate/resume ACK 后才可见。

## 37. Same-Subsystem / Recursive Calls

same-Subsystem 与跨 Subsystem 调用使用完全相同事务语义。区别只在于 Runtime Container 与 Control Connection 被复用。

仍必须：

```text
new childFrameId
new Child Activation
Caller old Activation revoke
normal Stack push/pop
```

禁止通过本地函数调用绕过 Main、复用 `frameId` / Activation 或绕过 `frame.call / frame.return`。

允许：

```text
Subsystem A / F1 suspended
Subsystem A / F2 suspended
Subsystem A / F3 active
```

共享同一 Runtime Container 和 Control Connection。

Batch C 的 Response-before-dependent-reverse-RPC 规则保证递归不要求 transport-level request handler reentrancy。

## 38. Transaction Failure Classes

### Pre-commit failure

例如 call/return validation rejection、initial initialize explicit rejection。

结果：transaction state 未 commit，已有 Activation MAY 保持有效。

### Post-commit failure

例如 call accepted 后 Child initialize/activate 失败，或 return accepted 后 close/resume 失败。

结果：不得恢复 revoked Activation，不得撤销 accepted terminal outcome，只能 forward compensate/recover。

核心原则：

```text
Pre-commit  → abort is allowed
Post-commit → forward recovery only
```

## 39. Batch C Frozen Invariants

1. 单一 Stack mutation 串行提交。
2. `frame.call / frame.return` pending 时发送方必须建立 mutation gate 并停止新的 ordinary input dispatch。
3. Mutation gate 不是公共 lifecycle state。
4. 正常 Error Response 表示 RPC postcondition没有 commit；ambiguous state 留给 Batch D。
5. Initial Frame 必须 `initialize ACK → activate ACK → active/InputTarget commit`。
6. `frame.activate ACK` happens-before 对应 InputTarget publication。
7. Call Acceptance Commit 原子完成 Caller suspension、old Activation revoke、Child starting/push、InputTarget clear。
8. `frame.call` Success 表示 logical Child call accepted，不表示 Child active。
9. Main MUST 完成 `frame.call` Response 后才依赖 Child initialize/activate。
10. ordinary call 不额外发送 `frame.suspend`。
11. `frame.call` Success 后 Child startup failure不能恢复 Caller old Activation，只能以 failed Child outcome + fresh Activation forward-resolve。
12. Return Acceptance Commit 原子接受 outcome、revoke Child Activation、进入 closing、清空 InputTarget。
13. `frame.return` Success 不表示 Child closed 或 Caller resumed。
14. Main MUST 完成 `frame.return` Response 后才依赖 close/resume。
15. `frame.close ACK` 后才能 commit closed 并移出 live Stack。
16. Caller 只有在 Child closed/pop 后才执行 `frame.resume`。
17. `frame.resume ACK` happens-before replacement Caller InputTarget publication。
18. Return Acceptance 不可 rollback。
19. revoked Activation 永远不能恢复。
20. Renderer Control MAY coalesce transitional states，但不得违反 Activation/InputTarget causal barrier。
21. same-Subsystem / recursive call 使用完全相同事务语义。
22. v1 不依赖 bidirectional nested-request handler reentrancy。

---

# Part IV · Batch D — Normative / Frozen

## 40. Batch D Scope

Batch D 冻结：

```text
semantic error registry
recoverable vs control-fatal classification
frame.initialize business rejection
timeout / ambiguous delivery
no-retry / no-replay policy
mutation gate timeout convergence
caller cancellation scope
Runtime failure diagnostic category
```

Batch D 不定义 Runtime failed 后的 Stack unwind；该工作属于 Batch E。

## 41. Request Result 三分法

Frame / Call v1 对每个 Request 只接受三种控制结论：

```text
Success Response
    RPC postcondition 已知 commit

Explicit Error Response
    RPC postcondition 已知未 commit

Timeout / Response loss / pending-request connection loss
    applied/not-applied unknown
    ambiguous control state
```

Ambiguous state MUST NOT 被伪装成 Explicit Error，也不得根据本地猜测决定远端是否已 commit。

Batch C 的规则继续有效：Success 是 commit evidence；Explicit Error 是 no-commit evidence。

## 42. Finite Deadline

全部七个 Frame / Call Request MUST 有有限 deadline：

```text
frame.initialize
frame.activate
frame.suspend
frame.resume
frame.close
frame.call
frame.return
```

Batch D 不冻结具体毫秒数。实际 timeout value 由 Host / Transport Profile policy 选择，并在 Batch F/Profile 完成时进入 conformance 要求。

没有任何 Frame Request 可以无限等待。

## 43. No Application Retry / Replay

v1 MUST NOT 对 state-changing Frame Request 执行 application-level automatic retry、retransmission 或 reconnect replay。

v1 不定义：

```text
operationId
idempotencyKey
deduplication journal
replay cache
same-operation replay protocol
```

JSON-RPC `id` 只用于一次 Request/Response correlation，不是 Frame operation identity。

因此：

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → unknown → Runtime failure path
```

## 44. Ambiguous Result → Runtime Failure

### 44.1 Main→Subsystem Request

如果 Main 对 `frame.initialize / activate / suspend / resume / close` 发生 timeout、Response loss 或 pending-request connection loss，使 Main 无法证明操作 applied/not-applied：

1. Main MUST NOT retry；
2. Main MUST NOT继续向该 Runtime 发新的正常 Frame Control operation；
3. Main MUST 将该 Runtime 进入 terminal failure path；
4. Main MUST 保持 Batch C 已 commit 的 Activation/outcome 不可回滚；
5. 后续 Stack recovery 交给 Batch E。

### 44.2 Subsystem→Main Request

如果 Subsystem 对 `frame.call / frame.return` 无法确定 Main 是否已 acceptance-commit：

1. Subsystem MUST 保持对应 mutation gate；
2. MUST 停止新的 ordinary input dispatch 与新的正常 Frame operation；
3. MUST NOT解除 gate 后继续使用旧 Activation；
4. MUST 进入 Runtime failure path；
5. Connection 仍可用时 SHOULD 通过 `subsystem.status(state="failed")` 报告 Frame Control failure；若 Connection 已丢失，则 Subsystem Control v1 的 Control loss 规则使 Main 进入 Runtime failure path。

## 45. Late Response

一旦某次 timeout / ambiguous failure 已被本地 Runtime authority commit 为 failure：

```text
late Success / Error Response
    diagnostic only
```

迟到 Response MUST NOT：

```text
restore Runtime healthy
restore Frame active
restore/revive Activation
cancel already-committed Runtime failure
erase accepted terminal outcome
```

## 46. Semantic Error Envelope

Frame / Call v1 复用 Subsystem Control v1 的 LoomRealm semantic error envelope：

```text
error.code = -32000
error.data.code = stable LoomRealm semantic code
```

概念类型：

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

该对象是 closed schema。除 `FRAME_INITIALIZE_REJECTED.failure` 外，Frozen semantic errors 不携带开放式 metadata bag。

## 47. Recoverable Errors

只有以下 Frozen semantic errors 被定义为正常可恢复拒绝：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

### 47.1 `FRAME_CALL_TARGET_NOT_FOUND`

Main 在 `frame.call` Call Acceptance Commit 前发现 `targetSubsystemKey` 没有被 Game Entry 声明。

结果：

```text
Caller remains active
current Activation remains valid
Stack unchanged
InputTarget unchanged
no Child Frame committed
```

### 47.2 `FRAME_CALL_TARGET_UNAVAILABLE`

目标 Subsystem 已声明，但目标 Runtime 当前不能接受新的 Frame，例如 not-ready / stopping / stopped / failed / shutdown-intent established。

该错误只能发生在 Call Acceptance Commit 前，结果与 target-not-found 相同。具体 Runtime observed state 可进入 diagnostics，但不扩展 Frozen wire error schema。

### 47.3 `FRAME_INITIALIZE_REJECTED`

目标 Runtime 正常收到合法 `frame.initialize`，但因业务条件拒绝建立该 Frame Context，例如目标业务对象不存在、业务输入不满足前置条件或本次调用不能被接受。

该 Error MUST 携带：

```ts
interface FrameInitializeRejectedErrorData {
  readonly code: "FRAME_INITIALIZE_REJECTED";
  readonly failure: FrameFailure;
}
```

该 Error 明确表示：

```text
frame.initialize postcondition not committed
target Runtime remains healthy
```

如果这是 initial Frame initialize，则更高层 Session/bootstrap 根据 `failure` 决定启动失败表现。

如果 Child call 已由 Batch C acceptance-commit，则 Main MUST 把该 rejection forward-resolve 为该 Child 的：

```text
{ type: "failed", error: failure }
```

并用全新 Activation 恢复 surviving Caller。Caller 的旧 Activation 永远不能恢复。

## 48. Control Divergence Errors

以下 semantic errors 表示 Main 与 Subsystem 对 Frame Control authority/state 已经不一致：

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
```

它们不是普通游戏业务拒绝。

### `FRAME_NOT_FOUND`

接收方按 Frozen transaction/state 应当存在某个 Frame，但本地找不到。

### `FRAME_STATE_MISMATCH`

Frame 存在，但 lifecycle 与该 operation 要求不一致。

### `ACTIVATION_MISMATCH`

Frame identity 一致，但 current/referenced Activation 与 authority state 不一致。

### `FRAME_STACK_MISMATCH`

Subsystem→Main `frame.call / frame.return` 来自不是当前合法 Stack Top/call authority 的 Frame。

### `FRAME_OWNERSHIP_MISMATCH`

Subsystem→Main Frame operation 来自与 Main-owned `frameId → descriptor.key` assignment 不一致的 Control Connection。

收到或产生上述错误后，涉及的 Subsystem Runtime MUST 进入 control-divergence failure path，不得继续正常 Frame operation。

## 49. Main-issued Lifecycle RPC Strictness

合法 Main-issued：

```text
frame.activate
frame.suspend
frame.resume
frame.close
```

在目标 Runtime healthy 且 Main/Subsystem state一致时 MUST 成功。

除 `frame.initialize` 的 `FRAME_INITIALIZE_REJECTED` 外，Subsystem 对合法 Main-issued lifecycle operation 返回 Frame identity/lifecycle/Activation semantic error，表示 control divergence，并使该 Runtime 进入 failure path。

实现不得通过“再 initialize 一次”“重新 activate 旧 Activation”或其他私有 resync 修复该分歧。

## 50. Standard JSON-RPC Errors

标准 JSON-RPC errors 继续适用，包括：

```text
-32700 Parse error
-32600 Invalid Request
-32601 Method not found
-32602 Invalid params
-32603 Internal error
```

Batch B 已冻结 structural invalid params → `-32602`。

在 Frozen Frame / Call method surface 上出现上述错误，表示实现不兼容、协议消息损坏或 Frame Control implementation failure，不属于游戏业务失败；涉及 Runtime MUST 进入 protocol-failure path。

业务输入本身的合法业务拒绝不得滥用 `-32602` 表达；`frame.initialize` 的业务拒绝使用 `FRAME_INITIALIZE_REJECTED`，运行中业务结束失败使用 `FrameOutcome.failed`。

## 51. Runtime Failure Diagnostic Categories

Frame Control 导致 Runtime terminal failure 时，至少使用：

```text
FRAME_CONTROL_TIMEOUT
FRAME_CONTROL_DIVERGENCE
FRAME_CONTROL_PROTOCOL_ERROR
```

语义：

```text
FRAME_CONTROL_TIMEOUT
    Frame Request deadline expired or result became ambiguous

FRAME_CONTROL_DIVERGENCE
    Main and Subsystem no longer agree on Frame authority/state

FRAME_CONTROL_PROTOCOL_ERROR
    JSON-RPC/schema/method implementation is incompatible or invalid
```

这些 code 属于 Runtime failure diagnostics / `SubsystemRuntimeError.code` 语义，不等同于最终 Caller-visible `FrameOutcome.failed.error.code`。Runtime failure 如何转换成 surviving Caller outcome 由 Batch E 冻结。

## 52. Cancellation Scope

Frame / Call v1 不支持 caller-driven cancellation：

```text
no frame.cancel
no suspended Caller remote-cancel operation
```

`FrameOutcome.cancelled` 保留，但只表示当前 active Frame 自己决定通过：

```text
frame.return({ result: { type: "cancelled" } })
```

结束。

Session termination、Game exit 或 Runtime shutdown 不通过 Frame cancellation 表达，而使用更高层 Session / `subsystem.shutdown` 流程。

## 53. Batch D Frozen Invariants

1. 所有 Frame / Call Request MUST 有 finite deadline；具体毫秒数由 Profile/Host policy 决定。
2. Success Response = known committed。
3. Explicit Error Response = known not committed。
4. timeout / Response loss / pending-request connection loss = ambiguous applied/not-applied state。
5. Ambiguous state MUST NOT 被猜测或降级成 recoverable Error。
6. v1 对七个 Frame Request不做 application-level automatic retry/replay。
7. v1 不定义 operationId / idempotencyKey / dedup journal / replay cache。
8. timeout failure commit 后迟到 Response 只用于 diagnostics。
9. `FRAME_CALL_TARGET_NOT_FOUND` 是 recoverable pre-commit call error。
10. `FRAME_CALL_TARGET_UNAVAILABLE` 是 recoverable pre-commit call error。
11. `FRAME_INITIALIZE_REJECTED` 是 recoverable business rejection，并携带 `FrameFailure`。
12. initialize rejection 不使 target Runtime failed；已 accepted Child 必须 forward-resolve 为 failed outcome + fresh Caller Activation。
13. `FRAME_NOT_FOUND / FRAME_STATE_MISMATCH / ACTIVATION_MISMATCH / FRAME_STACK_MISMATCH / FRAME_OWNERSHIP_MISMATCH` 是 Runtime-fatal control divergence。
14. 合法 Main-issued activate/suspend/resume/close 的 semantic lifecycle rejection 是 control divergence。
15. Frozen Frame wire 的 JSON-RPC/schema/method protocol error 是 control-fatal。
16. `frame.call / frame.return` timeout 时 Subsystem MUST NOT解除 mutation gate 后继续旧 Activation。
17. Main outbound Frame RPC timeout 时 MUST 停止该 Runtime 的新正常 Frame Control operation。
18. Runtime failure diagnostics 至少区分 timeout/divergence/protocol-error。
19. v1 不支持 caller-driven `frame.cancel`。
20. `FrameOutcome.cancelled` 只表示 active Frame 自行 return cancelled。
21. Session shutdown 不是 Frame cancellation。
22. Runtime failure 后的具体 Stack unwind 属于 Batch E。

---

# Part V · Batch E+ — Draft / Non-Normative

## 54. Batch E — Runtime Failure Unwind

仍需冻结：

- Runtime failure multi-Frame suffix-unwind；
- Runtime crash during any Batch C/D transaction；
- initial Frame failure；
- best-effort close when Runtime unavailable；
- surviving caller failed outcome + fresh Activation resume；
- `FRAME_CONTROL_TIMEOUT / DIVERGENCE / PROTOCOL_ERROR` 与 Runtime crash 如何统一进入 deterministic unwind；
- Caller-visible Runtime failure `FrameOutcome.failed.error.code`。

Batch E MUST 遵守 Batch A-D：revoked Activation 不恢复、accepted outcome 不撤销、ambiguous state 不 retry。

## 55. Renderer Recovery

Renderer reload 不关闭 Main、Runtime Container 或 Frame Context。恢复使用 Main 当前 Stack/lifecycle/current Activation/InputTarget；不得恢复本地缓存中的旧 Activation。Render/Data Connection 独立恢复。

## 56. Batch F — Completion

最终冻结：

- wire numeric limits；
- complete conformance fixtures；
- finite deadline/profile configuration requirements；
- Desktop / PWA transport-independent fixture；
- Frame / Call profile/version completion；
- protocol overall status → Active / Normative / Frozen。

## 57. Related Documents

- [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)；
- [栈式运行系统](../10-architecture/stack-runtime-system.md)；
- [模块子系统模型](../10-architecture/subsystem-model.md)；
- [通信系统](../10-architecture/communication-system.md)；
- [Renderer–Subsystem 协议分层](../10-architecture/renderer-subsystem-protocol-layers.md)。
