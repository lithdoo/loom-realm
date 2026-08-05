# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：LoomRealm Main 内部模块边界、Frame transaction/error/recovery/conformance coordinator 与 Runtime supervision  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Subsystem Control Protocol v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Frame / Call v1 Conformance Profile](../../15-contracts/frame-call-conformance-v1.md)  
> 最近复核：2026-08-05

## 1. 建议模块

```text
Main System
├── Game Package Bootstrap
├── Subsystem Descriptor Registry
├── Launcher Target Resolver / Dispatcher
├── Launch Attempt Registry
├── Runtime Container Registry
├── Runtime Supervisor
├── Control Connection Registry
├── Control Request ID Allocator
├── Frame Registry
├── Activation Registry
├── Frame Stack Controller
├── Frame / Call Coordinator
├── Frame Protocol Validator
├── Frame RPC Deadline / Failure Classifier
├── Runtime Failure Unwind Coordinator
├── Renderer Control Publisher
├── System Data Connection Authority
└── Content Grant Authority
```

## 2. Runtime Bootstrap / Control

Game Package Bootstrap 在 Process side effect前完成 Descriptor/Entry/env校验。Launcher使用 Host-selected Node、`shell=false`、固定 cwd、显式 child environment。

Runtime Supervisor / Control Registry实现 Frozen Subsystem Control v1：hello/status/shutdown、connection-bound `descriptor.key`、Main shutdown intent、semantic error envelope与 terminal failure。

`spawn success ≠ connected ≠ identified ≠ ready`；`stopped`只来自 Supervisor observation；v1无 automatic restart/same-attempt reconnect/application heartbeat。

## 3. Frame Registry

Frame / Call Protocol v1 已 Active / Normative / Frozen。

```ts
type FrameLifecycleState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";

type FrameOutcome =
  | { readonly type: "completed"; readonly value: JsonValue }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly error: FrameFailure };

interface FrameRecord {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly callerFrameId: string | null;
  state: FrameLifecycleState;
  currentActivationId: string | null;
  outcome: FrameOutcome | null;
}
```

Registry保证 frameId never reused、subsystemKey permanent、caller immutable、只有 active Frame有 current Activation、outcome/lifecycle分离。

Host-private可以跟踪：`remoteContextState=absent/established/unknown`、pending Frame RPC、recovery generation；这些不是 wire/public lifecycle。

## 4. Activation Registry

Main是 Activation唯一签发方。首次 active/resume使用 fresh Activation；离开 active时 revoke；revoked never valid again。

Failure barrier后才到达的 late activate/resume Success对应 Activation视为已消耗但不得 publish/reuse。

## 5. Frame / Call RPC Adapter

Frozen exact wire：

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

全部 JSON-RPC Request / closed schema。不得增加 `system.call/system.return/frame.result/frame.cancel/frame.abort/frame.unwind/frame.version/frame.capabilities`、close reason、Caller wire field 或 operation replay identity。

## 6. Frame Protocol Validator

Main outbound/inbound Frame message在进入 transaction logic前必须验证：

```text
plain JSON model
closed schema
valid Unicode scalar strings
finite binary64 / safe integers
message <= 1 MiB
JSON container depth <= 64
business JsonValue <= 512 KiB
frameId / activationId <= 128 UTF-8 bytes
targetSubsystemKey <= 256 UTF-8 bytes
FrameFailure field limits
```

Outbound invalid message是本实现 bug，MUST NOT依赖对端替 Main做 preflight。

PWA Structured Clone对象和Desktop parsed JSON必须进入同一 validator。

## 7. Control Request ID Allocator

承载 Frame / Call v1 的同一 Control Connection上，Main outbound JSON-RPC Request ID：

```text
positive safe integer
1 .. 2^53-1
Connection lifetime never reused
```

Main SHOULD为 Subsystem Control + Frame / Call 使用 connection-wide monotonic allocator，避免跨协议域 pending/late Response collision。

Subsystem→Main outbound ID属于另一 sender-local namespace。

## 8. Stack Mutation Coordinator

normal transaction与 Runtime failure recovery共用单一 serial coordinator。

```ts
interface FrameMutationTransaction {
  readonly kind: "initial" | "call" | "return" | "suspend" | "failure-unwind";
  phase: string; // Host-private
}
```

内部 phase不是公共 lifecycle。

## 9. Healthy Transaction Rules

```text
Initial:
initialize ACK → activate(fresh A0) ACK → commit/publish

Call:
validate
→ Call Acceptance Commit
→ call Success
→ Child initialize/activate
→ activate ACK → commit/publish

Return:
Return Acceptance Commit
→ return Success
→ close ACK/pop
→ resume Caller(fresh A3) ACK → commit/publish
```

ordinary call无 reverse suspend；call/return Response先于 dependent reverse RPC；activate/resume ACK先于 InputTarget publication。

## 10. Deadline / Failure Classifier

