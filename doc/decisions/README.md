# LoomRealm 架构决策记录

> 层级：设计决策记录  
> 状态：Active  
> 主要定义：重大架构决策的背景、取舍、结果和重新评估条件  
> 最近复核：2026-08-04

本目录记录 LoomRealm 重大架构结论的形成过程。当前有效系统职责和协议仍以 `10-architecture` 与 `15-contracts` 权威文档为准；ADR 保存候选方案、决定原因、代价和重新评估条件。

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
11. [冻结 Frame / Call Protocol v1 Batch B](./0011-freeze-frame-call-protocol-v1-batch-b.md)
12. [冻结 Frame / Call Protocol v1 Batch C](./0012-freeze-frame-call-protocol-v1-batch-c.md)
13. [冻结 Frame / Call Protocol v1 Batch D](./0013-freeze-frame-call-protocol-v1-batch-d.md)
14. [冻结 Frame / Call Protocol v1 Batch E](./0014-freeze-frame-call-protocol-v1-batch-e.md)

## 当前替代 / 补充关系

- ADR 0006 部分替代 ADR 0004 中“Client State / Store 必须以 Frame 为所有权单元”的假设；
- ADR 0005 替代旧“游戏只声明 systemId，由平台固定 Registry 提供实现”的第一阶段假设；
- ADR 0007 部分替代 ADR 0005 中旧 Descriptor/Launcher 表述；
- ADR 0008 冻结 Desktop Node.js Launcher Profile v1；
- ADR 0009 将 Runtime Bootstrap/Lifecycle 收敛为独立 Frozen Subsystem Control Protocol；
- ADR 0010 冻结 Frame identity / authority / lifecycle / Activation，明确 outcome≠lifecycle、无 Frame ready/status；
- ADR 0011 冻结七方法 wire、FrameOutcome、Caller relationship 不下发、resume outcome+new Activation 与 call 非 long-running result RPC；
- ADR 0012 冻结 Stack transaction / acceptance barrier / InputTarget causal barrier / rollback boundary，并明确 ordinary call不依赖 reverse suspend、same-Subsystem recursion不依赖 nested request-handler reentrancy；
- ADR 0013 冻结 Success/Explicit Error/Ambiguous 三分法、finite deadline、no retry/replay、recoverable rejection、control divergence Runtime-fatal 与 no caller-driven cancel；
- ADR 0014 冻结 Runtime failure fixed-point suffix unwind：lowest failed-runtime Frame为 root、Top→Bottom cleanup、failed Runtime Frame logical retire、healthy descendant best-effort close、cleanup failure扩展 failed set/root、accepted outcome保留、`SUBSYSTEM_RUNTIME_FAILED` 与 fresh surviving-Caller resume；
- ADR 0014 不新增 `frame.abort/frame.unwind/frame.cancel` 或 recovery replay/resync，Batch B 七方法 surface 保持不变；
- 旧 `system.call / system.return / frame.result / frame.close(reason) / frame.cancel` 不进入 Frame / Call v1。

## 维护规则

- ADR 一经接受，不通过重写历史表达新决定；后续变化新增 ADR，并明确兼容性影响；
- 架构文档保存当前有效结论，ADR 保存结论形成过程；
- 契约发生不兼容变化时必须提升协议版本或提供迁移；
- 分批冻结协议时，后续批次不得静默改变已 Frozen 批次；
- Transport/Profile 实现不得通过平台差异覆盖已冻结应用层 transaction/error/recovery semantics。
