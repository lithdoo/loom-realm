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

M14 不建立 `MapNormalizedV1`、`MapBundle` 或另一个 generic map schema。Essentials v21.1 / RMXP map model 是第一版 map content 的 **semantic authority**，而不是 map runtime 的 object/API representation。

Semantic authority 包括：

```text
RPG::Map
RPG::Tileset
RPG::MapInfo
RPG::Event / Page / EventCommand
RGSS Table
Essentials MapMetadata / map connections
```

这些名称定义字段含义、关系与行为来源。

Runtime representation 固定为：

```text
prepared FSDB JSON records/resources
→ M12 ContentClient
→ @loomrealm-game/map
```

Map runtime MUST consume ordinary `JsonValue` records returned by `ContentClient.record()`；它 MUST NOT receive or depend on：

```text
RPG/RMXP decoder object/class instances
Ruby Marshal binary encoding
.rxdata parsing
Ruby object graph wrappers
RmxpObject / RubyString / $id / $ref / $typed importer representation
rubyObjectId
tools/fixtures implementation/filesystem layout
Hostra/PWA physical storage
```

因此“采用 RMXP/Essentials map semantics”精确表示：**FSDB JSON record 的业务含义与 RMXP/Essentials map model 对齐，而不是把 importer/RMXP decoder object 暴露给 game library。**

## Import / FSDB semantic materialization

`tools/fixtures/essentials-v21.1` 继续拥有 source acquisition 与 source-format compatibility semantics：

```text
Ruby Marshal
.rxdata / RPG::* object decoding
PBS / Essentials compiled data
source filesystem/layout
```

它在 preparation 阶段完成：

```text
source bytes/objects
→ importer internal typed/object-graph representation
→ JSON-compatible semantic materialization
→ prepared FSDB records/resources
```

例如概念 FSDB identity：

```text
Map/{id}
Tileset/{id}
MapInfo/{id}
MapMetadata/{id}
```

该 materialization 只把已有 RMXP/Essentials 语义转换为 `ContentClient` 可返回的 JSON-compatible persisted representation，并移除 Ruby/Marshal/object-graph transport details；不重新发明地图业务语义。

M14 consumer projection 的精确机械规则由：

```text
tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
```

拥有。关键规则包括：

```text
known RPG @ivar → strip exactly one leading @, preserve remaining spelling
RubyString / RubySymbol → JSON string
Ruby Array → JSON array
RGSS Table → { dimensions, xSize, ySize, zSize, values:number[] }
Map.events → embedded JSON object keyed by decimal event id
```

M14 first slice 不拆 `MapEvent` Group，也不为表型对称新增 `ContentClient.group()`。无法无歧义 materialize、但被真实 vertical需要的 source fact必须在 preparation 阶段 fail closed，先增加最小 semantic projection；不得把 generic importer wrapper穿透给 Runtime。

现有 importer lossless structural/raw authority继续保留 unknown/extra source data；M14 consumer projection 是 derived consumer view，不替代原 authority。

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
→ FSDB JSON records whose semantics mirror required RMXP/Essentials map facts
  + raw resources
