# 路线图：当前产品、资格缺口与下一阶段

> 唯一面向读者的待办/阶段导航；以当前 `main` 源码、对应 ledger 和同 SHA Actions 为准。本文不签署资格，也不复制会过期的 PASS 表。

## 状态用语

- **已实现**：代码中存在可运行能力；不等于所有资格门禁全绿。
- **已验证**：针对精确版本及环境有可复核结果；历史结果不自动继承。
- **待资格**：产品功能已经存在，指定的跨环境、原版或正式验收尚欠证据。
- **规划**：尚未形成完整可交付产品能力。

## 当前已交付的基线

Foundation / Wire、Game Package、Runtime / Subsystem、Main、Renderer Control/Data/Input、Content、M13 Web Presentation，以及 M14 地图与 M15 Hostra Desktop 的实现入口统一列在[核心模块目录](../20-modules/core/README.md)。正式跨模块协议位于[契约目录](../15-contracts/README.md)。对应历史资格记录属于各自被测版本，不从 milestone 文件名推断当前 PASS。

[PR #43](https://github.com/lithdoo/loom-realm/pull/43) 已交付 Map21 Bridge、Map47 Ledge 和相关持续按键、blocked/front、深度修复；原版 RGSS 逐帧保真未认证。[PR #44](https://github.com/lithdoo/loom-realm/pull/44) 已实现 PR CI 去重，不代表合并时所有检查成功。

**仓库根目录 Markdown 清理已经完成：仅保留 `README.md`。** 46 份 M7–M15 根目录阶段文件归零；35 份已完成过程报告只通过固定 Git 历史追溯，10 份仍需核查的 M14/M15 资格底稿移至[资格底稿](./milestone-evidence/README.md)，Hostra 当前物理规范归入[Desktop 模块](../20-modules/desktop-host/hostra-composition.md)。另外，原根目录 94 KB 的 Renderer/Map 运动延迟规范已移至[性能实施规格](./render-movement-latency-spec.md)，未完成的 P95 性能验证见下表。处置说明见[交付文档索引](./README.md)。PR #44 所见的旧 VitePress 断链已在 PR #45 Documentation CI 后消除；本次仍以最终提交的 CI 为准。

## 待交付事项

| 路线 | 尚欠结果 | 验收及唯一证据归属 |
| --- | --- | --- |
| 1 · M11 / Viewport 当期资格 | 四子项 `renderer-data/1` 与当前实现对齐，重新核对受影响 Render 回归和适用环境 | [M11 ledger](./m11-qualification.md)、[Viewport ledger](./viewport-profile-v1-qualification.md)；不得复用三子项的历史结果 |
| 2 · M14 地图资格 | 对包含 terrain 的现行 executable subject 验证 Node 20/24 与真实 Browser 产品 E2E；原版素材缺失单独注明 | [M14 ledger](./m14-qualification.md)；Map21 四对 On/Off、Map47 jump、walk/Transfer |
| 3 · M15 Desktop 资格 | frozen Hostra 的真实桌面产品验收，与 M14 使用相符的代码 subject | [M15 ledger](./m15-qualification.md)；真实 PASS/FAIL/SKIP |
| 4 · 运动延迟性能资格 | 基于当前代码重新实测 Renderer/Map 运动响应与 P95、像素遮挡、内存/回归；不能将历史 42.9ms/96.3ms 当成当前结果 | [性能实施规格与历史测量](./render-movement-latency-spec.md)，独立当前 SHA 的浏览器、桌面测量与阈值记录 |
| 5 · 原版地形动态保真 | 合法取得 RGSS 运行证据后对照事件时序、持续输入和 jump timing；授权签署正式合同 | `game-libs/map/TERRAIN_BEHAVIOR_FREEZE_READINESS.md` 与 Issue #42；不阻止已实现功能 |
| 6 · M16 PWA Runtime | PREPARE、Worker Runner、Runtime Control MessagePort 纵向闭环 | [PWA 模块](../20-modules/pwa-host/README.md)、对应 E2E |
| 7 · M17 PWA 产品等价 | Window Renderer / Data / Input / Content / Presentation 以及与 Desktop 同一游戏结果 | 跨平台实际 E2E 与失败/恢复覆盖 |

现有模块事实由模块文档持有；规范由正式契约持有；未完成事项只在本路线图登记；精确资格由 ledger 持有；已完成实施过程只在 Git 历史或明确的历史底稿中追溯。不为了清理过程文件删除 fixture、测试、ADR、正式契约或不可替代的签核材料。
