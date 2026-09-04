# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem Runtime Container、PlatformLaunchPlan、Runner、Control/Frame/Input/Render 承载粒度、plan-bound RuntimeHosting / Supervisor，以及 Runtime-owned late Data provisioning handoff  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)  
> 被以下文档细化：[运行时启动系统](./runtime-bootstrap-system.md)、[栈式运行系统](./stack-runtime-system.md)、[Subsystem 模型](./subsystem-model.md)  
> 正式化：[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-09-04

本文只定义 Runtime physical hosting边界。Game Entry validation、Launcher PREPARE、Main authority、Frame authority与 Data authority分别由各自事实源拥有。

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

Runtime application identity来自 `subsystemKey`，不来自 module path、URL、PID、Worker id 或 Launch Attempt id。

Renderer Data carrier不属于 Runtime hosting cardinality；它由 Main DataAuthority + Platform DataConnectionBroker独立管理。

---

## 2. Launcher PREPARE Before Hosting

`RuntimeHosting` 不解析 raw Game Entry / ValidatedGameEntryV1 / Platform Launch Manifest。

在任何 business Runtime side effect 前，current concrete Platform `prepareGame()` MUST 已完成：

```text
Game Entry validation
→ Platform Launch Manifest validation
→ exact key-set join
→ every required executable binding resolution
→ installation/security containment
→ current hosting capability preflight
→ freeze immutable PlatformLaunchPlan
→ project immutable LogicalGameBootstrap
→ concrete Platform installs plan privately
```

任一 PREPARE failure：

```text
business Runtime Container creation = 0
business Definition Module import = 0
Runtime Control establishment = 0
```

---

## 3. LogicalGameBootstrap vs LaunchPlan

```text
LogicalGameBootstrap
    → Main-visible
    → subsystemKeys + initial target/input only

PlatformLaunchPlan
    → Platform-private
    → Map<subsystemKey, ResolvedPlatformImplementation>
```

Main不接收 executable material；session-scoped concrete Platform 持有 immutable plan，并通过 Main-facing `RuntimeHosting` 使用它。

---

## 4. Runtime Container vs Business Module

```text
Runtime Container
    physical isolation + trusted Runner + business instance

Definition Module
    current-platform selected business implementation
    satisfies shared SubsystemDefinitionFactory ABI
```

Hostra：Node child → Host-owned Node Runner → exact Hostra plan module。  
PWA：Dedicated Worker → Host-owned Worker Runner → exact PWA plan module。

Business module不负责 physical hosting/bootstrap，也不读取 Game Entry/Platform manifest。

---

## 5. Runner Responsibility

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
verify own planned subsystemKey/binding
load exact selected Definition Module
validate SubsystemDefinitionFactory ABI
M6 construct RuntimeControlBinding
M8 construct SubsystemDataBinding role seam when supplied
M9 Hostra/PWA provisioning layer feeds that Binding dynamically
M12+ construct ContentClient
invoke runSubsystem(...) with current real capabilities
platform-local diagnostics/cleanup
```

Runner不拥有 Main Frame/Activation/InputTarget/DataAuthority authority，也不重新解释 raw manifests。

---

## 6. Main-facing RuntimeHosting — Shared Contract Unchanged

M5 exact shared port remains：

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

`RuntimeLaunchRequest` only carries logical key + Main-owned bootstrap token。

```text
launch(...)
→ lookup immutable PlatformLaunchPlan[subsystemKey]
→ create exact Host-owned Runner Container
→ inject key/token
→ return one HostedRuntime object for that physical lifetime
```

`HostedRuntime` object identity is now additionally reused by M9 Main→Platform Data authority view as the exact physical target correlation。This does not change RuntimeHosting's public fields and does not expose PID/Worker id to application wire。

Main MUST NOT pass Game Entry、PlatformLaunchPlan、module/path/URL、Node/Worker options、Control/Data endpoint/Port、Renderer/Content material。

---

## 7. Runtime-owned Provisioning Handoff

Because the concrete launcher/RuntimeHosting implementation owns the child, a Platform composition that needs late Data must obtain a child-scoped provisioner from that owner rather than discover the process through a public registry。

Hostra M9 freezes：

```text
RuntimeHosting.launch creates exact child
→ constructs HostedRuntime R
→ constructs HostraRuntimeDataProvisioner P bound to that child
→ optional composition hook receives (R,P)
→ only then launch resolves R
```

The hook is Hostra concrete integration, not a shared `@loomrealm/platform-ports` interface。Desktop may keep a private `WeakMap<HostedRuntime,P>`。

M6/headless composition omits the hook and remains valid。

A fresh Runtime object always gets a fresh provisioner；provisioner lifetime cannot outlive the exact child。

---

## 8. Host Policy Boundary

Platform Launch Manifest MAY select installation-local business artifact；MUST NOT override：

```text
Node executable
Host-owned Node/Worker Runner entry
shell / arbitrary argv / unsafe env
Worker constructor security policy
bootstrap credential source
Control endpoint / MessagePort
Data ticket/Port/provisioning IPC policy
CSP / same-origin policy
Supervisor resource/timeouts
```

```text
select business implementation
!= arbitrary host-code execution authority
```

---

## 9. Physical Termination Fact Boundary

```text
HostedRuntime.terminated resolves
    = actual physical Runtime termination observed

HostedRuntime.terminated rejects
    = termination observation failed
    != stopped proof
```

`requestTermination()` only requests physical termination。PID/Worker/exit diagnostics remain concrete Platform-local until a real portable consumer requires them。

Main interprets physical facts as Runtime lifecycle；Platform cannot select Frame unwind root、Data generation or application recovery。

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

Same-attempt Control reconnect does not exist。Unexpected Control loss without shutdown intent → Runtime failed。

---

## 11. Ready != Data Current

```text
ready != Data current
ready != Renderer exists
ready != Input/Render baseline published
```

Main may derive logical DataAuthority from `ready`, but physical Data installation additionally requires a current Renderer and matching Platform authority view。

---

## 12. Local Frame/Input Context

Runtime may host multiple live local Frame Contexts；public Stack/Activation authority remains Main-owned。

Frame/Input Context lifetime and Render Domain/Data Connection lifetimes are independent。Child-call suspension may retain Frame-scoped Interest configuration；fresh Activation does not reuse old Input State/Event。

---

## 13. Render Domains

Runtime may own `0..N` authoritative Render Domains even with zero active Frame or zero Data carrier。

```text
Frame close != Render Domain close
Frame suspend != Render hide
Data carrier loss != authoritative Render destroy
```

Fresh Data carrier eventually rebuilds Renderer replica through M11 business semantics；M9 itself only closes physical carrier/peer replacement。

---

## 14. Data Provisioning Is Adjacent, Not Runtime Authority

Hostra M9 physical flow：

```text
Runtime already running
→ Main current Data authority view names exact HostedRuntime R
→ Desktop Broker finds R's HostraRuntimeDataProvisioner
→ provision one-time Data WS candidate to Runner
→ Runner connects/holds carrier privately and reports prepared
→ Broker paired install
→ post-install Runner delivery notification
→ SubsystemDataBinding may deliver already-current carrier
```

`SubsystemDataBinding.acquire()` remains a role delivery wait；it does not create candidate or authorize install。

PWA later maps the same abstract lifecycle through Worker provisioning/MessagePort transfer。

---

## 15. Provisioning Delivery Failure Is Not Installation Rollback

Runner IPC `commit`/ack is post-install delivery, not the Broker atomic install point。

Frozen result：

```text
B installed current
→ Runner delivery notification fails
→ B current→retired
→ close/revoke B
→ old A never resurrects
```

This failure does not mutate Main DataAuthority、fail Runtime or unwind Frame。

If provisioning IPC becomes unusable while child/Runtime Control remains alive, Data capability may become unavailable while Runtime continues。

---

## 16. Termination

Normal：

```text
Main shutdown intent
→ subsystem.shutdown
→ bounded wait HostedRuntime.terminated
→ if needed requestTermination()
→ bounded wait HostedRuntime.terminated
→ only resolved termination fact supports stopped
```

Unexpected Runtime exit / Control loss / self-reported failed / fatal Runtime protocol invariant enter Main Runtime failure path。

Runtime failed cannot recover merely because later exit code is 0。No automatic restart；fresh Runtime requires fresh Launch Attempt + credential + Container + Control lifetime。

Any Data provisioner associated with the old HostedRuntime becomes unusable when that child terminates；old Data material must retire independently。

---

## 17. Cross-platform Realization

```text
Hostra Desktop
    LaunchPlan          installation-contained filesystem .mjs
    Runtime Container  Node Runner Process
    Supervisor         child process lifecycle
    Control            WebSocket
    provisioning       Runtime-scoped child IPC + Data WS

PWA
    LaunchPlan          installation/same-origin module URL
    Runtime Container  Worker Runner
    Supervisor         Worker lifecycle
    Control            MessagePort
    provisioning       Worker message/Port transfer
```

Physical topology differs；established Runtime Control、Frame、Data/Input/Render/Content semantics must eventually be equivalent。

---

## 18. Final Invariants

1. one logical subsystemKey has at most one active Runtime Container；
2. Game Package/ValidatedGameEntry are not RuntimeHosting input；
3. PlatformLaunchPlan + LogicalGameBootstrap close before first Runtime side effect；
4. Runtime Container hosts trusted Runner + one selected business Definition instance；
5. Host-owned Runner is physical entry；
6. Main-facing RuntimeHosting shared API remains `{subsystemKey,bootstrapToken} → HostedRuntime`；
7. HostedRuntime object identity may correlate M9 physical Data target without exposing PID/Worker identity；
8. Host policy/credential/security cannot be overridden by Game manifest；
9. Runtime has at most one current Control carrier, no same-attempt reconnect；
10. Supervisor reports physical facts only；`stopped` comes from actual termination；
11. public Frame/Activation/InputTarget/DataAuthority remain Main-owned；
12. Runtime ready does not imply Data current；
13. Runtime owner may expose only a concrete child-scoped provisioner handoff, not Broker policy or public registry；
14. Data provisioning/loss/post-install delivery failure does not directly equal Runtime failure/Frame unwind；
15. post-install delivery failure retires new Data current and never rolls back old current；
16. Hostra/PWA hosting/artifact may differ, but Subsystem ABI/formal observable semantics remain shared。
