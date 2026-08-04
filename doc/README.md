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
10. [Game Package v2](./15-contracts/game-package-v2.md)
11. [Desktop Node.js Launcher Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
12. [Subsystem Control Protocol v1](./15-contracts/subsystem-control-lifecycle-protocol.md)
13. [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
14. [只读 Content API v1](./15-contracts/content-api-v1.md)
15. [模块设计目录](./20-modules/README.md)
16. [实施计划目录](./30-implementation/README.md)

## 当前核心结论

```text
Game Entry
    declares all required Subsystem descriptors

Desktop Launcher v1
    key + nodejs + safe entry + explicit env
    token-before-spawn
    Supervisor owns process existence

Subsystem Control v1
    hello / status / shutdown
    Main-owned shutdown intent
    stopped only from Supervisor observation
    no app heartbeat / same-attempt reconnect / resume

Frame / Call v1
    overall Draft
    Batch A Frozen
    Batch B Frozen
    Batch C-F Draft
```

### Frame Batch A

```text
frameId
    Main-generated / Session unique / never reused

Frame → Subsystem
    permanent descriptor.key assignment

callerFrameId
    Main-owned / immutable

lifecycle
    starting / active / suspended / closing / closed

outcome
    completed / cancelled / failed
    separate from lifecycle

Activation
    only active Frame owns current Activation
    Main-generated / never reused
    revoked Activation never valid again
```

v1 无 Frame `ready / initialized / frame.status`。

### Frame Batch B

```text
Main → Subsystem
    frame.initialize({ frameId, input })
    frame.activate({ frameId, activationId })
    frame.suspend({ frameId, activationId })
    frame.resume({ frameId, activationId, returnedFrameId, result })
    frame.close({ frameId })

Subsystem → Main
    frame.call({ frameId, activationId, targetSubsystemKey, input })
        → { childFrameId }
    frame.return({ frameId, activationId, result })
        → {}
```

Batch B 冻结：

- exactly seven JSON-RPC Requests；
- source Subsystem identity 来自 authenticated Control Connection；
- `callerFrameId` 不进入 initialize/return wire；
- `frame.close` 无 reason；
- `frame.resume` 同时交付 Child Outcome + replacement Activation；
- `frame.call` 不等待 Child 最终业务结果；
- Child outcome 通过 `frame.return → Main → frame.resume` 交付；
- `FrameOutcome.completed.value` 必填，无返回值使用 `null`；
- no `system.call / system.return / frame.result`；
- RPC Schema closed，结构错误使用 `-32602`。

下一冻结目标：**Batch C — transaction / commit barrier / rollback**。

## Runtime / Frame / Render 边界

```text
spawn success ≠ connected ≠ identified ≠ ready
shutdown Response ≠ stopped
Frame outcome ≠ Frame lifecycle
Frame lifecycle ≠ Render lifecycle
```

Frame 不是 Process、业务状态 ownership 或 Render ownership 单元。Render 完全由 Subsystem 管理。

稳定 Stack：

```text
Stack Top
    active + current Activation

all other live Frames
    suspended + no current Activation
```

ordinary User Input 只允许 Main-authorized active/current Activation；revoked Activation 永久拒绝。

Renderer–Subsystem Data Connection 内分 Connection Layer / Render Update / User Input 三域，Render identity 独立于 Frame/Activation。

Content 独立使用 Readonly Content API。

## 文档目录

### 00 · 产品总览

- [产品设计总览](./00-overview/product-vision.md)
- [文档分层与变更规则](./00-overview/document-governance.md)

### 10 · 系统架构

- [系统架构总览](./10-architecture/system-overview.md)
- [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
- [栈式运行系统](./10-architecture/stack-runtime-system.md)
- [运行承载系统](./10-architecture/runtime-hosting-system.md)
- [通信系统](./10-architecture/communication-system.md)
- [Renderer–Subsystem 协议分层](./10-architecture/renderer-subsystem-protocol-layers.md)
- [渲染系统](./10-architecture/rendering-system.md)
- [存储与内容系统](./10-architecture/storage-system.md)
- [模块子系统模型](./10-architecture/subsystem-model.md)

### 15 · 正式契约

- [正式契约目录](./15-contracts/README.md)
- [Game Package v2](./15-contracts/game-package-v2.md)
- [Desktop Node.js Launcher Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
- [Subsystem Control Protocol v1](./15-contracts/subsystem-control-lifecycle-protocol.md)
- [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
- [只读 Content API v1](./15-contracts/content-api-v1.md)
- [旧 Frame 生命周期草案路径（Legacy）](./15-contracts/system-lifecycle-protocol.md)
- [Renderer–Subsystem Data v1（Legacy）](./15-contracts/frame-data-channel-v1.md)
- [Client State Tree v1（Legacy）](./15-contracts/client-state-tree-v1.md)

### 20 · 模块设计

- [模块设计目录](./20-modules/README.md)
- [程序主系统](./20-modules/main-system/README.md)
- [Web Renderer](./20-modules/web-renderer/README.md)
- [Game Package](./20-modules/game-package/README.md)
- [FSDB Content Service](./20-modules/fsdb-content-service/README.md)
- [`loom.map`](./20-modules/loom-map/README.md)
- [Hostra Desktop](./20-modules/desktop-host/README.md)
- [PWA Host](./20-modules/pwa-host/README.md)

### 30 · 实施计划

- [实施计划目录](./30-implementation/README.md)
- [仓库与分包方案](./30-implementation/repository-layout.md)
- [测试策略](./30-implementation/testing-strategy.md)
- [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)

## ADR

- [ADR 0001](./decisions/0001-system-container-per-system-id.md)
- [ADR 0002](./decisions/0002-platform-transport-profiles.md)
- [ADR 0003](./decisions/0003-readonly-content-api.md)
- [ADR 0004](./decisions/0004-client-state-rendering-pipeline.md)
- [ADR 0005](./decisions/0005-game-entry-subsystem-launchers.md)
- [ADR 0006](./decisions/0006-frame-render-decoupling.md)
- [ADR 0007](./decisions/0007-subsystem-descriptor-mvp.md)
- [ADR 0008](./decisions/0008-desktop-nodejs-launcher-profile-v1.md)
- [ADR 0009](./decisions/0009-freeze-subsystem-control-protocol-v1.md)
- [ADR 0010 · Frame / Call Batch A](./decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)
- [ADR 0011 · Frame / Call Batch B](./decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)

ADR 保存历史决策过程；当前有效结论以 `00-overview`、`10-architecture`、`15-contracts` 为准。

## 当前协议推进状态

```text
Game Package v2 / Launcher v1       Frozen
Subsystem Control Protocol v1       Frozen
Frame / Call Batch A                Frozen
Frame / Call Batch B                Frozen
Frame / Call Batch C                Next
Frame / Call Batch D-F              Draft
Main ⇄ Renderer Control             Draft target
Renderer ⇄ Subsystem Connection     Draft target
User Input / Render Update          Draft target
Render State                        Draft target
```

## 当前明确暂缓

PWA Launcher/Credential/Control Transport Profile、第二 Launcher、executable sandbox/Publisher Trust、automatic Runtime recovery、lazy/idle recycle、多 Runtime per key、remote Subsystem、Game-supplied Node flags/argv、Control heartbeat、same-attempt reconnect、多主栈/Frame Graph、Frame migration、Activation reuse/persistent resume。

实现不得以“优化”为由隐式增加这些语义。
