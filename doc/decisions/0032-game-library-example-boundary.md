# ADR 0032 — Framework / Game Library / Example Workspace Boundary

- 状态：Accepted / M14
- 日期：2026-09-09
- 最近复核：2026-09-10
- 影响范围：repository taxonomy、M14 package placement、first real game vertical

## Context

M13 关闭后，Phase 1 需要第一个真实 business consumer。把地图实现成 `packages/map` / `@loomrealm/map` 会把 LoomRealm framework、可复用游戏业务和具体游戏混在同一 ownership/package layer。

同时 `tools/fixtures/essentials-v21.1` 已经拥有 Pokémon Essentials v21.1 acquisition/import/lossless compatibility machinery。M14 没有理由再设计 universal/normalized map schema，也没有理由把整个 RMXP object graph重新 materialize 成一套新模型。

## Decision

Repository top-level ownership：

```text
packages/      LoomRealm framework/runtime packages
game-libs/     reusable game-domain libraries
examples/      concrete games/integration examples
apps/          platform hosts
tools/         development/import/compatibility tooling
```

Dependency direction：

```text
examples/*
    ↓
game-libs/*
    ↓
public LoomRealm author APIs
    ↓
packages/*
```

Forbidden reverse/cross-boundary dependencies：

```text
packages/* → game-libs/* / examples/*
game-libs/* → renderer/main/platform/protocol internals
runtime game code → tools/*
apps/* → concrete game business semantics
```

Framework packages keep `@loomrealm/*`。Reusable game libraries use `@loomrealm-game/*`。

M14 map package：

```text
game-libs/map
@loomrealm-game/map
```

M14 does not create `@loomrealm/map`。

## Map ownership

`game-libs/map` is a game-domain consumer, not a Renderer primitive or universal map framework。

Same package may own two isolated execution sides：

```text
Runtime Definition side
→ public @loomrealm/subsystem author API only

Browser presentation side
→ map-owned Custom Elements / CSS / Canvas
→ structural M13 Web Presentation consumer
```

Importing Runtime root must not execute browser/DOM code。Browser code must not obtain Subsystem/Main/Data authority objects or physical Content credentials。

## RMXP/Essentials semantic authority vs Runtime representation

RMXP/Essentials remains semantic authority for the source facts M14 actually consumes, including the meaning of：

```text
RPG::Map.width / height / tileset_id / data
RPG::Tileset.id / tileset_name / passages / priorities
RGSS Table ordering and directional passage semantics
```

Runtime representation is ordinary prepared FSDB JSON records/resources consumed through M12 `ContentClient`。

Runtime MUST NOT receive or depend on：

```text
Ruby Marshal bytes
.rxdata parsing
RPG/RMXP decoder instances
RmxpObject / RubyString wrappers
$id / $ref / $typed importer representation
rubyObjectId
tools/fixtures filesystem layout
Hostra/PWA physical storage identity
```

## Selective M14 consumer projection

M14 first slice deliberately materializes only the two record families needed by the map consumer：

```text
Map/{id}
Tileset/{id}
```

Exact consumer values are selective：

```text
Map/{id}
    tileset_id
    width
    height
    data

Tileset/{id}
    id
    tileset_name
    passages
    priorities
```

Source-root identity and Table projection rules are frozen by：

```text
tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
```

M14 does **not** recursively project the entire known `RPG::Map` / `RPG::Tileset` object graph merely because the importer can decode it。

First-slice-unused source facts remain in the existing lossless/importer evidence, including：

```text
Map events / BGM / BGS / encounters
Tileset autotile names / panorama / fog / terrain tags
MapInfo / MapMetadata
Color / Tone / Event/Page/Command graphs
```

If a later real game behavior needs one, add only the smallest source-specific consumer projection at that time。

This avoids both a `MapNormalizedV1` schema and a generic `ConsumerProjector` framework。

## First concrete example

Concrete game：

```text
examples/essentials-v21.1
```

It is private and not published。

It owns：

```text
Game Entry / concrete Subsystem keys
initial business input
concrete game composition
WebPresentationConfig declaration
page/window CSS
```

It does not own an Essentials→map adapter、map compiler、production Host or Renderer integration framework。

