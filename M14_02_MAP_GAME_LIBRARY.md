# M14 / 02 — Map Game Library

> 状态：Implementation Landing / M14 Pending

## Objective

实现第一个 reusable game-domain library：

```text
game-libs/map
@loomrealm-game/map
```

它是 LoomRealm 的 consumer，不是 LoomRealm framework module。

M14 不再为了“通用地图”额外定义一套 normalized map schema。Essentials v21.1 / RMXP map model 只作为第一版地图内容的 **semantic authority**；`@loomrealm-game/map` 的 Runtime 数据表示是 importer 已 materialize 并写入 prepared FSDB、再由 M12 `ContentClient.record()` 返回的普通 JSON records。

Importer 侧的 M14 consumer projection 由 [`tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md`](tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md) 冻结；map package不得自行发明另一套转换。

## Runtime side

Map Definition 只消费 public author capabilities：

```text
@loomrealm/subsystem
Frame / AbortSignal
InputListener
RenderDomain
ContentClient
```

不得 import Renderer、Main、Platform、wire/Data internals、FSDB physical APIs 或 tooling。

Map library owns：

```text
map/world runtime state
player/map movement rules
RMXP/Essentials-compatible map business semantics
RenderNode vocabulary emitted by the library
map interaction semantics
```

LoomRealm core 不拥有这些概念。

### First-slice logical topology

M14 concrete example 的第一条 vertical 固定只需要一个业务 Subsystem：

```text
subsystemKey = "map"
→ @loomrealm-game/map Runtime Definition
```

Player、tile、camera、map event visual representation都属于该 map business/runtime 内部状态或 presentation vocabulary，不拆成独立 Subsystem/Runtime Container。

M14 qualification 使用 test-owned physical Definition binding，因此不要求真实 Desktop Node child；M15 Desktop full E2E 才把同一个 logical `map` Subsystem 通过 Hostra RuntimeHosting 落成一个 Node Runner child process。Renderer/BrowserWindow是 presentation role，不是第二个业务 Subsystem。

只有真实业务 interaction 需要另一个 independently-owned business authority 时，才允许新增 Subsystem + `frame.call/return`；不得为了“多进程完整性”拆 player/tile/event。

## Presentation side

同一个 game library owner 提供 browser-only presentation source：

```text
map-owned Custom Elements
CSS
Shadow DOM
Canvas / WebGL
private decoded resource cache
animation/private UI state
```

Browser side结构性消费 M13 `receiveRenderContext` / `receiveRenderData`，不需要 public presentation SDK/package。

Runtime Definition entry 与 browser presentation entry 必须物理隔离；Definition import 不能加载 DOM/browser code。

M14 first slice 的 browser vocabulary、managed DOM 与 CSS ownership由本文 §Map-owned Web Presentation 冻结，不能留给 qualification 临时决定。

## Map content boundary

M14 不创建 `MapNormalizedV1`、`MapBundle` 或第二套通用地图 vocabulary，但必须区分 **semantic authority** 与 **Runtime representation**。

RMXP/Essentials semantic authority 包括：

```text
RPG::Map
RPG::Tileset
RPG::MapInfo
RPG::Event
RPG::Event::Page
RPG::EventCommand
RGSS Table
Essentials MapMetadata / map connections when needed
```

这些名称描述字段含义、关系和业务行为来源，不表示 `@loomrealm-game/map` 会接收 Ruby/RMXP decoder object。

Runtime boundary 精确为：

```text
Essentials / RMXP source
→ importer Ruby/Marshal/RMXP decoding
→ importer internal object representation
→ semantic JSON materialization
→ prepared FSDB records/resources
→ ContentClient.record()/resource()
→ @loomrealm-game/map
```

例如概念 identity：

```text
Map/{id}
Tileset/{id}
MapInfo/{id}
MapMetadata/{id}
```

`@loomrealm-game/map` 看到的是这些 FSDB records 的 `JsonValue`；其字段语义保持对应 `RPG::*` / Essentials map semantics。它 MUST NOT 接收、import 或要求理解：

```text
Ruby Marshal binary encoding
.rxdata parsing
Ruby object graph identity/wrappers
RmxpObject / RubyString / $id / $ref / $typed importer representation
rubyObjectId / decoder class instances
tools/fixtures implementation/filesystem layout
Hostra/PWA physical storage
```

现有 Essentials importer 必须把 source/decoder representation materialize 为可由 Content API 直接读取的 JSON-compatible FSDB records。该 materialization 只负责把已有 RMXP/Essentials 语义变成 Runtime-safe JSON 表示，不重新发明一套地图业务模型。

### M14 semantic JSON mechanical rules

