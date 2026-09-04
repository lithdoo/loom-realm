# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨平台 composition boundary、Launcher-owned Game Entry PREPARE、Platform Launch Manifest/Plan、Runtime Runner、role-facing ports、DataConnectionBroker/provisioning，以及 Hostra/PWA 对同一 logical Session 的 realization  
> 依赖：[系统架构总览](./system-overview.md)、[ADR 0017](../decisions/0017-system-level-platform-composition.md)、[ADR 0019](../decisions/0019-platform-launch-manifest-boundary.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)  
> 被以下文档细化：[运行承载系统](./runtime-hosting-system.md)、[运行时启动系统](./runtime-bootstrap-system.md)、[通信系统](./communication-system.md)  
> 被以下文档实现：[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 最近复核：2026-09-04

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
Main → Platform Data installation authority feed
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

Tooling MAY直接消费 Game Package，但不改变 Runtime-product ownership。

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

Platform Launch Manifest MAY选择 installation 内 business artifact；不能覆盖 Host-owned policy：

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

Game-supplied config不能升级为 arbitrary Host code execution authority。

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
│   ├── RendererControlBinding?          // M7 Frozen
│   └── DataConnectionAuthoritySink?     // M9 Frozen
│
├── Renderer-facing
│   ├── RendererDataBinding              // M8 Frozen role seam
│   ├── ContentClient                    // M12+
│   └── presentation/input environment
│
└── Subsystem-facing
    ├── RuntimeControlBinding
    ├── SubsystemDataBinding             // M8 Frozen role seam
    └── ContentClient                    // M12+
```

M7 `RendererControlBinding` 是 Main-facing candidate-slot/carrier capability：

```text
Main issues fresh rendererControlToken
→ RendererControlBinding.acquire(token, signal) arms one candidate slot
→ Platform later binds at most one physical Renderer candidate
→ returns one already-established MessageCarrier<string>
→ renderer-control protocol peer handles hello/version
→ Main alone grants current Renderer authority
```

它不是 Renderer-facing application API，也不是 Renderer launch/show command。Binding 不认证 token、不协商 protocol version、不决定 currentness。

M9 `DataConnectionAuthoritySink` 是 Main-facing **full-view physical installation fact sink**：

```text
Main current Renderer + exact ready Runtime/DataAuthority facts
→ replace(view)
→ Platform may install only candidates matching that latest view
```

Frozen rules：

```text
replace is synchronous / non-blocking / non-throwing
replace(null) means no Renderer Data installation authority
sink first replaces in-memory authority view, then physical cleanup converges asynchronously
Renderer acquire/ticket/socket cannot create authority
```

Current accepted Renderer token may be retained by Main only as inert physical correlation after its one-shot authentication use is consumed。Exact Runtime target is the existing `HostedRuntime` object identity。

`Renderer hosting` remains concrete product responsibility：Hostra BrowserWindow/PWA Window creation/show/reload/destroy are M14/M16 work；M7/M9 do not create a universal `RendererHosting` port。

Concrete `HostraPlatform` / `PwaPlatform` MAY structurally satisfy multiple role-local views；this is composition convenience, not a universal Platform service locator。

Launcher packages remain PREPARE / Runner integration components；they do not absorb Renderer/DataBroker/Content policy。

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

Transport Adapter负责 boundary/order/close/loss/no duplicate；不拥有 application authority/recovery policy。

---

## 12. Dynamic Data Provisioning

Runtime ready 后 Main 才可能拥有 DataAuthority；physical installation additionally requires a current Renderer participant。

Hostra M9：

```text
Main current Renderer + DataAuthority(S,G,P) + exact HostedRuntime R
→ DataConnectionAuthoritySink.replace(full view)
→ Desktop Broker
→ two-sided one-time loopback Data WS candidate
→ Renderer endpoint prepared
+ exact R → HostraRuntimeDataProvisioner.prepare(...)
→ Runner endpoint prepared
→ Broker commit-time latest-view revalidation
→ sole-current paired install
→ post-install Renderer/Runner Binding delivery
```

`@loomrealm/game-launcher-hostra` may expose only Runtime-scoped provisioner mechanics because it owns the child。`apps/desktop` owns Broker policy and may keep a private exact-object `HostedRuntime → provisioner` mapping。

PWA target：

```text
Main full authority view
→ PWA Broker creates MessageChannel
→ transfer Renderer endpoint
→ transfer Subsystem endpoint through Worker provisioning
→ paired install / role-local bindings
```

PWA mapping remains M16 physical qualification；M9 does not build symmetry abstractions for it。

Provisioning is not Runtime Control / Renderer Control / Data application payload。

---

## 13. Installation / Delivery Failure Domain

Candidate establishment before install：

```text
endpoint/ticket/WS connect/prepare failure
→ dispose candidate
→ no Connection instance
```

After Broker logical install, Hostra Runner delivery notification can still fail：

```text
B installed current
→ Runner post-install commit delivery fails
→ B current→retired
→ close/revoke B
→ old A is never resurrected
```

The following do not directly fail Runtime or unwind Frame：

```text
Data candidate failure
authority-race rejection
Data WS loss
same-generation replacement/reconnect failure
Runner provisioning IPC loss while Runtime Control remains valid
post-install Data delivery failure
```

Actual Runtime process/Control failure remains Runtime failure domain。

---

## 14. Platform Realizations

Hostra：

```text
launch.hostra.json
@loomrealm/game-launcher-hostra / HostraLaunchPlan
Node Runner Process
Runtime Control WebSocket
Runtime-scoped Runner provisioning IPC/provisioner
BrowserWindow
Renderer Control WebSocket
Desktop Data Broker / two-sided Data WebSocket relay
fs + HTTP Content
```

M9 freezes/implements the Desktop Broker + Runner provisioning core with deterministic physical Renderer hosting。M14 composes it with the real BrowserWindow/Renderer Control/Input/Render/Content product path。

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

M16 must include complete PWA Renderer Control + Data provisioning/bindings + Content before claiming full equivalence。

Structured Clone is only Platform bootstrap/provisioning transfer；application carrier units remain strings。

---

## 15. Business Portability

```text
@loomrealm/map
    → @loomrealm/subsystem
```

Business source does not depend on：

```text
@loomrealm/game-package
game-launcher-*
/host
transport
Platform composition
```

Platform-specific artifact MAY differ；business must not branch semantics by runtime platform detection。

---

## 16. Platform Architecture != Platform Mega-package

Complete composition roots：

```text
apps/desktop
apps/pwa
```

Concrete Platform objects MAY aggregate current-platform capabilities, but package ownership remains modular。Phase 1 uses one prepared Game + one Main Session per session-scoped Platform instance。

Narrow Runtime launch packages：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

M9 is the first real reason to materialize `apps/desktop` workspace；this does not imply full Electron product completion before M14。

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

M9 alone does not claim full Data Connection platform equivalence；PWA mapping and M10/M11 child publication semantics remain later gates。

---

## 18. Final Invariants

1. session-scoped concrete Platform instance is complete physical Session composition boundary；package ownership remains modular；
2. matching Launcher is Platform-internal Game PREPARE / Runtime integration component；
3. Game Package is document validation, not Runtime role；
4. Game/current-platform key sets are equal in Phase 1；
5. PlatformLaunchPlan + LogicalGameBootstrap close before first Runtime side effect；
6. Main does not parse Game Entry or depend on concrete Launcher；
7. Main consumes LogicalGameBootstrap + narrow Main-facing capabilities；
8. RuntimeHosting accepts only logical launch attempt material and does not own Data authority；
9. Host-owned Runner and business Definition Module remain separate；
10. M7 RendererControlBinding remains optional candidate-slot/carrier capability；
11. M9 DataConnectionAuthoritySink is optional full-view fact sink, synchronous/non-blocking/non-throwing；
12. Renderer token retention after hello is inert correlation only, not credential reuse；
13. exact HostedRuntime object identity binds physical Data target；
14. apps/desktop owns Desktop Broker; Hostra launcher owns only Runtime-scoped provisioner mechanics；
15. Broker paired installation precedes post-install role delivery；delivery failure retires new current without rollback；
16. one Data relay side terminal retires whole pair；
17. provisioning is separate from application protocols；
18. Data provisioning/loss does not directly equal Runtime/Frame failure；
19. Control/Data application units are UTF-8 JSON text strings；
20. Hostra/PWA physical mechanisms may differ, but full equivalence is claimed only after later platform/profile gates。
