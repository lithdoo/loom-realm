# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Launcher-owned Game/Platform PREPARE、LogicalGameBootstrap 安装、Runtime Runner / Renderer 的逻辑启动顺序、Control/Data 建立关系与 Platform provisioning  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-session-scoped-platform-instance.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 正式化：[Game Package v1](../15-contracts/game-package-v1.md)、[Hostra Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[PWA Launcher Profile v1](../15-contracts/pwa-launcher-profile-v1.md)、[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-20

---

## 1. Main vs Platform

```text
Main
    owns logical Session/Runtime/Frame/Data authority

Matching Platform Launcher
    owns Game Entry consumption + current executable PREPARE

Platform Composition
    creates one session-scoped concrete Platform instance
    which realizes physical Runner/Renderer/connection/content topology
```

Main 不直接依赖 Node/Worker/WebSocket/MessagePort/module resolver，也不依赖 `@loomrealm/game-package` 或 concrete launcher。

---

## 2. Launcher-owned Game Entry Preparation

Main 不读取 Game Entry。

Runtime-product bootstrap 固定：

```text
Game source / installation
→ matching Platform Launcher
    → @loomrealm/game-package parse/validate
    → current Platform Launch Manifest parse/validate
```

Game Entry v1 common facts：

```text
formatVersion
initial.subsystem
initial.input
subsystems[] {key}
```

完整 key set 在任何 executable planning/Runtime side effect前校验。

```text
key = logical Runtime/application identity
```

Game Entry不声明 executable module。

---

## 3. Complete PREPARE Closure

Session physical bootstrap前 matching Launcher MUST 完成：

```text
Game Entry validation
→ current Platform Launch Manifest validation
→ exact Game↔Platform key-set join
→ resolve every required platform implementation
→ validate current Platform hosting/security capability
→ freeze immutable PlatformLaunchPlan
→ install/freeze that plan in the current concrete Platform instance
→ project/freeze LogicalGameBootstrap
```

任何 PREPARE error：

```text
MUST NOT create business Runtime Container
MUST NOT import business Definition Module
MUST NOT establish Runtime Control
```

Phase 1 all declared Subsystems eager + required。

---

## 4. Prepared Bootstrap Installation

Prepared current-platform result 概念上包含两个正交 projection：

```text
LogicalGameBootstrap
    → Main-visible logical facts

prepared concrete Platform instance
    → owns PlatformLaunchPlan privately
    → exposes the narrow Main-facing capability view
```

Composition 在调用 Main 前已经完成：

```text
platform.prepareGame(source)
→ Launcher PREPARE
→ platform installs immutable PlatformLaunchPlan
→ returns LogicalGameBootstrap

runMain({ bootstrap, platform })
```

Main 不调用 `prepareGame()`；Main 只消费当前 Platform 对 Main 暴露的窄 capability view。

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
PlatformLaunchPlan
module/path/URL
raw Platform manifest
```

---

## 5. Logical Runtime Bootstrap

每个 required Subsystem：

```text
Main creates Launch Attempt
→ generate/register bootstrap credential for key
→ RuntimeHosting lookup frozen PlatformLaunchPlan[key]
→ Platform creates Host-owned Runner Container
→ Runner loads exact planned Definition Module
→ Runner constructs Subsystem-facing Platform Ports
→ Runtime Control carrier obtained
→ subsystem.hello
→ Main binds connection to key
→ identified
→ optional initializing
→ definition.initialize
→ status(ready)
```

```text
PREPARE valid
!= process/Worker created
!= module loaded
!= connected
!= identified
!= ready
```

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
        │
        ▼
@loomrealm/subsystem/host
        │
        ▼
Platform-planned Definition Module
```

Definition Module 不读取 Game Entry/Launch Manifest，不接触 physical bootstrap material，也不创建第二 Runtime。

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

Platform provisioning capability可以已安装，但“当前没有 Data offer”完全合法。

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

---

## 9. Bootstrap Failure / Restart

以下任一使 required Runtime bootstrap失败：

```text
Runner/container creation failure
planned module load/default-export ABI failure
Control carrier/hello failure
Runtime cannot become ready
unexpected Runtime termination
```

Phase 1 all-required → whole Game Bootstrap失败并统一 cleanup。

Platform MUST NOT automatic restart。新 Runtime必须 fresh Launch Attempt/token/Runner/Control lifetime。

---

## 10. Renderer Bootstrap

```text
Main establishes Renderer intent
→ Platform RendererHosting realizes current participant
→ RendererControlBinding supplies carrier
→ renderer.hello
→ current full Authority Snapshot
```

Snapshot：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

