# Map Game Library 设计

> 层级：Game Library 设计  
> 状态：Active Design / M14 Pending  
> 稳定程度：M10–M13 consumed boundaries closed；M14 repository/game ownership revised  
> 主要定义：`game-libs/map` reusable map business library + map-owned Web presentation  
> 依赖：[Subsystem 模型](../../10-architecture/subsystem-model.md)、[渲染系统](../../10-architecture/rendering-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[ADR 0032](../../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-09

核心原则：

> **Map 是 reusable game-domain library，不是 LoomRealm framework module。RMXP/Essentials 提供第一版地图内容的 semantic authority；prepared FSDB JSON + ContentClient 才是 map Runtime 的数据边界。Framework 只提供 author/runtime/presentation contracts；map owner拥有地图业务 vocabulary 与具体 Web presentation。**

---

## 1. Physical placement / identity

M14 实现位置：

```text
game-libs/map
```

package identity：

```text
@loomrealm-game/map
```

明确禁止：

```text
packages/map
@loomrealm/map
framework-reserved loom.map business identity
```

具体 game/example 自己选择 Subsystem key，例如 `map`；package name与 Subsystem key不是同一概念。

---

## 2. Runtime / Browser execution boundary

同一个 map library owner 可以提供两个隔离 side：

```text
runtime Definition side
→ @loomrealm/subsystem only

browser presentation side
→ concrete map-owned Custom Elements
→ Web Presentation API v1 structural consumer
```

Definition 不得 import Renderer/Platform/DOM/FSDB/protocol/tooling。Browser side不得获得 Subsystem business object、RenderDomain writer、Data carrier或 Main authority。

---

## 3. RMXP / Essentials semantic authority vs FSDB Runtime representation

M14 不再为了“通用地图”定义独立 normalized map schema。

第一版地图内容的 semantic authority 是：

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

这些名称定义数据的业务含义与关系来源，不是 `@loomrealm-game/map` 的 Runtime object 类型。

真正的 Runtime 数据链：

```text
Essentials / RMXP source
→ importer decoder/internal representation
→ semantic JSON materialization
→ prepared FSDB records/resources
→ M12 ContentClient
→ @loomrealm-game/map
```

因此 map Runtime 只读取普通 JSON-compatible FSDB records，例如概念 identity：

```text
Map/{id}
Tileset/{id}
MapInfo/{id}
MapMetadata/{id}
```

并通过：

```text
ContentClient.record(...)
→ ContentRecord { value: JsonValue, contentVersion }
```

获得数据。

Map library 可以依赖这些 FSDB JSON records 的 **RMXP/Essentials-compatible field semantics**，但禁止依赖：

```text
Ruby Marshal binary format
.rxdata decoding
RPG/RMXP decoder object/class instances
Ruby object graph identity
RmxpObject / RubyString / $id / $ref / $typed importer wrappers
rubyObjectId
tools/fixtures implementation/filesystem layout
Hostra/PWA physical storage
```

Compatibility/import tooling 负责把 source/decoder representation materialize 成 M12 Content API 可直接返回的 JSON records。该转换是 persistence/runtime representation conversion，不是第二套 map business model；因此不建立 example-local Essentials→map adapter，也不定义 `MapNormalizedV1`。

### M14 consumer projection

精确 projection 规则由：

```text
tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
```

拥有。Map Runtime 不自行复制另一套 mapper。

第一版核心规则：

```text
known RPG @ivar → strip one leading @, preserve remaining spelling
RubyString / RubySymbol → JSON string
Ruby Array → JSON array
RGSS Table → { dimensions, xSize, ySize, zSize, values:number[] }
Map.events → embedded JSON object keyed by decimal event id
```

例如：

```text
@tileset_id    → tileset_id
@autoplay_bgm  → autoplay_bgm
@character_name → character_name
```

不为 JS 风格改成 camelCase，不生成 LoomRealm 自创字段名。

`Map.events` 第一版保持嵌套，不拆成独立 `MapEvent` Group，也不为此新增 `ContentClient.group()`。无法无歧义 materialize、但被真实 M14 vertical需要的 source fact必须在 preparation 阶段 fail closed；不得把 generic importer wrapper穿透给 map Runtime。

Importer 的 lossless raw/structural authority继续保存 unknown/extra source facts；consumer projection只是 derived Runtime view。

---

## 4. Content / Input / Render

### Content

Definition 通过 M12 logical Content API 直接读取 prepared FSDB JSON records/resources；不得直接打开 FSDB，也不得观察 installationId、filesystem path、URL、bearer、HTTP/FSDB physical identity。

概念读取：

```text
ContentClient.record("Map", mapId)
ContentClient.record("Tileset", tilesetId)
ContentClient.record("MapInfo", mapId)
ContentClient.record("MapMetadata", mapId) when needed
```

优先保留 existing domain separation，而不是建立新的 MapBundle。

### Resource identity/version

M14 复用 importer 已有 resource logical identity，例如：

```text
Tileset name   → Graphics / Tilesets/{tileset_name}
Autotile name  → Graphics / Autotiles/{name}
Character name → Graphics / Characters/{character_name}
```

Map Runtime 使用现有：

```text
ContentClient.resource(namespace, key)
→ bytes + mime + contentVersion
```

取得浏览器所需资源的真实 `contentVersion`。若 Runtime 不需要 resource bytes，不长期保留；Render state只携带：

```text
namespace
key
contentVersion
```

M14 接受 Runtime 与 Renderer可能各读取一次同一资源，不为理论效率新增 Content resource metadata/HEAD author API。只有真实 workload 的 measurable evidence才能支持最小 reopen M12。

### Input

Map listener服从 M10 Interest/Producer/Main InputTarget/current Data semantics。WC focus/DOM event不能绕过 `RendererInputSource` 创造 Input authority。

### Render

Map 创建业务 RenderDomains并维护 authoritative state。Frame/Data/Activation lifetime不隐式控制 Domain lifetime。

Render state只表达 business state 与 logical resource reference/version；不得承载 path、URL、credential、resource bytes。

M14 不为 coverage 强制使用 RenderEvent；M13 没有 Event→WC ABI。

---

## 5. Map-owned Web Presentation

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

真实可见资源按以下路径获得：

```text
FSDB JSON Content record
→ map runtime ContentClient.resource()
→ resource logical identity/version
→ Render data
→ receiveRenderData
→ context.resources / PresentationResourceClient
→ browser bytes
```

WC 不 direct fetch，也不接收 privileged URL/path/token。

---

## 6. M13 consumer boundary

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

Map browser JS/CSS 必须作为 prepared Content resource进入 `WebPresentationConfigV1` bootstrap，再由 native Custom Elements registry完成注册；qualification 不得用 test-local import绕过 M13 bootstrap。

---

## 7. Children / granularity

RenderNode child granularity由 map business identity/lifecycle需求决定，不由视觉嵌套决定。

```text
Render-managed children → light DOM composition
WC private subtree      → Shadow DOM/private state
```

文本、tile layer、player/event representation由 map library自己定义；LoomRealm不增加图形 primitive DSL。

---

## 8. Essentials relationship

`examples/essentials-v21.1` 是 M14 concrete consumer，但不再承担一层地图数据翻译器：

```text
Essentials source
→ tools/fixtures/essentials-v21.1
→ source/decoder representation
→ FSDB JSON records whose semantics mirror required RMXP/Essentials map facts
  + resources
→ example/test prepared Content assembly
→ prepared Content
→ examples/essentials-v21.1
→ @loomrealm-game/map via ContentClient
```

Example 负责 Game Entry、Subsystem key、initial input、game-specific composition与 presentation declaration；它不是 map compiler。

Qualification 必须让 `examples/essentials-v21.1/game.json` 真实经过 `parseGameEntryV1 / validateGameEntryV1`，再由 test-owned harness 绑定 concrete Definition并进入 Main。不得把 example 降级为只提供 fixture。

第一条 vertical可以由 example initial input直接提供 `mapId/x/y` player spawn；完整 `RPG::System` startup compatibility不是 first-slice prerequisite。

Importer只负责 source→semantic records/resources；map browser JS/CSS + example Config refs由薄的 example/test preparation组装进同一个 prepared Content view。这个 preparation不成为 Runtime dependency、production Host或 generic GamePackager framework。

如果未来出现完全不同的 3D/hex/voxel world，不要求其必须适配 `@loomrealm-game/map`。只有真实多个 consumers证明需要共同抽象时才讨论更通用 map model。

---

## 9. M14 Qualification

至少证明：

```text
examples/essentials-v21.1 game.json
→ Game Package validation
→ validated logical startup
→ one assembled prepared Content view
→ @loomrealm-game/map via ContentClient
→ @loomrealm/subsystem public author API
→ M10 Input
→ M11 RenderDomain
→ M13 thin projection
→ map-owned WC
→ observable playable map slice
```

M14 full vertical 使用 test-owned composition harness 串联现有 production roles + real Chromium；该 harness不是新的 Host/Platform architecture。完整 Hostra BrowserWindow/physical input仍属于 M15。

M14 不复制 M10–M13 lower-level conformance，只证明真实 consumer integration与业务自然性。

---

## 10. Abstraction budget

允许真实 RMXP/Essentials-compatible map domain concepts：world/map state、movement/collision、events、tilesets、map-owned WC contracts。

禁止：

```text
MapNormalizedV1 / universal map schema
MapBundle abstraction
MapEvent Group + ContentClient.group() only for symmetry
Repository base hierarchy
Runtime service locator
Content transport adapter
Content resource metadata API only for elegance
second projection tree authority
universal AssetManager
UniversalGamePackager / generic ContentBuilder
LoomRealm component vocabulary
presentation layer manager
map-specific Event→DOM bridge
Ruby/Marshal/RMXP decoder inside map package
```

---

## 11. Final goal

> **证明一个位于 framework 之外的 reusable map library 可以通过 `ContentClient` 直接消费 prepared FSDB JSON records（其业务语义与 RMXP/Essentials map model 对齐），由真实 concrete Game Entry启动，并通过现有 Content resource/version capability与 M13 得到真实 browser presentation。**
