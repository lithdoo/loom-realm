# 仓库与分包方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：建议的代码分包、进程入口和依赖规则  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-09

本方案用于指导第一阶段落地，不是产品协议。包名可以调整，但职责边界必须遵守上层架构和契约。

## 1. 建议工作区

```text
packages/
├── protocol-core/
├── subsystem-control-protocol/
├── runtime-control-profile/
├── frame-call-protocol/
├── renderer-control-protocol/
├── renderer-subsystem-connection-protocol/
├── user-input-protocol/
├── render-update-protocol/
├── content-api-contract/
├── game-package-contract-v1/
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

不为从未实现的历史协议建立 compatibility packages；当前包只实现 current contracts。

## 2. `subsystem-control-protocol`

当前：

```text
loomrealm.subsystem-control / 1
```

至少包含：

```text
hello/status/shutdown schemas
bootstrap credential validation helpers
Runtime lifecycle validator
semantic error codes
wire limits
Control v1 conformance fixtures
```

不得增加 `ready.rendererDataEndpoint`、Data control methods或私有 dual-stack negotiation。

## 3. `runtime-control-profile`

```text
Runtime Control Application Profile v1
=
Subsystem Control v1
+
Frame / Call v1
```

至少提供：

```text
shared Control dispatcher rules
hello-before-frame gate
shared sender-side Request ID policy
no-Batch enforcement
Control v1 + Frame v1 static binding
integration fixtures
```

不新增 Data methods。

## 4. `frame-call-protocol`

Frame / Call v1保持 Active / Normative / Frozen。

包提供：

```text
FrameLifecycleState
FrameOutcome / FrameFailure
exact seven JSON-RPC method schemas
identity / Activation validator
JSON/number/string/limit validator
Request ID helper
FrameCallDeadlineProfileV1 validator
semantic error classifier
transaction invariants
Runtime failure unwind invariants
conformance manifest / harness helpers
```

不得定义 `frame.cancel/frame.abort/frame.unwind/frame.version/frame.capabilities`、operation replay或 Runtime/Render lifecycle。

当前 enclosing Runtime Profile是 v1。

## 5. Frame v1 Limits/API Surface

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

PWA与Desktop复用同一 logical validator；Structured Clone不能形成第二套 Frame type system。

## 6. Request ID / Deadline Helpers

```text
ConnectionRequestIdAllocator
    positive safe integer
    sender-local
    Connection lifetime no reuse
    shared by Control + Frame for same sender/carrier

FrameDeadlineProfileValidator
    seven Frame methods
    integer 1000..300000ms
```

使用 monotonic clock。Deadline不进入 wire、不由 Game Package/business input覆盖。

## 7. `main-system`

负责：

```text
Descriptor / Launcher
Runtime Supervisor
Control v1 Registry/Dispatcher
Frame/Activation Registry
Stack/Transaction/Failure Unwind
Renderer Control Publisher
DataAuthority Registry
```

Main不得 timeout后 retry，也不得用 Renderer/Data state修复 Frame Control ambiguity。

## 8. `subsystem-sdk`

至少提供：

```text
Desktop/PWA bootstrap adapter interfaces
Subsystem Control v1
Runtime Control Profile v1 dispatcher
Frame RPC client/dispatcher/validator
shared outbound Request ID allocator
Frame Input Context Registry
mutation gate/deadline/failure handler
Data Connection adapter
User Input adapter
Render Update Snapshot/Patch/Event producer
Content Client
```

Frame adapter：`onInitialize/onActivate/onSuspend/onResume/onClose/call/return`。

SDK不实现 Stack unwind authority；terminal failed Runtime不选择 lower Frame resume。

## 9. `renderer-control-protocol`

提供 Main→Renderer full Authority Snapshot schema/validation：

```text
Session / revision
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority
```

不包含 endpoint/token/MessagePort。

## 10. `renderer-subsystem-connection-protocol`

```text
identity = Session + current Renderer + subsystemKey + generation
lifecycle = current → retired
serialized installation
one current connection per Subsystem/current Renderer
```

不提供 endpoint discovery/application handshake/heartbeat。

Desktop/PWA carrier establishment属于 Host packages/Profile。

## 11. `user-input-protocol`

提供：

```text
Input Interest
Effective Channel derivation
State / Event / Reset schemas
ordering/coalescing/recovery invariants
Core conformance fixtures
```

Standard keyboard/pointer/gamepad mapping可由独立 Profile实现。

## 12. `render-update-protocol`

当前实现目标：

```text
Domain Registry
Snapshot(revision)
Patch(baseRevision=R, revision=R+1)
Event
```

至少提供：

```text
recursive Node schema
Domain/Node identity validation
per-Domain revision state
insert/remove/move/update schemas
Patch candidate validator/applicator helpers
Event barrier rules
limits/conformance fixtures
```

业务 Subsystem应由 Projector/Diff Engine生成 Patch，而不是从业务 handler直接拼 wire mutation。

## 13. `web-renderer`

负责：

```text
Renderer Control mirror
Data Connection Registry
User Input producers/gates
Render Domain Store + revision
key/parent indexes
Snapshot validator
atomic Patch engine
Component Registry / composition
```

Renderer不解析/发送 Frame RPC；Renderer reconnect不能取消 Runtime failure或推断 Frame unwind root。

## 14. Desktop / PWA Host Packages

Host只负责 platform binding：

```text
Runtime Control carrier establishment
Renderer Control bootstrap
Renderer⇄Subsystem Data endpoint/ticket/MessagePort establishment
Content platform binding
```

不得把 transport bootstrap material塞入 Control `ready`或 Renderer Authority Snapshot。

## 15. `map-subsystem`

`loom.map`使用 SDK Control v1/Profile v1/Frame v1/User Input/Render Update adapters。

Render Manager维护 desired recursive Domain Tree，与 last published state diff生成 Patch；大 diff/backpressure可 materialize Snapshot。

## 16. `test-subsystems`

建议：

```text
control-v1-valid
same-subsystem-recursive
runtime-multiple-frame-occurrence
call-child-init-reject
frame-rpc-timeout
late-frame-response
frame-state-divergence
activation-divergence
runtime-crash-on-close
runtime-crash-on-resume
request-id-reuse
stale-activation
input-producer-loss
render-patch-stream
render-invalid-patch
render-event-barrier
```

## 17. Conformance Layout

Frame依据 [Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)。

其他协议各自维护独立 fixture corpus；建议统一：

```text
fixtureFormatVersion
protocol
protocolVersion
fixtureSetRevision
role
```

新增只验证既有语义的 fixture仅提升 fixtureSetRevision，不改变 protocolVersion。

## 18. Version Binding

```text
Subsystem Control = 1
Frame / Call      = 1
Runtime Profile   = 1
```

版本空间独立；当前恰好都为1。

`subsystem.hello.protocolVersions`只协商 Control；Frame v1由 Profile v1静态绑定。

## 19. 依赖规则

```text
protocol packages
    do not depend on implementation packages

main-system
    → control / runtime-profile / frame / renderer-control / launcher / game-package

subsystem-sdk
    → control / runtime-profile / frame / connection / input / render / content

web-renderer
    → renderer-control / connection / input / render / content

host packages
    → protocol/profile contracts, but do not own protocol authority
```

禁止 Main/SDK/Host adapter私自改变 Frozen/Current protocol semantics。

## 20. 发布策略

第一阶段可保持 monorepo + unified implementation version，但 protocol version独立管理。

只有通过适用 executable conformance fixtures后，包/角色才能声明对应 protocol/profile conformant。
