# Main ⇄ Subsystem Frame / Call Protocol v1

> 层级：正式契约  
> 状态：Active / Normative / Frozen  
> 协议身份：`loomrealm.frame-call`  
> 协议版本：1  
> 主要定义：Frame identity/lifecycle、Activation、七方法 wire、调用事务、错误/超时、Runtime failure unwind、limits 与 Transport mapping  
> 依赖：[Subsystem Control Protocol v1](./subsystem-control-protocol-v1.md)、[栈式运行系统](../10-architecture/stack-runtime-system.md)  
> 组合 Profile：[Runtime Control Application Profile v1](./runtime-control-profile-v1.md)  
> Conformance：[Frame / Call Protocol v1 Conformance Profile](./frame-call-conformance-v1.md)  
> 决策记录：[ADR 0010](../decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)、[0011](../decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)、[0012](../decisions/0012-freeze-frame-call-protocol-v1-batch-c.md)、[0013](../decisions/0013-freeze-frame-call-protocol-v1-batch-d.md)、[0014](../decisions/0014-freeze-frame-call-protocol-v1-batch-e.md)、[0015](../decisions/0015-freeze-frame-call-protocol-v1-batch-f.md)  
> 最近复核：2026-08-09

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

> **Main 是 Frame / Stack / Activation / InputTarget 的唯一公共权威。Frame mutation 使用 commit barrier；已提交事实不回滚。Timeout/loss 对 state-changing Request 是 ambiguous，因此进入 Runtime failure，而不是 retry/resync。**

Batch A-F 仅保留为设计历史分组，不是独立兼容等级。

---

## 1. Authority / Identity

Main 唯一拥有：

```text
frameId
Frame → subsystemKey assignment
callerFrameId
Frame lifecycle
Frame Stack
terminal outcome
current activationId
ordinary Input eligibility
InputTarget
```

Subsystem 只维护本地 Frame/Input Context，不得自行创建公共 Frame、修改 Stack/Caller、签发 Activation 或改变 InputTarget。

`frameId` 与 `activationId` 都必须：

```text
Main-generated
Session-scoped unique
opaque
immutable
never reused within Session
```

每个 Frame 创建时永久绑定 exactly one `descriptor.key`；`callerFrameId` 创建后 immutable：initial Frame 为 `null`，called Frame 为 direct caller。

PID、Worker ID、Connection ID、Render identity 不得代替 Frame identity。

---

## 2. Lifecycle / Outcome

公共 lifecycle 只有：

```ts
type FrameLifecycleState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";
```

```text
starting   identity 已分配；Context建立中或等待首次 Activation
active     Stack Top；exactly one current Activation；可成为 InputTarget
suspended  live；无有效 Activation；不可 ordinary call/return/input
closing    terminal cleanup 已开始；无有效 Activation
closed     terminal；不再 live；frameId永不复用
```

允许转换：

```text
starting → active
starting → closing
active → suspended
active → closing
suspended → active      only child-call suspension + valid frame.resume
suspended → closing
closing → closed
```

稳定状态下：Stack empty，或 exactly one active Frame 且为 Stack Top；lower live Frames 全部 suspended。正常 transaction/recovery 中 MAY 暂时 zero active Frame，但 MUST NOT 有两个 ordinary InputTargets。

Outcome 与 lifecycle 分离：

```ts
type FrameOutcome =
  | { readonly type: "completed"; readonly value: JsonValue }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly error: FrameFailure };

interface FrameFailure {
  readonly code: string;
  readonly message?: string;
  readonly data?: JsonValue;
}
```

`completed.value` REQUIRED；无业务返回值显式 `null`。

Frame lifecycle 不拥有 Runtime、Render 或 Data lifecycle：

```text
Frame active  != Render visible
Frame suspend != Render hidden
Frame close   != Render destroyed
Frame create  != Data Connection create
Frame close   != Data Connection close
```

---

## 3. Activation

Activation 是 Frame 一次 ordinary-input authority epoch。

```text
starting    currentActivationId = null
active      currentActivationId = exactly one valid activationId
suspended   currentActivationId = null
closing     currentActivationId = null
closed      currentActivationId = null
```

首次 active 与每次合法恢复都使用 fresh Activation。

```text
Activation never rolls back.
Activation never resumes.
Revoked Activation never becomes valid again.
```

