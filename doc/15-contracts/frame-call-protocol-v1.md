# Main ⇄ Subsystem Frame / Call Protocol v1

> 层级：正式契约  
> 状态：Active / Normative  
> 协议身份：`loomrealm.frame-call`  
> 协议版本：1  
> 稳定程度：Frozen  
> 主要定义：ready Runtime 中 Frame/Input Context 的身份、生命周期、Activation、七方法 wire、调用事务、错误/超时、Runtime failure unwind、limits、Transport binding 与 conformance  
> 依赖：[栈式运行系统](../10-architecture/stack-runtime-system.md)、[模块子系统模型](../10-architecture/subsystem-model.md)、[Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)  
> Conformance：[Frame / Call Protocol v1 Conformance Profile](./frame-call-conformance-v1.md)  
> 决策记录：[ADR 0010：Batch A](../decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)、[ADR 0011：Batch B](../decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)、[ADR 0012：Batch C](../decisions/0012-freeze-frame-call-protocol-v1-batch-c.md)、[ADR 0013：Batch D](../decisions/0013-freeze-frame-call-protocol-v1-batch-d.md)、[ADR 0014：Batch E](../decisions/0014-freeze-frame-call-protocol-v1-batch-e.md)、[ADR 0015：Batch F](../decisions/0015-freeze-frame-call-protocol-v1-batch-f.md)  
> 最近复核：2026-08-05

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

```text
Batch A  Identity / Authority / Lifecycle / Activation       Frozen
Batch B  RPC Wire Schema / Direction / Local Semantics        Frozen
Batch C  Transaction / Commit Barrier / Rollback              Frozen
Batch D  Error / timeout / retry / cancellation               Frozen
Batch E  Runtime failure unwind                                Frozen
Batch F  Limits / conformance / profile / version             Frozen
```

Batch 标签现在只用于设计溯源，不是独立兼容等级。实现只能声明 Frame / Call Protocol v1 compatibility，而不能把“支持 Batch C”当成正式 v1 兼容声明。

Runtime Bootstrap、Subsystem identity、ready/shutdown/stopped/failed 由 [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md) 定义。Frame / Call 不拥有 Render lifecycle、Renderer Data Connection lifecycle 或 User Input payload schema。

---

# Part I · Batch A — Identity / Lifecycle / Activation

## 1. Authority

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

Subsystem 只维护本地 Frame/Input Context，并按 Main 签发的 Activation 校验 ordinary input。Subsystem MUST NOT自行创建公共 frameId、修改 Stack/Caller/Frame→Subsystem assignment、签发 Activation 或改变公共 InputTarget。

Renderer 只镜像 Main 已 commit authority。

建立 Frame 前目标 Runtime MUST 已 `ready` 且没有 Main-owned shutdown intent。Frame / Call MUST NOT启动、restart 或等待 Runtime Bootstrap。

## 2. Frame Identity

`frameId` MUST：

```text
Main-generated
Session-scoped unique
opaque
immutable
never reused within Session
```

每个 Frame 创建时永久绑定 exactly one `descriptor.key`，不得 migrate。

`callerFrameId` 创建时确定且 immutable：

```text
initial Frame  → null
called Frame   → direct caller frameId
```

PID、Worker identity、Connection ID、Render identity、Legacy `systemId` 不得代替 Frame identity。

## 3. Lifecycle

公共 lifecycle only：

```ts
type FrameLifecycleState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";
```

含义：

```text
starting   identity 已分配；Context建立中或等待首次 Activation commit
active     Stack Top；exactly one current Activation；可成为 ordinary InputTarget
suspended  live/在 Stack；无有效 Activation；不能 ordinary call/return/input
closing    terminal cleanup 已开始；无有效 Activation
closed     terminal；不再 live；frameId永不复用
```

允许转换：

```text
starting → active ↔ suspended → closing → closed
active → closing
starting → closing
suspended → closing
```

稳定状态：Stack empty，或 exactly one active Frame且为 Stack Top，lower live Frames全部 suspended。正常 transaction / failure recovery期间 MAY zero active Frame，但 MUST NOT 有两个 ordinary InputTargets。

