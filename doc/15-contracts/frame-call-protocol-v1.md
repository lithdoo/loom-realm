# Main ⇄ Subsystem Frame / Call Protocol v1

> 层级：正式契约  
> 状态：Active / Normative / Frozen  
> 协议身份：`loomrealm.frame-call`  
> 协议版本：1  
> 主要定义：Frame identity/lifecycle、Activation、七方法 wire、调用事务、错误/超时、Runtime failure unwind、limits 与 Transport mapping  
> 依赖：[Subsystem Control v1](./subsystem-control-protocol-v1.md)、[栈式运行系统](../10-architecture/stack-runtime-system.md)  
> 组合 Profile：[Runtime Control Application Profile v1](./runtime-control-profile-v1.md)  
> Conformance：[Frame / Call v1 Conformance](./frame-call-conformance-v1.md)  
> 决策记录：[ADR 0010](../decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)–[ADR 0015](../decisions/0015-freeze-frame-call-protocol-v1-batch-f.md)、[ADR 0018](../decisions/0018-preimplementation-v1-closure.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)  
> 最近复核：2026-08-21

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

> **Main 是 Frame / Stack / Activation / InputTarget 的唯一公共 authority。Frame mutation 使用 commit barrier；已提交事实不回滚。Timeout/loss 对 state-changing Request 是 ambiguous，因此进入 Runtime failure，而不是 retry/resync。**

> [!IMPORTANT]
> 首次 conformant implementation 前的 current-v1 corrections：ADR 0018 将 PWA Control carrier 收口为 `postMessage(string)`；ADR 0021 进一步把 same-sender Request ID 收紧为 strict monotonic，并使 source-level duplicate JSON member semantics 与 frozen Wire / ECMAScript `JSON.parse` 对齐。七方法、schema、Frame authority、transaction/commit、Outcome、error recoverability、deadline range与 failure unwind semantics均不改变。

---

## 1. Authority / Identity

Main 唯一拥有：

```text
frameId
Frame → subsystemKey
callerFrameId
Frame lifecycle
Frame Stack
terminal outcome
current activationId
ordinary Input eligibility
InputTarget
```

Subsystem只维护 local Frame/Input Context，不得创建公共 Frame、修改 Stack/Caller、签发 Activation或改变 InputTarget。

`frameId` / `activationId`：

```text
Main-generated
Session-scoped unique
opaque
immutable
never reused
```

Frame创建时永久绑定 exactly one `descriptor.key`；`callerFrameId`创建后 immutable：initial Frame = `null`，called Frame = direct caller。

PID、Worker、Connection、Render identity不得代替 Frame identity。

---

## 2. Lifecycle / Outcome

```ts
type FrameLifecycleState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";
```

```text
starting   identity allocated; Context建立中/等待首次 Activation
active     Stack Top; exactly one current Activation; may be InputTarget
suspended  live; no valid Activation; no ordinary call/return/input
closing    terminal cleanup started; no valid Activation
closed     terminal; frameId never reused
```

允许：

```text
starting → active
starting → closing
active → suspended
active → closing
suspended → active      only child-call + valid frame.resume
suspended → closing
closing → closed
```

稳定状态：Stack empty，或 exactly one active Frame且为 Top；lower live Frames全部 suspended。Transaction/recovery MAY暂时 zero active，但 MUST NOT有两个 ordinary InputTargets。

Outcome：

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

Frame lifecycle不拥有 Runtime/Render/Data lifecycle。

---

## 3. Activation

Activation是一轮 ordinary-input / ordinary call-return authority epoch。

```text
starting    currentActivationId = null
active      exactly one current activationId
suspended   null
closing     null
closed      null
```

首次 active和每次合法 child-call resume都使用 fresh Activation。

```text
Activation never rolls back.
Activation never resumes.
Revoked Activation never becomes valid again.
```

ordinary input至少要求：Frame exists + active + activation current + Main current InputTarget指向该 Frame/Activation。

---

## 4. Suspension Semantics

Main-private provenance：

```ts
type SuspensionCauseV1 =
  | "child-call"
  | "administrative";
```

不进入 wire。

### 4.1 Child-call

合法 `frame.call` accept：

```text
Caller active/A1
→ revoke A1
→ Caller suspended(child-call)
→ Child starting/pushed
```

Child terminal cleanup后 Caller MAY通过对应 Child outcome + fresh Activation 的 `frame.resume`恢复。

### 4.2 Administrative

成功 `frame.suspend(F,A)`：

```text
A permanently revoked
F suspended(administrative)
ordinary input disabled
```

v1无 generic reactivation。后续只：

```text
suspended → closing → closed
```

或 Runtime failure cleanup。

不得伪造 Child/outcome调用 resume；不得复用旧 Activation。

