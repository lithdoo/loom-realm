# LoomRealm 设计文档

LoomRealm 文档按照从粗到细的依赖顺序组织：

```text
产品目标与范围
→ 系统架构
→ 正式契约
→ 模块设计
→ 实施计划
```

上层文档说明为什么以及必须保持什么；下层文档说明当前准备怎样实现。

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md)
2. [文档分层与变更规则](./00-overview/document-governance.md)
3. [系统架构总览](./10-architecture/system-overview.md)
4. [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
5. [运行承载系统](./10-architecture/runtime-hosting-system.md)
6. [栈式运行系统](./10-architecture/stack-runtime-system.md)
7. [通信系统](./10-architecture/communication-system.md)
8. [渲染系统](./10-architecture/rendering-system.md)
9. [正式契约目录](./15-contracts/README.md)
10. [Game Package v2 Bootstrap / Descriptor](./15-contracts/game-package-v2.md)
11. [Desktop Node.js Launcher Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
12. [Main ⇄ Subsystem 控制与运行时生命周期协议](./15-contracts/subsystem-control-lifecycle-protocol.md)
13. [只读 Content API v1](./15-contracts/content-api-v1.md)
14. [模块设计目录](./20-modules/README.md)
15. [实施计划目录](./30-implementation/README.md)

## 当前核心结论

```text
Game Entry
    一次性声明本次会话全部 Subsystem Descriptor

Subsystem Descriptor
    key = 稳定身份
    launcher.type = nodejs（Desktop v1）
    launcher.entry = Installation Root 相对安全路径

Desktop Launcher
    Host 选择 Node.js Runtime
    shell = false
    child environment 显式构造
    Bootstrap Token 在 spawn 前注册
    Process 由 Runtime Supervisor 管理
    v1 不自动 restart

每个 Subsystem / System
    一个 Runtime Container
    Desktop = 一个 OS Process
    PWA = 一个 Dedicated Worker

每个 Runtime Container
    与 Main 一条长期 Control Connection
    与 Renderer 最多一条长期 System Data Connection
    可以承载 0..N Frame/Input Context
    可以拥有 0..N Render Context

Frame
    Main 管理的调用 / User Input Context
    不是进程、Worker、业务状态所有权单元或 Render 身份

Render
    完全由 Subsystem 管理
    不从 Frame Stack / Activation / close 推导生命周期
```

Desktop Bootstrap：

```text
Main Control Endpoint ready
→ 读取并校验全部 Descriptor
→ 安全解析全部 Launcher Entry
→ 创建 Launch Attempt / Bootstrap Token
→ Token registration
→ spawn 全部 nodejs Subsystem Process + Supervisor
→ Subsystem 主动连接 Main
→ subsystem.hello 绑定 descriptor.key
→ subsystem.status(state="ready")
→ 全部声明 Subsystem ready
→ Renderer 按 Main 授权建立每 Subsystem 一条 System Data Connection
```

核心边界：

```text
spawn success ≠ connected ≠ identified ≠ ready
```

Desktop `nodejs` Profile 中 executable Subsystem JavaScript 属于 trusted code；安全 `launcher.entry` 只限制 Main 执行哪个 Installation 文件，不构成 Node.js OS sandbox。

Renderer–Subsystem System Data Connection 内分为三个独立协议域：

```text
Connection Layer
Render Update Protocol
User Input Protocol
```

Render Update 使用独立 Render identity；User Input 使用 Frame / Activation identity。二者共享 System Transport，但不共享生命周期、Sequence 或恢复语义。

内容面独立使用只读 Content API：

```text
Runtime / Renderer
→ manifest / record / group / resource
→ Desktop localhost HTTP 或 PWA same-origin Fetch
```

Content API 不提供任意物理路径或执行能力；这一能力边界与 Desktop Node Process 的 OS 权限必须分开理解。

## 00 · 产品总览

- [产品设计总览](./00-overview/product-vision.md)
- [文档分层与变更规则](./00-overview/document-governance.md)

产品层不记录具体包名、RPC 字段或实现参数。

## 10 · 系统架构

- [系统架构总览](./10-architecture/system-overview.md)
- [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
- [栈式运行系统](./10-architecture/stack-runtime-system.md)
- [运行承载系统](./10-architecture/runtime-hosting-system.md)
- [通信系统](./10-architecture/communication-system.md)
- [Renderer–Subsystem 协议分层](./10-architecture/renderer-subsystem-protocol-layers.md)
- [渲染系统](./10-architecture/rendering-system.md)
- [存储与内容系统](./10-architecture/storage-system.md)
- [模块子系统模型](./10-architecture/subsystem-model.md)

## 15 · 正式契约

- [正式契约目录](./15-contracts/README.md)
- [Game Package v2 Bootstrap / Descriptor Contract](./15-contracts/game-package-v2.md)
- [Desktop Node.js Launcher Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
- [Main ⇄ Subsystem 控制与运行时生命周期协议 v1](./15-contracts/subsystem-control-lifecycle-protocol.md)
- [Frame 生命周期与调用协议草案](./15-contracts/system-lifecycle-protocol.md)
- [只读 Content API v1](./15-contracts/content-api-v1.md)
- [Renderer–Subsystem 数据协议 v1（Legacy）](./15-contracts/frame-data-channel-v1.md)
- [Client Scoped State Tree v1（Legacy）](./15-contracts/client-state-tree-v1.md)
- [游戏包契约 v1（Legacy for new bootstrap）](./15-contracts/game-package-v1.md)
- [资源交付协议草案（Superseded）](./15-contracts/resource-protocol.md)

旧 v1 文件为迁移和历史互操作保留，不得作为新增 Frame/Render 所有权或 Subsystem Bootstrap 设计依据。

## 20 · 模块设计

- [模块设计目录](./20-modules/README.md)
- [程序主系统模块](./20-modules/main-system/README.md)
- [Web 渲染端模块](./20-modules/web-renderer/README.md)
- [游戏包与内容模块](./20-modules/game-package/README.md)
- [FSDB Content Service](./20-modules/fsdb-content-service/README.md)
- [`loom.map` 地图子系统](./20-modules/loom-map/README.md)
- [Hostra 桌面宿主模块](./20-modules/desktop-host/README.md)
- [PWA 宿主模块](./20-modules/pwa-host/README.md)

## 30 · 实施计划

- [实施计划目录](./30-implementation/README.md)
- [仓库与分包方案](./30-implementation/repository-layout.md)
- [测试策略](./30-implementation/testing-strategy.md)
- [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)

## 设计决策记录

- [ADR 0001：每个 System 一个 Runtime Container](./decisions/0001-system-container-per-system-id.md)
- [ADR 0002：平台传输 Profile](./decisions/0002-platform-transport-profiles.md)
- [ADR 0003：逻辑只读 Content API](./decisions/0003-readonly-content-api.md)
- [ADR 0004：Client State 渲染流水线](./decisions/0004-client-state-rendering-pipeline.md)
- [ADR 0005：Game Entry 声明 Subsystem Launcher](./decisions/0005-game-entry-subsystem-launchers.md)
- [ADR 0006：Frame 与 Render 生命周期解耦](./decisions/0006-frame-render-decoupling.md)
- [ADR 0007：Subsystem Descriptor MVP 收敛](./decisions/0007-subsystem-descriptor-mvp.md)
- [ADR 0008：Desktop Node.js Launcher Profile v1](./decisions/0008-desktop-nodejs-launcher-profile-v1.md)

ADR 保存历史决策过程。当前有效结论以 `00-overview`、`10-architecture` 和 `15-contracts` 的当前权威文档为准，不通过重写旧 ADR 表达新的决定。ADR 0008 明确补充并部分替代 ADR 0007 中 `launcher.entry` 尚未冻结的历史状态。

## 当前明确暂缓

Launcher 相关以下能力不属于 Desktop v1：

- PWA Launcher Descriptor 映射；
- 第二种 Launcher Type；
- executable sandbox / Publisher Trust / signing；
- automatic Runtime restart / checkpoint；
- lazy / idle recycle；
- 一个 `key` 多 Runtime instance；
- remote Subsystem；
- Game-supplied Node executable / flags / argv；
- graceful shutdown wire method / timeout 默认数值。

实现不得以优化名义隐式增加这些语义。

## 迁移状态

当前仍存在若干旧路径文档。它们只作为历史和迁移资料保留；如果旧目录内容与新分层文档冲突，应以 [文档分层与变更规则](./00-overview/document-governance.md) 的依赖顺序处理，并修复旧文档状态，而不是依赖提交时间判断真相。

尤其不得继续新增以下旧模型：

- 一 Frame 一个进程 / Worker；
- 每 Frame 一个物理 Renderer Transport；
- Frame 固定拥有业务 Runtime、Projector 或 Render State；
- Frame suspend / close 自动隐藏或销毁 Render；
- Renderer 根据 Frame Stack 推导 Render 集合；
- 首次 Frame 调用才启动当前 MVP 中已声明的 Subsystem；
- 游戏包仅声明 `systemId`、平台 Registry 提供所有可执行实现；
- 把 Process spawn 当作 Subsystem ready；
- Desktop v1 failed Runtime 隐式自动 restart；
- 把 Content API 的只读能力误写成 Node Process 的 OS sandbox。
