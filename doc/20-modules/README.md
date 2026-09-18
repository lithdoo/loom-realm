# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：M10/M12/M13 closed baseline；M11/M14/M15 implemented with frozen boundaries / current subject Requalification Pending；Viewport Core 为 Docs Freeze 待签署目标  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
> 实施映射：[Phase 1 交付计划](../30-implementation/phase-1-delivery-plan.md)；[Viewport 专用冻结账本](../30-implementation/viewport-core-freeze-ledger.md)  
> 最近复核：2026-09-18

```text
module boundary != npm package boundary != protocol boundary != platform boundary
framework module != reusable game library != concrete game
```

本索引不维护独立 milestone PASS/Closed ledger。M14/M15 live evidence 分别由对应 qualification record 拥有；Viewport 正式审批、代码与测试状态仅见其独立账本。

---

## 1. Module / Consumer Map

| 模块/consumer | 入口 | Current responsibility |
|---|---|---|
| Main | [main-system](./main-system/README.md) | Session/Runtime/Frame/Activation/InputTarget/DataAuthority/current Renderer authority；不保存 viewport 尺寸 |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Main mirror、Data/Input、M11 Store、M12 private ResourceClient、M13 thin Projector；M15 使用 narrow trusted `@loomrealm/renderer/web-presentation` seam |
| Viewport Core（三包） | [Viewport Core 实现落点](./viewport-core.md) | **待冻结/未实现：** Renderer source → Data 独立 Viewport child → Subsystem runtime-scoped readonly `scope.viewport`；本轮不改 Map/Desktop |
| Game Package | [game-package](./game-package/README.md) | logical Game topology/common validation |
| Map Game Library | [map design](./loom-map/README.md) | M14 selective RMXP/Essentials-compatible map business + map-owned Web presentation；`game-libs/map` / `@loomrealm-game/map` |
| Hostra Desktop | [desktop-host](./desktop-host/README.md) | Hostra-owned Desktop physical composition、Content、M13 integration、M15 full E2E |
| PWA | [pwa-host](./pwa-host/README.md) | M16 Worker Runtime、M17 Renderer/Data/Input/Content/Web presentation realization |

Concrete M14 game 位于 `examples/essentials-v21.1`，不是 framework module。Desktop/PWA 是同一 logical architecture 的不同 physical realization。新增 Viewport 是现有 Data Plane 的 child，不是另建 framework module package 或新的产品 host。

---

## 2. Repository Ownership

```text
packages/      LoomRealm framework/runtime
game-libs/     reusable game-domain libraries
examples/      concrete games
apps/          platform/product compositions
tools/         development/import/compatibility tooling
```

Primary dependency direction：`examples → game-libs → public LoomRealm author APIs`。Viewport Core 仅增量修改三个既有 package；不创建第四个 `@loomrealm/viewport` package，不把 DOM APIs 下沉为架构依赖。

---

## 3. Authority Boundaries

```text
Main
    Session / Runtime / Frame / Activation / InputTarget / DataAuthority

Subsystem / game library
    business state / Input Interest / authoritative Render Domains / Content author usage
    runtime-scoped readonly viewport observation（待冻结目标）

Renderer
    participant-scoped logical viewport source（待冻结目标）

Renderer Store
    current per-subsystem Render replica authority

Web Projector
    mechanical LoomRealm-managed DOM mutation only

Business Web Component
    read-only projected state
    private Shadow DOM / Canvas / WebGL / layout state

Hostra shell
    Electron / BrowserWindow / direct HOSTRA_SUBCMD process

LoomRealm Desktop app composition
    Control/Data/Content/trusted-shell physical services
    concrete Hostra RPC adapter
```

M13 exact identity/currentness/receiver/resource semantics remain in frozen formal contracts。Viewport read-only observation 不授予 Frame mutation permit，不重开 M13 Projector/Store；Hostra physical ownership 不产生 second application authority。

---

## 4. Closed / Frozen Slices

```text
M10 User Input         closed baseline
M11 Render Replication Requalification Pending
M12 Content            closed baseline
M13 Web Presentation   closed baseline
M14 Map Game Library   Requalification Pending
M15 Desktop Full E2E   Requalification Pending
Viewport Core          Docs Freeze HOLD / production NOT IMPLEMENTED / tests NOT RUN
```

M14 consumes M10–M13；不因 Map convenience reopen public contracts。M15 只 materialize 真实 Desktop physical composition，不把 Hostra/Electron mechanics 提升为 common framework contracts。Viewport 本轮不得宣称 `play.bat` 动态缩放、地图或移动性能通过。

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

M14 不定义 normalized map framework。数据路径保持 selective：RMXP/Essentials source semantics → existing importer/lossless representation → selective Map/Tileset consumer projection → prepared FSDB JSON + raw resources → M12 ContentClient → @loomrealm-game/map。Example owns concrete Game Entry、initial input、presentation declaration 和 page CSS；不拥有 production Host 或 adapter framework。

---

## 6. Physical Placement

```text
M14 qualification
    test-owned composition harness
    existing/synthetic RendererInputSource + real Chromium

M15 Desktop
    Hostra shell owns Electron / BrowserWindow / direct HOSTRA_SUBCMD
        ↓
    LoomRealm Desktop plain Node process
        ├─ Main
        ├─ RuntimeHosting → Runner
        ├─ Data Broker
        ├─ Content + trusted shell
        ├─ Renderer Control loopback carrier
        └─ Data settlement loopback carrier
        ↓
    Hostra-owned BrowserWindow
        → real DOM RendererInputSource
        → M13 presentation
        → same M14 game/map business

M16 PWA Runtime
    PWA PREPARE + Worker Runner + Runtime Control MessagePort

M17 PWA
    Window Renderer/Data/Input/Content/Web presentation
    same concrete M14 game
    cross-platform logical-outcome equivalence
```

Frozen M15 distinctions：reload → same Hostra Window + fresh Renderer identity；same-generation Data-only reconnect → same Renderer identity + fresh Data physical pair；window/signal/RPC/fatal/startup failure → one idempotent termination funnel。ADR0033 run-as-node behavior remains conditional/historical for an Electron composition process；canonical M15 LoomRealm Desktop process is plain Node under ADR0034。

Viewport 物理 source（真实窗口、DOM content box、letterbox）不属于本轮：先以 fake source 验证三包架构路径，后续另立 Desktop/PWA 和 Map 产品任务。

---

## 7. Abstraction Rule

Do not create merely for possible future use：GameLibrary registry/base framework、MapNormalizedV1/universal map schema、MapBundle/MapRepository/MapManager、runtime service locator/Repository/AssetManager、Renderer public Render Store、LoomRealm component library/Presentation DSL、SceneGraph/generic layer manager、dynamic component loader、PresentationHost/PresentationRuntime、BrowserPrimitiveRegistry、public RenderNodeIdentity framework、RenderEvent→DOM bridge without a real consumer、second projection-tree/topology authority、runtime dependency on tools/importer、MiniDesktopHost/MapHost/GameRuntimeHost、HostraManager/HostraSession/HostraPlatformPort、WindowRegistry/WindowLifecycleManager/WindowSession、DocumentManager/BootstrapCoordinator、ConnectionManager/TransportRegistry/RecoveryManager。此次亦不得增设通用 Environment/Geometry service 或第二条 Viewport writer。

Business/game-library WC 可以自由选择 private mechanics，只要 LoomRealm-managed projection 保持 read-only。M15 新增 Hostra/RPC/WS mechanics 优先保持 `apps/desktop` concrete implementation，不因单一 consumer 提取 shared framework。