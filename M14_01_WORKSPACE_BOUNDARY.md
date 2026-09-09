# M14 / 01 — Workspace and Game Ownership Boundary

> 状态：Implementation Landing / M14 Pending

## Objective

先把 repository ownership 落到文件系统和 npm workspace，再实现 map。M14 不允许继续把业务库放进 framework `packages/`。

目标结构：

```text
packages/      LoomRealm framework/runtime
game-libs/     reusable game-domain libraries
examples/      concrete games, private
apps/          platform hosts
tools/         development/import/compatibility tooling
```

## Required workspace change

当前 root workspace 只有 `packages/*` 与 `apps/*`。M14/01 增加：

```text
game-libs/*
examples/*
```

预期 npm workspace shape：

```json
{
  "workspaces": [
    "packages/*",
    "game-libs/*",
    "apps/*",
    "examples/*"
  ]
}
```

`tools/*` 不是 runtime workspace category；现有 fixture/import tooling 保持 tool ownership。

## Package identity

```text
packages/*   → @loomrealm/*
game-libs/*  → @loomrealm-game/*
examples/*   → private, not publishable
```

M14 map package：

```text
game-libs/map
@loomrealm-game/map
```

禁止创建 `@loomrealm/map`。

## Dependency rule

```text
examples → game-libs → public LoomRealm author APIs
```

Framework/runtime packages不得依赖 game libraries/examples；game library runtime side不得 import Renderer/Main/Platform/protocol internals。

## Script hygiene

现有使用 `--workspaces` 的命令在加入 examples 后必须复核语义。Framework/package qualification 不应因为 workspace expansion 隐式把 concrete examples 当成 framework packages。

允许最小拆分：

```text
framework package build/test
game-lib build/test
example qualification
repository-wide convenience command
```

不要建立 workspace orchestration framework。

## Closure

- repository taxonomy 与 ADR 0032 一致；
- `game-libs/` / `examples/` 成为真实 workspaces；
- existing M13 gate 不因 workspace 扩展改变语义；
- examples 明确 private；
- framework package graph 不出现 game-lib/example reverse dependency。
