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
12. [Subsystem Control Protocol v1](./15-contracts/subsystem-control-lifecycle-protocol.md)
13. [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
14. [只读 Content API v1](./15-contracts/content-api-v1.md)
15. [模块设计目录](./20-modules/README.md)
16. [实施计划目录](./30-implementation/README.md)

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

Subsystem Control Protocol v1
    subsystem.hello
    subsystem.status
    subsystem.shutdown
    Main 拥有正常 Runtime shutdown intent
    stopped 只来自 Supervisor termination observation
    无 application heartbeat / same-attempt reconnect / resume

Frame / Call Protocol v1
    整体仍 Draft
    Batch A 已 Frozen：identity / authority / lifecycle / Activation

Frame
    frameId = Main-generated / Session unique / never reused
    permanently bound to descriptor.key
    callerFrameId immutable
    lifecycle = starting / active / suspended / closing / closed
    completed / cancelled / failed = outcome, not lifecycle
    no Frame ready / initialized / frame.status

Activation
    Main-generated / Session unique / never reused
    only active Frame owns current Activation
    revoked Activation never becomes valid again
    Frame 每次重新 active 都获得新 Activation

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

Desktop 正常 Runtime 结束：

```text
Main establishes shutdown intent
→ subsystem.shutdown(session-end | bootstrap-abort)
→ subsystem.status(stopping) [optional]
→ Supervisor confirms Process exit
→ stopped
```

Frame 稳定状态：

```text
Stack Top
    active + current Activation

all other live Frames
    suspended + no current Activation
```

核心边界：

```text
spawn success ≠ connected ≠ identified ≠ ready
shutdown Response ≠ stopped
status(stopping) ≠ stopped
Frame outcome ≠ Frame lifecycle state
Frame lifecycle ≠ Render lifecycle
```

没有 Main shutdown intent 的 Control Connection loss 或 Runtime exit 是 failure，即使 Process exit code 为 0。

Desktop `nodejs` Profile 中 executable Subsystem JavaScript 属于 trusted code；安全 `launcher.entry` 只限制 Main 执行哪个 Installation 文件，不构成 Node.js OS sandbox。

Renderer–Subsystem System Data Connection 内分为三个独立协议域：

```text
Connection Layer
Render Update Protocol
User Input Protocol
```

Render Update 使用独立 Render identity；User Input 使用 Frame / Activation identity。二者共享 System Transport，但不共享生命周期、Sequence 或恢复语义。

内容面独立使用只读 Content API。

## 00 · 产品总览

- [产品设计总览](./00-overview/product-vision.md)
- [文档分层与变更规则](./00-overview/document-governance.md)

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
- [Subsystem Control Protocol v1](./15-contracts/subsystem-control-lifecycle-protocol.md)
- [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
- [只读 Content API v1](./15-contracts/content-api-v1.md)
- [旧 Frame 生命周期草案路径（Legacy）](./15-contracts/system-lifecycle-protocol.md)
- [Renderer–Subsystem 数据协议 v1（Legacy）](./15-contracts/frame-data-channel-v1.md)
- [Client Scoped State Tree v1（Legacy）](./15-contracts/client-state-tree-v1.md)
- [游戏包契约 v1（Legacy for new bootstrap）](./15-contracts/game-package-v1.md)
- [资源交付协议草案（Superseded）](./15-contracts/resource-protocol.md)

旧路径只为迁移和历史互操作保留，不得作为新增 Frame/Render 所有权或 Runtime Bootstrap 设计依据。

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
- [ADR 0009：Subsystem Control Protocol v1](./decisions/0009-freeze-subsystem-control-protocol-v1.md)
- [ADR 0010：Frame / Call Protocol v1 Batch A](./decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)

ADR 保存历史决策过程。当前有效结论以 `00-overview`、`10-architecture` 和 `15-contracts` 的当前权威文档为准，不通过重写旧 ADR 表达新的决定。

## 当前协议推进状态

```text
Game Package v2 / Launcher v1       Frozen
Subsystem Control Protocol v1       Frozen
Frame / Call v1 Batch A             Frozen
Frame / Call v1 Batch B-F           Draft
Main ⇄ Renderer Control             Draft target
Renderer ⇄ Subsystem Connection     Draft target
User Input / Render Update          Draft target
Render State                        Draft target
```

下一冻结目标是 Frame / Call Batch B：7 个 RPC 的最终 Schema 与 pre/postcondition。

## 当前明确暂缓

- PWA Launcher Descriptor / Bootstrap Credential / Control Transport Profile；
- 第二种 Launcher Type；
- executable sandbox / Publisher Trust / signing；
- automatic Runtime restart / checkpoint；
- lazy / idle recycle；
- 一个 `key` 多 Runtime instance；
- remote Subsystem；
- Game-supplied Node executable / flags / argv；
- application-level Control heartbeat；
- same-attempt Control reconnect；
- 多主栈 / 一般 Frame Graph；
- Frame migration；
- Activation reuse / persistent resume。

实现不得以优化名义隐式增加这些语义。
