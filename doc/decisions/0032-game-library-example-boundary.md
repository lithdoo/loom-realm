# ADR 0032 — Framework / Game Library / Example Workspace Boundary

- 状态：Accepted / M14
- 日期：2026-09-09
- 影响范围：repository taxonomy、M14 package placement、first real game vertical

## Context

M13 关闭后，Phase 1 需要第一个真实业务 consumer。原计划把地图实现为 `packages/map` / `@loomrealm/map`，并以 `loom.map` 作为业务身份。这个形状会把 framework/runtime package、可复用游戏业务库和具体游戏混在同一命名/目录层级，容易让业务能力被误解为 LoomRealm core API。

同时，`tools/fixtures/essentials-v21.1` 已经形成完整的 Pokémon Essentials v21.1 acquisition/import/qualification pipeline。现有代码已经能够理解 RMXP `RPG::Map`、`RPG::Tileset`、`RPG::Event`、RGSS `Table` 等真实 map semantics，因此 M14 没有充分理由再额外设计一套 universal/normalized map schema。

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

M14 直接采用 Essentials v21.1 / RMXP map semantic model作为第一版 map business/content model。Map library MAY understand：

```text
RPG::Map
RPG::Tileset
RPG::MapInfo
RPG::Event / Page / EventCommand
RGSS Table
Essentials MapMetadata / map connections
```

但 MUST NOT understand：

```text
Ruby Marshal binary encoding
.rxdata parsing
Ruby object graph wrappers
RmxpObject / RubyString / $id / $ref / $typed importer representation
tools/fixtures implementation/filesystem layout
Hostra/PWA physical storage
```

因此 M14 不建立 `MapNormalizedV1`、`MapBundle` 或另一个 generic map schema。

## Import / semantic materialization

`tools/fixtures/essentials-v21.1` 继续拥有 source acquisition 与 source-format compatibility semantics：

```text
Ruby Marshal
.rxdata / RPG::* object decoding
PBS / Essentials compiled data
source filesystem/layout
```

它在 preparation 阶段把 source representation materialize 为可由 M12 Content API 直接读取的 RMXP/Essentials semantic records/resources，例如：

```text
Map/{id}
Tileset/{id}
MapInfo/{id}
MapMetadata/{id}
```

该 materialization 的职责只是移除 Ruby/Marshal/object-graph transport details，不重新发明地图业务语义。

Runtime game/map library不 import tool modules；第三方 source/material不提交仓库。

## First concrete example

M14 concrete game 位于：

```text
examples/essentials-v21.1
```

它是 private workspace，不发布 npm package。它负责：

```text
Game Entry / concrete Subsystem keys
initial business input
concrete game composition
game-specific glue
WebPresentationConfig declaration
```

它不再承担 Essentials→map normalized adapter，也不是 map compiler。

开发准备链为：

```text
local/external Essentials v21.1 source
→ tools/fixtures/essentials-v21.1 importer
→ RMXP/Essentials semantic records + resources
→ local prepared Content/FSDB
→ examples/essentials-v21.1
→ @loomrealm-game/map
```

## Presentation resource path

Map runtime通过 `ContentClient` 读取 semantic records，并把可见资源的 logical identity/version放入 Render state；map-owned WC 再通过 M13 `PresentationResourceClient` 获得 tileset/player sprite bytes。

```text
Content semantic record
→ resource logical identity/version
→ RenderDomain
→ M13
→ map WC
→ PresentationResourceClient
→ browser bytes
```

禁止 path、URL、credential、raw resource bytes进入 business Render payload。

Map browser JS/CSS 本身也必须作为 prepared Content 资源进入 `WebPresentationConfigV1` bootstrap；qualification不得用 test-local direct import绕过 M13 startup。

## Qualification split

M14 canonical CI 使用仓库可分发的 synthetic/author-owned RMXP-compatible semantic fixture，证明完整 architecture/game vertical；官方 Essentials v21.1 corpus 作为独立 local compatibility evidence，证明真实数据 materialization，不把第三方 corpus 变成 CI/repository distribution dependency。

M14 full vertical可以使用 test-owned composition harness串联现有 production Main/Subsystem/Data/Renderer/Content roles + real Chromium。该 harness只是 qualification mechanics，不是新的 production Host/Platform；Hostra BrowserWindow/physical input/reload-shutdown仍属于 M15。

## Rejected

```text
packages/map
@loomrealm/map
framework-owned map/component vocabulary
MapNormalizedV1 / universal map schema
MapBundle abstraction
examples hidden inside apps/desktop
runtime dependency on tools/fixtures
copy official Essentials/Pokémon assets into repository
map runtime consuming RmxpObject/$ref/$typed importer wrappers
universal GameLibrary framework/registry
MiniDesktopHost / MapHost production abstraction for M14
```

## Consequences

M14 是第一次明确验证：LoomRealm framework 可以被独立 game library 与 concrete game 消费，而不把业务能力吸收到 core package graph。

采用现成 RMXP/Essentials map semantics 也意味着 `@loomrealm-game/map` 是一个真实的 tile-RPG map library，而不是 LoomRealm 的 universal map abstraction。未来 3D/hex/voxel world 不被要求适配这一 package。

M10–M13 contracts 不因本决定 reopen；本 ADR 只改变 M14 repository/package ownership 与 consumer composition。

## Reopen

只有真实多个 game libraries/examples证明当前五类目录无法表达 ownership，或真实非-RMXP map consumer证明需要共享更高层 map abstraction时才调整。不得为了目录/package/API 对称提前泛化。
