# Qualification CI

Repository CI 按 capability 提供 package、contract 与 product evidence。现有部分 workflow/script 仍使用 `mXX` 历史名字；这些名字是兼容的 command/check interface，不再定义 Current 文档信息架构。

## PR aggregate

`.github/workflows/m12-m15-pr.yml` 当前仍运行四组 capability delta 和一个 fail-closed summary：

| Capability | Existing alias | Nodes | Purpose |
| --- | --- | --- | --- |
| Content/storage integration | `test:m12` | 20, 24 | Content/FSDB boundary + upstream regressions |
| Web Presentation | `test:m13:pr` | 20, 24 | Browser presentation/projector delta |
| Map real consumer | `test:m14:pr` | 20, 24 | game-lib/example/real browser consumer delta |
| Desktop product | `test:m15:pr` | 24 | Hostra-owned Desktop E2E delta |
| Summary | workflow summary | n/a | fails if any constituent job fails/skips/cancels |

GitHub Actions jobs do not share filesystem state；各 delta 必须自行 clean build。Report artifact 继续在失败后上传，M15 的 Electron isolation/concurrency 约束保持不变。

## Canonical / main gates

现有 `m12.yml`～`m15.yml`、`test:m12`～`test:m15` 暂时保留，避免文档整理同时改变 branch protection、required checks 或 release tooling。未来若重命名，应作为独立工程变更：保持 Node matrix、coverage、Hostra pin、fail-closed summary 与 required-check migration，并用 `test/ci-pr-coverage.test.mjs` 防止静默降级。

PWA、Realm State、Renderer、Data、Runtime 等继续使用各自独立 workflow/package gates。

## Qualification rule

CI success 只是 evidence。是否可以称为 Qualified 仍取决于 [`doc/30-development/qualification.md`](../doc/30-development/qualification.md) 的 subject/staleness 规则；历史 PASS 不能自动迁移到新的 behavior 或 qualification-input subject。
