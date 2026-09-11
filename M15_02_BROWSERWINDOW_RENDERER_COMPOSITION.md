# M15 / 02 — BrowserWindow Renderer Composition

> 状态：**Logical Renderer constraints retained / direct-Electron handoff superseded**  
> 阶段：M15 Desktop Full E2E  
> 原落地顺序：02  
> 最近复核：2026-09-11  
> 当前 physical SSOT：[M15 Hostra Desktop Recomposition Plan](M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md)  
> 依赖：[M13 Web Presentation](M13_05_QUALIFICATION_CLOSURE.md)、[M12 Renderer Resource Client](M12_03_RENDERER_RESOURCE_CLIENT.md)

> **Supersession notice:** 本文继续拥有 Renderer/M13 integration、Control/Data/Content capability separation、trusted primitive capture 与 reload currentness intent；原 `MessageChannelMain`、LoomRealm preload、`webContents.postMessage`、direct BrowserWindow ownership/security configuration 已被 recomposition plan supersede。

---

## 1. Current Renderer Composition

The Renderer still runs inside a real Chromium page owned by Hostra's BrowserWindow：

```text
Hostra-owned BrowserWindow
  ↓
LoomRealm trusted shell
  ↓
trusted Renderer entry
  ├─ Renderer Control holder
  ├─ Renderer Data binding
  ├─ DOM RendererInputSource
  ├─ Renderer ResourceClient
  ├─ M13 Web Presentation
  └─ WebProjector
      ↓
  business Custom Elements
```

BrowserWindow is only physical environment。Renderer currentness remains Main/Renderer protocol behavior；business Render authority remains Subsystem/game-owned。

## 2. Capability Separation

The following physical capabilities remain separate：

```text
Renderer Control
Data settlement
Data application
Content/resource access
DOM input
Presentation projection
```

No universal IPC/RPC/service bus may merge them。

Current physical realization is governed by the recomposition plan：

```text
Renderer Control     → LoomRealm loopback one-shot WebSocket capability
Data settlement      → narrow loopback WebSocket settlement realization
Data application     → existing native browser WebSocket path
Content              → existing Desktop HTTP Content API
Hostra RPC           → Window/lifecycle operations only
```

Hostra RPC MUST NOT carry LoomRealm Control/Data application payload。

## 3. Trusted Main-World Placement

LoomRealm trusted Renderer runtime、Renderer holder、DOM `RendererInputSource`、M13 bootstrap 和 `WebProjector` stay in the page Main World because `WebProjector` must use the same real `document/customElements` realm as business Custom Elements。

Business scripts are loaded only after the trusted Renderer has：

```text
consumed document bootstrap material
captured/bound required native browser primitives
constructed private Renderer capabilities
```

Hostra's preload/ambient `window.electronAPI` is Hostra-owned environment。LoomRealm neither removes nor depends on it。

## 4. Trusted Browser Primitive Capture

Before loading the first business script, the trusted Renderer captures the exact primitives that later carry private LoomRealm capabilities：

```text
native fetch / URL mechanics for private Content requests
native WebSocket for Control/Data physical acquisition
DOM input primitives used by M15/03
```

Concrete adapters close over those primitives。Do not introduce：

```text
BrowserPrimitiveRegistry
SecurityService
PrimitiveManager
```

Qualification should continue proving that replacing page-visible `fetch` / `WebSocket` after trusted bootstrap cannot observe LoomRealm Content bearer or private Data/Control endpoint material。

## 5. M13 Production Seam

M15 product code continues to consume the existing trusted Renderer surfaces：

```text
@loomrealm/renderer/web-presentation
@loomrealm/renderer/resource-client
```

`web-presentation` exposes only the already-existing trusted M13 mechanics：

```text
WebPresentationConfigV1 validation/preparation
bootstrapWebPresentation
attachRendererPresentation
WebProjector
```

No `PresentationHost`、`PresentationRuntime`、component registry or platform-specific projector is introduced。Production Desktop code MUST NOT reach through `packages/renderer/dist/internal/*`。

## 6. Document Bootstrap Boundary

The current Hostra composition no longer uses a LoomRealm Electron preload or transferred `MessagePort` bootstrap。The trusted shell/document response provides fresh document material according to the recomposition plan。

Per loaded document, bootstrap material is limited to：

```text
Renderer Control token + one-shot Control WS endpoint capability
Data settlement one-shot endpoint capability
Renderer Content access
WebPresentationConfigV1 candidate
```

It MUST NOT expose：

```text
Hostra RPC credentials
filesystem paths
Runner/bootstrap token
Main private state
DataAuthority policy
```

Bootstrap values remain trusted Renderer lexical/private state and are invalidated/retired with that document lifetime。

## 7. Data Boundary

M9 `DesktopDataConnectionBroker` remains the sole Desktop candidate/current owner。

```text
Main Data authority
→ Desktop Data Broker
→ Runner-side provisioner
→ Renderer-side physical settlement
→ existing RendererDataBinding / Data peer
```

The settlement wire is only：

```text
prepare
prepared-or-failed
commit
revoke
close
```

Data application bytes remain on the existing WebSocket carrier。Browser-side code cannot create `DataAuthority` or choose candidate currentness。

Same-generation physical loss still means fresh Broker pair + fresh `RendererDataBinding.acquire()` convergence；no resume history、retry framework or second recovery authority。

## 8. Reload / Currentness

Reload replaces document/Renderer lifetime, not game lifetime：

```text
same Hostra physical Window
Main / Runner / Subsystem remain live
old document + old Renderer retire
fresh document obtains fresh Control/Data/Content material
fresh Renderer becomes current through existing Main semantics
current Store/Render truth projects again
```

Reload MUST NOT reuse old Control endpoint、Data settlement capability、Content grant or document primitive closure。

## 9. Abstraction Budget

This slice does not justify：

```text
RendererHost
WindowRendererManager
DocumentManager
BootstrapCoordinator
TransportRegistry
ConnectionManager
PresentationHost
BrowserPrimitiveRegistry
```

A small concrete Control WS adapter、one Data settlement realization and direct document-bootstrap code are sufficient。

## 10. Completion

The retained M15/02 intent is satisfied when the Hostra-owned BrowserWindow can obtain through production seams：

```text
current Renderer Control
current per-subsystem Data connection
private Content/resource access
existing M13 projection
real DOM input source
```

and the implementation proves：

```text
no LoomRealm Electron preload/MessageChannelMain dependency
Hostra RPC is not an application data plane
private Content/Data primitives are captured before business bootstrap
post-bootstrap global replacement cannot observe private material
M9 Broker remains the only Data candidate/current owner
M14 business Custom Elements render through existing M13 seams
```