v1 不定义 `Frame ready / Frame initialized / frame.ready / frame.status`，也不把 `completed/cancelled/failed` 当 lifecycle state。

## 4. Activation

Activation 表示 Frame 一次 ordinary-input有效 epoch。

`activationId` MUST：Main-generated、Session unique、opaque、immutable、never reused。

```text
starting    currentActivationId = null
active      currentActivationId = exactly one valid activationId
suspended   currentActivationId = null
closing     currentActivationId = null
closed      currentActivationId = null
```

首次 active 与每次 suspended Frame重新获得控制权都使用 fresh Activation。

```text
Activation never rolls back.
Activation never resumes.
Revoked Activation never becomes valid again.
```

ordinary input合法至少要求：Frame exists + state=`active` + activationId=current + Frame=Main-authorized InputTarget。

## 5. Outcome / Runtime / Render Independence

Outcome only：

```text
completed
cancelled
failed
```

Outcome描述调用如何结束；lifecycle描述 Frame control object是否 live。即使 outcome=`failed`，cleanup仍通过 `closing → closed`。

以下不是公共推导：

```text
Frame active    → Render visible
Frame suspend   → Render hidden/frozen
Frame close     → Render destroyed
Frame create    → Data Connection create
Frame close     → Data Connection close
```

Frame lifecycle不启动/停止/restart Runtime，也不能代替 `subsystem.shutdown`。

---

# Part II · Batch B — Wire Schema

## 6. Exact Method Surface

Frame / Call v1 复用已经通过 `subsystem.hello` 认证的 Main ⇄ Subsystem Control Connection，application protocol 使用 JSON-RPC 2.0。

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

v1 没有：

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
frame.render.*
```

## 7. JsonValue / Closed Schema

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
```

RPC params/results、`FrameOutcome`、`FrameFailure`、Frozen semantic error data 均是 closed schema；不存在开放式 `metadata/context/extensions/extra` bag。

结构错误使用 `-32602 Invalid params`。业务 input rejection不得滥用 `-32602`。

## 8. FrameOutcome

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

`completed.value` REQUIRED；无业务返回值显式 `null`。`FrameOutcome.failed` 是 terminal call outcome，不是 JSON-RPC Error。

## 9. `frame.initialize`

```ts
interface FrameInitializeParams {
  readonly frameId: string;
  readonly input: JsonValue;
}
interface FrameInitializeResult {}
```

Success = target Subsystem已建立 Frame/Input Context；Main公共 state仍 `starting`，无 Activation/InputTarget。

MUST NOT携带 `callerFrameId` 或 source subsystem identity。

## 10. `frame.activate`

```ts
interface FrameActivateParams {
  readonly frameId: string;
  readonly activationId: string;
}
interface FrameActivateResult {}
```

只用于首次 `starting → active`。恢复 suspended Frame MUST 用 `frame.resume`。

## 11. `frame.suspend`

```ts
interface FrameSuspendParams {
  readonly frameId: string;
  readonly activationId: string;
}
interface FrameSuspendResult {}
```

Success = target Subsystem永久 reject/revoke该 ordinary-input epoch。

ordinary caller-initiated `frame.call` 不依赖 `frame.suspend`；该方法只作为 Main 主动 quiesce/control primitive。

## 12. `frame.resume`

```ts
interface FrameResumeParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly returnedFrameId: string;
  readonly result: FrameOutcome;
}
interface FrameResumeResult {}
```

Subsystem MUST 把“交付 Child outcome + 安装 replacement Activation”作为一个不可分割的局部操作。

## 13. `frame.close`

```ts
interface FrameCloseParams {
  readonly frameId: string;
}
interface FrameCloseResult {}
```

Success = target Frame/Input Context已删除。无 `reason/outcome/callerFrameId/activationId/subsystemKey`。

不隐式停止 Runtime、销毁 Render、关闭 Data Connection 或删除共享 business state。

## 14. `frame.call`

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

Main验证 authenticated source ownership、active Stack Top、current Activation、target declared + Runtime ready/no-shutdown-intent。

same-Subsystem / recursive call合法，但必须 new `childFrameId`。`frame.call`只建立 Child call，不等待最终业务结果。

