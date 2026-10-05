# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving；Realm State bootstrap semantics synchronized / not implemented / not qualified  
> 主要定义：Launcher-owned Game/Platform PREPARE、Main/Realm State prepared projection、Realm State READY barrier、Runtime Runner / Renderer 的逻辑启动顺序、Control/Data/State 建立关系与 Platform provisioning  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[Realm State](./realm-state-system.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 正式化：[Game Package v1](../15-contracts/game-package-v1.md)、[Realm State v1](../15-contracts/realm-state-v1.md)、[Hostra Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[PWA Launcher Profile v1](../15-contracts/pwa-launcher-profile-v1.md)、[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-10-05

---

## 1. Main vs Realm State vs Platform

```text
Main
    owns logical Session Control / Runtime / Frame / Data authority

RealmStateAuthority
    owns Session shared mutable business facts

Matching Platform Launcher
    owns Game Entry consumption + current executable PREPARE

Platform Composition
    creates one session-scoped concrete Platform instance
    realizes physical Runner/Renderer/connection/content/state bindings
```

Main 不直接依赖 Node/Worker/WebSocket/MessagePort/module resolver，也不依赖 `@loomrealm/game-package`、concrete launcher 或 Realm State business document。

RealmStateAuthority MAY 与 Main 同进程/Worker，但不是 Main-owned business fields。

---

## 2. Launcher-owned Game Entry Preparation

Main 不读取 Game Entry。

Runtime-product bootstrap：

```text
Game source / installation
→ session-scoped concrete Platform.prepareGame(...)
    → matching Launcher component
        → @loomrealm/game-package parse/validate
        → validate optional Realm State state.records
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

Game Entry不声明 executable module、Realm State physical endpoint 或 runtime version/revision metadata。

---

## 3. Complete PREPARE Closure

Session physical/business bootstrap前，concrete Platform `prepareGame()` MUST 已通过 matching Launcher component 完成：

```text
Launcher component
    Game Entry validation including optional state
    → current Platform Launch Manifest validation
    → exact Game↔Platform Subsystem key-set join
    → resolve every required platform implementation
    → validate current Platform hosting/security capability
    → freeze immutable PlatformLaunchPlan
    → project/freeze LogicalGameBootstrap
    → project/freeze Realm State Initial Definition

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

---

## 4. Prepared Bootstrap Installation

Prepared current-platform result 概念上包含三个正交 pieces：

```text
LogicalGameBootstrap
    → Main-visible logical topology / initial Frame input

Realm State Initial Definition
    → Session RealmStateAuthority bootstrap baseline

prepared concrete Platform instance
    → owns PlatformLaunchPlan privately
    → exposes narrow Main-facing capability view
    → owns physical Realm State Runtime-binding realization
```

概念 shape：

```ts
interface PreparedLogicalGame {
  readonly main: LogicalGameBootstrap;
  readonly state: RealmStateGameDefinitionV1;
}
```

Composition sequence：

```text
platform.prepareGame(source)
→ Launcher PREPARE
→ platform installs immutable PlatformLaunchPlan
→ returns PreparedLogicalGame {main,state}

select New Game or validated Load sparse current seed
→ create fresh RealmStateAuthority
→ install prepared.state immutable baseline
→ apply sparse current overrides
→ revision/version = 0
→ Realm State READY
→ install private Runtime client-binding factory into session/platform composition

runMain({ bootstrap: prepared.main, platform })
```

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
RealmStateGameDefinitionV1 / initial Records
PlatformLaunchPlan
module/path/URL
raw Platform manifest
```

必须保持：

```text
first business Runtime side effect
    ⇒ PREPARE complete
    ∧ Realm State READY
```

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

Realm State binding MUST be available before any Definition business import/initialize side effect that can observe `SubsystemScope.state`。

```text
PREPARE valid
!= Realm State READY
!= process/Worker created
!= module loaded
!= connected
!= identified
!= ready
```

但 business Runtime side effect requires PREPARE + State READY。

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
Realm State RealmStateClient      (planned candidate)
        │
        ▼
@loomrealm/subsystem/host
        │
        ▼
Platform-planned Definition Module
```

Runner不创建 RealmStateAuthority，也不读取 Realm State Game definition。它只接收/构造 concrete composition 已绑定到当前 Session authority 的 Runtime-scoped client capability。

Definition Module 不读取 Game Entry/Launch Manifest，不接触 physical bootstrap material，也不创建第二 Runtime/State authority。

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

Realm State不同：

```text
business Runtime bootstrap began
    ⇒ Realm State was READY
    ∧ required RealmStateClient binding existed
```

但 `ready` 不代表某个 particular Realm State Record 被 materialized/modified/subscribed。

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

Realm State Record version/global revision也不是 Runtime lifecycle identity。

---

## 9. Bootstrap Failure / Restart

以下任一使 required Runtime bootstrap失败：

```text
Runner/container creation failure
required Runtime-scoped RealmStateClient binding unavailable
planned module load/default-export ABI failure
Control carrier/hello failure
Runtime cannot become ready
unexpected Runtime termination
```

Phase 1 all-required → whole Game Bootstrap失败并统一 cleanup。

RealmStateAuthority fatal 是 Session terminal，不作为“仅重启一个 Runtime”恢复点。

Platform MUST NOT automatic restart。新 Runtime必须 fresh Launch Attempt/token/Runner/Control lifetime + fresh Runtime-scoped State client binding。

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

不携 endpoint/ticket/Port/provisioning handle/module target，也不携 Realm State Records/revision/client material。

Renderer v1 不直接成为 Realm State client。

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
```

Realm State global revision不使用 Data generation/profile。

---

## 12. Data Broker Establishment

```text
Main current DataAuthority(S,G,P)
→ Platform DataConnectionBroker
→ provision matching Renderer + Subsystem endpoints
→ bind both to current Session/Renderer/S/G/P
→ install at most one current Data Connection
```

Broker不拥有 generation/profile，也不拥有 Realm State binding/authority。

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
```

RealmStateClient 是 Runtime bootstrap时已有的 Session capability，不依赖 later Renderer Data provisioning。

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

PWA Realm State physical binding MAY 另用 same Worker object/direct binding 或 private MessagePort；不得与 Renderer Data generation/current replacement混同。

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
reset RealmStateAuthority
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

Data reconnect不重建 business capability objects，包括 ContentClient / RealmStateClient / Viewport object。

Realm State subscription reconnect是独立机制：binding loss terminals old subscription → fresh subscribe → fresh Realm State baseline；它不由 Data reconnect触发。

---

## 17. Initial Frame Startup

Initial Frame source来自已安装的 `LogicalGameBootstrap.initial`：

```text
Realm State READY
→ Main reads LogicalGameBootstrap initial target/input
→ allocates starting Frame
→ frame.initialize ACK
→ fresh Activation
→ frame.activate ACK
→ commit active
→ publish InputTarget
```

Main 不回读 Game Entry document或 Realm State definition。

Data current不是 Frame activate前置条件；active Frame + no Data/Interest 可以合法暂时没有 ordinary input。

Realm State则已经是 business Runtime/Frame side effect前置条件，Frame业务可以通过 `scope.state` 观察 current/initial Shared State。

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

Frame/Render authoritative lifecycles不由 reload推导。RealmStateAuthority/Runtime RealmStateClient/subscriptions不因 Renderer reload自动替换；只有其自身 binding/lifetime规则可改变它们。

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

Subscription binding loss：

```text
old subscription terminal(binding-terminal)
→ fresh subscription
→ fresh baseline
```

RealmStateAuthority fatal：

```text
→ Session terminal
→ Main/Runtime/Renderer cleanup through existing Session owner chain
```

v1 不设计 transparent Authority restart / old-client reattach / journal replay。

---

## 20. Shutdown

```text
Main establishes shutdown intent
→ subsystem.shutdown
→ SDK aborts instance/frame signals and terminals owned Realm State observations
→ if shutdown accepted: bounded wait HostedRuntime.terminated
→ if no successful termination observation: requestTermination()
→ only HostedRuntime.terminated resolution is physical stopped evidence
```

如果 Runtime先进入 fatal failure，则走 failure terminal path。

Session terminal同时使 RealmStateAuthority terminal；individual Runtime terminal只终止该 Runtime client/subscriptions，不单独销毁 shared Session authority。

---

## 21. Recommended Session Sequence

```text
1  create session-scoped concrete HostraPlatform / PwaPlatform
2  platform.prepareGame(source) delegates to matching Launcher component
3  Launcher validates Game Entry including optional Realm State state
4  validate current Platform Launch Manifest
5  exact Game↔Platform Subsystem key-set join
6  resolve/preflight all required executable/security capabilities
7  freeze immutable PlatformLaunchPlan
8  platform installs PlatformLaunchPlan privately
9  return PreparedLogicalGame {main,state}
10 select New Game or validated Load sparse current seed
11 create fresh RealmStateAuthority
12 install Game baseline + sparse current overrides; revision/version=0
13 Realm State READY; install private Runtime State binding factory
14 runMain({bootstrap:prepared.main, platform, policy})
15 Main installs logical registry / initial input
16 for each required key: generator produces token; Main registers it
17 RuntimeHosting.launch({subsystemKey,bootstrapToken}) creates Runner lifetime + State client binding
18 HostedRuntime.runtimeControl.acquire() establishes Main carrier
19 hello authentication → identified → initialize → ready
20 Main starts initial Frame independently from Data
21 M7+ realize Renderer and publish Renderer Control authority
22 M8/M9+ publish DataAuthority / provision Data carriers
23 M10/M11+ establish Input/Render fresh baselines
24 Realm State subscriptions/commits proceed independently of Renderer Data currentness
25 Session terminal performs State terminal + graceful Runtime shutdown then physical escalation if needed
```

具体 physical creation order 可不同，只要满足 causal/authority/PREPARE/State-READY boundary。

---

## 22. Final Invariants

1. Game Package validation由 matching Launcher在 Runtime-product path 内调用；
2. Main不读取 Game Entry、不依赖 Game Package/Realm State document；
3. PREPARE返回平级 `LogicalGameBootstrap` + Realm State initial definition；
4. executable binding由 current Platform Launch Manifest拥有；
5. Game/current-platform Subsystem key set严格相等；State Records不参与 executable join；
6. complete PlatformLaunchPlan + Main/State projections在 Runtime side effect前闭合；
7. RealmStateAuthority fresh bootstrap + READY在任何 business Runtime side effect前完成；
8. Main Runtime launch request仍只携 logical key + bootstrapToken，不携 State payload/transport；
9. Host-owned Runner加载 plan-selected Definition Module并安装 composition-bound RealmStateClient；
10. launch != loaded != connected != identified != ready；
11. ready不要求/携带 Renderer Data，但 business Runtime bootstrap要求 State READY；
12. Runtime identity由 `subsystem.hello` key绑定；Realm State Record identity独立；
13. stopped只来自 actual termination；no automatic Runtime restart；
14. Data Broker负责 actual Renderer Data carrier，不拥有 Realm State；
15. provisioning不污染 Runtime/Renderer Control或 Realm State binding；
16. same S/G/P可以 sequential Data reconnect；RealmStateClient保持；
17. Data failure不等于 Runtime/Frame/Realm State failure；
18. Realm State ordinary conflict不等于 Runtime failure；Authority fatal → Session terminal；
19. fresh Data child state重新 baseline；Realm State subscription recovery使用自己的 fresh baseline；
20. Frame/Input/Render/Data/Realm State lifecycles相互独立但受 Session terminal上界约束；
21. Hostra/PWA Definition artifact/physical mechanism可不同，但 Realm State logical/business trace语义等价。
