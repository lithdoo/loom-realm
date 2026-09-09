# M14 / 04 — First Real Game Vertical

> 状态：Implementation Landing / M14 Pending

## Objective

证明完整 consumer chain，而不是再次证明单个 M10–M13 contract：

```text
concrete example Game Entry
→ one logical map Subsystem
→ @loomrealm-game/map
→ @loomrealm/subsystem author APIs
→ Frame / Input / Content / Render
→ map.main RenderDomain
→ M13 Web Presentation
→ lr-map-view + lr-map-sprite
→ observable playable map slice
```

M14 不引入额外 map normalized schema。RMXP/Essentials 提供 map semantic authority；Runtime 只消费 prepared FSDB 中的 JSON records/resources，并通过 `ContentClient` 访问它们。

M14/04 不只证明 plumbing 连通，还必须证明第一条 vertical 真正执行了 map business semantics：至少一个可见 tile 必须从 `Map.data` + `Tileset` 事实推导；至少一个允许移动和一个阻挡移动必须由第一版 passability facts 决定，而不是测试内硬编码结果。

Presentation first slice 也不是开放设计点；其具体 component/tree/CSS boundary 由 `M14_02_MAP_GAME_LIBRARY.md` 冻结。

## Required trace

至少覆盖：

```text
examples/essentials-v21.1/game.json
→ parseGameEntryV1 / validateGameEntryV1
→ validated topology contains one business subsystemKey "map" + initial target/input
→ test-owned physical binding to @loomrealm-game/map Definition
→ Main launch / initial Frame
→ prepared Content view
    importer/fixture Map/Tileset/... JSON records + raw resources
    + map browser JS/CSS
    + example WebPresentationConfig refs
→ ContentClient.record() reads Map/Tileset/MapInfo/MapMetadata JsonValue as needed
→ read Map.data using the frozen RGSS Table index semantics
→ derive at least one visible tile from Map.data tile identity + Tileset/resource semantics
→ player spawn from validated initial business input
→ create InputListener + authoritative RenderDomain "map.main"
→ map runtime ContentClient.resource() resolves at least one visible resource and obtains contentVersion
→ publish initial Render tree
    viewport: key="viewport", tag="lr-map-view"
      player: key="player", tag="lr-map-sprite"
→ Render data carries business/presentation state + logical resource namespace/key/version only
→ M13 Projector preflights registered lr-map-view/lr-map-sprite
→ M13 Projector creates exact managed light-DOM shape
    body > lr-map-view > lr-map-sprite
→ lr-map-view private Shadow DOM owns viewport/tile Canvas/entity slot
→ WC uses PresentationResourceClient for real tileset/player bytes
→ at least one tile is actually visible in real Chromium
→ player is actually visible in real Chromium
→ directional input accepted through M10 path
→ first-slice passability evaluates target movement from persisted map/tileset facts
→ at least one passable input changes authoritative player business position
→ at least one blocked input leaves authoritative player position unchanged/rejected
→ RenderDomain update reflects resulting authoritative state
→ ordinary movement reuses the same lr-map-view and lr-map-sprite HTMLElement identities
→ passable movement changes visible player position
→ blocked movement does not change visible player position
```

`RPG::Map` / `RPG::Tileset` 等名称用于说明这些 FSDB JSON records 应保持的业务语义，不是 vertical 中传给 map runtime 的 decoder object 类型。测试不得通过直接构造 `RmxpObject`、`RPG::*` decoder instance 或 `$id/$ref/$typed` wrapper 绕过 FSDB + ContentClient boundary。

第一版 `Map/{id}` 保持 `events` 嵌套；不为 M14 拆 `MapEvent` Group 或新增 `ContentClient.group()`。

M14 first slice 不为了 presentation 对称拆第二个业务 Subsystem、第二个 RenderDomain 或 tile-per-node tree。只有所选真实 interaction 自然需要另一个 independently-owned Subsystem 时，才增加一次 `frame.call/return`；不得为了覆盖率创建假的 reusable dialogue/battle library。

## Process / role evidence

Qualification 必须明确区分 logical Subsystem 与最终 Desktop physical process：

```text
M14
→ one logical subsystemKey "map"
→ test-owned binding to production @loomrealm-game/map Definition
→ no claim that a real Hostra Node child was launched

M15
→ same logical map Subsystem
→ Hostra RuntimeHosting
→ real Node Runner child process
```

Renderer/real Chromium属于 presentation qualification role，不是第二个 map business Subsystem。Player/tile/camera/event visual objects不得被实现成额外 Runtime Containers只为让拓扑“看起来完整”。

## Map semantic evidence

Qualification 必须区分“数据被读取”与“数据参与业务语义”。以下证据属于 M14 first vertical 的 closure requirement：

