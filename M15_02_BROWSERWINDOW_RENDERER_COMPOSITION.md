# M15 / 02 — BrowserWindow Renderer Composition

> 状态：**Implementation Planned / Boundary Frozen**  
> 阶段：M15 Desktop Full E2E  
> 落地顺序：02  
> 最近复核：2026-09-10  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md)  
> 依赖：[M13 Web Presentation](M13_05_QUALIFICATION_CLOSURE.md)、[Desktop Host design](doc/20-modules/desktop-host/README.md)  
> 目标：让真实 Electron `BrowserWindow` 成为 production Renderer environment，并复用既有 Control/Data/Content/Presentation seams。

> **BrowserWindow 只提供 physical environment；它不拥有 Renderer authority，也不建立新的 browser-side application model。**

---

## 1. Physical Composition

```text
Electron main
    │
    ├─ Renderer Control physical carrier
    ├─ Desktop Data Broker
    ├─ Desktop Content service/private grants
    └─ BrowserWindow
          ↓
       Renderer role
          ↓
       existing M13 presentation
```

Renderer Control 使用 Electron 原生可转移 `MessagePort` 或等价 window-private carrier realization；该机制留在 `apps/desktop`，不得成为新的 cross-platform protocol。

Data 继续由现有 Desktop Data Broker 拥有 candidate/pair/currentness。Content 继续走现有 readonly Content service。Control/Data/Content 三条 capability 不合并成万能 IPC。

## 2. Browser Boundary

BrowserWindow Renderer 必须保持 browser boundary：

```text
nodeIntegration = false
contextIsolation = true
```

Node/Electron privileged material 不进入 business Web Component。Preload 只暴露启动真实 Renderer 所需的 private physical handoff，不暴露 filesystem path、Hostra plan、Main object、Store shortcut或可被 business code直接使用的 Content/Data authority material。

## 3. Trusted M13 Production Seam

M13 qualification 当前可直接使用 Renderer internal composition，但 M15 product code不得 import `packages/renderer/dist/internal/*`。

M15 将现有 M13 implementation 仅提升为一个 trusted product-consumable subpath：

```text
@loomrealm/renderer/web-presentation
```

该 subpath 只暴露现有 M13 concrete mechanics 所需的 trusted composition surface：

```text
WebPresentationConfigV1 validation/preparation
bootstrapWebPresentation
attachRendererPresentation
WebProjector
```

Renderer resource client继续使用现有 trusted：

```text
@loomrealm/renderer/resource-client
```

这不是 business author API，不建立新的 PresentationHost/PresentationRuntime/registry。M15 只把已存在且已 qualified 的 M13 mechanics 从 repository-internal test reach-through 变成合法 production import seam。

## 4. Presentation Startup

```text
product-private Config acquisition
→ trusted Config validation/preparation
→ resolve refs against current prepared Content
→ private browser bootstrap binding
→ ordered JS/CSS bootstrap
→ window.onload
→ WebProjector attach/start
```

Config bootstrap resource binding 与 runtime `PresentationResourceClient` 继续是两个 capability boundary。

M15 不建立 component loader、component registry、AssetManager 或 platform-specific projector。

## 5. BrowserWindow Data Handoff

现有 M9 Desktop Broker semantics保持不变：

```text
Main Data authority
→ Desktop Data Broker
→ one pending/current pair per subsystem
→ Runner-side Hostra provisioner
→ Renderer-side delivery
```

M9 的 current `DesktopRendererDataBinding` 是 Node-side deterministic realization；它不得直接注入 `nodeIntegration=false` 的 BrowserWindow。

M15 的真实 Renderer side改为：

```text
Desktop Data Broker
→ prepares exact renderer WebSocket endpoint under current Renderer correlation
→ Window-private Electron handoff
→ BrowserWindow RendererDataBinding.acquire(S,G,P)
→ native browser WebSocket
→ MessageCarrier
→ existing Renderer holder/Data peer
```

冻结规则：

```text
BrowserWindow 不提交 rendererControlToken 作为 Data authorization
private handoff 已绑定到当前 physical Renderer candidate
BrowserWindow 只请求 existing RendererDataBinding 所需的 S/G/P
Broker 仍决定 candidate prepared/current/retired
acquire 只有在对应 candidate current-deliverable 后才 resolve carrier
abort/retirement 后 late endpoint/commit 不得交付 live carrier
```

Electron handoff 只传递本次 physical acquisition 所需的 endpoint/settlement，不承载 Data application messages，也不成为 generic IPC bus。

same-generation Data pair loss继续使用既有 Broker replacement + Renderer `RendererDataBinding.acquire()` 路径；不得增加第二套 reconnect authority或 retry manager。

## 6. Renderer Currentness

BrowserWindow reload/replacement 产生新的 physical Renderer candidate；Main existing Renderer Control semantics 决定 currentness：

```text
old Renderer current
→ new candidate hello/accept
→ atomic replacement
→ old Renderer retired
```

Window lifecycle 不得直接修改 Main Session/Runtime/Frame/DataAuthority truth。

same-generation Data carrier loss 只影响 carrier/current replica availability；不得被 Desktop 翻译成 DataAuthority removal。

## 7. Completion

M15/02 完成时，真实 BrowserWindow 必须通过 production seams 获得：

```text
current Renderer Control snapshot
current per-subsystem Data connection
private Content/resource access
existing M13 Web projection
```

同时必须证明 product source 不再引用 Renderer internal filesystem paths，Node-only M9 Renderer binding 不进入 BrowserWindow，并能显示 M14 `lr-map-view` / `lr-map-sprite`；game library/example 不依赖 `apps/desktop` 或 Renderer internals。
