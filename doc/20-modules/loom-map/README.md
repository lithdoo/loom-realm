# Map Game Library 设计

> 层级：Game Library 设计  
> 状态：Active Design / M14 Pending  
> 稳定程度：M10–M13 consumed boundaries closed；M14 repository/game ownership revised  
> 主要定义：`game-libs/map` reusable map business library + map-owned Web presentation  
> 依赖：[Subsystem 模型](../../10-architecture/subsystem-model.md)、[渲染系统](../../10-architecture/rendering-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[ADR 0032](../../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-09

核心原则：

> **Map 是 reusable game-domain library，不是 LoomRealm framework module。Framework 只提供 author/runtime/presentation contracts；map owner拥有地图业务 vocabulary、normalized content schema 与具体 Web presentation。**

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

## 3. Map-owned normalized content

Map library定义运行时真正需要的 normalized records/resources。它们是 game-library business schema，不升级为 LoomRealm contract。

Map library不得直接解析或依赖：

```text
Pokémon Essentials
RPG Maker XP
PBS
Ruby Marshal
RGSS objects
tools/fixtures filesystem/layout
```

Source compatibility translation发生在 concrete example preparation。

---

## 4. Content / Input / Render

### Content

Definition 通过 M12 logical Content API 读取 map-owned normalized record/resource；不得观察 installationId、filesystem path、URL、bearer、HTTP/FSDB physical identity。

### Input

Map listener服从 M10 Interest/Producer/Main InputTarget/current Data semantics。WC focus/DOM event不能绕过 `RendererInputSource` 创造 Input authority。

### Render

Map 创建业务 RenderDomains并维护 authoritative state。Frame/Data/Activation lifetime不隐式控制 Domain lifetime。

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

---

## 7. Context / Data / resources

Map WC 可以结构性实现 `receiveRenderContext` / `receiveRenderData`，通过 `context.resources` 读取 runtime resource。

Map-owned data schema、decoded cache、ImageBitmap/texture策略全部留在 game library/browser side；LoomRealm 不建立 universal AssetManager/decoder registry。

---

## 8. Children / granularity

RenderNode child granularity由 map business identity/lifecycle需求决定，不由视觉嵌套决定。

```text
Render-managed children → light DOM composition
WC private subtree      → Shadow DOM/private state
```

文本、tile layer、player/event representation由 map library自己定义；LoomRealm不增加图形 primitive DSL。

---

## 9. Essentials relationship

`examples/essentials-v21.1` 是 M14 concrete consumer。Essentials importer与 compatibility preparation不属于 map library：

```text
Essentials source
→ tools/fixtures/essentials-v21.1
→ example-local compatibility preparation
→ map normalized records/resources
→ @loomrealm-game/map
```

只有第二个真实 consumer证明兼容层需要复用时，才评估独立 compatibility package。

---

## 10. M14 Qualification

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

M14 不复制 M10–M13 lower-level conformance，只证明真实 consumer integration与业务自然性。

---

## 11. Abstraction budget

允许真实 map domain concepts：world/map state、normalized records、movement/collision、map-owned WC contracts。

禁止：

```text
Repository base hierarchy
Runtime service locator
Content transport adapter
second projection tree authority
universal AssetManager
LoomRealm component vocabulary
presentation layer manager
map-specific Event→DOM bridge
Essentials parser/runtime adapter inside map package
```

---

## 12. Final goal

> **证明一个位于 framework 之外的 reusable game library 可以只依赖 LoomRealm public author contracts，再被 concrete game消费并通过 M13 得到真实 browser presentation。**
