# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M9/M12/M13 closed baseline；M14 consumer architecture frozen；M15 Hostra physical recomposition frozen for execution  
> 主要定义：跨平台 physical composition、Launcher PREPARE、Runtime/Renderer/Data/Content/Web presentation placement  
> 依赖：[系统架构总览](./system-overview.md)、[渲染系统](./rendering-system.md)  
> 正式化：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)  
> 相关：[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
> 最近复核：2026-09-11

本文回答：**同一套 LoomRealm logical application semantics 如何在 Hostra / PWA 上被完整准备、组合并运行。** Platform 是 physical composition boundary，不是 universal application authority/service locator。

Milestone live qualification status由 [`phase-1-delivery-plan.md`](../30-implementation/phase-1-delivery-plan.md) 汇总；M14 formal status/evidence只由 [`m14-qualification.md`](../30-implementation/m14-qualification.md) 维护。M15 exact physical realization由根目录 recomposition plan + ADR 0034拥有。

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

Runtime executable PREPARE 继续由 matching Launcher/launch profile拥有：

```text
Game source
→ Game Entry validation
→ current Platform Launch Manifest
→ exact key join
→ executable/security/hosting preflight
→ immutable PlatformLaunchPlan
→ LogicalGameBootstrap
```

任何 PREPARE failure 必须发生在 Runner/Worker/business Definition side effect 之前。

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

Game Entry、Platform Launch Manifest、LogicalGameBootstrap 与 Web Presentation Config 保持独立；Config source/path/handle acquisition 是 concrete product mechanics，不属于 Config v1 ABI。

---

## 3. Physical Ownership

Physical owner取决于真实 platform composition，不要求一个 `apps/*` 进程拥有所有 OS/browser primitive。

```text
Hostra Desktop
    Hostra shell owns Electron / BrowserWindow / direct HOSTRA_SUBCMD process
    LoomRealm Desktop child owns LoomRealm Control/Data/Content/shell physical services

PWA
    browser Window/Worker environment owns browser physical containers
    LoomRealm PWA composition owns its narrow physical bindings
```

Main 唯一拥有 Session、Runtime/Frame/Activation/InputTarget/DataAuthority。Subsystem/game library拥有 business Render authority。Renderer拥有 current replica与 LoomRealm-managed projection mutation。

Platform physical ownership不产生第二份 application authority，也不拥有 concrete business WC semantics。

---

## 4. Existing Data / Content Boundaries

Data provisioning只实现 current Renderer + Subsystem physical carrier；provisioning/settlement不是 Content或 presentation loader channel。

M12 Desktop Content：

```text
successful Hostra launch-profile PREPARE
→ readonly prepared Content view
→ Desktop Content Service
→ scoped credentials
```

Subsystem获得 bound ContentClient；Renderer拥有 trusted/private ResourceClient。Content credential不得进入 Runtime Control/Data application messages、Frame params、Render state、business WC public state或 Web Presentation Config。

当 browser Realm 执行 business code 时，trusted Content/Data physical clients保留 private credentials/endpoints于 lexical/bound capabilities，而不是在 business bootstrap后动态重新读取可被替换的全局 primitive。

---

## 5. M13 Presentation Startup

```text
product-private Config source
→ validate/resolve against prepared Content
→ private browser binding
→ ordered business JS/CSS
→ window.onload
→ presentation start
```

M13不建立 ESM/dynamic component loader、second registry或 universal presentation port。

---

## 6. M13 Runtime Presentation Integration

Platform composition不拥有新的 presentation currentness state。Renderer继续只依据：

```text
committed/fresh current Control topology ─┐
                                         ├→ package-private reevaluation
successful current Renderer Store ───────┘
                                                ↓
                                          Web Projector
```

精确 identity/reconnect/receiver/resource/failure semantics由 Rendering + Web Presentation API v1拥有。

---

## 7. M14 Game Consumer Placement

```text
examples/essentials-v21.1
    consumes
        ↓
game-libs/map
    @loomrealm-game/map
```

Platform不拥有 map schema，也不负责 RMXP source translation。Preparation只 materialize first-slice当前实际消费的 Map/Tileset facts和 raw resources。

M14 test-owned Chromium harness不是 production Host；真实 Hostra shell/BrowserWindow/physical input/reload-shutdown属于 M15。

---

## 8. Hostra Desktop Realization

术语固定：

```text
Hostra shell
    lithdoo/hostra Electron local shell

Hostra launch profile
    @loomrealm/game-launcher-hostra PREPARE + Node Runner realization

LoomRealm Desktop process
    HOSTRA_SUBCMD direct child

Runner
    LoomRealm RuntimeHosting child
```

Canonical process topology：

```text
Hostra shell
├─ Electron
├─ BrowserWindow
├─ Hostra preload / ambient API
├─ JSON-RPC
└─ HOSTRA_SUBCMD
     ↓
LoomRealm Desktop plain Node process
├─ Main
├─ RuntimeHosting
│   └─ Runner
├─ Desktop Data Broker
├─ Content + trusted shell
├─ Renderer Control loopback carrier
└─ Data settlement loopback carrier
```

Hostra RPC只用于 existing host-control operations：

```text
openWindow
closeWindow
hostra.event
```

它不是 Renderer Control/Data/Content application bus。

历史 ADR 0033 的 `Electron main → ELECTRON_RUN_AS_NODE Runner` 只描述 direct-Electron embedding compatibility；ADR 0034 已 supersede 该 embedding assumption for canonical M15。

### Document/bootstrap physical facts

Hostra BrowserWindow导航到 LoomRealm loopback trusted shell。M15保持：

```text
same Hostra physical Window across reload
fresh logical Renderer/document per valid reload
fresh Control/Data/Content document material
same Main/Runner/game truth
```

Main Control acquire与 top-level document navigation通过 bounded rendezvous收敛；普通 fetch/XHR/subframe/resource request不能建立新的 Renderer document lifetime。

### Termination physical facts

所有终态汇入 LoomRealm Desktop process 的同一个 idempotent termination funnel，包括：

```text
window.closed
SIGTERM/SIGINT
host.shuttingDown
RPC terminal
programmatic close
Main/Runner fatal
startup partial failure
```

LoomRealm通过 existing `runMain` + RuntimeHosting owner chain收敛 Runner，finally-like释放自己的 physical resources；不建立第二份 direct Runner kill authority。

精确 sequence、Hostra shutdown grace和 qualification由 M15 recomposition plan拥有。

---

## 9. PWA Realization

PWA可以使用：

```text
Dedicated Worker
MessagePort / MessageChannel
Window
Fetch / Service Worker / OPFS/Cache
platform-specific private browser resource binding
```

Hostra Desktop 的 external shell、HOSTRA_SUBCMD、loopback HTTP/WS和 signal semantics不升级为 PWA contracts。两平台共享 logical semantics，而不是 physical symmetry。

---

## 10. Cross-platform Equivalence

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
Process tree vs Worker
WebSocket vs MessagePort
Desktop FSDB/HTTP vs PWA storage/fetch mechanics
private Config acquisition
private browser resource binding
```

---

## 11. No Platform Mega-abstraction

除真实 consumer 要求外，不建立：

```text
UniversalPlatform
RendererHosting service framework
ContentService universal port
InstallationRegistry / StorageProvider SPI
UniversalPresentationRegistry
PluginManager / PresentationLayerManager
GameLibraryHost
MiniDesktopHost / MapHost
HostraManager / HostraSession / HostraPlatformPort
WindowLifecycleManager / DocumentManager / BootstrapCoordinator
BrowserPrimitiveRegistry
generic local web-server/WebSocket framework
```

需要多个 concrete platform 实现同一真实 narrow seam 时，再最小 materialize port。

---

## 12. Milestone Placement

```text
M12 Content
→ M13 Web Presentation
→ M14 Map Game Library + First Real Game
→ M15 Hostra-owned Desktop Full E2E
→ M16 PWA Runtime
→ M17 PWA Full E2E / Equivalence
```

Current status summary见 [`phase-1-delivery-plan.md`](../30-implementation/phase-1-delivery-plan.md)。M15当前是 Hostra physical recomposition / plan frozen，不是旧 direct-Electron `Implementation Frozen` subject。

---

## 13. Final Invariants

1. Launcher/launch profile拥有 Runtime executable preparation；presentation startup独立；
2. Platform 是 physical composition boundary，不是 Main/Render/business authority；
3. Hostra shell是 canonical Desktop Electron/BrowserWindow/direct-subprocess owner；
4. LoomRealm Desktop是 plain Node HOSTRA_SUBCMD，只拥有 LoomRealm physical services；
5. Hostra RPC保持 host-control only；
6. Control、Data settlement、Data application、Content保持 capability separation；
7. M9 Broker仍是 Desktop Data candidate/current owner；
8. top-level document/bootstrap lifecycle不得被 ordinary page fetch/subframe触发；
9. Hostra signal/window/RPC/failure终态汇入同一个 LoomRealm termination owner chain；
10. M13 authority/currentness与 M14 business semantics不因 physical recomposition而改变；
11. Hostra/PWA允许不同 physical realization，但保持 logical/business outcome；
12. 不为 M15 materialize generic Hostra/Window/Document/Recovery framework。
