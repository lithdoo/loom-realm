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

整体仍 Draft，但 **Batch A / B / C 已 Normative / Frozen**。

包必须提供：

```text
FrameLifecycleState
FrameOutcome / FrameFailure
exact seven JSON-RPC method Schema
identity / Activation validator
local pre/postcondition validator
transaction trace / commit-barrier fixture
```

Frozen wire：

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

Batch C fixture/utility 必须表达：

```text
Call Acceptance Commit
Return Acceptance Commit
activate/resume ACK publication barrier
close ACK before pop
pre-commit abort vs post-commit forward recovery
Response-before-dependent-reverse-RPC
```

包 MUST NOT：

- 接受 `system.call / system.return / frame.result / frame.close(reason)`；
- 把 `callerFrameId` 加入 Subsystem wire；
- ordinary call 中要求 `frame.suspend`；
- 把 `frame.call` 变成长时间等待 Child outcome 的 RPC；
- 把 `frame.resume` 拆成 resume + activate；
- 在 activate/resume ACK 前标记 Activation 可对 Renderer 发布；
- 定义 Runtime/Render lifecycle。

## 3. `main-system`

负责 Descriptor/Launcher/Runtime Supervisor、Control Registry、Frame Registry、Activation Registry、Stack Controller、Frame Transaction Coordinator、Renderer Control Publisher 与 Data Connection Authority。

建议内部明确拆出：

```text
FrameMutationCoordinator
    serialize stack mutation
    call acceptance commit
    return acceptance commit
    close/pop barrier
    resume commit
    forward-recovery entry

RendererControlPublisher
    publish committed state only
```

内部 transaction phase 是 Host-private，不得升级成公共 Frame lifecycle。

Main 必须保证：

```text
frame.call Result
    before dependent child initialize/activate

frame.return Result
    before dependent close/resume

activate/resume ACK
    before corresponding InputTarget publication
```

## 4. `subsystem-sdk`

至少提供：Bootstrap Context、Subsystem Control v1、Frame RPC dispatcher/client、Frame Input Context Registry、System Data / Render / User Input adapters、Content Client。

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

SDK 还必须实现 outbound mutation gate：

```text
call/return Request pending
→ stop new ordinary input dispatch
→ block second call/return

call Success
→ local Caller suspended + old Activation revoked

return Success
→ local Frame closing + old Activation revoked
```

SDK MUST NOT 依赖入站 Request handler pending 时处理反向 Frame Request。

## 5. `web-renderer`

Renderer 只镜像 Main committed control state，不直接解析/发送 Batch B Frame RPC。

Frame Input Registry 必须支持：

```text
InputTarget=null transaction gap
new Activation only after Main publication
revoked Activation never revived
no two InputTargets
```

Renderer 不从 Stack 控制 Render lifecycle。

## 6. `pwa-host` / Desktop Transport

Transport adapter 只映射应用协议，不改 transaction semantics。

Desktop WebSocket 与 PWA MessagePort 都必须保持：

- Response-before-dependent-RPC；
- no nested reverse-request requirement；
- ACK-before-InputTarget-publication；
- post-commit no rollback。

PWA Launcher/Credential/Transport 具体 Profile 尚未冻结。

## 7. `map-subsystem`

`loom.map` Frame Adapter 必须：

- 不依赖 Caller wire；
- outbound call/return 使用 SDK mutation gate；
- call success 本地 commit suspended/revoked；
- return success 本地 commit closing/revoked；
- no-value completion 使用 `value:null`；
- Frame lifecycle 不隐式改变 Render / Runtime / Data Connection。

## 8. `test-subsystems`

建议新增：

```text
same-subsystem-recursive
no-reentrant-handler
call-child-init-reject
call-child-activate-reject
call-gap-null-target
return-normal
return-close-delay
resume-delay
postcommit-no-rollback
stale-activation
```

并保留 Launcher/Control、schema-invalid、multi-frame-input、render-without-frame 等 fixture。

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

禁止 Main/SDK/Host adapter 私自改变 A/B/C Frozen semantics。

## 10. Schema / Transaction Fixture Layout

建议：

```text
frame-call-protocol/
├── schema/
├── generated/
├── src/
│   ├── lifecycle.ts
│   ├── activation.ts
│   └── transaction-invariants.ts
└── test-fixtures/
    ├── schema/
    └── transactions/
```

Batch C transaction fixtures 至少包含 initial activate-before-publish、call Response-before-child-RPC、ordinary call no-suspend、same-Subsystem no-reentrant-handler、post-call failure fresh resume、return Response-before-close、close-ACK-before-pop、resume-ACK-before-publish、post-commit no rollback。

## 11. 其他协议包

`subsystem-control-protocol` 保持 Active/Normative/Frozen；Connection/Render/User Input/Render State 继续独立冻结。Connection heartbeat/reconnect 不得改写 Subsystem Control 或 Frame transaction semantics。

## 12. 发布策略

第一阶段可保持 monorepo + unified version。Frame / Call 在 Batch F 前整体仍 pre-stable / Draft，但 A/B/C 已冻结部分必须接受兼容性检查，不能被普通实现重构静默修改。
