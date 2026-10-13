# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving；Realm State bootstrap semantics current；Session Events v1 bootstrap/lifetime semantics synchronized / not implemented / not qualified  
> 主要定义：Launcher-owned Game/Platform PREPARE、Main/Realm State prepared projection、Realm State + SessionEventHub READY barrier、Runtime Runner / Renderer 的逻辑启动顺序、Control/Data/State/Events 建立关系与 Platform provisioning  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[Realm State](./realm-state-system.md)、[Session Events](./session-events-system.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 正式化：[Game Package v1](../15-contracts/game-package-v1.md)、[Realm State v1](../15-contracts/realm-state-v1.md)、[Session Events v1](../15-contracts/session-events-v1.md)、[Hostra Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[PWA Launcher Profile v1](../15-contracts/pwa-launcher-profile-v1.md)、[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-10-13

---

## 1. Main vs State vs Events vs Platform

```text
Main
    owns Session Control / Runtime / Frame / Data authority

RealmStateAuthority
    owns Session shared mutable business facts

SessionEventHub
    owns Session-scoped transient routing/delivery mechanics
    no business truth ownership

Matching Platform Launcher
    owns Game Entry consumption + executable PREPARE

Platform / Session Composition
    realizes Runner/Renderer/Content/Data/State/Event physical bindings
    owns construction order / wiring / disposal only
```

Main不直接依赖 concrete Node/Worker/WebSocket/MessagePort/module resolver，也不读取 Game Entry business document。

RealmStateAuthority / SessionEventHub MAY 与 Main 共进程/Worker，但不是 Main business fields。Physical co-location不改变 logical owner/lifetime/failure semantics。

---

## 2. Launcher-owned Game Entry Preparation

Main 不读取 Game Entry。

```text
Game source / installation
→ Platform.prepareGame(...)
→ matching Launcher
    → Game Entry validation including optional state document
    → current Platform Launch Manifest
    → exact Subsystem key join
    → executable/security/hosting preflight
```

Game Entry不声明 State/Event physical endpoint。Session Events v1 不需要 Game Entry bootstrap event history、channel registry 或 initial subscription document。

---

## 3. Complete PREPARE Closure

在任何 business Runtime side effect前：

```text
Launcher
    validates Game Entry + Platform Manifest
    → exact key-set join
    → resolves all required implementations
    → freezes PlatformLaunchPlan
    → projects LogicalGameBootstrap
    → projects PreparedRealmStateDefinition
```

任何 PREPARE error：

```text
MUST NOT create business Runtime Container
MUST NOT import business Definition Module
MUST NOT establish Runtime Control
MUST NOT permit business Runtime side effect
```

Session Events 不向 Launcher 增加 Game-document projection；其 SessionEventHub 是 Session service，由 composition 在 PREPARE 成功后构造。

---

## 4. Prepared Bootstrap Installation

Prepared result：

```text
LogicalGameBootstrap
    → Main logical topology / initial Frame input

PreparedRealmStateDefinition
    → RealmStateAuthority baseline

prepared Platform instance
    → owns PlatformLaunchPlan privately
    → owns physical State/Event Runtime-binding realization
```

Composition sequence：

```text
platform.prepareGame(source)
→ PREPARE complete

→ construct fresh RealmStateAuthority from prepared.state
→ install State baseline / current seed
→ Realm State READY

→ construct fresh logical SessionEventHub
→ install bounded routing/subscription infrastructure
→ Session Events READY

→ install Runtime-scoped State client binding factory
→ install Runtime-scoped Event client binding factory

→ runMain({bootstrap: prepared.main, platform})
```

SessionEventHub 没有 event history/bootstrap payload；READY 表示它已能保持 v1 routing/lifetime/backpressure invariants。

必须保持：

```text
first business Runtime side effect
    ⇒ PREPARE complete
    ∧ Realm State READY
    ∧ SessionEventHub READY
```

Pre-READY State/Event service construction failure属于 Session bootstrap failure，不通过一个尚未成为 live lifecycle owner 的 Main伪造 fatal report。

---

## 5. Logical Runtime Bootstrap

每个 required Subsystem：

```text
Main creates Launch Attempt + bootstrap token
→ RuntimeHosting.launch({subsystemKey,bootstrapToken})
→ RuntimeHosting resolves frozen PlatformLaunchPlan[key]
→ Platform creates Runner Container
→ Platform/Runner installs Runtime-scoped RealmStateClient binding
→ Platform/Runner installs Runtime-scoped SessionEventClient binding
→ Runner loads exact planned Definition Module
→ constructs remaining Subsystem-facing capabilities
→ Runtime Control carrier
→ subsystem.hello
→ identified
→ definition.initialize
→ status(ready)
```

State/Event bindings MUST be available before Definition business initialize side effect that can observe `scope.state` / `scope.events`。

```text
PREPARE valid
!= State READY
!= Event Hub READY
!= process/Worker created
!= module loaded
!= identified
!= ready
```

---

## 6. Runner Boundary

```text
Hostra Node Runner / PWA Worker Runner
        │
        ▼
RuntimeControlBinding
SubsystemDataBinding
ContentClient
RealmStateClient
SessionEventClient
        │
        ▼
@loomrealm/subsystem/host
        │
        ▼
Platform-planned Definition Module
```

Runner 不创建 RealmStateAuthority 或 SessionEventHub。它只接收/构造 composition 已绑定到 current Session logical services 的 Runtime-scoped clients。

Runner/Subsystem host MUST NOT require Frame/Activation identity to install or authorize State/Event operations。

Event source identity MUST bind to the current Runtime's authenticated `subsystemKey`；Runner/business code不能指定任意 `source.subsystemKey`。

---

## 7. Runtime `ready`

`ready` 只证明 Runtime required initialization完成并能承担 Runtime Control role。

不得推导 Renderer/Data existence。

但：

```text
business Runtime bootstrap began
    ⇒ Realm State was READY
    ∧ SessionEventHub was READY
    ∧ required RealmStateClient binding existed
    ∧ required SessionEventClient binding existed
```

`ready` 不代表任何 State Record 修改，也不代表任何 Event channel 已订阅。

---

## 8. Runtime State Sources

```text
starting    Main Launch Attempt + Platform launch intent
connected   Main accepts Control carrier
identified  successful subsystem.hello
ready       valid subsystem.status(ready)
stopping    Main shutdown intent
stopped     actual Runtime termination observed
failed      Control/Runtime failure classification
```

PID/Worker/module path不是 protocol identity；State revision/Event internal routing counters也不是 Runtime lifecycle identity。

---

## 9. Bootstrap Failure / Restart

以下任一使 required Runtime bootstrap失败：

```text
Runner/container creation failure
required RealmStateClient binding unavailable before business bootstrap
required SessionEventClient binding unavailable before business bootstrap
planned module/ABI failure
Control carrier/hello failure
Runtime cannot become ready
unexpected Runtime termination
```

RealmStateAuthority fatal / SessionEventHub invariant fatal 是 Session-fatal condition，不作为“只重启一个 Runtime”的恢复点。Service先 self-terminal，再报告 Main/Session lifecycle owner。

Platform MUST NOT automatic Runtime restart。Fresh Runtime需要 fresh Launch Attempt/token/Runner/Control + fresh Runtime-scoped State/Event bindings。

---

## 10. Renderer Bootstrap

Renderer Control Snapshot继续只含 Main authority：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

不携 State Records/revision/client material，也不携 Session Event channel/subscription material。

Renderer v1 不直接成为 State/Event client。

---

## 11. DataAuthority / Profile

```text
DataAuthority exists
!= Realm State authority/currentness
!= Session Event Hub/currentness
```

State/Event clients都不使用 Data generation/profile 作为 logical identity。

---

## 12. Data Broker Establishment

Data Broker只负责 actual Renderer↔Subsystem Data carrier，不拥有 State/Event binding、Hub、subscription 或 source identity。

---

## 13. Hostra Late Data Provisioning

Node Runtime可在 ready 后很久才获得 Data carrier。

```text
Provisioning != Runtime Control
Provisioning != State binding
Provisioning != Event binding
```

RealmStateClient / SessionEventClient 在 Runtime business bootstrap前已作为 Session capabilities 构造，不依赖 later Renderer Data provisioning。

---

## 14. PWA Late Data Provisioning

PWA Data MessagePort transfer只属于 Renderer Data。

PWA State/Event physical bindings MAY in-process、same Worker direct binding、private MessagePort，或 multiplex one Session-service carrier；不得与 Renderer Data current generation混同。

---

## 15. Data Reconnect

Same S/G/P Data reconnect：

```text
MUST NOT restart Runtime
MUST NOT replace RealmStateClient
MUST NOT replace SessionEventClient
MUST NOT reset RealmStateAuthority
MUST NOT reset/replay SessionEventHub
```

---

## 16. Fresh Data Baseline

Fresh Data carrier重建 Input/Render/Viewport connection-local baseline。

State subscription recovery和 Event subscription recovery都是独立机制：

```text
State binding loss
→ old State subscriptions terminal
→ fresh binding if supported
→ fresh State subscribe + baseline

Event binding loss
→ old Event subscriptions closed(binding-terminal)
→ fresh binding if supported
→ future publish/subscribe
→ business fresh Event subscribe
→ no replay
```

Data reconnect不触发这两者。

---

## 17. Initial Frame Startup

```text
Realm State READY
∧ SessionEventHub READY
→ Main reads LogicalGameBootstrap initial target/input
→ starting Frame
→ initialize / activate
→ publish InputTarget
```

Frame handler可以使用 Runtime-scoped `scope.state` / `scope.events`，但 State commit / Event publish不消费 Frame/Activation authority。

---

## 18. Renderer Reload

Renderer reload只替换 Renderer/Data participant。

RealmStateAuthority、SessionEventHub、Runtime-scoped State/Event clients/subscriptions不因 Renderer reload自动替换；只有各自 binding/lifetime contract可改变它们。

---

## 19. Realm State Failure / Rebinding

Realm State普通 conflict/invalid/limit caller-visible；post-dispatch ambiguous commit = OUTCOME_UNKNOWN；no auto retry。

State binding loss终止 old subscriptions，不自动 fail Runtime/Session；fresh binding可继续同一 live logical client，fresh subscribe + baseline。

Authority fatal → self-terminal → report Session-fatal → Main terminal/unwind。

---

## 20. Session Events Failure / Rebinding

Ordinary Event operation：

```text
INVALID_REQUEST / LIMIT_EXCEEDED
    caller-visible known not accepted

BINDING_UNAVAILABLE
    no usable binding; fail fast; no wait/queue

OUTCOME_UNKNOWN
    publish dispatched + definitive acceptance result lost
    no automatic retry
```

Binding loss：

```text
old Event subscriptions → closed(binding-terminal)
logical SessionEventClient remains live if Runtime live
no Runtime/Frame/Session automatic failure
no Hub reset
no replay
```

Fresh binding：

```text
future publish may proceed
business must fresh subscribe
old subscription identity never reattaches
```

Runtime terminal：client terminal + subscriptions client-terminal。

SessionEventHub fatal：Hub self-terminal + subscriptions hub-terminal → report Session-fatal → Main owns terminal/unwind。

---

## 21. Shutdown

```text
Main establishes shutdown intent
→ subsystem.shutdown
→ SDK terminals/settles owned State/Event observations
→ bounded graceful Runtime termination
→ physical escalation if required
```

Main/Session owner提交 Session terminal 后，同时使 RealmStateAuthority 与 SessionEventHub terminal/inert。Individual Runtime terminal只终止该 Runtime的 State/Event clients，不单独销毁 Session services。

---

## 22. Recommended Session Sequence

```text
1  create session-scoped concrete Platform
2  platform.prepareGame(source)
3  validate Game Entry + Platform Manifest
4  exact Subsystem key-set join / executable preflight
5  freeze PlatformLaunchPlan
6  project LogicalGameBootstrap + PreparedRealmStateDefinition
7  construct RealmStateAuthority; install baseline; State READY
8  construct SessionEventHub; Event Hub READY
9  install Runtime State/Event binding factories
10 runMain({bootstrap:prepared.main, platform})
11 for each required Runtime create Launch Attempt/token
12 RuntimeHosting.launch creates Runner + State/Event client bindings
13 Runner loads Definition
14 Runtime Control hello → identified → initialize → ready
15 Main starts initial Frame independently from Data
16 Renderer/Data may be established later
17 State reads/commits/subscriptions proceed independently
18 Event publish/subscriptions proceed independently with exact-channel routing
19 binding recovery is per-plane; no replay/reattach
20 Main/Session terminal converges State + Event Hub terminal and Runtime shutdown
```

---

## 23. Final Invariants

1. Launcher owns Game/Platform PREPARE；Main不读取 Game Entry；
2. State prepared definition与Main bootstrap分离；Session Events不需要 Game Event bootstrap document；
3. first business Runtime side effect requires State READY + Event Hub READY；
4. Runner获得 composition-bound Runtime-scoped State/Event clients，不创建 authorities/services；
5. State/Event binding都不依赖 Frame/Activation/Renderer Data currentness；
6. Event source绑定 Runtime authenticated subsystemKey；
7. Event no-binding fail-fast，post-dispatch ambiguity only publish OUTCOME_UNKNOWN；
8. old Event subscription binding loss terminal；fresh binding fresh subscribe；no replay；
9. State/Event service fatal都先self-terminal再报告Main；Main唯一提交Session terminal/unwind；
10. Renderer/Data reconnect不reset State/Event services；
11. physical placement/multiplexing可不同，但 Desktop/PWA logical trace必须等价。