# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M9/M12/M13 **Implemented / Qualified / Closed**
> 主要定义：跨平台 physical composition、Launcher PREPARE、Runtime/Renderer/Data/Content/Web presentation placement  
> 依赖：[系统架构总览](./system-overview.md)、[渲染系统](./rendering-system.md)  
> 正式化：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)  
> 相关：[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-09

本文回答：**同一套 LoomRealm logical application semantics 如何在 Hostra / PWA 上被完整准备、组合并运行。** Platform 是 physical composition boundary，不是 universal application authority/service locator。

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

Web presentation：

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

Runtime executable PREPARE 继续由 matching Launcher 拥有：

```text
Game source
→ Game Entry validation
→ current Platform Launch Manifest
→ exact key join
→ executable/security/hosting preflight
→ immutable PlatformLaunchPlan
→ LogicalGameBootstrap
```

任何 PREPARE failure 必须发生在 Process/Worker/business Definition side effect 之前。

Web presentation 不进入 executable join：

```text
successful Platform PREPARE
→ current prepared installation / Content view
+
product-private Web Presentation Config acquisition
→ WebPresentationConfigV1
→ Window bootstrap
→ presentation start
```

Game Entry、Platform Launch Manifest、LogicalGameBootstrap 与 Web Presentation Config 保持独立；Config source/path/handle acquisition 是 concrete product/platform mechanics，不属于 Config v1 ABI。

---

## 3. Physical Ownership

Platform/app composition 拥有：

```text
Process / Worker / Window hosting
Control/Data physical binding
DataConnectionBroker / provisioning
Content physical service/binding/credential
Web Presentation Config acquisition/resolution
trusted prepared resource → browser binding
startup/shutdown/supervision
```

Main 唯一拥有 Session/Runtime/Frame/Activation/InputTarget/DataAuthority。Subsystem 拥有 business Render authority。Renderer 拥有 current replica 与 LoomRealm-managed physical projection mutation。

Platform physical ownership不产生第二份 application authority，也不拥有 concrete business WC semantics。

---

## 4. Existing Data / Content Boundaries

Data provisioning 只实现 current Renderer + Subsystem physical carrier；Data ticket/provisioning IPC 不是 Content 或 presentation loader channel。

M12 Desktop Content：

```text
successful Hostra PREPARE
→ readonly prepared Content view
→ Desktop Content Service
→ scoped credentials
```

Subsystem 获得 bound ContentClient；Renderer 拥有 trusted/private ResourceClient。Content credential 不得进入 Runtime Control/Data messages、Frame params、Render state、business WC public state或 Web Presentation Config。

---

## 5. M13 Presentation Startup

精确 Config shape/MIME/order/failure/barrier 由 [Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md) 拥有。

平台只负责 concrete Window composition：

```text
product-private Config source
→ validate/resolve against prepared Content
→ private browser href/src binding
→ ordered business JS/CSS
→ window.onload
→ start presentation
```

M13 不建立 ESM/dynamic component loader、second registry或 universal presentation port。

---

## 6. M13 Runtime Presentation Integration

Presentation 运行后，platform composition 不拥有新的 currentness state。Renderer 使用冻结的两个 authoritative input：

```text
committed/fresh current Control Session/DataAuthority topology ─┐
                                                               ├→ package-private reevaluation
successful current per-subsystem Store commit ─────────────────┘
                                                                        ↓
                                                              per-subsystem eligibility
                                                                        ↓
                                                                  Web Projector
```

精确 identity/reconnect/receiver/resource/failure semantics 由 [渲染系统](./rendering-system.md) 与 [Web Presentation API v1](../15-contracts/web-presentation-api-v1.md) 拥有；本平台文档不复制第二份规则。

Platform 只需提供 current Renderer Window environment 与 private Content binding；不得创建 PresentationState、topology registry或 generic presentation service locator。

---

## 7. Hostra / PWA Realization

Hostra 可以使用：

```text
Node Runner Process
Runtime/Data WebSocket
BrowserWindow
fs + localhost Content HTTP
private browser resource binding
```

PWA 可以使用：

```text
Dedicated Worker
MessagePort / MessageChannel
Window
Fetch / Service Worker / OPFS/Cache
platform-specific private browser resource binding
```

两平台共享 logical semantics，不要求相同 physical mechanics。PWA 不依赖 Node-only `@loomrealm/fsdb`。

---

## 8. Cross-platform Equivalence

必须共享：

```text
Game topology / LogicalGameBootstrap
Runtime/Frame/Renderer/Data/Input/Render contracts
Content logical identity/version/errors
WebPresentationConfigV1 semantics
Web Presentation API v1 semantics
wire-node → HTMLElement identity/currentness semantics
business-observable result
```

可以不同：

```text
module bytes/path
PID vs Worker
WebSocket vs MessagePort
Desktop FSDB/HTTP vs PWA storage/fetch mechanics
private Config acquisition mechanism
private browser resource binding
business WC private implementation
```

---

## 9. No Platform Mega-abstraction

除真实 consumer 要求外，不建立：

```text
UniversalPlatform
RendererHosting service framework
ContentService universal platform port
InstallationRegistry / StorageProvider SPI
UniversalPresentationRegistry
PluginManager / PresentationLayerManager
```

需要多个 concrete platform 实现同一真实 narrow seam 时，再最小 materialize port。

---

## 10. Milestone Placement

```text
M12 Content                            closed
M13 Web Presentation                  ✅ Closed 2026-09-09
M14 loom.map                           pending
M15 Desktop full E2E                   pending
M16 PWA Runtime                        pending
M17 PWA full E2E/equivalence           pending
```

M13 使用 fixture WC + real Chromium 关闭 Web semantics；M14 才引入真实 map vocabulary；M15/M17 只完成各平台 physical composition/equivalence，不重开 M13 logical contract。

---

## 11. Final Invariants

1. Launcher PREPARE 只拥有 Runtime executable preparation；presentation startup 独立；
2. Platform 是 physical composition boundary，不是 Main/Render/business authority；
3. Data provisioning、Content binding、presentation bootstrap 不混成万能 protocol/service；
4. Config source acquisition 属于 concrete product/platform；runtime resource 属于 Web Presentation API；
5. Platform 不拥有 concrete Custom Element semantics/layout；
6. M13 authority/currentness semantics 跨 Hostra/PWA 一致，由 frozen contracts 定义；
7. M13 不新增 universal loader/registry/layer/service-locator abstraction；
8. Hostra/PWA 可以有不同 physical realization，但必须保持相同 logical Web presentation outcome。
