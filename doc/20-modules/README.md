# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：M10–M14 **Implemented / Qualified / Closed**
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 实施映射：[Phase 1 交付计划](../30-implementation/phase-1-delivery-plan.md)  
> 最近复核：2026-09-10

```text
module boundary != npm package boundary != protocol boundary != platform boundary
framework module != reusable game library != concrete game
```

---

## 1. Module / Consumer Map

| 模块/consumer | 入口 | Current responsibility |
|---|---|---|
| Main | [main-system](./main-system/README.md) | Session/Runtime/Frame/Activation/InputTarget/DataAuthority/current Renderer authority |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Main mirror、Data/Input、M11 Store、M12 private ResourceClient、M13 thin Projector |
| Game Package | [game-package](./game-package/README.md) | logical Game topology/common validation |
| Map Game Library | [map design](./loom-map/README.md) | M14 selective RMXP/Essentials-compatible map business + map-owned Web presentation；target `game-libs/map` / `@loomrealm-game/map` |
| Hostra Desktop | [desktop-host](./desktop-host/README.md) | Hostra physical composition、Content、M13 integration、M15 full Desktop E2E |
| PWA | [pwa-host](./pwa-host/README.md) | M16 Worker Runtime、M17 Renderer/Data/Input/Content/Web presentation realization |

Concrete M14 game lives at `examples/essentials-v21.1` and is not a framework module。Desktop/PWA are physical realizations of the same logical architecture。

---

## 2. Repository Ownership

```text
packages/      LoomRealm framework/runtime
game-libs/     reusable game-domain libraries
examples/      concrete games
apps/          platform hosts
tools/         development/import/compatibility tooling
```

Primary dependency direction：

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
    mechanical LoomRealm-managed DOM mutation only

Business Web Component
    read-only projected state
    private Shadow DOM / Canvas / WebGL / layout state

Platform/App Composition
    Process/Worker/Window
    Control/Data physical provisioning
    Content physical binding
    presentation bootstrap environment
```

M13 exact identity/currentness/receiver/resource semantics remain in frozen formal contracts rather than this index。

---

## 4. Closed / Frozen Slices

```text
M10 User Input         ✅ Closed
M11 Render Replication ✅ Closed
M12 Content            ✅ Closed
M13 Web Presentation   ✅ Closed 2026-09-09
M14 Map Game Library   ✅ Closed 2026-09-10
```

M14 consumes M10–M13；it does not reopen their public contracts for map-specific convenience。

---

## 5. M14 Map Game Library + Concrete Example

```text
examples/essentials-v21.1
    consumes
        ↓
game-libs/map
    @loomrealm-game/map
    runtime Definition → @loomrealm/subsystem public author API only
    browser side       → map-owned Custom Elements
```

M14 does not define a normalized map framework。Its data path is deliberately selective：

```text
RMXP/Essentials source semantics
→ existing importer/lossless representation
→ selective Map/Tileset consumer projection
→ prepared FSDB JSON + raw resources
→ M12 ContentClient
→ @loomrealm-game/map
```

First-slice consumer records are only：

```text
Map/{id}: tileset_id,width,height,data
Tileset/{id}: id,tileset_name,passages,priorities
```

MapInfo、Event、MapMetadata、Color/Tone、AudioFile and other known source graph facts are not M14 consumer records without an actual behavior that reads them。

Example owns concrete Game Entry、initial input、presentation declaration and page CSS。It does not own an Essentials→map adapter framework or production Host。

Visible tileset/player resources travel through Render logical identity/version → `PresentationResourceClient` → business WC。Map browser JS/CSS also enter through prepared Content + `WebPresentationConfigV1`。

---

## 6. Physical Placement

```text
M14 qualification
    test-owned composition harness
    existing roles + existing/synthetic RendererInputSource + real Chromium

M15 Desktop
    real Node Runner child + BrowserWindow + physical DOM input
    same M13 presentation + same M14 game/map business

M16 PWA Runtime
    PWA PREPARE + Worker Runner + Runtime Control MessagePort

M17 PWA
    Window Renderer/Data/Input/Content/Web presentation
    same concrete M14 game
    cross-platform logical-outcome equivalence
```

M14 harness is not a new production Host。PWA may use different transport/storage/private browser binding but cannot change M13/M14 logical semantics。

---

## 7. Abstraction Rule

Do not create merely for possible future use：

```text
GameLibrary registry/base framework
MapNormalizedV1 / universal map schema
MapBundle / MapRepository / MapManager
runtime service locator
Repository / AssetManager
Renderer public Render Store
LoomRealm component library / Presentation DSL
SceneGraph / generic layer manager
dynamic component loader
public RenderNodeIdentity framework
RenderEvent→DOM bridge without a real consumer
second projection-tree/topology authority
runtime dependency on tools/importer
MiniDesktopHost / MapHost / GameRuntimeHost
```

Business/game-library WC may choose private implementation mechanics freely as long as LoomRealm-managed host projection remains read-only。
