# 交付与路线图

当前项目级资格已经收口；状态导航见[路线图](./roadmap.md)，最终关闭结论见[final qualification closure](./final-qualification-closure.md)。已实现功能见[核心模块](../20-modules/core/README.md)，正式跨角色协议见[契约目录](../15-contracts/README.md)。历史实施提示词、阶段报告和逐轮 review 不作为第二套 current status。

Map runtime composition 解耦已按[冻结方案](./map-composition-refactor.md)实施：`mapDefinition` / default export、Frame-keyed bridge 与 direct-definition dual-mode 已删除，现有 `RPGMapBuilder / RPGMapHandler` 直接运行唯一 package-internal runtime；Map tests、M14 vertical 及其余 active consumer 已迁移，Essentials 业务 topology 未改。Terrain/Ledge 修正后的 current subject 为 `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9`，M14/M15 已重资格并关闭。

持续有效的精确资格记录包括 [M11](./m11-qualification.md)、[M14](./m14-qualification.md)、[M15](./m15-qualification.md)、[Viewport](./viewport-profile-v1-qualification.md)、[Realm State v1](./realm-state-v1-qualification.md) 与 [PWA M16/M17](./pwa-m16-m17-qualification.md)。当前 native performance 的正式 gate 由 [Performance Qualification Profile v1](./performance-qualification-profile-v1.md) 持有；旧的 [movement implementation specification](./render-movement-latency-spec.md) 和 [final performance/Terrain evidence snapshot](./final-performance-terrain-qualification.md) 继续保留历史实现约束和原始测量，不再拥有 current closure status。

Terrain 原版动态证据已完成：official Pokémon Essentials v21.1 Map21 四对 Bridge、held input、Map47 正向/逆向 Ledge 已观察；原版 500ms Ledge 与旧产品 400ms 的 divergence 已修复。Policy B 已确定为 `synthetic-only CI + legal-local original qualification + sanitized repository facts/digests`，正式范围由 [Terrain Behavior Contract v1](../../game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_V1.md) 冻结；Issue #42 已关闭。

性能 current profile 使用 ordinary `<=50ms` 和 refresh 640/720/1080 `<=50/75/100ms`。current subject 的两次完整 native full-profile 均通过该 profile；旧 uniform refresh `<=50ms` 结果完整保留为历史，Issue #80 已通过明确的 qualification-profile 治理决定关闭。

PWA M16/M17 的 frozen physical profile、实现与独立 qualification gate 由 [PWA M16/M17 资格](./pwa-m16-m17-qualification.md)管理。任何后续影响 frozen topology、authority、bootstrap、installation source、Content auth seam、browser target 或 completion command 的新 SHA 都必须重新运行对应 gate，不能继承历史 PASS。

## 历史与证据保留

[PR #46](https://github.com/lithdoo/loom-realm/pull/46) 和 [PR #47](https://github.com/lithdoo/loom-realm/pull/47) 已完成过程文档与退役链接收敛。Viewport PR0–PR3/remediation/product-close、M14/M15 milestone evidence、旧性能失败和原版取证过程仍因精确 SHA、机器、样本/P95 或 provenance 价值保留；它们只能作为历史/evidence 使用，不得覆盖 current contract/profile/ledger。

**当前项目级 qualification backlog = 0。** 未来只要 executable behavior 或 qualification input 改变，就必须按各自 ledger 的 subject/staleness 规则重新资格；本页不豁免任何后续 gate。
