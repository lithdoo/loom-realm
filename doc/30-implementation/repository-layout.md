# 仓库与分包方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：建议的代码分包、进程入口和依赖规则  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-04

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

整体仍 Draft，但 Batch A-E 已 Normative / Frozen；Batch F 是最终 completion。

包必须提供：

```text
FrameLifecycleState
FrameOutcome / FrameFailure
exact seven JSON-RPC method Schema
identity / Activation validator
transaction invariant fixtures
semantic error Schema/classifier
request-result classifier
Runtime failure diagnostic categories
Runtime failure unwind invariants / trace fixtures
```

Frozen method surface：

```text
Main → Subsystem
    frame.initialize / activate / suspend / resume / close
Subsystem → Main
    frame.call / return
```

不得定义 `frame.cancel/frame.abort/frame.unwind`、operationId/idempotencyKey/replay journal、Runtime/Render lifecycle。

## 3. Batch E Fixture/API Surface

协议包可以提供纯函数/fixture helper表达：

```text
findLowestFailedRuntimeFrame(stack, failedKeys)
deriveAffectedSuffix(stack, rootIndex)
deriveRootOutcome(frame)
assertAcceptedOutcomePreserved(...)
assertFreshRecoveryActivation(...)
```

这些 helper不得创建新的 public wire state。

Runtime failure规则：

```text
lowest failed-runtime Frame = root
root..top = whole doomed suffix
cleanup Top→Bottom
failed Runtime Frame logical retire without RPC ACK
healthy Runtime Frame best-effort close
cleanup failure expands failed set and recomputes root
root no outcome → SUBSYSTEM_RUNTIME_FAILED
only final direct surviving Caller fresh-resume
```

## 4. `main-system`

负责 Descriptor/Launcher/Runtime Supervisor、Control Registry、Frame/Activation Registry、Stack Controller、Frame Transaction Coordinator、Deadline/Failure Classifier、RuntimeFailureUnwindCoordinator、Renderer Control Publisher 与 Data Connection Authority。

建议：

```text
FrameMutationCoordinator
    serializes normal transaction + failure unwind

FrameRpcDeadlineManager
    finite deadline / ambiguous classification

FrameErrorClassifier
    recoverable / divergence / protocol-fatal

RuntimeFailureUnwindCoordinator
    failedRuntimeKeys
    lowest-root selection
    top-down suffix cleanup
    fixed-point root expansion
    accepted outcome preservation
    surviving Caller resume

RendererControlPublisher
    committed state only
```

Main不得 timeout后 retry，也不得用 Renderer state修复 Frame Control ambiguity。

## 5. Main Recovery State

建议 Host-private recovery record：

```ts
interface RuntimeFailureUnwindState {
  readonly generation: number;
  readonly failedRuntimeKeys: ReadonlySet<string>;
  rootFrameId: string | null;
  phase: "scan" | "cleanup" | "resume" | "complete";
}
```

这不是 wire/public lifecycle；具体结构可改，只需保持 Frozen行为。

Main还应跟踪 per-Frame remote Context knowledge：`absent / established / unknown`，用于决定 healthy doomed Frame是否需要 close。Ambiguous remote state意味着相关 Runtime已按 Batch D failure，不应通过 retry探测。

## 6. `subsystem-sdk`

至少提供 Bootstrap Context、Subsystem Control v1、Frame RPC dispatcher/client、Frame Input Context Registry、mutation gate、deadline/failure handler、Data/Render/User Input adapters、Content Client。

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

SDK不实现 Stack failure-unwind authority；terminal failed Runtime不选择 lower Frame resume。健康 Runtime收到 Main `frame.close` 时只清指定 doomed Frame Context，不把它映射成 Runtime/Render cleanup。

## 7. `web-renderer`

Renderer只镜像 Main committed control state，不直接解析/发送 Frame RPC。

必须支持 failure recovery的较长 `InputTarget=null` gap、old Activation永久消失、只在 recovery resume ACK后看到新 Activation。Renderer reconnect不能取消 Runtime failure或推断 unwind root。

## 8. Desktop / PWA Transport

Desktop WebSocket 与 PWA MessagePort都必须保持：

```text
Response-before-dependent-RPC
ACK-before-InputTarget-publication
finite Frame RPC deadline
ambiguous-no-retry
lowest-root whole-suffix unwind
failed-runtime logical retirement
fixed-point failed-set expansion
accepted outcome preservation
```

Transport adapter不得自行发送 recovery close/retry或改变 root选择。

## 9. `map-subsystem`

`loom.map` 使用 SDK mutation gate/deadline handler；Runtime失败后不自行恢复 suspended map Frame。健康 map Runtime若某 map Frame因 ancestor failure被 unwind，只按 Main `frame.close` 删除该 Frame/Input Context，world/Render共享状态按业务设计保留。

## 10. `test-subsystems`

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
callee-cancelled
stale-activation
```

## 11. Fixture Layout

```text
frame-call-protocol/
├── src/
│   ├── lifecycle.ts
│   ├── activation.ts
│   ├── errors.ts
│   ├── transaction-invariants.ts
│   └── failure-unwind-invariants.ts
└── test-fixtures/
    ├── schema/
    ├── transactions/
    ├── errors-timeouts/
    └── runtime-failure-unwind/
```

Batch E fixtures必须覆盖 repeated-runtime root、whole suffix、logical retire、healthy close、fixed-point expansion、accepted outcome、fresh recovery resume与 initial/zero-frame failure。

## 12. 依赖规则

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

禁止 Main/SDK/Host adapter 私自改变 A-E Frozen semantics。

## 13. 发布策略

第一阶段可保持 monorepo + unified version。Frame / Call 在 Batch F前整体仍 Draft，但 A-E 已冻结部分必须接受兼容性检查。Batch F完成 limits/fixtures/profile/version后整体转 Active / Normative / Frozen。
