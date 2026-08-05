# 仓库与分包方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：建议的代码分包、进程入口和依赖规则  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-05

本方案用于指导第一阶段落地，不是产品协议。包名可以调整，但职责边界必须遵守上层架构和契约。

## 1. 建议工作区

```text
packages/
├── protocol-core/
├── subsystem-control-protocol/
├── frame-call-protocol/
├── renderer-subsystem-connection-protocol/
├── render-update-protocol/
├── user-input-protocol/
├── render-state-protocol/
├── content-api-contract/
├── game-package-contract-v2/
├── nodejs-launcher-profile-v1/
├── main-system/
├── subsystem-sdk/
├── web-renderer/
├── game-package/
├── fsdb-content-service/
├── map-subsystem/
├── map-content-profile-pe/
├── hostra-adapter/
├── pwa-host/
└── test-subsystems/
```

## 2. `frame-call-protocol`

Frame / Call Protocol v1 已 Active / Normative / Frozen。

包必须提供：

```text
FrameLifecycleState
FrameOutcome / FrameFailure
exact seven JSON-RPC method Schema
identity / Activation validator
JSON/number/string/limit validator
Request ID validator / allocator helper
FrameCallDeadlineProfileV1 validator
semantic error Schema/classifier
transaction invariant fixtures
Runtime failure unwind invariants / trace fixtures
conformance manifest / harness helpers
```

不得定义 `frame.cancel/frame.abort/frame.unwind/frame.version/frame.capabilities`、operationId/idempotencyKey/replay journal、Runtime/Render lifecycle。

## 3. Frozen v1 Limits/API Surface

协议包 validator必须统一：

```text
message <= 1 MiB compact JSON equivalent
JSON depth <= 64
business JsonValue <= 512 KiB
JsonValue string <= 256 KiB UTF-8
object key <= 256 UTF-8 bytes
array/object member count <= 16,384
frameId / activationId <= 128 UTF-8 bytes
targetSubsystemKey <= 256 UTF-8 bytes
FrameFailure code/message limits
finite binary64 + safe integer
valid Unicode scalar sequence
no duplicate JSON object members
```

PWA与Desktop都复用同一逻辑 validator；不能让 Structured Clone形成第二套 Frame type system。

## 4. Request ID / Deadline Helpers

建议：

```text
ConnectionRequestIdAllocator
    positive safe integer
    sender-local
    Connection lifetime no reuse

FrameDeadlineProfileValidator
    all seven methods
    integer 1000..300000ms
```

Main/Subsystem实际计时使用 monotonic clock。Deadline不进入 wire、不由 Game Package/business input覆盖。

## 5. Transaction / Failure Helpers

协议包可提供纯函数/fixture helper：

```text
findLowestFailedRuntimeFrame(stack, failedKeys)
deriveAffectedSuffix(stack, rootIndex)
deriveRootOutcome(frame)
assertAcceptedOutcomePreserved(...)
assertFreshRecoveryActivation(...)
```

这些 helper不得创建新的 public wire state。

## 6. `main-system`

负责 Descriptor/Launcher/Runtime Supervisor、Control Registry、Frame/Activation Registry、Stack Controller、Transaction Coordinator、Protocol Validator、Request ID Allocator、Deadline/Failure Classifier、RuntimeFailureUnwindCoordinator、Renderer Control Publisher 与 Data Connection Authority。

```text
FrameMutationCoordinator
    serializes normal transaction + failure unwind

FrameProtocolValidator
    schema / JSON / limits

ConnectionRequestIdAllocator
    shared sender-side Control Connection ID namespace

FrameRpcDeadlineManager
    monotonic finite deadline / ambiguous classification

FrameErrorClassifier
    recoverable / divergence / protocol-fatal

RuntimeFailureUnwindCoordinator
    failedRuntimeKeys / lowest-root / fixed-point / Caller resume
```

Main不得 timeout后 retry，也不得用 Renderer state修复 Frame Control ambiguity。

## 7. `subsystem-sdk`

