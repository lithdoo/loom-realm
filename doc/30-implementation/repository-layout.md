# 仓库与分包方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：建议的代码分包、进程入口和依赖规则  
> 依赖：[模块设计目录](../20-modules/README.md)  
> 最近复核：2026-07-29

本方案用于指导第一阶段落地，不是产品协议。包名可以在实现前调整。

## 1. 建议工作区

```text
packages/
├── protocol-core/
├── system-lifecycle-protocol/
├── client-state-protocol/
├── game-package-contract/
├── main-system/
├── subsystem-sdk/
├── web-renderer/
├── game-package/
├── resource-service/
├── map-subsystem/
├── map-content-profile-pe/
├── hostra-adapter/
└── test-subsystems/
```

## 2. 协议包

### `protocol-core`

公共 JSON 值、RPC Envelope、错误 Envelope、版本协商和 Schema 工具。不得依赖任何业务模块。

### `system-lifecycle-protocol`

Frame、Activation、调用和返回消息类型及 JSON Schema。

### `client-state-protocol`

Frame Client State、Scope、Node、状态消息和校验器。

### `game-package-contract`

游戏清单、入口文件和路径安全公共类型。

协议包应能独立发布或至少独立测试，不依赖 Main、Renderer 或地图实现。

## 3. 平台包

### `main-system`

实现 Registry、Frame Stack、Lifecycle、Process Supervisor 和 Renderer Control。

### `subsystem-sdk`

提供子系统进程握手、生命周期适配、RPC 客户端/服务端和数据通道基础设施。SDK 不能要求子系统使用固定内部架构。

### `web-renderer`

实现 Stack/Frame/Scope Store、输入路由、Node Registry 和 DOM Reconciler。

### `game-package`

实现 Safe Package Root、Manifest/Entry Loader、Catalog 基础能力和 Validator。

### `resource-service`

实现受限资源交付。协议未冻结前可以先作为内部实验包。

## 4. 业务与适配包

### `map-subsystem`

实现 `loom.map` 的 Adapter、Coordinator、Execution Loop、Core、Projector 和地图 Repository。

### `map-content-profile-pe`

实现 Pokémon Essentials v21.1 导出、兼容编译、Autotile 和 Tile Property 转换。它不应进入平台协议包依赖图。

### `hostra-adapter`

实现 Electron/Hostra Main、Preload 和 MessagePort 适配，不包含游戏业务。

### `test-subsystems`

包含 `echo`、`nested-call`、`cancel`、`failure`、`state-demo` 等最小进程，用于先验证协议和调用栈。

## 5. 进程入口

```text
loom-realm CLI / Hostra Main
    → main-system

Web Renderer
    → web-renderer

Subsystem Process
    → subsystem-sdk
    → concrete subsystem
```

每个进程入口只组装依赖，不保存跨层业务逻辑。

## 6. 依赖规则

```text
protocol packages
    不依赖实现包

main-system
    → protocol、game-package
    不依赖 map-subsystem

web-renderer
    → protocol、resource client
    不依赖 main-system 内部模块

map-subsystem
    → protocol、subsystem-sdk、game-package repository toolkit

hostra-adapter
    → main-system、web-renderer build artifacts
```

禁止：

- `protocol-core` 引用地图类型；
- `main-system` 引用 Runtime Core；
- `web-renderer` 读取游戏包物理路径；
- `map-subsystem` 直接操作 Electron 或 DOM；
- 兼容编译包进入运行时热路径。

## 7. Schema 与类型生成

建议以 JSON Schema 作为跨语言契约产物，并生成 TypeScript 类型和运行时 Validator。

源码目录应明确区分：

```text
schema/
generated/
src/
test-fixtures/
```

生成代码不得手工修改，Schema 变更必须触发兼容性检查和 Golden Fixture 更新。

## 8. 发布策略

第一阶段可以保持单仓库和统一版本。协议稳定后再评估独立包版本。

任何包拆分或合并，只要不改变系统职责和协议，不视为产品架构变更。