第一版不得把“semantic JSON”留成实现自由度。机械规则固定为：

```text
known RPG ivar
    strip exactly one leading @
    preserve remaining spelling

RubyString semantic text
    → JSON string

RubySymbol
    → symbol-name JSON string

Ruby Array
    → JSON array

RGSS Table
    → { dimensions, xSize, ySize, zSize, values:number[] }
```

因此例如：

```text
@tileset_id     → tileset_id
@autoplay_bgm   → autoplay_bgm
@move_type      → move_type
@character_name → character_name
```

不得为了 JavaScript 风格改成 camelCase，也不得重命名为 LoomRealm 自创 vocabulary。

Primitive、Hash、RGSS Table flatten/index、Color/Tone 与 fail-closed 细则由 `M14_CONSUMER_PROJECTION.md` 唯一冻结；本文不复制第二份 projection authority。

M14 所需 Hash 只在 key 可无歧义投影为 integer/string/symbol scalar 时变成 JSON object；integer key 使用十进制字符串。`RPG::Map.events` 因此继续嵌在 `Map/{id}` record 中并以 event id 字符串索引，不拆成 `MapEvent` Group。这样保持 RMXP ownership，也不要求为 M14 reopen Subsystem `ContentClient.group()`。

`kind`、`className`、`rubyObjectId`、`$id/$ref/$typed` 等 decoder/serialization metadata不得进入 consumer record。无法无歧义投影、但又被真实 M14 vertical需要的字段必须 fail closed，先增加最小 semantic projection，再允许 Runtime消费；不得把 generic wrapper 穿透给 map library。

Importer 的 lossless structural/raw authority继续保存 unknown/extra source data；consumer projection 是 derived view，不替代该 authority。

## Content / Input / Render

### Content

Definition 只通过 M12 logical Content API 读取 prepared FSDB JSON records/resources；不得直接打开 FSDB，也不得观察 installationId、filesystem path、URL、bearer、HTTP/FSDB physical identity。

概念读取路径：

```text
ContentClient.record("Map", mapId)
ContentClient.record("Tileset", tilesetId)
ContentClient.record("MapInfo", mapId)
ContentClient.record("MapMetadata", mapId) when needed
```

返回值是 `JsonValue + contentVersion`，不是 `RPG::Map`/`RmxpObject` runtime instance。

优先保留 existing domain separation，而不是合并成新的 MapBundle。

第一版 `Map/{id}` 中保留其嵌套 `events`；不为了 FSDB 形态对称拆成独立 Group。

### Resource identity / version

Raw resource logical identity继续复用现有 importer/Content mapping。例如：

```text
RPG::Tileset.tileset_name
→ Graphics / Tilesets/{tileset_name}

RPG::Tileset.autotile_names[n]
→ Graphics / Autotiles/{name}

RPG::Event::Page::Graphic.character_name
→ Graphics / Characters/{character_name}
```

空 resource name 表示无资源，不发起读取。

当前 author API 没有 resource metadata/HEAD surface。M14 第一版直接使用现有：

```text
ContentClient.resource(namespace, key)
→ bytes + mime + contentVersion
```

Map Runtime 对需要交给 browser 的真实资源调用一次 `resource()`，用返回值确认资源并取得 `contentVersion`；如果 Runtime 本身不需要 bytes，就不长期保留这些 bytes。随后只把：

```text
namespace + key + contentVersion
```

放进 Render state。

这可能导致 Runtime 与 Renderer 各读一次同一资源。M14 接受该成本，不新增 `resourceMetadata()` / HEAD author API；只有真实 workload 证明有 measurable problem 才以 consumer evidence讨论最小 reopen M12。

### Input

Map listener服从 M10 Interest/Producer/Main InputTarget/current Data semantics。WC focus/DOM event不能绕过 `RendererInputSource` 创造 Input authority。

第一版方向输入必须走：

```text
physical/synthetic RendererInputSource
→ M10 Input
→ map InputListener
→ passability/business decision
→ authoritative player position
→ RenderDomain update
```

WC 不监听 `keydown` 后直接改变 player/map business position。

### Render

Map 创建业务 RenderDomains并维护 authoritative state。Frame/Data/Activation lifetime不隐式控制 Domain lifetime。

M14 first slice 固定一个 authoritative RenderDomain：

```text
domainId = "map.main"
```

它足以表达 viewport + player first slice；不得仅为视觉 layer 拆 `map.tiles` / `map.entities` 等 RenderDomain。未来只有独立业务 lifecycle/authority 证据才允许增加 Domain。

Render data只携带业务状态与 logical resource identity/version；不得携带 filesystem path、privileged URL、Content credential或 raw resource bytes。

