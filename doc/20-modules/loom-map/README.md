# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design / M14 Pending  
> 稳定程度：M10/M11/M12 consumed boundaries closed；M13 Web Presentation **Design Frozen / Implementation Pending**；map business design Experimental  
> 主要定义：Phase 1 map business + map-owned Web presentation，作为 Frame/Input/Render/Content/M13 的第一个真实综合 consumer  
> 依赖：[Subsystem 模型](../../10-architecture/subsystem-model.md)、[渲染系统](../../10-architecture/rendering-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)  
> 最近复核：2026-09-09

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

Business Definition 不得 import Renderer/Platform/DOM/FSDB/protocol/launcher packages。Web presentation 不得获得 Subsystem business object 或 RenderDomain writer。

Presentation JS/CSS 由 Window-level `WebPresentationConfigV1` 引用，不绑定进 `loom.map` descriptor。Game Entry 仍只声明 logical `{ "key": "loom.map" }`。

---

## 2. M14 Consumed Author Capabilities

M14 只消费已经关闭/冻结的 SDK/contract：

```text
Frame / frame.call / FrameOutcome
SubsystemScope.createInputListener
SubsystemScope.createRenderDomain
scope.content.record/resource
scope.signal / frame.signal
M13 Web Presentation Config/API
```

不新增 map-specific Runtime service locator、raw carrier或 platform adapter。

---

## 3. Content / Input / Render

### Content

Map Definition 通过 M12 logical Content API 读取 metadata/resource；不得观察 installationId、filesystem path、URL、bearer、HTTP/FSDB physical identity。

如果真实实现证明新的 author capability 必需，再按对应 frozen/current boundary 的治理规则最小 reopen；禁止 raw fetch 旁路。

### Input

Map listener 继续服从 M10 Interest/Producer/Main InputTarget/current Data semantics。WC focus/DOM event 不能创造 Input authority或绕过 `RendererInputSource`。

### Render

Map 创建业务 RenderDomains 并维护 authoritative state。Frame/Data/Activation lifetime 不隐式控制 Domain lifetime。

`RenderDomain.emit` 可用，但 M14 不为 coverage 硬造 RenderEvent consumer；M13 没有 Event→WC ABI。

---

## 4. Map-owned Web Presentation

map Web side 可使用：

```text
Custom Elements
Shadow DOM
Canvas / WebGL
business UI framework
private decoded resource/cache/animation
business layout / position / stacking
```

概念 tags 只是业务 vocabulary，不形成 LoomRealm component vocabulary。

Business WC 对 LoomRealm-managed attrs/data/children/order 只读，也不能写 Render Store/Main/Data authority。

---

## 5. M13 Contract as Consumer Boundary

Map 不重新解释 M13 identity/currentness/order/failure/resource semantics；这些全部直接消费 frozen [Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)。

核心约束只有：

```text
same full live wire-node identity
→ same HTMLElement

fresh Session/generation
→ fresh element universe

same-generation transport loss
→ does not mint/remove application authority
```

Map 不依赖 cross-Subsystem global zIndex；actual visual stacking 由 map/business CSS表达。

---

## 6. Context / Data / Runtime Resource

Map WC 可以结构性实现 `receiveRenderContext` / `receiveRenderData`，并通过 `context.resources` 读取 runtime resource。

Map `data` schema、decoded cache、ImageBitmap/texture/AudioBuffer strategy 都由 map Definition/Web side 共同拥有；LoomRealm 不冻结 map-specific asset/data schema，也不建立 universal AssetManager/decoder registry。

---

## 7. Children / Component Granularity

RenderNode child granularity 由 map business identity/lifecycle 需求决定，不由视觉嵌套决定。

```text
Render-managed children → light DOM composition
WC private implementation subtree → Shadow DOM/private state
```

M13 不增加 TextNode/HTML-fragment graphics primitive；文本等业务 primitive 可由 map-owned WC 表达。

---

## 8. Frame / Cancellation

`scope.signal` 用于 Runtime-level business work，`frame.signal` 用于 Frame-scoped work。Normal child-call suspension 不销毁 Runtime-level Content/Input config/RenderDomain。

WC lifecycle 不能决定 Frame/Runtime/Domain authority lifetime。

---

## 9. Compatibility Boundary

RPG Maker XP / Pokémon Essentials v21.1 compatibility compiler 只负责：

```text
source format
→ map logical records/resource references/business state
```

它不解析 Game/Platform manifests、不打开 Runtime/Data carrier、不读取 Hostra path、不选择 presentation loading，也不把 Desktop/PWA branching 引入 business semantics。

---

## 10. M14 Qualification

至少证明：

```text
real @loomrealm/map Definition
→ @loomrealm/subsystem only
→ M12 Content
→ M10 Input
→ M11 RenderDomain
→ M13 Window bootstrap / thin projection
→ map-owned WC
→ context/resources + receiveRenderData
→ observable physical presentation
→ nested frame.call/return
→ business outcome
```

M14 不复制 M10–M13 lower-level conformance，只证明真实 consumer integration。

---

## 11. Abstraction Budget

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

## 12. Final Goal

> **`loom.map` 证明：普通 platform-neutral Subsystem Definition 可以通过 M10/M11/M12 产生业务状态，再由 M13 thin Web Presentation 驱动 map-owned Custom Elements；业务仍拥有具体视觉实现，而无需扩张 LoomRealm core abstraction。**
