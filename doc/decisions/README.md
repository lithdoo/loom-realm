# LoomRealm 架构决策记录

> 层级：设计决策记录  
> 状态：Active  
> 主要定义：重大架构决策的背景、取舍、结果和重新评估条件  
> 最近复核：2026-08-01

本目录记录 LoomRealm 重大架构结论的形成过程。当前有效的系统职责和协议仍以 `10-architecture` 与 `15-contracts` 中的权威文档为准；ADR 用于保存候选方案、决定原因、代价和重新评估条件。

## 当前决策

1. [每个 System 一个 Runtime Container](./0001-system-container-per-system-id.md)
2. [桌面与 PWA Transport Profile](./0002-platform-transport-profiles.md)
3. [统一只读 Content API](./0003-readonly-content-api.md)
4. [Client State 渲染流水线](./0004-client-state-rendering-pipeline.md)

## 维护规则

- ADR 一经接受，不通过重写历史来表达新决定；后续变化新增 ADR，并标记被替代关系。
- 架构文档保存当前有效结论，ADR 保存结论形成过程。
- 契约发生不兼容变化时，除 ADR 外还必须提升协议版本或提供明确迁移方案。
