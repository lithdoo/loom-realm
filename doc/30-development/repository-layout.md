# 仓库布局

```text
packages/     framework/runtime/protocol implementation
game-libs/    reusable game-domain libraries
apps/         concrete physical products: Desktop / PWA
examples/     concrete games, fixtures, legal-local compatibility entries
tools/        import/fixture/developer tooling
test/         repository-level boundary and qualification tests
doc/          Current documentation + controlled legacy evidence
.github/      CI/workflow policy
```

依赖方向遵循 Architecture/Contracts，而不是目录便利性。典型业务依赖为：

```text
examples → game-libs → framework public author APIs
apps     → platform/launcher/runtime public boundaries
```

`doc/00/10/15/20/30-development` 是 Current 文档树；`doc/30-implementation` 仅保留 legacy qualification/evidence compatibility，不得新增 live roadmap。
