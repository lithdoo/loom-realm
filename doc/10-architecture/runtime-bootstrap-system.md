# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving；Realm State bootstrap semantics synchronized / not implemented / not qualified；Session Events v1 bootstrap/lifetime + current runtime integration profile implemented / qualified
> 主要定义：Launcher-owned Game/Platform PREPARE、Main/Realm State prepared projection、Realm State + SessionEventHub READY barrier、Runtime Runner / Renderer 的逻辑启动顺序、Control/Data/State/Events 建立关系与 Platform provisioning  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[Realm State](./realm-state-system.md)、[Session Events](./session-events-system.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 正式化：[Game Package v1](../15-contracts/game-package-v1.md)、[Realm State v1](../15-contracts/realm-state-v1.md)、[Session Events v1](../15-contracts/session-events-v1.md)、[Session Events Runtime Integration Profile v1](../15-contracts/session-events-runtime-profile-v1.md)、[Hostra Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[PWA Launcher Profile v1](../15-contracts/pwa-launcher-profile-v1.md)、[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-10-13

---

## 1. Main vs Realm State vs Session Events vs Platform

```text
Main
    owns logical Session Control / Runtime / Frame / Data authority

RealmStateAuthority
    owns Session shared mutable business facts

SessionEventHub
    owns Session-scoped transient routing / bounded delivery mechanics
    no business truth ownership

Matching Platform Launcher
    owns Game Entry consumption + current executable PREPARE

Platform / Session Composition
    realizes physical Runner/Renderer/connection/content/state/event bindings
    owns construction order / wiring / disposal only
```

Main 不直接依赖 Node/Worker/WebSocket/MessagePort/module resolver，也不依赖 `@loomrealm/game-package`、concrete launcher 或 Realm State business document。

RealmStateAuthority / SessionEventHub MAY 与 Main 同进程/Worker，但不是 Main-owned business fields。Platform/Session composition 即使 physically owns these components，也不得成为第三 application authority。

---

## 2. Launcher-owned Game Entry Preparation

Main 不读取 Game Entry。

Runtime-product bootstrap：

```text
Game source / installation
→ session-scoped concrete Platform.prepareGame(...)
    → matching Launcher component
        → @loomrealm/game-package parse/validate
        → validate optional Realm State state.records document
        → current Platform Launch Manifest parse/validate
```

Game Entry v1 common facts：

```text
formatVersion
state? { records[] {namespace,key,value} }
initial.subsystem
initial.input
subsystems[] {key}
```

完整 Subsystem key set 在任何 executable planning/Runtime side effect前校验。Realm State Record identities/values在同一 common Game Entry validation阶段校验，但不参与 executable key-set join。

```text
Subsystem key = logical Runtime/application identity
RealmStateKey = shared business Record identity
```

Game Entry不声明 executable module、Realm State physical endpoint、Session Events physical endpoint 或 runtime version/revision metadata。

Game Package 的 `state` 是 document representation，不是 RealmStateAuthority runtime bootstrap ABI。

Session Events v1 不引入 Game Entry event history、channel registry 或 initial subscription document；Event Hub 是 Session service，不需要 Launcher projection业务事件数据。

---

## 3. Complete PREPARE Closure

Session physical/business bootstrap前，concrete Platform `prepareGame()` MUST 已通过 matching Launcher component 完成：

```text
Launcher component
    Game Entry validation including optional state document
    → current Platform Launch Manifest validation
    → exact Game↔Platform Subsystem key-set join
    → resolve every required platform implementation
    → validate current Platform hosting/security capability
    → freeze immutable PlatformLaunchPlan
    → project/freeze LogicalGameBootstrap
    → project/freeze PreparedRealmStateDefinition

Concrete Platform
    → install/freeze PlatformLaunchPlan internally
```

任何 PREPARE error：

```text
MUST NOT create business Runtime Container
MUST NOT import business Definition Module
MUST NOT establish Runtime Control
MUST NOT permit business Runtime side effect
```

Phase 1 all declared Subsystems eager + required。

Session Events不改变 PREPARE document projection；它只增加 PREPARE 成功后的 Session service construction/READY barrier。

---

## 4. Prepared Bootstrap Installation

Prepared current-platform result 概念上包含三个正交 pieces：

```text
LogicalGameBootstrap
    → Main-visible logical topology / initial Frame input

PreparedRealmStateDefinition
    → detached/immutable RealmStateAuthority bootstrap baseline

prepared concrete Platform instance
    → owns PlatformLaunchPlan privately
    → exposes narrow Main-facing capability view
    → owns physical Realm State + Session Events Runtime-binding realization
```

概念 shape：

```ts
interface PreparedLogicalGame {
  readonly main: LogicalGameBootstrap;
  readonly state: PreparedRealmStateDefinition;
}
```

Launcher owns the projection：

```text
ValidatedGameEntryV1.state
→ PreparedRealmStateDefinition
```

RealmStateAuthority MUST NOT consume `GameEntryV1` / `RealmStateGameDefinitionV1` as its runtime bootstrap ABI。

Composition sequence：

```text
platform.prepareGame(source)
→ Launcher PREPARE
→ platform installs immutable PlatformLaunchPlan
→ returns PreparedLogicalGame {main,state}

select New Game or validated Load sparse current seed
→ physically construct fresh RealmStateAuthority from prepared.state
→ install prepared State immutable baseline
→ apply sparse current overrides
→ revision/version = 0
→ Realm State READY

→ physically construct fresh SessionEventHub
→ install bounded routing/subscription infrastructure
→ Session Events READY

→ install private Runtime State client-binding factory
→ install private Runtime Event client-binding factory
→ install latched Session Events fatal source into Main-facing platform view

runMain({ bootstrap: prepared.main, platform })
```

SessionEventHub has no event history/bootstrap payload。READY means it can preserve v1 channel routing、subscription lifetime、bounded serial delivery and terminal semantics。

Main 不调用 `prepareGame()`；Main 只消费当前 Platform 对 Main 暴露的窄 capability view与 `prepared.main`。

Main 安装：

```text
LogicalGameBootstrap.subsystemKeys
→ complete logical Subsystem Registry

LogicalGameBootstrap.initial
→ initial Frame target/input source
```

Main 不接收：

```text
GameEntryV1 / ValidatedGameEntryV1
formatVersion
RealmStateGameDefinitionV1
PreparedRealmStateDefinition / initial Records
PlatformLaunchPlan
module/path/URL
raw Platform manifest
Session Event channel/subscription state
```

必须保持：

```text
first business Runtime side effect
    ⇒ PREPARE complete
    ∧ Realm State READY
    ∧ SessionEventHub READY
```

Session/Platform composition 在此只拥有 physical construction/order/binding/disposal，不拥有 Main control state、Realm State Record/OCC semantics 或 Session Event business semantics。

Pre-READY State/Event service construction failure 是 Session bootstrap failure，不要求向一个尚未成为 live lifecycle owner 的 Main伪造 fatal report。

---

## 5. Logical Runtime Bootstrap

每个 required Subsystem：

```text
Main creates current Launch Attempt for key
→ BootstrapTokenGenerator.generate()
→ Main validates/registers fresh bootstrap credential
→ RuntimeHosting.launch({subsystemKey:key, bootstrapToken})
→ RuntimeHosting lookup frozen PlatformLaunchPlan[key]
→ Platform creates Host-owned Runner Container
→ Platform/Runner installs exact Runtime-scoped RealmStateClient binding
→ Platform/Runner installs exact Runtime-scoped SessionEventClient binding
→ required initial State/Event bindings are usable
→ Runner loads exact planned Definition Module
→ Runner constructs remaining Subsystem-facing capabilities
→ Runtime Control carrier obtained
→ subsystem.hello
→ Main binds connection to key
→ identified
→ optional initializing
→ definition.initialize
→ status(ready)
```

Realm State / Session Events bindings MUST be available **before Definition Module import/initialization can produce business side effects** and before business code can observe `SubsystemScope.state` / `SubsystemScope.events`。

Current Session Events physical profile：

```text
Hostra
    dedicated private Events WebSocket per Runtime
    endpoint delivered through host-owned LOOMREALM_HOSTRA_SESSION_EVENTS_ENDPOINT

PWA
    dedicated private Events MessagePort per Runtime
    transferred/acknowledged through Runner provisioning control
    Event business traffic never uses provisioningPort
```

```text
PREPARE valid
!= Realm State READY
!= SessionEventHub READY
!= process/Worker created
!= module loaded
!= connected
!= identified
!= ready
```

但 business Runtime side effect requires PREPARE + State READY + Event Hub READY + required initial Runtime State/Event binding usable。

Definition Module actual import/default-export ABI validation可发生在 trusted Runner；失败使 required bootstrap失败并统一 cleanup。

---

## 6. Runner Boundary

```text
Hostra Node Runner / PWA Worker Runner
        │
        ▼
M6 RuntimeControlBinding
M8+ SubsystemDataBinding
M12+ ContentClient
RealmStateClient
SessionEventClient
        │
        ▼
@loomrealm/subsystem/host
        │
        ▼
Platform-planned Definition Module
```

Runner不创建 RealmStateAuthority / SessionEventHub，也不读取 Game Entry State document或 `PreparedRealmStateDefinition`。它只接收/构造 concrete composition 已绑定到 current Session services 的 Runtime-scoped client capabilities。

Definition Module 不读取 Game Entry/Launch Manifest，不接触 physical bootstrap material，也不创建第二 Runtime/State authority或 Event Hub。

Runner/Subsystem host MUST NOT require Frame/Activation identity to install or authorize RealmStateClient / SessionEventClient operations。

Session Event business-visible `source.subsystemKey` MUST derive from the binding's Runtime identity；business code不能提供/覆盖 source。

Current profile does not require State/Event carrier multiplexing：Hostra/PWA Session Events use dedicated Event carriers；future multiplexing requires a later physical profile and cannot change this author/Runner boundary。

---

## 7. Runtime `ready`

`ready` 只证明 Runtime required initialization完成并能承担 Runtime Control Profile角色。

不得推导：

```text
Renderer exists
DataAuthority exists
Data carrier current
Data provisioning offer happened
Frame/Render/InputTarget exists
```

Realm State / Session Events不同：

```text
business Runtime bootstrap began
    ⇒ Realm State was READY
    ∧ SessionEventHub was READY
    ∧ required RealmStateClient binding existed
    ∧ required SessionEventClient binding existed
```

但 `ready` 不代表某个 particular Realm State Record 被 materialized/modified/subscribed，也不代表某个 Session Event channel 已订阅。

Platform Data provisioning capability可以已安装，但“当前没有 Data offer”完全合法。

---

## 8. Runtime State Sources

```text
starting
    Main Launch Attempt + Platform launch intent

connected
    Main accepts Control carrier

identified
    successful subsystem.hello

ready
    valid subsystem.status(ready)

stopping
    Main shutdown intent

stopped
    Platform/Supervisor observed actual Runtime termination

failed
    Control/Runtime failure classification
```

module path/PID/Worker handle/launchId都不是 protocol identity。

Realm State Record version/global revision、Session Event internal routing/subscription ids也不是 Runtime lifecycle identity。

---

## 9. Bootstrap Failure / Restart

以下任一使 required Runtime bootstrap失败：

```text
Runner/container creation failure
required Runtime-scoped RealmStateClient binding unavailable before business bootstrap
required Runtime-scoped SessionEventClient binding unavailable before business bootstrap
planned module load/default-export ABI failure
Control carrier/hello failure
Runtime cannot become ready
unexpected Runtime termination
```

Phase 1 all-required → whole Game Bootstrap失败并统一 cleanup。

RealmStateAuthority fatal / SessionEventHub invariant fatal 是 Session-fatal condition，不作为“仅重启一个 Runtime”恢复点。Service先 self-terminal，再报告；Main/Session lifecycle owner提交 Session terminal/unwind。

SessionEventHub invariant fatal 报告通过 `MainSessionEventsFatalSource` 的 latched one-shot seam；composition implementing Session Events 必须在 `runMain()` 前提供该 source。Pre-READY Hub construction failure 不走该 live-Hub seam。

Platform MUST NOT automatic restart。新 Runtime必须 fresh Launch Attempt/token/Runner/Control lifetime + fresh Runtime-scoped State/Event client bindings。

---

## 10. Renderer Bootstrap

```text
Main establishes Renderer intent
→ Platform RendererHosting realizes current participant
→ RendererControlBinding supplies carrier
→ renderer.hello
→ current full Main Authority Snapshot
```

Snapshot：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

不携 endpoint/ticket/Port/provisioning handle/module target，也不携 Realm State Records/revision/client material或 Session Event channel/subscription material。

Renderer v1 不直接成为 Realm State / Session Events client。

---

## 11. DataAuthority / Profile

当前 Main可发布：

```text
DataAuthority(S,G,"loomrealm.renderer-data/1")
```

Data Profile v1 baseline：

```text
Connection 1 + User Input 1 + Render Update 1
```

Viewport等 add-only child revision仍属于 Renderer Data plane演进。

Profile改变是 authority replacement，必须 fresh generation。

```text
DataAuthority exists != Data carrier current
DataAuthority exists != Realm State authority/currentness
DataAuthority exists != SessionEventHub/client currentness
```

Realm State global revision、Session Event channel/source/subscription identity不使用 Data generation/profile。

---

## 12. Data Broker Establishment

```text
Main current DataAuthority(S,G,P)
→ Platform DataConnectionBroker
→ provision matching Renderer + Subsystem endpoints
→ bind both to current Session/Renderer/S/G/P
→ install at most one current Data Connection
```

Broker不拥有 generation/profile，也不拥有 Realm State binding/authority或 Session Event binding/Hub。

---

## 13. Hostra Late Data Provisioning

Node Runtime 可能 ready 很久后才获得 DataAuthority。

```text
Broker
→ Host-owned Runner Provisioning IPC
→ one-time Data endpoint/ticket for S/G/P
→ Runner establishes Data WebSocket
→ SubsystemDataBinding yields {G,P,carrier}
→ SDK DataPlane installs current
```

```text
Provisioning != Runtime Control
Provisioning != ready payload
Provisioning != Realm State binding
Provisioning != Session Events binding
```

Hostra Session Events binding 使用独立 host-owned Events endpoint/environment seam，不依赖 later Renderer Data provisioning。

RealmStateClient / SessionEventClient 是 Runtime bootstrap时已有的 Session capabilities，不依赖 later Renderer Data provisioning。

---

## 14. PWA Late Data Provisioning

```text
Broker creates MessageChannel
→ bind S/G/P
→ transfer one Port to Renderer
→ transfer one Port through Worker provisioning path
→ RendererDataBinding / SubsystemDataBinding install current carrier
```

Port transfer 是 Platform Data mechanism；Data application unit仍是 JSON text string。

Current Session Events profile also uses the **provisioning control seam only to transfer/ack a dedicated Event MessagePort**：

```text
session-events/install {requestId,subsystemKey,bindingId,port}
→ Runner attaches dedicated Event port
→ session-events/result
```

Event `publish` / subscription delivery / business payload MUST NOT travel on `provisioningPort`。`PwaRunnerBootstrapV1` remains closed and unchanged。

Future State/Event multiplexing MAY be defined by a later physical profile, but is not a current PWA v1 implementation choice。

---

## 15. Data Reconnect

同一 `S/G/P`：

```text
carrier A current
→ lost/retired
→ authority still current
→ Broker MAY provision fresh carrier B
→ B current
```

不：

```text
restart Runtime
resume Frame
replace RealmStateClient
replace SessionEventClient
reset RealmStateAuthority
reset/replay SessionEventHub
reuse old Input state
reuse old Render patch base
```

---

## 16. Fresh Data Baseline

fresh carrier：

```text
User Input
    remote Interest Registry empty
    retained Input State empty
    Subsystem republishes full desired Registry
    State fresh baseline / Event future-only

Render
    current Domain Registry
    fresh Snapshot each current Domain
    then Patch/Event
```

Data reconnect不重建 business capability objects，包括 ContentClient / RealmStateClient / SessionEventClient / Viewport object。

Realm State subscription recovery是独立机制：old State binding/subscription terminal → 如果 profile 支持恢复则建立 fresh logical client binding → fresh subscribe → fresh Realm State baseline；它不由 Data reconnect触发，也不 transparent reattach old identity。

Session Events subscription recovery同样独立：old Event binding loss → old subscriptions `binding-terminal` → 如果 profile支持则 fresh binding under same live logical client → future publish + fresh subscribe → no missed-history replay / no old reattach。

---

## 17. Initial Frame Startup

Initial Frame source来自已安装的 `LogicalGameBootstrap.initial`：

```text
Realm State READY
∧ SessionEventHub READY
→ Main reads LogicalGameBootstrap initial target/input
→ allocates starting Frame
→ frame.initialize ACK
→ fresh Activation
→ frame.activate ACK
→ commit active
→ publish InputTarget
```

Main 不回读 Game Entry document、PreparedRealmStateDefinition、Realm State business data 或 Session Event routing state。

Data current不是 Frame activate前置条件；active Frame + no Data/Interest 可以合法暂时没有 ordinary input。

Realm State / Session Events 已经是 business Runtime side effect前置条件；Frame handler 可以通过 Runtime-scoped `scope.state` / `scope.events` 使用它们，但 State commit / Event publish不消费该 Frame/Activation authority。

---

## 18. Renderer Reload

```text
Renderer Control lost
→ local InputTarget/DataAuthority invalid
→ old Data connections retired
→ fresh Renderer Control bootstrap
→ hello + current full Main Snapshot
→ Broker establishes current S/G/P carriers
→ Input/Render fresh baselines
```

Frame/Render authoritative lifecycles不由 reload推导。RealmStateAuthority/SessionEventHub、Runtime State/Event clients/subscriptions不因 Renderer reload自动替换；只有各自 binding/lifetime规则可改变它们。

---

## 19. Realm State Failure / Rebinding

Realm State ordinary operation：

```text
INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT
    caller-visible
    known no-commit
    != Runtime failure

OUTCOME_UNKNOWN
    caller reconciliation
    no automatic retry
```

Physical State binding loss：

```text
→ old subscriptions terminal(binding-terminal)
→ live Runtime-scoped logical client may remain live
→ no automatic Runtime failure
→ no Frame unwind
→ no Session terminal
→ no Authority reset
→ no transparent subscription reattach
```

如果 profile 支持恢复：

```text
fresh physical binding under same logical client
→ future operations
→ fresh subscribe + fresh baseline
```

RealmStateAuthority fatal：

```text
→ Authority self-terminal
→ report Session-fatal condition
→ Main / Session lifecycle owner commits Session terminal
→ existing cleanup owner chain converges
```

v1 不设计 transparent Authority restart / journal replay。

---

## 20. Session Events Failure / Rebinding

Ordinary Event operation：

```text
INVALID_REQUEST / LIMIT_EXCEEDED
    known not accepted
    caller-visible SessionEventError
    != Runtime failure

BINDING_UNAVAILABLE
    no usable binding
    fail fast / no wait / no reconnect queue

OUTCOME_UNKNOWN
    publish dispatched + definitive acceptance result lost
    no automatic retry
```

Subscribe establishment terminal-before-visible：

```text
overflow          → LIMIT_EXCEEDED / no handle
binding terminal  → BINDING_UNAVAILABLE / no handle
client/Hub term.  → TERMINAL / no handle
```

Physical Event binding loss：

```text
→ old subscriptions closed(reason="binding-terminal")
→ same Runtime-scoped SessionEventClient MAY remain logically live
→ no Runtime/Frame/Session failure by itself
→ no Hub reset
→ no missed-history replay
→ no transparent old-subscription reattach
```

Fresh binding：

```text
future publish may proceed
fresh subscribe required
source identity remains bound to same logical Runtime subsystemKey
```

Runtime terminal：

```text
Event client terminal
future publish/subscribe → TERMINAL
live subscriptions → client-terminal
```

SessionEventHub fatal：

```text
Hub self-terminal/inert
→ subscriptions hub-terminal
→ latch/report sessionEventsFatal
→ Main / Session lifecycle owner commits Session terminal/unwind
```

---

## 21. Shutdown

```text
Main establishes shutdown intent
→ subsystem.shutdown
→ SDK aborts instance/frame signals and terminals owned Realm State / Session Events observations
→ if shutdown accepted: bounded wait HostedRuntime.terminated
→ if no successful termination observation: requestTermination()
→ only HostedRuntime.terminated resolution is physical stopped evidence
```

如果 Runtime先进入 fatal failure，则走 Main-owned failure terminal path。

Main/Session owner提交 Session terminal 后同时使 RealmStateAuthority / SessionEventHub terminal；individual Runtime terminal只终止该 Runtime State/Event clients/subscriptions，不单独销毁 shared Session services。

---

## 22. Recommended Session Sequence

```text
1  create session-scoped concrete HostraPlatform / PwaPlatform
2  platform.prepareGame(source) delegates to matching Launcher component
3  Launcher validates Game Entry including optional Realm State state document
4  validate current Platform Launch Manifest
5  exact Game↔Platform Subsystem key-set join
6  resolve/preflight all required executable/security capabilities
7  freeze immutable PlatformLaunchPlan
8  project/freeze LogicalGameBootstrap + PreparedRealmStateDefinition
9  platform installs PlatformLaunchPlan privately; return PreparedLogicalGame {main,state}
10 select New Game or validated Load sparse current seed
11 composition constructs fresh RealmStateAuthority from prepared.state
12 install prepared Game baseline + sparse current overrides; revision/version=0
13 Realm State READY
14 composition constructs SessionEventHub; Session Events READY
15 install private Runtime State + Event binding factories + sessionEventsFatal source
16 runMain({bootstrap:prepared.main, platform, policy})
17 Main installs logical registry / initial input
18 for each required key: generator produces token; Main registers it
19 RuntimeHosting.launch({subsystemKey,bootstrapToken}) creates Runner lifetime + required initial State/Event bindings
20 Hostra: dedicated Event WS via env seam; PWA: dedicated Event MessagePort via provisioning control
21 only after required State/Event bindings usable, Runner imports planned Definition Module
22 HostedRuntime.runtimeControl.acquire() establishes Main carrier
23 hello authentication → identified → initialize → ready
24 Main starts initial Frame independently from Data
25 M7+ realize Renderer and publish Renderer Control authority
26 M8/M9+ publish DataAuthority / provision Data carriers
27 M10/M11+ establish Input/Render fresh baselines
28 Realm State operations proceed independently of Renderer Data and Frame/Activation currentness
29 Session Event publish/subscribe proceeds independently with exact-channel routing + serial subscription delivery
30 binding recovery remains per-plane; State fresh baseline / Event fresh subscribe, no replay
31 Main/Session terminal owner commits terminal; State/Event services terminal + graceful Runtime shutdown converge
```

具体 physical creation order 可不同，只要满足 causal/authority/PREPARE/State+Event READY/current integration profile boundary。

---

## 23. Final Invariants

1. Game Package validation由 matching Launcher在 Runtime-product path 内调用；
2. Main不读取 Game Entry、不依赖 Game Package/Realm State document；
3. PREPARE返回平级 `LogicalGameBootstrap` + `PreparedRealmStateDefinition`；Session Events无 Game history/bootstrap projection；
4. executable binding由 current Platform Launch Manifest拥有；
5. Game/current-platform Subsystem key set严格相等；State Records不参与 executable join；
6. complete PlatformLaunchPlan + Main/State prepared projections在 Runtime side effect前闭合；
7. RealmStateAuthority + SessionEventHub fresh construction/READY在任何 business Runtime side effect前完成；
8. Session/Platform composition只拥有 physical assembly/binding/disposal，不成为第三 application authority；
9. Main Runtime launch request仍只携 logical key + bootstrapToken，不携 State/Event payload/transport；
10. Host-owned Runner加载 plan-selected Definition Module并安装 composition-bound RealmStateClient + SessionEventClient；
11. current Session Events profile requires dedicated Hostra WS / PWA MessagePort binding before business Definition import；
12. launch != loaded != connected != identified != ready；
13. ready不要求 Renderer Data，但 business Runtime bootstrap要求 State/Event services READY；
14. Runtime identity由 logical subsystem key / hello binding建立；Event source由当前 Runtime binding派生；
15. State/Event operations不依赖 Frame/Activation/InputTarget；
16. stopped只来自 actual Runtime termination；no automatic Runtime restart；
17. Data Broker负责 Renderer Data carrier，不拥有 State/Event services；
18. provisioning不污染 Runtime/Renderer Control；PWA provisioning control仅转移/确认 dedicated Event port，不承载 Event业务流量；
19. same S/G/P可以 sequential Data reconnect；State/Event logical clients保持；
20. Data failure不等于 Runtime/Frame/State/Event failure；
21. ordinary State/Event conflict/listener/binding failure不等于 Runtime/Session failure；
22. Authority/Hub fatal先self-terminal，再通过 narrow fatal fact报告，由 Main/Session owner terminal/unwind；
23. State recovery fresh subscribe+baseline；Event recovery fresh subscribe/no replay；old identities不reattach；
24. Frame/Input/Render/Data/State/Events lifecycles相互独立但受 Main-owned Session terminal上界约束；
25. Hostra/PWA physical mechanism可不同，但 State/Event logical/business trace语义等价；future multiplexing requires later profile rather than implementation-time choice。
