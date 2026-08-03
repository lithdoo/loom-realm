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

至少包含：

- Descriptor Schema validator；
- Entry logical syntax validator；
- reserved env validator；
- machine-readable error categories；
- conformance fixtures。

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

当前 v1 已收敛：

- `subsystem.hello`；
- Bootstrap Credential consumption；
- Control Connection identity binding；
- `subsystem.status`；
- Runtime lifecycle state machine。

Launcher 负责在 Process spawn 前创建并注册 Credential；Control Protocol 负责在 hello 时认证/消费 Credential。

### `frame-call-protocol`

待冻结：

- Frame initialize / activate / suspend / resume / close；
- Subsystem call / return；
- Activation；
- 幂等、取消、超时和错误。

不包含 Render State。

### `renderer-subsystem-connection-protocol`

System Data Connection：

- Session / Subsystem / Connection identity；
- Grant authentication；
- Protocol capability/version；
- heartbeat / reconnect / replace / close。

### `render-update-protocol`

Subsystem-owned Render：

- Render lifecycle；
- Render State / Event；
- Revision / ordering；
- recovery / resync；
- composition hooks。

不使用 Frame Activation 作为 Render epoch。

### `user-input-protocol`

- `frameId + activationId` 输入路由；
- continuous intent；
- discrete action；
- input reset；
- UI Interaction；
- input-domain ordering/backpressure。

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
- Control Connection Registry；
- Frame Stack / Activation / Input Target；
- Frame / Call Coordinator；
- Renderer Control Publisher；
- System Data Connection Authority。

Desktop Launcher 实现必须遵守：

```text
validated target only
Host-selected Node.js
shell=false
explicit child environment
Bootstrap Token registered before spawn
Supervisor observation
no automatic restart in v1
```

### `subsystem-sdk`

提供：

- Bootstrap Context decoder；
- Control Protocol client / adapter；
- Frame Input Context registry/router；
- Renderer System Data server/adapter；
- Render Update adapter；
- User Input adapter；
- Content Client。

SDK 不要求 Subsystem 使用 per-Frame business state、per-Frame Projector 或 per-Frame Render。

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

### `game-package`

Manifest/Entry/Descriptor Loader、Launcher Entry Validator、Catalog 与 Repository Toolkit。

不启动 Subsystem Process。

### `fsdb-content-service`

Desktop localhost HTTP / PWA Service Worker 的统一只读 Content API 实现。

### `pwa-host`

Main/Subsystem Worker、Control/Data MessagePort、Service Worker、OPFS Installer 和页面生命周期协调。

PWA Launcher Descriptor 映射仍待冻结；不得直接复用 Desktop Node.js Process Profile。

## 4. 业务与适配包

### `map-subsystem`

实现 `loom.map` 的 Control Adapter、Frame Input Adapter、Coordinator、Execution Loop/Core、Render Manager/Projector、Repository。

一个 `loom.map` Process 可以承载多个 Frame/Input Context，并由地图自己决定共享或拆分业务 world/session/render。

### `map-content-profile-pe`

实现 Pokémon Essentials v21.1 兼容编译，不进入平台协议依赖图。

### `hostra-adapter`

只负责 Hostra Window RPC / Renderer URL / Window lifecycle，不承载 LoomRealm Main，不转发业务 Payload。

### `test-subsystems`

建议包含：

```text
hello-ready
never-ready
early-exit
exit-zero-after-ready
ignore-shutdown
echo-input
nested-call
multi-frame-input
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

Subsystem → Main
    每 Subsystem 一条 localhost Control WebSocket

Renderer ⇄ Main
    每 Session 一条 localhost Control WebSocket

Renderer ⇄ Subsystem
    每 Subsystem 一条 localhost System Data WebSocket
```

Launcher 链与 Control 链的边界不得合并成“spawn 后即 ready”。

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

连接：

```text
Window ⇄ Main Worker
    Control MessagePort

Main Worker ⇄ Subsystem Worker
    每 Subsystem Control MessagePort

Window ⇄ Subsystem Worker
    每 Subsystem System Data MessagePort
```

## 7. 依赖规则

```text
protocol / contract packages
    不依赖实现包

main-system
    → control / frame-call / game-package / launcher / content contracts
    不依赖 map-subsystem

web-renderer
    → connection / render / input / content contracts
    不依赖 main-system 内部模块

map-subsystem
    → subsystem-sdk / render / input / content contracts

hostra-adapter
    → Hostra RPC client

pwa-host
    → browser transport adapters
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
- Renderer 用 Frame Stack 控制 Render lifecycle；
- Render Update Protocol 使用 Frame Activation Sequence；
- Desktop v1 自动 restart failed Runtime；
- PWA 偷偷实现当前未定义的 lazy / Desktop Launcher 语义。

## 8. Transport Adapter 边界

建议：

```ts
interface SystemDataTransport {
  readonly subsystemRef: string;
  readonly connectionId: string;
  send(message: RendererSubsystemMessage): void;
  close(): void;
}
```

Transport 上方分成：

```text
SystemDataTransport
├── RenderProtocolRouter(render identity)
└── UserInputRouter(frameId, activationId)
```

不建立统一 FrameStreamRouter 负责全部数据消息。

## 9. Schema 与 Fixture

以 JSON Schema / 机器可校验 Contract 作为跨语言产物，并生成 TypeScript 类型和 runtime validator：

```text
schema/
generated/
src/
test-fixtures/
```

Launcher 额外维护 filesystem/process conformance fixtures，覆盖 Entry escape、symlink、env、spawn、exit classification 和 termination。

生成代码不得手工修改。Contract 变更触发兼容性检查和 Golden Fixture 更新。

## 10. 发布策略

第一阶段可以保持 monorepo + unified version。协议稳定后再评估独立包版本。

包拆分或合并只要不改变系统职责和协议，就不是产品架构变更。