至少提供 Bootstrap Context、Subsystem Control v1、Frame RPC dispatcher/client、Frame Protocol Validator、Request ID allocator、Frame Input Context Registry、mutation gate、deadline/failure handler、Data/Render/User Input adapters、Content Client。

Frame adapter：

```text
onInitialize
onActivate
onSuspend
onResume
onClose
call
return
```

SDK必须 outbound preflight；PWA/Node使用相同 JSON/limit semantics。SDK不实现 Stack unwind authority；terminal failed Runtime不选择 lower Frame resume。

## 8. `web-renderer`

Renderer只镜像 Main committed control state，不直接解析/发送 Frame RPC。

必须支持较长 `InputTarget=null` gap、old Activation永久消失、只在 resume ACK后看到新 Activation。Renderer reconnect不能取消 Runtime failure或推断 unwind root。

## 9. Desktop / PWA Transport

Desktop WebSocket 与 PWA MessagePort都必须保持：

```text
exact seven Frame methods
one transport unit = one JSON-RPC message
no JSON-RPC Batch
plain JSON-only application model
shared limits
Request ID one-shot per sender/Connection
Response-before-dependent-RPC
ACK-before-InputTarget-publication
finite monotonic Frame deadline
ambiguous-no-retry
lowest-root whole-suffix unwind
accepted outcome preservation
```

Transport adapter不得自行发送 recovery close/retry或改变 root选择。

## 10. `map-subsystem`

`loom.map` 使用 SDK validator/mutation gate/deadline handler；Runtime失败后不自行恢复 suspended map Frame。健康 map Runtime若某 map Frame因 ancestor failure被 unwind，只按 Main `frame.close` 删除该 Frame/Input Context，world/Render共享状态按业务设计保留。

## 11. `test-subsystems`

建议包含：

```text
same-subsystem-recursive
runtime-multiple-frame-occurrence
call-child-init-reject
frame-rpc-timeout
late-frame-response
frame-state-divergence
activation-divergence
runtime-crash-on-close
runtime-crash-on-resume
cleanup-timeout-root-expansion
call-timeout-gate-held
return-timeout-gate-held
accepted-outcome-then-crash
oversize-frame-message
invalid-frame-number
request-id-reuse
non-json-messageport-value
callee-cancelled
stale-activation
```

## 12. Conformance Layout

依据 [Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)：

```text
packages/frame-call-protocol/
├── src/
│   ├── lifecycle.ts
│   ├── activation.ts
│   ├── json-profile.ts
│   ├── limits.ts
│   ├── request-id.ts
│   ├── deadlines.ts
│   ├── errors.ts
│   ├── transaction-invariants.ts
│   └── failure-unwind-invariants.ts
└── conformance/
    └── v1/
        ├── manifest.json
        ├── identity-lifecycle/
        ├── wire-schema/
        ├── transactions/
        ├── errors-timeouts/
        ├── runtime-failure/
        ├── limits/
        └── transport-version/
```

Conformance Profile已经冻结 fixture catalog；这里仍需实现可执行 trace/harness。完成这些测试是实现声明 v1 conformant的条件，不是协议再次设计的条件。

## 13. Version Binding

Frame v1不需要新的 runtime handshake package。

`subsystem.hello.protocolVersions`仍属于 Subsystem Control。Host/runtime deployment profile静态绑定 Frame v1。未来 Frame v2动态协商需要新 profile/control version。

## 14. 依赖规则

```text
protocol packages
    不依赖实现包

main-system
    → control / frame-call / launcher / game-package / content contracts

subsystem-sdk
    → control / frame-call / connection / render / input / content contracts

web-renderer
    → renderer-control mirror / connection / render / input / content

map-subsystem
    → subsystem-sdk / render / input / content
```

禁止 Main/SDK/Host adapter私自改变 Frozen Frame v1 semantics/limits/profile。

## 15. 发布策略

第一阶段可保持 monorepo + unified version。Frame / Call v1协议本身已经 Frozen；实现包在通过适用 Conformance Profile fixture后才能声明对应 v1角色 conformant。