→ example/test prepared Content assembly
→ local prepared Content
→ examples/essentials-v21.1
→ @loomrealm-game/map via ContentClient
```

## Concrete Game Entry participation

M14 qualification MUST 实际读取并验证：

```text
examples/essentials-v21.1/game.json
→ parseGameEntryV1 / validateGameEntryV1
→ validated subsystem topology + initial target/input
→ test-owned physical Definition binding
→ Main
```

不得把 example 降级为“只提供 fixture 文件”，也不得在 test harness 中绕过 Game Package 后硬编码 logical topology。

M14 不要求 Hostra/PWA Launch Manifest。第一条 vertical MAY 由 example initial input直接提供 `mapId/x/y` player spawn，从而不把完整 `RPG::System` startup compatibility变成 first-slice prerequisite。

## Prepared Content assembly

Essentials importer只负责 source → semantic records/resources；它不拥有 map browser artifacts。

M14 的 example/test preparation 只负责把已有内容组装成 qualification 使用的单一 prepared Content view：

```text
importer-produced FSDB or CI-safe semantic fixture
+
@loomrealm-game/map browser JS/CSS
+
example WebPresentationConfig logical refs
→ one test-local prepared Content view
```

该 preparation不得重新解释 RMXP semantics，不成为 Runtime dependency/production Host，也不建立 UniversalGamePackager / generic ContentBuilder framework。

## Presentation resource path

Map runtime通过 `ContentClient` 读取 FSDB JSON records。Resource logical identity复用现有 Content mapping，例如：

```text
Tileset name  → Graphics / Tilesets/{tileset_name}
Autotile name → Graphics / Autotiles/{name}
Character name → Graphics / Characters/{character_name}
```

当前 Subsystem author API 没有 resource metadata/HEAD surface。M14 第一版用现有：

```text
ContentClient.resource(namespace, key)
→ bytes + mime + contentVersion
```

取得真实资源的 `contentVersion`；Runtime 若不需要 bytes，不长期保留。Render state只携带 `namespace/key/contentVersion`，map-owned WC 再通过 M13 `PresentationResourceClient` 获得 tileset/player sprite bytes。

```text
FSDB JSON Content record
→ logical resource namespace/key
→ map runtime ContentClient.resource()
→ contentVersion
→ RenderDomain
→ M13
→ map WC
→ PresentationResourceClient
→ browser bytes
```

禁止 path、URL、credential、raw resource bytes进入 business Render payload。

M14 接受 Runtime 与 Renderer 可能各读一次同一 resource，不为理论效率新增 M12 resource metadata API；只有真实 workload 的 measurable evidence 才支持后续最小 reopen。

Map browser JS/CSS 本身也必须作为 prepared Content 资源进入 `WebPresentationConfigV1` bootstrap；qualification不得用 test-local direct import绕过 M13 startup。

## Qualification split

M14 canonical CI 使用仓库可分发的 synthetic/author-owned **FSDB JSON fixture**，其字段语义必须与同一 RMXP/Essentials-compatible Content model 对齐，证明完整 architecture/game vertical；官方 Essentials v21.1 corpus 作为独立 local compatibility evidence，证明真实 source → M14 consumer projection → FSDB JSON materialization，不把第三方 corpus 变成 CI/repository distribution dependency。

两条 evidence 必须通过相同的 prepared Content assembly → `ContentClient` → `@loomrealm-game/map` → browser consumer path，不能让 CI 或 local qualification 直接给 map runtime 注入 decoder object。

现有 importer RC 继续有效，但不等价于 M14 `Map/{id}` / `Tileset/{id}` consumer projection 已完成；后者必须单独实现和 qualification。

M14 full vertical可以使用 test-owned composition harness串联现有 production Main/Subsystem/Data/Renderer/Content roles + real Chromium。该 harness只是 qualification mechanics，不是新的 production Host/Platform；Hostra BrowserWindow/physical input/reload-shutdown仍属于 M15。

## Rejected

```text
packages/map
@loomrealm/map
framework-owned map/component vocabulary
MapNormalizedV1 / universal map schema
MapBundle abstraction
MapEvent Group + ContentClient.group() only for M14 symmetry
examples hidden inside apps/desktop
runtime dependency on tools/fixtures
copy official Essentials/Pokémon assets into repository
map runtime consuming RPG/RMXP decoder objects
map runtime consuming RmxpObject/$ref/$typed importer wrappers
resource metadata/HEAD author API only for theoretical efficiency
universal GameLibrary framework/registry
UniversalGamePackager / generic ContentBuilder
MiniDesktopHost / MapHost production abstraction for M14
```

## Consequences

M14 是第一次明确验证：LoomRealm framework 可以被独立 game library 与 concrete game 消费，而不把业务能力吸收到 core package graph。

采用现成 RMXP/Essentials map semantics 也意味着 `@loomrealm-game/map` 是一个真实的 tile-RPG map library，而不是 LoomRealm 的 universal map abstraction；但其 Runtime 数据面仍是 FSDB JSON + Content API，不是 RMXP decoder API。未来 3D/hex/voxel world 不被要求适配这一 package。

M10–M13 contracts 不因本决定 reopen；本 ADR 只改变 M14 repository/package ownership 与 consumer composition。

## Reopen

只有真实多个 game libraries/examples证明当前五类目录无法表达 ownership，或真实非-RMXP map consumer证明需要共享更高层 map abstraction，或 M14 workload证明现有 Content capability有 measurable correctness/performance缺口时才调整。不得为了目录/package/API 对称提前泛化。
