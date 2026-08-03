# 第一阶段设计待办（Legacy / Superseded）

> 状态：**Legacy / Superseded**  
> 原用途：旧架构阶段的详细设计待办  
> 当前替代：[第一阶段交付计划](../30-implementation/phase-1-delivery-plan.md)、[测试策略](../30-implementation/testing-strategy.md)  
> 最近复核：2026-08-03

本文件不再作为当前 Tracking 来源。

旧内容基于已经被后续 ADR / Architecture / Contract 替代的模型，包括但不限于：

```text
平台固定 System Registry
游戏包不携带 Subsystem executable Entry
首次 Frame 调用启动进程
Frame-owned Client State / Scope
frameId + scopeId 作为 Render identity
Frame 出栈整体删除 Render State
每 Frame 独立 State Stream
Renderer 按 Frame 重建数据连接
```

这些模型与当前架构冲突，不得继续用于实现或关闭条件。

## 当前权威 Tracking

第一阶段工作只以以下当前文档追踪：

- [第一阶段交付计划](../30-implementation/phase-1-delivery-plan.md)；
- [测试策略](../30-implementation/testing-strategy.md)；
- [仓库与分包方案](../30-implementation/repository-layout.md)。

正式行为以：

- [正式契约目录](../15-contracts/README.md)；
- [Game Package v2 Bootstrap / Descriptor Contract](../15-contracts/game-package-v2.md)；
- [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)；
- [Main ⇄ Subsystem Control v1](../15-contracts/subsystem-control-lifecycle-protocol.md)；
- 对应 `10-architecture` 当前架构文档；

为准。

## 已明确替代的关键结论

当前模型：

```text
Game Entry
    一次声明全部 required Subsystem Descriptor

Desktop v1
    key + nodejs + eager/all-required
    launcher.entry = Installation-relative safe path
    Main 在 Frame 创建前启动全部 required Runtime

Runtime Container
    一 Subsystem 一个 Process / Worker
    可承载 0..N Frame/Input Context
    可拥有 0..N Render Context

Frame
    call / input context only

Render
    Subsystem-owned independent lifecycle

Renderer ⇄ Subsystem
    per-Subsystem System Data Connection
    Connection / Render Update / User Input 独立协议域
```

因此不得从本 Legacy 文件恢复任何 Frame-owned Render、System Registry 或 lazy first-call bootstrap 设计。

## 历史用途

需要了解旧设计推演时，应通过 Git 历史查看本文件被替代前的内容。新的工作项不要继续添加到本路径。
