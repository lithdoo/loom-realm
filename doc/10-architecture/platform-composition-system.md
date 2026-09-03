# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨平台 composition boundary、Launcher-owned Game Entry PREPARE、Platform Launch Manifest/Plan、Runtime Runner、role-facing ports、DataConnectionBroker/provisioning，以及 Hostra/PWA 对同一 logical Session 的 realization  
> 依赖：[系统架构总览](./system-overview.md)、[ADR 0017](../decisions/0017-system-level-platform-composition.md)、[ADR 0019](../decisions/0019-platform-launch-manifest-boundary.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 被以下文档细化：[运行承载系统](./runtime-hosting-system.md)、[运行时启动系统](./runtime-bootstrap-system.md)、[通信系统](./communication-system.md)  
> 被以下文档实现：[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 最近复核：2026-09-03

本文回答：**同一套 LoomRealm application semantics 如何在不同物理平台上被完整准备、组合并运行。**

---

## 1. Core Boundary

```text
             Platform-neutral application roles
┌──────────────────────────────────────────────────────┐
│ Main      Renderer      Subsystem      Content       │
└──────────────────────────────────────────────────────┘
                         ▲
                    role-facing ports
                         │
        ┌────────────────┴────────────────┐
        │                                 │
     Hostra                             PWA
```

Bootstrap 前还有一个独立 document/launch boundary：

```text
Game source
→ session-scoped concrete Platform instance
    → matching Launcher component PREPARE
    → install immutable PlatformLaunchPlan internally
    → return LogicalGameBootstrap
→ Main receives LogicalGameBootstrap + Main-facing Platform view
```

必须保持：

```text
Game Package != Runtime role
Platform != Main/Renderer/Subsystem
Platform != Protocol
Platform architecture != one mega package
```

---

## 2. Why System-level Composition

一个完整 Session 同时需要：

```text
Game Entry acquisition/validation
current-platform executable binding/preflight
Runtime Runner hosting/supervision
Main ⇄ Subsystem Control
Renderer hosting
Main ⇄ Renderer Control
Renderer ⇄ Subsystem Data Broker
late Data provisioning
Content binding
bootstrap material delivery
physical startup/shutdown
```

这些职责不能优雅归属某一个 role package或单一 Transport Adapter。

因此：

> **Concrete Platform instance is the product composition object; matching Launcher is its Game + executable PREPARE component; roles consume only logical projections and narrow role-facing capability views.**

---

## 3. Launcher-owned Game Entry Consumption

Runtime-product path：

```text
Hostra product
→ HostraPlatform.prepareGame(...)
    → @loomrealm/game-launcher-hostra component
        → @loomrealm/game-package
        → launch.hostra.json

PWA product
→ PwaPlatform.prepareGame(...)
    → @loomrealm/game-launcher-pwa component
        → @loomrealm/game-package
        → launch.pwa.json
```

Application/composition 不需要先显式调用 `@loomrealm/game-package`。

Main 不解析 Game Entry、不读取 `formatVersion`、不持有 `ValidatedGameEntryV1`。

Tooling MAY 直接消费 Game Package，但不改变 Runtime-product ownership。

---

## 4. Game Logical Topology vs Platform Binding

Game Entry v1：

```text
formatVersion
initial {subsystem,input}
subsystems[] = {key}
```

Platform 独立声明 executable binding：

```text
Hostra
    launch.hostra.json
    key → Hostra Definition Module

PWA
    launch.pwa.json
    key → PWA Definition Module
```

两个 Platform manifest 可暂时都有 `{key,module}`，但它们不是同一 schema/profile。

禁止 common：

```text
game.json launcher.type
module in common Descriptor
PlatformLaunchOptions
options:any
```

---

## 5. PREPARE → COMMIT

### PREPARE

Concrete Platform 的 `prepareGame()` MUST 在任何 business Runtime side effect前，通过 matching Launcher component 完成：

```text
Launcher component
    obtain Game Entry
    → @loomrealm/game-package parse/validate
    → validate own Platform Launch Manifest
    → exact key-set join
    → resolve every required executable binding
    → validate installation/security/hosting capability
    → freeze immutable PlatformLaunchPlan
    → project immutable LogicalGameBootstrap

Concrete Platform.prepareGame(...)
    → install/freeze PlatformLaunchPlan internally
    → return LogicalGameBootstrap to composition
```

Phase 1：

```text
keys(GameEntry.subsystems)
=
keys(CurrentPlatformLaunchManifest.subsystems)
```

PREPARE failure：

```text
Process/Worker create count = 0
business Definition import count = 0
Runtime Control establish count = 0
```

### COMMIT

Composition 安装：

```text
same prepared concrete Platform instance
+ LogicalGameBootstrap
→ Main / Renderer / Content composition

Main receives only the role-local capability view it needs; the concrete Platform object may structurally satisfy several role views without becoming a universal Core service locator.
```

随后 Main 才可：

```text
launch(subsystemKey)
```

普通 Runtime launch path只 lookup frozen plan，不重新解释 raw config。

---

## 6. LogicalGameBootstrap vs PlatformLaunchPlan

两者正交：

```text
LogicalGameBootstrap
    complete subsystem keys
    initial subsystemKey/input
    → Main-visible

PlatformLaunchPlan
    resolved executable bindings
    hosting/security preflight facts
    → Platform-private
```

Main 不需要看到 plan；session-scoped concrete Platform instance 持有 plan，并通过其 Main-facing `RuntimeHosting` capability 使用该 plan。`RuntimeHosting` 不再作为 Launcher prepared-result 中漂移的独立长生命周期对象。

不要创建同时暴露 logical + physical material 的万能 DTO。

---

## 7. Business Module vs Runtime Runner

PlatformLaunchPlan 为每个 logical key 选择 current-platform Definition Module。

Host-owned Runner 才是 physical entry：

```text
Hostra
    Node Runner Process
        → selected Hostra Definition Module

PWA
    Dedicated Worker Runner
        → selected PWA Definition Module
```

共享 requirement：

```text
same logical subsystem key
same SubsystemDefinitionFactory ABI
same formal role/protocol semantics
same business-observable result for same logical scenario
```

不要求 same module path/bytes/build artifact。

---

## 8. Host Policy Boundary

Platform Launch Manifest MAY 选择 installation 内 business artifact；不能覆盖 Host-owned policy：

```text
Node executable
Host-owned Runner entry
shell / arbitrary argv / unsafe env
Worker Runner entry / arbitrary external Worker URL
Control endpoint/MessagePort
bootstrap credential
Data ticket/Port
CSP/same-origin/security policy
Supervisor/resource/timeouts
```

Game-supplied config 不能升级为 arbitrary Host code execution authority。

---

## 9. Main-facing RuntimeHosting

```text
Main launch(subsystemKey, LaunchAttemptMaterial)
→ RuntimeHosting lookup frozen PlatformLaunchPlan
→ physical Runner Runtime
→ supervision facts
```

```text
Hostra → Node child process
PWA     → Dedicated Worker
```

RuntimeHosting 不拥有 public Runtime lifecycle/Frame/Data authority。

---

## 10. Role-facing Capabilities

Role-facing capability必须由真实 consumer逐 milestone冻结；下面只列 current/future responsibility placement，不构成 universal `Platform` interface。

```text
System Platform
├── Main-facing
│   ├── DeadlineScheduler
│   ├── RuntimeHosting
│   ├── OpaqueMaterialGenerator
│   └── RendererControlBinding?        // M7 Frozen, optional physical capability
│
├── Renderer-facing (future slices)
│   ├── RendererDataBinding
│   ├── ContentClient
│   └── presentation/input environment
│
└── Subsystem-facing
    ├── RuntimeControlBinding
    ├── SubsystemDataBinding           // M8+
    └── ContentClient                  // M12+
```

M7 `RendererControlBinding` 是 **Main-facing candidate-slot/carrier capability**：

```text
Main issues fresh rendererControlToken
→ RendererControlBinding.acquire(token, signal) arms one candidate slot
→ Platform later binds at most one physical Renderer candidate
→ returns one already-established MessageCarrier<string>
→ renderer-control protocol peer handles hello/version
→ Main alone grants current Renderer authority
```

它不是 Renderer-facing application API，也不是 Renderer launch/show command。Binding 不认证 token、不协商 protocol version、不决定 currentness。

`Renderer hosting` 仍属于 concrete product composition responsibility：Hostra BrowserWindow/PWA Window 如何创建、显示、重载、销毁由 M14/M16 concrete realization决定；M7 不因此冻结 `RendererHosting` 或 `RendererControlHost` public port。

Concrete `HostraPlatform` / `PwaPlatform` object MAY 同时实现多个 role-local capability view；这属于 composition convenience，不等于 `@loomrealm/platform-ports` 定义一个万能 `Platform` contract。Core role 只依赖自己当前真实需要的窄 view。

Launcher package 是 concrete Platform 的 PREPARE / Runner integration component；它可以提供 RuntimeHosting 的内部实现材料，但不能因此吞并 Renderer/Data/Content ports 或 application authority。

---

## 11. Already-connected Carrier

Foundation：

```text
MessageCarrier
```

只表示已经建立的 message pipe。

当前 Control/Data profiles：

```text
one carrier application unit
= one UTF-8 JSON text string
```

Transport Adapter负责 boundary/order/close/loss/no duplicate；不拥有 connection authority/recovery policy。

---

## 12. Dynamic Data Provisioning

Runtime ready 后 DataAuthority 才可能出现或替换，因此 Platform 必须向已运行 Runner 动态交付 fresh physical Data material。

Hostra：

```text
Main DataAuthority(S,G,P)
→ Desktop Broker
→ Runner provisioning IPC
→ one-time endpoint/ticket
→ Data WebSocket
→ SubsystemDataBinding
```

PWA：

```text
Main DataAuthority(S,G,P)
→ PWA Broker creates MessageChannel
→ transfer Renderer endpoint
→ transfer Subsystem endpoint through Worker provisioning
→ role-local bindings
```

Provisioning 不是 Runtime Control / Renderer Control / business payload。

---

## 13. Provisioning Failure Domain

以下不自动失败 Runtime：

```text
Data offer/ticket expired
Data WebSocket connect failure
MessagePort transfer/install failure
same-generation reconnect failure
```

结果只是 current Data unavailable。

Control loss / Runtime exit 才进入 Runtime failure domain。

---

## 14. Platform Realizations

Hostra：

```text
launch.hostra.json
@loomrealm/game-launcher-hostra / HostraLaunchPlan
Node Runner Process
Runtime Control WebSocket
Runner provisioning IPC
BrowserWindow
Renderer Control WebSocket
Data Broker / Data WebSocket
fs + HTTP Content
```

M14 将这些 Desktop physical capability组合成 full E2E；其中 Renderer Control physical realization必须符合 M7 Frozen `RendererControlBinding` candidate-slot/settlement semantics，而不能创建第二套 Host-specific currentness protocol。

PWA：

```text
launch.pwa.json
@loomrealm/game-launcher-pwa / PwaLaunchPlan
Worker Runner
Runtime Control MessagePort
Worker provisioning path
browser Window
Renderer Control MessagePort
Data Broker / MessageChannel
Fetch + Service Worker / OPFS Content
```

M16 必须把上述 PWA Renderer Control + Data provisioning/bindings + Content realization全部接入同一 full logical trace，再做 cross-platform equivalence；不能只实现 Renderer Control transport 就宣告 PWA E2E 完成。

Structured Clone 只用于 Platform bootstrap/Port transfer；application carrier仍发送 string。

---

## 15. Business Portability

```text
@loomrealm/map
    → @loomrealm/subsystem
```

业务 source 不依赖：

```text
@loomrealm/game-package
game-launcher-*
/host
transport
Platform composition
```

Platform-specific artifact MAY 不同；业务不得通过 runtime platform detection 改变 business semantics。

---

## 16. Platform Architecture != Platform Mega-package

完整 Platform Composition：

```text
apps/desktop
    → create HostraPlatform for one Session

apps/pwa
    → create PwaPlatform for one Session
```

Concrete Platform object MAY aggregate current-platform capabilities, but package ownership remains modular. Phase 1 推荐 one Platform instance → one prepared Game → one Main Session；切换 Game / 新 Session 创建 fresh Platform instance。

窄 Runtime launch packages：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

Launcher 新增 Game Entry consumption orchestration 后仍然只解决 Subsystem Runtime PREPARE/launch，不拥有 Renderer/DataBroker/Content product。

---

## 17. Cross-platform Equivalence

共享：

```text
same Game Entry logical topology
same LogicalGameBootstrap semantics
same logical scenario/business input
same formal contracts
```

比较：

```text
Runtime lifecycle
Frame/Activation/outcome/unwind
Renderer authority
Data S/G/Profile lifecycle
Input delivered semantics
Render authoritative replica
Content logical response
business observable state
```

不比较：

```text
module path/bytes
PID vs Worker
WS URL vs MessagePort
IPC payload vs transfer object
HTTP vs Service Worker internals
```

---

## 18. Final Invariants

1. session-scoped concrete Platform instance 是 complete physical Session composition object；Platform architecture / package boundary 仍保持模块化；
2. matching Launcher 是 concrete Platform 内部的 Game PREPARE component / Runtime-product Game Entry consumer；
3. Game Package 是 document validation capability，不是 Runtime role；
4. Game/current-platform key set Phase 1严格相等；
5. PlatformLaunchPlan + LogicalGameBootstrap 在 first Runtime side effect前闭合；
6. Main 不解析 Game Entry、不依赖 Game Package/concrete Launcher；
7. Main 接收 `LogicalGameBootstrap` + Main-facing Platform capability view；具体 Hostra/PWA object 可 structural-satisfy 该 view；
8. Main 只发 logical `launch(subsystemKey)`；
9. Host-owned Runner 与 business Definition Module 分离；
10. Hostra/PWA manifest 独立演化；
11. Launcher package 不扩张为 Platform mega-package；
12. M7 `RendererControlBinding` 是 Main-facing optional candidate-slot/carrier capability，不是 Renderer-facing API或 hosting service；
13. Renderer hosting保持 concrete composition responsibility，M7 不冻结 `RendererHosting` / `RendererControlHost` mega-port；
14. DataConnectionBroker实现 physical carrier但不拥有 Main authority；
15. provisioning独立于 application protocols；
16. Data provisioning failure不等于 Runtime/Frame failure；
17. Control/Data application units统一 UTF-8 JSON text；
18. Hostra/PWA physical mechanism/artifact可不同，但 logical application trace必须等价；M16 full PWA closure必须包含 Renderer/Data/Content physical realization。
