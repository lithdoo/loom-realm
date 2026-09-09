# Map Game Library 设计

> 层级：Game Library 设计  
> 状态：Active Design / M14 Pending  
> 稳定程度：M10–M13 consumed boundaries closed；M14 repository/game ownership revised  
> 主要定义：`game-libs/map` reusable map business library + map-owned Web presentation  
> 依赖：[Subsystem 模型](../../10-architecture/subsystem-model.md)、[渲染系统](../../10-architecture/rendering-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[ADR 0032](../../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-09

核心原则：

> **Map 是 reusable game-domain library，不是 LoomRealm framework module。Framework 只提供 author/runtime/presentation contracts；map owner拥有地图业务 vocabulary、RMXP/Essentials-compatible map semantics 与具体 Web presentation。**

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

## 3. RMXP / Essentials map model

M14 不再为了“通用地图”定义独立 normalized map schema。`@loomrealm-game/map` 直接采用当前 Essentials v21.1 / RMXP map semantic model。

第一版可以直接消费：

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

允许 map library 理解这些 map-domain semantics；禁止它理解：

```text
Ruby Marshal binary format
.rxdata decoding
Ruby object graph identity
RmxpObject / RubyString / $id / $ref / $typed importer wrappers
tools/fixtures implementation/filesystem layout
Hostra/PWA physical storage
```

因此 compatibility/import tooling 只负责把 source representation materialize 成可由 M12 Content API 直接读取的 RMXP/Essentials semantic JSON records；不再建立 example-local Essentials→map adapter，也不再定义 `MapNormalizedV1`。

---

## 4. Content / Input / Render

### Content

Definition 通过 M12 logical Content API 直接读取 prepared semantic records/resources；不得观察 installationId、filesystem path、URL、bearer、HTTP/FSDB physical identity。

优先保留 existing domain separation，例如：

```text
Map/{id}
Tileset/{id}
MapInfo/{id}
MapMetadata/{id}
```

而不是建立新的 MapBundle。

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
runtime Content semantic record
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
→ RMXP/Essentials semantic records + resources
→ prepared Content
→ examples/essentials-v21.1
→ @loomrealm-game/map
```

Example 负责 Game Entry、Subsystem key、initial input、game-specific composition与 presentation declaration；它不是 map compiler。

如果未来出现完全不同的 3D/hex/voxel world，不要求其必须适配 `@loomrealm-game/map`。只有真实多个 consumers证明需要共同抽象时才讨论更通用 map model。

---

## 9. M14 Qualification

至少证明：

```text
examples/essentials-v21.1
→ @loomrealm-game/map
→ @loomrealm/subsystem public author API
→ M12 Content
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

允许真实 RMXP/Essentials map domain concepts：world/map state、movement/collision、events、tilesets、map-owned WC contracts。

禁止：

```text
MapNormalizedV1 / universal map schema
MapBundle abstraction
Repository base hierarchy
Runtime service locator
Content transport adapter
second projection tree authority
universal AssetManager
LoomRealm component vocabulary
presentation layer manager
map-specific Event→DOM bridge
Ruby/Marshal parser inside map package
```

---

## 11. Final goal

> **证明一个位于 framework 之外的 reusable map library 可以直接消费 prepared RMXP/Essentials semantic records，只依赖 LoomRealm public author contracts，再被 concrete game消费并通过 M13 得到真实 browser presentation。**
