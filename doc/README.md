# LoomRealm 设计文档

LoomRealm 文档按依赖顺序组织：

```text
产品目标与范围
→ 系统架构
→ 正式契约
→ 模块设计
→ 实施计划
```

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
Game Package / Desktop Launcher
    Frozen

Subsystem Control v1
    Frozen

Frame / Call v1
    overall Draft
    Batch A Frozen
    Batch B Frozen
    Batch C Frozen
    Batch D-F Draft
```

### Batch A

Frame 是 Main-owned call/input Context：`frameId` Session unique/never reused，永久绑定 `descriptor.key`，caller Main-owned immutable；lifecycle=`starting/active/suspended/closing/closed`；outcome 与 lifecycle 分离；Activation one-shot、never reused/resumed/rolled back；无 Frame ready/status。

### Batch B

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

七个方法都是 JSON-RPC Request；Caller relationship 不下发；close 无 reason；resume 同时交付 Child Outcome + replacement Activation；call 不等待最终业务结果；no `system.call/system.return/frame.result`。

### Batch C

```text
Call Acceptance Commit
    Caller suspended
    old Activation revoked
    Child starting / pushed
    InputTarget = null
        ↓
frame.call Success
        ↓
Child initialize / activate ACK
        ↓
Child InputTarget publish
```

ordinary call 不额外发送 `frame.suspend`。Main 必须先完成 `frame.call` Response，再依赖 Child RPC。

```text
Return Acceptance Commit
    outcome accepted
    Child old Activation revoked
    Child closing
    InputTarget = null
        ↓
frame.return Success
        ↓
close ACK / pop
        ↓
resume Caller(new Activation) ACK
        ↓
Caller InputTarget publish
```

冻结 causal rules：

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller InputTarget publication
```

Pre-commit failure 可 abort；Post-commit failure 只能 forward recovery。revoked Activation 永久不恢复，accepted terminal outcome 不撤销。same-Subsystem recursive call 不依赖 nested bidirectional Request handler reentrancy。

下一冻结目标：**Batch D — semantic error / timeout / retry / cancellation**。

## Runtime / Frame / Render 边界

```text
spawn success ≠ connected ≠ identified ≠ ready
shutdown Response ≠ stopped
Frame outcome ≠ Frame lifecycle
Frame lifecycle ≠ Render lifecycle
```

Renderer 只使用 Main 已 commit 的 current Activation/InputTarget；transaction gap 可为 `InputTarget=null`。Render 完全由 Subsystem 管理，独立于 Frame/Activation。

Renderer–Subsystem Data Connection 分为 Connection Layer / Render Update / User Input 三域。Content 独立使用 Readonly Content API。

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

### 20 · 模块设计
- [模块设计目录](./20-modules/README.md)
- [程序主系统](./20-modules/main-system/README.md)
- [Web Renderer](./20-modules/web-renderer/README.md)
- [`loom.map`](./20-modules/loom-map/README.md)
- [Hostra Desktop](./20-modules/desktop-host/README.md)
- [PWA Host](./20-modules/pwa-host/README.md)

### 30 · 实施计划
- [实施计划目录](./30-implementation/README.md)
- [仓库与分包方案](./30-implementation/repository-layout.md)
- [测试策略](./30-implementation/testing-strategy.md)
- [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)

## ADR

- [ADR 0008 · Desktop Node.js Launcher v1](./decisions/0008-desktop-nodejs-launcher-profile-v1.md)
- [ADR 0009 · Subsystem Control v1](./decisions/0009-freeze-subsystem-control-protocol-v1.md)
- [ADR 0010 · Frame / Call Batch A](./decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)
- [ADR 0011 · Frame / Call Batch B](./decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)
- [ADR 0012 · Frame / Call Batch C](./decisions/0012-freeze-frame-call-protocol-v1-batch-c.md)

当前有效结论以 `00-overview`、`10-architecture`、`15-contracts` 为准；ADR 保存历史决策过程。

## 当前推进状态

```text
Game Package v2 / Launcher v1       Frozen
Subsystem Control v1                Frozen
Frame / Call Batch A                Frozen
Frame / Call Batch B                Frozen
Frame / Call Batch C                Frozen
Frame / Call Batch D                Next
Frame / Call Batch E-F              Draft
Main ⇄ Renderer Control             Draft target
Renderer ⇄ Subsystem Connection     Draft target
User Input / Render Update          Draft target
Render State                        Draft target
```

明确暂缓：PWA Launcher/Credential/Control Transport Profile、第二 Launcher、sandbox/Publisher Trust、automatic Runtime recovery、Control heartbeat/same-attempt reconnect、lazy/idle recycle、多 Runtime per key、多主栈/Frame Graph、Frame migration、Activation reuse/persistent resume。
