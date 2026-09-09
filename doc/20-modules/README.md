# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：M10–M13 **Implemented / Qualified / Closed**
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 实施映射：[Phase 1 交付计划](../30-implementation/phase-1-delivery-plan.md)  
> 最近复核：2026-09-09

```text
module boundary != npm package boundary != protocol boundary != platform boundary
framework module != reusable game library != concrete game
```

---

## 1. Module Map

| 模块/consumer | 入口 | Current responsibility |
|---|---|---|
| Main | [main-system](./main-system/README.md) | Session/Runtime/Frame/Activation/InputTarget/DataAuthority/current Renderer authority |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Main mirror、Data/Input、M11 Store、M12 private ResourceClient、M13 thin Projector |
| Game Package | [game-package](./game-package/README.md) | logical Game topology/common validation |
| Map Game Library | [map design](./loom-map/README.md) | M14 RMXP/Essentials-compatible FSDB map business + map-owned Web presentation；target `game-libs/map` / `@loomrealm-game/map` |
| Hostra Desktop | [desktop-host](./desktop-host/README.md) | Hostra physical composition、Content、M13/M15 integration |
| PWA | [pwa-host](./pwa-host/README.md) | PWA Worker Runtime、M17 Renderer/Data/Content/Web presentation realization |

Concrete M14 game planned at `examples/essentials-v21.1`，不是 framework module。Desktop/PWA 是同一 logical architecture 的不同 physical realization。

---

## 2. Repository Ownership

```text
packages/      LoomRealm framework/runtime
game-libs/     reusable game-domain libraries
examples/      concrete games
apps/          platform hosts
tools/         development/import/compatibility tooling
```

主依赖方向：

```text
examples → game-libs → public LoomRealm author APIs
```

---

## 3. Authority Boundaries

```text
Main
    Session / Runtime / Frame / Activation / InputTarget / DataAuthority

Subsystem / game library
    business state / Input Interest / authoritative Render Domains / Content author usage

Renderer Store
    current per-subsystem Render replica authority

Web Projector
    reads Control topology + eligible Store facts
    owns mechanical LoomRealm-managed DOM mutation only

Business Web Component
    read-only projected state
    private Shadow DOM / Canvas / WebGL / layout state

Platform/App Composition
    Process/Worker/Window
    Control/Data physical provisioning
    Content physical binding
    presentation bootstrap environment
```

M13 精确 browser/API/currentness semantics 不在本索引重复定义；见 frozen Web Presentation contracts。

---

## 4. Closed / Frozen Slices

```text
M10 User Input         ✅ Closed
M11 Render Replication ✅ Closed
M12 Content            ✅ Closed
M13 Web Presentation   ✅ Closed 2026-09-09
```

M13 消费既有 Control/Data/Render/Content 能力，不重开下层 contracts。

---

## 5. M13 Web Presentation Placement

```text
Window bootstrap
→ current Control Session/DataAuthority topology ─┐
                                                 ├→ package-private reevaluation
   current per-subsystem Renderer Store ─────────┘
                                                       ↓
                                             per-subsystem eligibility
                                                       ↓
                                                thin Web Projector
                                                       ↓
                                        business-owned Custom Elements
```

完整 identity、reconnect、receiver/resource lifetime、structural failure 与 body ordering 全部由 frozen Rendering System / formal contracts 拥有；模块层不维护第二份协议正文。

---

## 6. M14 Map Game Library + Concrete Example

```text
examples/essentials-v21.1
    consumes
        ↓
game-libs/map
    @loomrealm-game/map
    runtime Definition → @loomrealm/subsystem only
    browser side       → map-owned Custom Elements
```

M14 不定义第二套 normalized map schema，但明确三层：

```text
RMXP/Essentials map model
    semantic authority

prepared FSDB JSON records/resources
    persisted/runtime representation

ContentClient
    map Runtime access boundary
```

```text
Essentials source
→ tools/fixtures/essentials-v21.1 importer
→ Ruby/Marshal/RMXP decode/internal representation
→ semantic JSON materialization
→ prepared FSDB JSON records + raw resources
→ M12 ContentClient
→ @loomrealm-game/map
```

`RPG::Map`、`RPG::Tileset`、`RPG::MapInfo`、`RPG::Event`、RGSS `Table` 与需要的 Essentials map metadata 只定义 FSDB JSON records 的业务语义。Map runtime 不接收这些 decoder object，也不 import Ruby/Marshal decoder、`.rxdata` parser、`RmxpObject/RubyString/$id/$ref/$typed` wrappers 或 tool filesystem。Example 不再拥有 Essentials→map adapter；它只负责 concrete Game Entry/composition/initial input/presentation declaration。

M14 是真实 Frame/Input/Render/Content/Web Presentation 综合 consumer；至少一个真实 tileset/player resource 必须经 Render logical identity/version → `PresentationResourceClient` 到达 WC，map browser JS/CSS 也必须经 prepared Content + `WebPresentationConfigV1` 启动。

---

## 7. Physical Placement

```text
M14 qualification
    test-owned composition harness
    existing production roles + real Chromium

M15 Desktop
    BrowserWindow + Renderer Control/Data/Input/Render/Content
    M13 Config/API/Projector
    M14 concrete game + map-owned WC

M17 PWA
    Window/Worker + MessagePort/Data provisioning
    PWA Content realization
    same concrete logical game + M13 semantics
```

M14 harness不是新的 production Host。PWA 可以使用不同 storage/fetch/private browser binding，但不能改变 frozen M13 observable semantics或复制 game business source。

---

## 8. Abstraction Rule

禁止仅为未来可能用途建立：

```text
GameLibrary registry/base framework
MapNormalizedV1 / universal map schema
MapBundle abstraction
runtime service locator
Repository / AssetManager
Renderer public Render Store
LoomRealm component library / Presentation DSL
generic layer/stacking manager
dynamic component loader
public RenderNodeIdentity framework
RenderEvent→DOM bridge without real consumer
second projection-tree/topology authority
runtime dependency on tools/importer
MiniDesktopHost / MapHost production abstraction
```

业务/game-library WC内部选择 UI framework 不受限制，只要不接管 LoomRealm-managed host projection。