## 15. `frame.return`

```ts
interface FrameReturnParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly result: FrameOutcome;
}
interface FrameReturnResult {}
```

Main验证 source ownership、active Stack Top、current Activation。Receiver由 Main-owned caller relationship决定。

最终结果只沿：

```text
Child frame.return(result)
→ Main
→ Caller frame.resume(returnedFrameId,result,freshActivation)
```

---

# Part III · Batch C — Transaction / Commit Barrier

## 16. Stack Mutation Serialization

Main MUST 对单一 Stack 的 commit-sensitive mutation串行执行。Normal transaction与 Batch E failure unwind共享同一 serialization authority。

## 17. RPC Commit Evidence

```text
Success Response       → local postcondition known committed
Explicit Error Response→ local postcondition known not committed
```

对应：

```text
initialize Error → no committed target Context
activate Error   → new Activation not installed
suspend Error    → requested revoke not committed
resume Error     → outcome delivery + replacement Activation not committed
close Error      → Context not confirmed deleted
```

Explicit Error=no-commit evidence不代表 Runtime一定 healthy；Batch D继续分类。

Timeout/loss导致 applied/not-applied unknown属于 ambiguous。

## 18. Sender Mutation Gate

Subsystem发出 `frame.call` / `frame.return` 后直到 terminal Response前 MUST 建立内部 mutation gate：停止新 ordinary input dispatch，禁止第二个 call/return。

只有明确 recoverable pre-commit Error才释放 gate继续当前 Activation。Fatal Error或 ambiguous不释放回正常处理。

## 19. No Nested Reverse Request Requirement

v1 MUST NOT依赖：

```text
Subsystem → Main Request pending
while Main → same Subsystem Request and waits Response
```

Main MUST：

```text
complete frame.call Response before dependent Child initialize/activate
complete frame.return Response before dependent close/resume
```

因此 same-Subsystem recursion不要求 nested request-handler reentrancy。

## 20. Initial Frame

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

`FRAME_INITIALIZE_REJECTED` 表示 Context absent + Runtime healthy；initial business failure由 higher-level Session/bootstrap处理。

initialize/activate timeout/divergence/protocol error → Runtime failure；不得假设可以普通 close局部修复。

## 21. Call Acceptance

稳定起点：F1/A1 active Stack Top/InputTarget。

合法 `frame.call(F1,A1,target,input)` preconditions通过后，Main原子 commit：

```text
revoke F1/A1
F1 → suspended / currentActivation=null
allocate F2 starting, subsystemKey=target, callerFrameId=F1
push F2
InputTarget=null
```

然后返回 `{ childFrameId:F2 }`。

`frame.call Success` = logical Child accepted + Caller suspension/Child identity committed；不等于 Child initialized/active/InputTarget published。

Main MUST完成 call Response后才发送：

```text
frame.initialize(F2,input) → ACK
A2=fresh
frame.activate(F2,A2) → ACK
→ commit F2 active/A2
→ publish InputTarget F2/A2
```

Call acceptance后 F1/A1 永不恢复。Child activation ACK前 `InputTarget=null` 合法。

Post-accept `FRAME_INITIALIZE_REJECTED` → healthy Child failed outcome + fresh Caller resume；fatal/ambiguous → Batch E unwind。

## 22. Return Acceptance

稳定起点：F2/A2 active Stack Top/InputTarget。

合法 `frame.return(F2,A2,result)` 被 Main原子 commit：

```text
F2.outcome=result
revoke A2
F2.currentActivationId=null
F2→closing
InputTarget=null
```

然后 Main返回 `{}`。

`frame.return Success` = terminal outcome accepted + old Activation revoked + cleanup begun；不等于 F2 closed/popped或 Caller resumed。

Runtime healthy时：

```text
frame.close(F2) → ACK
→ F2 closed/pop
A3=fresh
frame.resume(F1,A3,F2,F2.outcome) → ACK
→ F1 active/A3
→ publish F1/A3
```

normal `close ACK` happens-before pop；`resume ACK` happens-before replacement InputTarget publication。

Accepted outcome不可撤销；revoked Activation不可恢复。

