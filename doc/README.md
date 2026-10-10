# LoomRealm 文档入口

本仓库的 VitePress 源目录是 **`doc/`（单数）**。文档采用长期 product-maintenance 模型：Current 文档描述当前产品事实，GitHub Issue/PR 描述正在进行的工作，ADR/Git 与明确 evidence 保存历史。

| 想了解什么 | 唯一入口 |
| --- | --- |
| 产品目标、权威与文档治理 | [产品目标](./00-overview/product-vision.md) → [文档治理](./00-overview/document-governance.md) |
| 系统 authority / topology / data flow | [系统架构](./10-architecture/system-overview.md) |
| 跨角色协议 / ABI / version | [正式契约](./15-contracts/README.md) |
| 当前有哪些模块、代码在哪里 | [核心模块](./20-modules/core/README.md) → [模块目录](./20-modules/README.md) |
| 开发、测试、资格、性能和仓库布局 | [开发与资格](./30-development/README.md) |
| 为什么采用当前设计 | [ADR](./decisions/README.md) |
| 历史 qualification / measurement | [Legacy implementation evidence](./30-implementation/README.md)；默认优先 Git 历史 |

## 阅读规则

```text
Current product truth
Overview → Architecture → Contracts → Modules → Development

why / provenance
ADR → Git

work in progress
Issue → PR
```

- Current 文档不得用 Mxx、PR 轮次或“下一阶段”作为主要信息架构。
- 实现完成、契约冻结、资格通过是不同概念；资格只对明确 subject 与 qualification input 有效。
- 历史 ledger/evidence 可以保留 exact SHA、环境、样本和 P95，但不得成为 live status SSOT。
- 已完成 plan/review/draft 若没有不可替代证据，默认由 Git 历史保存，不长期留在工作树。
- 删除或迁移文档前必须迁移仍有效事实并检查引用。

本地验证：`npm run docs:check-links`、`npm run docs:build`。两项都通过后才能声称文档结构交付完成。
