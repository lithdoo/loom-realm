# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M9/M12/M13 closed baseline；M14 consumer architecture frozen；M15 Desktop physical composition preimplementation frozen  
> 主要定义：跨平台 physical composition、Launcher PREPARE、Runtime/Renderer/Data/Content/Web presentation placement  
> 依赖：[系统架构总览](./system-overview.md)、[渲染系统](./rendering-system.md)  
> 正式化：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)  
> 相关：[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0033](../decisions/0033-electron-hostra-run-as-node.md)  
> 最近复核：2026-09-11

本文回答：**同一套 LoomRealm logical application semantics 如何在 Hostra / PWA 上被完整准备、组合并运行。** Platform 是 physical composition boundary，不是 universal application authority/service locator。

Milestone live qualification status由 [`phase-1-delivery-plan.md`](../30-implementation/phase-1-delivery-plan.md) 汇总；M14 formal status/evidence只由 [`m14-qualification.md`](../30-implementation/m14-qualification.md) 维护。本文不复制 run-level Closed/PASS事实。

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

Reusable game libraries/concrete games位于 Platform 逻辑之上；Platform app不拥有 map/menu/dialogue 等业务语义。

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

Main 唯一拥有 Session/Runtime/Frame/Activation/InputTarget/DataAuthority。Subsystem/game library拥有 business Render authority。Renderer 拥有 current replica 与 LoomRealm-managed physical projection mutation。

Platform physical ownership不产生第二份 application authority，也不拥有 concrete business WC semantics。

Concrete game/game library以正常 Game/Launcher/author API进入 Platform；不得把 reusable business implementation藏进 `apps/*`。

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

When a browser Realm later executes business code，trusted Content/Data physical clients must retain private credentials/endpoints through bound lexical capabilities rather than dynamically resolving business-replaceable globals。This is capability hiding inside the concrete platform binding，not a new logical Content/Data contract。

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

## 7. M14 Game Consumer Placement

M14 business layer位于 framework/platform之外：

```text
examples/essentials-v21.1
    consumes
        ↓
game-libs/map
    @loomrealm-game/map
```

Platform不拥有 map schema，也不负责 RMXP source translation。Preparation只 materialize map consumer 当前实际需要的 source facts：

```text
Essentials/RMXP source
→ tools/fixtures/essentials-v21.1 importer/lossless decode
→ selective M14 consumer projection
→ Map/{id} + Tileset/{id}
→ prepared Content + raw resources
→ @loomrealm-game/map
```

Unused Event/MapInfo/MapMetadata/Color/Tone/AudioFile 等 source facts 不进入 M14 first-slice consumer view merely because tooling can decode them。

Map browser JS/CSS 是 prepared Content resources，由 qualification/product Window composition通过 `WebPresentationConfigV1`启动。Runtime Render只携 logical resource identity/version，实际 tileset/player bytes由 WC 通过 `PresentationResourceClient`读取。

M14 qualification可用 test-owned harness复用 existing production roles + real Chromium；该 harness不是新的 Platform/Host。完整 Hostra BrowserWindow/physical input/reload-shutdown属于 M15。

---

## 8. Hostra / PWA Realization

Logical platform equality does not require physical symmetry。

Hostra can use：

```text
Node Runner Process
Runtime/Data WebSocket
BrowserWindow
fs + localhost Content HTTP
private browser resource binding
```

M15 fixes the first real Electron Desktop realization more precisely：

```text
Electron main
→ Hostra Runner executable remains canonical process.execPath
→ Hostra synthesizes ELECTRON_RUN_AS_NODE=1 for that Runner child
→ supported Electron build keeps runAsNode fuse enabled
→ same existing Hostra ChildProcess / Runtime Control / provisioning path

Desktop BrowserWindow
→ exact http://127.0.0.1:<port> app shell
→ same exact origin for existing /_lr/v1 Content API
→ nodeIntegration=false / contextIsolation=true / sandbox=true / webSecurity=true
→ isolated preload one-shot handoff
→ trusted Main-World Renderer captures authority-bearing native browser primitives
→ business presentation loads afterward
```

This does **not** add a configurable Node executable、alternate RuntimeHosting、CORS Content profile、preload Content proxy or cross-platform BrowserHost abstraction。

PWA can use：

```text
Dedicated Worker
MessagePort / MessageChannel
Window
Fetch / Service Worker / OPFS/Cache
platform-specific private browser resource binding
```

M15's Electron run-as-node and same-loopback-origin choices are Desktop-only physical facts。PWA does not inherit them；the two platforms share logical semantics, not physical mechanics。PWA 不依赖 Node-only `@loomrealm/fsdb`。

M14 concrete game保持在 `examples/*`，reusable map保持在 `game-libs/*`；M15/M17让 Hostra/PWA分别运行同一 logical game scenario，不为平台复制 game business source。

---

## 9. Cross-platform Equivalence

必须共享：

```text
Game topology / LogicalGameBootstrap
Runtime/Frame/Renderer/Data/Input/Render contracts
Content logical identity/version/errors
WebPresentationConfigV1 semantics
Web Presentation API v1 semantics
wire-node → HTMLElement identity/currentness semantics
game-library business rules
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

## 10. No Platform Mega-abstraction

除真实 consumer 要求外，不建立：

```text
UniversalPlatform
RendererHosting service framework
ContentService universal platform port
InstallationRegistry / StorageProvider SPI
UniversalPresentationRegistry
PluginManager / PresentationLayerManager
GameLibraryHost / platform-owned game registry
MiniDesktopHost / MapHost production abstraction
BrowserPrimitiveRegistry / security service locator
generic local web-server/CORS framework
```

需要多个 concrete platform 实现同一真实 narrow seam 时，再最小 materialize port。

---

## 11. Milestone Placement

Architecture只记录责任顺序，不复制 live closure ledger：

```text
M12 Content
→ M13 Web Presentation
→ M14 Map Game Library + First Real Game
→ M15 Desktop Full E2E
→ M16 PWA Runtime
→ M17 PWA Full E2E / Equivalence
```

Current status summary见 [`phase-1-delivery-plan.md`](../30-implementation/phase-1-delivery-plan.md)。M14 formal status/evidence见 [`m14-qualification.md`](../30-implementation/m14-qualification.md)。截至本次复核，M14 implementation complete / requalification pending，M15 Implementation Frozen / Preimplementation Closed。

---

## 12. Final Invariants

1. Launcher PREPARE 只拥有 Runtime executable preparation；presentation startup 独立；
2. Platform 是 physical composition boundary，不是 Main/Render/business authority；
3. Data provisioning、Content binding、presentation bootstrap 不混成万能 protocol/service；
4. Config source acquisition 属于 concrete product/platform；runtime resource 属于 Web Presentation API；
5. Platform 不拥有 concrete Custom Element semantics/layout；
6. M13 authority/currentness semantics 跨 Hostra/PWA 一致，由 frozen contracts 定义；
7. reusable game library/concrete game不被吸收到 platform app；
8. M14 map library只消费 selective RMXP/Essentials facts，不把 tooling/importer representation带入 Runtime；
9. M15/M16/M17 physical realization不能复制或重定义 M14 game semantics；
10. Hostra/PWA 可以有不同 physical realization，但必须保持相同 logical game/presentation outcome；
11. Desktop-specific run-as-node、same-origin和native primitive capture不得升级为不需要的跨平台 abstraction。