ordinary input 至少要求：Frame exists + `active` + activationId current + Main current InputTarget 指向该 Frame/Activation。

---

## 4. Suspension Semantics

公共 lifecycle 只有一个 `suspended`，但 Main 内部 MUST 区分 provenance：

```ts
type SuspensionCauseV1 =
  | "child-call"
  | "administrative";
```

该字段是 Main-private state，不进入 wire。

### 4.1 Child-call suspension

合法 `frame.call` 被 Main accept 时：

```text
Caller active/A1
→ revoke A1
→ Caller suspended(cause=child-call)
→ Child starting/pushed
```

Child terminal cleanup 后，Caller MAY 使用既有 `frame.resume` 恢复，并且必须携带对应 Child outcome + fresh Activation。

### 4.2 Administrative suspension

Main 显式成功调用：

```text
frame.suspend({frameId, activationId})
```

后：

```text
old Activation permanently revoked
Frame suspended(cause=administrative)
ordinary input disabled
```

v1 **没有 generic reactivation wire**。Administrative suspended Frame 后续只允许：

```text
suspended → closing → closed
```

或进入 Runtime failure cleanup。

不得伪造 Child、`returnedFrameId` 或 `FrameOutcome` 来调用 `frame.resume`；不得复用旧 Activation。

### 4.3 Ordinary call does not use reverse suspend

`frame.call` acceptance 本身就是 Caller suspension commit。Main MUST NOT 为 ordinary call 再向同一 Subsystem 发送 `frame.suspend`。

---

## 5. Exact Wire Surface

Frame / Call v1 复用已完成 `subsystem.hello` 的 Runtime Control Connection，使用 JSON-RPC 2.0。

Exactly seven Requests：

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

全部是 Request；`params` MUST 是 JSON Object。

不存在：

```text
system.call
system.return
frame.ready
frame.status
frame.result
frame.cancel
frame.abort
frame.unwind
frame.sync
frame.ping
frame.reactivate
```

协议 params/results、Outcome、Failure、semantic error data 均为 closed schema；结构错误使用 `-32602 Invalid params`。

---

## 6. Method Schemas

### `frame.initialize`

```ts
interface FrameInitializeParams {
  readonly frameId: string;
  readonly input: JsonValue;
}
interface FrameInitializeResult {}
```

Success = target Subsystem 已建立 Frame/Input Context；Main public state 仍 `starting`，无 Activation/InputTarget。

### `frame.activate`

```ts
interface FrameActivateParams {
  readonly frameId: string;
  readonly activationId: string;
}
interface FrameActivateResult {}
```

只用于首次 `starting → active`；不能用于恢复 suspended Frame。

### `frame.suspend`

```ts
interface FrameSuspendParams {
  readonly frameId: string;
  readonly activationId: string;
}
interface FrameSuspendResult {}
```

Success = target Subsystem 已永久 reject/revoke该 ordinary-input epoch，并进入 administrative suspended local context。

### `frame.resume`

```ts
interface FrameResumeParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly returnedFrameId: string;
  readonly result: FrameOutcome;
}
interface FrameResumeResult {}
```

只用于 child-call suspension。Subsystem MUST 将“交付 Child outcome + 安装 fresh replacement Activation”作为一个不可分割的局部操作。

### `frame.close`

```ts
interface FrameCloseParams {
  readonly frameId: string;
}
interface FrameCloseResult {}
```

Success = target Frame/Input Context 已删除；不隐式停止 Runtime、删除 Render 或关闭 Data Connection。

### `frame.call`

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

Main 验证 authenticated source ownership、active Stack Top、current Activation、target declared + Runtime ready/no-shutdown-intent。

same-Subsystem recursion 合法，但必须 fresh `childFrameId`。Success 只表示 Child call 已 accepted，不等待最终业务结果。

### `frame.return`

```ts
interface FrameReturnParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly result: FrameOutcome;
}
interface FrameReturnResult {}
```

Main 验证 source ownership、active Stack Top、current Activation。结果只沿：

```text
Child frame.return(result)
→ Main
→ Caller frame.resume(returnedFrameId,result,freshActivation)
```

---

## 7. Commit Evidence / Mutation Gate

```text
Success Response        → local postcondition known committed
Explicit Error Response → local postcondition known not committed
Timeout/loss            → applied/not-applied unknown → ambiguous
```

