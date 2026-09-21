# 交付与路线图

**未完成事项唯一入口：[下一阶段路线图](./roadmap.md)。** 已实现模块见[核心模块](../20-modules/core/README.md)，正式规范见[契约目录](../15-contracts/README.md)；历史实施提示词、阶段报告和逐轮 review 不在 VitePress 主导航维护第二套状态。

持续有效的资料：[测试策略](./testing-strategy.md)、[分包边界](./package-architecture.md)、[仓库布局](./repository-layout.md)。M11/M14/M15/Viewport 的证据仍分别由 [M11](./m11-qualification.md)、[M14](./m14-qualification.md)、[M15](./m15-qualification.md)和[Viewport](./viewport-profile-v1-qualification.md)资格记录拥有；旧 subject 的 PASS 不自动迁移到现在的 `main`。

## 根目录历史文档已清理

2026-09-21，**仓库根目录 Markdown 只保留 `README.md`**，不再保留过程报告或其占位文件：

- 原根目录 46 份 M7–M15 里程碑文件均已迁出：35 份 M7–M13 已完成过程报告从当前工作树删除，原文通过[删除前固定 Git 提交](https://github.com/lithdoo/loom-realm/tree/2d465b8c8501566b26375dae55e1a78007606c40)及各处固定 permalink 查阅，不用旧报告冒充现行资格。
- 10 份仍涉及 M14/M15 资格的工作底稿移至[资格底稿目录](./milestone-evidence/README.md)，不是第二份路线图、正式协议或资格结论；具体状态仅由 ledger 持有。
- 当前 [Hostra 物理组合规范](../20-modules/desktop-host/hostra-composition.md)移入 Desktop 模块。
- 原根目录 `RENDER_MOVEMENT_LATENCY_CORE_REFACTOR.md` 移至[运动延迟性能实施规格](./render-movement-latency-spec.md)，继续保留仍有效的约束，**未完成的 P95 测量和资格事项在路线图中登记**，历史数值不冒充当前测试结果。

上述迁移同步修正 Markdown 引用；不删除正式合同、ADR、有效资格 ledger、fixture 或生产代码。另有三份经 648 个受跟踪文本文件引用审计、确认无文件名入链的已完成报告，已由 [PR #45](https://github.com/lithdoo/loom-realm/pull/45) 删除。旧[第一阶段计划](./phase-1-delivery-plan.md)仅保留外部链接兼容入口。

PWA M16/M17、当期重新资格、性能验证和原版 RGSS 地形保真统一在[路线图](./roadmap.md)登记，不从历史过程文档派发工作。
