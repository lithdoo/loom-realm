# LoomRealm 旧文档状态表（Legacy）

> 状态：Legacy  
> 主要定义：历史文档状态表的退役说明  
> 最近复核：2026-08-02

本文件来自 LoomRealm 文档分层重构前的旧状态表。其“单一真相源”列表和优先级规则已经失效，**不得再用于判断当前架构或契约权威来源**。

当前文档治理统一由：

- [文档分层与变更规则](../00-overview/document-governance.md)

定义。

当前依赖顺序为：

```text
00-overview
→ 10-architecture
→ 15-contracts
→ 20-modules
→ 30-implementation
```

当前推荐入口为：

- [LoomRealm 设计文档](../README.md)；
- [产品设计总览](../00-overview/product-vision.md)；
- [系统架构总览](../10-architecture/system-overview.md)；
- [正式契约目录](../15-contracts/README.md)。

## 旧目录处理原则

旧 `overview/`、`architecture/`、`contracts/`、`design/`、`game-package/`、`runtime/`、`fsdb/` 和 `roadmap/` 中的资料只作为迁移、实现细节或历史参考保留。

如果旧路径内容与新分层文档冲突：

1. 不使用“旧文件曾经标 Normative”覆盖当前上层架构；
2. 不依赖提交时间判断真相；
3. 先按照 `document-governance.md` 找到当前主题的主要定义位置；
4. 将仍有效的细节迁入当前分层；
5. 将失效旧文档明确标为 Legacy 或删除。

## 已确认不应继续作为当前真相的旧模型

- 每 Frame 一个独立 Runtime Process / Worker；
- 每 Frame 一个独立 Renderer Transport；
- Frame 必须拥有独立业务 Runtime / Projector / Client State；
- Frame close 自动删除 Render；
- Renderer 根据 Frame Stack 推导 Render visibility / z-order；
- 游戏入口只声明 `systemId`，平台固定 Registry 提供可执行实现；
- 当前 MVP 首次调用才启动 Subsystem；
- Hostra Electron Main 承载 LoomRealm Main。

这些历史方案需要追溯时使用 Git 历史和对应 ADR，而不是恢复本文件旧的权威来源表。