### 4.3 Ordinary call does not send reverse suspend

`frame.call` acceptance本身就是 caller suspension commit；Main MUST NOT为 ordinary call再向同一 Subsystem发送 `frame.suspend`。

---

## 5. Exact Wire Surface

Frame / Call复用已完成 `subsystem.hello` 的 Runtime Control Connection，使用 JSON-RPC 2.0。

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

全部是 Request；`params` MUST是 JSON Object。

不存在：

```text
system.call/system.return
frame.ready/frame.status/frame.result
frame.cancel/frame.abort/frame.unwind/frame.sync/frame.ping/frame.reactivate
```

params/results/Outcome/Failure/error data均 closed schema；结构错误 `-32602 Invalid params`。

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

Success = Subsystem已建立 Frame/Input Context；Main public state仍 starting，无 Activation/InputTarget。

### `frame.activate`

```ts
interface FrameActivateParams {
  readonly frameId: string;
  readonly activationId: string;
}
interface FrameActivateResult {}
```

只用于首次 `starting → active`；不能恢复 suspended Frame。

### `frame.suspend`

```ts
interface FrameSuspendParams {
  readonly frameId: string;
  readonly activationId: string;
}
interface FrameSuspendResult {}
```

Success = target Subsystem已永久 revoke该 ordinary-input epoch并进入 administrative suspended local context。

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

只用于 child-call suspension。Subsystem MUST把“交付 Child outcome + 安装 fresh replacement Activation”作为不可分割 local operation。

### `frame.close`

```ts
interface FrameCloseParams {
  readonly frameId: string;
}
interface FrameCloseResult {}
```

Success = target Frame/Input Context已删除；不停止 Runtime、不删除 Render、不关闭 Data Connection。

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

Main验证 authenticated source ownership、active Top/current Activation、target declared + Runtime ready/no-shutdown-intent。

same-Subsystem recursion合法，但 childFrameId fresh。Success只表示 call accepted，不等待 Child business outcome。

### `frame.return`

```ts
interface FrameReturnParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly result: FrameOutcome;
}
interface FrameReturnResult {}
```

Main验证 source ownership、active Top/current Activation。

Outcome只沿：

```text
Child frame.return(result)
→ Main
→ Caller frame.resume(returnedFrameId,result,freshActivation)
```

---

## 7. Commit Evidence / Mutation Gate

```text
Success Response        → local postcondition known committed
Explicit Error Response → local postcondition known not committed when classified recoverable
Timeout/loss            → applied/not-applied unknown → ambiguous
```

Subsystem发出 `frame.call` / `frame.return` 后直到 terminal Response前 MUST：

```text
stop new ordinary input dispatch
block second call/return
```

只有明确 recoverable pre-commit Error才释放 gate继续 current Activation。Fatal/ambiguous不恢复旧 Activation。

Runtime Control package MAY enforce protocol-side single pending call/return mutation；ordinary input dispatch gate仍由 Subsystem Host/SDK实现。

Main对单一 Stack的 commit-sensitive mutation MUST串行；normal transaction与 failure unwind共享 serialization authority。

---

## 8. Response-before-dependent-RPC

Main MUST NOT依赖：

```text
Subsystem → Main Request pending
while Main → same Subsystem dependent Request and waits
```

Main MUST：

```text
complete frame.call Success/Error Response send acceptance before Child initialize/activate
complete frame.return Success/Error Response send acceptance before close/resume
```

Runtime Control Profile提供 Response causal barrier；Main仍拥有 call/return application commit。

same-Subsystem recursion不要求 nested reverse-request reentrancy。

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

activate ACK happens-before InputTarget publication。

`FRAME_INITIALIZE_REJECTED` = Context absent + Runtime healthy。initialize/activate timeout/divergence/protocol error → Runtime failure。

---

## 10. Call Acceptance Transaction

起点：F1/A1 active Top/InputTarget。

合法 call被 Main原子 accept：

```text
revoke F1/A1
F1 → suspended(child-call)
F1.currentActivationId=null
allocate F2 starting, subsystemKey=target, callerFrameId=F1
push F2
InputTarget=null
```

Main完成 `{childFrameId:F2}` Response send barrier 后才：

```text
frame.initialize(F2,input) → ACK
A2=fresh
frame.activate(F2,A2) → ACK
→ F2 active/A2
→ publish InputTarget F2/A2
```

Call acceptance后 F1/A1永不恢复。

Post-accept `FRAME_INITIALIZE_REJECTED` → healthy Child failed outcome + fresh Caller resume；fatal/ambiguous → Runtime failure unwind。

---

## 11. Return Acceptance Transaction

起点：F2/A2 active Top。

合法 return被 Main原子 accept：

