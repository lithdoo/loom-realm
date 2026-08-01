# 仓库与分包方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：建议的代码分包、进程入口和依赖规则  
> 依赖：[模块设计目录](../20-modules/README.md)  
> 最近复核：2026-08-01

本方案用于指导第一阶段落地，不是产品协议。包名可以在实现前调整。

## 1. 建议工作区

```text
packages/
├── protocol-core/
├── system-lifecycle-protocol/
├── renderer-subsystem-protocol/
├── client-state-protocol/
├── content-api-contract/
├── game-package-contract/
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

## 2. 协议包

### `protocol-core`

公共 JSON 值、JSON-RPC Envelope、错误 Envelope、版本协商和 Schema 工具。不得依赖任何业务模块。

### `system-lifecycle-protocol`

Runtime Container、Frame、Activation、调用和返回消息类型及 JSON Schema。

### `renderer-subsystem-protocol`

定义 Renderer ⇄ Runtime Container 数据协议：

- System Data Connection Identity；
- Frame Logical Stream Identity；
- `input.dispatch`、`node.event`、`state.resync`；
- `state.snapshot`、`scope.replace`、`event.emit`；
- Frame 级 Sequence、背压、Resync 和错误作用域。

协议不绑定 WebSocket 或 MessagePort。

### `client-state-protocol`

Frame Client State、Scope、Node 和校验器。状态运输由 `renderer-subsystem-protocol` 负责。

### `content-api-contract`

逻辑只读 Content API 的 route、response、error、version 和缓存语义。

### `game-package-contract`

游戏清单、入口文件和路径安全公共类型。

协议包应能独立发布或至少独立测试，不依赖 Main、Renderer 或地图实现。

## 3. 平台包

### `main-system`

实现 Registry、Frame Stack、Lifecycle、Process/Worker Supervisor、Renderer Control 和 System Data Channel Authority。

### `subsystem-sdk`

提供：

- Container 控制协议适配；
- Frame Runtime Registry / Router；
- Renderer System Data Transport Server Adapter；
- Frame Logical Stream 的身份、Sequence 和 Schema 校验；
- Content Client 基础设施。

SDK 不能要求子系统使用固定内部架构，也不能把每个 Frame 绑定成独立物理连接。

### `web-renderer`

实现：

- Stack Store；
- System Data Connection Registry；
- Frame Stream Registry；
- Frame/Scope Store；
- Input Router；
- Node Registry；
- DOM/Canvas/WebGL Reconciler。

### `game-package`

实现 Safe Package Root、Manifest/Entry Loader、Catalog 基础能力和 Validator。

### `fsdb-content-service`

实现桌面 localhost HTTP Content Service 的 Route、Index Resolver、Storage Adapter、MIME、ETag 和授权。

### `pwa-host`

实现 Main/System Worker、每 System 控制/Data MessagePort、Service Worker Content Service、OPFS Installer 和页面生命周期协调。

## 4. 业务与适配包

### `map-subsystem`

实现 `loom.map` 的 Adapter、Coordinator、Execution Loop、Core、Projector 和地图 Repository。一个 `loom.map` Container 可以承载多个 Frame Runtime，并共享 Renderer Data Transport 和不可变 Repository Cache。

### `map-content-profile-pe`

实现 Pokémon Essentials v21.1 导出、兼容编译、Autotile 和 Tile Property 转换。它不应进入平台协议包依赖图。

### `hostra-adapter`

只实现 Hostra 窗口调用和桌面宿主适配：

- 请求 Hostra 打开/关闭 BrowserWindow；
- 生成 Renderer URL；
- 处理窗口关闭/崩溃通知；
- 不承载 LoomRealm Main；
- 不提供通用 Preload IPC；
- 不转发 Renderer ⇄ Subsystem 业务 Payload。

### `test-subsystems`

包含 `echo`、`nested-call`、`multi-frame`、`cancel`、`failure`、`state-demo` 等最小 Runtime Container，用于先验证协议、调用栈和共享 Transport 多路复用。

## 5. 进程与 Worker 入口

### Desktop

```text
loom-realm CLI
    → main-system

FSDB Content Service Process
    → fsdb-content-service

Hostra Main Process
    → Hostra 自身窗口宿主

Hostra Renderer Process
    → web-renderer

Subsystem Process: <systemId>
    → subsystem-sdk
    → concrete subsystem
```

连接：

```text
Renderer ⇄ Main
    每会话一条 localhost WebSocket

Main ⇄ Subsystem Process
    每 System 一条 localhost WebSocket

Renderer ⇄ Subsystem Process
    每 System 一条 localhost WebSocket
```

### PWA

```text
Window
    → web-renderer + pwa-host

Main Runtime Worker
    → main-system browser adapter

System Worker: <systemId>
    → subsystem-sdk browser adapter
    → concrete subsystem

Service Worker
    → Content Service browser adapter
```

连接：

```text
Window ⇄ Main Worker
    控制 MessagePort

Main Worker ⇄ System Worker
    每 System 控制 MessagePort

Window ⇄ System Worker
    每 System Data MessagePort
```

每个进程/Worker 入口只组装依赖，不保存跨层业务逻辑。

## 6. 依赖规则

```text
protocol packages
    不依赖实现包

main-system
    → protocol、game-package
    不依赖 map-subsystem

web-renderer
    → protocol、content client
    不依赖 main-system 内部模块

map-subsystem
    → protocol、subsystem-sdk、game-package repository toolkit

hostra-adapter
    → Hostra RPC client、web-renderer build artifacts
    不依赖 main-system 内部实现

pwa-host
    → protocol adapters、web-renderer build artifacts
```

禁止：

- `protocol-core` 引用地图类型；
- `main-system` 引用 Runtime Core；
- `web-renderer` 读取游戏包物理路径；
- `map-subsystem` 直接操作 Electron 或 DOM；
- `hostra-adapter` 承载 LoomRealm Main；
- `subsystem-sdk` 为每个 Frame 强制创建独立 WebSocket / MessagePort；
- 兼容编译包进入运行时热路径。

## 7. Transport Adapter 边界

建议公共抽象：

```ts
interface SystemDataTransport {
  readonly systemId: string;
  readonly connectionId: string;
  send(message: RendererSubsystemMessage): void;
  close(): void;
}
```

Frame 路由位于 Transport 之上：

```text
SystemDataTransport
→ FrameStreamRouter(frameId, activationId)
→ Frame Runtime / Renderer Frame Store
```

Transport Adapter 负责 WebSocket / MessagePort 的连接行为；Frame Stream Router 负责多路复用、Sequence 和流级故障隔离。

## 8. Schema 与类型生成

建议以 JSON Schema 作为跨语言契约产物，并生成 TypeScript 类型和运行时 Validator。

源码目录应明确区分：

```text
schema/
generated/
src/
test-fixtures/
```

生成代码不得手工修改，Schema 变更必须触发兼容性检查和 Golden Fixture 更新。

## 9. 发布策略

第一阶段可以保持单仓库和统一版本。协议稳定后再评估独立包版本。

任何包拆分或合并，只要不改变系统职责和协议，不视为产品架构变更。
