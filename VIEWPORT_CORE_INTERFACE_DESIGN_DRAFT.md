# Viewport Core：Agent 实施入口（规范候选，等待 Docs Freeze）

> 状态：**Architecture specification prepared / Docs Freeze HOLD / production NOT IMPLEMENTED / tests NOT RUN**；2026-09-18。分支 `dev/resize-viewport`。旧的详细草案仅供 [Git 历史追溯](./VIEWPORT_CORE_INTERFACE_PRE_FREEZE_DRAFT.md)，不拥有规范权威。

## 唯一阅读和实施顺序

1. [ADR 0036](./doc/decisions/0036-preimplementation-viewport-profile-v1-correction.md)：项目负责人已授权首次发布前直接协调修订 `/1`，不创建 `/2`、不做 npm 消费者调查；旧/新 `/1` binary 禁止混配。
2. [完整、独立可读的新版 Profile /1](./doc/15-contracts/renderer-data-profile-v1.md)：identity、四 child、reader/writer、direction、diagnostic、旧协议不变语义都在同一份规范中。旧三-child [原文 Git 历史入口](./doc/15-contracts/renderer-data-profile-v1-previewport-baseline.md) 不再作为规范继承文件。
3. [Viewport State v1](./doc/15-contracts/viewport-state-v1.md)：唯一 raw/wire/API、source、publisher 状态机、retention/lifecycle 规范。
4. [完整 revision3 Profile conformance](./doc/15-contracts/renderer-data-profile-conformance-v1.md) 与 [Viewport conformance](./doc/15-contracts/viewport-state-conformance-v1.md)：测试矩阵。旧 revision2 [Git 历史入口](./doc/15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md) 不再增加另一套当前断言。JSON 无效原文、合法 JSON 的 viewport 字段错误和 trusted local caller 错误必须分 family。
5. [Data 包精确修订单](./packages/data/VIEWPORT-V1-CORRECTION.md) 与 [三包模块落点](./doc/20-modules/viewport-core.md)：M8 的 `packages/data/DESIGN.md` 与三包旧源码仍描述三-child **已实现基线**，对本轮四-child 增量以正式契约及此修订单为准，不允许沿用旧 export/handler 片段。
6. [Docs Freeze / Agent execution ledger](./doc/30-implementation/viewport-core-freeze-ledger.md)：唯一实时 status、最终文档 SHA、链接检查、精确文件范围、实施顺序与测试证据。冲突时按正式文档主题 owner 解决，不由 mutable HEAD 或历史草案判断。

## 交付边界

目标只建立 `RendererViewportSource → current RendererDataPeer.viewport.publishState → Data single writer/reader → current SubsystemDataPeer.onViewportState → Runtime scope.viewport` 的平台无关链路。可改生产代码仅 `packages/data/**`、`packages/renderer/**`、`packages/subsystem/**`，测试可放相应包及已有根 `test/`。正式 Docs Freeze 之外不得修改其他包/协议。**不改** `game-libs/map/**`、`apps/desktop/**`、PWA adapter、示例 CSS、`play.bat`、Main、M13 或产品渲染代码；本轮 fake source 不代表真实窗口采样。

## Agent 指令与 STOP

冻结账本记录 candidate subject SHA 与 G1 链接检查完成之前，**禁止开始生产协议实现**。G1 通过后，按 ledger C1 Data → C2 Renderer → C3 Subsystem → C4 real vertical 分阶段实施。API/wire/state machine 只能依完整正式契约；不得按旧 package DESIGN、历史 draft/Map 方案自行扩展 schema、queue、lifecycle 或测试门槛。发现设计矛盾、需要越界、无法证明 currentness/boundedness，应保留现场、提交最小 fixture、文件行号、expected/actual 并通过新设计提交重新冻结；不得删旧测试或用 mock-only 代替真实架构 vertical。

**状态严格区分：** Docs Frozen（同一文档 SHA 的 `docs:check-links` 通过）≠ implemented（新代码）≠ architecture qualified（同一 executable SHA 的真 holder+peers+host 和回归 PASS）≠ Desktop/Map product closed。当前均未完成；这次没有实现 `play.bat` 真拖窗。