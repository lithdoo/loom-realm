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

整体仍 Draft，但 **Batch A / B / C / D 已 Normative / Frozen**。

包必须提供：

```text
FrameLifecycleState
FrameOutcome / FrameFailure
exact seven JSON-RPC method Schema
identity / Activation validator
transaction trace / commit-barrier fixture
semantic error Schema/classifier
request-result classifier
Runtime failure diagnostic categories
```

Frozen method surface：

```text
Main → Subsystem
    frame.initialize / activate / suspend / resume / close
Subsystem → Main
    frame.call / return
```

Batch C utility/fixture 表达 Call/Return Acceptance Commit、ACK publication barrier、close ACK before pop、pre/post-commit boundary、Response-before-dependent-RPC。

Batch D utility/fixture 表达：

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous
finite deadline
no automatic retry/replay
recoverable vs Runtime-fatal error classification
```

Frozen recoverable semantic codes：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

Frozen divergence codes：

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
```

Runtime failure diagnostics：`FRAME_CONTROL_TIMEOUT / FRAME_CONTROL_DIVERGENCE / FRAME_CONTROL_PROTOCOL_ERROR`。

包 MUST NOT 定义 operationId/idempotencyKey/dedup journal/replay cache、caller-driven `frame.cancel` 或 Runtime/Render lifecycle。

## 3. `main-system`

负责 Descriptor/Launcher/Runtime Supervisor、Control Registry、Frame Registry、Activation Registry、Stack Controller、Frame Transaction Coordinator、Frame RPC Deadline/Failure Classifier、Renderer Control Publisher 与 Data Connection Authority。

建议：

```text
FrameMutationCoordinator
    serialize stack mutation
    acceptance/commit barriers
    forward-recovery entry

FrameRpcDeadlineManager
    finite Host/Profile deadline
    timeout/loss → ambiguous
    late Response diagnostic-only

FrameErrorClassifier
    recoverable semantic error
    divergence
    protocol failure

RendererControlPublisher
    publish committed state only
```

Main 不得 timeout 后 retry，也不得用 Renderer state修复 Frame Control ambiguity。

## 4. `subsystem-sdk`

至少提供 Bootstrap Context、Subsystem Control v1、Frame RPC dispatcher/client、Frame Input Context Registry、mutation gate、Frame RPC Deadline Handler、System Data/Render/User Input adapters、Content Client。

Frame adapter：

```text
onInitialize(frameId,input)
onActivate(frameId,activationId)
onSuspend(frameId,activationId)
onResume(frameId,newActivationId,returnedFrameId,outcome)
onClose(frameId)
call(frameId,currentActivationId,targetSubsystemKey,input)
return(frameId,currentActivationId,outcome)
```

SDK mutation gate：call/return pending时停止新 ordinary input、阻止第二个 call/return；Success commit 本地新状态；recoverable Error release gate；timeout/loss MUST NOT release gate back to old Activation，而进入 Runtime failure。

合法 initialize 业务拒绝通过 `FRAME_INITIALIZE_REJECTED + FrameFailure`；合法 activate/suspend/resume/close 的 lifecycle/Activation mismatch 是 divergence。

SDK 不 retry/replay Frame RPC，不实现 operation journal，不提供 caller remote cancel。

## 5. `web-renderer`

Renderer 只镜像 Main committed control state，不直接解析/发送 Frame RPC。

Frame Input Registry 支持 `InputTarget=null` gap、new Activation only after Main publication、revoked Activation never revived、no two InputTargets。

Frame Control timeout/divergence 不通过 Renderer reload 恢复。

## 6. Desktop / PWA Transport

Desktop WebSocket 与 PWA MessagePort 都必须保持：Response-before-dependent-RPC、no nested reverse-request requirement、ACK-before-InputTarget-publication、post-commit no rollback、finite Frame RPC deadline、ambiguous-no-retry。

底层 TCP/MessagePort delivery mechanics 不得形成第二次 application Frame operation。PWA Launcher/Credential/Transport 具体 Profile 尚未冻结。

## 7. `map-subsystem`

`loom.map` Frame Adapter 必须使用 SDK mutation gate/deadline handler；call/return timeout 进入 Runtime failure；initialize 可以业务 reject；cancelled outcome 由 active Frame 自行 return；Frame lifecycle 不隐式改变 Render/Runtime/Data Connection。

## 8. `test-subsystems`

建议包含：

```text
same-subsystem-recursive
no-reentrant-handler
call-child-init-reject
call-target-unavailable
frame-rpc-timeout
late-frame-response
frame-state-divergence
activation-divergence
invalid-frame-schema
call-timeout-gate-held
return-timeout-gate-held
callee-cancelled
postcommit-no-rollback
stale-activation
```

## 9. 依赖规则

```text
protocol packages
    不依赖实现包

main-system
    → subsystem-control / frame-call / launcher / game-package / content contracts

subsystem-sdk
    → subsystem-control / frame-call / connection / render / input / content contracts

web-renderer
    → renderer-control mirror / connection / render / input / content contracts

map-subsystem
    → subsystem-sdk / render / input / content contracts
```

禁止 Main/SDK/Host adapter 私自改变 A/B/C/D Frozen semantics。

## 10. Fixture Layout

建议：

```text
frame-call-protocol/
├── schema/
├── generated/
├── src/
│   ├── lifecycle.ts
│   ├── activation.ts
│   ├── transaction-invariants.ts
│   └── errors.ts
└── test-fixtures/
    ├── schema/
    ├── transactions/
    └── errors-timeouts/
```

Batch D fixtures 至少覆盖 finite deadline、no retry、late Response ignored for state、initialize rejection、target unavailable、divergence fatal、protocol error fatal、call/return timeout mutation gate、no caller-driven cancel。

## 11. 其他协议包

`subsystem-control-protocol` 保持 Active/Normative/Frozen；Connection/Render/User Input/Render State 独立冻结。Connection heartbeat/reconnect 不得改写 Frame timeout/error semantics。

## 12. 发布策略

第一阶段可保持 monorepo + unified version。Frame / Call 在 Batch F 前整体仍 Draft，但 A/B/C/D 已冻结部分必须接受兼容性检查；Batch E 只补 Runtime failure unwind，Batch F 完成 limits/fixtures/profile/version。
