# 路线图：当前产品、资格缺口与下一阶段

> 唯一面向读者的待办与阶段导航；以实际 `main` 源码、精确版本 ledger 和同 SHA Actions 为准。本文不签署资格，不复制会过期的 PASS 表。

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

Map runtime composition 解耦已按[冻结方案](./map-composition-refactor.md)实施。Map 现只有 Builder/Handler public execution model；M14 vertical 与其余 active consumer 已迁移，Essentials topology 未改。M14 executable subject `a5e406827d0e3814dad3ac797c4b5f13015173a0` 已在 pinned official Essentials v21.1 exact production path 与 hosted Node 20/24 canonical gate 上全部 PASS 并正式 Closed；M15 qualification-input subject 对齐到同一 subject，并已由 hosted canonical/lifecycle + same-checkout Windows full-profile evidence 按其独立 closure rule 正式 Closed。

[PR #43](https://github.com/lithdoo/loom-realm/pull/43) 已交付 Map21 Bridge、Map47 Ledge 及 held input、blocked/front、深度修复，**原版 RGSS 逐帧保真仍未签署**。[PR #44](https://github.com/lithdoo/loom-realm/pull/44) 实现了 PR CI 去重，不代表任意历史 PR 合并时的状态可继承到新 subject。

[PR #46](https://github.com/lithdoo/loom-realm/pull/46) 已将仓库根目录 Markdown 清至仅有 `README.md`：已完成过程记录只在固定历史、M14/M15 历史底稿存于[资格底稿](./milestone-evidence/README.md)，Hostra 现行规范归入[Desktop](../20-modules/desktop-host/hostra-composition.md)；仍有效的运动延迟规格由[实施规格](./render-movement-latency-spec.md)持有。

已合并的 [PR #47](https://github.com/lithdoo/loom-realm/pull/47) 继续清理仓库内部过程文档：退役过时的地形任务/设计/冻结执行、包级历史评审及旧地图需求，将当前地形状态与 Data 实现集中在模块说明和对应 package design，并增加跨仓退役链接检查。旧过程状态不得重新作为 current SSOT。

## 待交付事项

| 路线 | 尚欠结果 | 验收及唯一证据归属 |
| --- | --- | --- |
| 1 · M11 / Viewport 当期资格 | **Closed / Qualified**：M11 current subject `a0a2da064d39489644f332379718aaa25cd6ed3f` hosted Node 20/24 canonical gate PASS；Viewport corrected four-child `/1` 已独立 Core Qualified | [M11 ledger](./m11-qualification.md)、[M11 run 37789130711](https://github.com/lithdoo/loom-realm/actions/runs/37789130711)、[Viewport ledger](./viewport-profile-v1-qualification.md) |
| 2 · M14 地图资格 | **Requalified / local current-subject gate PASS**：Terrain executable subject `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9` 修正 Ledge 为原版观察的 500ms；`npm run test:m14:pr` 重新通过，等待本 PR exact-head CI | [M14 ledger](./m14-qualification.md)与[当前资格记录](./final-performance-terrain-qualification.md) |
| 3 · M15 Desktop 资格 | **Requalified / local product gate PASS**：current subject `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9`；Desktop 15/15，两次 Windows full profile 均满足 50/75/100ms viewport-specific refresh gate，等待 exact-head CI | [M15 ledger](./m15-qualification.md)与[当前资格记录](./final-performance-terrain-qualification.md)；此状态不替代路线 4 的统一 50ms 门槛 |
| 4 · 当前运动延迟与性能资格 | **FOLLOW-UP REQUIRED**：current subject 的 ordinary、像素、camera-only 与内存门禁通过；两次 1920×1080 refresh P95 为 `62.1ms`、`50.5ms`，高于严格 `<=50ms`。保留 correctness，禁止择优或套用 M15 100ms 门槛；还需完整 §7.3 分段测量与独立设计审查 | [当前资格记录](./final-performance-terrain-qualification.md)、[性能规格](./render-movement-latency-spec.md)与[未接受的最小 follow-up](./movement-refresh-performance-follow-up.md)；旧 `6ade950` 50.0ms 只属历史 subject |
| 5 · 原版地形动态保真 | **技术资格完成 / 外部授权待定**：official v21.1 runtime 上已采集 Map21 四对 Bridge、held input、Map47 正向/逆向 jump 的 sanitized `DYNAMIC-OBSERVED`；原版 500ms divergence 已修复并重跑 M14/M15。FG-01～04 technical pass；FG-05 Policy B 仍需 maintainer 批准，FG-06 仍需授权 reviewer | [最终资格记录](./final-performance-terrain-qualification.md)、[FG 资格记录](../../game-libs/map/TERRAIN_BEHAVIOR_FREEZE_READINESS.md)、Issue #42；不提交原始素材，不创建未签署 V1 |
| 6 · Map runtime composition 解耦 | **Implemented / M14 + M15 Formal Qualification Closed**：composition 解耦已提取唯一 `runMapRuntime()`，删除 WeakMap、direct-definition dual-mode、`mapDefinition` 与 default export，并迁移所有 active consumer；Essentials topology/业务代码不变 | [Map Runtime Composition 解耦改造方案](./map-composition-refactor.md)、Map tests、M14/M15 ledger |
| 7 · M16 PWA Runtime | **已实现 / 独立 CI gate 已接入**：真实 ESM lexer/closed graph、artifact-derived generation、current-controller SW gate、Session Worker 内 Main + RealmStateAuthority、RuntimeHosting、独立 Worker Runner、transactional Data provisioning、failure/no-restart 与 Window stall 均由 repository-pinned Chromium 覆盖 | [PWA Profile](../15-contracts/pwa-launcher-profile-v1.md)、[PWA 产品设计](../20-modules/pwa-host/DESIGN.md)、[PWA 资格](./pwa-m16-m17-qualification.md) |
| 8 · M17 PWA 产品等价 | **已实现 / 独立 CI gate 已接入**：共享 Browser Input/Viewport、Renderer Control/Data、Content v1、Web Presentation、installation publish/failure/invalid GC、waiting SW、reload/navigation/BFCache evidence、Desktop/PWA demo equivalence，以及现有 Essentials Map game-lib 的真实安装与行为 vertical 已进入 PWA E2E | [Content API](../15-contracts/content-api-v1.md)、[PWA 资格](./pwa-m16-m17-qualification.md) |
| 9 · 全仓文档收敛 | **Closed**：已审计 `examples/essentials-v21.1-local` 的 Viewport PR0–PR3/remediation/product-close 证据并因其精确 SHA、机器、样本/P95 provenance 予以保留；`doc/30-implementation` Viewport compatibility wrappers 因旧链接/历史导航价值保留且不拥有 live status；`fsdb-http` current README 明确以原 v1 DESIGN + frozen M12 core-extraction amendment 组成当前合同，不改 HTTP API；交付首页、package architecture、repository layout、testing strategy 与本路线图的 stale current-status 已统一 | 本[路线图](./roadmap.md)、[交付入口](./README.md)、[fsdb-http README](../../packages/fsdb-http/README.md)；冻结签署/ledger/ADR/测试/fixture/不可替代性能记录均未删除 |

**当前项目级 backlog 尚未清零。** 路线 4 因 current subject 的 1080p strict refresh P95 与缺失的完整 §7.3 分段测量保持 OPEN；路线 5 的动态技术证据已完成，但 FG-05 policy approval 与 FG-06 authorized sign-off 仍是外部门禁。其余 Closed/Qualified/Implemented 结论仍受各自 subject/staleness rule 约束，后续行为改变不得继承旧 PASS。

**PWA closure 判据：** 后续改动不得重新设计 topology、authority、bootstrap、installation source、Content auth seam、browser target 或 completion commands；任何新 SHA 都必须重新运行资格命令，不能继承历史 PASS。

**文档完成判据：** 当前模块拥有产品事实、正式契约拥有 ABI、一个路线图拥有待办、资格 ledger 持有精确结果；已完成过程文档从活跃目录退役，历史只在安全的固定 Git 快照或明确标注的 evidence/compatibility 文档追溯。每批删除均核对站内和全仓引用、VitePress 构建及最终 HEAD CI，不靠把文件挪入另一个活跃目录冒充清理。
