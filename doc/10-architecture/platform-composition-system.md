# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M9/M12/M13/M14 closed baseline；M15 design frozen and implemented / current subject Requalification Pending；Realm State v1 implemented / qualified
> 主要定义：跨平台 physical composition、Launcher PREPARE、Runtime/Renderer/Data/Content/Realm State/Web presentation placement  
> 依赖：[系统架构总览](./system-overview.md)、[Realm State](./realm-state-system.md)、[渲染系统](./rendering-system.md)  
> 正式化：[Realm State v1](../15-contracts/realm-state-v1.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)  
> 相关：[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
> 最近复核：2026-10-05

本文回答：**同一套 LoomRealm logical application semantics 如何在 Hostra / PWA 上被完整准备、组合并运行。** Platform 是 physical composition boundary，不是 universal application authority/service locator。

Milestone live qualification status由 [`phase-1-delivery-plan.md`](../30-implementation/phase-1-delivery-plan.md) 汇总；M14 formal status/evidence只由 [`m14-qualification.md`](../30-implementation/m14-qualification.md) 维护。M15 exact physical realization由根目录 recomposition plan + ADR 0034拥有。

---

## 1. Core Boundary

```text
Platform-neutral logical roles
┌──────────────────────────────────────────┐
│ Main      Realm State      Renderer      │
│ Subsystem      Content consumers         │
└──────────────────────────────────────────┘
                    ▲
            narrow capabilities
                    │
          ┌─────────┴─────────┐
        Hostra               PWA
```

Logical ownership：

```text
Main
    Control Authority

RealmStateAuthority
    Session shared mutable business-state authority

Subsystem
    business-local execution / Render authority

Renderer
    control/data replica + presentation projection

Content
    readonly installation definitions/resources

Platform / Session composition
    physical construction / binding / disposal / wiring only
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

Reusable game libraries/concrete games位于 Platform 逻辑之上；Platform app不拥有 map/menu/dialogue 等业务语义，也不解释 Realm State namespace/value。

---

## 2. Runtime PREPARE vs Session State Bootstrap vs Presentation Startup

Runtime executable PREPARE 继续由 matching Launcher/launch profile拥有：

```text
Game source
→ Game Entry validation including optional state document
→ current Platform Launch Manifest
→ exact Subsystem key join
→ executable/security/hosting preflight
→ immutable PlatformLaunchPlan
→ Launcher projects validated Game State
→ PreparedLogicalGame
    ├─ LogicalGameBootstrap
    └─ PreparedRealmStateDefinition
```

任何 PREPARE failure 必须发生在 Runner/Worker/business Definition side effect 之前。

`LogicalGameBootstrap` 与 `PreparedRealmStateDefinition` 是平级 projection：

```text
LogicalGameBootstrap
    Main-facing topology / initial Frame input

PreparedRealmStateDefinition
    detached/immutable Realm State bootstrap baseline
```

Game Package document `state` 不是 RealmStateAuthority bootstrap ABI；matching Launcher 在 PREPARE 内完成 document → prepared State projection。Realm State payload MUST NOT 塞进 Main bootstrap。

PREPARE complete 后，Session composition MUST 在第一项 business Runtime side effect前完成：

```text
physically construct fresh RealmStateAuthority from PreparedRealmStateDefinition
→ install immutable prepared Game baseline
→ derive initial materialized membership
→ revision/version = 0
→ Realm State READY
→ create Runtime-scoped RealmStateClient capabilities
```

Realm State bootstrap只有 prepared Game baseline 这一种特殊 value source。Save/Load/restore 不属于 Session State bootstrap；如果业务要恢复持久化数据，由 Subsystem 在 Runtime 启动后通过普通 RealmStateClient read/commit 完成。

这里的 Session composition 只拥有 physical ordering/wiring/disposal；它 MUST NOT 解释 State values、拥有 OCC/revision，或创建第二套 Session/Runtime/Frame authority。

因此：

```text
first business Runtime side effect
    ⇒ PREPARE complete
    ∧ Realm State READY
```

Web presentation 不进入 executable join 或 Realm State bootstrap：

```text
successful Platform PREPARE
→ current prepared installation / Content view
+
product-private Web Presentation Config acquisition
→ WebPresentationConfigV1
→ Window bootstrap
→ presentation start
```

Game Entry、Platform Launch Manifest、LogicalGameBootstrap、PreparedRealmStateDefinition 与 Web Presentation Config 保持独立；Config source/path/handle acquisition 是 concrete product mechanics，不属于 Config v1 ABI。

---

## 3. Physical Ownership

Physical owner取决于真实 platform composition，不要求一个 `apps/*` 进程拥有所有 OS/browser primitive。

```text
Hostra Desktop
    Hostra shell owns Electron / BrowserWindow / direct HOSTRA_SUBCMD process
    LoomRealm Desktop child owns LoomRealm physical services
        Main realization
        RealmStateAuthority realization
        RuntimeHosting
        Data/Control/Content bindings

PWA
    browser Window/Worker environment owns browser physical containers
    LoomRealm PWA composition owns narrow physical bindings
        Main / Realm State placement may share or separate Worker
```

Main 唯一拥有 Session Control authority。RealmStateAuthority 唯一拥有 Session shared mutable business facts。Subsystem/game library拥有 business Render authority。Renderer拥有 current replica与 LoomRealm-managed projection mutation。

Platform physical ownership不产生第二份 application authority。RealmStateAuthority MAY 与 Main 同进程/Worker，但 logical owner/API/lifetime semantics必须分离。

Platform/Session composition MUST NOT：

```text
interpret Realm State namespace/value business semantics
own Realm State revision/version/OCC/retry policy
inspect Main Frame/Activation to authorize State commit
turn Realm State binding loss into Runtime/Session transition
interpret Save/Load workflow as Realm State bootstrap policy
become a generic SessionCoordinator / StateManager / service locator
```

---

## 4. Data / Content / Realm State Boundaries

Renderer Data provisioning只实现 current Renderer + Subsystem physical carrier；provisioning/settlement不是 Content、Realm State 或 presentation loader channel。

M12 Desktop Content：

```text
successful Hostra launch-profile PREPARE
→ readonly prepared Content view
→ Desktop Content Service
→ scoped credentials
```

Subsystem获得 bound ContentClient；Renderer拥有 trusted/private ResourceClient。Content credential不得进入 Runtime Control/Data application messages、Frame params、Render state、business WC public state或 Web Presentation Config。

Realm State：

```text
PreparedRealmStateDefinition
→ RealmStateAuthority
→ Runtime-scoped RealmStateClient logical capability
→ replaceable physical State binding
→ Subsystem business code
```

Realm State MUST NOT 复用：

```text
Renderer Data application profile
frame.call()
Content HTTP logical API
Main business fields
Frame/Activation mutation gate
```

Desktop MAY 使用 in-process direct binding；PWA MAY 使用 Worker/MessagePort 或其他 bounded private binding。Physical binding差异不得改变 `read/readInitial/list/scan/commit/subscribe` logical semantics、OCC、commit evidence 或 logical client lifetime。

### 4.1 RealmStateClient vs physical binding

`RealmStateClient` 是 Runtime-scoped logical capability；一个 concrete physical binding 只是 carrier realization。

```text
live Runtime-scoped RealmStateClient
    ├─ binding A
    │    ↓ lost
    └─ binding B
```

Physical binding loss：

```text
MUST terminal subscriptions attached to the old binding
MUST NOT terminal the live Runtime-scoped RealmStateClient by itself
MUST NOT fail Main Runtime
MUST NOT unwind Frame
MUST NOT terminate Session
MUST NOT reset RealmStateAuthority
MUST NOT change DataAuthority
```

Fresh binding 可以继续服务同一个 live Runtime-scoped client。Old subscription identity 不得透明 reattach；business 必须 fresh subscribe + fresh baseline。

Dispatched mutation 的 definitive result 如果随 binding loss 丢失，必须按 `OUTCOME_UNKNOWN` 处理，fresh binding MUST NOT 自动 replay mutation。

RealmStateAuthority fatal 是 Session-fatal fact；Platform只负责把该 fact物理传递/wire 给 Main。**Main 唯一提交 Session terminal 与 Runtime/Frame unwind**；Platform不能自行解释 business values 或执行第二套 unwind policy。

当 browser Realm 执行 business code 时，trusted Content/Data/Realm State physical clients保留 private credentials/endpoints/ports于 lexical/bound capabilities，而不是在 business bootstrap后动态重新读取可被替换的全局 primitive。

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

Presentation startup MUST NOT become Realm State authority bootstrap；Realm State READY 已属于 Session/business Runtime bootstrap barrier。

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

Realm State current business facts只有通过：

```text
Realm State
→ Subsystem business logic
→ RenderDomain
→ Renderer Store
→ Web Projector
```

进入 presentation。Renderer/DOM MUST NOT direct-write Realm State。

Realm State 不保存 RenderDomain、animation、DOM/presentation state；这些继续由 Subsystem/Renderer/Business Web presentation 各自拥有。

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

Realm State 是 shared mutable business-state capability，不把 imported Content definition 改写成 mutable State authority。Immutable map/content definition、decoded cache、local task progress默认都不进入 Realm State。

Save/Load workflow 同样不属于 Platform/Realm State bootstrap：具体游戏若实现存档 Subsystem，由该 business code 自行消费 persistence capability，并使用公开 RealmStateClient 读写业务事实。

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
├─ RealmStateAuthority             (Session-owned live authority)
├─ RuntimeHosting
│   └─ Runner
├─ Desktop Data Broker
├─ Content + trusted shell
├─ Renderer Control loopback carrier
├─ Data settlement loopback carrier
└─ Realm State Runtime bindings    (dedicated Hostra WS / Worker MessagePort)
```

Frozen M15 external host baseline由 current recomposition SSOT拥有：

```text
hostra@1.0.1-beta.1
source d863beab3c59c3bd4f271514a228fa8fee0bf5b6
bundled Electron 44.1.1
shutdown grace 1000 ms
```

Realm State placement shown here is the current v1 realization；其 implementation/qualification 由独立 Realm State ledger 证明，不扩张历史 M15 evidence。

Hostra RPC只用于 existing host-control operations：

```text
openWindow
closeWindow
hostra.event
```

它不是 Renderer Control/Data/Content/Realm State application bus。

历史 ADR 0033 的 `Electron main → ELECTRON_RUN_AS_NODE Runner` 只描述 direct-Electron embedding compatibility；ADR 0034 已 supersede 该 embedding assumption for canonical M15。

### Document/bootstrap physical facts

Hostra BrowserWindow导航到 LoomRealm loopback trusted shell。M15保持：

```text
same Hostra physical Window across reload
fresh logical Renderer/document per valid reload
fresh Control/Data/Content document material
same Main/Runner/game/Realm State Session truth
```

Main Control acquire与 top-level document navigation通过 bounded rendezvous收敛；普通 fetch/XHR/subframe/resource request不能建立新的 Renderer document lifetime，也不能建立/替换 RealmStateAuthority。

### Data reconnect physical fact

```text
reload
    → fresh Renderer identity

same-generation Data-only reconnect
    → same Renderer Control participant
    → fresh Data physical pair only
    → fresh RendererDataBinding.acquire()
```

Data-only reconnect不得建立第二个 Renderer currentness universe，也不得 reset Realm State。

### Realm State binding reconnect physical fact

未来 Desktop Realm State binding 可以 independently reconnect：

```text
Realm State binding A lost
→ old subscriptions terminal
→ same Runtime-scoped RealmStateClient remains logically live
→ fresh binding B
→ future operations may proceed
→ business fresh subscribe + fresh baseline
```

该 reconnect 不产生新 Runtime/Frame/Session identity，不自动 replay ambiguous commit。

### Termination physical facts

所有终态汇入 LoomRealm Desktop process 的同一个 idempotent termination funnel，包括：

```text
window.closed
SIGTERM/SIGINT
host.shuttingDown
RPC terminal
programmatic close
Main/Runner fatal
RealmStateAuthority fatal report
startup partial failure
```

RealmStateAuthority fatal 的 logical policy是 report Session-fatal fact to Main；Main提交 Session terminal / Runtime/Frame unwind，concrete Desktop再将 committed terminal汇入同一个 physical cleanup owner chain。RealmStateAuthority/Platform 不建立第二份 process/Runtime termination authority。

LoomRealm通过 existing `runMain` + RuntimeHosting owner chain收敛 Runner，finally-like释放自己的 physical resources；不建立第二份 direct Runner kill authority。

精确 sequence、frozen Hostra shutdown grace和 qualification由 M15 recomposition plan拥有。

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

RealmStateAuthority MAY 与 Main 位于同一 Worker，也 MAY 使用单独 Worker/port binding；选择属于 concrete PWA composition。无论 placement，必须保持一个 Session 一个 logical RealmStateAuthority、Runtime-scoped client lifetime、replaceable binding、OCC/evidence/subscription等价。

PWA Realm State binding loss同样不能自动取得 Runtime/Session supervision authority；fresh binding恢复必须保持同一个 live Runtime-scoped logical client，old subscriptions terminal，fresh subscribe + fresh baseline，且不得自动 replay ambiguous mutation。

Hostra Desktop 的 external shell、HOSTRA_SUBCMD、loopback HTTP/WS和 signal semantics不升级为 PWA contracts。两平台共享 logical semantics，而不是 physical symmetry。

---

## 10. Cross-platform Equivalence

必须共享：

```text
Game topology / LogicalGameBootstrap
Game State document → PreparedRealmStateDefinition projection semantics
Realm State Record identity/current/initial/OCC semantics
Realm State commit evidence/subscription/lifetime semantics
Runtime-scoped RealmStateClient vs replaceable physical binding semantics
Realm State ↔ Main/Frame authority separation
Realm State listener/binding failure isolation
RealmStateAuthority fatal → Main terminal/unwind ownership
Save/Load remains business workflow, not State bootstrap
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
Realm State in-process call vs private message binding
Desktop FSDB/HTTP vs PWA storage/fetch mechanics
private Config acquisition
private browser resource binding
```

不同 physical validation/copy pass 数量可以接受，只要 logical identity、limits、detachment、evidence semantics等价。

---

## 11. No Platform Mega-abstraction

除真实 consumer 要求外，不建立：

```text
UniversalPlatform
RendererHosting service framework
ContentService universal port
RealmStateManager / StateServiceLocator
NamespaceRegistry / CollectionManager
GenericTransactionCoordinator
SessionCoordinator application authority
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

需要多个 concrete platform 实现同一真实 narrow seam 时，再最小 materialize port。Realm State跨平台共享的是 logical contract，不要求一个 universal physical transport abstraction。

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

Realm State 是独立 implementation/qualification track；当前 subject/evidence 见 Realm State v1 ledger，且不 retroactively 修改既有 M10–M15 claims。

Current status summary见 [`phase-1-delivery-plan.md`](../30-implementation/phase-1-delivery-plan.md)。M15 physical composition remains frozen, while its current-subject formal status is Requalification Pending；historical direct-Electron evidence does not own the claim。

---

## 13. Final Invariants

1. Launcher/launch profile拥有 Runtime executable preparation；presentation startup独立；
2. Game Entry validation包含 optional Realm State document state；Launcher在 PREPARE 内投影 `PreparedRealmStateDefinition`，与 `LogicalGameBootstrap` 平级；
3. Game Package document type不是 RealmStateAuthority bootstrap ABI；
4. RealmStateAuthority在第一项 business Runtime side effect前 READY，且只从 prepared Game baseline bootstrap；
5. Save/Load/restore 是 business workflow，不是 Realm State bootstrap/lifecycle；
6. Platform/Session composition 是 physical construction/binding/disposal/wiring boundary，不是 Main/Render/Realm State/business authority；
7. Hostra shell是 canonical Desktop Electron/BrowserWindow/direct-subprocess owner；
8. LoomRealm Desktop是 plain Node HOSTRA_SUBCMD，只拥有 LoomRealm physical realizations；
9. Hostra RPC保持 host-control only；Realm State不得复用 Hostra RPC作为 generic application bus；
10. Control、Renderer Data、Realm State、Content保持 capability/authority separation；
11. Realm State operations不依赖 Frame/Activation/InputTarget，也不受 Frame mutation gate支配；
12. Runtime-scoped RealmStateClient logical lifetime独立于 replaceable physical State binding；
13. Data Broker仍只拥有 Data candidate/current，不拥有 Realm State；
14. top-level document/bootstrap lifecycle不得被 ordinary page fetch/subframe触发；
15. reload replaces Renderer identity；Data-only reconnect preserves Renderer identity；二者都不 reset Realm State；
16. RealmStateAuthority MAY 与 Main 同进程/Worker但逻辑 owner分离；fatal只报告 Session-fatal fact，Main唯一提交 terminal/unwind；
17. Realm State listener failure / binding loss不得自动升级 Runtime/Frame/Session failure；
18. binding recovery不得自动 replay ambiguous mutation；old subscription必须 fresh subscribe + fresh baseline；
19. Realm State只承载 Session 跨 Subsystem authoritative mutable business facts，不吸收 local/cache/render/input/platform/content/persistence policy；
20. Hostra/PWA允许不同 physical realization，但保持 Realm State logical/business outcome；
21. 不为 Realm State materialize generic StateManager/CollectionManager/transaction coordinator、SessionCoordinator authority 或 universal transport framework。
