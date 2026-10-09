# Package / App / Example 边界

## Package-local docs

```text
README.md       usage / exports / quick boundary / authoritative links
DESIGN.md       optional internal realization and invariants
CONFORMANCE.md  optional independently useful conformance contract
```

System authority 属于 Architecture；cross-package ABI 属于 Contracts；qualification policy 属于 `30-development`。Package README 不维护 project progress。

## Dependency rules

- framework package 不依赖 concrete game/example；
- game-libs 只通过 framework public author API 消费 runtime；
- examples 可以组合 game-libs 与 framework，但不能定义 framework contract；
- apps 拥有 platform-specific composition，不把 Hostra/Browser physical details 泄漏成 logical ABI；
- reusable domain mechanics 应由最近的真实 owner package 持有，避免 HTTP-over-HTTP、private workspace import 或重复 scanner/state machine。

## Documentation hygiene

`todo_docs/`、完成的 `*_PLAN`、`*_REVIEW`、`*_CLOSURE` 不作为长期 package 文档。仍未完成的工作放 Issue；不可替代研究结论合入 Architecture/Module/Reference；其余由 Git 历史保存。
