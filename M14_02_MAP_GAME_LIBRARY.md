# M14 / 02 — Map Game Library

> 状态：Implementation Landing / M14 Pending

## Objective

实现第一个 reusable game-domain library：

```text
game-libs/map
@loomrealm-game/map
```

它是 LoomRealm 的 consumer，不是 LoomRealm framework module。

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
map-owned normalized records
map resource references
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

## Content schema

`@loomrealm-game/map` 定义自己的 normalized game-library content model。这个 schema 是 map business contract，不是 LoomRealm protocol。

禁止 map library 直接理解：

```text
Pokémon Essentials
RPG Maker XP
PBS
Ruby Marshal
RGSS class names
fixture importer paths
```

Compatibility translation属于 concrete example preparation。

## Minimal M14 capability

第一版只实现一个真实 playable map slice 所需能力：

```text
load one normalized map
load tileset/resource references
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
GameLibrary base framework
MapRepository hierarchy
AssetManager
SceneGraph framework
universal component registry
LoomRealm map layer manager
Essentials adapter inside map package
runtime service locator
```

允许直接的 map-domain types/functions，只要由真实 M14 vertical 使用。

## Closure

- package 位于 `game-libs/map`，identity 为 `@loomrealm-game/map`；
- runtime entry dependency 只指向 public author SDK；
- browser entry 不污染 runtime Definition；
- map content schema 不含 Essentials/RMXP source semantics；
- unit/integration tests证明 Content/Input/Render 的真实业务路径。
