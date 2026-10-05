# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving；M6/M9 consumed RuntimeHosting boundaries implemented/qualified；Realm State binding target not implemented / not qualified  
> 主要定义：Subsystem Runtime Container、PlatformLaunchPlan、Runner、Control/Frame/Input/Render/Content/Realm State 承载粒度、plan-bound RuntimeHosting / Supervisor，以及 Runtime-owned late Data provisioning handoff  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[Realm State](./realm-state-system.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)  
> 相关：[ADR 0033](../decisions/0033-electron-hostra-run-as-node.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
> 被以下文档细化：[运行时启动系统](./runtime-bootstrap-system.md)、[栈式运行系统](./stack-runtime-system.md)、[Subsystem 模型](./subsystem-model.md)  
> 正式化：[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)、[Realm State v1](../15-contracts/realm-state-v1.md)、[Hostra Game Launcher / Node Runner Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)  
> 最近复核：2026-10-05

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
    → one Runtime-scoped RealmStateClient capability while live
```

Runtime application identity来自 `subsystemKey`，不来自 module path、URL、PID、Worker id、Window id 或 Launch Attempt id。

Renderer Data carrier不属于 Runtime hosting cardinality；它由 Main `DataAuthority` + concrete DataConnectionBroker独立管理。

RealmStateAuthority 也不属于单个 Runtime Container。它是 Session-scoped sibling authority；每个 Runtime 只持有自己的 Runtime-scoped client binding。

---

## 2. Launcher PREPARE Before Hosting

`RuntimeHosting` 不解析 raw Game Entry / ValidatedGameEntryV1 / Platform Launch Manifest / Realm State initial definition。

任何 business Runtime side effect 前，matching Launcher/launch profile + Session composition MUST 已完成：

```text
Game Entry validation including optional state
→ Platform Launch Manifest validation
→ exact Subsystem key-set join
→ required executable binding resolution
→ installation/security containment
→ current hosting capability preflight
→ immutable PlatformLaunchPlan
→ immutable LogicalGameBootstrap
→ immutable Realm State initial definition
→ fresh RealmStateAuthority bootstrap
→ Realm State READY
```

任一 PREPARE/State bootstrap failure：

```text
business Runtime Container creation = 0
business Definition Module import = 0
Runtime Control establishment = 0
```

`LogicalGameBootstrap`只给 Main；`PlatformLaunchPlan`由 concrete product/runtime composition私有持有；Realm State definition由 Session/Realm State bootstrap owner消费，MUST NOT 通过 RuntimeHosting launch request传给 Main/Runner。

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

Business module不负责 physical hosting/bootstrap，不读取 Game Entry/Platform manifest，不创建第二 Runtime，也不创建/host RealmStateAuthority。

---

## 4. Runner Responsibility

```text
PlatformLaunchPlan + runtime bootstrap/provisioning
        ↓
Host-owned Runner
        ↓
selected Definition Module
        ↓
role-local capabilities
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
construct/bind RealmStateClient from Session-owned Realm State capability
invoke runSubsystem(...) with current capabilities
platform-local diagnostics/cleanup
```

Runner不拥有 Main Frame/Activation/InputTarget/DataAuthority authority，也不拥有 RealmStateAuthority，不重新解释 manifests/state definition。

RealmStateClient physical binding MAY 是 same-process object、MessagePort/IPC-backed client 或其他 platform-private realization；Runner只安装 role-local capability，不重新实现 OCC/lifetime/evidence semantics。

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
→ inject key/token + composition-owned role capabilities
→ return one HostedRuntime for that physical lifetime
```

`HostedRuntime` object identity MAY correlate M9 physical Data target without exposing PID/Worker id to application wire。

Main MUST NOT pass：

```text
Game Entry
Realm State initial definition
Realm State business values
PlatformLaunchPlan
module/path/URL
Node/Worker options
Control/Data/Realm State endpoint/Port
Renderer/Content material
```

Realm State binding injection is concrete composition/Runner bootstrap responsibility, not Main launch-request material。

---

## 6. Runtime-owned Data Provisioning Handoff

A composition needing late Renderer Data obtains a child-scoped provisioner from the Runtime owner；它不得通过 public process registry发现 child。

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

Realm State binding不使用这个 Data provisioner：它是 Runtime-scoped Session capability，不依赖 current Renderer/DataAuthority generation。

---

## 7. Realm State Binding Boundary

Realm State bootstrap顺序：

```text
PREPARE complete
→ Session creates fresh RealmStateAuthority
→ install Game initial baseline + optional Load overrides
→ Realm State READY
→ composition can create per-Runtime RealmStateClient binding
→ Runtime Container / business Definition may start
```

必须保持：

```text
business Definition import/initialize side effect
    ⇒ Realm State READY
```

RealmStateClient lifetime：

```text
Runtime live
    → client live

Frame suspend/close
    → client unchanged

Data carrier retire/reconnect
    → client unchanged

Renderer reload
    → client unchanged

Runtime terminal
    → this Runtime's client/subscriptions terminal/inert

RealmStateAuthority fatal
    → Session terminal
```

RuntimeHosting 不拥有 Realm State Record namespace/value/version，也不定义 subscription/retry/OCC policy。

---

## 8. Host Policy Boundary

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
Realm State authority endpoint/credential/persistence policy
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

## 9. Physical Termination Fact Boundary

```text
HostedRuntime.terminated resolves
    = actual physical Runtime termination observed

HostedRuntime.terminated rejects
    = termination observation failed
    != stopped proof
```

`requestTermination()` only requests physical termination。PID/Worker/exit diagnostics remain concrete composition-local until a portable consumer requires them。

Main interprets physical facts as Runtime lifecycle；Platform cannot choose Frame unwind root、Data generation or Realm State business recovery policy。

Runtime terminal MUST trigger owned RealmStateClient/subscription teardown; it MUST NOT terminate shared RealmStateAuthority while other Session participants remain live。

---

## 10. Runtime Control Carrier

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

Realm State client binding is independent of Runtime Control message namespace；Control loss may eventually terminal the Runtime/client through owner chain, but Realm State requests MUST NOT be multiplexed as Control RPC。

---

## 11. Ready != Data Current

```text
ready != Data current
ready != Renderer exists
ready != Input/Render baseline published
```

Main may derive logical DataAuthority from ready，but physical Data installation additionally requires current Renderer + matching authority view。

Realm State is different：State READY + client binding are bootstrap prerequisites for business Runtime side effects，not a Data-current consequence。

---

## 12. Frame / Input / Render / Realm State Lifetime Independence

Runtime may host multiple local Frame/Input Contexts and `0..N` authoritative Render Domains。

```text
Frame close != Render Domain close
Frame suspend != Render hide
Frame close != RealmStateClient close
Data carrier loss != authoritative Render destroy
Data carrier loss != Realm State loss
fresh Activation != reuse old Input State/Event
```

Public Stack/Activation/InputTarget authority remains Main-owned。

Realm State `commit()` from Frame-scoped business execution仍受 Subsystem existing mutation admission/gate；Realm State OCC 不替代该 control-flow gate。

Fresh Data carrier eventually rebuilds Renderer replica through M11 semantics；M9 only manages physical candidate/current carrier replacement。

---

## 13. Data Provisioning Is Adjacent, Not Runtime Authority

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

Realm State binding MUST NOT participate in Data candidate/current replacement or same-generation reconnect。

---

## 14. Provisioning Delivery Failure Is Not Installation Rollback

Runner IPC commit/ack is post-install Data delivery, not Broker atomic install point。

Frozen result：

```text
B installed current
→ Runner delivery notification fails
→ B current→retired
→ close/revoke B
→ old A never resurrects
```

This failure does not mutate Main DataAuthority、fail Runtime、unwind Frame or reset Realm State。

Provisioning IPC may become unavailable while Runtime Control/child/Realm State client remain healthy；Data capability can be unavailable while Runtime continues。

---

## 15. Same-generation Data Reconnect

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
Realm State reset/client replacement
reuse old Input state
reuse old Render patch base
```

Renderer replacement/reload is a different lifetime transition，但同样不替换 Session RealmStateAuthority。

---

## 16. Runtime Termination

Normal Main-owned Runtime shutdown：

```text
Main shutdown intent
→ subsystem.shutdown
→ bounded wait HostedRuntime.terminated
→ if needed requestTermination()
→ bounded wait HostedRuntime.terminated
→ only resolved termination fact supports stopped
```

Unexpected Runtime exit / Control loss / self-reported failed / fatal protocol invariant enters Main Runtime failure path。No automatic restart；fresh Runtime requires fresh Launch Attempt + credential + Container + Control lifetime + fresh Runtime-scoped RealmStateClient binding。

Any provisioner/client binding bound to old HostedRuntime becomes unusable when that child terminates；Data retirement remains independently owned by Data path。Shared RealmStateAuthority remains Session-owned unless Session itself terminals。

M15 product-level `SIGTERM/window/RPC` funnel lives **outside** RuntimeHosting and converges into this existing Main/RuntimeHosting chain；Desktop must not add a second direct Runner-kill authority。

---

## 17. Cross-platform Realization

```text
Hostra launch profile under ordinary Node composition
    LaunchPlan          installation-contained filesystem .mjs
    Runtime Container  process.execPath Node Runner child
    Supervisor         child process lifecycle
    Control            WebSocket
    Data provisioning  Runtime-scoped child IPC + Data WS
    Realm State        Session authority + private Runtime binding

Conditional Electron composition (ADR0033)
    only when RuntimeHosting composition process itself is Electron
    same LaunchPlan / Runtime model
    process.execPath enters Node mode via host-owned ELECTRON_RUN_AS_NODE=1

Canonical M15 Desktop (ADR0034)
    Hostra shell        external Electron / BrowserWindow / direct HOSTRA_SUBCMD owner
    LoomRealm Desktop   plain Node HOSTRA_SUBCMD
    Runtime Container  ordinary Node Hostra launch-profile Runner child
    Control/provision   existing Hostra launch-profile mechanics
    Realm State        future in-process authority/binding target

PWA
    LaunchPlan          same-origin module URL
    Runtime Container  Worker Runner
    Supervisor         Worker lifecycle
    Control            MessagePort
    Data provisioning  Worker message/Port transfer
    Realm State        same/shared Worker or separate private binding; logical semantics identical
```

External Hostra shell ownership does not create a third Runtime or Realm State model。Physical placement MAY differ；logical RealmStateClient contract remains shared。

---

## 18. M15 / M16 / M17 Placement

```text
M15
    external Hostra shell
    → HOSTRA_SUBCMD LoomRealm Desktop
    → RuntimeHosting
    → Runner

M16
    PWA PREPARE
    → Worker RuntimeHosting vertical only

M17
    completes PWA Renderer/Data/Content/Input/Web Presentation
    → logical/business outcome equivalence with M15
```

Realm State is a separate pre-implementation track；本文仅同步 future role placement，不把 M15–M17 historical qualification扩大为 Realm State evidence。

Hostra shell RPC、Window lifecycle、loopback trusted-shell bootstrap、OS-signal handling are Desktop product mechanics and do not enter RuntimeHosting contract or PWA requirements。

---

## 19. Final Invariants

1. one logical subsystemKey has at most one active Runtime Container；
2. Game Package/raw manifests/Realm State initial definition are not RuntimeHosting launch input；
3. PlatformLaunchPlan + Main/Realm State prepared projections close before business Runtime side effects；Realm State READY before Runtime business side effects；
4. Runtime Container hosts trusted Runner + one selected business Definition instance；
5. Runner installs role-local RealmStateClient but does not own RealmStateAuthority；
6. Main-facing RuntimeHosting remains `{subsystemKey,bootstrapToken} → HostedRuntime`；
7. Main launch request不携 Realm State business/transport material；
8. HostedRuntime may correlate M9 physical Data target without exposing PID/Worker identity；
9. Game/manifest cannot override host executable/security/credential/Realm State physical policy；
10. Runtime has at most one current Control carrier, no same-attempt reconnect；
11. `stopped` comes only from actual termination observation；
12. Frame/Activation/InputTarget/DataAuthority remain Main-owned；RealmStateAuthority remains Session-owned；
13. Runtime ready does not imply Data current；Realm State client is independent of Data current；
14. Runtime owner may expose concrete child-scoped Data provisioner handoff, not public registry/Broker policy；
15. Data provisioning/loss/delivery failure does not equal Runtime failure/Frame unwind/Realm State reset；
16. same-generation Data reconnect keeps the same Renderer logical participant and Realm State client；
17. Runtime terminal terminals its RealmStateClient/subscriptions but does not independently destroy Session authority；
18. Hostra/PWA physical hosting may differ while shared Realm State logical semantics remain stable；
19. M15 product termination converges through Main/RuntimeHosting rather than creating a second Runner kill authority。