不携 endpoint/ticket/Port/provisioning handle/module target。

---

## 11. DataAuthority / Profile

当前 Main可发布：

```text
DataAuthority(S,G,"loomrealm.renderer-data/1")
```

Data Profile v1：

```text
Connection 1 + User Input 1 + Render Update 1
```

Profile改变是 authority replacement，必须 fresh generation。

```text
DataAuthority exists != Data carrier current
```

---

## 12. Data Broker Establishment

```text
Main current DataAuthority(S,G,P)
→ Platform DataConnectionBroker
→ provision matching Renderer + Subsystem endpoints
→ bind both to current Session/Renderer/S/G/P
→ install at most one current Data Connection
```

Broker不拥有 generation/profile。

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
```

---

## 14. PWA Late Data Provisioning

```text
Broker creates MessageChannel
→ bind S/G/P
→ transfer one Port to Renderer
→ transfer one Port through Worker provisioning path
→ RendererDataBinding / SubsystemDataBinding install current carrier
```

Port transfer 是 Platform mechanism；Data application unit仍是 JSON text string。

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

Data reconnect不重建 business capability objects。

---

## 17. Initial Frame Startup

Initial Frame source来自已安装的 `LogicalGameBootstrap.initial`：

```text
Main reads LogicalGameBootstrap initial target/input
→ allocates starting Frame
→ frame.initialize ACK
→ fresh Activation
→ frame.activate ACK
→ commit active
→ publish InputTarget
```

Main 不回读 Game Entry document。

Data current不是 Frame activate前置条件；active Frame + no Data/Interest 可以合法暂时没有 ordinary input。

---

## 18. Renderer Reload

```text
Renderer Control lost
→ local InputTarget/DataAuthority invalid
→ old Data connections retired
→ fresh Renderer Control bootstrap
→ hello + current full Snapshot
→ Broker establishes current S/G/P carriers
→ Input/Render fresh baselines
```

Frame/Render authoritative lifecycles不由 reload推导。

---

## 19. Shutdown

```text
Main establishes shutdown intent
→ subsystem.shutdown
→ SDK aborts instance/frame signals and runs bounded shutdown hook
→ Platform terminates Runner if needed
→ Supervisor observes actual termination
→ stopped
```

如果 Runtime先进入 fatal failure，则走 failure terminal path。

---

## 20. Recommended Session Sequence

```text
1  select current Platform launcher / installation source
2  launcher obtains Game Entry and validates via @loomrealm/game-package
3  launcher validates current Platform Launch Manifest
4  exact Game↔Platform key-set join
5  resolve all required executable bindings
6  validate hosting/security capabilities
7  freeze immutable PlatformLaunchPlan
8  project/freeze LogicalGameBootstrap
9  release PreparedCurrentPlatformGame
10 apps/* construct Main with LogicalGameBootstrap + plan-bound RuntimeHosting + other ports
11 Main creates Launch Attempts/tokens
12 RuntimeHosting launches required Runners by key
13 Runners load planned Definitions / construct role ports
14 establish Runtime Control
15 hello → identified → ready
16 realize Renderer
17 Renderer Control hello + Snapshot
18 Main publishes DataAuthority(S,G,P) by policy
19 Broker provisions Data endpoints through Platform paths
20 Data Profile fresh child baselines
21 Main starts/continues Frame authority independently
22 shutdown/termination converges through Supervisor
```

具体 physical creation order 可不同，只要满足 causal/authority/PREPARE boundary。

---

## 21. Final Invariants

1. Game Package validation由 matching Launcher在 Runtime-product path 内调用；
2. Main不读取 Game Entry、不依赖 Game Package；
3. Main接收 immutable LogicalGameBootstrap；
4. executable binding由 current Platform Launch Manifest拥有；
5. Game/current-platform key set Phase 1严格相等；
6. complete PlatformLaunchPlan + LogicalGameBootstrap在 Runtime side effect前闭合；
7. Main launch不携 module/path/URL；
8. Host-owned Runner加载 plan-selected Definition Module；
9. launch != loaded != connected != identified != ready；
10. ready不要求/携带 Data；
11. Runtime identity由 `subsystem.hello` key绑定；
12. stopped只来自 actual termination；
13. no automatic restart；
14. Broker负责 actual Data carrier；
15. provisioning不污染 Runtime/Renderer Control；
16. same S/G/P可以 sequential reconnect；
17. Data failure不等于 Runtime/Frame failure；
18. fresh Data child state重新 baseline；
19. Frame/Input/Render/Data lifecycles互相独立；
20. Hostra/PWA Definition artifact/physical mechanism可不同，但 application trace语义等价。
