# LoomRealm 旧文档状态表（Legacy）

> 状态：Legacy  
> 主要定义：历史文档状态表的退役说明  
> 最近复核：2026-08-03

本文件来自 LoomRealm 文档分层重构前的旧状态表。其“单一真相源”列表和优先级规则已经失效，**不得再用于判断当前架构或契约权威来源**。

当前文档治理统一由：

- [文档分层与变更规则](../00-overview/document-governance.md)

定义。

当前依赖顺序：

```text
00-overview
→ 10-architecture
→ 15-contracts
→ 20-modules
→ 30-implementation
```

当前推荐入口：

- [LoomRealm 设计文档](../README.md)；
- [系统架构总览](../10-architecture/system-overview.md)；
- [正式契约目录](../15-contracts/README.md)；
- [Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)；
- [Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)。

## 旧目录处理原则

旧 `overview/`、`architecture/`、`contracts/`、`design/`、`game-package/`、`runtime/`、`fsdb/` 和 `roadmap/` 中资料只作为迁移、实现细节或历史参考保留。

如果旧路径内容与新分层文档冲突：

1. 不使用“旧文件曾经标 Normative”覆盖当前上层架构；
2. 不依赖提交时间判断真相；
3. 按 `document-governance.md` 找当前主题的主要定义位置；
4. 将仍有效细节迁入当前分层；
5. 将失效旧文档明确标为 Legacy / Superseded。

## 当前已确认失效的旧模型

不得恢复：

- 每 Frame 一个独立 Runtime Process / Worker；
- 每 Frame 一个独立 Renderer Transport；
- Frame 必须拥有独立业务 Runtime / Projector / Client State；
- Frame close 自动删除 Render / Data Connection；
- Renderer 根据 Frame Stack 推导 Render visibility / z-order；
- 游戏入口只声明 `systemId`、平台固定 Registry 提供可执行实现；
- 当前 eager 模型首次 Frame call 才启动 Subsystem；
- Hostra Electron Main 承载 LoomRealm Main；
- Process spawn 直接等于 Runtime ready；
- failed Runtime 自动 restart；
- Frame 使用公共 `ready / initialized / frame.status` 生命周期；
- 把 `failed / completed / cancelled` 作为 Frame lifecycle state；
- closed `frameId` 可以复用；
- suspend 前的 `activationId` 可以在 resume 后重新有效；
- Renderer reload 可以从本地缓存恢复旧 Activation；
- Legacy `systemId` 重新成为新 Frame / Call v1 的 ownership identity。

## 当前 Frame 协议迁移说明

原：

```text
15-contracts/system-lifecycle-protocol.md
```

已经降为 Legacy / redirect，因为名称会与 Subsystem Runtime Lifecycle 混淆。

当前 Frame 权威入口：

```text
15-contracts/frame-call-protocol-v1.md
```

当前状态：

```text
Frame / Call v1 overall
    Draft

Batch A
    Identity / Authority / Lifecycle / Activation
    Normative / Frozen

Batch B-F
    Draft
```

历史方案需要追溯时使用 Git 历史和 ADR；当前实现不得从 Legacy 路径反向覆盖 Batch A 已冻结语义。
