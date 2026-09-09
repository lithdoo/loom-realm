# M14 / 03 — Essentials v21.1 Concrete Example

> 状态：Implementation Landing / M14 Pending

## Objective

建立第一个 concrete private game workspace：

```text
examples/essentials-v21.1
```

它证明 concrete game 如何组合 LoomRealm framework + `@loomrealm-game/map`，而不是把 game-specific glue 塞进 `packages/*` 或 `apps/desktop`。

## 1. Ownership

Example owns：

```text
game.json
concrete logical subsystem keys
initial business input
thin test/dev composition
concrete page/window CSS
WebPresentationConfig declaration
CI-safe author-owned first-slice fixture
```

It does not own：

```text
Essentials→map normalized adapter
map Runtime semantics
map Web Component internals
Desktop Hostra process topology
source/importer implementation
```

Concrete logical key is frozen：

```text
map
→ @loomrealm-game/map Definition
```

The workspace is `private: true` and is not publishable.

## 2. Exact Game Entry

M14 CI example `game.json` is conceptually exact：

```json
{
  "formatVersion": 1,
  "initial": {
    "subsystem": "map",
    "input": {
      "mapId": 1,
      "x": 10,
      "y": 8,
      "characterName": "m14_player"
    }
  },
  "subsystems": [
    { "key": "map" }
  ]
}
```

Qualification MUST read this file and run it through existing `@loomrealm/game-package` parsing/validation before Main receives the initial target/input.

The example does not fake a Launch Manifest. M14 harness owns only the physical test binding：

```text
validated logical key "map"
→ @loomrealm-game/map Definition
```

Real Hostra Node child provisioning belongs to M15.

## 3. Source / importer boundary

`tools/fixtures/essentials-v21.1` remains source/import/compatibility tooling only.

```text
external/local Essentials v21.1 source
→ existing acquisition + Marshal/RMXP decode
→ importer internal representation
→ M14 consumer semantic JSON materialization
→ prepared FSDB records/resources
→ example/test prepared Content assembly
→ M12 Content
→ @loomrealm-game/map Runtime/browser path
```

Runtime example and game library MUST NOT import `tools/*`, inspect `.rxdata`, or consume `RmxpObject/RubyString/$id/$ref/$typed` wrappers.

Exact source-root → `Map`/`Tileset` consumer identity belongs to `tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md`.

## 4. Thin prepared Content assembly

The importer does not know browser JS/CSS or Web Presentation Config. The map package does not know the concrete game page.

One example/test-local preparation step composes already-existing artifacts：

```text
CI semantic FSDB fixture OR importer-produced local FSDB
+
@loomrealm-game/map dist/browser/map.browser.js
+
@loomrealm-game/map dist/browser/map.css
+
examples/essentials-v21.1/presentation.css
+
example WebPresentationConfig refs
→ one prepared Content view
```

This step MAY copy/materialize files and create the test-local Content view. It MUST NOT：

```text
perform another map semantic transform
rewrite WC source
inject test-only customElements.define()
parse RMXP source
become a production Host
become UniversalGamePackager / ContentBuilder framework
```

No generic packaging abstraction is introduced for one example.

## 5. Frozen browser Content identities

For M14 qualification the prepared view uses stable logical presentation identities：

```text
Presentation / map/map.css
Presentation / essentials/page.css
Presentation / map/map.browser.js
```

The example `WebPresentationConfigV1` preserves order：

```text
styles[]
    1. Presentation / map/map.css
    2. Presentation / essentials/page.css

scripts[]
    1. Presentation / map/map.browser.js
```

The config carries logical Content refs only; no path/URL/token.

The map browser artifact is the classic-script artifact frozen by M14/02. Tests may not import its source directly or manually register the two tags.

## 6. Fixed 640×480 page composition

M14 first slice deliberately does not support responsive map layout. The example page CSS fixes the viewport through CSS：

```css
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  display: grid;
  place-items: center;
  overflow: hidden;
}

lr-map-view {
  width: 640px;
  height: 480px;
}
```

This is concrete example/page ownership. Map component CSS still owns clipping, Canvas/entity overlay and sprite visual mechanics.

The fixed first-slice agreement is：

```text
32px tile
640×480 CSS viewport
20×15 nominal tile viewport
```

Runtime uses the corresponding frozen logical constants from M14/02; it does not read computed DOM layout. Browser does not send resize information back to Runtime.

Qualification MUST observe computed `lr-map-view` size `640×480` in Chromium. `devicePixelRatio` may change Canvas backing-store pixels privately but not logical map coordinates.

