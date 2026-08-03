# 仓库与分包方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：建议的代码分包、进程入口和依赖规则  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-03

本方案用于指导第一阶段落地，不是产品协议。包名可以在实现前调整，但职责边界必须遵守上层架构和契约。

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

最终包名可以调整；关键是保持协议、Launcher 特权能力、业务 Runtime 与 Renderer 的依赖边界。

## 2. 协议 / 契约包

### `protocol-core`

公共 JSON 值、JSON-RPC Envelope、错误 Envelope、版本协商和 Schema 工具。

Subsystem Control v1 的 LoomRealm semantic error 采用：

```text
JSON-RPC error.code = -32000
error.data.code = stable LoomRealm semantic code
```

公共层应支持该形状，但具体 semantic code 由各协议包拥有。

### `game-package-contract-v2`

当前 Desktop Bootstrap subset 已冻结：

```text
key
launcher.type = nodejs
launcher.entry
env
complete Descriptor set validation
eager / all-required bootstrap
```

至少包含 Descriptor validator、Entry logical syntax validator、reserved env validator、machine-readable error categories 与 conformance fixtures。

### `nodejs-launcher-profile-v1`

实现/共享 Desktop Node.js Launcher 的规范类型与 fixture：

- ResolvedLauncherTarget；
- Launch Attempt / Bootstrap Context；
- Entry containment / redirect checks；
- safe child environment builder；
- spawn options contract；
- Process exit classification；
- launcher error categories。

本包不得依赖业务 Subsystem 类型。

### `subsystem-control-protocol`

**Active / Normative / Frozen v1**：

```text
subsystem.hello      Subsystem → Main Request
subsystem.status     Subsystem → Main Notification
subsystem.shutdown   Main → Subsystem Request
```

包必须提供：

- hello params/result Schema；
- Bootstrap Credential authentication/consumption validator；
- connection-bound `descriptor.key` identity rules；
- Runtime status discriminated union；
- Main shutdown intent / status transition state machine；
- shutdown params/result Schema；
- frozen semantic error codes；
- JSON-RPC semantic error helper；
- v1 wire limits；
- hello/status/shutdown/failure/limits fixtures。

该包必须明确：

```text
no application heartbeat
no same-attempt reconnect / resume
no application retry for state-changing control requests
no automatic Runtime restart
```

### `frame-call-protocol`

当前整体仍 Draft，但 **Batch A 已 Normative / Frozen**。

Batch A 包内容应立即实现：

```text
FrameLifecycleState
    starting / active / suspended / closing / closed

Frame identity rules
    frameId Main-generated / Session unique / never reused
    permanent subsystemKey / descriptor.key assignment
    callerFrameId immutable

Activation rules
    activationId Main-generated / Session unique / never reused
    only active Frame owns current Activation
    revoked Activation never valid again
    reactivated Frame always gets new Activation

Stack stable-state rules
    Stack Top active
    other live Frames suspended

Outcome separation
    completed / cancelled / failed are outcome, not lifecycle

No Frame ready / initialized / frame.status
```

建议包内先提供与 Batch A 对应的纯模型类型与 validator：

```ts
type FrameLifecycleState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";

interface FrameIdentity {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly callerFrameId: string | null;
}
```

最终 `FrameOutcome` wire Schema 仍待 Batch B；实现层暂时不得把 `unknown` 概念类型误当冻结 wire schema。

Batch B+ 继续冻结：

- `frame.initialize / activate / suspend / resume / close`；
- `frame.call / frame.return`；
- Call/Return transaction 与 commit barrier；
- semantic error / timeout / retry / cancellation；
- Runtime failure unwind；
- wire limits / profile / conformance completion。

该包 MUST NOT：

- 定义 Runtime bootstrap / ready / shutdown / restart；
- 增加 Frame `ready / frame.status`；
- 把 `failed` 加回 Frame lifecycle enum；
- 复用 `frameId` 或 `activationId`；
- 使用旧 `systemId` 建立新的 Frame ownership identity；
- 包含 Render State。

### `renderer-subsystem-connection-protocol`

System Data Connection：

- Session / Subsystem / Connection identity；
- Grant authentication；
- Protocol capability/version；
- heartbeat / reconnect / replace / close。

这里的 heartbeat / reconnect 只属于 Renderer ⇄ Subsystem Data Connection，不得复用或改写 Subsystem Control v1 的无 heartbeat / no reconnect 语义。

### `render-update-protocol`

