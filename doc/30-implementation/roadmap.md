# 路线图：当前产品、资格缺口与下一阶段

> 唯一面向读者的待办与阶段导航；以实际 `main` 源码、精确版本 ledger 和同 SHA Actions 为准。本文不签署资格，不复制会过期的 PASS 表。

## 状态用语

- **已实现**：代码中存在可运行能力；不等于所有资格门禁全绿。
- **已验证**：针对精确版本及环境有可复核结果；历史结果不自动继承。
- **待资格**：功能已存在，但指定跨环境、原版或正式验收尚欠证据。
- **规划**：尚未形成完整可交付产品能力。

## 当前产品与文档基线

Foundation / Wire、Game Package、Runtime / Subsystem、Main、Renderer Control/Data/Input、Content、M13 Web Presentation，以及 M14 地图与 M15 Hostra Desktop 的当前实现入口见[核心模块](../20-modules/core/README.md)。跨角色协议由[正式契约](../15-contracts/README.md)持有；历史里程碑 ledger 仅对相应被测 SHA 有效。

[PR #43](https://github.com/lithdoo/loom-realm/pull/43) 已交付 Map21 Bridge、Map47 Ledge 及 held input、blocked/front、深度修复，**原版 RGSS 逐帧保真仍未签署**。[PR #44](https://github.com/lithdoo/loom-realm/pull/44) 实现了 PR CI 去重，不代表合并时所有 CI 都已结束。

[PR #46](https://github.com/lithdoo/loom-realm/pull/46) 已将仓库根目录 Markdown 清至仅有 `README.md`：35 份完成过程记录只在固定历史、10 份 M14/M15 待核底稿存于[资格底稿](./milestone-evidence/README.md)，Hostra 现行规范归入[Desktop](../20-modules/desktop-host/hostra-composition.md)；原根目录运动延迟规格移至[实施规格](./render-movement-latency-spec.md)。

[PR #47](https://github.com/lithdoo/loom-realm/pull/47) 正在继续清理仓库内部过程文档：退役过时的地形任务/设计/冻结执行、包级历史评审及旧地图需求，将当前地形状态与 Data 四子项实现集中在模块说明和对应包设计；新增跨仓退役链接检查。**是否完成并入 main 以 PR 合并提交与最终 CI 为准**，不能仅凭本页判断。

## 待交付事项

| 路线 | 尚欠结果 | 验收及唯一证据归属 |
| --- | --- | --- |
| 1 · M11 / Viewport 当期资格 | 四子项 `renderer-data/1` 与当前代码一致，重新核对受影响 Render 回归及适用环境 | [M11 ledger](./m11-qualification.md)、[Viewport ledger](./viewport-profile-v1-qualification.md)；不能复用旧三子项结果 |
| 2 · M14 地图资格 | Terrain 当前 executable subject 的 Node 20/24、真实 Browser E2E 和合法本地数据对照 | [M14 ledger](./m14-qualification.md)；Map21 四对 On/Off、Map47 jump、walk/Transfer；缺素材单独注明 |
| 3 · M15 Desktop 资格 | Frozen Hostra 的真实产品验收，与 M14 为一致的代码 subject | [M15 ledger](./m15-qualification.md)；分别写 PASS/FAIL/SKIP |
| 4 · 运动延迟与性能 | 当前 SHA 重新实测 Renderer/Map 运动响应和 P95、像素遮挡、内存、回归；历史 42.9ms/96.3ms 不可冒充当前测量 | [性能规格及历史测量](./render-movement-latency-spec.md)与本次浏览器/桌面数据 |
| 5 · 原版地形动态保真 | 合法获得 RGSS 后对照事件、持续输入、jump timing；由授权 reviewer 签署正式合同 | [FG 资格记录](../../game-libs/map/TERRAIN_BEHAVIOR_FREEZE_READINESS.md)、Issue #42；不阻塞已交付功能 |
| 6 · M16 PWA Runtime | PREPARE、Worker Runner、Runtime Control MessagePort 纵向闭环 | [PWA 模块](../20-modules/pwa-host/README.md)、实际 E2E |
| 7 · M17 PWA 产品等价 | Window Renderer/Data/Input/Content/Presentation 与 Desktop 同一游戏结果 | 跨平台实际 E2E 及失败/恢复覆盖 |
| 8 · 剩余全仓文档收敛 | 审计 `examples/essentials-v21.1-local` 的视口 PR0–PR3 证据与仍有效的格式/运动规格，保全不可替代性能记录；合并 `fsdb-http` 的仍有效 M12 amendment 而不改变 API；逐篇核对 `doc/30-implementation` Viewport 兼容占位页及引用，能安全删除的才退役。消除遗留旧状态、完成引用迁移与引用守卫扩展 | [地图模块](../20-modules/loom-map/README.md)、[Content 模块](../20-modules/fsdb-content-service/README.md)、本[路线图](./roadmap.md)；不得删除冻结签署/ledger/ADR/测试/fixture 或把旧历史变当前 PASS |

**文档完成判据：** 当前模块拥有产品事实、正式契约拥有 ABI、一个路线图拥有待办、资格 ledger 持有精确结果；已完成过程文档从活跃目录退役，历史只在安全的固定 Git 快照追溯。每批删除均核对站内和全仓引用、VitePress 构建及最终 HEAD CI，不靠把文件挪入另一个活跃目录冒充清理。
