# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem Runtime Container、PlatformLaunchPlan、Runner、Control/Frame/Input/Render 的承载粒度，以及 plan-bound RuntimeHosting / Supervisor 边界  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)  
> 被以下文档细化：[运行时启动系统](./runtime-bootstrap-system.md)、[栈式运行系统](./stack-runtime-system.md)、[Subsystem 模型](./subsystem-model.md)  
> 正式化：[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-28

本文只定义 Runtime physical hosting 边界。Game Entry document validation、Launcher PREPARE、Main authority、Frame authority与 Data authority分别由各自事实源拥有。

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

Renderer Data carrier不属于 Runtime hosting cardinality；它由 DataAuthority/Broker独立管理。

---

## 2. Launcher PREPARE Before Hosting

`RuntimeHosting` 不解析：

```text
raw Game Entry
ValidatedGameEntryV1
Platform Launch Manifest
```

Main 也不解析/接收这些 document types。

在任何 business Runtime side effect 前，current concrete Platform `prepareGame()` MUST 已通过 matching Launcher component 完成：

```text
Game Entry validation via @loomrealm/game-package
→ Platform Launch Manifest validation
→ exact Game↔Platform key-set join
→ every required executable binding resolution
→ installation/security containment
→ current hosting capability preflight
→ freeze immutable PlatformLaunchPlan
→ project immutable LogicalGameBootstrap
→ concrete Platform installs the plan privately
```

任一 PREPARE failure：

```text
business Runtime Container creation = 0
business Definition Module import = 0
Runtime Control establishment = 0
```

---

## 3. LogicalGameBootstrap vs LaunchPlan

两份 prepared data严格分离：

```text
LogicalGameBootstrap
    → Main-visible
    → subsystemKeys + initial target/input only

PlatformLaunchPlan
    → Platform-private
    → Map<subsystemKey, ResolvedPlatformImplementation>
```

Main 不得通过 bootstrap 获得 executable material；session-scoped concrete Platform instance 持有 immutable PlatformLaunchPlan，并通过其 Main-facing RuntimeHosting capability 使用该 plan。RuntimeHosting 不得要求 Main重新传 Game Entry/manifest。

---

## 4. Runtime Container vs Business Module

```text
Runtime Container
    physical isolation + trusted Runner + business instance

Definition Module
    current-platform selected business implementation
    satisfies shared SubsystemDefinitionFactory ABI
```

Hostra：

```text
Node child process
→ Host-owned Node Runner
→ lookup frozen HostraLaunchPlan binding
→ import selected Hostra Definition Module
```

PWA：

```text
Dedicated Worker
→ Host-owned Worker Runner
→ lookup frozen PwaLaunchPlan binding
→ import selected PWA Definition Module
```

业务 module 不负责 physical hosting/bootstrap，也不读取 Game Entry/Platform manifest。

---

## 5. Runner Responsibility

Runner 位于 Platform 与 Subsystem role Core之间：

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
load exact plan-selected Definition Module
validate default SubsystemDefinitionFactory ABI
M6 construct RuntimeControlBinding
M8+ construct SubsystemDataBinding when Data slice lands
M12+ construct ContentClient when Content slice lands
invoke runSubsystem(...) with only capabilities implemented by the current milestone
platform-local diagnostics/cleanup
```

Runner不拥有 Main Frame/Activation/InputTarget/DataAuthority authority，也不重新解释 raw manifests。

---

## 6. Main-facing RuntimeHosting

RuntimeHosting 是 prepared concrete Platform instance 对 Main 暴露的 logical launch capability，而不是 module loader API。其 exact M5 TypeScript shape 由 `@loomrealm/platform-ports` 的 M5 consumer closure 冻结；本文只冻结 responsibility。

概念：

```text
launch(subsystemKey, LaunchAttemptMaterial)
terminate(handle/key)
observe supervision facts
```

负责：

```text
lookup immutable PlatformLaunchPlan by subsystemKey
create Host-owned Runner Container
provide launch bootstrap material
provide supervision handle
provide bounded terminate capability
```

Main MUST NOT传：

```text
GameEntryV1 / ValidatedGameEntryV1
module path / module URL
Node executable / argv / env
Worker target/options
Runner entry
Control endpoint / MessagePort
```

RuntimeHosting不负责：

```text
mark ready by itself
create Frame
mint Activation
choose InputTarget
mint Data generation/profile
run failure unwind
```

---

## 7. Host Policy Boundary

Platform Launch Manifest MAY 选择 installation 内 business artifact；MUST NOT覆盖：

```text
Node executable
Host-owned Node/Worker Runner entry
shell / arbitrary argv / unsafe env
Worker constructor security policy
bootstrap credential source
Control endpoint / MessagePort
Data ticket/Port authority
CSP / same-origin policy
Supervisor resource/timeouts
```

```text
select business implementation
!=
arbitrary host-code execution authority
```

---

## 8. Supervisor Boundary

Supervisor只报告 physical facts：

```text
container creation success/failure
container alive/exited
exit code/signal/reason
termination request/result
```

Main解释这些 facts为 public Runtime lifecycle。

```text
spawn/Worker creation success != connected
connected != identified
identified != ready
```

`stopped` 只来自 actual physical termination observation。

Supervisor不能选择 Frame unwind root、Data generation或 application recovery。

---

## 9. Runtime Control Carrier

一个 Launch Attempt 最多一个 successful identified Control Connection。

```text
starting
→ physical carrier establishment
→ connected
→ subsystem.hello
→ identified
→ optional initializing
→ ready
```

same-attempt Control reconnect不存在。

Control carrier loss在无 shutdown intent时 → Runtime failed。

```text
ready != Data current
ready != Renderer exists
ready != Input/Render baseline published
```

---

## 10. Local Frame/Input Context

Runtime 可承载多个 live local Frame Context，但公共 Stack/Activation authority仍在 Main。

Local context只保存当前协议角色所需状态；不得成为第二份 public Stack authority。

Frame/Input Context lifetime与 Render Domain/Data Connection相互独立。

Child-call suspension可保留 Frame-scoped Interest configuration；fresh Activation不复用 old Input State/Event。

---

## 11. Render Domains

Runtime 可拥有 `0..N` authoritative Render Domains，即使当前 zero active Frame / zero Data carrier。

```text
Frame close != Render Domain close
Frame suspend != Render hide
Data carrier loss != authoritative Render destroy
```

fresh Data carrier只重建 Renderer replica baseline；authoritative Domain state仍由 Subsystem拥有。

---

## 12. Data Provisioning Is Adjacent, Not Owned

Data Broker可向已经运行/ready的 Runner 动态提供 fresh `SubsystemDataBinding` carrier：

```text
Runtime already ready
→ DataAuthority(S,G,P)
→ Platform DataConnectionBroker
→ platform-local provisioning
→ Runner establishes/receives carrier
→ SDK DataPlane installs current S/G/P carrier
```

Hostra：Runner provisioning IPC + endpoint/ticket + Data WebSocket。  
PWA：Worker provisioning + transferred MessagePort。

因此：

```text
Runtime ready != Data current
Runtime hosting != Data connection lifecycle
Data provisioning failure != Runtime hosting failure
Data loss != Frame unwind
```

---

## 13. Termination

正常：

```text
Main shutdown intent
→ subsystem.shutdown
→ bounded Runner/business cleanup
→ Platform terminate if needed
→ Supervisor observes actual termination
→ stopped
```

异常：

```text
unexpected Runtime exit
Control loss
Runtime self-reported failed
fatal protocol/SDK invariant failure
```

进入 Main Runtime failure path。

Runtime 已 failed 后不能因为随后 exit code 0恢复为 graceful success。

No automatic restart；新 Runtime必须 fresh Launch Attempt + fresh credential + fresh Container + fresh Control lifetime。

---

## 14. Cross-platform Realization

```text
Hostra Desktop
    LaunchPlan          installation-contained filesystem .mjs
    Runtime Container  Node Runner Process
    Supervisor         child process lifecycle
    Control            WebSocket
    provisioning       child IPC/equivalent

PWA
    LaunchPlan          installation/same-origin module URL
    Runtime Container  Worker Runner
    Supervisor         Worker lifecycle
    Control            MessagePort
    provisioning       Worker Port/message transfer
```

物理 topology不同；建立后的 Runtime Control、Frame、Data/Input/Render/Content semantics必须等价。

---

## 15. Final Invariants

1. one logical `subsystemKey` 最多一个 active Runtime Container；
2. Game Package/ValidatedGameEntry 不是 RuntimeHosting input；
3. PlatformLaunchPlan + LogicalGameBootstrap 在 first Runtime side effect前完整闭合；
4. Runtime Container承载 Host-owned Runner + one selected business Definition instance；
5. Host-owned Runner是 physical entry；
6. Main-facing RuntimeHosting只接受 logical key/Launch Attempt material；
7. Host policy/credential/security不能被 Game/Platform manifest任意覆盖；
8. Runtime最多 `0..1 current` Control carrier，same-attempt不 reconnect；
9. Supervisor只报告 physical facts，`stopped`只来自 actual termination；
10. public Frame/Activation/InputTarget/DataAuthority authority仍在 Main；
11. Runtime ready不要求 Data current；
12. Data provisioning/loss不等于 Runtime failure/Frame unwind；
13. Hostra/PWA hosting/artifact可不同，但 Subsystem ABI与 observable application semantics一致。