Main为自己发送的五个 Frame lifecycle RPC选择 `FrameCallDeadlineProfileV1` 对应项：整数 `1,000..300,000ms`，Connection生命周期内稳定，使用 monotonic clock。

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous
```

Recoverable：`FRAME_CALL_TARGET_NOT_FOUND / FRAME_CALL_TARGET_UNAVAILABLE / FRAME_INITIALIZE_REJECTED`。

Runtime-fatal divergence：`FRAME_NOT_FOUND / FRAME_STATE_MISMATCH / ACTIVATION_MISMATCH / FRAME_STACK_MISMATCH / FRAME_OWNERSHIP_MISMATCH`。

Frozen method/schema protocol error→`FRAME_CONTROL_PROTOCOL_ERROR`；ambiguous→`FRAME_CONTROL_TIMEOUT`；divergence→`FRAME_CONTROL_DIVERGENCE`。

No retry/replay/idempotency journal。Late Response不恢复 terminal failure。

## 11. Initial / Post-call Failure Classification

Initial `FRAME_INITIALIZE_REJECTED`：Runtime healthy、Context absent、higher-level bootstrap处理业务失败。

Initial activate timeout/divergence/protocol error：Runtime failed；不得尝试普通 close修复。

Accepted Child initialize：

```text
FRAME_INITIALIZE_REJECTED
    → healthy Child failed outcome + fresh Caller resume

fatal/ambiguous
    → target Runtime failed + failure unwind
```

所有 post-accept分支都不得恢复 Caller old Activation。

## 12. Runtime Failure Unwind Coordinator

输入：

```text
failedRuntimeKeys: Set<descriptor.key>
```

算法：

```text
root = lowest live Frame owned by failedRuntimeKeys
→ establish Failure Unwind Barrier
→ affected = root..top
→ cleanup Top→Bottom
→ cleanup new failure? add key / recompute root
→ if healthy direct Caller and Session continues: fresh resume
→ resume failure? add key / recompute root
→ finish with healthy Caller active or Stack empty
```

不得只删除 failed Runtime自己的 Frame，也不得只选择最近 occurrence。

## 13. Failed / Healthy Doomed Frame Cleanup

Failed Runtime Frame：不再发送 activate/suspend/resume/close；Main直接 revoke authority→closing→closed→remove。它是 normal close ACK-before-pop 的 failure-path exception。

Healthy doomed Frame：Context absent无需 close；Context established发送一次 `frame.close`；已有 close pending不 duplicate；不额外要求 suspend-before-close。

Cleanup failure使 Runtime加入 failed set并重新计算 root。

## 14. Outcome / Surviving Caller

Accepted outcome永远保留。

Final root无 outcome时：

```text
failed(SUBSYSTEM_RUNTIME_FAILED)
```

Intermediate doomed Frame不逐层 resume。Final root的 direct healthy Caller使用 fresh Activation `frame.resume`；ACK后才 publish。Resume failure扩展 failed set/root。

## 15. Renderer Control Publisher

Publisher只发布 Main已 commit state。Failure recovery可长期 `InputTarget=null`；Renderer不能恢复 cached old Activation。只有 recovery resume ACK后才发布新 target。

## 16. Desktop / PWA Transport Boundary

Desktop adapter：one complete WebSocket text message=one JSON-RPC message。

PWA adapter：Control Port建立后 one plain JSON-compatible `postMessage` object=one JSON-RPC message；不得依赖 Transferable。

Transport adapter不得：JSON-RPC batch、Frame retry/replay、改变 ID/limit/deadline validation、选择 unwind root或更改 transaction order。

## 17. Version / Profile Binding

`subsystem.hello.protocolVersions`只协商 Subsystem Control。Main不期待 `frame.hello/version/capabilities`。

Frame / Call v1由 Host/runtime deployment profile静态绑定。Runtime在该 profile下 `ready` 表示完整支持其 v1角色；部分 method support不是 conformant profile。

## 18. Conformance

Main模块适用 [Frame / Call v1 Conformance Profile](../../15-contracts/frame-call-conformance-v1.md) 中：

```text
identity/lifecycle
wire schema
normal transaction
error/timeout
Runtime failure unwind
limits/deadline
Request ID
transport/version integration
```

设计完成不等于 executable fixture已经实现；实施层必须把该 catalog落成自动测试后才能声称 Main角色 conformant。

## 19. System Data / Render Boundary

Frame failure unwind不拥有 Render/Data lifecycle。healthy doomed Frame close不删除 Render；failed Runtime Data/Render authority失效与cleanup由独立层负责。

## 20. 核心不变量

- Frame / Call v1整体 Frozen；
- exact seven Frame Requests；
- Stack mutation serial；
- Response-before-dependent-RPC；ACK-before-publication；
- revoked Activation永久失效；accepted outcome不可撤销；
- explicit Error=no-commit evidence，不等于 recoverable；
- ambiguous/divergence/protocol error Runtime-fatal/no retry；
- Runtime failure lowest-root whole-suffix fixed-point unwind；
- failed Runtime Frame logical retire；healthy Frame best-effort close；
- root无 outcome→`SUBSYSTEM_RUNTIME_FAILED`；only final Caller fresh-resume；
- JSON/ID/message/depth/field limits统一；
- Request ID sender-side Connection lifetime不复用；
- deadlines sender-local monotonic `1s..5min`；
- Desktop/PWA application semantics一致；
- no Frame handshake/downgrade/partial-v1 claim；
- Frame不拥有 Runtime/Render/Data lifecycle。