```text
F2.outcome=result
revoke A2
F2.currentActivationId=null
F2→closing
InputTarget=null
```

Main先完成 `{}` Response send barrier，之后 healthy path：

```text
frame.close(F2) → ACK
→ F2 closed/pop
A3=fresh
frame.resume(F1,A3,F2,F2.outcome) → ACK
→ F1 active/A3
→ publish InputTarget F1/A3
```

close ACK happens-before pop；resume ACK happens-before replacement InputTarget publication。

Accepted outcome不可撤销；revoked Activation不可恢复。

---

## 12. Explicit Administrative Suspend

```text
frame.suspend(F,A) → ACK
```

ACK后 commit：

```text
revoke A permanently
F.currentActivationId=null
F→suspended(administrative)
InputTarget cannot reference F/A
```

无 normal resume；后续 close/failure cleanup。

Success known committed；Explicit Error known no-commit；timeout/loss ambiguous→Runtime failure；no retry。

---

## 13. Transaction Principle

```text
Pre-commit recoverable failure → abort allowed
Post-commit facts              → never rollback
Runtime-fatal failure          → no local resync/retry → failure unwind
```

Renderer Control MAY coalesce transitional revisions，但：

```text
unacknowledged Activation never published
revoked Activation never republished
InputTarget=null legal
never two ordinary InputTargets
```

---

## 14. Error Classification

全部七个 Request MUST使用 finite sender-local deadline。

无 application retry/replay/reconnect replay；无 operationId/idempotency journal。

Semantic envelope：

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

Runtime diagnostics至少：

```text
FRAME_CONTROL_TIMEOUT
FRAME_CONTROL_DIVERGENCE
FRAME_CONTROL_PROTOCOL_ERROR
```

Unknown/malformed LoomRealm semantic error data is protocol-fatal；不得转为 ordinary FrameFailure。

Late Response在 timeout/terminal failure commit后只用于 diagnostics，不恢复 authority/outcome。

v1无 caller-driven `frame.cancel`；`cancelled`只由 current active Frame自身作为 `frame.return` outcome表达。

---

## 15. Runtime Failure Unwind

Runtime failure以 `descriptor.key`为单位：

```ts
failedRuntimeKeys: Set<string>
```

unwind root = live Stack中**最低/最老**的 `subsystemKey ∈ failedRuntimeKeys` Frame。

```text
root..top = doomed suffix
```

同 Runtime多次出现取最低 occurrence。

### 15.1 Failure barrier

Recovery与 normal transaction共享 Stack serialization。

Barrier后：

```text
no new normal call/return from doomed suffix
clear affected InputTarget
no new doomed Activation publication
failed Runtime gets no normal Frame RPC
```

只承认 Main已 commit transaction facts。

### 15.2 LIFO cleanup

Affected suffix Top→Bottom；intermediate doomed Frame不逐层 normal resume。

Failed Runtime Frame：

```text
no activate/suspend/resume/close RPC
revoke public authority
→ closing
→ closed
→ logical remove
```

这是 normal close ACK-before-pop的 failure-path exception。

Healthy doomed Frame：Context确定存在时 best-effort exactly one `frame.close`；明确 initialize未 commit则无需 close；已有 pending close不 duplicate。

### 15.3 Fixed-point expansion

Healthy cleanup/pending RPC若 timeout/loss/diverge/protocol-fail/Runtime exit：

```text
failedRuntimeKeys += subsystemKey
→ recompute lowest root over whole live Stack
```

重复至 fixed point；无 retry/replay/resync。

### 15.4 Outcome preservation

已被 Return Acceptance commit 的 outcome MUST survive crash/Control failure/cleanup failure。

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

如果 final root下有 direct healthy/ready Caller：

```text
Anew=fresh
frame.resume(Caller,Anew,root.frameId,rootOutcome) → ACK
→ Caller active/Anew
→ publish InputTarget
```

resume failure → Caller Runtime加入 failed set → recompute root。

最终只能 healthy Caller fresh-resume成功，或 Stack empty/InputTarget=null。

Failure unwind不控制 Render/Data lifecycle。

---

## 16. JSON / Request ID Profile

Frame/Call message是 exactly one JSON-RPC Request/Response；Runtime Control Profile禁止 Batch。

Same sender / same Control Connection Request ID：

```text
positive safe integer
1..2^53-1
strictly monotonically increasing
Control + Frame shared namespace
never reused
never wrap
```

两个 sender direction namespace独立。

Receiver MUST treat：

```text
incoming Request id <= lastRemoteRequestId
```

as protocol-fatal。

Request ID只做 correlation，不是 operation identity。

