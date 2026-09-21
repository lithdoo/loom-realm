# 路线图：当前产品、资格缺口与下一阶段

> 唯一面向读者的待办/阶段导航；起点 `main@78ba3999f9064fbbfcf90e55c3b027d4fe25a397`，2026-09-21。本文不签署正式资格，也不复制随提交变化的 CI PASS 表。资格结论仍以对应 ledger 与当前 SHA 的 Actions 为准。

## 交付状态如何阅读

- **已实现：** 源码中有可运行能力，不等于当前提交的所有资格门禁全绿。
- **已验证：** 针对明确 subject 和测试环境存在可复核记录；历史 subject 不能移用。
- **待资格：** 功能可在产品使用，但原版保真、跨环境 CI 或正式签署尚未完成。
- **规划：** 尚无完整可交付产品实现，不能写成 Closed。

## 已实现的基线

框架的 Foundation / Wire、Game Package、Runtime / Subsystem、Main、Renderer Control/Data/Input、Content、M13 Web Presentation，以及 M14 地图库、M15 Hostra Desktop 的实现均在仓库中。当前实现入口集中于[核心模块目录](../20-modules/core/README.md)；具体能力、正式契约与测试依各模块正文。M7–M10、M12–M13 的历史已闭环结果归 Git/ADR/原 qualification record，避免在首页重新维护另一张 PASS 表。

地形功能由 [PR #43](https://github.com/lithdoo/loom-realm/pull/43) 以 squash 提交到 `main`：selective `terrain_tags`/MapAction、有效地形和通行、Map21 Bridge On/Off、Map47 Ledge、Browser motion/depth。已修持续按键和 blocked front-touch；*未取得原版 RGSS 逐帧等价认证*。CI PR 去重由 [PR #44](https://github.com/lithdoo/loom-realm/pull/44) 合入；PR 独立 M12–M15 + fail-closed 汇总，完整 canonical 链保留在 main/手动执行。两项合并时部分 CI 尚未结束，不能把合并本身当作全部测试成功的证明。

## 下一个阶段：按依赖验收，不重做完成的设计过程

| 路线 | 尚欠的可交付结果 | 完成标准 / 证据归属 |
| --- | --- | --- |
| 0 · 文档收敛 | 过程记录退出主导航；当前模块目录和契约消除旧字段、过期状态；文档 CI 已存在的 VitePress 失效链接修复 | `npm run docs:check-links` + `npm run docs:build`，同一 PR 的 Documentation 检查通过；此项不改变业务 ABI |
| 1 · M11 / 统一 Viewport 资格 | 现有四子项 `renderer-data/1` + Viewport Core 的已实施/本地资格需与当前主分支代码版本对齐，重新核对受影响 Render 回归 | [M11 ledger](./m11-qualification.md)和[Viewport ledger](./viewport-profile-v1-qualification.md)按同一被测 SHA 更新；不可复用旧三子项结果 |
| 2 · M14 地图资格 | 对当前包括 terrain 的 executable subject，核对完整 Node 20/24、Browser 产品 E2E；合法本地 Essentials archive 若缺，精确标记 evidence missing | [M14 ledger](./m14-qualification.md)；Map21 四对 On/Off、Map47 jump 与普通 walk/Transfer 回归，禁止仅以 static replay 充数 |
| 3 · M15 Desktop 资格 | frozen Hostra、真实桌面 Browser 和 M14 相同 subject 的完整 CI/产品验收；修正 ledger 已过时 subject 与证据 | [M15 ledger](./m15-qualification.md)；同一产品 subject、完整 run、明确 PASS/FAIL/SKIP |
| 4 · 地形原版动态保真（独立资格） | 合法获取 RGSS 原版运行证据后对照事件 start/execute、held input、jump timing；正式合同仅在授权审查后签署 | `game-libs/map/TERRAIN_BEHAVIOR_FREEZE_READINESS.md`、Issue #42；不倒退阻塞已经实施的功能 |
| 5 · M16 PWA Runtime | PWA PREPARE、Worker Runner、Runtime Control MessagePort 的真实纵向闭环 | [PWA 模块](../20-modules/pwa-host/README.md)，专属测试和 CI；不提前要求完整 PWA Renderer |
| 6 · M17 PWA 产品等价 | Window Renderer / Data / Input / Content / Presentation + 同一游戏的跨平台结果 | 真正 PWA E2E、Hostra 对照和失败/重连覆盖 |

**本阶段的下一项工作**是把 0–3 的文档/资格记录与 *实际当前 main SHA* 对齐，再按已明确的 M16→M17 路线实施；0–3 的前置关系按受影响模块判断，不要求为了文档美化重做原版 RGSS 全流程。

## 单一事实源与历史处理

- 稳定模块行为：[`20-modules/core`](../20-modules/core/README.md)及各模块；跨边界约束：[正式契约](../15-contracts/README.md)。
- 尚未完成的目标：**本路线图**；M11/M14/M15/Viewport 精确证据：各自 ledger； terrain 冻结资格：专属 readiness。
- 已完成实施报告、逐轮 review、签核过程与过期 phase plan：从当前导航退出；记录可用 `git log --follow -- <path>`、原 PR 和 commit 查回。不能删除被源码/测试依赖的 fixture、合同或当前签核 ledger。
- PR #44 的 Documentation CI 曾因旧页面中 28 个无效 VitePress 链接失败；在重新实测通过前，**不宣称文档站已修复**。