Subsystem 发出 `frame.call` / `frame.return` 后直到 terminal Response 前 MUST 建立 mutation gate：

```text
stop new ordinary input dispatch
block second call/return
```

只有明确 recoverable pre-commit Error 才可释放 gate 继续当前 Activation。Fatal Error/ambiguous 不恢复旧 Activation。

Main 对单一 Stack 的 commit-sensitive mutation MUST 串行；normal transaction 与 failure unwind 共享同一 serialization authority。

---

## 8. Response-before-dependent-RPC

v1 MUST NOT 依赖：

```text
Subsystem → Main Request pending
while Main → same Subsystem Request and waits Response
```

Main MUST：

```text
complete frame.call Response before dependent Child initialize/activate
complete frame.return Response before dependent close/resume
```

因此 same-Subsystem recursion 不要求 nested reverse Request handler reentrancy。

---

## 9. Initial Frame Transaction

```text
allocate F0
F0 starting / caller=null
Stack=[F0]
InputTarget=null

frame.initialize(F0,input) → ACK
A0=fresh
frame.activate(F0,A0) → ACK

Main commit:
F0 active/A0
InputTarget=F0/A0
```

`activate ACK` happens-before InputTarget publication。

`FRAME_INITIALIZE_REJECTED` = Context absent + Runtime healthy。initialize/activate timeout/divergence/protocol error → Runtime failure。

---

## 10. Call Acceptance Transaction

稳定起点：F1/A1 active Stack Top/InputTarget。

合法 `frame.call(F1,A1,target,input)` 被 Main 原子 accept：

```text
revoke F1/A1
F1 → suspended(cause=child-call)
F1.currentActivationId=null
allocate F2 starting, subsystemKey=target, callerFrameId=F1
push F2
InputTarget=null
```

然后 Main 返回 `{childFrameId:F2}`。

只有 Response 完成后才：

```text
frame.initialize(F2,input) → ACK
A2=fresh
frame.activate(F2,A2) → ACK
→ F2 active/A2
→ publish InputTarget F2/A2
```

Call acceptance 后 F1/A1 永不恢复。Child activation ACK 前 `InputTarget=null` 合法。

Post-accept `FRAME_INITIALIZE_REJECTED` → healthy Child failed outcome + fresh Caller resume；fatal/ambiguous → Runtime failure unwind。

---

## 11. Return Acceptance Transaction

稳定起点：F2/A2 active Stack Top/InputTarget。

合法 `frame.return(F2,A2,result)` 被 Main 原子 accept：

```text
F2.outcome=result
revoke A2
F2.currentActivationId=null
F2→closing
InputTarget=null
```

Main 先返回 `{}`。

Runtime healthy：

```text
frame.close(F2) → ACK
→ F2 closed/pop
A3=fresh
frame.resume(F1,A3,F2,F2.outcome) → ACK
→ F1 active/A3
→ publish InputTarget F1/A3
```

`close ACK` happens-before normal pop；`resume ACK` happens-before replacement InputTarget publication。

Accepted outcome 不可撤销；revoked Activation 不可恢复。

---

## 12. Explicit Administrative Suspend Transaction

稳定起点：F/A active，A current。

Main：

```text
frame.suspend(F,A) → ACK
```

ACK 后 commit：

```text
revoke A permanently
F.currentActivationId=null
F→suspended(cause=administrative)
InputTarget cannot reference F/A
```

该 Frame 不存在 v1 normal resume path；后续只能 close 或 failure cleanup。

`frame.suspend` 是 state-changing Request：Success=known committed；Explicit Error=known no-commit；timeout/loss=ambiguous→Runtime failure；no retry。

---

## 13. Transaction Principle

```text
Pre-commit recoverable failure → abort allowed
Post-commit facts              → never rollback
Runtime-fatal failure          → no local resync/retry → failure unwind
```

Renderer Control MAY coalesce transitional revisions，但必须保持：

```text
unacknowledged Activation never published
revoked Activation never republished
InputTarget=null legal
never two ordinary InputTargets
```

---

## 14. Error Classification

全部七个 Request MUST 使用 finite sender-local deadline。

v1 不对 state-changing operation 做 application retry/replay/reconnect replay；无 `operationId` / idempotency journal。

Semantic error envelope：