## 23. Transaction Principle

```text
Pre-commit recoverable failure → abort allowed
Post-commit facts             → never rollback
Runtime-fatal failure         → no local resync/retry → Batch E
```

Renderer Control MAY coalesce transitional revisions，但 MUST 保持：未 ACK Activation不发布、revoked不重新发布、`InputTarget=null`合法、never two ordinary InputTargets。

---

# Part IV · Batch D — Error / Timeout / No Retry

## 24. Request Result Classification

```text
Success Response
    → known committed

Explicit Error Response
    → known not committed

Timeout / Response loss / pending-request connection loss
    → applied/not-applied unknown
    → ambiguous
```

Ambiguous MUST NOT被猜测或降级成 recoverable Error。

## 25. Finite Deadline / No Retry

全部七个 Frame Request MUST有 finite deadline。Batch F定义 sender-role profile limits。

v1 MUST NOT对 state-changing Frame operation做 application retry/replay/reconnect replay；无 `operationId/idempotencyKey/dedup journal/replay cache`。

Late Response在 failure commit后只用于 diagnostics，不恢复 Runtime/Frame/Activation，也不撤销 accepted outcome。

## 26. Semantic Error Envelope

LoomRealm semantic error：

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

`FRAME_INITIALIZE_REJECTED` = valid business rejection；Context未 commit；Runtime remains healthy；携带 `FrameFailure`。