## Concrete Game Entry participation

M14 qualification MUST read and validate the checked-in：

```text
examples/essentials-v21.1/game.json
```

through existing Game Package validation before Main receives initial target/input。

M14 first slice may use explicit initial：

```text
{ mapId, x, y, characterName }
```

so full `RPG::System`/Trainer startup is not a prerequisite。

## Prepared Content assembly

Importer owns source compatibility only。Example/test preparation composes already-existing outputs：

```text
selective Map/Tileset FSDB records + raw resources
+
@loomrealm-game/map browser JS/CSS
+
example WebPresentationConfig/page CSS
→ one test-local prepared Content view
```

This is an action/simple test preparation step, not a UniversalGamePackager、ContentBuilder、manifest framework or production Host。

Map browser artifacts are resolved through package subpaths, not private `dist/` reach-through。

## Resource flow

Runtime derives logical resource identity from selected semantic facts：

```text
Tileset.tileset_name
→ Graphics / Tilesets/{tileset_name}

initial characterName
→ Graphics / Characters/{characterName}
```

Current author API has no metadata/HEAD seam。M14 uses：

```text
ContentClient.resource(namespace,key)
→ bytes + mime + contentVersion
```

Runtime only needs existence/version and does not keep bytes。Render carries `{namespace,key,contentVersion}`；map-owned WC obtains browser bytes through M13 `PresentationResourceClient`。

Runtime/Renderer duplicate reads are accepted。No metadata API or AssetManager is added for theoretical efficiency。

## Presentation ownership

Map presentation belongs to the game library：

```text
lr-map-view
lr-map-sprite
```

`lr-map-view` owns private Canvas/slot/overlay mechanics；`lr-map-sprite` owns player sprite mechanics。Exact private Shadow wrapper structure is not a public/business contract。

M13 bootstrap still loads the package browser JS/CSS through prepared Content。Qualification does not direct-import business browser source to bypass M13 startup。

## Qualification split

Canonical CI uses repository-owned semantic Map/Tileset fixture + author-owned graphics to prove deterministic architecture/game behavior。

Exact Essentials v21.1 local evidence uses real external source：

```text
source
→ existing importer/lossless decode
→ selective M14 consumer projection
→ prepared FSDB
→ same @loomrealm-game/map Runtime/browser implementation
```

Third-party source bytes are never committed or uploaded as CI artifacts。

M14 may use a repository-owned test composition harness connecting existing production roles and real Chromium。That harness is qualification mechanics, not a new production Host/Platform abstraction。

M13 internal Window-composition mechanics may be reused only by repository qualification code；game library/example business code may not depend on Renderer internals。Production Desktop Window composition belongs to M15。

## Rejected

```text
packages/map
@loomrealm/map
framework-owned map/component vocabulary
MapNormalizedV1 / universal map schema
MapBundle abstraction
generic recursive RMXP consumer model
MapEvent Group / ContentClient.group() for symmetry
MapInfo/MapMetadata projection without a consumer
runtime dependency on tools/fixtures
copy official Essentials/Pokémon assets into repository
map Runtime consuming importer wrappers
resource metadata/HEAD API for theoretical efficiency
GameLibrary framework/registry
UniversalGamePackager / generic ContentBuilder
MiniDesktopHost / MapHost / GameRuntimeHost for M14
SceneGraph / LayerManager / AssetManager
```

## Consequences

M14 proves LoomRealm framework can be consumed by an independent game library and concrete game without absorbing business semantics into core package graph。

The map library is intentionally a concrete RMXP/Essentials-compatible tile-RPG consumer, not a universal map abstraction。Future 3D/hex/voxel worlds are not required to conform to it。

Selective projection means source fidelity remains in the existing importer while Runtime receives only facts justified by current behavior。This keeps implementation small and makes future additions evidence-driven。

M10–M13 contracts are not reopened by this ADR。

## Reopen

Reopen only when real consumer evidence demonstrates：

```text
current repository ownership cannot express multiple real game libraries/examples
or
another real map consumer needs a proven shared abstraction
or
M14 workload exposes a measurable correctness/performance gap in existing public capability
```

Do not generalize for symmetry、future speculation or package aesthetics。