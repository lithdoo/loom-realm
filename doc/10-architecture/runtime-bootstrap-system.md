# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Game Package 进入 Session 后 Runtime Runner / Renderer 的逻辑启动顺序、Control/Data 建立关系与 Platform provisioning  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[通信系统](./communication-system.md)、[渲染系统](./rendering-system.md)、[Subsystem 模型](./subsystem-model.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 正式化：[Game Package v1](../15-contracts/game-package-v1.md)、[Node Runner Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-19

---

## 1. Main vs Platform

```text
Main
    declares logical Session intent/authority

Platform
    realizes physical Runner/Renderer/connection/content topology
```

Main不直接依赖 Node/Worker/WebSocket/MessagePort；Platform不获得 Frame/DataAuthority application ownership。

---

## 2. Game Package Input

Game Package v1：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

完整 Descriptor set在任何 business Runtime side effect前校验。

```text
key    = logical Runtime identity
module = platform-neutral Definition Module
```

Platform Runner realization不是 Descriptor字段。

---

## 3. Logical Runtime Bootstrap

每个 required Subsystem：

```text
Main creates Launch Attempt
→ generate/register bootstrapToken for key
→ Platform RuntimeHosting creates Host-owned Runner Container
→ Runner loads exact descriptor.module
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
module loaded != process/Worker created != connected != identified != ready
```

---

## 4. Runner Boundary

Runner是 Platform→Subsystem role 的 executable adapter：

```text
Hostra Node Runner
PWA Worker Runner
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
Definition Module
```

Definition Module不读取 physical bootstrap material。

---

## 5. Runtime `ready`

`ready` 只证明 Runtime required initialization完成并能承担 Runtime Control Profile角色。

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

## 6. Runtime State Sources

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

PID/Worker handle/launchId不是 protocol identity。

---

## 7. Bootstrap Failure / Restart

以下任一使 required Runtime bootstrap失败：

```text
module resolve/load/ABI failure
Runner creation failure
Control carrier/hello failure
Runtime cannot become ready
unexpected Runtime termination
```

Phase 1 all-required → whole Game Bootstrap失败并统一 cleanup。

Platform MUST NOT automatic restart。新 Runtime必须 fresh Launch Attempt/token/Runner/Control lifetime。

---

## 8. Renderer Bootstrap

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

不携 endpoint/ticket/Port/provisioning handle。

---

## 9. DataAuthority / Profile

当前 Main 可发布：

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

## 10. Data Broker Establishment

```text
Main current DataAuthority(S,G,P)
→ Platform DataConnectionBroker
→ provision matching Renderer + Subsystem endpoints
→ bind both to current Session/Renderer/S/G/P
→ install at most one current Data Connection
```

Broker不拥有 G/P。

---

## 11. Hostra Late Data Provisioning

Node Runtime可能已经 `ready` 很久后才获得 DataAuthority。

因此 Desktop：

```text
Broker
→ Host-owned Runner Provisioning Channel
→ one-time Data endpoint/ticket for S/G/P
→ Runner establishes Data WebSocket
→ SubsystemDataBinding yields {G,P,carrier}
→ SDK DataPlane installs current
```

Provisioning channel在 process spawn时作为 Platform capability建立，但 Data offer可以任意晚到。

```text
Provisioning != Runtime Control
Provisioning != ready payload
```

---

## 12. PWA Late Data Provisioning

```text
Broker creates MessageChannel
→ bind S/G/P
→ transfer one Port to Renderer
→ transfer one Port through Worker provisioning path
→ RendererDataBinding / SubsystemDataBinding install current carrier
```

Port transfer是 Platform mechanism；current Data application unit仍是 JSON text string。

---

## 13. Data Reconnect

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

## 14. Fresh Data Baseline

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

## 15. Frame Startup Remains Independent

Initial Frame：

```text
Main allocates starting Frame
→ frame.initialize ACK
→ fresh Activation
→ frame.activate ACK
→ commit active
→ publish InputTarget
```

Subsystem SDK仅在 activate后启动 author frame handler。

Data current不是 Frame activate的前置条件；active Frame + no Data/Interest可以合法地暂时没有 ordinary input。

---

## 16. Renderer Reload

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

## 17. Shutdown

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

## 18. Recommended Session Sequence

```text
1  create Session
2  initialize Platform facilities
3  load/validate Game Package complete descriptors
4  resolve Definition Modules
5  create Launch Attempts/tokens
6  launch required Runner Containers
7  load Definition Modules / construct role ports
8  establish Runtime Control
9  hello → identified → ready
10 realize Renderer
11 Renderer Control hello + Snapshot
12 Main publishes DataAuthority(S,G,P) by policy
13 Broker provisions Data endpoints through Platform paths
14 Data Profile fresh child baselines
15 Main starts/continues Frame authority independently
16 shutdown/termination converges through Supervisor
```

具体 physical creation order可不同，只要满足这些 causal/authority边界。

---

## 19. Final Invariants

1. Game Package声明 `{key,module}`，Runner由 Platform选择；
2. Main逻辑 authority与 Platform physical realization分离；
3. launch != connected != identified != ready；
4. ready不要求/携带 Data；
5. Runtime identity由 `subsystem.hello`绑定；
6. stopped只来自 actual termination；
7. no automatic restart；
8. Renderer Control只发布 logical S/G/dataProfile；
9. Broker负责 actual carrier；
10. Desktop/PWA都有独立 late provisioning path；
11. provisioning不污染 Runtime/Renderer Control；
12. same S/G/P可以 sequential reconnect；
13. Data failure不等于 Runtime/Frame failure；
14. fresh Data child state重新 baseline；
15. Frame/Input/Render/Data lifecycles互相独立；
16. Hostra/PWA application trace语义等价。