Control divergence：

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
```

Divergence使相关 Runtime进入 terminal failure path。

标准 `-32700/-32600/-32601/-32602/-32603` 在 Frozen Frame surface上表示 protocol/control implementation failure，不是业务失败。

Runtime diagnostics至少：

```text
FRAME_CONTROL_TIMEOUT
FRAME_CONTROL_DIVERGENCE
FRAME_CONTROL_PROTOCOL_ERROR
```

## 27. Ambiguous Sender Behavior

Main→Subsystem lifecycle RPC ambiguous：Main停止向该 Runtime发新的正常 Frame operation、no retry、Runtime failed。

Subsystem→Main `frame.call/frame.return` ambiguous：Subsystem保持 mutation gate、停止 ordinary input和正常 Frame operation、不得继续旧 Activation，并进入 Runtime failure path；Control仍可用时 SHOULD report `subsystem.status(failed)`。

## 28. Cancellation

v1 无 caller-driven `frame.cancel`。

`FrameOutcome.cancelled` 只表示当前 active Frame自己 `frame.return({result:{type:"cancelled"}})`。Session termination使用更高层 lifecycle。

---

# Part V · Batch E — Runtime Failure Unwind

## 29. Failure Set / Root

Runtime failure以 `descriptor.key` 为单位。

Main在一次 recovery transaction维护：

```ts
failedRuntimeKeys: Set<string>
```

unwind root = 当前 live Stack中最下面/最老的 `subsystemKey ∈ failedRuntimeKeys` Frame。

```text
root..top = affected/doomed suffix
```

同 Runtime多次出现在 Stack 时取最低 occurrence；不能只删除同 key Frame，也不能只从最近 occurrence开始。

## 30. Failure Unwind Barrier

Recovery与 normal transaction共享 Stack serialization。

Barrier后：

```text
no new normal call/return from doomed suffix
clear affected InputTarget
no new doomed Activation publication
failed Runtime gets no normal Frame RPC
```

只承认 Main已经 commit的 transaction facts。

## 31. Top→Bottom Cleanup

Affected suffix MUST LIFO Top→Bottom cleanup。Intermediate doomed Frame不逐层 normal resume。

### Failed Runtime Frame

如果 Frame所属 Runtime ∈ failedRuntimeKeys：

```text
DO NOT send activate/suspend/resume/close
revoke public authority
→ closing
→ closed
→ remove from live Stack
```

这是 normal close ACK-before-pop 的明确 failure-path exception。`closed` 表示 Main不再持有 live Frame authority，不表示远端 Context物理确认释放。

### Healthy Doomed Frame

Main先 revoke公共 ordinary-input authority并令 Frame进入 `closing`：

- initialize明确未 commit → Context absent，无 close；
- Context确定存在 → 发送一次 `frame.close`；
- close已经 pending → 使用既有 Request结果，不 duplicate；
- 不额外要求 suspend-before-close。

close ACK后正常确认 Context删除并 pop。

## 32. Fixed-point Expansion

Healthy cleanup/pending RPC若 timeout/loss/diverge/protocol-fail/Runtime exit：

```text
failedRuntimeKeys += key
→ 从整个 live Stack重新计算 lowest root
```

新 failed Runtime若在旧 root更下方有 Frame，root向下移动。重复直到 fixed point。

No retry/replay/resync/new recovery RPC。

## 33. Pending RPC During Barrier

目标 Runtime已 failed：late Response diagnostic-only。

目标 Runtime healthy但 Frame doomed：既有 Request按原 deadline处理一次，不重发。

Success只用于 remote context knowledge，不重新发布 doomed Activation。`FRAME_INITIALIZE_REJECTED`=Context absent。fatal/ambiguous→该 Runtime加入 failed set。

Barrier后才收到 `activate/resume Success` 时，对应 Activation视为已消耗但不得发布/reuse。

## 34. Outcome Preservation / Root Outcome

Return Acceptance 已 commit 的 `completed/cancelled/failed` outcome MUST survive Runtime crash/Control failure/close failure/unwind。

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

Runtime diagnostic code/subsystemKey/PID/exit code/timeout duration不要求进入 Caller-visible `FrameFailure.data`。

## 35. Surviving Caller

Suffix cleanup后 final root下方若有 direct Caller，且 Session intends to continue、Caller Runtime healthy/ready/no-shutdown-intent：

```text
Anew=fresh activationId
frame.resume(Caller,Anew,root.frameId,rootOutcome) → ACK
→ Caller active/Anew
→ publish InputTarget
```

Recovery resume failure → Caller Runtime加入 failed set → recompute root。

最终只允许：healthy Caller resume成功，或 Stack empty/InputTarget=null。

Initial root无 Caller resume。Failed Runtime无 live Frame时 Batch E不自动修改当前 Stack。Session termination intent优先时不为继续游戏而强制 resume。

Frame failure unwind不控制 Render/Data lifecycle。

---

# Part VI · Batch F — Limits / Conformance / Profile / Version

## 36. Protocol Completion

Batch F 不修改 Part I-V语义，只冻结可互操作边界。

正式 identity：

```text
protocol = loomrealm.frame-call
version = 1
```

Batch A-F 不作为运行时版本号或 capability bit。

## 37. JSON-RPC Application Profile

每个 Control Transport application unit MUST承载 exactly one JSON-RPC Request或Response。

Frame / Call v1 MUST NOT使用 JSON-RPC Batch Array，也不定义 Frame Notification。

Frame v1 Request envelope只能依赖标准 JSON-RPC成员：`jsonrpc/id/method/params`；Response只能依赖 `jsonrpc/id/result` 或 `jsonrpc/id/error`，其中 error遵守 JSON-RPC标准结构与本协议冻结的 semantic data。非标准 top-level成员不得改变 Frame v1语义；正式 conformance sender不得通过它们扩展协议。

### Request ID

所有 outbound JSON-RPC Request在一条承载 Frame / Call v1 的 Control Connection上遵守：

```text
ID type  = positive integer
range    = 1 .. 9,007,199,254,740,991 (2^53-1)
```

不得使用 `null/0/negative/fraction/string`。

同一发送方在同一 Connection 生命周期内 MUST NOT复用 outbound Request ID，即使旧 Request已经 Success/Error/Timeout。两个方向的 sender-local ID namespace独立；Main和Subsystem MAY同时使用相同数值。

因为 Subsystem Control与Frame / Call共享 Connection，同一发送方还 MUST 避免跨协议域 pending ID collision；SHOULD 使用 connection-wide monotonic allocator。

如果 allocator耗尽，MUST NOT wrap/reuse旧 ID；实现必须终止/替换该 Connection或进入明确 failure path。

Request ID只做 correlation，不是 operation identity/idempotency key。

## 38. JSON Interoperability Model

所有 value MUST是 plain JSON-compatible value。

禁止：

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
```

