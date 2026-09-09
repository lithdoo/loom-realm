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

## Presentation side

同一个 game library owner 可以提供 browser-only presentation source：

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

### Input

Map listener服从 M10 Interest/Producer/Main InputTarget/current Data semantics。WC focus/DOM event不能绕过 `RendererInputSource` 创造 Input authority。

### Render

Map 创建业务 RenderDomains并维护 authoritative state。Frame/Data/Activation lifetime不隐式控制 Domain lifetime。

Render data只携带业务状态与 logical resource identity/version；不得携带 filesystem path、privileged URL、Content credential或 raw resource bytes。

M14 不为 coverage 强制使用 RenderEvent；M13 没有 Event→WC ABI。

## Map-owned Web Presentation

map browser side可使用：

```text
Custom Elements
Shadow DOM
Canvas / WebGL
business UI framework
private decoded resource/cache/animation
business layout / position / stacking
```

Map tags/render vocabulary属于 game library，不形成 LoomRealm component vocabulary。

Business WC 对 LoomRealm-managed attrs/data/children/order只读。

可见 tileset/player sprite 等真实资源通过：

```text
Render data logical resource ref/version
→ receiveRenderData
→ context.resources / PresentationResourceClient
→ bytes
```

WC 不直接 fetch、不接收 path/URL/token。

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

Map browser build 必须作为 prepared Content 的 JS/CSS resource 进入 `WebPresentationConfigV1` bootstrap；M14 qualification 不得通过 test-local direct import 或手工 `customElements.define()` 绕过 M13 startup path。

## Minimal M14 capability

第一版只实现一个真实 playable map slice 所需能力：

```text
load one FSDB Map JSON record whose semantics mirror RPG::Map
load referenced FSDB Tileset JSON record/resources
spawn player
accept directional input
update business position
publish RenderDomain state
project through M13 map-owned WC
```

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
```

允许直接的 RMXP/Essentials-compatible map-domain types/functions，只要它们描述 FSDB JSON records 的业务语义并由真实 M14 vertical 使用，而不是暴露 importer decoder representation。

## Closure

- package 位于 `game-libs/map`，identity 为 `@loomrealm-game/map`；
- runtime entry dependency 只指向 public author SDK；
- browser entry 不污染 runtime Definition；
- RMXP/Essentials 是 map content 的 semantic authority，prepared FSDB JSON records 是 Runtime representation；
- runtime 只通过 `ContentClient` 消费 `JsonValue` records/resources，不消费 importer object-graph wrappers或 decoder instances；
- 至少一个真实 map resource 通过 PresentationResourceClient 到达 map WC；
- unit/integration tests证明 Content/Input/Render 的真实业务路径。
