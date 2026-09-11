# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：M6 Runtime / M9 Data / M12 Content / M13 Web Presentation **Implemented + Qualified**；M14 **Implementation complete / requalification pending**；M15 **physical recomposition reopened / implementation plan frozen**  
> 当前 M15 physical SSOT：[M15 Hostra Desktop Recomposition Plan](../../../M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[渲染系统](../../10-architecture/rendering-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[ADR 0032](../../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-11

Hostra owns the Desktop host；LoomRealm Desktop只拥有自己的 physical service composition。Main保留 Session/Runtime/Frame/Activation/InputTarget/DataAuthority authority，Subsystem/game library保留 business Render authority，Renderer保留 current replica与 Web projection mechanics。

---

## 1. Milestone Shape

```text
M6  Game PREPARE / Runner / Runtime Control           ✅
M9  Desktop Data Broker / child provisioning         ✅
M10 User Input                                       ✅
M11 Render Replication                               ✅
M12 Desktop Content                                  ✅
M13 Web Presentation                                 ✅ Closed
M14 Map Game Library + concrete example              ⚠️ implementation complete / requalification pending
M15 Hostra-owned full Desktop E2E                    🔄 physical recomposition
```

M15只纠正最外层 physical owner；不重新设计 M9–M14 logical/business semantics。

---

## 2. Product Topology

```text
Hostra process
├─ Electron app
├─ Hostra preload / ambient API
├─ JSON-RPC server
├─ BrowserWindow owner
└─ HOSTRA_SUBCMD
     ↓
LoomRealm Desktop plain Node process
├─ concrete Hostra RPC adapter
├─ Main
├─ RuntimeHosting
│   └─ real Node Runner
├─ Desktop Data Broker
├─ Desktop Content + trusted shell
├─ Renderer Control loopback WS
└─ Renderer Data settlement loopback WS

Hostra BrowserWindow
└─ LoomRealm trusted shell
    ├─ Renderer Control
    ├─ Data
    ├─ Content
    ├─ DOM Input
    └─ M13 Presentation
```

Hostra is the sole Electron/BrowserWindow owner in the canonical Desktop product path。`apps/desktop` MUST NOT import Electron or create/quit BrowserWindow/Application primitives after recomposition。

---

## 3. Runtime PREPARE / Product Inputs

Runtime PREPARE remains：

```text
installation root
→ game.json
→ launch.hostra.json
→ @loomrealm/game-launcher-hostra PREPARE
→ immutable HostraLaunchPlan
→ LogicalGameBootstrap
```

Canonical M15 game remains checked-in `examples/essentials-v21.1` Hostra-ready installation。

Web Presentation Config remains independent product startup input：

```text
presentation.json
→ Desktop-private acquisition
→ WebPresentationConfigV1 validation/preparation
```

Presentation Config does not enter Game Entry、launch manifest、HostraLaunchPlan or Main bootstrap。

`@loomrealm/game-launcher-hostra` continues to own the existing PREPARE + Node Runner mechanics。Do not rename/extract that package as part of M15 recomposition。

---

## 4. Hostra RPC Boundary

LoomRealm consumes Hostra only as an external host through loopback JSON-RPC。

Production minimum：

```text
openWindow
closeWindow
hostra.event
```

`getHostState/getAllWindows` are useful for qualification/diagnostics, not LoomRealm authority or startup currentness。

Hostra RPC MUST NOT carry：

```text
Renderer Control application messages
Data settlement/application messages
Content bytes
Input/Render protocol
Main/Subsystem business state
```

The adapter remains a concrete `apps/desktop` module；do not promote Hostra into `platform-ports` or create HostraManager/HostraSession abstractions。

---

## 5. Data

M9 `DesktopDataConnectionBroker` remains the only Desktop paired candidate/current owner：

```text
Main committed Data authority
→ Desktop Data Broker
→ Runner provisioner + Renderer physical delivery
```

Only Renderer-side settlement transport changes from the historical Electron MessagePort realization to a narrow loopback WS realization。

```text
prepare / prepared-or-failed / commit / revoke / close
```

Data application bytes remain separate WebSocket traffic。Same-generation physical loss continues through existing Broker replacement + fresh `RendererDataBinding.acquire()`；no retry/recovery authority。

---

## 6. Content / Shell / Presentation

Existing Content semantics remain：

```text
successful PREPARE
→ readonly prepared Content view/service
→ Subsystem ContentClient
→ Renderer ResourceClient
→ PresentationResourceClient
```

The same bounded loopback listener may serve exact trusted shell/document routes beside `/_lr/v1/...` Content routes。This does not turn shell routes into Content API and MUST NOT become a generic filesystem/static server。

M13 continues through：

```text
@loomrealm/renderer/web-presentation
@loomrealm/renderer/resource-client
```

No PresentationHost/Runtime/component registry is introduced。

---

## 7. Renderer Control / Document Bootstrap

Historical direct-Electron `MessageChannelMain` + LoomRealm preload handoff is superseded。

Current target：

```text
Main RendererControlBinding.acquire(token)
→ concrete Desktop loopback WS binding
→ trusted shell/document receives fresh one-shot endpoint capability
→ trusted Renderer connects
→ existing Renderer Control protocol continues unchanged
```

Every document lifetime receives fresh：

```text
Renderer Control material
Data settlement capability
Content grant
Presentation config candidate
```

Trusted Renderer consumes this before loading business scripts and captures the required native browser primitives。Hostra's own preload/ambient `window.electronAPI` remains Hostra-owned and is neither removed nor required by LoomRealm business contracts。

---

## 8. Physical Input

M15 source remains the existing browser producer：

```text
trusted KeyboardEvent.code
trusted PointerEvent
captured navigator.getGamepads()
→ canonical RendererInputSourceChange
→ existing M10 gate
```

Keyboard/Pointer/Gamepad exact canonical choices remain owned by `M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md`。

---

## 9. Reload / Shutdown / Failure

Reload：

```text
same Hostra physical Window
Main / Runner / Subsystem stay live
old document/Renderer retires
fresh document/Renderer material converges
current Data/Render presentation resumes
```

Normal product close：

```text
Hostra window.closed or LoomRealm closeWindow request
→ abort signal passed to runMain(...)
→ await Main/RuntimeHosting convergence
→ ALWAYS close LoomRealm Control/Data/Content resources
→ LoomRealm Node process exits
→ Hostra follows its normal HOSTRA_SUBCMD lifecycle
```

Main/Runner fatal preserves original logical failure but still performs finally-like LoomRealm physical cleanup。Hostra RPC terminal is product-terminal in M15；no host reconnect/recovery model。

---

## 10. Abstraction Budget

Expected new conceptual pieces are only：

```text
concrete Hostra RPC adapter
concrete Renderer Control WS realization
one concrete Data settlement WS realization
small single-window document bootstrap state
```

Do not add：

```text
HostraManager / HostraSession / HostraPlatformPort
WindowRegistry / WindowLifecycleManager / WindowSession
DocumentManager / BootstrapCoordinator
ConnectionManager / TransportRegistry
RecoveryManager
BrowserPrimitiveRegistry
UniversalRendererHost
```

Capability separation does not require one Server class per capability；implementation may share a physical listener or use multiple tiny listeners according to concrete simplicity。

---

## 11. Qualification Placement

M14 formal status remains owned solely by `doc/30-implementation/m14-qualification.md`。

Final M15 qualification must start the real pinned Hostra host：

```text
pinned Hostra
→ HOSTRA_SUBCMD LoomRealm Node product
→ Hostra RPC openWindow
→ Hostra-owned BrowserWindow
→ real Main/Runner/Data/Content/Input/M13/M14 path
→ reload / same-generation reconnect / shutdown
```

Hostra CDP may be used only for E2E observation。The historical standalone Electron vertical is migration evidence, not final M15 closure evidence。

---

## 12. Final Invariants

1. Hostra is the sole Electron/BrowserWindow owner in canonical M15；
2. LoomRealm Desktop is a plain Node Hostra subprocess and owns only LoomRealm physical services；
3. Main/Renderer/Subsystem authority boundaries are unchanged；
4. Hostra RPC remains host-control only；
5. Control、Data settlement、Data application、Content remain separated；
6. M9 Broker remains sole Desktop Data candidate/current owner；
7. trusted Renderer captures private browser primitives before business bootstrap；
8. M10 input、M13 presentation、M14 game paths remain unchanged logically；
9. reload keeps Hostra Window but replaces Renderer logical participant；
10. shutdown/failure uses one Main cancellation owner chain and finally-like physical cleanup；
11. no generic Hostra/Window/Document/Connection/Recovery framework is introduced；
12. physical implementation and qualification follow `M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md`。
