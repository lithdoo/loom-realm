# 路线图：当前产品、资格缺口与下一阶段

> 唯一面向读者的待办与阶段导航；以实际 `main` 源码、精确版本 ledger 和同 SHA Actions 为准。当前项目级资格已由[最终关闭记录](./final-qualification-closure.md)收口；历史失败/PASS 仍按各自 subject 保留，不能自动迁移。

## 状态用语

- **已实现**：代码中存在可运行能力；不等于所有资格门禁全绿。
- **已验证**：针对精确版本及环境有可复核结果；历史结果不自动继承。
- **待资格**：功能已存在，但指定跨环境、原版或正式验收尚欠证据。
- **规划**：尚未形成完整可交付产品能力。

## 当前产品与文档基线

Foundation / Wire、Game Package、Runtime / Subsystem、Main、Realm State v1、Renderer Control/Data/Input、Content、M13 Web Presentation，以及 M14 地图与 M15 Hostra Desktop 的当前实现入口见[核心模块](../20-modules/core/README.md)。跨角色协议由[正式契约](../15-contracts/README.md)持有；Realm State 的当前结果见其[独立资格记录](./realm-state-v1-qualification.md)，历史里程碑 ledger 仅对相应被测 SHA 有效。

M11 Render current implementation / qualification-input subject `a0a2da064d39489644f332379718aaa25cd6ed3f` 已通过 hosted Node 20/24 canonical `npm run test:m11` root gate（[run 37789130711](https://github.com/lithdoo/loom-realm/actions/runs/37789130711)）并正式 Closed。Viewport corrected four-child `renderer-data/1` + Viewport State v1 已由其独立 ledger 记录为 Core Qualified（Desktop + shared `/1` contracts）；不再把 M11 与已经 Qualified 的 Viewport Core 合并描述为一个待资格事项。

Realm State v1 已完成从 Game Package document、Launcher PREPARE projection、Session Authority、Runtime-scoped client、dedicated Hostra State plane、`SubsystemScope.state` 到 Worker-compatible MessagePort realization 的闭环。PWA M16/M17 的完成状态由独立产品资格判定，不由 Realm State 单项结果推导，也不改变既有 M9–M15 ledger 的 subject。

PWA 的 frozen physical profile 已在 canonical `apps/pwa` root 实现，见 [PWA 产品组合设计](../20-modules/pwa-host/DESIGN.md)、正式 [PWA Launcher / Worker Profile v1](../15-contracts/pwa-launcher-profile-v1.md) 与 [M16/M17 PWA 资格](./pwa-m16-m17-qualification.md)：Window 只承载 Renderer/Input/Viewport/Presentation；Main + RealmStateAuthority 共置独立 Session Worker；Subsystem Runtime 独立 Dedicated Worker；Service Worker 只承载 Content/private executable/runtime-info physical boundary。Installer 以 `PwaInstallationBundleV1` 为唯一 semantic input，Launcher 只消费 complete installation；PWA Content 使用 same-origin client，Desktop bearer 继续 mandatory。v1 mandatory browser target 为 repository-pinned Playwright Chromium；PASS 只由同一 HEAD 的根命令产生。

Map runtime composition 解耦已按[冻结方案](./map-composition-refactor.md)实施。Map 现只有 Builder/Handler public execution model；M14 vertical 与其余 active consumer 已迁移，Essentials topology 未改。历史 subject `a5e406827d0e3814dad3ac797c4b5f13015173a0` 的 M14/M15 closure 可追溯；Terrain/Ledge 修正后的 current subject 为 `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9`，其 M14/M15 已完成重资格，精确 evidence 见[最终资格记录](./final-performance-terrain-qualification.md)与[最终关闭记录](./final-qualification-closure.md)。

[PR #43](https://github.com/lithdoo/loom-realm/pull/43) 已交付 Map21 Bridge、Map47 Ledge 及 held input、blocked/front、深度修复；official v21.1 原版动态观察后来确认 Map47 Ledge 为 500ms，并已在 current subject 修正、重资格并签发 [Terrain Behavior Contract v1](../../game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_V1.md)。[PR #44](https://github.com/lithdoo/loom-realm/pull/44) 实现了 PR CI 去重，不代表任意历史 PR 合并时的状态可继承到新 subject。

[PR #46](https://github.com/lithdoo/loom-realm/pull/46) 已将仓库根目录 Markdown 清至仅有 `README.md`：已完成过程记录只在固定历史、M14/M15 历史底稿存于[资格底稿](./milestone-evidence/README.md)，Hostra 现行规范归入[Desktop](../20-modules/desktop-host/hostra-composition.md)；仍有效的运动延迟实施历史由[实施规格](./render-movement-latency-spec.md)持有，当前 qualification gate 由[Performance Qualification Profile v1](./performance-qualification-profile-v1.md)持有。

已合并的 [PR #47](https://github.com/lithdoo/loom-realm/pull/47) 继续清理仓库内部过程文档：退役过时的地形任务/设计/冻结执行、包级历史评审及旧地图需求，将当前地形状态与 Data 实现集中在模块说明和对应 package design，并增加跨仓退役链接检查。旧过程状态不得重新作为 current SSOT。

## 待交付事项

| 路线 | 当前状态 | 验收及唯一证据归属 |
| --- | --- | --- |
| 1 · M11 / Viewport 当期资格 | **Closed / Qualified**：M11 current subject `a0a2da064d39489644f332379718aaa25cd6ed3f` hosted Node 20/24 canonical gate PASS；Viewport corrected four-child `/1` 已独立 Core Qualified | [M11 ledger](./m11-qualification.md)、[M11 run 37789130711](https://github.com/lithdoo/loom-realm/actions/runs/37789130711)、[Viewport ledger](./viewport-profile-v1-qualification.md) |
| 2 · M14 地图资格 | **Requalified / Closed**：Terrain executable subject `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9` 修正 Ledge 为原版观察的 500ms；本地和 hosted Node 20/24 gate 通过 | [M14 ledger](./m14-qualification.md)、[最终资格记录](./final-performance-terrain-qualification.md) |
| 3 · M15 Desktop 资格 | **Requalified / Closed**：current subject `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9`；Desktop、Hostra、生命周期与三视口 product profile 全部通过 | [M15 ledger](./m15-qualification.md)、[最终资格记录](./final-performance-terrain-qualification.md) |
| 4 · 当前运动延迟与性能资格 | **Closed / Qualified**：现行 [Performance Qualification Profile v1](./performance-qualification-profile-v1.md) 采用 ordinary `<=50ms`，refresh 640/720/1080 `<=50/75/100ms`；current subject 两次完整 native run 均通过该 profile，旧 uniform refresh `<=50ms` 结果保留为历史而不再是 current gate | [最终关闭记录](./final-qualification-closure.md)、[治理决定](./qualification-governance-decision-2026-10-09.md)、已关闭 Issue #80 |
| 5 · 原版地形动态保真 | **Closed / Qualified / Contract v1 Frozen**：official v21.1 Map21 四对 Bridge、held input、Map47 正向/逆向 jump 动态证据完成；500ms divergence 已修复；Policy B 已批准，FG-01～06、C-01～08、DEC-01～07 对声明 slice 关闭 | [Terrain Behavior Contract v1](../../game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_V1.md)、[最终关闭记录](./final-qualification-closure.md)、已关闭 Issue #42 |
| 6 · Map runtime composition 解耦 | **Implemented / Qualified**：composition 解耦已提取唯一 `runMapRuntime()`，删除 WeakMap、direct-definition dual-mode、`mapDefinition` 与 default export，并迁移所有 active consumer | [Map Runtime Composition 解耦改造方案](./map-composition-refactor.md)、Map tests、M14/M15 ledger |
| 7 · M16 PWA Runtime | **已实现 / 独立 CI gate 已接入**：真实 ESM lexer/closed graph、artifact-derived generation、current-controller SW gate、Session Worker 内 Main + RealmStateAuthority、RuntimeHosting、独立 Worker Runner、transactional Data provisioning、failure/no-restart 与 Window stall 均由 repository-pinned Chromium 覆盖 | [PWA Profile](../15-contracts/pwa-launcher-profile-v1.md)、[PWA 产品设计](../20-modules/pwa-host/DESIGN.md)、[PWA 资格](./pwa-m16-m17-qualification.md) |
| 8 · M17 PWA 产品等价 | **已实现 / 独立 CI gate 已接入**：共享 Browser Input/Viewport、Renderer Control/Data、Content v1、Web Presentation、installation publish/failure/invalid GC、waiting SW、reload/navigation/BFCache evidence、Desktop/PWA demo equivalence，以及现有 Essentials Map game-lib 的真实安装与行为 vertical 已进入 PWA E2E | [Content API](../15-contracts/content-api-v1.md)、[PWA 资格](./pwa-m16-m17-qualification.md) |
| 9 · 全仓文档收敛 | **Closed**：Viewport 历史证据、compatibility wrappers、fsdb-http M12 ownership amendment 与 current status 已完成审计收敛 | 本[路线图](./roadmap.md)、[交付入口](./README.md) |

**当前项目级 qualification backlog = 0。** 本次关闭不删除历史失败数据、不把旧 subject 的 PASS 迁移到新 subject，也不豁免未来 executable/qualification-input changes 的重新资格要求。

**PWA closure 判据：** 后续改动不得重新设计 topology、authority、bootstrap、installation source、Content auth seam、browser target 或 completion commands；任何新 SHA 都必须重新运行资格命令，不能继承历史 PASS。

**文档完成判据：** 当前模块拥有产品事实、正式契约拥有 ABI、路线图拥有阶段状态、资格 ledger 持有精确结果；历史证据保留在固定快照或明确 evidence 文档中。
