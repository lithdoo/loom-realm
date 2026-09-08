# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design / **M13 Pending**  
> 稳定程度：M10/M11/M12 consumed boundaries frozen；map business design仍 Experimental  
> 主要定义：Phase 1 地图 Subsystem business module；作为 `@loomrealm/subsystem` 的普通 platform-neutral Definition Module consumer  
> 依赖：[Subsystem 模型](../../10-architecture/subsystem-model.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[ADR 0030](../../decisions/0030-freeze-m12-content-preimplementation-closure.md)  
> 实施前置：[M10 Input](../../../M10_01_SUBSYSTEM_INPUT_MANAGER.md)、[M11 Render](../../../M11_01_SUBSYSTEM_RENDER_MANAGER.md)、[M12 Content](../../../M12_02_SUBSYSTEM_CONTENT_CLIENT.md)  
> 最近复核：2026-09-08

核心原则：

> **`loom.map` 只实现地图业务，并作为 M10 Input + M11 Render + M12 Content + Frame/Call 的第一个综合业务消费者；不得把协议、Platform 或 Content storage mechanics拉回业务层。**

---

## 1. Dependency / Module Shape

固定依赖：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

业务 source不得直接依赖：

```text
@loomrealm/subsystem/host
@loomrealm/data
@loomrealm/runtime-control
@loomrealm/fsdb / @loomrealm/fsdb-http
@loomrealm/game-package
game-launcher-hostra/pwa
platform-ports
node:fs / node:http
Browser/Worker transport
```

Game Entry只声明：

```json
{ "key": "loom.map" }
```

current Platform Launch Manifest选择满足相同 `SubsystemDefinitionFactory` ABI 的 Hostra/PWA artifact。Artifact可以不同，但同一 logical scenario必须得到等价 business-observable result。

---

## 2. Exact Author Capabilities Consumed by M13

M13只使用已经冻结的 author SDK：

```text
SubsystemScope.signal
SubsystemScope.createInputListener(...)
SubsystemScope.createRenderDomain(...)
SubsystemScope.content
Frame.id / params / signal / call(...)
FrameOutcome completed/cancelled/failed
```

不新增 map-specific Runtime service locator。

Definition形状概念上：

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

业务 Definition不得观察 installationId、Content URL/bearer、module path、Runner、generation、domainId、activationId 或 transport identity。

---

## 3. Content — Consume Frozen M12 Surface

M13 current author surface只有：

```text
scope.content.record(namespace, key, {signal?})
scope.content.resource(namespace, resourceKey, {signal?})
```

地图可以使用 logical namespace/resource identity读取：

```text
map metadata / map records
tileset metadata
character metadata
hierarchical image/resource bytes
```

返回的 `contentVersion` 是：

```text
sha256:<64 lowercase hex>
```

业务不得看到或构造：

```text
installationId
filesystem path
localhost URL
bearer
HTTP Response/Headers
@loomrealm/fsdb identity
```

M12没有为了对称性发布 `group()`/`manifest()`。如果 M13真实实现证明地图必须直接消费 group，则把它视为**第一个真实 author consumer**，显式 reopen最小 M12 author projection；不得通过 raw fetch/HTTP/FSDB旁路绕过。

Content read failure是 caller-local business concern；普通 failure不自动 fail Runtime/Frame。

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

业务只看 canonical payload，不看 frameId/activationId/generation/wire envelope。

Custom map channels可以存在，但仍受：

```text
Main InputTarget
× current Activation
× Interest[F]
× Renderer Producer
× current matching Data
```

DOM/device mapping属于 M14 Renderer/Platform realization。

---

## 5. Render — Consume Frozen M11 Surface

M11 exact author API：

```ts
const world = scope.createRenderDomain(buildWorldRenderState());
const hud = scope.createRenderDomain(buildHudRenderState());

world.replace(buildNextWorldRenderState());
hud.replace(buildNextHudRenderState());

world.emit({
  targetKey: currentTargetKey,
  name: "map.effect",
  data: effectData,
});

world.close();
hud.close();
```

其中 `build*RenderState()` 返回 frozen M11 `RenderDomainState`：

```ts
interface RenderDomainState {
  readonly zIndex: number;
  readonly roots: readonly RenderNode[];
}
```

地图不得使用已经被 M11 current model取代的旧 API，例如：

```text
createRenderDomain({name,...})
RenderDomain.set(...)
业务自建 domainId/revision/Snapshot/Patch
```

固定 lifetime：

```text
Frame close/suspend != RenderDomain close/hide
Activation change    != RenderDomain lifetime
Data reconnect        != authoritative Domain destroy
```

如果某个 Domain应与 map business scope同生共死，由 map显式 `close()`。

M13不定义 DOM/Canvas/WebGL presentation，也不决定 RenderNode.data → resource identity schema；这些属于 M14。

---

## 6. Frame / Call

业务参数只来自：

```text
frame.params
```

Frame handler显式返回：

```text
completed(value)
cancelled()
failed(error)
```

Nested call：

```ts
const outcome = await frame.call("loom.battle", battleParams);
```

只有明确 pre-commit recoverable rejection可以被 business catch 后继续。Control loss、timeout/loss ambiguity、protocol divergence等 Runtime-fatal path不得重新进入旧 business continuation。

M10冻结的 known-no-commit顺序继续有效：same Activation retained Input State先完成同步 local convergence，再让 recoverable `frame.call` rejection对业务可见。

---

## 7. Cancellation / Lifetime

```text
scope.signal = Runtime-level business work
frame.signal = Frame-scoped business work
```

normal child-call suspension不会因为“暂时非 active”自动销毁 Runtime-level ContentClient、Input config或 RenderDomain。

业务应把 signal传入 Content/async work；terminal Frame/Runtime上的 late work不得重新产生合法 mutation。

---

## 8. Pokémon Essentials Compatibility Boundary

Phase 1兼容 RPG Maker XP / Pokémon Essentials v21.1 地图来源。

Compatibility compiler只负责：

```text
source format
→ map business logical records/resource references
```

它不得：

```text
解析 Game/Platform Launch Manifest
打开 Runtime/Data/Render carrier
直接读取 Hostra filesystem path
选择 executable module
把 Desktop/PWA branching引入 map business semantics
```

---

## 9. M13 Qualification Target

M13至少证明一个真实地图业务 vertical：

```text
real @loomrealm/map Definition
→ @loomrealm/subsystem only
→ Content record/resource
→ Input listener
→ RenderDomain replace/emit
→ nested frame.call/return
→ business outcome
```

至少覆盖：

```text
Content platform-neutral result
hierarchical resource identity
Input survives child-call resume with fresh Activation semantics
RenderDomain survives Frame/Data lifecycle unless explicitly closed
recoverable call rejection remains business-handleable
Runtime-fatal path does not re-enter map continuation
business cannot access Platform/Content physical material
```

M13不复制 protocol conformance；M10/M11/M12已有 qualification继续作为下层证据。

---

## 10. Abstraction Budget

允许地图内部真实 business概念，例如 world state、map catalog、compatibility compiler、地图规则对象。

禁止仅为未来推测建立：

```text
generic Repository base class
Runtime service locator
Content transport adapter
Render reconciler/virtual DOM
Input device registry
platform abstraction inside business
universal asset manager
```

只有地图自身出现两个真实重复 consumer/behavior时才抽取 business-local abstraction。

---

## 11. Final Goal

> **`loom.map` 证明一个普通、可移植的 Subsystem：只依赖 `@loomrealm/subsystem`，真实消费 frozen Frame/Input/Render/Content capabilities；Platform负责 executable/physical realization，Main负责 authority，协议 mechanics与 Content storage保持在各自下层。**
