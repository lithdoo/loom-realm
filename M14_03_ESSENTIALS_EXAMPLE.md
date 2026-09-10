# M14 / 03 — Essentials v21.1 Concrete Example

> 状态：Implementation Landing / M14 Pending

## Objective

建立第一个 concrete private game workspace：

```text
examples/essentials-v21.1
```

它证明 concrete game 如何组合 LoomRealm framework + `@loomrealm-game/map`，而不是把 game-specific glue 塞进 `packages/*` 或 `apps/desktop`。

## 1. Ownership / exact example files

Example owns：

```text
examples/essentials-v21.1/
    package.json                 private workspace
    game.json                    GameEntryV1
    presentation.json            WebPresentationConfigV1 candidate
    presentation.css             concrete page/window CSS
    test/...                     example/prepared-content qualification mechanics
```

It does not own：

```text
Essentials→map normalized adapter
map Runtime semantics
map Web Component internals
Desktop Hostra process topology
source/importer implementation
```

Concrete logical key：

```text
map
→ @loomrealm-game/map Definition
```

The workspace is `private: true` and is not publishable.

## 2. Exact Game Entry

Checked-in `game.json` is：

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

Qualification MUST read this file and run existing `@loomrealm/game-package` parsing/validation before Main receives initial target/input.

M14 harness owns only：

```text
validated logical key "map"
→ @loomrealm-game/map Definition
```

No Launch Manifest is fabricated. Real Hostra Node child provisioning belongs to M15.

## 3. Exact Web Presentation Config

Checked-in `presentation.json` is：

```json
{
  "formatVersion": 1,
  "styles": [
    { "namespace": "Presentation", "key": "map/map.css" },
    { "namespace": "Presentation", "key": "essentials/page.css" }
  ],
  "scripts": [
    { "namespace": "Presentation", "key": "map/map.browser.js" }
  ]
}
```

Qualification reads this file as the Config candidate and runs the existing M13 validation/preparation path. Test code MUST NOT replace it with an inline alternate Config.

The Config carries logical refs only; browser href/src binding remains test/Window composition mechanics as frozen by M13.

## 4. Source / importer boundary

`tools/fixtures/essentials-v21.1` remains source/import/compatibility tooling only：

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

Runtime example/game library never imports `tools/*`, inspects `.rxdata` or consumes importer wrappers.

Exact source-root → consumer identities are owned by `tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md`.

## 5. Thin prepared Content assembly

One example/test-local step composes already-existing artifacts：

```text
CI semantic FSDB fixture OR importer-produced local FSDB
+
@loomrealm-game/map dist/browser/map.browser.js
+
@loomrealm-game/map dist/browser/map.css
+
examples/essentials-v21.1/presentation.css
+
examples/essentials-v21.1/presentation.json
→ one prepared Content view + prepared M13 bootstrap input
```

Stable logical presentation identities：

```text
Presentation / map/map.css
Presentation / essentials/page.css
Presentation / map/map.browser.js
```

Required MIME：

```text
map/map.css            text/css
entials/page.css      text/css
map/map.browser.js     text/javascript
```

The obvious spelling correction for the second line is normative as `essentials/page.css`; no alternate namespace/key is allowed in the canonical CI fixture.

The preparation step MAY copy/materialize files and create the test-local Content view. It MUST NOT perform another map semantic transform, rewrite WC code, manually register tags, parse RMXP source, become a production Host or become a generic GamePackager/ContentBuilder.

## 6. Fixed 640×480 page composition

`presentation.css` fixes the first-slice viewport：

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

Map component CSS owns clipping/Canvas/entity/sprite mechanics. Example CSS does not select Shadow DOM private classes.

Frozen agreement：

```text
32px logical tile
640×480 CSS viewport
20×15 nominal tile viewport
```

Runtime uses M14/02 constants, never computed DOM layout. Browser sends no resize facts to Runtime. Chromium qualification observes computed 640×480 size.

## 7. Author-owned CI semantic fixture

Canonical CI uses repository-owned synthetic semantic Content facts fixed before implementation.

