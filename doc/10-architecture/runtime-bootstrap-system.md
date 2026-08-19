# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Game Package 进入 Session 后 Runtime/Renderer 的逻辑启动顺序、Control/Data carrier 建立关系，以及 Platform Composition 在 bootstrap 中的职责  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[通信系统](./communication-system.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 正式契约：[Game Package v1](../15-contracts/game-package-v1.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)  
> 最近复核：2026-08-19

## 1. 设计目标

LoomRealm Main 是 Session 与逻辑运行拓扑的编排者；Platform Composition 是物理 Runtime/Renderer/Connection/Content topology 的建立者。

两者职责分开：

```text
Main
    declares logical intent / authority

Platform Composition
    realizes physical process/worker/window/carrier/content topology
```

Subsystem `ready` 不发布 Renderer Data endpoint。Main 只通过 Renderer Control 发布逻辑 `DataAuthority`；Platform Data Connection Broker 再建立具体 WebSocket / MessagePort carrier。

Bootstrap 只建立 Runtime/Renderer participant 与连接 authority/lifecycle，不决定 Frame 或 Render lifecycle。

---

## 2. 五条独立链路

```text
链路 1：Main → Platform Runtime Hosting
    Descriptor → Launcher Target → Launch Attempt → physical Runtime Container

链路 2：Subsystem → Main Runtime Control
    carrier established → subsystem.hello → identified → status → ready

链路 3：Main → Platform Renderer Hosting
    establish current Renderer participant

链路 4：Main → Renderer Control
    committed Authority Snapshot
    including DataAuthority{subsystemKey,generation,connectionProfile}

链路 5：Platform Data Connection Broker
    current DataAuthority → establish Renderer⇄Subsystem carrier
```

因此：

```text
physical launch success != connected != identified != ready
ready != Renderer exists
ready != DataAuthority exists
ready != Data Connection established
```

---

## 3. Game Entry / Descriptor

Game Package 定义 current Session 所需 Subsystem Descriptor。Main 在任何业务 Runtime side effect 前校验完整集合。

当前 Desktop baseline 使用 Node.js launcher descriptor；这只是一个 Platform realization，不意味着 Main Core 直接依赖 Node process API。

核心逻辑：

```text
read/validate Game Package
→ validate complete descriptor set
→ install Descriptor Registry
→ resolve required launcher targets
→ create Launch Attempts
→ ask Platform Runtime Hosting to realize them
```

unsupported launcher / invalid entry / invalid env 在 side effect 前失败。

---

## 4. Platform-independent Runtime Bootstrap

单个 Runtime 的逻辑流程：

```text
Main
→ create Launch Attempt
→ generate/register bootstrap credential bound to descriptor.key
→ Platform Runtime Hosting creates physical Runtime Container
→ Platform Runtime Control Binding becomes available
→ Subsystem obtains established Control carrier
→ subsystem.hello { protocolVersions:[1] }
→ Main validates key/token/version
→ bind Control Connection to descriptor.key
→ identified
→ optional status(initializing)
→ Runtime completes required initialization
→ subsystem.status({state:"ready"})
→ ready
```

Platform 可以选择不同方式传递 bootstrap material，但正式 Runtime identity 仍由 `subsystem.hello` 绑定。

---

## 5. Runtime `ready` Boundary

```json
{"state":"ready"}
```

只证明 Runtime 可以承担 enclosing Runtime Control Profile 角色。

不得从 `ready` 推导：

```text
Renderer participant exists
Renderer Data endpoint known
DataAuthority exists
Data carrier exists
Frame exists
Render Domain exists
InputTarget exists
```

Bootstrap material 也不得把这些事实偷偷塞入 `ready`。

---

## 6. Main / Platform Supervisor Boundary

Main public Runtime state：

```text
declared
→ starting
→ connected
→ identified
→ ready
→ stopping
→ stopped

legal stages → failed
```

物理 Supervisor 只提供事实，例如：

```text
container created
container exited/terminated
forced termination completed
```

来源必须明确：

```text
starting    Main Launch Attempt + Platform launch intent
connected   Main accepted Control carrier
identified  successful subsystem.hello
ready       valid subsystem.status(ready)
stopped     Platform/Supervisor observed actual Runtime termination
failed      Control/Runtime failure classification
```

PID、Worker handle、Launch Attempt ID 都不是 Runtime protocol identity。

---

## 7. Failure / Restart

Runtime bootstrap 期间以下 physical termination 都是 failure：

```text
launch后、connect前
connected后、hello前
identified后、ready前
```

Runtime ready 后，如果 Main 没有 termination intent，unexpected exit/Control loss 进入 Runtime failure。

当前不允许 Platform 私自 automatic restart。

未来 restart 必须是新的显式 Launch Attempt，并获得 fresh bootstrap credential；Frame/Data/Render recovery 不能由 Supervisor 推导。

---

## 8. Renderer Bootstrap

逻辑流程：

```text
Main establishes Renderer intent
→ Platform Renderer Hosting realizes current Renderer participant
→ Platform Renderer Control Binding establishes carrier
→ renderer.hello
→ Main publishes initial full Authority Snapshot
```

Renderer Control snapshot 包含：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority{subsystemKey,generation,connectionProfile}
```

不携带：

```text
Data WebSocket URL
MessagePort
bearer Data ticket
Hostra Window identity
```

ordinary User Input / Render Update 不通过 Main 转发。

---

## 9. Renderer ⇄ Subsystem Data Establishment

当 Main 发布 current：

```text
DataAuthority(S,G,P)
```

Platform Data Connection Broker 执行：

```text
observe/receive current authority intent
→ create/provision matching physical endpoints
→ bind both endpoints to Session/current Renderer/S/G
→ install at most one current Data Connection
```

物理 endpoint/ticket/MessagePort 不属于 DataAuthority，也不属于 Runtime readiness。

同 generation 仍 current 时，旧 carrier retired 后可建立 fresh carrier；`generation` 不是 reconnect counter。

---

## 10. Data Child-protocol Baseline

fresh Data Connection 是新的 child-protocol transport baseline：

```text
User Input
    Interest Registry = empty
    retained Input State = empty
    Subsystem republishes current full Frame Interest Registry if desired