Subsystem-owned Render：

- Render lifecycle；
- Render State / Event；
- Revision / ordering；
- recovery / resync；
- composition hooks。

不使用 Frame Activation 作为 Render epoch。

### `user-input-protocol`

- Main-authorized Subsystem reference + `frameId + activationId` 输入路由；
- active/current Activation validation；
- stale Activation rejection；
- continuous intent；
- discrete action；
- input reset；
- UI Interaction；
- input-domain ordering/backpressure。

User Input 实现必须遵守 Frame Batch A：只有 active Frame 的 current Activation 能接收普通输入。

### `render-state-protocol`

声明式 Render Tree / Scope / Node schema 和校验器。Render identity 字段最终名称仍待冻结。

### `content-api-contract`

逻辑只读 Content API route / response / error / cache / authorization。

## 3. 平台包

### `main-system`

实现：

- Descriptor Registry；
- Launcher Target Resolver；
- Launcher Registry / Dispatcher；
- Launch Attempt Registry；
- Runtime Supervisor；
- Runtime shutdown intent；
- Control Connection Registry；
- Frame Registry；
- Activation Registry / generator；
- Frame Stack / Input Target；
- Frame / Call Coordinator；
- Renderer Control Publisher；
- System Data Connection Authority。

Frame Registry MUST 分开保存：

```text
lifecycle state
    starting / active / suspended / closing / closed

outcome
    null / completed / cancelled / failed

currentActivationId
    only non-null for active Frame
```

不得用 `Frame.status = failed` 取代 cleanup lifecycle。

### `subsystem-sdk`

提供：

- Bootstrap Context decoder；
- Subsystem Control v1 client / adapter；
- Runtime status publisher；
- `subsystem.shutdown` handler adapter；
- Frame Control adapter；
- Frame Input Context registry/router；
- Renderer System Data server/adapter；
- Render Update adapter；
- User Input adapter；
- Content Client。

SDK MUST NOT：

- 偷偷加入 `subsystem.ping / subsystem.health`；
- 自动 reconnect 同一 Launch Attempt；
- 自动 restart Runtime；
- 把 shutdown Request ACK 当成 Process stopped；
- 自行创建公共 frameId / activationId；
- 接受 revoked Activation 重新有效；
- 增加 Frame ready/status；
- 要求 Subsystem 使用 per-Frame business state、per-Frame Projector 或 per-Frame Render。

### `web-renderer`

实现：

```text
Main Control State
System Data Connection Registry
Render Registry / Store / Scheduler
Frame Input Registry / Input Router
Node Registry
DOM / Canvas / WebGL Reconciler
Resource Client
```

Renderer Frame Input Registry 只镜像 Main 发布的 current Input Target，不自行创建 Activation。

### `game-package`

Manifest/Entry/Descriptor Loader、Launcher Entry Validator、Catalog 与 Repository Toolkit。

不启动 Subsystem Process。

### `fsdb-content-service`

Desktop localhost HTTP / PWA Service Worker 的统一只读 Content API 实现。

### `pwa-host`

Main/Subsystem Worker、Control/Data MessagePort、Service Worker、OPFS Installer 和页面生命周期协调。

PWA Launcher Descriptor / Bootstrap Credential / Control Transport 映射仍待冻结；未来必须保持已冻结的 Subsystem Control 与 Frame Batch A 语义。

## 4. 业务与适配包

### `map-subsystem`

实现 `loom.map` 的 Subsystem Control Adapter、Frame Input Adapter、Coordinator、Execution Loop/Core、Render Manager/Projector、Repository。

一个 `loom.map` Process 可以承载多个 Frame/Input Context，并由地图自己决定共享或拆分业务 world/session/render。

Frame Input Adapter 必须：

- 按 `frameId` 路由；
- 只接受 active Frame current Activation；
- 永久拒绝 revoked Activation；
- 不把 Frame suspend/close 转换成隐式 Render operation。

### `map-content-profile-pe`

实现 Pokémon Essentials v21.1 兼容编译，不进入平台协议依赖图。

### `hostra-adapter`

只负责 Hostra Window RPC / Renderer URL / Window lifecycle，不承载 LoomRealm Main，不转发业务 Payload。

### `test-subsystems`

建议包含：

```text
hello-ready
hello-invalid-key
hello-reused-token
never-ready
early-exit
exit-zero-after-ready
shutdown-normal
shutdown-fast-exit
shutdown-timeout
unsolicited-stopping
control-disconnect
ignore-shutdown
echo-input
nested-call
multi-frame-input
stale-activation
frame-outcome-failure
render-without-frame
shared-render-multi-frame
independent-render-recovery
failure
```

