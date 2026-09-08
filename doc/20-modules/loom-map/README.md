# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design / M14 Pending  
> 稳定程度：M10/M11/M12 consumed boundaries frozen；M13 Web Presentation pending；map business design Experimental  
> 主要定义：Phase 1 map business + map-owned Web presentation，作为 Frame/Input/Render/Content/M13 的第一个真实综合 consumer  
> 依赖：[Subsystem 模型](../../10-architecture/subsystem-model.md)、[渲染系统](../../10-architecture/rendering-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

核心原则：

> **map Business Definition只依赖 `@loomrealm/subsystem`；map Web presentation由同一业务 owner拥有但运行在独立 Web execution side。LoomRealm只提供 authority/replication/Content/Web Presentation contracts，不拥有 map component vocabulary或 layout。**

---

## 1. Business / Presentation Boundary

```text
@loomrealm/map Definition
→ @loomrealm/subsystem only

map Web presentation
→ concrete map-owned Custom Elements
→ Web Presentation API v1 consumer
```

Business Definition不得 import Renderer/Platform/DOM/FSDB/protocol/launcher packages。Web presentation不得获得 Subsystem business object或 RenderDomain writer。

Presentation JS/CSS由 Window-level `WebPresentationConfigV1`引用，不绑定进 `loom.map` descriptor。Game Entry仍只声明 logical `{ "key": "loom.map" }`。

---

## 2. M14 Consumed Author Capabilities

M14只消费已经冻结的 SDK：

```text
Frame / frame.call / FrameOutcome
SubsystemScope.createInputListener
SubsystemScope.createRenderDomain
scope.content.record/resource
scope.signal / frame.signal
```

不新增 map-specific Runtime service locator、raw carrier或 platform adapter。

---

## 3. Content / Input / Render

### Content

Map Definition通过 M12 logical Content API读取 metadata/resource；不得观察 installationId、filesystem path、URL、bearer、HTTP/FSDB physical identity。

如果真实实现证明 `ContentClient.group()` 必需，再最小 reopen M12 author surface；禁止 raw fetch旁路。

### Input

Map listener继续服从 M10 Interest/Producer/Main InputTarget/current Data semantics。WC focus/DOM event不能创造 Input authority或绕过 `RendererInputSource`。

### Render

Map创建业务 RenderDomains并使用 `replace/close`维护 authoritative state。Frame/Data/Activation lifetime不隐式控制 Domain lifetime。

`RenderDomain.emit`仍可用，但 M14不为 coverage硬造 RenderEvent consumer；M13没有 Event→WC ABI。

---

## 4. Map-owned Web Presentation

map Web side可使用：

```text
Custom Elements
Shadow DOM
Canvas / WebGL
business UI framework
private decoded resource/cache/animation
business layout / position / stacking
```

概念 tags如 `pokemon-map` / `pokemon-character` 只是业务示例，不形成 LoomRealm vocabulary。

Business WC对 LoomRealm-managed attrs/data/children/order只读，也不能写 Render Store/Main/Data authority。

---

## 5. M13 Projection Contract as Consumer

Map不得重新解释 projection identity。

正确 identity：

```text
same live wire-node identity
(Session, subsystemKey, generation, domainId, key)
→ same HTMLElement
```

不是：

```text
bare key string → global HTMLElement
```

因此不同 Domain可以合法使用相同 key string而不 collision；move/reparent/reorder保持 existing WC instance。

Top-level root physical order由 M13确定：

```text
subsystemKey UTF-8 lexical
→ within subsystem: M11 zIndex/domainId order
→ roots order
```

Map不得依赖 cross-Subsystem global zIndex semantics；actual visual stacking由 map/business CSS表达。

---

## 6. Context / Data ABI

精确 callback shape/lifetime由 [Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)拥有。

Map WC可以实现：

```text
receiveRenderContext
→ get Window-lifetime narrow presentation capability

receiveRenderData
→ get current retained full business data
```

两个 receiver独立；context不会随每次 data commit重复注入。

Map `data` schema完全由 map Definition与 map WC共同拥有；LoomRealm不冻结 map-specific asset/data schema。

---

## 7. Runtime Resource Use

M13已经明确提供 runtime `PresentationResourceClient`，M14不再设计另一套 capability：

```text
map WC
→ context.resources.resource(namespace,key,expectedContentVersion)
→ caller-owned bytes + MIME + actual version
```

Map WC不得看到 bearer/path/FSDB/privileged URL/private Renderer ResourceClient。

ImageBitmap/texture/AudioBuffer decoding、cache与asset dependency strategy属于 map private presentation implementation；不建立 universal AssetManager/decoder registry。

---

## 8. Children / Component Granularity

RenderNode child granularity由 map business identity/lifecycle需求决定，不由视觉嵌套决定。

```text
Render-managed children → light DOM composition
WC private implementation subtree → Shadow DOM/private state
```

M13不增加 TextNode/HTML-fragment graphics primitive；文本等业务 primitive可由 map-owned WC表达。

---

## 9. Frame / Cancellation

`scope.signal`用于 Runtime-level business work，`frame.signal`用于 Frame-scoped work。Normal child-call suspension不销毁 Runtime-level Content/Input config/RenderDomain。

WC `connectedCallback` / `disconnectedCallback`也不能决定 Frame/Runtime/Domain authority lifetime。

---

## 10. Compatibility Boundary

RPG Maker XP / Pokémon Essentials v21.1 compatibility compiler只负责：

```text
source format
→ map logical records/resource references/business state
```

它不解析 Game/Platform manifests、不打开 Runtime/Data carrier、不读取 Hostra path、不选择 presentation loading，也不把 Desktop/PWA branching引入 business semantics。

---

## 11. M14 Qualification

至少证明：

```text
real @loomrealm/map Definition
→ @loomrealm/subsystem only
→ M12 Content
→ M10 Input
→ M11 RenderDomain
→ M13 Window bootstrap
→ M13 scoped DOM projection
→ map-owned WC
→ context/resources + receiveRenderData
→ observable physical presentation
→ nested frame.call/return
→ business outcome
```

覆盖：

```text
same key across map Domains does not collide
same live wire-node preserves WC instance
map runtime resource version is checked
attrs/data/children projection is read-only
layout/stacking remains business-owned
business Definition cannot access physical platform material
WC cannot access Content credential/private Renderer client
no RenderEvent→WC bridge assumed
```

M14不复制 M10–M13 lower-level conformance。

---

## 12. Abstraction Budget

允许真实 map domain concepts：world state、catalog、compatibility compiler、map-owned WC contracts。

禁止仅为未来推测建立：

```text
Repository base hierarchy
Runtime service locator
Content transport adapter
second projection tree authority
universal AssetManager
LoomRealm component vocabulary
presentation layer manager
map-specific Event→DOM bridge
```

---

## 13. Final Goal

> **`loom.map` 证明：一个普通 platform-neutral Subsystem Definition可以通过 M10/M11/M12产生业务状态，再由 M13 thin Web Presentation以 scoped identity、read-only projection和 narrow resource capability驱动 map-owned Custom Elements；业务仍拥有具体视觉实现，而无需扩张 LoomRealm core abstraction。**