`Map.data` 是 Runtime content/business input，不原样作为“浏览器自行解释 RMXP map”的 payload。Runtime 必须先按冻结的 Table/index + Tileset semantics 推导 first-slice tile/passability facts，再发布 map-owned Render vocabulary。

M14 不为 coverage 强制使用 RenderEvent；M13 没有 Event→WC ABI。

## Map-owned Web Presentation

### Frozen first-slice component vocabulary

M14 first slice 固定只需要两个业务 Custom Elements：

```text
<lr-map-view>    required
<lr-map-sprite>  required
```

职责：

```text
lr-map-view
    map viewport
    camera/clip
    tile layer rendering
    tileset resource decoding/cache
    map-private Canvas drawing
    composition host for Render-managed entity children

lr-map-sprite
    player visual
    sprite resource decoding/cache
    direction/frame crop
    visual position/animation derived from received business state
```

第一版明确不创建：

```text
lr-map-tile
lr-map-layer
lr-map-camera
lr-map-input
lr-map-resource
lr-map-collision
lr-map-event-command
lr-game-root
```

Tile/layer/camera 是 `<lr-map-view>` private presentation mechanics；input/collision/content 是 Runtime/business capability，不是 visual component。

`<lr-map-event>` M14 first slice 不要求。只有真实 Event 获得独立 RenderNode identity/lifecycle/interaction需要时，后续才可自然增加；不能为了 RMXP class 对称提前建立完整 WC taxonomy。

### Frozen RenderNode tree

第一版一个 `map.main` Domain 的 managed tree 固定为：

```text
root
key = "viewport"
tag = "lr-map-view"

└── child
    key = "player"
    tag = "lr-map-sprite"
```

因此 M13-managed light DOM 的正常第一版形状为：

```html
<body>
  <lr-map-view>
    <lr-map-sprite></lr-map-sprite>
  </lr-map-view>
</body>
```

这里的 `<body>` / element insertion/order/identity继续由 M13 Projector管理；map browser code不得自行创建第二棵 authoritative player/entity tree。

同一 live wire-node identity 下，ordinary movement只更新现有 `<lr-map-sprite>`，不得 recreate player HTMLElement。Fresh Session/generation仍服从 M13，必须得到 fresh element universe。

### Render data vocabulary

M14 不建立 public/versioned Map Render schema；但 first-slice implementation shape必须足够具体，避免 Runtime/Browser 两边各自猜测。

`lr-map-view` data 至少包含：

```text
mapId
mapWidth / mapHeight
viewport/camera coordinates needed by first slice
tileSize used by presentation
tileset logical resource { namespace, key, contentVersion }
visible tile projection derived by Runtime from Map.data + Tileset semantics
```

Visible tile projection只表达 presentation所需的 map-domain result，例如 tile coordinate/layer/tile identity；不得携带原始 `RmxpObject`、完整 source wrapper、filesystem location或 raw bytes。

`lr-map-sprite` data 至少包含：

```text
x / y
direction
animation frame when used
sprite logical resource { namespace, key, contentVersion }
```

Position/direction 是 Runtime authoritative business result。WC 可以用 CSS transform/Canvas crop做 visual realization，但不得自行改变 authoritative x/y。

### Shadow DOM / private subtree

`<lr-map-view>` 第一版使用一个 private Shadow DOM viewport：

```html
<lr-map-view>
  #shadow-root
    <div class="viewport">
      <canvas class="tiles"></canvas>
      <div class="entities">
        <slot></slot>
      </div>
    </div>

  <lr-map-sprite></lr-map-sprite>
</lr-map-view>
```

含义：

```text
canvas.tiles
    private tile rendering surface
    NOT a RenderNode tree

slot
    projects M13-managed light-DOM entity children

entities
    private positioning/stacking container
```

`<lr-map-sprite>` 第一版可使用最小 Shadow DOM：

```html
<lr-map-sprite>
  #shadow-root
    <div class="sprite"></div>
</lr-map-sprite>
```

实现 MAY 用 private Canvas 替代 `.sprite`，但不得因此改变 RenderNode identity/data/resource boundary。是否由 `div` background crop 或 Canvas 绘制属于 map-library private implementation choice，不形成 LoomRealm contract。

### CSS ownership

样式明确分两层：

```text
@loomrealm-game/map
    owns component/visual behavior CSS

examples/essentials-v21.1
    owns concrete Window/page composition CSS
```

Map browser build 至少提供 host-level component defaults，语义等价于：

```css
lr-map-view {
  display: block;
  position: relative;
  overflow: hidden;
  contain: layout paint;
}

lr-map-sprite {
  display: block;
  position: absolute;
}
```

