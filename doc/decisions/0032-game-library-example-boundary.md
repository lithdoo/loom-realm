# ADR 0032 — Framework / Game Library / Example Workspace Boundary

- 状态：Accepted / M14
- 日期：2026-09-09
- 影响范围：repository taxonomy、M14 package placement、first real game vertical

## Context

M13 关闭后，Phase 1 需要第一个真实业务 consumer。原计划把地图实现为 `packages/map` / `@loomrealm/map`，并以 `loom.map` 作为业务身份。这个形状会把 framework/runtime package、可复用游戏业务库和具体游戏混在同一命名/目录层级，容易让业务能力被误解为 LoomRealm core API。

同时，`tools/fixtures/essentials-v21.1` 已经形成完整的 Pokémon Essentials v21.1 acquisition/import/qualification pipeline，但它的职责是开发与兼容性准备，不应成为游戏 runtime dependency，也不应成为第三方素材分发渠道。

## Decision

仓库顶层职责分成五类：

```text
packages/
    LoomRealm framework/runtime packages

game-libs/
    reusable game-domain libraries

examples/
    concrete games / integration examples

apps/
    platform host applications

tools/
    development/import/compatibility tooling
```

依赖方向固定为：

```text
examples/*
    ↓
game-libs/*
    ↓
public LoomRealm author APIs
    ↓
packages/*
```

允许 concrete example 直接消费 public LoomRealm author APIs；禁止反向依赖：

```text
packages/* → game-libs/* / examples/*
game-libs/* → renderer/main/platform/protocol internals
runtime game code → tools/*
apps/* → concrete game business semantics
```

`packages/*` 继续使用 `@loomrealm/*` framework namespace。M14 的可复用地图业务库放在：

```text
game-libs/map
```

并使用与 framework 明确区分的 package identity：

```text
@loomrealm-game/map
```

M14 不创建 `@loomrealm/map`，也不把 `loom.*` 作为 framework-reserved business Subsystem key prefix。具体游戏拥有自己的 Subsystem key。

## Map ownership

`game-libs/map` 是游戏业务库，不是 Renderer primitive。它可以同时拥有两个隔离 execution side：

```text
runtime Definition side
→ only public @loomrealm/subsystem author API

browser presentation side
→ map-owned Custom Elements / CSS / Canvas / WebGL
→ structural M13 Web Presentation consumer
```

两侧可以来自同一个 game library workspace，但不得通过同一 runtime entry 混入 DOM/Renderer/Platform dependency。

Map library 拥有自己的 normalized map business/content schema；它不得知道 Pokémon Essentials、RPG Maker XP、PBS、Marshal 或 importer implementation。

## First concrete example

M14 concrete game 位于：

```text
examples/essentials-v21.1
```

它是 private workspace，不发布 npm package。它负责把具体 Essentials-compatible game composition 与 `@loomrealm-game/map` 连接起来。

第三方 source/material 不提交进 example。开发准备链为：

```text
local/external Essentials v21.1 source
→ tools/fixtures/essentials-v21.1 importer
→ local prepared canonical/FSDB data
→ example-local compatibility preparation
→ map-library-owned normalized records/resources
→ examples/essentials-v21.1 runtime
```

`tools/fixtures/essentials-v21.1` 只参与 development/preparation；game library 和 runtime example 不 import tool modules、不读取 tool filesystem layout。

## Qualification split

M14 canonical CI 使用仓库可分发的 synthetic/author-owned fixture，证明完整 architecture/game vertical；官方 Essentials v21.1 corpus 作为独立 local compatibility evidence，证明真实数据适配，不把第三方 corpus 变成 CI/repository distribution dependency。

## Rejected

```text
packages/map
@loomrealm/map
framework-owned map/component vocabulary
examples hidden inside apps/desktop
runtime dependency on tools/fixtures
copy official Essentials/Pokémon assets into repository
map library directly parsing PBS/Marshal/RMXP
universal GameLibrary framework/registry
```

## Consequences

M14 是第一次明确验证：LoomRealm framework 可以被独立 game library 与 concrete game 消费，而不把业务能力吸收到 core package graph。

M10–M13 contracts 不因本决定 reopen；本 ADR 只改变 M14 repository/package ownership 与 consumer composition。

## Reopen

只有真实多个 game libraries/examples 证明当前五类目录无法表达 ownership，或 package publishing/consumer ergonomics 出现具体冲突时才调整 taxonomy。不得为了目录对称预建新的 workspace category 或 game framework registry。