Render Update
    current Domain Registry
    fresh Snapshot for each current Domain
```

Data reconnect 不重建 Runtime/Frame/Render business objects。

---

## 11. Frame/Input 与 Render 独立

Frame/Input authority：

```text
Main Frame authority
→ frameId / Activation / InputTarget
→ Renderer User Input
→ Subsystem local Frame/Input Context
```

Input Interest 是 Frame-scoped configuration，可在相同 Data carrier 上跨 Frame suspension/fresh Activation 保留；旧 Activation Input State/Event 不重用。

Render：

```text
Subsystem Render Domain Registry / State
→ Render Update
→ Renderer Render Store
→ presentation
```

禁止隐式关系：

- Frame create 不自动创建 Render Domain；
- Frame suspend/resume/close 不隐式 hide/show/destroy Render；
- Runtime `ready` 不表示任何 Frame/Render 已存在；
- Data carrier replacement 不等于 Frame resume 或 Render Domain recreate。

---

## 12. Hostra Desktop Realization

Desktop 当前 baseline：

```text
Runtime Hosting
    Desktop Node.js Launcher Profile v1
    Host-selected Node / child process / Supervisor

Runtime Control
    localhost WebSocket

Renderer Hosting
    Hostra / Electron BrowserWindow

Renderer Control
    localhost WebSocket

Renderer⇄Subsystem Data
    authenticated localhost carrier

Content
    filesystem-backed service + localhost HTTP
```

Desktop Bootstrap Context v1 是当前 Node launcher interoperability boundary，只提供 Runtime Control bootstrap 所需 material，不携 Data endpoint/generation/Frame/Render identity。

Hostra Shell RPC 是平台宿主能力，不与 LoomRealm Runtime/Renderer protocol 合并。

---

## 13. PWA Realization

PWA 对同一逻辑 bootstrap 使用：

```text
Runtime Hosting
    per-Subsystem Dedicated Worker

Runtime Control
    transferred/authenticated MessagePort

Renderer Hosting
    browser Window

Renderer Control
    controlled MessagePort

Renderer⇄Subsystem Data
    MessageChannel + endpoint transfer

Content
    Fetch + Service Worker / OPFS
```

Worker constructor options、Port transfer object、Service Worker registration 属于 Platform implementation，不形成新的 LoomRealm application Profile。

Structured Clone 不能扩大正式 protocol JSON type model。

---

## 14. Renderer Reload

```text
Renderer Control lost
→ old Renderer ordinary InputTarget/DataAuthority use invalidated
→ old Renderer Data Connections retired
→ Platform realizes fresh/current Renderer Control carrier
→ renderer.hello + current full Authority Snapshot
→ Broker establishes fresh carriers for current DataAuthority
→ User Input fresh empty registry + republish + fresh State baselines
→ Render Update current Registry + fresh Snapshots
```

不得从 Frame 集合推导“哪些 Render Domain 必须销毁/恢复”。

---

## 15. Trust Boundary

Platform Runtime entry safety、OS/browser sandbox 与 application protocol validation 是不同问题。

例如 Desktop safe `launcher.entry` 只保证 Main 执行 declared/validated Installation entry，不自动提供 Node.js process sandbox。

Platform bootstrap material 可以是 credential/endpoint/Port，但普通游戏内容与所有 protocol input 仍按不可信数据验证。

---

## 16. 推荐启动时序

```text
1. create Session
2. initialize required Platform facilities
3. read + validate Game Package / complete Descriptor set
4. resolve Launcher Targets
5. create Launch Attempts + bootstrap auth state
6. Platform Runtime Hosting launches required Runtime Containers
7. each Runtime obtains/establishes Control carrier
8. subsystem.hello → identified
9. subsystem.status(ready)
10. Platform Renderer Hosting realizes current Renderer
11. Renderer Control established
12. renderer.hello + current Authority Snapshot
13. Main publishes DataAuthority by policy
14. Platform Data Connection Broker establishes current Data carriers
15. User Input / Render Update establish fresh data-plane baselines
16. Frame lifecycle remains Main/Frame authority
17. Render lifecycle remains Subsystem authority
```

具体 Process/Worker/Socket/Port 创建顺序可以不同，只要满足正式 authority/order/security 边界。

---

## 17. 核心不变量

1. Main 是逻辑 Session/authority 编排者；Platform 是物理 topology realization；
2. Game Entry 一次性声明当前会话 required Subsystems；
3. physical launch success != connected != identified != ready；
4. `ready != Data Connection established`；
5. Runtime identity 由 Control v1 `subsystem.hello` 绑定；
6. Runtime `ready` 不携 Renderer Data endpoint；
7. stopped 只来自 actual Runtime termination observation；
8. Platform 不自动 restart failed Runtime；
9. Renderer Control只发布逻辑 DataAuthority；
10. Data Connection Broker负责实际 Data carrier establishment；
11. 每 Subsystem 对 current Renderer 最多一条 current Data Connection；
12. Data loss不等于 Runtime failure/Frame unwind；
13. Frame/Input、Render、Data lifecycle互相独立；
14. Desktop/PWA bootstrap mechanism不同但 application trace必须等价；
15. Platform bootstrap material默认不形成新的 application protocol。
