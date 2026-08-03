# LoomRealm 架构决策记录

> 层级：设计决策记录  
> 状态：Active  
> 主要定义：重大架构决策的背景、取舍、结果和重新评估条件  
> 最近复核：2026-08-03

本目录记录 LoomRealm 重大架构结论的形成过程。当前有效的系统职责和协议仍以 `10-architecture` 与 `15-contracts` 中的权威文档为准；ADR 用于保存候选方案、决定原因、代价和重新评估条件。

## 当前决策

1. [每个 System 一个 Runtime Container](./0001-system-container-per-system-id.md)
2. [桌面与 PWA Transport Profile](./0002-platform-transport-profiles.md)
3. [统一只读 Content API](./0003-readonly-content-api.md)
4. [Client State 渲染流水线](./0004-client-state-rendering-pipeline.md)
5. [Game Entry 声明 Subsystem Launcher](./0005-game-entry-subsystem-launchers.md)
6. [Frame 与 Render 生命周期解耦](./0006-frame-render-decoupling.md)
7. [Subsystem Descriptor MVP 收敛](./0007-subsystem-descriptor-mvp.md)
8. [冻结 Desktop Node.js Launcher Profile v1](./0008-desktop-nodejs-launcher-profile-v1.md)
9. [冻结 Subsystem Control Protocol v1](./0009-freeze-subsystem-control-protocol-v1.md)
10. [冻结 Frame / Call Protocol v1 Batch A](./0010-freeze-frame-call-protocol-v1-batch-a.md)

## 当前替代关系

- ADR 0006 **部分替代** ADR 0004 中“Client State / Store 必须以 Frame 为所有权单元”的假设；
- ADR 0004 的“声明式目标状态 → Renderer Store → Render Scheduler → DOM / Canvas / WebGL”流水线继续有效；
- ADR 0005 替代旧架构中“游戏只声明 systemId，由平台固定 System Registry 提供全部可执行实现”的第一阶段假设；
- ADR 0007 **部分替代** ADR 0005 中 `id + name` Descriptor、`javascript` Launcher、未冻结 eager/lazy 以及已冻结 entry 路径安全的表述；
- ADR 0008 **补充并部分替代** ADR 0007 中 `launcher.entry` 尚未冻结的结论，冻结 Desktop Node.js Launcher Profile v1；
- ADR 0009 将此前 Draft / Stabilizing 的 Subsystem Bootstrap / Runtime Lifecycle 收敛为独立 Frozen Protocol，并明确 Frame / Call 不属于该协议域；
- ADR 0010 冻结 Frame / Call v1 的 identity / authority / lifecycle / Activation 基线，并将旧 `system-lifecycle-protocol.md` 路径降为 Legacy；
- ADR 0010 明确 `completed / cancelled / failed` 是 Frame outcome，不是 lifecycle state；Frame v1 不存在独立 `ready / initialized / frame.status`；
- ADR 0005 的“Game Entry 声明 Launcher、Main 启动 Subsystem、Subsystem 主动连接 Main、connected 与 ready 分离”继续有效。

## 维护规则

- ADR 一经接受，不通过重写历史来表达新决定；后续变化新增 ADR，并标记被替代关系。
- 架构文档保存当前有效结论，ADR 保存结论形成过程。
- 契约发生不兼容变化时，除 ADR 外还必须提升协议版本或提供明确迁移方案。
- 分批冻结协议时，后续批次不得静默改变已经标记 Frozen 的前序批次；需要改变时必须新增 ADR 并明确兼容性影响。
