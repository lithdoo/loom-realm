# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：M6 Runtime / M9 Data / M12 Content / M13 Web Presentation **Implemented + Qualified**；M14 **Implementation complete / requalification pending**；M15 **Hostra physical recomposition / implementation plan frozen**  
> 当前 M15 physical SSOT：[M15 Hostra Desktop Recomposition Plan](../../../M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)  
> 决策：[ADR 0034](../../decisions/0034-hostra-owned-desktop-composition.md)  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[渲染系统](../../10-architecture/rendering-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[ADR 0032](../../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-11

Hostra shell owns the Desktop host；LoomRealm Desktop只拥有自己的 physical service composition。Main保留 Session/Runtime/Frame/Activation/InputTarget/DataAuthority authority，Subsystem/game library保留 business Render authority，Renderer保留 current replica与 Web projection mechanics。

---

## 1. Terminology / Milestone Shape

```text
Hostra shell
    lithdoo/hostra external Electron host

Hostra launch profile
    @loomrealm/game-launcher-hostra PREPARE + Runner realization

LoomRealm Desktop process
    Hostra HOSTRA_SUBCMD direct child

Runner
    LoomRealm RuntimeHosting child
```

```text
M6  launch-profile PREPARE / Runner / Runtime Control ✅
M9  Desktop Data Broker / provisioning              ✅
M10 User Input                                      ✅
M11 Render Replication                              ✅
M12 Desktop Content                                 ✅
M13 Web Presentation                                ✅ Closed
M14 Map Game Library + concrete example             ⚠️ implementation complete / requalification pending
M15 Hostra-owned full Desktop E2E                   🔄 physical recomposition
```

M15只纠正最外层 physical owner；不重新设计 M9–M14 logical/business semantics。

---

## 2. Product Topology

```text
Hostra shell
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
├─ Renderer Control loopback carrier
└─ Renderer Data settlement loopback carrier

Hostra BrowserWindow
└─ LoomRealm trusted shell
    ├─ Renderer Control
    ├─ Data
    ├─ Content
    ├─ DOM Input
    └─ M13 Presentation
```

Hostra is the sole Electron/BrowserWindow owner in canonical M15。Final recomposition后 `apps/desktop` canonical production path不得 import Electron、创建 BrowserWindow 或 own `app.quit()`。

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

Canonical game remains checked-in `examples/essentials-v21.1`。Web Presentation Config remains independent product input；不得进入 Game Entry、launch manifest、HostraLaunchPlan或 Main bootstrap。

`@loomrealm/game-launcher-hostra`继续拥有 existing PREPARE + Node Runner mechanics。不要因为 external host 也叫 Hostra 就合并两个 owner/package。

---

## 4. Hostra RPC Boundary

Production minimum：

```text
openWindow
closeWindow
hostra.event
```

`getHostState/getAllWindows`用于 qualification/diagnostics，不是 LoomRealm authority/currentness。

Hostra RPC不得承载：

```text
Renderer Control application messages
Data settlement/application messages
Content bytes
Input/Render protocol
Main/Subsystem business state
```

Adapter留在 `apps/desktop`；不提升为 `platform-ports` 或 HostraManager/HostraSession。

---

## 5. Renderer Control / Document Rendezvous

Historical direct-Electron `MessageChannelMain` + LoomRealm preload handoff已被 supersede。

Target：

```text
Main RendererControlBinding.acquire(token)
→ concrete loopback carrier
→ trusted top-level document receives fresh one-shot endpoint
→ trusted Renderer connects
→ existing Renderer Control protocol unchanged
```

Startup/reload需要一个最小 bounded rendezvous：

```text
pendingAcquire   0..1
pendingDocument  0..1
currentDocument  0..1
```

acquire与 top-level document navigation谁先到谁等待；只有二者都存在时才 mint fresh Control/Data/Content document material。

不得增加 `DocumentManager`、`BootstrapCoordinator` 或 Window state-machine framework。

---

## 6. Trusted Shell Navigation Boundary

Trusted shell route只承担 **top-level main-document bootstrap**。

允许建立 fresh document lifetime：

```text
valid current Hostra Window top-level navigation
```

不得建立/替换 Renderer lifetime：

```text
fetch()/XHR
iframe/subframe
script/style/image/resource request
wrong route secret
request after product termination
```

因此 ordinary `fetch(location.href)` 不能 retire 当前 Renderer或 mint fresh bootstrap。

每个成功 document pairing获得 fresh：

```text
Renderer Control material
Data settlement capability
Content grant
Presentation config candidate
```

Trusted Renderer在 business scripts前消费这些 material并捕获需要的 native browser primitives。Hostra自己的 preload/ambient API保持 Hostra-owned，LoomRealm不修改也不依赖它。

---

## 7. Data

M9 `DesktopDataConnectionBroker`继续唯一拥有 paired candidate/current lifecycle：

```text
Main committed Data authority
→ Desktop Data Broker
→ Runner provisioner + Renderer physical delivery
```

只替换 Renderer-side settlement transport；wire仍是：

```text
prepare / prepared-or-failed / commit / revoke / close
```

Data application bytes保持独立 carrier。Same-generation loss继续通过 existing Broker replacement + fresh `RendererDataBinding.acquire()`；不增加 retry/recovery authority。

---

## 8. Content / Presentation / Input

Existing Content semantics保持：

```text
successful PREPARE
→ readonly prepared Content view/service
→ Subsystem ContentClient
→ Renderer ResourceClient
→ PresentationResourceClient
```

M13继续通过：

```text
@loomrealm/renderer/web-presentation
@loomrealm/renderer/resource-client
```

Input继续通过真实 Hostra-owned Chromium DOM producer：

```text
trusted KeyboardEvent.code
trusted PointerEvent
captured navigator.getGamepads()
→ canonical RendererInputSourceChange
→ existing M10 gate
```

Keyboard/Pointer/Gamepad exact mapping仍由 `M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md`保留的 logical/input intent拥有。

---

## 9. Reload

```text
same Hostra physical Window
Main / Runner / Subsystem stay live
old document / Renderer retires
same shell URL performs fresh top-level navigation
→ fresh document/acquire rendezvous
→ fresh Renderer material
→ current Data/Render presentation resumes
```

必须保持：

```text
Hostra windowId stable
Renderer identity fresh
Subsystem generation unchanged
game state unchanged
reload does not call Hostra openWindow again
```

---

## 10. One Termination Funnel

以下全部是同一个 product-terminal path 的 trigger：

```text
window.closed
SIGTERM / SIGINT
host.shuttingDown
Hostra RPC terminal
programmatic close
Main / Runner fatal
startup partial failure
```

统一收敛：

```text
beginTermination(reason)
→ stop accepting document activity
→ abort runMain signal
→ await/preserve Main settlement
→ existing RuntimeHosting converges Runner
→ finally close Control/Data/Content/document resources
→ close Hostra RPC adapter
→ LoomRealm Node process exits
```

`beginTermination()` 必须 idempotent。Main rejection不得跳过 cleanup；programmatic close不得依赖 `window.closed` 一定返回。

Pinned Hostra 在 final-window shutdown中可能直接 signal `HOSTRA_SUBCMD`，因此 Node entry必须显式处理 SIGTERM/SIGINT并进入同一 funnel。Desktop不得增加第二份 direct Runner kill authority。

---

## 11. Startup / Failure Convergence

以下任一失败都通过同一 finally-like owner path收敛：

```text
RPC connect
PREPARE
listener startup
runMain early reject
openWindow RPC
Window/document bootstrap
Renderer convergence
```

`openWindow` RPC success不代表 product ready；ready由真实 Renderer/presentation convergence证明。

---

## 12. Abstraction Budget

Expected new conceptual pieces only：

```text
concrete Hostra RPC adapter
concrete Renderer Control loopback realization
one concrete Data settlement realization
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

Capability separation不要求一个 Server class per capability。

---

## 13. Qualification Placement

Final M15 qualification从 pinned real Hostra开始：

```text
pinned Hostra
→ HOSTRA_SUBCMD LoomRealm Node product
→ Hostra RPC openWindow
→ Hostra-owned BrowserWindow
→ real Main/Runner/Data/Content/Input/M13/M14 path
→ navigation-only bootstrap
→ reload / same-generation reconnect
→ final-window signal/lifecycle convergence
```

Hostra CDP只用于 E2E observation。Historical standalone Electron vertical是 migration evidence，不是 final closure evidence。

---

## 14. Final Invariants

1. Hostra shell是 canonical Electron/BrowserWindow/direct-subprocess owner；
2. LoomRealm Desktop是 plain Node HOSTRA_SUBCMD，只拥有 LoomRealm physical services；
3. Runner由 LoomRealm RuntimeHosting拥有；
4. Main/Renderer/Subsystem authority boundaries unchanged；
5. Hostra RPC remains host-control only；
6. Control、Data settlement、Data application、Content remain separated；
7. M9 Broker remains sole Desktop Data candidate/current owner；
8. document/acquire rendezvous bounded且 navigation-only bootstrap不能被普通 page request触发；
9. reload keeps Hostra Window but replaces Renderer logical participant；
10. signals/window/RPC/failure汇入 one termination funnel；
11. no second Runner kill authority；
12. no generic Hostra/Window/Document/Connection/Recovery framework；
13. physical implementation follows ADR 0034 + root recomposition SSOT。
