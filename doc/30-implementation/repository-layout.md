# 仓库与分包方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：建议的代码分包、进程入口和依赖规则  
> 依赖：[模块设计目录](../20-modules/README.md)  
> 最近复核：2026-08-02

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

最终包名可以调整；关键是不要重新把 Render 与 User Input 合并成 Frame-scoped data protocol。

## 2. 协议包

### `protocol-core`

公共 JSON 值、JSON-RPC Envelope、错误 Envelope、版本协商和 Schema 工具。

### `subsystem-control-protocol`

当前已冻结的 v1：

- `subsystem.hello`；
- Bootstrap Credential；
- Control Connection identity binding；
- `subsystem.status`；
- Runtime lifecycle state machine。

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

声明式 Render Tree / Scope / Node schema 和校验器。

Render identity 字段最终名称仍待冻结；实现包不应提前把架构示例 `renderId` 变成不可变公共 API。

### `content-api-contract`

逻辑只读 Content API route / response / error / cache / authorization。

### `game-package-contract-v2`

新的 Game Entry / Subsystem Descriptor：

```text
key
launcher.type = nodejs
launcher.entry
env
initial target
eager all-required bootstrap
```

`launcher.entry` 路径安全必须在真正实现执行能力前冻结。

## 3. 平台包

### `main-system`

实现：

- Descriptor Registry；
- Launcher Registry / Dispatcher；
- Runtime Supervisor；
- Control Connection Registry；
- Frame Stack / Activation / Input Target；
- Frame / Call Coordinator；
- Renderer Control Publisher；
- System Data Connection Authority。

### `subsystem-sdk`

提供：

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

Manifest/Entry/Descriptor Loader、Validator、Catalog 与 Repository Toolkit。

不启动 Subsystem Process。

### `fsdb-content-service`

Desktop localhost HTTP / PWA Service Worker 的统一只读 Content API 实现。

### `pwa-host`

Main/Subsystem Worker、Control/Data MessagePort、Service Worker、OPFS Installer 和页面生命周期协调。

PWA Launcher Descriptor 映射仍待冻结。

## 4. 业务与适配包

### `map-subsystem`

实现 `loom.map` 的：

- System Control Adapter；
- Frame Input Adapter；
- Coordinator；
- Execution Loop / Core；
- Render Manager / Projector；
- Repository。

一个 `loom.map` Process 可以承载多个 Frame/Input Context，并由地图自己决定共享或拆分业务 world/session/render。

### `map-content-profile-pe`

实现 Pokémon Essentials v21.1 兼容编译，不进入平台协议依赖图。

### `hostra-adapter`

只负责 Hostra Window RPC / Renderer URL / Window lifecycle，不承载 LoomRealm Main，不转发业务 Payload。

### `test-subsystems`

建议包含：

```text
echo-input
nested-call
multi-frame-input
render-without-frame
shared-render-multi-frame
independent-render-recovery
failure
```

## 5. Desktop 入口

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

连接：

```text
Renderer ⇄ Main
    每 Session 一条 localhost WebSocket

Subsystem → Main
    每 Subsystem 一条 localhost WebSocket

Renderer ⇄ Subsystem
    每 Subsystem 一条 localhost WebSocket
```

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
protocol packages
    不依赖实现包

main-system
    → control / frame-call / game-package / content contracts
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
- `map-subsystem` 直接操作 Electron 或 DOM；
- `hostra-adapter` 承载 LoomRealm Main；
- `subsystem-sdk` 为每 Frame 强制创建独立 Process / Worker / Transport；
- Renderer 用 Frame Stack 控制 Render lifecycle；
- Render Update Protocol 使用 Frame Activation Sequence；
- PWA 偷偷实现当前未定义的 lazy Subsystem 语义。

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

Transport 上方分成两个独立 Router：

```text
SystemDataTransport
├── RenderProtocolRouter(render identity)
└── UserInputRouter(frameId, activationId)
```

不再建立统一 FrameStreamRouter 负责全部数据消息。

## 9. Schema 与类型生成

以 JSON Schema 作为跨语言契约产物，并生成 TypeScript 类型和 runtime validator。

```text
schema/
generated/
src/
test-fixtures/
```

生成代码不得手工修改。Schema 变更触发兼容性检查和 Golden Fixture 更新。

## 10. 发布策略

第一阶段可以保持 monorepo + unified version。协议稳定后再评估独立包版本。

包拆分或合并只要不改变系统职责和协议，就不是产品架构变更。