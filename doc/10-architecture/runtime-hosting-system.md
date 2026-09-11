# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving；M6/M9 consumed RuntimeHosting boundaries implemented/qualified  
> 主要定义：Subsystem Runtime Container、PlatformLaunchPlan、Runner、Control/Frame/Input/Render 承载粒度、plan-bound RuntimeHosting / Supervisor，以及 Runtime-owned late Data provisioning handoff  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)  
> 相关：[ADR 0033](../decisions/0033-electron-hostra-run-as-node.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
> 被以下文档细化：[运行时启动系统](./runtime-bootstrap-system.md)、[栈式运行系统](./stack-runtime-system.md)、[Subsystem 模型](./subsystem-model.md)  
> 正式化：[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)、[Hostra Game Launcher / Node Runner Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)  
> 最近复核：2026-09-11

本文只定义 **LoomRealm Runtime physical hosting boundary**。External Desktop shell/window ownership不属于 RuntimeHosting。Canonical M15 outer topology由 ADR0034 + `M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md`拥有。

术语固定：

```text
Hostra shell
    external lithdoo/hostra Electron host

Hostra launch profile
    @loomrealm/game-launcher-hostra PREPARE + Node Runner realization

LoomRealm Desktop process
    M15 Hostra HOSTRA_SUBCMD plain Node child

Runner
    LoomRealm RuntimeHosting child / Worker container
```

---

## 1. Hosting Granularity

```text
one logical subsystemKey
    → at most one active Runtime Container

one Runtime Container
    → one Host-owned Subsystem Runner
    → one platform-planned business Definition Module instance
    → 0..N local Frame/Input Contexts
    → 0..N Render Domains
    → 0..1 current Main Control carrier
```

Runtime application identity来自 `subsystemKey`，不来自 module path、URL、PID、Worker id、Window id 或 Launch Attempt id。

Renderer Data carrier不属于 Runtime hosting cardinality；它由 Main `DataAuthority` + concrete DataConnectionBroker独立管理。

---

## 2. Launcher PREPARE Before Hosting

`RuntimeHosting` 不解析 raw Game Entry / ValidatedGameEntryV1 / Platform Launch Manifest。

任何 business Runtime side effect 前，matching Launcher/launch profile MUST 已完成：

```text
Game Entry validation
→ Platform Launch Manifest validation
→ exact key-set join
→ required executable binding resolution
→ installation/security containment
→ current hosting capability preflight
→ immutable PlatformLaunchPlan
→ immutable LogicalGameBootstrap
```

任一 PREPARE failure：

```text
business Runtime Container creation = 0
business Definition Module import = 0
Runtime Control establishment = 0
```

`LogicalGameBootstrap`只给 Main；`PlatformLaunchPlan`由 concrete product/runtime composition私有持有。

---

## 3. Runtime Container vs Business Module

```text
Runtime Container
    physical isolation + trusted Runner + business instance

Definition Module
    current-platform selected business implementation
    satisfies shared SubsystemDefinitionFactory ABI
```

Hostra launch profile：Node child → trusted Node Runner → exact planned `.mjs`。  
PWA：Dedicated Worker → trusted Worker Runner → exact planned module。

Business module不负责 physical hosting/bootstrap，不读取 Game Entry/Platform manifest，不创建第二 Runtime。

---

## 4. Runner Responsibility

```text
PlatformLaunchPlan + bootstrap/provisioning
        ↓
Host-owned Runner
        ↓
selected Definition Module
        ↓
Subsystem-facing Platform Ports
        ↓
@loomrealm/subsystem/host
        ↓
Business Definition
```

Runner负责：

```text
verify planned subsystemKey/binding
load exact selected Definition Module
validate SubsystemDefinitionFactory ABI
construct RuntimeControlBinding
construct SubsystemDataBinding when supplied
accept Runtime-scoped late Data provisioning
construct ContentClient when supplied
invoke runSubsystem(...) with current capabilities
platform-local diagnostics/cleanup
```

Runner不拥有 Main Frame/Activation/InputTarget/DataAuthority authority，也不重新解释 manifests。

---

## 5. Main-facing RuntimeHosting — Shared Contract

M5 shared port remains：

```ts
interface RuntimeLaunchRequest {
  readonly subsystemKey: string;
  readonly bootstrapToken: string;
}

interface MainRuntimeControlBinding {
  acquire(signal: AbortSignal): Promise<MessageCarrier>;
}

interface HostedRuntime {
  readonly runtimeControl: MainRuntimeControlBinding;
  readonly terminated: Promise<void>;
  requestTermination(signal: AbortSignal): Promise<void>;
}

interface RuntimeHosting {
  launch(request: RuntimeLaunchRequest, signal: AbortSignal): Promise<HostedRuntime>;
}
```

```text
launch(...)
→ lookup immutable PlatformLaunchPlan[subsystemKey]
→ create exact Runner Container
→ inject key/token
→ return one HostedRuntime for that physical lifetime
```

`HostedRuntime` object identity MAY correlate M9 physical Data target without exposing PID/Worker id to application wire。

Main MUST NOT pass Game Entry、PlatformLaunchPlan、module/path/URL、Node/Worker options、Control/Data endpoint/Port、Renderer/Content material。

---

## 6. Runtime-owned Provisioning Handoff

A composition needing late Data obtains a child-scoped provisioner from the Runtime owner；它不得通过 public process registry发现 child。

Hostra launch-profile M9 flow：

```text
RuntimeHosting.launch creates exact child
→ constructs HostedRuntime R
→ constructs RuntimeDataProvisioner P bound to that child
→ optional concrete composition hook receives (R,P)
→ only then launch resolves R
```

The hook is concrete integration, not a shared `@loomrealm/platform-ports` interface。Desktop may keep private `WeakMap<HostedRuntime,P>`。

Fresh Runtime object → fresh provisioner；provisioner不得 outlive exact child。

---

## 7. Host Policy Boundary

Platform Launch Manifest MAY select installation-local business artifact；MUST NOT override：

```text
Node/Runner executable
Runner entry
shell / arbitrary argv / unsafe env
Electron run-as-node mode
Worker constructor security policy
bootstrap credential source
Control endpoint / MessagePort
Data ticket/Port/provisioning IPC policy
Content credential
Supervisor resource/timeouts
```

```text
select business implementation
!= arbitrary host-code execution authority
```

ADR0033 defines one **conditional** execution fact：

```text
IF the trusted RuntimeHosting composition process itself is Electron
THEN
    Runner executable remains canonical process.execPath
    host synthesizes ELECTRON_RUN_AS_NODE=1 for the exact Runner child
    supported Electron build keeps runAsNode fuse enabled
```

Game/manifest cannot request or configure this mode。

Canonical M15 does **not** satisfy that precondition：ADR0034 places LoomRealm Desktop RuntimeHosting in a plain Node `HOSTRA_SUBCMD` process beneath the external Hostra shell。Therefore M15 Runner startup uses the ordinary Node branch of the same Hostra launch profile。

---

## 8. Physical Termination Fact Boundary

```text
HostedRuntime.terminated resolves
    = actual physical Runtime termination observed

HostedRuntime.terminated rejects
    = termination observation failed
    != stopped proof
```

`requestTermination()` only requests physical termination。PID/Worker/exit diagnostics remain concrete composition-local until a portable consumer requires them。

Main interprets physical facts as Runtime lifecycle；Platform cannot choose Frame unwind root、Data generation or recovery policy。

---

## 9. Runtime Control Carrier

One Launch Attempt has at most one successful identified Control Connection：

```text
starting
→ physical carrier establishment
→ connected
→ subsystem.hello
→ identified
→ optional initializing
→ ready
```

Same-attempt Control reconnect does not exist。Unexpected Control loss without shutdown intent → Runtime failure path。

---

## 10. Ready != Data Current

```text
ready != Data current
ready != Renderer exists
ready != Input/Render baseline published
```

Main may derive logical DataAuthority from ready，but physical Data installation additionally requires current Renderer + matching authority view。

---

## 11. Frame / Input / Render Lifetime Independence

Runtime may host multiple local Frame/Input Contexts and `0..N` authoritative Render Domains。

```text
Frame close != Render Domain close
Frame suspend != Render hide
Data carrier loss != authoritative Render destroy
fresh Activation != reuse old Input State/Event
```

Public Stack/Activation/InputTarget authority remains Main-owned。

Fresh Data carrier eventually rebuilds Renderer replica through M11 semantics；M9 only manages physical candidate/current carrier replacement。

---

## 12. Data Provisioning Is Adjacent, Not Runtime Authority

Hostra launch-profile physical flow：

```text
Runtime already running
→ Main current DataAuthority names exact HostedRuntime R
→ Desktop Broker finds R-bound provisioner
→ provision one-time Data WS candidate to Runner
→ Runner connects/holds carrier and reports prepared
→ Broker paired install
→ post-install Runner delivery notification
→ SubsystemDataBinding delivers current carrier
```

`SubsystemDataBinding.acquire()` is role delivery wait；it does not create candidate or authorize install。

PWA later maps the same logical lifecycle through Worker/MessagePort transfer。

---

## 13. Provisioning Delivery Failure Is Not Installation Rollback

Runner IPC commit/ack is post-install delivery, not Broker atomic install point。

Frozen result：

```text
B installed current
→ Runner delivery notification fails
→ B current→retired
→ close/revoke B
→ old A never resurrects
```

This failure does not mutate Main DataAuthority、fail Runtime or unwind Frame。

Provisioning IPC may become unavailable while Runtime Control/child remain healthy；Data capability can be unavailable while Runtime continues。

---

## 14. Same-generation Data Reconnect

```text
carrier A current
→ physical loss / retired
→ Main DataAuthority unchanged
→ same Renderer Control participant remains current
→ Broker provisions fresh physical carrier B
→ fresh RendererDataBinding.acquire()
→ fresh baseline/current truth
```

It MUST NOT imply：

```text
fresh Renderer identity
Runtime restart
Frame resume/restart
reuse old Input state
reuse old Render patch base
```

Renderer replacement/reload is a different lifetime transition。

---

## 15. Runtime Termination

Normal Main-owned Runtime shutdown：

```text
Main shutdown intent
→ subsystem.shutdown
→ bounded wait HostedRuntime.terminated
→ if needed requestTermination()
→ bounded wait HostedRuntime.terminated
→ only resolved termination fact supports stopped
```

Unexpected Runtime exit / Control loss / self-reported failed / fatal protocol invariant enters Main Runtime failure path。No automatic restart；fresh Runtime requires fresh Launch Attempt + credential + Container + Control lifetime。

Any provisioner bound to old HostedRuntime becomes unusable when that child terminates；Data retirement remains independently owned by Data path。

M15 product-level `SIGTERM/window/RPC` funnel lives **outside** RuntimeHosting and converges into this existing Main/RuntimeHosting chain；Desktop must not add a second direct Runner-kill authority。

---

## 16. Cross-platform Realization

```text
Hostra launch profile under ordinary Node composition
    LaunchPlan          installation-contained filesystem .mjs
    Runtime Container  process.execPath Node Runner child
    Supervisor         child process lifecycle
    Control            WebSocket
    provisioning       Runtime-scoped child IPC + Data WS

Conditional Electron composition (ADR0033)
    only when RuntimeHosting composition process itself is Electron
    same LaunchPlan / Runtime model
    process.execPath enters Node mode via host-owned ELECTRON_RUN_AS_NODE=1

Canonical M15 Desktop (ADR0034)
    Hostra shell        external Electron / BrowserWindow / direct HOSTRA_SUBCMD owner
    LoomRealm Desktop   plain Node HOSTRA_SUBCMD
    Runtime Container  ordinary Node Hostra launch-profile Runner child
    Control/provision   existing Hostra launch-profile mechanics

PWA
    LaunchPlan          same-origin module URL
    Runtime Container  Worker Runner
    Supervisor         Worker lifecycle
    Control            MessagePort
    provisioning       Worker message/Port transfer
```

External Hostra shell ownership does not create a third Runtime model。M15 only changes outer physical composition；M6/M9 RuntimeHosting contracts remain the same。

---

## 17. M15 / M16 / M17 Placement

```text
M15
    external Hostra shell
    → HOSTRA_SUBCMD LoomRealm Desktop
    → this RuntimeHosting
    → Runner

M16
    PWA PREPARE
    → Worker RuntimeHosting vertical only

M17
    completes PWA Renderer/Data/Content/Input/Web Presentation
    → logical/business outcome equivalence with M15
```

Hostra shell RPC、Window lifecycle、loopback trusted-shell bootstrap、OS-signal handling are Desktop product mechanics and do not enter this RuntimeHosting contract or PWA requirements。

---

## 18. Final Invariants

1. one logical subsystemKey has at most one active Runtime Container；
2. Game Package/raw manifests are not RuntimeHosting input；
3. PlatformLaunchPlan + LogicalGameBootstrap close before first Runtime side effect；
4. Runtime Container hosts trusted Runner + one selected business Definition instance；
5. Runner is the physical entry for business Runtime；
6. Main-facing RuntimeHosting remains `{subsystemKey,bootstrapToken} → HostedRuntime`；
7. HostedRuntime may correlate M9 physical target without exposing PID/Worker identity；
8. Game/manifest cannot override host executable/security/credential policy；
9. Runtime has at most one current Control carrier, no same-attempt reconnect；
10. `stopped` comes only from actual termination observation；
11. Frame/Activation/InputTarget/DataAuthority remain Main-owned；
12. Runtime ready does not imply Data current；
13. Runtime owner may expose concrete child-scoped provisioner handoff, not public registry/Broker policy；
14. Data provisioning/loss/delivery failure does not equal Runtime failure/Frame unwind；
15. post-install delivery failure retires new Data current and never resurrects old current；
16. same-generation Data reconnect keeps the same Renderer logical participant；
17. Hostra/PWA physical hosting may differ while shared logical semantics remain stable；
18. ADR0033 is conditional on an Electron RuntimeHosting composition process；ADR0034 defines canonical M15 outer host and does not make LoomRealm Desktop Electron-owned；
19. M15 product termination converges through Main/RuntimeHosting rather than creating a second Runner kill authority。