### Map/1

```text
width      = 24
height     = 18
tileset_id = 1
spawn      = (10,8)
```

`data` is an actual projected RGSS Table object：

```text
dimensions = 3
xSize      = 24
ySize      = 18
zSize      = 3
values.length = 24 * 18 * 3
```

Its `values` array is populated only through the frozen index convention：

```text
index(x,y,z) = x + y*24 + z*24*18
```

Fixture facts：

```text
z=0: tile 384 everywhere in the tested/visible map area,
     except (12,8) = tile 385
z=1: tile 0
z=2: tile 0
```

No alternate nested `[z][y][x]` fixture representation is permitted.

### Tileset/1

Required fields：

```text
id = 1
tileset_name = "m14_tileset"
passages  = projected 1D RGSS Table
priorities = projected 1D RGSS Table
```

Both tables use：

```text
dimensions = 1
ySize = 1
zSize = 1
xSize >= 386
values.length = xSize
```

The following notation is semantic shorthand for `tableAt(table, tileId)`：

```text
passages[0]   = 0
priorities[0] = 5

passages[384]   = 0x00
priorities[384] = 0

passages[385]   = 0x02
priorities[385] = 0
```

Therefore canonical movement is predetermined：

```text
start (10,8), facing down
ArrowRight down repeat=false
→ (11,8), facing right

ArrowRight down repeat=false
→ target (12,8), reverse-entry left bit 0x02 blocked
→ remains (11,8), facing right
```

No `blocked`, `walkable`, collision bitmap or hard-coded x-coordinate truth exists in fixture Content.

## 8. Author-owned CI graphic resources

Only author-created deterministic PNGs are committed.

```text
Graphics / Tilesets/m14_tileset
    MIME image/png
    exact fixture image size 256×32
    tile 384 = source cell x=0..31
    tile 385 = source cell x=32..63
    those two cells visibly/pixel-test distinguishable

Graphics / Characters/m14_player
    MIME image/png
    exact fixture image size 128×128
    4×4 sheet
    each frame = 32×32
    direction rows visually/pixel-test distinguishable
```

The exact pixel colors/patterns may be chosen when author-created fixture bytes are generated, but the qualification test records the expected fixture pixels and proves the selected source cells are used. It may not replace the real PNGs with CSS boxes.

Third-party Essentials assets never enter repo/logs/CI artifacts.

## 9. CI camera facts

For Map/1 and spawn `(10,8)`：

```text
initial cameraX = 16
initial cameraY = 32
```

After first right move to `(11,8)`：

```text
cameraX = 48
cameraY = 32
```

Blocked second right leaves camera unchanged.

## 10. Browser artifacts

The example consumes package artifacts, not map browser source directly：

```text
@loomrealm-game/map dist/browser/map.browser.js
@loomrealm-game/map dist/browser/map.css
```

The JS is standalone classic script and registers only the frozen first-slice tags needed here：

```text
lr-map-view
lr-map-sprite
```

The example does not define those Custom Elements itself.

## 11. CI vs exact local corpus

Two evidence paths converge on the same implementation：

```text
Canonical CI
→ checked-in author-owned semantic FSDB fixture
→ game.json + presentation.json
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

Local selection may specify map/spawn/character because the external corpus is not repository-owned. Selection is qualification input, not a runtime config API.

Local output stays under ignored `.local/` and never commits third-party bytes.

## 12. Explicit non-ownership

The example does not create：

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

M15 replaces M14 test-owned physical composition with real Desktop Hostra/BrowserWindow while reusing the same game/map business path.

## Closure

- private example workspace and exact `game.json` exist;
- exact checked-in `presentation.json` enters existing M13 preparation;
- page CSS computes `lr-map-view` to 640×480;
- canonical fixture uses actual projected Table objects, not array shorthand;
- Map/Tileset passability facts predetermine one allowed + one blocked move;
- author-owned PNG dimensions/cells are deterministic;
- CI and exact local materialization enter the same Runtime/browser implementation;
- no tool/importer object or third-party asset crosses the runtime/repository boundary.
