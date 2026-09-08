# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M12 Implemented / Qualified / Closed；M13 Web Presentation pending  
> 主要定义：M0..M17 实现顺序、当前 closure、Desktop/PWA qualification 边界  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[渲染系统](../10-architecture/rendering-system.md)、[独立分包与发布架构](./package-architecture.md)、[正式契约目录](../15-contracts/README.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

核心顺序：

```text
Foundation/Wire
→ Game document
→ Runtime Control
→ Subsystem Runtime/Frame
→ Main authority
→ Hostra Runtime
→ Renderer Control
→ Data role seam
→ Desktop Data Broker
→ Input
→ Render Replication
→ Content
→ Web Presentation
→ loom.map
→ Desktop full E2E
→ PWA Runtime
→ PWA full E2E/equivalence
```

规则：

```text
Package Scope != Implementable Slice != Milestone Closure
```

首次实现只维护一个 current model；不为了未来可能需求预建 fake v2、deprecated alias 或 generic framework。

---

## M0–M9：Foundation / Hostra / Data 主干 ✅

```text
M1 Foundation + Wire                ✅
M2 Game Package                     ✅
M3 Runtime Control                  ✅
M4 Subsystem Runtime/Frame          ✅
M5 Main Core                        ✅
M6 Hostra Runtime vertical          ✅
M7 Renderer Control                 ✅
M8 Renderer Data role/core          ✅
M9 Desktop Data Broker              ✅
```

已建立 logical Game bootstrap、Main authority、Hostra Runner/Control、Renderer Control、Data role seam 与 Desktop paired Data Broker/late provisioning。

---

## M10：User Input — Closed ✅

关闭：Subsystem InputListener、RendererInputSource、Effective gate、bounded State/Event/Reset publication、mutation-gate State convergence 与 Desktop/Hostra Data vertical。

Canonical gate：

```text
npm run test:m10
```

M15/M17 physical DOM/Gamepad source必须复用 frozen M10 seam。

---

## M11：Render Replication — Closed ✅

关闭：

```text
Subsystem authoritative RenderDomain
Render Update v1
Renderer internal current replica
Domain/Node one-shot identity
same-generation reconnect baseline rebuild
Event transient/no-replay semantics
Desktop/Hostra real vertical
```

Canonical gate：

```text
npm run test:m11
```

M11不定义 DOM/Custom Element/Canvas/WebGL presentation；M13只消费 committed Store，不重开 Render Update v1。

---

## M12：Content — Closed ✅

2026-09-08 已在 Node 20.20.2 / 24.20.0 通过同一个：

```text
npm run test:m12
```

关闭：

```text
@loomrealm/fsdb readonly domain core
Desktop prepared Content view/service
auth/version/ETag/path confidentiality
Subsystem ContentClient
Renderer trusted/private ResourceClient
Hostra child + Renderer two条真实 production vertical
```

M12不建立 generic Repository、StorageProvider、InstallationManager、AssetManager 或 Content RPC framework。

Renderer ResourceClient冻结：

```text
namespace + hierarchical resourceKey + expectedContentVersion
→ bytes + MIME + actual contentVersion
```

M13复用它的 version/credential boundary，不复制 Content system。

---

## M13：Web Presentation — pending

### Goal

关闭 M11 留下的 physical Web seam：

```text
WebPresentationConfigV1
→ prepared Content refs
→ ordered <link> / classic <script>
→ business customElements registration
→ window.onload
→ M11 committed Renderer Store
→ package-private post-commit seam
→ thin Web Projector
→ document.body / business-owned Custom Elements
```

M13不创作业务 WC vocabulary/layout，也不建立第二份 Render authority。

### Formal contracts

精确 semantics只由：

```text
Web Presentation Config v1
Web Presentation API v1
ADR 0031
```

拥有。计划文档不复制完整 interfaces。

### Exact implementation slice

必须实现：

```text
Config closed-schema validation + prepared Content resolution
ordered browser bootstrap + explicit load/evaluation failure detection
window.onload Projector start barrier
package-private Store successful-commit notification
thin DOM projector
business-owned Custom Element construction
managed attrs / light-DOM children
Web Presentation API context/data callbacks
PresentationResourceClient façade over M12 private ResourceClient
presentation-local failure containment
```

### Identity

Projector不得使用 bare `key` 作为 Window-global identity。

```text
live wire-node identity
= (Session, subsystemKey, generation, domainId, key)
```

Frozen M13 rule：

```text
same live wire-node identity → same HTMLElement
```

不同 Domain/Subsystem/fresh generation即使 key string相同也不得 collision；move/reorder只移动 existing element。

不新增 public `RenderNodeIdentity` framework。

### Managed body ordering

M11 `zIndex/domainId`只在一个 Subsystem scope内定义 logical order。M13只增加 deterministic physical concatenation：

```text
subsystemKey UTF-8 lexical ascending
→ within subsystem: zIndex ascending
→ same zIndex: domainId UTF-8 lexical ascending
→ authoritative roots order
```

这不是 cross-Subsystem global zIndex/stacking authority。Actual layout/stacking仍由 business CSS/WC负责。

### WC ABI / resource

一个 `Web Presentation API v1`，两个独立 optional receiver：

```text
receiveRenderContext
→ Window-lifetime capability
→ before first managed insertion
→ at most once per HTMLElement

receiveRenderData
→ current retained full data
→ initial + committed data updates
```

Context只暴露 narrow `PresentationResourceClient`。Business WC不得获得 Content bearer/path/FSDB/privileged URL/private Renderer ResourceClient。

M13不建立 AssetManager、decoder registry、dynamic loader或 global service locator。

### Projection order

```text
new element:
construct → context → insertion/structure → attrs → data

existing element:
structure/reorder → attrs → data when required
```

M13不定义 RenderEvent → WC/DOM ABI，不使用 MutationObserver policing，不从 DOM reverse-sync Store。

### M13 Qualification Target

真实 headless Chromium至少证明：

```text
Config validation/resolution
ordered <link> / classic <script>
explicit stylesheet/script load/evaluation failure handling
window.onload blocks Projector start
business Custom Element registration
Store successful commit → Projector only
same live wire-node identity preserves HTMLElement
same key across Domain/Subsystem does not collide
fresh generation gets fresh wire-node identity
subsystemKey → M11 Domain order → roots deterministic body sequence
reorder moves existing HTMLElements
receiveRenderContext before first insertion; at most once
context/data receivers independent
receiveRenderData initial/update full snapshot
PresentationResourceClient reads real M12 bytes
version mismatch → conflict
cancellation / caller-owned returned bytes
no credential/path/private-client exposure
DOM/callback/resource failure never rolls back authority
RenderEvent not delivered to WC/DOM
```

M13不复制 M11 protocol conformance，也不重测 M12 Content internals。

Future canonical gate：

```text
npm run test:m13
```

---

## M14：`loom.map` Business + Web Presentation — pending

`@loomrealm/map` 成为第一个真实 business consumer，必须真实使用：

```text
Frame / frame.call / FrameOutcome
M10 InputListener
M11 RenderDomain replace/close
M12 ContentClient record/resource
M13 Config + Web Presentation API
map-owned Custom Elements
```

Business Definition仍只依赖 `@loomrealm/subsystem`，不接触 Browser/Renderer/Platform/FSDB/protocol authority。

Map presentation JS/CSS由 Window-level `WebPresentationConfigV1`引用，不把 scripts/styles绑定到 Subsystem descriptor。

Runtime resource由 M13 `PresentationResourceClient`消费；M14不再发明第二套 presentation resource/loading boundary。

如果真实地图需求证明 M12 `ContentClient.group()`必要，再按 demand-driven rule最小 reopen。

---

## M15：Desktop Full E2E — pending

完成真实 Desktop composition：

```text
installationRoot + WebPresentationConfigV1
→ Hostra PREPARE / prepared Content
→ Main / Runner / Control / Data Broker
→ BrowserWindow bootstrap
→ M13 Web presentation
→ M10 physical input
→ M11 replica
→ M14 map-owned WC
→ M12/M13 runtime resource bytes
→ reconnect / reload / shutdown
```

不重新设计 Input/Render/Content/Web Presentation logical semantics。

---

## M16：PWA Runtime — pending

只关闭 PWA PREPARE、Worker Runner、RuntimeHosting、Runtime Control MessagePort、Main↔Worker↔Subsystem trace 与 terminal/failure。

不提前 claim完整 PWA Renderer/Data/Content/presentation equivalence。

---

## M17：PWA Full E2E / Equivalence — pending

完成 Window Renderer Control、PWA Data broker、Input/Render、Content、M13 Config/API semantics、business WC、reload/replacement与 shutdown。

比较 logical semantics/outcome，不比较：

```text
PID vs Worker
WebSocket vs MessagePort
Desktop FSDB/HTTP vs PWA storage/fetch mechanics
trusted physical href/src binding
business WC private implementation
```

---

## Current Status

```text
M1  Foundation + Wire                  ✅
M2  Game Package                       ✅
M3  Runtime Control                    ✅
M4  Subsystem Runtime/Frame            ✅
M5  Main Core                          ✅
M6  Hostra Runtime                     ✅
M7  Renderer Control                   ✅
M8  Renderer Data                      ✅
M9  Desktop Data Broker                ✅
M10 User Input                         ✅ Closed
M11 Render Replication                 ✅ Closed
M12 Content                            ✅ Closed 2026-09-08
M13 Web Presentation                   pending
M14 loom.map                           pending
M15 Desktop full E2E                   pending
M16 PWA Runtime                        pending
M17 PWA full E2E/equivalence           pending
```

当前 canonical executable closure gate仍为 `npm run test:m12`。下一步实现 M13；M13关闭后进入 M14 `loom.map`。
