# 交付与路线图

**未完成事项唯一入口：[下一阶段路线图](./roadmap.md)。** 已实现功能见[核心模块](../20-modules/core/README.md)，正式跨角色协议见[契约目录](../15-contracts/README.md)。历史实施提示词、阶段报告和逐轮 review 不作为第二套状态或导航。

持续有效的文档：[测试策略](./testing-strategy.md)、[分包边界](./package-architecture.md)、[仓库布局](./repository-layout.md)。精确的 M11/M14/M15/Viewport 资格证据分别由 [M11](./m11-qualification.md)、[M14](./m14-qualification.md)、[M15](./m15-qualification.md)、[Viewport](./viewport-profile-v1-qualification.md) ledger 负责；历史 PASS 不能自动迁移到新 SHA。

## 过程文档清理

[PR #46](https://github.com/lithdoo/loom-realm/pull/46) 将仓库根目录的 M7–M15 阶段 Markdown 全部移走或删除，仅保留顶层 `README.md`：已完成过程在固定 Git 历史中追溯；M14/M15 未完成资格的 10 份底稿保存在[资格底稿](./milestone-evidence/README.md)，Hostra 现行规范归入[Desktop 模块](../20-modules/desktop-host/hostra-composition.md)，仍有效的运动延迟性能实施规格在[此处](./render-movement-latency-spec.md)。原始基线 [`2d465b8`](https://github.com/lithdoo/loom-realm/commit/2d465b8c8501566b26375dae55e1a78007606c40) 可追溯历史根目录文件。

后续全仓审计发现 `game-libs/map/` 又保留了与当前 main 相冲突的旧任务卡、实施计划和冻结执行说明；[PR #47](https://github.com/lithdoo/loom-realm/pull/47) 将其中六份过时过程文档从工作树退役，保留[当前地图模块](../20-modules/loom-map/README.md)、[产品交付边界](../../game-libs/map/TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)、[原版资格](../../game-libs/map/TERRAIN_BEHAVIOR_FREEZE_READINESS.md)及[安全证据](../../game-libs/map/TERRAIN_BEHAVIOR_EVIDENCE.md)。历史文本只能使用[删除前已清理敏感附录的固定 main 快照](https://github.com/lithdoo/loom-realm/tree/c00fe76b20ab07aeebe18a8056e39a024a9f9859/game-libs/map)，不可把旧的 `NOT IMPLEMENTED` 或任务启动提示当作当前状态。

原版地形保真、M11/M14/M15 当期资格、性能 P95 和 M16/M17 PWA 统一由[路线图](./roadmap.md)管理。合并前必须核对**最终 PR HEAD** 上的链接校验和 VitePress 构建；本页不预填 CI PASS，也不删除 ADR、正式协议、测试、fixture 或未核清的资格证据。
