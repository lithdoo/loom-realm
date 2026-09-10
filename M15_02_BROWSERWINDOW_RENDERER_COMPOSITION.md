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
       M13 presentation
```

Renderer Control 使用 Electron 原生可转移 message channel/port 或等价的 window-private carrier realization；该机制留在 `apps/desktop`，不得成为新的 cross-platform protocol。

Data 继续走现有 Desktop Data Broker。Content 继续走现有 readonly Content service。三条 capability 不合并成万能 IPC。

## 2. Browser Boundary

BrowserWindow Renderer 必须保持 browser boundary：

```text
nodeIntegration = false
contextIsolation = true
```

Node/Electron privileged material 不进入 business Web Component。若需要 preload，只暴露启动真实 Renderer 所需的 private physical binding，不暴露 filesystem path、Hostra plan、Content token、Main object 或 Store shortcut。

## 3. Presentation Startup

```text
product-private Config acquisition
→ validate WebPresentationConfigV1
→ resolve refs against current prepared Content
→ private browser resource binding
→ ordered JS/CSS bootstrap
→ window.onload
→ existing M13 presentation start
```

Config bootstrap resource binding 与 runtime `PresentationResourceClient` 继续是两个 capability boundary。

M15 不建立 component loader、component registry、AssetManager 或 platform-specific projector。

## 4. Renderer Currentness

BrowserWindow reload/replacement 产生新的 physical Renderer candidate；Main existing Renderer Control semantics 决定 currentness：

```text
old Renderer current
→ new candidate hello/accept
→ atomic replacement
→ old Renderer retired
```

Window lifecycle 不得直接修改 Main Session/Runtime/Frame/DataAuthority truth。

same-generation Data carrier loss 只影响 carrier/current replica availability；不得被 Desktop 翻译成 DataAuthority removal。

## 5. Completion

M15/02 完成时，真实 BrowserWindow 必须通过 production seams 获得：

```text
current Renderer Control snapshot
current per-subsystem Data connection
private Content/resource access
M13 Web projection
```

并能显示 M14 `lr-map-view` / `lr-map-sprite`，而 game library/example 不依赖 `apps/desktop` 或 Renderer internals。
