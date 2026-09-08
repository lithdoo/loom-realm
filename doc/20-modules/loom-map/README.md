# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design / **M14 Pending**  
> 稳定程度：M10/M11/M12 consumed boundaries frozen；M13 Web Projection pending；map business design仍 Experimental  
> 主要定义：Phase 1 地图 Subsystem business module + business-owned Web presentation implementation；作为 frozen Frame/Input/Render/Content/Web projection 的第一个真实综合业务 consumer  
> 依赖：[Subsystem 模型](../../10-architecture/subsystem-model.md)、[渲染系统](../../10-architecture/rendering-system.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[ADR 0031](../../decisions/0031-business-owned-web-component-projection.md)  
> 实施前置：[M10 Input](https://github.com/lithdoo/loom-realm/blob/main/M10_01_SUBSYSTEM_INPUT_MANAGER.md)、[M11 Render](https://github.com/lithdoo/loom-realm/blob/main/M11_01_SUBSYSTEM_RENDER_MANAGER.md)、[M12 Content](https://github.com/lithdoo/loom-realm/blob/main/M12_02_SUBSYSTEM_CONTENT_CLIENT.md)、M13 Web Presentation Projection  
> 最近复核：2026-09-08

核心原则：

> **`loom.map` 的业务 Definition只实现地图业务并消费 `@loomrealm/subsystem`；具体 Web Custom Elements同样由 map业务方拥有，但与 Business Definition保持 execution/authority boundary。LoomRealm Renderer只负责 Render replica → WC instance projection，不定义 map component vocabulary、layout或 stacking。**

---

## 1. Business / Presentation Boundary

逻辑业务依赖固定：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

Business Definition source不得直接依赖：

```text
@loomrealm/subsystem/host
@loomrealm/data
@loomrealm/runtime-control
@loomrealm/renderer
@loomrealm/fsdb / @loomrealm/fsdb-http
@loomrealm/game-package
game-launcher-hostra/pwa
platform-ports
node:fs / node:http
Browser/DOM/Worker transport
```

同一个 map owner另外拥有 Web presentation implementation：

```text
map business side
    → SubsystemDefinitionFactory

map Web presentation side
    → concrete business-owned Custom Elements
```

二者 ownership相同，但 execution/authority boundary不同。Business Definition不得 import或调用 Web presentation code；Web presentation side也不获得 Subsystem business object/RenderDomain authority。

M13 current runtime model已经冻结：业务 build产出的 presentation JS/CSS作为 current installation resources，由用户选择的 Window-level `WebPresentationConfigV1` 引用；不是把 presentation resource绑定进 `loom.map` subsystem descriptor。

Game Entry仍只声明 logical Subsystem：

```json
{ "key": "loom.map" }
```

presentation module path/URL、loader capability不进入业务 Render tree。

---

## 2. Exact Author Capabilities Consumed by M14

Business Definition只使用已经冻结的 author SDK：

```text
SubsystemScope.signal
SubsystemScope.createInputListener(...)
SubsystemScope.createRenderDomain(...)
SubsystemScope.content
Frame.id / params / signal / call(...)
FrameOutcome completed/cancelled/failed
```

不新增 map-specific Runtime service locator。

概念形状：

```ts
import {
  defineSubsystem,
  completed,
} from "@loomrealm/subsystem";

export default defineSubsystem((scope) => ({
  async initialize() {
    // load Runtime-level logical map/catalog facts through scope.content
  },

  async frame(frame) {
    // consume frame.params, Input, Render, Content and nested frame.call
    return completed(null);
  },

  async shutdown() {
    // bounded business cleanup
  },
}));
```

业务 Definition不得观察 installationId、Content URL/bearer、module path、Runner、generation、domainId、activationId、HTMLElement 或 transport identity。

---

## 3. Content — Consume Frozen M12 Surface

M14 current author surface：

```text
scope.content.record(namespace, key, {signal?})
scope.content.resource(namespace, resourceKey, {signal?})
```

地图可以使用 logical namespace/resource identity读取 map metadata、tileset/character metadata与 hierarchical resource bytes。

返回的 `contentVersion` 是：

```text
sha256:<64 lowercase hex>
```

业务 Definition不得看到或构造 installationId、filesystem path、localhost URL、bearer、HTTP Response/Headers或 FSDB physical identity。

M12没有为了对称性发布 `group()`/`manifest()`。如果 M14真实实现证明地图必须直接消费 group，则显式最小 reopen M12 author projection；不得通过 raw fetch/HTTP/FSDB旁路绕过。

---

## 4. Input — Consume Frozen M10 Surface

Frame-scoped listener：

```ts
const input = scope.createInputListener({
  frame,
  channels: [
    "keyboard.event",
    "pointer.state",
    "x.map.interact.event",
  ],
});
```

固定语义：

```text
channels/setChannels = Interest contribution
on/unsubscribe       = handler registration
listener survives ordinary child-call suspend/resume
fresh Activation does not reuse old Input State/Event
fresh Data reconnect republish hidden from business
```

map Web Component focus/DOM event不得创造 InputTarget或绕过 `RendererInputSource`。

---

## 5. Render — Consume Frozen M11 Surface

M11 exact author API保持：

```ts
const world = scope.createRenderDomain(buildWorldRenderState());
const hud = scope.createRenderDomain(buildHudRenderState());

world.replace(buildNextWorldRenderState());
hud.replace(buildNextHudRenderState());

// RenderDomain.emit(...) remains available from frozen M11,
// but M14 is not required to emit an event merely for coverage.

world.close();
hud.close();
```

其中：

```ts
interface RenderDomainState {
  readonly zIndex: number;
  readonly roots: readonly RenderNode[];
}
```

地图不得使用旧 API或自建 domainId/revision/Snapshot/Patch。

固定 lifetime：

```text
Frame close/suspend != RenderDomain close/hide
Activation change    != RenderDomain lifetime
Data reconnect        != authoritative Domain destroy
```

M14 map business拥有 `RenderNode.tag/data/children` 的业务语义，但不拥有 Renderer physical projection mechanics。

M11 `RenderDomain.emit` / RenderEvent仍然是 frozen M11能力；M13不把 RenderEvent投递给 WC。因此 M14只有在真实 business/Renderer consumer证明需要时才使用它，不能为了 qualification 对称性硬造 presentation event。

---

## 6. Map-owned Web Components / Startup

map Web presentation implementation负责具体 tags与 element implementation，例如概念上的：

```text
pokemon-map
pokemon-character
pokemon-dialog
```

这些名字只是示例，不形成 LoomRealm vocabulary。

map business owner产出的 JS/CSS由 Window-level `WebPresentationConfigV1`引用。M13 browser startup：

```text
ordered <link rel="stylesheet">
→ ordered classic <script>
→ map business JS customElements.define(...)
→ window.onload
→ Web Projector starts
```

业务 Web side可以：

```text
use Shadow DOM
use Canvas/WebGL
manage decoded resources/cache/animations
interpret map-owned attrs/data/children contract
use business-chosen internal UI framework
own layout / position / stacking through WC/CSS
```

它不得 write Render Store/RenderDomain、mint Main/Data/Input authority、consume raw Data carrier或 obtain Content bearer/filesystem path。

---

## 7. Projection Contract Consumed from M13

map Web Components消费 M13 frozen projection：

```text
key
→ stable WC instance identity

tag
→ business-owned WC construction name

attrs
→ Renderer-managed host attributes

data
→ optional receiveRenderData(complete readonly full snapshot)

children
→ Renderer-managed ordered light DOM
```

Top-level roots直接进入 `document.body`。LoomRealm不为 map建立 generic Domain layer、CSS stacking context或自动 z-index framework；map WC/CSS自行决定 actual visual composition。

map WC对全部 projected Render state只有读取权。

M13不使用 MutationObserver policing业务 WC的违规 host/light-DOM mutation；若业务违反 contract，Store不会采纳 DOM state，后续 presentation-local行为不保证。

---

## 8. `data` Contract Ownership / `receiveRenderData`

LoomRealm定义 data delivery：

```ts
interface RenderDataReceiver {
  receiveRenderData(data: DeepReadonly<JsonObject>): void;
}
```

语义：

```text
optional
initial materialization → complete current snapshot
committed data change → complete current snapshot
missing method → no data delivery, not failure
wire delta never exposed
object identity has no semantic meaning
```

projection order固定：

```text
structure / children
→ attrs
→ receiveRenderData(...)
```

所以 map WC进入 `receiveRenderData` 时，其 managed children/attrs已对应同一次 committed Store state。

具体 `data` schema完全由 map与其 WC共同拥有。

---

## 9. Children / Component Granularity

是否把一个视觉对象建模成独立 child RenderNode是 map业务设计决策，而不是 LoomRealm graphics primitive rule。

例如以下都合法：

```text
A. <pokemon-map> data内包含全部 tiles，children只放独立 actor/dialog components

B. map把若干真正拥有独立 identity/lifecycle的业务 presentation object建成 child WC
```

判断标准是：

> **对象是否需要独立 RenderNode identity/lifecycle/composition，而不是视觉上是否“位于另一个对象里面”。**

Render-managed children对应 light DOM；WC自己的 implementation subtree放在 Shadow DOM/private state。

---

## 10. Resource Use in Web Presentation

M12 Renderer ResourceClient只公开 trusted logical resource + expected version → bytes semantics。

map WC如何把 bytes解码成 ImageBitmap、Canvas texture、WebGL texture、AudioBuffer等属于 map presentation implementation。

但 map WC不得直接知道 localhost Content URL、bearer、filesystem path、installationId或 FSDB physical identity。

M13/M14只按真实 consumer最小授予 runtime resource capability，不建立 universal AssetManager/decoder registry。

---

## 11. RenderEvent Is Not a WC Input

M13 Web Projector不把 M11 `RenderEvent`映射为：

```text
WC method callback
DOM CustomEvent
dispatchEvent()
```

map WC当前只消费 retained projection：

```text
tag / attrs / data / children
```

若未来 map真实 presentation证明必须消费 transient RenderEvent，再单独设计，而不是在 M14自行发明平台/业务专属 event bridge。

---

## 12. Frame / Call

业务参数只来自 `frame.params`。

Frame handler显式返回 completed/cancelled/failed；Nested call继续通过 `frame.call(...)`。

只有明确 pre-commit recoverable rejection可以被 business catch 后继续。Control loss、timeout/loss ambiguity、protocol divergence等 Runtime-fatal path不得重新进入旧 business continuation。

---

## 13. Cancellation / Lifetime

```text
scope.signal = Runtime-level business work
frame.signal = Frame-scoped business work
```

normal child-call suspension不会因为“暂时非 active”自动销毁 Runtime-level ContentClient、Input config或 RenderDomain。

WC physical connected/disconnected lifecycle同样不能决定 Frame/Runtime/Domain authority lifetime。

---

## 14. Pokémon Essentials Compatibility Boundary

Phase 1兼容 RPG Maker XP / Pokémon Essentials v21.1 地图来源。

Compatibility compiler只负责：

```text
source format
→ map business logical records/resource references
```

它不得解析 Game/Platform Launch Manifest、打开 Runtime/Data/Render carrier、直接读取 Hostra filesystem path、选择 executable/presentation loading或把 Desktop/PWA branching引入 map business semantics。

---

## 15. M14 Qualification Target

M14至少证明一个真实地图业务 + Web presentation vertical：

```text
real @loomrealm/map Definition
→ @loomrealm/subsystem only
→ Content record/resource
→ Input listener
→ RenderDomain replace/close
→ M11 Render replication
→ M13 <link>/classic <script>/window.onload bootstrap
→ M13 document.body Web projection
→ map-owned WC
→ receiveRenderData current snapshot
→ observable physical presentation
→ nested frame.call/return
→ business outcome
```

至少覆盖：

```text
Content platform-neutral result
hierarchical resource identity
Input survives child-call resume with fresh Activation semantics
RenderDomain survives Frame/Data lifecycle unless explicitly closed
stable RenderNode key preserves WC instance identity
attrs/receiveRenderData/children projection is read-only to WC
map layout/stacking is business WC/CSS responsibility
recoverable call rejection remains business-handleable
Runtime-fatal path does not re-enter map continuation
business Definition cannot access Platform/Content physical material
business WC cannot mutate Render authority or access Content credentials
no RenderEvent → WC/DOM bridge is assumed
```

M14不复制 M10/M11/M12/M13 lower-level conformance；已关闭 qualification继续作为下层证据。

---

## 16. Abstraction Budget

允许地图内部真实 business概念，例如 world state、map catalog、compatibility compiler、地图规则对象、map-owned WC/component contracts。

禁止仅为未来推测建立：

```text
generic Repository base class
Runtime service locator
Content transport adapter
second LoomRealm Render projection tree authority
Input device registry
platform abstraction inside business Definition
universal asset manager
generic LoomRealm component vocabulary
generic LoomRealm presentation layer/stacking framework
map-specific RenderEvent→DOM bridge
```

业务 WC内部可以自由选择自己的 UI framework；禁止的是让该 framework反向接管 LoomRealm-managed host projection或形成第二份 Render authority。

---

## 17. Final Goal

> **`loom.map` 证明一个普通、可移植的 Subsystem业务实现与一个由同一业务方拥有、但保持 execution/authority boundary 的 Web presentation implementation：业务 Definition只依赖 `@loomrealm/subsystem`；业务 JS/CSS由 Window-level Web Presentation Config加载；具体 Custom Elements由业务拥有；LoomRealm只负责 authority、replication、Content capability与 thin read-only WC projection。Top-level roots直接进入 body，data通过 `receiveRenderData`接收，layout/stacking由业务负责。**