Decoded string MUST是合法 Unicode scalar sequence，不允许 unpaired surrogate。String比较不做 Unicode normalization、case folding或 locale comparison；`targetSubsystemKey`继续与 Descriptor key逐字符精确比较。

JSON text中的 duplicate object member name MUST视为 protocol-invalid；PWA object同样不得通过转换制造等价歧义。

### Number

`JsonValue.number` = finite IEEE-754 binary64。

若数值是整数，则 MUST属于 JavaScript safe integer：

```text
-9,007,199,254,740,991 .. +9,007,199,254,740,991
```

更大整数必须作为 string传输。Negative zero在 reference encoding中规范为 `0`。

## 39. Reference Compact JSON Encoding / Carrier Size

定义 Reference Compact JSON Encoding：

```text
validated plain JSON value
→ compact JSON serialization
→ no BOM / no insignificant whitespace
→ UTF-8
```

它用于：

- standalone business `JsonValue` byte size；
- PWA MessagePort 等非文本 carrier 的 whole-message equivalent size；
- transport-independent conformance fixture。

Conforming Desktop Frame sender MUST发送 compact JSON text。

Desktop/WebSocket receiver MUST在完整 JSON materialization前或过程中对**实际完整 text message 的 UTF-8 encoded bytes**执行 `<=1 MiB`硬限制。即使去掉 insignificant whitespace后 compact equivalent低于1 MiB，只要实际 text message超过1 MiB也必须拒绝。

因此 Desktop text message同时必须满足：

```text
actual UTF-8 text bytes       <= 1 MiB
reference compact equivalent  <= 1 MiB
```

PWA MessagePort没有原始 JSON text bytes，因此 whole-message size按 reference compact equivalent验证。

JSON container nesting depth：root JSON-RPC object depth=`1`；每进入一个 array/object增加 `1`；scalar不增加 depth。

## 40. Frozen Wire Limits

```text
max application message              1,048,576 bytes (1 MiB)
max JSON container nesting depth     64
max standalone business JsonValue    524,288 bytes (512 KiB)
max JsonValue string                 262,144 UTF-8 bytes (256 KiB)
max JSON object key                  256 UTF-8 bytes
max array elements                   16,384
max object members                   16,384
frameId                              1..128 UTF-8 bytes
activationId                         1..128 UTF-8 bytes
targetSubsystemKey                   1..256 UTF-8 bytes
FrameFailure.code                    1..128 ASCII chars
FrameFailure.message                 0..4096 UTF-8 bytes
```

Whole-message 1 MiB limit按 §39 carrier规则执行。

每个独立 business payload受 512 KiB reference-compact limit：

```text
frame.initialize.input
frame.call.input
FrameOutcome.completed.value
FrameFailure.data
FRAME_INITIALIZE_REJECTED.failure.data
```

`FrameFailure.code` MUST匹配：

```text
^[A-Za-z][A-Za-z0-9._:-]{0,127}$
```

平台保留 code（如 `SUBSYSTEM_RUNTIME_FAILED`）保持其 Frozen语义；普通业务 code不需要全局注册。

运行在 Frame / Call v1 profile下的 `descriptor.key` MUST可表示为 `targetSubsystemKey`，即 `1..256 UTF-8 bytes`。Host/Game Package profile validation MUST在任何依赖该 key 的 Frame operation前拒绝不满足约束的 package/runtime deployment；该约束不新增 Frame RPC business error。

## 41. Outbound Preflight / Invalid Wire

Conforming Main和Subsystem SDK MUST在发送前验证自己生成的 Frame message，包括 schema、JSON model、ID与limits。

如果 Request envelope可安全解析但 params违反 Frozen field/JsonValue limit，接收方使用 `-32602 Invalid params`，并按 Batch D protocol-fatal处理。

如果 application message actual carrier size超限、reference equivalent超限、JSON invalid、Unicode invalid、duplicate member、Batch Array或其他情况使安全解析/Request correlation不可保证，receiver MAY直接关闭 Control Connection并进入 `FRAME_CONTROL_PROTOCOL_ERROR` failure path。

Invalid Response（id/result/error/schema/limit不合法）不能再回复 Error：request owner直接进入 protocol-fatal Runtime failure path。

