# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M9/M11/M12/M13/M14/M15 current qualification Closed；Realm State v1 implemented / qualified；Session Events v1 logical semantics + current runtime integration profile implemented / qualification pending；PWA M16/M17 implemented with independent gate
> 主要定义：跨平台 physical composition、Launcher PREPARE、Runtime/Renderer/Data/Content/Realm State/Session Events/Web presentation placement  
> 依赖：[系统架构总览](./system-overview.md)、[Realm State](./realm-state-system.md)、[Session Events](./session-events-system.md)、[渲染系统](./rendering-system.md)  
> 正式化：[Realm State v1](../15-contracts/realm-state-v1.md)、[Session Events v1](../15-contracts/session-events-v1.md)、[Session Events Runtime Integration Profile v1](../15-contracts/session-events-runtime-profile-v1.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)  
> 相关：[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
> 最近复核：2026-10-13

本文回答：**同一套 LoomRealm logical application semantics 如何在 Hostra / PWA 上被完整准备、组合并运行。** Platform 是 physical composition boundary，不是 universal application authority/service locator。

Milestone live status 由 [`roadmap.md`](../30-implementation/roadmap.md) 汇总；M11/M14/M15 formal status/evidence 分别只由对应 qualification ledger 维护。M15 exact physical realization 由 ADR 0034 + Desktop composition SSOT 拥有，formal closure 只由 M15 ledger 签署。

---

## 1. Core Boundary

```text
Platform-neutral logical roles
┌──────────────────────────────────────────────────────┐
│ Main   Realm State   Session Events   Renderer       │
│ Subsystem                 Content consumers           │
└──────────────────────────────────────────────────────┘
                         ▲
                 narrow capabilities
                         │
               Hostra               PWA
```

Logical ownership：

```text
Main
    Control Authority

RealmStateAuthority
    Session shared mutable business-state authority

SessionEventHub
    Session-scoped transient routing / bounded delivery mechanics
    no business truth ownership

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

Reusable game libraries/concrete games位于 Platform 逻辑之上；Platform app不拥有 map/menu/dialogue 等业务语义，也不解释 Realm State namespace/value 或 Session Event channel/type。

---

## 2. Runtime PREPARE vs Session State/Event Bootstrap vs Presentation Startup

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

Session Events v1 不引入 Game Entry event history、channel registry 或 initial subscription document；SessionEventHub 是 PREPARE 成功后由 Session composition 构造的 Session service。

PREPARE complete 后，Session composition MUST 在第一项 business Runtime side effect前完成：

```text
physically construct fresh RealmStateAuthority from PreparedRealmStateDefinition
→ install immutable prepared Game baseline
→ derive initial materialized membership
→ revision/version = 0
→ Realm State READY

physically construct fresh SessionEventHub
→ install bounded routing/subscription infrastructure
→ Session Events READY

create Runtime-scoped RealmStateClient capabilities
create Runtime-scoped SessionEventClient capabilities
install latched sessionEventsFatal source in Main-facing platform view
```

Realm State bootstrap只有 prepared Game baseline 这一种特殊 value source。Save/Load/restore 不属于 Session State bootstrap；如果业务要恢复持久化数据，由 Subsystem 在 Runtime 启动后通过普通 RealmStateClient read/commit 完成。

SessionEventHub没有 history/bootstrap value source；READY只证明它能保持 v1 channel/source/subscription/delivery/failure invariants。

这里的 Session composition 只拥有 physical ordering/wiring/disposal；它 MUST NOT 解释 State values、Event business semantics、拥有 OCC/revision，或创建第二套 Session/Runtime/Frame authority。

因此：

```text
first business Runtime side effect
    ⇒ PREPARE complete
    ∧ Realm State READY
    ∧ SessionEventHub READY
    ∧ required Runtime State/Event capability binding usable
```

Web presentation 不进入 executable join 或 State/Event Session service bootstrap：

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

Current Session Events v1 product profile：

```text
Hostra Desktop
    Hostra shell owns Electron / BrowserWindow / direct HOSTRA_SUBCMD process
    LoomRealm Desktop child owns LoomRealm physical services
        Main realization
        RealmStateAuthority realization
        SessionEventHub realization
        RuntimeHosting
        Data/Control/Content bindings
        State/Event Runtime bindings

PWA
    browser Window/Worker environment owns browser physical containers
    Session Worker owns current LoomRealm Session services
        Main
        RealmStateAuthority
        SessionEventHub
        RuntimeHosting
    Dedicated Subsystem Workers own Runtime-local clients
```

Main 唯一拥有 Session Control authority。RealmStateAuthority 唯一拥有 Session shared mutable business facts。SessionEventHub只拥有 routing/delivery mechanics。Subsystem/game library拥有 business Render authority。Renderer拥有 current replica与 LoomRealm-managed projection mutation。

Architecture remains more general than the current profile：RealmStateAuthority / SessionEventHub MAY in a later profile split from Main or from each other，but logical owner/API/lifetime semantics MUST remain separated。Current implementation Agent MUST NOT choose a different placement for Session Events v1 without revising the Runtime Integration Profile first。

Platform physical ownership不产生第二份 application authority。

Platform/Session composition MUST NOT：

```text
interpret Realm State namespace/value business semantics
interpret Session Event channel/type business semantics
own Realm State revision/version/OCC/retry policy
invent Event retry/replay/source/routing semantics outside frozen contract
inspect Main Frame/Activation to authorize State/Event operation
turn ordinary State/Event binding loss into Runtime/Session transition
interpret Save/Load workflow as Realm State bootstrap policy
create hidden State+Event transaction/order
become a generic SessionCoordinator / StateManager / EventBusManager / service locator
```

---

## 4. Data / Content / Realm State / Session Events Boundaries

Renderer Data provisioning只实现 current Renderer + Subsystem physical carrier；provisioning/settlement不是 Content、Realm State 或 presentation loader channel。PWA Runner provisioning control MAY transfer/ack a dedicated Session Events MessagePort as frozen by the Runtime Integration Profile，but Session Event business traffic itself is not provisioning traffic。

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

Session Events：

```text
SessionEventHub
→ Runtime-scoped SessionEventClient logical capability
→ replaceable physical Event binding
→ Subsystem business code
```

State/Event MUST NOT 复用：

```text
Renderer Data application profile
frame.call()
Content HTTP logical API
Main business fields
Frame/Activation mutation gate
```

Logical architecture允许不同 bounded physical bindings。Current v1 Session Events realization已经冻结为：

```text
Hostra
    per Runtime dedicated private Events WebSocket
    endpoint via LOOMREALM_HOSTRA_SESSION_EVENTS_ENDPOINT

PWA
    per Runtime dedicated private Events MessagePort
    transferred/acked via Runner provisioning control
    Event protocol payload stays on the dedicated port
```

Physical binding差异不得改变 State logical semantics，或 Session Events exact-channel/source/publish-evidence/subscription/serial-delivery/terminal semantics。

State 与 Events **logical contract** MAY in a future profile multiplex 同一 Session-service physical carrier：

```text
Runtime
    │
    ▼
shared Session-service carrier
    ├── Realm/Shared State logical binding
    └── Session Events logical binding
```

核心规则：

```text
shared carrier
!= shared logical protocol
!= shared authority
!= shared ordering domain
```

Multiplexing必须保持独立 protocol discriminator/correlation、flow-control accounting、failure/evidence、subscription identity；Event/Diagnostics traffic MUST NOT indefinitely starve State。

Current Hostra/PWA Session Events v1 qualification does **not** require multiplexing；implementation Agent MUST use the dedicated carrier profile until a later physical profile deliberately replaces it。

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

RealmStateAuthority fatal 是 Session-fatal fact；Platform只负责把该 fact物理传递/wire 给 Main。**Main 唯一提交 Session terminal 与 Runtime/Frame unwind**。

### 4.2 SessionEventClient vs physical binding

`SessionEventClient` 同样是 Runtime-scoped logical capability，不等于 one Process/Worker/socket/MessagePort。

```text
live Runtime-scoped SessionEventClient
    ├─ binding A
    │    ↓ lost
    └─ binding B
```

No usable binding：

```text
new publish   → BINDING_UNAVAILABLE / known not accepted / no wait
new subscribe → BINDING_UNAVAILABLE / no handle / no wait
```

Binding loss：

```text
old subscriptions → closed(reason="binding-terminal")
logical client MAY remain live if Runtime live
no Runtime/Frame/Session failure by itself
no Hub reset
no replay
no old subscription reattach
```

Fresh binding MAY serve the same live client。Business must fresh subscribe。Dispatched publish definitive result lost = `OUTCOME_UNKNOWN`；no automatic retry。

Subscribe candidate若在成功 result author-visible 前 terminal，不返回 already-terminal handle：overflow→`LIMIT_EXCEEDED`，binding terminal→`BINDING_UNAVAILABLE`，client/Hub terminal→`TERMINAL`。

Runtime terminal → client terminal + subscriptions `client-terminal`。Hub/Session terminal → subscriptions `hub-terminal`。

SessionEventHub fatal：Hub self-terminal first → latch/report through `MainSessionEventsFatalSource` → Main owns Session terminal/unwind。

When browser Realm executes business code, trusted Content/Data/State/Event physical clients保留 private credentials/endpoints/ports于 lexical/bound capabilities，而不是在 business bootstrap后动态读取可被替换的全局 primitive。

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

Presentation startup MUST NOT become Realm State authority or Session Events Hub bootstrap；这些 Session services READY 已属于 business Runtime bootstrap barrier。

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

Session Event也不直接投影 Renderer。业务如果需要 presentation effect，必须显式通过自己的 RenderDomain / Render Event 更新 presentation semantic，而不是 Event Hub自动桥接。

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

Session Events也不把 map/dialogue/battle channel/type vocabulary提升为 Platform semantics；channel/type由 business code约定，Platform只执行 frozen logical routing contract。

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
├─ RealmStateAuthority
├─ SessionEventHub
├─ RuntimeHosting
│   └─ Runner
├─ Desktop Data Broker
├─ Content + trusted shell
├─ Renderer Control loopback carrier
├─ Data settlement loopback carrier
└─ Runtime Session-service bindings
```

Frozen M15 external host baseline由 current recomposition SSOT拥有：

```text
hostra@1.0.1-beta.1
source d863beab3c59c3bd4f271514a228fa8fee0bf5b6
bundled Electron 44.1.1
shutdown grace 1000 ms
```

Realm State placement shown here is the current implemented v1 realization。SessionEventHub placement + dedicated Runtime Events WebSocket profile are frozen target design but尚未实现/qualified；它们不 retroactively 扩张历史 M15 evidence。

Per Runtime current Session Events binding：

```text
RuntimeHosting creates dedicated loopback Events WS listener before Runner spawn
→ host-owned 256-bit capability path
→ synthesize LOOMREALM_HOSTRA_SESSION_EVENTS_ENDPOINT
→ Runner copies + scrubs env
→ required Event binding usable
→ only then business Definition import
```

This WS is distinct from Runtime Control and Realm State WS。Binding source identity comes from the launch Runtime `subsystemKey`, not publisher payload。

Hostra RPC只用于 existing host-control operations：

```text
openWindow
closeWindow
hostra.event
```

它不是 Renderer Control/Data/Content/Realm State/Session Events application bus。

历史 ADR 0033 的 `Electron main → ELECTRON_RUN_AS_NODE Runner` 只描述 direct-Electron embedding compatibility；ADR 0034 已 supersede 该 embedding assumption for canonical M15。

### Document/bootstrap physical facts

Hostra BrowserWindow导航到 LoomRealm loopback trusted shell。M15保持：

```text
same Hostra physical Window across reload
fresh logical Renderer/document per valid reload
fresh Control/Data/Content document material
same Main/Runner/game/Realm State/SessionEventHub Session truth
```

Main Control acquire与 top-level document navigation通过 bounded rendezvous收敛；普通 fetch/XHR/subframe/resource request不能建立新的 Renderer document lifetime，也不能建立/替换 RealmStateAuthority / SessionEventHub。

### Data reconnect physical fact

```text
reload
    → fresh Renderer identity

same-generation Data-only reconnect
    → same Renderer Control participant
    → fresh Data physical pair only
    → fresh RendererDataBinding.acquire()
```

Data-only reconnect不得建立第二个 Renderer currentness universe，也不得 reset State/Events。

### State/Event binding reconnect physical fact

Realm State binding可以 independently reconnect：old subscriptions terminal → same logical client → fresh binding → fresh subscribe + State baseline；no ambiguous mutation replay。

Session Events binding可以 independently reconnect：

```text
Event binding A lost
→ old subscriptions binding-terminal
→ same Runtime-scoped SessionEventClient remains logically live
→ fresh binding B
→ future publish/subscribe may proceed
→ business fresh subscribe
→ no replay
```

这些 reconnect不产生新 Runtime/Frame/Session identity。

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
SessionEventHub fatal report
startup partial failure
```

State/Event service fatal 的 logical policy都是 service self-terminal → report Session-fatal fact to Main；Session Events exact seam是latched `sessionEventsFatal`。Main提交 Session terminal / Runtime/Frame unwind，concrete Desktop再将 committed terminal汇入同一个 physical cleanup owner chain。Service/Platform不建立第二份 process/Runtime termination authority。

LoomRealm通过 existing `runMain` + RuntimeHosting owner chain收敛 Runner，finally-like释放自己的 physical resources；不建立第二份 direct Runner kill authority。

---

## 9. PWA Realization

Current Session Events v1 physical profile：

```text
Browser Window
    presentation/browser-only adapters

Session Worker
    Main
    RealmStateAuthority
    SessionEventHub
    RuntimeHosting

Dedicated Subsystem Worker × N
    Runtime-scoped RealmStateClient
    Runtime-scoped SessionEventClient
```

Per Runtime Event binding：

```text
Session Worker creates dedicated Event MessageChannel
→ Hub binds port1 to subsystemKey
→ provisioningPort transfers port2 using session-events/install
→ Runner validates/attaches same Runtime-scoped client
→ session-events/result ACK
→ only then business Definition import
```

`PwaRunnerBootstrapV1` remains closed and unchanged。`provisioningPort` only transfers/acks the capability；Event publish/subscription/delivery traffic uses the dedicated Event port。

Architecture MAY later split Hub into another Worker or introduce State/Event multiplexing, but current v1 implementation Agent MUST follow this frozen profile until a later profile revision deliberately changes it。

无论 future placement，必须保持：

```text
one Session one logical RealmStateAuthority
one Session one logical SessionEventHub
Runtime-scoped State/Event client lifetime
replaceable/fenced physical bindings
State OCC/evidence/subscription semantics
Event exact-channel/source/publish-evidence/serial-delivery/closed semantics
```

PWA State/Event binding loss不能自动取得 Runtime/Session supervision authority。State recovery fresh baseline；Event recovery fresh subscribe/no replay；ambiguous mutation/publish都不得 auto retry。

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
Session Event channel/type/source validation semantics
Session Event exact-channel routing / multiplicity / self-delivery
Session Event publish evidence incl OUTCOME_UNKNOWN
Session Event subscribe live-handle + closed terminal semantics
Session Event pre-visible terminal establishment rejection semantics
Session Event stable SessionEventError failure surface
Session Event one-subscription-one-serial-listener lane
Session Event bounded overflow limits and no-binding fail-fast
State/Event ↔ Main/Frame authority separation
Authority/Hub fatal → Main terminal/unwind ownership
Save/Load remains business workflow
Runtime/Frame/Renderer/Data/Input/Render contracts
Content logical identity/version/errors
Web Presentation semantics
game-library business rules
business-observable result
```

Current physical differences：

```text
Hostra Events WebSocket vs PWA Events MessagePort
Process tree vs Worker tree
Desktop FSDB/HTTP vs PWA storage/fetch mechanics
private Config acquisition
private browser resource binding
```

Architecture-level future differences MAY also include Event Hub process/Worker split or State/Event carrier multiplexing, but those are not implementation-time choices for the current v1 profile。

不同 physical validation/copy pass 数量可以接受，只要 logical identity、limits、detachment、source authenticity、evidence semantics等价。

---

## 11. No Platform Mega-abstraction

除真实 consumer 要求外，不建立：

```text
UniversalPlatform
RendererHosting service framework
ContentService universal port
RealmStateManager / StateServiceLocator
EventBusManager / ChannelRegistry
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
generic local web-server/WebSocket/message-broker framework
```

需要多个 concrete platform 实现同一真实 narrow seam 时，再最小 materialize port。State/Events跨平台共享的是 logical contract，不要求一个 universal physical transport abstraction。

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

Realm State 是独立 implementation/qualification track；Session Events 同样是独立 implementation/qualification track。Frozen Session Events contract/runtime profile 不 retroactively 修改既有 M10–M17 claims。

Current status summary 见 [`roadmap.md`](../30-implementation/roadmap.md)。M15 physical composition remains frozen and implemented, and its current formal qualification is Closed；historical direct-Electron evidence does not own the claim。M16/M17 PWA physical profile is implemented and covered by its independent qualification gate；Session Events additive profile is implemented and awaits exact-subject qualification evidence。

---

## 13. Final Invariants

1. Launcher/launch profile拥有 Runtime executable preparation；presentation startup独立；
2. Game Entry validation包含 optional Realm State document；Session Events不增加 event history/channel registry Game document；
3. Game Package document type不是 RealmStateAuthority/Event Hub bootstrap ABI；
4. RealmStateAuthority + SessionEventHub在第一项 business Runtime side effect前 READY；
5. current Session Events profile还要求 required Runtime Event binding 在 business Definition import前 usable；
6. Save/Load/restore 是 business workflow，不是 State/Event service lifecycle；
7. Platform/Session composition 是 physical construction/binding/disposal/wiring boundary，不是 Main/Render/State/Event business authority；
8. Hostra shell是 canonical Desktop Electron/BrowserWindow/direct-subprocess owner；
9. LoomRealm Desktop是 plain Node HOSTRA_SUBCMD，只拥有 LoomRealm physical realizations；
10. Hostra RPC保持 host-control only；State/Event不得复用 Hostra RPC作为 generic application bus；
11. Control、Renderer Data、Realm State、Session Events、Content保持 capability/authority separation；
12. State/Event operations不依赖 Frame/Activation/InputTarget，也不受 Frame mutation gate支配；
13. Runtime-scoped State/Event logical clients独立于 replaceable physical bindings；
14. Event source由Runtime binding派生，channel exact routing，type不参与v1 filtering；
15. Event subscribe只返回live handle；pre-visible terminal rejects，one subscription one serial lane，terminal通过closed可观察；
16. Event failure surface稳定为SessionEventError/code/path；
17. Event overflow显式terminal，不retroactively fail accepted publisher；
18. Data Broker仍只拥有 Data candidate/current，不拥有 State/Event services；
19. reload replaces Renderer identity；Data-only reconnect preserves Renderer identity；二者都不 reset State/Event；
20. Authority/Hub物理可co-locate但logical owner分离；Hub fatal通过latched sessionEventsFatal报告，Main提交terminal/unwind；
21. binding recovery不得 auto replay ambiguous mutation/publish；old subscriptions fresh subscribe；
22. State只承载 current shared mutable facts；Events只承载 transient notification；
23. logical architecture MAY later multiplex State/Events，但 current Hostra/PWA v1 Session Events carriers are dedicated；
24. Hostra/PWA保持同一 Event logical/business outcome while using WS vs MessagePort；
25. 不为 State/Events materialize generic StateManager/EventBusManager/ChannelRegistry/SessionCoordinator 或 universal transport framework。