```text
Map.data tile id
+
Tileset-compatible tile/resource facts
→ Runtime visible-tile projection
→ lr-map-view tile Canvas
→ actual visible tile
```

至少一个屏幕上可观察的 tile 必须由上述 Content facts 推导。测试不得读取真实 `Map.data`/`Tileset` 后忽略它们，再用 test-local terrain constant、固定矩形或另一套 fake map model 生成视觉结果。

Movement 至少覆盖两个由真实 persisted facts 驱动的 case：

```text
passable target
→ directional input accepted
→ player business position changes
→ lr-map-sprite receives changed authoritative state
→ same HTMLElement moves visibly

blocked target
→ directional input accepted
→ passability rejects movement
→ player business position does not change
→ lr-map-sprite identity/visible position remains unchanged
```

第一版只需要所选 map slice 实际使用的 RMXP/Essentials-compatible passability subset；M14 不要求一次完成所有 priority、event collision、terrain tag、map transition 等规则。但 implemented subset 的输入事实、决策和结果必须可测试，不能由 fixture 额外塞入 `isBlocked` 之类只为测试存在的结论字段。

这样 M14 证明的是：

```text
Content facts
→ map business semantics
→ authoritative state
→ map-owned Render vocabulary
→ concrete WC presentation
```

而不仅是：

```text
Content API works
+
Renderer API works
```

## Presentation structure evidence

M14 Chromium vertical 必须观察以下 concrete shape，而不是任意 map WC：

```html
<body>
  <lr-map-view>
    <lr-map-sprite></lr-map-sprite>
  </lr-map-view>
</body>
```

`lr-map-view` 必须拥有 private viewport subtree，语义至少等价于：

```html
#shadow-root
  <div class="viewport">
    <canvas class="tiles"></canvas>
    <div class="entities">
      <slot></slot>
    </div>
  </div>
```

Qualification 不要求把 Shadow DOM private class 名升级为 public ABI，但必须证明：

```text
tile surface is private to lr-map-view
Render-managed player remains a light-DOM child projected through the slot
no lr-map-tile/layer/camera RenderNode explosion
browser presentation does not create a second authoritative player tree
```

`lr-map-sprite` 可以用 private `div` crop 或 Canvas，实现选择不属于 M14 observable contract；但 visible position必须来自 received Runtime state，resource bytes必须来自 `PresentationResourceClient`。

## CSS evidence

Prepared Content 中必须同时存在：

```text
map-library-owned component/default CSS
example-owned concrete Window/page CSS
```

至少证明：

```text
html/body fill Renderer document and have no default margin
body does not introduce page scrolling for first slice
lr-map-view fills the concrete example viewport
lr-map-view clips map overflow
lr-map-sprite is positioned as map-owned presentation state requires
map private tile/entity surfaces fill the viewport
pixel-art presentation is not unintentionally smoothed where supported
```

Example CSS 可以覆盖 host-level尺寸/主题，但 qualification 不得依赖 `<lr-map-view>` Shadow DOM private selectors 作为跨-package contract。

CSS 必须通过正常 `WebPresentationConfigV1.styles[]` + prepared Content bootstrap进入浏览器；不得由测试直接注入 style element作为替代路径。

## Game Entry evidence

M14 必须证明 concrete example 真正参与，而不是测试代码直接构造 map Runtime。

```text
example game.json
→ existing Game Package parser/validator
→ logical key "map" + initial target/input
→ test-owned physical Definition binding
→ existing Main
```

M14 不要求 Hostra/PWA Launch Manifest；physical binding仍只是 qualification mechanics。

第一条 vertical 可使用最小 initial input：

```json
{
  "mapId": 1,
  "x": 10,
  "y": 8
}
```

因此 player spawn 来自 concrete game 的业务输入，而不是测试内隐藏常量；完整 `RPG::System` startup compatibility 不是 M14 first-slice prerequisite。

## Prepared Content assembly evidence

M14 必须只存在一个 qualification 使用的 prepared Content view：

```text
importer-produced FSDB or CI-safe semantic fixture
+
@loomrealm-game/map browser JS + component/default CSS
+
example page CSS + WebPresentationConfig logical refs
→ example/test preparation
→ one prepared Content view
```

这个 preparation step 只负责组装，不重新解释 RMXP/Essentials map semantics，不成为 Runtime dependency，也不形成 production `GamePackager` / `ContentBuilder` framework。

Essentials importer 不得开始理解 map browser JS/CSS；反过来 example preparation也不得重新解析 PBS/Marshal/RMXP source。

## Presentation startup evidence

Map browser presentation必须走真实 M13 startup path：

```text
map component/default CSS
→ example page CSS
→ map browser registration JS
→ prepared Content
→ WebPresentationConfigV1
→ ordered M13 bootstrap
→ customElements.define("lr-map-view", ...)
→ customElements.define("lr-map-sprite", ...)
→ window.onload
→ Projector
```