```text
JSON-RPC error.code = -32000
error.data.code = stable semantic code
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

Recoverable only：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

Divergence/fatal：

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
standard JSON-RPC protocol/implementation errors on Frozen surface
```

Runtime diagnostics 至少支持：

```text
FRAME_CONTROL_TIMEOUT
FRAME_CONTROL_DIVERGENCE
FRAME_CONTROL_PROTOCOL_ERROR
```

Late Response 在 failure commit 后只用于 diagnostics，不恢复 authority/outcome。

v1 无 caller-driven `frame.cancel`；`cancelled` 只能由 current active Frame 自己作为 `frame.return` outcome 表达。

---

## 15. Runtime Failure Unwind

Runtime failure 以 `descriptor.key` 为单位。Main 在一次 recovery transaction 维护：

```ts
failedRuntimeKeys: Set<string>
```

unwind root = 当前 live Stack 中**最下面/最老的** `subsystemKey ∈ failedRuntimeKeys` Frame。

```text
root..top = doomed suffix
```

同 Runtime 多次出现在 Stack 时取最低 occurrence。

### 15.1 Failure barrier

Recovery 与 normal transaction 共享 Stack serialization。

Barrier 后：

```text
no new normal call/return from doomed suffix
clear affected InputTarget
no new doomed Activation publication
failed Runtime gets no normal Frame RPC
```

只承认 Main 已 commit 的 transaction facts。

### 15.2 LIFO cleanup

Affected suffix MUST Top→Bottom cleanup；intermediate doomed Frame 不逐层 normal resume。

Failed Runtime Frame：

```text
no activate/suspend/resume/close RPC
revoke public authority
→ closing
→ closed
→ logical remove from live Stack
```

这是 normal close ACK-before-pop 的 failure-path exception。

Healthy doomed Frame：如果 Context确定存在，best-effort 发送 exactly one `frame.close`；如果 initialize已明确未 commit则无需 close；已有 pending close 不 duplicate。

### 15.3 Fixed-point expansion

Healthy cleanup/pending RPC 若 timeout/loss/diverge/protocol-fail/Runtime exit：

```text
failedRuntimeKeys += subsystemKey
→ recompute lowest root over whole live Stack
```

重复直到 fixed point。无 retry/replay/resync/new recovery RPC。

### 15.4 Outcome preservation

已被 Return Acceptance commit 的 outcome MUST survive Runtime crash/Control failure/cleanup failure。

Final root：

```text
if root.outcome != null:
    rootOutcome = existing accepted outcome
else:
    rootOutcome = {
      type:"failed",
      error:{code:"SUBSYSTEM_RUNTIME_FAILED"}
    }
```

### 15.5 Surviving Caller

如果 final root 下方存在 direct Caller，Session 继续且 Caller Runtime healthy/ready：

```text
Anew=fresh
frame.resume(Caller,Anew,root.frameId,rootOutcome) → ACK
→ Caller active/Anew
→ publish InputTarget
```

Recovery resume failure → Caller Runtime 加入 failed set → recompute root。

最终只能：healthy Caller fresh-resume 成功，或 Stack empty/InputTarget=null。

Frame failure unwind 不控制 Render/Data lifecycle。

---

## 16. JSON / Request ID Profile

Frame / Call message 是 exactly one JSON-RPC Request/Response；Runtime Control Application Profile v1 禁止 JSON-RPC Batch。

Request ID：

```text
positive safe integer
1 .. 2^53-1
sender-local
Control-Connection-lifetime no reuse
```

两个方向 namespace 独立；同一 sender 因 Control + Frame 共享 Connection，必须避免跨 domain collision。推荐 connection-wide monotonic allocator；耗尽时不得 wrap/reuse。

Request ID 只做 correlation，不是 operation identity。

Plain JSON model 禁止：

```text
undefined
NaN / ±Infinity
BigInt
Function / Symbol
Date / Map / Set
ArrayBuffer / TypedArray
Blob / File / MessagePort
DOM / Process / Host handle
custom prototype object
unpaired surrogate
duplicate object member
```

整数必须是 safe integer；更大整数用 string。

---

## 17. Frozen Wire Limits

Reference Compact JSON Encoding：validated plain JSON → compact JSON → UTF-8。

