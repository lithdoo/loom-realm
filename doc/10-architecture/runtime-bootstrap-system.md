# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Game Entry + Platform Launch Manifest preflight、Runtime Runner / Renderer 的逻辑启动顺序、Control/Data 建立关系与 Platform provisioning  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[通信系统](./communication-system.md)、[渲染系统](./rendering-system.md)、[Subsystem 模型](./subsystem-model.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 正式化：[Game Package v1](../15-contracts/game-package-v1.md)、[Hostra Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[PWA Launcher Profile v1](../15-contracts/pwa-launcher-profile-v1.md)、[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-20

---

## 1. Main vs Platform

```text
Main
    declares logical Session intent/authority

Platform
    validates current executable binding
    realizes physical Runner/Renderer/connection/content topology
```

Main不直接依赖 Node/Worker/WebSocket/MessagePort/module resolver；Platform不获得 Frame/DataAuthority application ownership。

---

## 2. Game Package Input

Game Package v1：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

还包含：

```text
formatVersion
initial.subsystem
initial.input
```

完整 logical key set在任何 executable planning/Runtime side effect前校验。

```text
key = logical Runtime/application identity
```

Game Entry不声明 executable module。

---

## 3. Platform Launch Input

当前 Platform独立读取：

```text
Hostra → launch.hostra.json
PWA    → launch.pwa.json
```

当前两个 profile都将 Game key绑定到 platform-local `.mjs` Definition Module，但 schema/validation/resolution authority互相独立。

Game Package不解析这些 manifest；Main也不持有 raw platform config。

---

## 4. Complete Preflight Closure

Session physical bootstrap前固定：

```text
read/validate Game Entry
→ read/validate current Platform Launch Manifest
→ exact Game↔Platform key-set join
→ resolve every required platform implementation
→ validate current Platform hosting/security capability
→ freeze immutable PlatformLaunchPlan
```

任何此阶段错误：

```text
MUST NOT create business Runtime Container
MUST NOT import business Definition Module
MUST NOT establish Runtime Control
```

Phase 1 all declared Subsystems eager + required。

---

## 5. Logical Runtime Bootstrap

每个 required Subsystem：

```text
Main creates Launch Attempt
→ generate/register bootstrapToken for key
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
plan valid
!= process/Worker created
!= module loaded
!= connected
!= identified
!= ready
```

Module load/default-export ABI validation发生在 trusted Runner中；失败使 required bootstrap失败并统一 cleanup，但不改变 executable authority owner。

---

## 6. Runner Boundary

Runner是 Platform→Subsystem role 的 executable adapter：

```text
Hostra Node Runner / PWA Worker Runner
        │
        ▼
RuntimeControlBinding
SubsystemDataBinding
ContentClient
        │
        ▼
@loomrealm/subsystem/host
        │
        ▼
Platform-planned Definition Module
```

Definition Module不读取 physical bootstrap material、Launch Manifest或 platform-private resolved target。

---

## 7. Runtime `ready`

`ready`只证明 Runtime required initialization完成并能承担 Runtime Control Profile角色。

不得推导：

```text
Renderer exists
DataAuthority exists
Data Profile material exists
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

Broker不拥有 G/P。

---

## 13. Hostra Late Data Provisioning

Node Runtime可能 ready很久后才获得 DataAuthority。

```text
Broker
→ Host-owned Runner Provisioning IPC
→ one-time Data endpoint/ticket for S/G/P
→ Runner establishes Data WebSocket
→ SubsystemDataBinding yields {G,P,carrier}
→ SDK DataPlane installs current
```

Provisioning capability在 process spawn时建立，但 Data offer可以任意晚到。

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

Port transfer是 Platform mechanism；current Data application unit仍是 JSON text string。

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

## 17. Frame Startup Remains Independent

Initial Frame：

```text
Main reads Game Entry initial target/input
→ allocates starting Frame
→ frame.initialize ACK
→ fresh Activation
→ frame.activate ACK
→ commit active
→ publish InputTarget
```

Subsystem SDK仅在 activate后启动 author frame handler。

Data current不是 Frame activate前置条件；active Frame + no Data/Interest可以合法暂时没有 ordinary input。

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

如果 Runtime先进入 fatal failure，则走 failure terminal path；不恢复成 graceful business state。

---

## 20. Recommended Session Sequence

```text
1  read/validate Game Entry
2  select current Platform realization
3  read/validate current Platform Launch Manifest
4  exact Game↔Platform key-set join
5  resolve all required executable bindings
6  validate hosting/security capabilities
7  freeze immutable PlatformLaunchPlan
8  create logical Session / install Game topology
9  initialize Platform facilities
10 create Launch Attempts/tokens
11 RuntimeHosting launches required Runners by key
12 Runners load planned Definitions / construct role ports
13 establish Runtime Control
14 hello → identified → ready
15 realize Renderer
16 Renderer Control hello + Snapshot
17 Main publishes DataAuthority(S,G,P) by policy
18 Broker provisions Data endpoints through Platform paths
19 Data Profile fresh child baselines
20 Main starts/continues Frame authority independently
21 shutdown/termination converges through Supervisor
```

具体 physical creation order可不同，只要满足 causal/authority/preflight边界。

---

## 21. Final Invariants

1. Game Package声明 `{key}` + initial logical input；
2. executable binding由 current Platform Launch Manifest拥有；
3. Game/current-platform key set Phase 1严格相等；
4. complete PlatformLaunchPlan在 Runtime side effect前闭合；
5. Main logical authority与 Platform physical realization分离；
6. Main launch不携 module/path/URL；
7. Host-owned Runner加载 plan-selected Definition Module；
8. launch != loaded != connected != identified != ready；
9. ready不要求/携带 Data；
10. Runtime identity由 `subsystem.hello` key绑定；
11. stopped只来自 actual termination；
12. no automatic restart；
13. Renderer Control只发布 logical S/G/dataProfile；
14. Broker负责 actual carrier；
15. Hostra/PWA都有独立 late provisioning path；
16. provisioning不污染 Runtime/Renderer Control；
17. same S/G/P可以 sequential reconnect；
18. Data failure不等于 Runtime/Frame failure；
19. fresh Data child state重新 baseline；
20. Frame/Input/Render/Data lifecycles互相独立；
21. Hostra/PWA Definition artifact和 physical mechanism可不同，但 application trace必须语义等价。
