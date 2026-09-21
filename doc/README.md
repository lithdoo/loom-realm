# LoomRealm 文档入口

本仓库的 VitePress 源目录是 **`doc/`（单数）**；不再创建平行 `docs/` 副本。优先阅读已落地的系统，不再以 M7–M15 每轮执行计划作为入口。

| 想了解什么 | 唯一入口 |
| --- | --- |
| 产品目标与架构 | [产品总览](./00-overview/product-vision.md) → [系统架构](./10-architecture/system-overview.md) |
| 当前有哪些可运行模块、代码在哪里 | [核心模块总览](./20-modules/core/README.md) → [模块目录](./20-modules/README.md) |
| 跨角色协议 / 版本 / 边界 | [正式契约](./15-contracts/README.md) |
| 下一个阶段和真实资格缺口 | [路线图](./30-implementation/roadmap.md) |
| 为什么采用当前设计 | [ADR 决策索引](./decisions/README.md) |
| CI 与验证方式 | [测试策略](./30-implementation/testing-strategy.md) → [PR 资格覆盖说明](../.github/CI-QUALIFICATION.md) |

## 阅读与修改规则

```text
当前代码 / 测试 → 对应当前模块 → 跨角色正式契约 → ADR 原因
                                   ↓
                         下一阶段只在 roadmap
```

- 保留已发布/当前使用的协议、公开 API、当前模块说明和有效资格证据；不把过程取证、PR 提示词或逐轮 review 写进主导航。
- **实现完成 ≠ 资格签署。** M11、M14、M15 的精确 subject 和签核记录仍由各自 qualification ledger 拥有；地图原版动态保真单独待资格。
- 已完成过程文档可由原 PR/提交和 `git log --follow -- <path>` 追溯。删除文件前要先迁移仍有效的决策与未完成事项，核对源码、测试、站内及站外引用。
- 正文出现的 `main@<SHA>` 是审查时基线，不是自动更新的 PASS 状态。需要当前结论应查同一 SHA 的 CI。

本地验证：`npm run docs:check-links`、`npm run docs:build`。任何一项失败都不能声称文档重构交付完成。