```text
max application message              1,048,576 bytes
max JSON container nesting depth     64
max standalone business JsonValue    524,288 bytes
max JsonValue string                 262,144 UTF-8 bytes
max JSON object key                  256 UTF-8 bytes
max array elements                   16,384
max object members                   16,384
frameId                              1..128 UTF-8 bytes
activationId                         1..128 UTF-8 bytes
targetSubsystemKey                   1..256 UTF-8 bytes
FrameFailure.code                    1..128 ASCII chars
FrameFailure.message                 0..4096 UTF-8 bytes
```

`FrameFailure.code`：

```text
^[A-Za-z][A-Za-z0-9._:-]{0,127}$
```

Desktop WebSocket text 同时满足：actual UTF-8 text bytes ≤1MiB 且 reference compact equivalent ≤1MiB。PWA object carrier按 reference compact equivalent 验证。

Conforming sender MUST outbound preflight；malformed/oversize/invalid Response 按 protocol-fatal 处理。

---

## 18. Deadline Profile

七个 Request 的发送角色都必须配置 finite deadline：

```text
1000 <= deadlineMs <= 300000
integer milliseconds
sender-local
stable for one Control Connection
monotonic elapsed-time source
not in RPC params
not negotiated per request
```

Main负责 initialize/activate/suspend/resume/close；Subsystem负责 call/return。双方不要求使用相同数值。

Timeout 继续是 ambiguous → Runtime failure；no retry。

---

## 19. Transport Mapping

### Desktop

```text
localhost WebSocket
one complete text message = one JSON-RPC application message
```

Sender compact JSON；adapter 保持 per-direction order，不 batch/coalesce/duplicate/retry/replay Frame operation。

### PWA

```text
Control MessagePort already established by Host
one postMessage payload = one plain JSON-RPC object
```

Frame v1 不依赖 Transferable；Structured Clone 不能扩大 plain JSON value model。

Control MessagePort 如何创建/转移是 Host implementation，不是 Frame application protocol。

### Transport-independent guarantees

```text
ordered per-direction delivery
one application message per transport unit
no adapter-created duplicate
no adapter retry/replay
connection-loss notification
bidirectional Request/Response
```

Desktop/PWA 对同一 abstract trace MUST 产生相同 Frame authority/outcome/Activation/failure-unwind结果。

---

## 20. Version Binding

`subsystem.hello.protocolVersions` 只协商 Subsystem Control。

Frame / Call v1 不增加：

```text
frame.hello
frame.protocolVersions
frame.version
frame.capabilities
```

Frame version由 Runtime Control Application Profile v1静态绑定。Runtime 声明 `ready` 时必须完整支持其角色所需 Frame v1；不允许部分方法/Batch兼容。

v1 无 minor wire version/downgrade/private compatibility extension。不兼容 method/field/authority/commit/error/unwind/ordering/limit 变化必须新协议版本。

---

## 21. Final Frozen Invariants

1. `loomrealm.frame-call / 1`；
2. Frame/Caller/Stack/Activation/InputTarget authority 属于 Main；
3. lifecycle only `starting/active/suspended/closing/closed`；Outcome独立；
4. frameId/activationId Session unique、never reused；revoked Activation永久失效；
5. exactly seven JSON-RPC Requests；closed schema；
6. call/return Response 先于 dependent reverse RPC；ordinary call不使用 reverse suspend；
7. child-call suspended 可通过对应 Child outcome + fresh `frame.resume` 恢复；administrative suspended 无 generic resume，只能 close/failure cleanup；
8. activate/resume ACK-before-InputTarget publication；
9. post-commit facts不 rollback；accepted outcome不可撤销；
10. Success=known commit；Explicit Error=known no-commit；timeout/loss=ambiguous；
11. no application retry/replay/idempotency journal；
12. Runtime failure按 subsystem key lowest occurrence whole-suffix fixed-point unwind；
13. failed Runtime Frame可 logical retire；healthy doomed Frame best-effort close；
14. accepted outcome preserved；surviving Caller只用 fresh Activation resume；
15. failure unwind不控制 Render/Data lifecycle；
16. Request ID positive safe integer、sender Connection lifetime不复用；
17. plain JSON + Frozen wire limits + finite sender-local monotonic deadlines；
18. Desktop/PWA carrier mapping不得改变 application semantics；
19. Frame v1无独立 handshake/downgrade；
20. 正式兼容判断以主协议 + Conformance Profile 的适用 fixtureSetRevision 为准。
