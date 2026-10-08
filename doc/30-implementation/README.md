# 交付与路线图

**未完成事项唯一入口：[下一阶段路线图](./roadmap.md)。** 已实现功能见[核心模块](../20-modules/core/README.md)，正式跨角色协议见[契约目录](../15-contracts/README.md)。历史实施提示词、阶段报告和逐轮 review 不作为第二套状态或导航。

Map runtime composition 解耦已按[冻结方案](./map-composition-refactor.md)实施：`mapDefinition` / default export、Frame-keyed bridge 与 direct-definition dual-mode 已删除，现有 `RPGMapBuilder / RPGMapHandler` 直接运行唯一 package-internal runtime；Map tests、M14 vertical 及其余 active consumer 已迁移，Essentials 业务 topology 未改。该 capability evolution 的实现历史从 `488f8713a23158e736153677ec68e449879a8a1d` 可追溯，当前 formal qualification 由 M14/M15 各自 ledger 签署；M14 与 M15 均已在 qualification-input subject `a5e406827d0e3814dad3ac797c4b5f13015173a0` Closed。

持续有效的文档：[测试策略](./testing-strategy.md)、[分包边界](./package-architecture.md)、[仓库布局](./repository-layout.md)。精确资格证据分别由 [M11](./m11-qualification.md)、[M14](./m14-qualification.md)、[M15](./m15-qualification.md)、[Viewport](./viewport-profile-v1-qualification.md) ledger 负责；Realm State v1 的结果见其[独立资格记录](./realm-state-v1-qualification.md)。M11 已对 current implementation / qualification-input subject `a0a2da064d39489644f332379718aaa25cd6ed3f` 通过 hosted Node 20/24 canonical root gate并 Closed；Viewport Core 已对 corrected four-child `renderer-data/1` + Viewport v1 记录为 Core Qualified（Desktop + shared `/1` contracts）。历史 PASS 不能自动迁移到新 executable/qualification-input subject。

PWA M16/M17 的 frozen physical profile、实现与独立 qualification gate 由 [PWA M16/M17 资格](./pwa-m16-m17-qualification.md)管理。当前产品已经实现独立 Session Worker / Runtime Worker、same-origin Content、Browser Input/Viewport/Presentation 以及现有 Essentials Map game-lib 的 PWA E2E；任何后续影响其 frozen topology、authority、bootstrap、installation source、Content auth seam、browser target 或 completion command 的新 SHA 都必须重新运行对应 gate，不能继承历史 PASS。

## 过程文档清理

[PR #46](https://github.com/lithdoo/loom-realm/pull/46) 将仓库根目录的 M7–M15 阶段 Markdown 全部移走或删除，仅保留顶层 `README.md`：已完成过程在固定 Git 历史中追溯；M14/M15 的历史资格底稿保存在[资格底稿](./milestone-evidence/README.md)，Hostra 现行规范归入[Desktop 模块](../20-modules/desktop-host/hostra-composition.md)，仍有效的运动延迟性能实施规格在[此处](./render-movement-latency-spec.md)。原始基线 [`2d465b8`](https://github.com/lithdoo/loom-realm/commit/2d465b8c8501566b26375dae55e1a78007606c40) 可追溯历史根目录文件。

后续全仓审计发现 `game-libs/map/` 又保留了与当前 main 相冲突的旧任务卡、实施计划和冻结执行说明；已合并的 [PR #47](https://github.com/lithdoo/loom-realm/pull/47) 将其中六份过时过程文档从工作树退役，保留[当前地图模块](../20-modules/loom-map/README.md)、[产品交付边界](../../game-libs/map/TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)、[原版资格](../../game-libs/map/TERRAIN_BEHAVIOR_FREEZE_READINESS.md)及[安全证据](../../game-libs/map/TERRAIN_BEHAVIOR_EVIDENCE.md)。历史文本只能使用[删除前已清理敏感附录的固定 main 快照](https://github.com/lithdoo/loom-realm/tree/c00fe76b20ab07aeebe18a8056e39a024a9f9859/game-libs/map)，不可把旧的 `NOT IMPLEMENTED` 或任务启动提示当作当前状态。

本轮文档收敛继续遵守同一规则：Viewport PR0–PR3、remediation 与 product-close 文件包含不可替代的精确 SHA、机器、样本量和 P95 历史证据，因此保留；`doc/30-implementation` 中的 Viewport compatibility wrappers 仅用于旧链接/历史导航，明确不拥有 live status，因此保留；`fsdb-http` 的 M12 core-extraction ownership 以 current design + frozen amendment 共同投影，不改变 HTTP public API。

当前仍未完成的项目级资格只包括[当前版本运动延迟/性能资格](./render-movement-latency-spec.md)和[原版 RGSS 地形动态保真](../../game-libs/map/TERRAIN_BEHAVIOR_FREEZE_READINESS.md)。合并前必须核对**最终 PR HEAD** 上的链接校验和 VitePress 构建；本页不预填未来 CI PASS，也不删除 ADR、正式协议、测试、fixture 或不可替代的资格/性能证据。