## 42. Deadline Profile v1

七个 Frame Request 都必须由其**发送角色**使用 finite deadline：

```text
Main outbound
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close

Subsystem outbound
    frame.call
    frame.return
```

每个适用方法的 deadline MUST是整数毫秒：

```text
1,000 <= value <= 300,000
```

每个 endpoint在首次发送其 Frame Request前确定自己的 outbound deadline policy；该 Connection生命周期内保持稳定。

实现 MAY 使用统一的完整七字段配置结构：

```ts
interface FrameCallDeadlineProfileV1 {
  readonly initializeMs: number;
  readonly activateMs: number;
  readonly suspendMs: number;
  readonly resumeMs: number;
  readonly closeMs: number;
  readonly callMs: number;
  readonly returnMs: number;
}
```

但该完整结构是实现便利，不表示 Main MUST配置其不会发送的 `call/return`，也不表示 Subsystem MUST配置其不会发送的五个 Main→Subsystem方法。

Deadline是 sender-local policy：

```text
不进入 RPC params
不由 Game Package / business input覆盖
不做 per-request negotiation
Main与Subsystem不要求使用相同数值
```

计时 MUST使用 monotonic elapsed-time source；从 Request被本地 Control Transport adapter接受发送开始，到 schema-valid、id-matching terminal Response被接受为止。

Deadline超时继续严格执行 Batch D：ambiguous → Runtime failure；no retry。

Conformance timeout tests SHOULD使用 virtual/injectable monotonic clock，不依赖真实长 sleep。

## 43. Desktop WebSocket Binding

Desktop：

```text
Transport    localhost WebSocket
Application  JSON-RPC 2.0
```

One complete WebSocket **text message** = exactly one JSON-RPC application message。底层 WebSocket fragmentation不改变 application message边界。

Frame / Call application message MUST NOT依赖 binary WebSocket message。

Sender MUST产生 compact JSON text；receiver MUST执行 §39 actual UTF-8 text hard cap 与 reference semantic limits。

Adapter MUST保持 per-direction order，不得 batch/coalesce/duplicate/retry/replay Frame operation。

## 44. PWA MessagePort Binding

PWA Bootstrap Credential / Worker creation / Control MessagePort establishment属于独立 PWA Control Profile；Frame / Call v1只冻结 Connection建立后的 application mapping。

One `postMessage` payload = exactly one JSON-RPC application message object。

Payload MUST是 plain JSON-compatible object，Frame / Call MUST NOT依赖 Transferable；不得通过 Structured Clone传输 BigInt、ArrayBuffer、MessagePort、Blob等非 JSON capability。

PWA adapter MUST在发送和接收时执行同一 Frame JSON/schema/limit validator，并使用 Reference Compact JSON Encoding计算 whole-message equivalent size。

## 45. Transport-independent Semantics

Control Transport至少提供：

```text
ordered per-direction delivery
one application message per transport unit
no adapter-created duplicate
no adapter application retry/replay
connection-loss notification to Runtime authority
bidirectional Request/Response
```

不要求两个方向之间存在 global total order。

Desktop WebSocket 与 PWA MessagePort 对同一 abstract input/fault trace MUST产生相同 Frame authority state、outcome、Activation和failure-unwind结果。Platform差异只能存在于 carrier/bootstrap/lifecycle integration。

## 46. Version Binding

`subsystem.hello.protocolVersions`继续只协商 **Subsystem Control Protocol**。Frame / Call v1 MUST NOT增加：

```text
frame.hello
frame.protocolVersions
frame.version
frame.capabilities
```

Frame version由 Host/runtime deployment Profile静态绑定，而不是在当前 Connection上单独协商。

在声明参与 Frame / Call v1 的 Runtime Profile中，Runtime进入 `ready`表示它完整支持自己角色所需的 Frame / Call v1，不允许“ready但只实现部分方法/Batch”。

v1没有 Frame version downgrade。若实际 implementation出现 method/schema/profile mismatch，按 Batch D `FRAME_CONTROL_PROTOCOL_ERROR`处理。