`lr-map-view` Shadow DOM private styles至少保证：

```text
.viewport fills host and clips overflow
.tiles fills viewport
.entities fills viewport as overlay
pixel-art resource rendering avoids unintended smoothing where browser mechanism supports it
```

Concrete example page CSS只负责 Window composition，例如：

```css
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  overflow: hidden;
}

lr-map-view {
  width: 100%;
  height: 100%;
}
```

Example CSS 可以覆盖 map host 的尺寸/主题，但不得依赖 Shadow DOM private class 名作为跨-package contract。Shadow DOM internal style可随 browser JS静态定义；不为它建立新的 stylesheet loader/capability。

### Resource flow

两个 WC 都只通过 M13 context 读取真实可见资源：

```text
Runtime ContentClient.resource()
→ logical resource ref/version
→ Render data
→ receiveRenderData
→ context.resources / PresentationResourceClient
→ bytes
→ private decode/cache
→ visible tile/sprite
```

WC 不直接 fetch、不接收 path/URL/token，不把 decoded image/cache变成 application authority。

### Bootstrap

Map browser build必须作为 prepared Content 的 JS/CSS resource进入 `WebPresentationConfigV1`。Browser script使用原生：

```text
customElements.define("lr-map-view", ...)
customElements.define("lr-map-sprite", ...)
```

Example Config 的 ordering原则是：

```text
map component/default CSS
→ concrete example page/override CSS

map browser registration script
→ window.onload
→ M13 presentation start
```

Qualification不得通过 test-local direct import或测试代码手工 `customElements.define()` 绕过 M13 bootstrap。

## M13 consumer boundary

Map 不重新解释 M13 identity/currentness/order/failure/resource semantics；直接消费 frozen Web Presentation API。

```text
same full live wire-node identity
→ same HTMLElement

fresh Session/generation
→ fresh element universe

same-generation transport loss
→ does not mint/remove application authority
```

Map 不依赖 cross-Subsystem global zIndex；actual visual stacking由 map CSS/private presentation表达。

## Minimal M14 capability

第一版只实现一个真实 playable map slice 所需能力：

```text
one logical map Subsystem
one authoritative map.main RenderDomain
load one FSDB Map JSON record whose semantics mirror RPG::Map
load referenced FSDB Tileset JSON record/resources
spawn player from concrete example initial input
accept directional input
update business position through passability rules
publish viewport + player RenderNode state
project exactly through lr-map-view + lr-map-sprite
render tiles privately in lr-map-view Canvas
reuse the same lr-map-sprite HTMLElement across ordinary movement
```

第一版可由 example initial input提供 `mapId/x/y`；不为了首张地图强制实现完整 `RPG::System` startup compatibility。

事件、地图切换或 nested `frame.call()` 只有在 example 中存在自然业务需求时实现；不为 protocol coverage 硬造功能。

## Abstraction budget

禁止：

```text
MapNormalizedV1 / universal map schema
GameLibrary base framework
MapRepository hierarchy
MapBundle abstraction
AssetManager
SceneGraph framework
universal component registry
LoomRealm map layer manager
runtime service locator
Content resource metadata API only for M14 elegance
one-WebComponent-per-tile/layer/camera taxonomy
presentation-specific Subsystem/RenderDomain splitting
```

允许直接的 RMXP/Essentials-compatible map-domain types/functions，只要它们描述 FSDB JSON records 的业务语义并由真实 M14 vertical 使用，而不是暴露 importer decoder representation。

## Closure

- package 位于 `game-libs/map`，identity 为 `@loomrealm-game/map`；
- first slice只有一个 logical `map` business Subsystem；M14 harness不假装 Desktop child process，M15再验证真实 Hostra child；
- runtime entry dependency只指向 public author SDK；browser entry不污染 Runtime Definition；
- RMXP/Essentials 是 map content semantic authority，prepared FSDB JSON records 是 Runtime representation；
- semantic JSON projection遵守冻结的机械映射规则，`Map.events` 第一版保持嵌套；
- runtime只通过 `ContentClient` 消费 `JsonValue` records/resources，不消费 importer object-graph wrappers或 decoder instances；
- resource version由现有 `ContentClient.resource()` 获得，不为 M14 新增 metadata API；
- first slice固定 `map.main` → `lr-map-view(viewport)` → `lr-map-sprite(player)`；tile绘制留在 map-view private Canvas；
- map/example CSS ownership明确，browser build真实通过 prepared Content + M13 Config启动；
- 至少一个真实 map resource通过 PresentationResourceClient到达 WC 并参与可见结果；
- unit/integration/Chromium tests证明 Content/Input/Render/DOM/resource 的真实业务路径。
