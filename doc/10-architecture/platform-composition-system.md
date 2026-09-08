# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M9/M12 closed；M13 Web Presentation pending  
> 主要定义：跨平台 physical composition、Launcher PREPARE、Runtime/Renderer/Data/Content/Web presentation placement  
> 依赖：[系统架构总览](./system-overview.md)、[渲染系统](./rendering-system.md)  
> 正式化：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)  
> 相关：[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

本文回答：**同一套 LoomRealm logical application semantics 如何在 Hostra / PWA 上被完整准备、组合并运行。** Platform是 physical Session composition boundary，不是 universal application authority/service locator。

---

## 1. Core Boundary

```text
Platform-neutral roles
┌─────────────────────────────────────┐
│ Main       Renderer       Subsystem │
│             Content consumers       │
└─────────────────────────────────────┘
                  ▲
          narrow capabilities
                  │
          ┌───────┴───────┐
        Hostra           PWA
```

Web presentation再区分：

```text
Web Projector
→ Renderer-owned mechanical projection

Business Web presentation
→ business-owned Custom Elements / layout

WebPresentationConfigV1
→ Window-level JS/CSS startup declaration

Web Presentation API v1
→ Window-local context/data/resource ABI
```

---

## 2. Runtime PREPARE vs Presentation Startup

Runtime executable PREPARE继续由 matching Launcher拥有：

```text
Game source
→ Game Entry validation
→ current Platform Launch Manifest
→ exact key join
→ executable/security/hosting preflight
→ immutable PlatformLaunchPlan
→ LogicalGameBootstrap
```

任何 PREPARE failure必须发生在 Process/Worker/business Definition side effect之前。

Web presentation不进入这个 executable join：

```text
successful Platform PREPARE
→ current prepared installation / Content view
+
product-private Web Presentation Config acquisition
→ parsed WebPresentationConfigV1
→ prepared Web presentation bootstrap
```

因此 Game Entry、Platform Launch Manifest、LogicalGameBootstrap 与 Web Presentation Config保持独立；Config source/path/handle acquisition是 concrete product/platform mechanics，不属于 Config v1 ABI。

---

## 3. Physical Ownership

Platform/app composition拥有：

```text
Process / Worker / Window hosting
Control/Data physical binding
DataConnectionBroker / provisioning
Content physical service/binding/credential
Web Presentation Config acquisition/resolution
trusted prepared resource → browser href/src binding
startup/shutdown/supervision
```

Main唯一拥有 Session/Runtime/Frame/Activation/InputTarget/DataAuthority。Subsystem拥有 business Render authority。Renderer拥有 current replica与 physical projection mutation。

Platform physical ownership不产生第二份 application authority，也不拥有 concrete business WC semantics。

---

## 4. Existing M9 / M12 Boundaries

M9 Data provisioning继续只处理 current Renderer + Subsystem Data carrier；Data ticket/provisioning IPC不是 Content或presentation loader channel。

M12 Desktop Content：

```text
successful Hostra PREPARE
→ exactly one direct-child [FSDB]*
→ readonly prepared Content view
→ Desktop Content Service
→ scoped credentials
```

Subsystem获得 bound ContentClient；Renderer拥有 trusted/private ResourceClient。

Content credential不得进入 Runtime Control/Data messages、Frame params、Render state、business WC public state或 Web Presentation Config。

---

## 5. M13 Presentation Startup

Current browser startup由 formal Config contract拥有：

```text
WebPresentationConfigV1
→ resolve current prepared Content refs
→ ordered <link rel="stylesheet">
→ ordered classic <script>
→ business customElements.define(...)
→ window.onload
→ start Web Projector
```

Config是整个 Renderer Window scope，没有 `subsystems`。M13不建立 ESM/Blob/dynamic component loader、second component registry或 universal presentation port。

`window.onload` 是 start barrier，但 implementation仍必须独立检测 stylesheet/script load/evaluation failure。

---

## 6. M13 Runtime Presentation Integration

```text
Renderer Store successful commit
→ package-private post-commit seam
→ presentation eligibility/currentness gate
→ Web Projector
→ document.body / business-owned WC
```

精确 identity/order/receiver/resource/currentness semantics由 [渲染系统](./rendering-system.md) 与 [Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)拥有；Platform composition不复制它们。

Platform只需提供 current Renderer Window environment及 private Content binding；它不需要 generic presentation service locator。

Business WC runtime resource通过 API façade消费 M12 semantics：

```text
namespace + key + expectedContentVersion
→ PresentationResourceClient
→ Renderer-private ResourceClient
→ M12 bytes
```

Business看不到 bearer/path/FSDB/privileged URL/private client。

---

## 7. Hostra / PWA Realization

Hostra可以使用：

```text
Node Runner Process
Runtime/Data WebSocket
BrowserWindow
fs + localhost Content HTTP
private browser href/src binding
```

PWA可以使用：

```text
Dedicated Worker
MessagePort / MessageChannel
Window
Fetch / Service Worker / OPFS/Cache
platform-specific private browser resource binding
```

两平台共享 logical semantics，不要求相同 physical mechanics。PWA不依赖 Node-only `@loomrealm/fsdb`。

---

## 8. Cross-platform Equivalence

必须共享：

```text
Game topology / LogicalGameBootstrap
Runtime/Frame/Renderer/Data/Input/Render contracts
Content logical identity/version/errors
WebPresentationConfigV1 semantics
Web Presentation API v1 semantics
wire-node → HTMLElement identity semantics
same-generation presentation freeze/rebaseline semantics
deterministic managed body ordering
business-observable result
```

不比较：

```text
module bytes/path
PID vs Worker
WebSocket vs MessagePort
Desktop FSDB/HTTP vs PWA storage/fetch mechanics
private config acquisition mechanism
private browser href/src binding
business WC private Shadow DOM/Canvas/WebGL implementation
```

---

## 9. No Platform Mega-abstraction

除非真实 consumer要求，不建立：

```text
UniversalPlatform
RendererHosting service framework
ContentService platform port
InstallationRegistry
StorageProvider SPI
UniversalPresentationRegistry
PluginManager
PresentationLayerManager
```

需要多个 concrete platform实现同一真实 narrow seam时，再最小 materialize port。

---

## 10. Milestone Placement

```text
M12 Content                            closed
M13 Web Presentation                  pending
M14 loom.map                           pending
M15 Desktop full E2E                   pending
M16 PWA Runtime                        pending
M17 PWA full E2E/equivalence           pending
```

M13使用 fixture WC + real Chromium关闭 Web semantics；M14才引入真实 map vocabulary；M15/M17只完成各平台 physical composition/equivalence，不重开 M13 logical contract。

---

## 11. Final Invariants

1. Launcher PREPARE只拥有 Runtime executable preparation；presentation startup独立；
2. Platform是 physical composition boundary，不是 Main/Render/business authority；
3. Data provisioning、Content binding、presentation bootstrap三者不混成万能 protocol/service；
4. Config只声明 Window-level bootstrap JS/CSS，source acquisition属于 concrete product/platform；runtime resource属于 Web Presentation API；
5. Platform不拥有 concrete Custom Element semantics/layout；
6. same-generation presentation currentness语义跨 Hostra/PWA一致，不由各平台自行选择；
7. M13不新增 universal loader/registry/layer/service-locator abstraction；
8. Hostra/PWA可以有不同 physical realization，但必须保持相同 logical Web presentation outcome。