Plain JSON application representation禁止：

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
```

Source-level duplicate object members are not independently detectable after frozen Wire parsing；their observable semantics follow Runtime Control Profile / Wire / ECMAScript `JSON.parse`。Parsed params/results/error data仍必须满足 closed schema。

整数必须 safe integer；更大整数用 string。

---

## 17. Frozen Wire Limits

Canonical application representation：

```text
validated plain JSON object
→ compact JSON text
→ UTF-8 bytes
```

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

All platforms enforce same limits over actual carrier UTF-8 JSON text application unit；no PWA structured-object/reference-equivalent sizing。

Sender MUST perform bounded outbound preflight；it MUST NOT first materialize an arbitrarily expanding serialized value and only then discover the 1 MiB violation。

Malformed/oversize/invalid Response is protocol-fatal。

---

## 18. Deadline Profile

七方法 sender都配置 finite deadline：

```text
1000 <= deadlineMs <= 300000
integer ms
sender-local
stable for one Control Connection
relative elapsed-time source
not in RPC params
not negotiated per request
```

Request lifecycle：

```text
preflight
→ allocate/consume Request ID
→ insert pending correlation
→ arm deadline
→ serialized carrier.send
→ await correlated Response / timeout / terminal
```

Deadline therefore covers local send wait and remote response wait。

Race：

```text
pending settlement first-wins
```

Response settles first → cancel/retire deadline。  
Deadline settles first → timeout ambiguous；later Response diagnostics only；ID never reused。

Main负责 initialize/activate/suspend/resume/close；Subsystem负责 call/return。双方可配置不同 stable Frame deadline。

Timeout = ambiguous → Runtime failure；no retry。

---

## 19. Transport Mapping

Carrier mapping由 Runtime Control Application Profile v1统一：

```text
one carrier application unit
= one UTF-8 JSON text string
= one JSON-RPC message object
```

### Desktop

```text
localhost WebSocket
one complete text message = one JSON text application unit
binary forbidden
```

### PWA

```text
Control MessagePort already provisioned by Platform
postMessage(string) = one JSON text application unit
```

Structured Clone / Transferable只用于 Platform bootstrap/Port transfer，不用于 Frame application object model。

Transport-independent guarantees：

```text
ordered per-direction delivery
one application message per carrier unit
no adapter duplicate/retry/replay
connection-loss notification
bidirectional Request/Response
```

Hostra/PWA 对同一 abstract trace MUST产生相同 Frame authority/outcome/Activation/unwind结果。

---

## 20. Version Binding

`subsystem.hello.protocolVersions`只协商 Subsystem Control。

Frame v1无：

```text
frame.hello
frame.protocolVersions
frame.version
frame.capabilities
```

Frame版本由 Runtime Control Profile v1静态绑定。Runtime `ready`必须完整支持其角色所需 Frame v1。

v1无 minor wire version/downgrade/private compatibility extension。

ADR 0018/0021 only cover first-implementation corrections already recorded；after conformant compatibility obligation exists, incompatible method/field/authority/commit/error/unwind/ordering/limit changes require normal version/migration governance。

---

## 21. Final Frozen Invariants

1. `loomrealm.frame-call / 1`；
2. Frame/Caller/Stack/Activation/InputTarget authority属于 Main；
3. lifecycle only starting/active/suspended/closing/closed，Outcome独立；
4. frameId/activationId Session unique、never reused；
5. exactly seven JSON-RPC Requests；closed schema；
6. call/return Response send barrier先于 dependent reverse RPC；ordinary call不用 reverse suspend；
7. child-call suspension通过对应 Child Outcome + fresh resume恢复；administrative suspend无 generic resume；
8. activate/resume ACK-before-InputTarget publication；
9. post-commit facts不 rollback；accepted outcome不可撤销；
10. Success=known commit；recoverable Explicit Error=known no-commit；timeout/loss=ambiguous；
11. no application retry/replay/idempotency journal；
12. Runtime failure按 subsystem key最低 occurrence whole-suffix fixed-point unwind；
13. failed Runtime Frame可 logical retire；healthy doomed Frame best-effort close；
14. accepted outcome preserved；surviving Caller只 fresh Activation resume；
15. failure unwind不控制 Render/Data lifecycle；
16. same-sender Request ID strict monotonically increasing、positive safe integer、connection lifetime never reused/wrapped；
17. source duplicate JSON member semantics跟随 Runtime Control Profile/Wire；closed parsed schemas仍强制；
18. plain JSON + Frozen wire limits + bounded outbound preflight + finite sender-local deadlines；
19. Frame Request deadline覆盖 send + response，pending settlement first-wins；late Response无恢复作用；
20. current Desktop/PWA mapping统一 UTF-8 JSON text string；
21. Frame v1无独立 handshake/downgrade；
22. 兼容判断以主协议 + Conformance Profile适用 fixtures为准。