未来 Frame / Call v2若需要动态协商，必须通过新的 enclosing Profile或新的 Subsystem Control handshake version显式引入；不得改变 v1 hello语义。

## 47. No Minor Wire Version / Extension Rule

v1没有 `1.1/1.2` wire compatibility层。

不兼容改变（method/field/ownership/commit/error/unwind/ordering/limit semantics）需要未来明确新版本。

Closed schema继续有效：实现不得给现有 v1 method私加 `metadata/version/retry/cancel/capability` 字段。

纯文档澄清、bug fix、或增加验证现有语义的 conformance fixture可以保持 protocolVersion=1。

## 48. Conformance

[Frame / Call Protocol v1 Conformance Profile](./frame-call-conformance-v1.md) 是本协议的 Normative Conformance companion。

它冻结：fixture format、normalized state、fault vocabulary、A-F required fixture catalog、Desktop/PWA equivalence与正式 conformance claim规则。

Fixture coverage revision MAY增长而不改变 protocol version，只要新增 fixture只验证现有 Frozen v1行为。

正式 conformance report MUST记录 tested `fixtureSetRevision`。较旧 corpus的 pass不能自动视为通过较新 revision。

正式兼容声明只能是完整角色 conformance；不允许“v1 except recovery / Batch C compatible / v1 with custom retry”等部分兼容声明。

---

# 49. Final Frozen Invariants

Frame / Call Protocol v1 最终不变量：

1. Protocol identity=`loomrealm.frame-call`，version=`1`；
2. Frame/Caller/Stack/Activation/InputTarget authority属于 Main；
3. lifecycle只有 `starting/active/suspended/closing/closed`；
4. outcome与 lifecycle分离；
5. frameId/activationId Session unique、never reused；revoked Activation永不恢复；
6. exactly seven JSON-RPC Requests；
7. Caller不在 Frame wire；无 close reason / frame.result / frame.cancel / abort / unwind；
8. call/return Response先于 dependent reverse RPC；ordinary call不使用 reverse suspend；
9. activate/resume ACK先于 InputTarget publication；
10. post-commit facts不 rollback；accepted outcome不可撤销；
11. Success=known commit；Explicit Error=known no-commit；timeout/loss=ambiguous；
12. no application retry/replay/idempotency journal；
13. recoverable rejection与 Runtime-fatal divergence/protocol error分离；
14. Runtime failure按 subsystem key + lowest occurrence whole-suffix unwind；
15. failed Runtime Frame可 logical retire；healthy descendant best-effort close；
16. cleanup failure fixed-point扩展 failed set/root；
17. root无 accepted outcome使用 `SUBSYSTEM_RUNTIME_FAILED`；surviving Caller只 fresh-resume；
18. Frame unwind不控制 Runtime/Render/Data lifecycle；
19. no JSON-RPC Batch；Request ID=positive safe integer且 sender-side Connection lifetime不复用/不wrap；
20. plain JSON model；finite binary64 number；valid Unicode scalar strings；
21. text carrier actual byte hard cap + reference compact semantic size；depth/business-payload/identity/failure字段服从 Frozen limits；
22. 每个发送角色的 Frame方法 deadline均 `1s..5min` sender-local monotonic policy；
23. Desktop one WebSocket text message = one RPC；PWA one plain JSON `postMessage` object = one RPC；
24. PWA Structured Clone不能扩大 Frame value model；
25. Desktop/PWA必须保持相同 Frame semantic trace；
26. `subsystem.hello.protocolVersions`仍只协商 Subsystem Control；Frame v1无独立 handshake/downgrade；
27. closed schema不允许私有兼容扩展改变 v1 semantics；
28. Conformance Profile + tested fixtureSetRevision是正式兼容判断依据；
29. Batch A-F只是历史溯源，不是独立兼容版本；
30. 整个 Frame / Call Protocol v1 = Active / Normative / Frozen。

## 50. 后续协议域

Frame / Call v1 完成后不再存在 Batch G。后续独立协议工作：

```text
Main ⇄ Renderer Control
Renderer ⇄ Subsystem Connection
User Input
Render Update
Render State
```

任何未来不兼容 Frame / Call改变进入新的协议版本，而不是静默修改 v1。