## 5. Desktop 入口与链路

```text
loom-realm CLI
    → main-system

FSDB Content Service
    → fsdb-content-service

Hostra Main
    → Hostra window host

Hostra Renderer
    → web-renderer

Subsystem Process: <descriptor.key>
    → subsystem-sdk
    → concrete subsystem
```

链路：

```text
Main → Subsystem Process
    Desktop Node.js Launcher Profile v1

Subsystem ⇄ Main
    每 Subsystem 一条 localhost Control WebSocket
    ├── Subsystem Control Protocol v1
    └── Frame / Call Protocol v1

Renderer ⇄ Main
    每 Session 一条 localhost Control WebSocket

Renderer ⇄ Subsystem
    每 Subsystem 一条 localhost System Data WebSocket
```

Subsystem Control 与 Frame / Call 共享物理 Control WebSocket 时，必须保持独立协议状态机和所有权语义。

## 6. PWA 入口

```text
Window
    → web-renderer + pwa-host

Main Runtime Worker
    → main-system browser adapter

Subsystem Worker
    → subsystem-sdk browser adapter
    → concrete subsystem

Service Worker
    → Content Service browser adapter
```

PWA Control MessagePort 的 envelope / credential transfer / termination observation 尚待 Profile 冻结，但 Frame identity / lifecycle / Activation 不因 Transport 改变。

## 7. 依赖规则

```text
protocol / contract packages
    不依赖实现包

main-system
    → subsystem-control / frame-call / game-package / launcher / content contracts
    不依赖 map-subsystem

subsystem-sdk
    → subsystem-control / frame-call / connection / render / input / content contracts

web-renderer
    → connection / render / input / content contracts
    不依赖 main-system 内部模块

map-subsystem
    → subsystem-sdk / render / input / content contracts

hostra-adapter
    → Hostra RPC client

pwa-host
    → browser transport adapters + frozen protocol contracts
```

禁止：

- `protocol-core` 引用地图类型；
- `main-system` 引用 Runtime Core；
- `web-renderer` 读取游戏包物理路径；
- `game-package` 自己 spawn Process；
- Node Launcher 接受未经 Resolver 验证的 Entry；
- Launcher 使用 Shell 解释 Entry；
- Main 无条件把完整 `process.env` 继承给 Subsystem；
- `map-subsystem` 直接操作 Electron 或 DOM；
- `hostra-adapter` 承载 LoomRealm Main；
- `subsystem-sdk` 为每 Frame 强制创建独立 Process / Worker / Transport；
- Frame / Call Protocol 重新定义 Runtime shutdown / restart；
- Frame lifecycle enum 加回 `failed`；
- Frame 协议增加 `ready / initialized / frame.status`；
- Renderer 用 Frame Stack 控制 Render lifecycle；
- Render Update Protocol 使用 Frame Activation Sequence；
- PWA 偷偷改变 frozen Control / Frame Batch A 语义。

## 8. Transport Adapter 边界

System Data Transport 上方分成：

```text
SystemDataTransport
├── RenderProtocolRouter(render identity)
└── UserInputRouter(frameId, activationId)
```

UserInputRouter 必须读取 Main-authorized current Activation，不自行推导 Input Target。

Control Transport Adapter 则把 Transport delivery 与上方 Subsystem Control / Frame Call 协议域分开。

## 9. Schema 与 Fixture

以 JSON Schema / 机器可校验 Contract 作为跨语言产物，并生成 TypeScript 类型和 runtime validator：

```text
schema/
generated/
src/
test-fixtures/
```

Frame Batch A fixture 至少覆盖：

```text
frameId unique / no reuse
permanent subsystem assignment
callerFrameId immutable
lifecycle transition model
no Frame ready/status
outcome separate from lifecycle
active ↔ current Activation invariant
new Activation on every reactivation
revoked Activation never valid again
stable Stack top-active / others-suspended
no two ordinary Input Targets
```

Batch B 再加入最终 RPC Schema fixture。

## 10. 发布策略

第一阶段可以保持 monorepo + unified version。协议稳定后再评估独立包版本。

Frame / Call v1 在 Batch F 以前整体包版本仍属于 pre-stable / Draft；但任何实现不得违反 Batch A 已 Frozen 的模型。