Qualification 不得通过 test-local direct import、手工 `customElements.define()`、direct style injection 或 privileged URL shortcut 绕过 bootstrap。

## Qualification composition boundary

M14 使用 test-owned composition harness 串联现有 production roles：

```text
test-owned harness
→ existing Main / Subsystem / Data / Renderer / Content implementations
→ existing/synthetic RendererInputSource producer
→ real Chromium
```

Harness 只是 qualification mechanics，不是新的 architecture/product role。M14 不创建 production `MiniDesktopHost`、`MapHost`、`GameRuntimeHost` 或 `IntegrationPlatform`。

完整 Hostra Launcher、Node child、Electron BrowserWindow、physical keyboard/gamepad、reload/shutdown 仍属于 M15。

## Browser/resource evidence

M13 已关闭 generic browser semantics，M14 只证明真实 map consumer 可以自然使用它。仍应使用 real Chromium 观察实际 Custom Element/Canvas/DOM result，但不重复 M13 的全部 unknown-tag/reconnect conformance matrix。

至少一个真实可见资源，第一选择 tileset，必须完整走：

```text
FSDB semantic JSON record
→ logical resource namespace/key
→ map runtime ContentClient.resource(namespace, key)
→ contentVersion
→ Render data { namespace, key, contentVersion }
→ lr-map-view/lr-map-sprite receiveRenderData
→ PresentationResourceClient
→ browser bytes
→ tile/player actually visible in the qualified result
```

Runtime 从 `ContentClient.resource()` 得到的 bytes 若业务侧不需要，不长期保留，也不放进 Render state。

M14 接受 Runtime/Renderer 对同一 resource 可能各读一次；不为此新增 M12 resource metadata/HEAD author API。只有真实 workload 证明这造成 measurable problem，才允许用 consumer evidence讨论最小 reopen。

## Performance diagnostics

M14 SHOULD 在现有 test/harness 容易取得时记录轻量 diagnostics，例如：

```text
Render update count/frequency
node count / changed-node shape
representative projection duration
representative input-to-visible-update latency
```

这些 diagnostics 默认不是 M14 closure gate，也不要求建立 profiler/metrics framework。只有 first real vertical 已实际观察到 frame pressure、unbounded latency 或其他 measurable failure 时，性能才成为 blocking evidence，并可支持最小 reopen M13 scheduling mechanics。

M14 不为预防性性能美观预建 Scheduler、EventQueue、MetricsCollector 或新的 timing abstraction。

## Failure boundary

Example/game-lib failure 不得通过 shortcut 修改 Main/Renderer authority。Content、Input、Render、Presentation 仍各自服从 M10–M13 frozen semantics。

Semantic projection 若遇到 M14-required 但无法无歧义转成 JsonValue 的 source fact，必须在 preparation 阶段 fail closed；不得让 generic importer wrapper穿透到 Runtime。

Map semantic input若缺失或不满足 first-slice invariant，也必须在 map/preparation 的既有错误边界 fail closed；不得用测试默认值掩盖缺失的 `Map.data`、Tileset 或 passability fact。

如果 `lr-map-view` / `lr-map-sprite` registration缺失，直接服从 M13 unknown-tag structural failure；M14 不增加 fallback tag、late loader或第二套 recovery。

## Non-goals

```text
new universal map content model
Runtime consumption of importer/RMXP decoder objects
ContentClient.group() only for MapEvent decomposition
new resource metadata/HEAD author API
full RPG::System startup compatibility
full RMXP collision/event/map-transition compatibility
additional Subsystem only for player/tile/event presentation
multiple RenderDomains only for visual layers
lr-map-tile/lr-map-layer/lr-map-camera taxonomy
public Map presentation SDK/schema
profiling/metrics framework
Hostra Node child / Electron BrowserWindow full composition
physical keyboard/gamepad final Desktop path
Renderer reload/shutdown full trace
complete Essentials gameplay
PWA Runtime/equivalence
```

这些分别属于真实后续 consumer、M15–M17 或后续 game libraries。

## Closure

M14/04 通过时应能人工/自动回答：

> 一个真实 `game.json` concrete game 是否能启动单一 logical `map` Subsystem，让 reusable map library 通过 `ContentClient` 消费 prepared FSDB JSON records，实际用 `Map.data` + Tileset/resource facts生成可见 tile，并用 persisted passability facts区分允许/阻挡移动，再通过唯一 `map.main` RenderDomain投影成稳定的 `lr-map-view → lr-map-sprite` managed tree，由 map-view private Canvas/Shadow DOM 与 map/example-owned CSS 在真实 M13 browser presentation中形成可玩的地图切片？