## 7. Author-owned CI semantic fixture

Canonical CI MUST NOT depend on third-party Pokémon Essentials assets. It uses a checked-in synthetic/author-owned fixture whose facts are frozen before implementation so the test cannot adapt to an arbitrary algorithm.

### Map/1

```text
width  = 24
height = 18
tileset_id = 1
spawn = (10,8)
```

`data` is a 3D projected RGSS Table：

```text
dimensions = 3
xSize = 24
ySize = 18
zSize = 3
values.length = 24 * 18 * 3
```

Fixture tile facts：

```text
z=0: regular tile 384 everywhere in the tested/visible map area,
     except (12,8) = tile 385
z=1: tile 0
z=2: tile 0
```

It MUST obey frozen Table index ordering rather than use a bespoke fixture layout.

### Tileset/1

Minimal required semantic fields：

```text
id = 1
tileset_name = "m14_tileset"
passages = projected 1D Table large enough to index used tile ids
priorities = projected 1D Table large enough to index used tile ids
```

Critical passability facts：

```text
passages[0]   = 0
priorities[0] = 5

passages[384]   = 0x00
priorities[384] = 0

passages[385]   = 0x02   # cannot enter this tile from its left side
priorities[385] = 0
```

Therefore the exact CI movement sequence is predetermined：

```text
start (10,8), facing down
ArrowRight non-repeat down
→ source/target passability true
→ position (11,8), facing right

ArrowRight non-repeat down again
→ target (12,8) reverse-entry direction = left / 0x02
→ blocked
→ position remains (11,8), facing right
```

No `blocked: true` derived fixture field is allowed; movement must follow Map.data + Tileset.passages/priorities.

### Author-owned graphic resources

The checked-in CI fixture includes only author-created images needed for deterministic browser qualification：

```text
Graphics / Tilesets/m14_tileset
    PNG
    at least 256px wide
    tile 384 and 385 source cells visually distinct

Graphics / Characters/m14_player
    PNG
    valid 4×4 character sheet
    frames visually distinguishable enough to prove the resource/crop path
```

The tileset visible slice uses only tile `0` and regular tiles `>=384`; no autotile is required by CI.

Third-party Essentials assets MUST NOT be copied into repository, logs or CI artifacts.

## 8. CI first-slice expected camera facts

With `Map/1`, spawn `(10,8)` and M14/02 camera formula：

```text
initial cameraX = 16
initial cameraY = 32
```

After the first right move to `(11,8)`：

```text
cameraX = 48
cameraY = 32
```

The fixed viewport and these expected values give qualification a deterministic observable for camera recomputation without any DOM→Runtime layout feedback.

## 9. CI vs exact local corpus

Two evidence paths remain distinct but converge into the same consumer implementation：

```text
Canonical CI
→ checked-in author-owned semantic FSDB fixture
→ exact game.json
→ prepared Content assembly
→ @loomrealm-game/map
→ M13 browser path

Exact v21.1 local compatibility
→ local third-party source
→ existing importer
→ M14 consumer projection
→ local prepared FSDB
→ same @loomrealm-game/map Runtime/browser code
```

Local compatibility does not need to re-prove Game Entry parsing because canonical CI already does; its purpose is to prove that exact Essentials v21.1 source can materialize the same required consumer facts and drive the same first-slice map implementation.

The local qualifier MAY accept a map/spawn/character selection because the external corpus is not a repository-owned fixture. That selection is qualification input, not a new game/runtime config API.

Local output stays under ignored `.local/` and never commits third-party bytes.

## 10. What the example does not own

M14 example does not create：

```text
EssentialsAdapter
MapBundleBuilder
GamePackager framework
MiniDesktopHost
RendererPlatform
DOM input producer
responsive layout controller
asset manifest/service
```

M15 will replace the M14 test-owned physical binding/input source with real Desktop Hostra/BrowserWindow physical composition while reusing this same `game.json`, map library and business WC vocabulary.

## Closure

- private example workspace exists;
- exact `game.json` parses/validates and targets logical `map`;
- fixed example CSS produces 640×480 `lr-map-view`;
- browser Config loads map CSS → page CSS → classic map JS in order;
- canonical fixture has frozen Map/Tileset/passability/resource facts;
- first passable + blocked movement outcomes are predetermined by those persisted facts;
- CI fixture and local v21.1 materialization enter the same Runtime/browser implementation;
- no importer/tool object or third-party asset crosses into Runtime or repository artifacts.
