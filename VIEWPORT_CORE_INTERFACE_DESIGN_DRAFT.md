# Viewport Core：Agent 实施入口（规范候选，等待 Docs Freeze 签署）

> 状态：**Architecture specification prepared / Docs Freeze HOLD / production NOT IMPLEMENTED / tests NOT RUN**；2026-09-18。分支 `dev/resize-viewport`。此前详细设计归档在 [pre-freeze draft](./VIEWPORT_CORE_INTERFACE_PRE_FREEZE_DRAFT.md)，不再拥有规范权威。

## 唯一阅读和实施顺序

1. [ADR 0036](./doc/decisions/0036-preimplementation-viewport-profile-v1-correction.md)：项目负责人已授权直接修订 `/1`，不创建 `/2`、不做 npm 消费者调查；旧新 binary 禁混配。
2. [Current revised Profile /1](./doc/15-contracts/renderer-data-profile-v1.md)：identity、四 child、reader/writer、direction、diagnostic、保留旧协议语义。旧三-child [完整基线](./doc/15-contracts/renderer-data-profile-v1-previewport-baseline.md) 仅作历史继承材料。
3. [Viewport State v1](./doc/15-contracts/viewport-state-v1.md)：唯一 raw/wire/API、source 及 publisher 状态机、retention/lifecycle 的规范来源。
4. [Profile revision3 conformance](./doc/15-contracts/renderer-data-profile-conformance-v1.md) 和 [Viewport conformance](./doc/15-contracts/viewport-state-conformance-v1.md)：必须转成可执行用例的观测矩阵；旧 revision2 [全文保全](./doc/15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md)。
5. [Docs Freeze / Agent execution ledger](./doc/30-implementation/viewport-core-freeze-ledger.md)：唯一实时 status、最终文档 SHA、审查/签署、精确文件范围、实施工序与测试证据。若其他文档状态文字不同，以此账本为准，语义问题返回对应正式契约修订。

## 交付边界

目标仅建立 `RendererViewportSource → current RendererDataPeer.viewport.publishState → Data single writer/reader → current SubsystemDataPeer.onViewportState → Runtime scope.viewport` 的完整平台无关链路。可改生产包仅 `packages/data/**`、`packages/renderer/**`、`packages/subsystem/**`，其测试可放对应包及现有根 `test/`。正式 Docs Freeze 之外不得修改其他包/协议。绝对不改 `game-libs/map/**`、`apps/desktop/**`、PWA adapter、示例 CSS、`play.bat`、Main、M13 或其他产品渲染代码。

## Agent 指令及 STOP 条件

在账本记录正式冻结 subject SHA 与批准之前，**禁止开始生产协议实现**。签署后按 ledger C1 Data → C2 Renderer → C3 Subsystem → C4 real vertical 分阶段工作。只能用正式契约定义 wire/API/算法，不得按历史 Draft、旧 Map 方案或 Agent 自行推断改变 schema、限制、lifecycle、publisher coalescing 或回归门槛。发现设计矛盾、需要改出边界、无法证明 currentness/有界性，立即保留现状，提交最小 fixture、文件行号、expected/actual 以及单独设计修订，不“顺手修复”。不得删旧测试或以 mock 代替真实架构 vertical。

**完成声明必须分开：** Docs Frozen（审查签署 SHA）≠ implemented（有代码）≠ architecture qualified（同一 executable SHA 的真实 holder+peers+host 测试和回归 PASS）≠ Desktop/Map product closed。当前后三项未完成；没有实现本次原生拖窗效果。