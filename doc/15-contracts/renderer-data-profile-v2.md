# Renderer Data Application Profile v2 — Superseded Proposal

> 状态：**Superseded / Historical only / NOT a current contract / Never implemented or released**  
> 原候选 identity：`loomrealm.renderer-data/2`（**不得 advertise、mint、install 或测试为 current**）  
> Superseded by：[ADR0037：首次发布前直接修正 `/1`](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> Current SSOT：[Renderer Data Profile v1](./renderer-data-profile-v1.md) · [Viewport State v1](./viewport-state-v1.md) · [Profile v1 Conformance](./renderer-data-profile-conformance-v1.md)  
> 日期：2026-09-16

本文件仅保存「曾考虑 `/2 = Connection1 + Input1 + Render1 + Viewport1`」这一设计演进的导航事实。前提是首次发布前没有真实外部 compatibility obligation；该前提仍须在 Docs Freeze 前核实并归档，如不成立必须停止 direct reset 并另行制定迁移决策。

原方案为避免改动已经 Frozen 的三-child `/1`，为 Viewport 新建完整 `/2` identity，并设计 Main uniform `/2` rollout、Profile v1 compatibility、dual conformance。随后业务边界 Review证实 uniform rollout是产品策略，不是 profile protocol语义；仓库 [document governance](../00-overview/document-governance.md)要求没有真实兼容义务时直接修正 current first version，不制造 fake v2 或 dual parser。因此 ADR0037 撤销**必须引入 Profile v2**的结论，保留 Viewport 正交 Input、readonly Runtime retention、bounded publication、single reader/writer与 fresh carrier semantics。具体 current 规则全部以 `/1` 正式契约为准。

**不得将本历史页作为规范、实现工作项、qualification owner或恢复 `/2` 路径的依据。** 旧段落的详细设计留在 Git history/原 review subject `d0ab971d4df8626973afe0f2274b4e6a643d2c1c`。若真实下游 compatibility 被发现，另立 ADR，不自动复活此草案。