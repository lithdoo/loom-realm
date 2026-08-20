# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem Runtime Container、PlatformLaunchPlan、Runner、Control/Frame/Input/Render 的承载粒度，以及 Platform RuntimeHosting / Supervisor 边界  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)  
> 被以下文档细化：[栈式运行系统](./stack-runtime-system.md)、[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 正式化：[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-20

本文只定义 Runtime 承载与 physical hosting 边界；Game logical topology、Platform executable binding、Frame authority 与 Data authority 分属各自事实源。

---

## 1. Hosting Granularity

```text
one Game subsystem key
    → at most one active Runtime Container

one Runtime Container
    → one Host-owned Subsystem Runner
    → one platform-planned business Definition Module instance
    → 0..N local Frame/Input Contexts
    → 0..N Render Domains
    → 0..1 current Main Control carrier
```

`0..1 current Control carrier` 比“永远 one carrier”更精确：starting 前可能尚未建立；loss 后 Runtime 进入 terminal failure，不 reconnect same attempt。

Renderer Data carrier不属于 Runtime hosting cardinality本身；它由独立 DataAuthority/Broker 管理。

Runtime application identity来自 logical `subsystemKey`，不来自 module path、URL、PID、Worker id 或 Launch Attempt id。

---

## 2. Launch Plan Before Hosting

`RuntimeHosting` 不解析 raw Game Entry，也不解析 Platform Launch Manifest。

在任何 business Runtime side effect 前，Platform Composition MUST 已持有：

```text
immutable PlatformLaunchPlan
    Map<subsystemKey, ResolvedPlatformImplementation>
```

Plan 形成阶段必须已经完成：

```text
Game Entry validation
→ current Platform Launch Manifest validation
→ exact Game↔Platform key-set join
→ every required executable binding resolution
→ installation/security containment validation
→ current hosting capability preflight
→ freeze immutable PlatformLaunchPlan
```

任何该阶段 failure：

```text
business Runtime Container creation = 0
business Definition Module import = 0
Runtime Control establishment = 0
```

Definition Module actual ESM import/default-export ABI validation MAY 在 Host-owned Runner 中发生；这种 launch-time failure属于 required Runtime bootstrap failure，并触发 all-required bootstrap cleanup，但不削弱 preflight 的零副作用定义。

---

## 3. Runtime Container vs Business Module

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
→ import resolved Hostra Definition Module
```

PWA：

```text
Dedicated Worker
→ Host-owned Worker Runner
→ lookup frozen PwaLaunchPlan binding
→ import resolved PWA Definition Module
```

业务 module不负责 physical hosting/bootstrap，也不读取 `launch.hostra.json` / `launch.pwa.json`。

Hostra/PWA MAY 选择不同 module path/bytes/build artifact；相同 `subsystemKey`、相同 author ABI、相同 formal protocol semantics 与相同 logical scenario 的 observable business semantics才是跨平台不变量。

---

## 4. Runner Responsibility

Runner位于 Platform与 Subsystem role Core之间：

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
construct RuntimeControlBinding
construct SubsystemDataBinding
construct ContentClient
invoke runSubsystem(...)
platform-local diagnostics/cleanup
```

Runner不拥有 Main Frame/Activation/InputTarget/DataAuthority authority，也不重新解释 Game/Platform raw manifests。

---

## 5. Platform RuntimeHosting

Main-facing `RuntimeHosting` 是 logical launch port，而不是 module loader API。

概念：

```text
launch(subsystemKey, LaunchAttemptMaterial)
terminate(handle/key)
observe supervision facts
```

RuntimeHosting负责：

```text
lookup immutable PlatformLaunchPlan by subsystemKey
create physical Host-owned Runner Container
provide launch bootstrap material
provide supervision handle
provide bounded terminate capability
```

Main MUST NOT 传入：

```text
module path / module URL
Node executable / argv / env
Worker constructor target/options
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

这些仍由对应 logical authority拥有。

---

## 6. Host Policy Boundary

Platform Launch Manifest MAY 选择 installation 内 business implementation artifact；它 MUST NOT 覆盖 Host-owned deployment/security policy：

```text
Node executable
Host-owned Node/Worker Runner entry
shell policy / arbitrary argv / unsafe env
Worker constructor security policy
bootstrap credential source
Control endpoint / MessagePort
Data ticket/Port authority
CSP / same-origin policy
Supervisor resource/timeouts
```

因此：

```text
Game/Platform manifest selects business implementation
!= arbitrary host-code execution authority
```

---

## 7. Supervisor Boundary

Supervisor只报告 physical facts：

```text
container creation success/failure
container alive/exited
exit code/signal/reason
termination request/result
```

Main解释这些 facts 为 public Runtime lifecycle。

```text
spawn/Worker creation success != connected
connected != identified
identified != ready
```

`stopped` 只来自 actual physical termination observation。

Supervisor不能因为 process/Worker仍 alive而宣称 Runtime healthy；也不能自行选择 Frame unwind root、Data generation或 application recovery。

---

## 8. Runtime Control Carrier

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

Runtime Control application semantics由 Control/Frame/Profile正式契约定义，不由 hosting层重新定义。

```text
ready != Data current
ready != Renderer exists
ready != Input/Render baseline published
```

---

## 9. Local Frame/Input Context

一个 Runtime可以承载多个 live local Frame Context，但公共 Stack/Activation authority仍在 Main。

```text
Runtime
├── Frame F1 suspended
├── Frame F2 active
└── possibly other local live contexts over time
```

Local context保存当前协议角色所需状态；不得成为第二份 public Stack authority。

Frame/Input Context lifetime与 Render Domain/Data Connection相互独立。

Child-call suspension可以保留 Frame-scoped Interest configuration；fresh Activation 不复用 old Input State/Event。

---

## 10. Render Domains

Runtime可拥有 `0..N` authoritative Render Domains，即使当前：

```text
zero active Frame
zero Data carrier
```

也不自动销毁 Domain。

```text
Frame close != Render Domain close
Frame suspend != Render hide
Data carrier loss != authoritative Render destroy
```

fresh Data carrier只重建 Renderer replica baseline；authoritative Domain state仍由 Subsystem拥有。

Runtime terminal cleanup最终释放该 Runtime 的 local resources，但不把 Frame lifecycle改写成 Render lifecycle。

---

## 11. Data Provisioning Is Adjacent, Not Owned

Data Broker可以向已经运行/ready 的 Runner动态提供 `SubsystemDataBinding` 新 carrier：

```text
Runtime already ready
→ later DataAuthority(S,G,P) appears
→ Platform DataConnectionBroker
→ platform-local provisioning
→ Runner establishes/receives carrier
→ SDK DataPlane installs current S/G/P carrier
```

Hostra典型：

```text
Broker → Runner provisioning IPC → one-time endpoint/ticket → Data WebSocket
```

PWA典型：

```text
Broker → Worker provisioning path → transferred MessagePort
```

因此：

```text
Runtime ready != Data current
Runtime hosting != Data connection lifecycle
Data provisioning failure != Runtime hosting failure
Data loss != Frame unwind
```

RuntimeHosting/Supervisor不得因为同 generation Data reconnect失败而自动把 Runtime判为 failed。

---

## 12. Termination

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

Runtime已经 failed 后不能因为随后 exit code 0恢复成 stopped-success。

无 automatic restart；新 Runtime必须 fresh Launch Attempt + fresh bootstrap credential + fresh Container + fresh Control lifetime。

---

## 13. Cross-platform Realization

```text
Hostra Desktop
    LaunchPlan          resolved installation-contained filesystem .mjs
    Runtime Container  Node Runner Process
    Supervisor         child process lifecycle
    Control            WebSocket
    provisioning       child IPC/equivalent

PWA
    LaunchPlan          resolved installation/same-origin module URL
    Runtime Container  Worker Runner
    Supervisor         Worker lifecycle
    Control            MessagePort
    provisioning       Worker Port/message transfer path
```

物理 topology不同；建立后的 Runtime Control、Frame、Data/Input/Render/Content application semantics必须等价。

不比较：

```text
PID vs Worker id
filesystem path vs module URL
IPC ticket vs transferred Port
WebSocket vs MessagePort
```

---

## 14. Final Invariants

1. one logical `subsystemKey` 最多一个 active Runtime Container；
2. executable binding来自 frozen PlatformLaunchPlan，不来自 Main/Game common descriptor；
3. PlatformLaunchPlan在 first business Runtime side effect前完整闭合；
4. Runtime Container承载 Host-owned Runner + one platform-selected business Definition instance；
5. Host-owned Runner是 physical entry，business Definition Module不是 Process/Worker entry；
6. Main-facing RuntimeHosting只接受 logical key/Launch Attempt material，不接受 module/physical target；
7. Host policy/credential/security boundary不能被 Game/Platform manifest任意覆盖；
8. Runtime最多 `0..1 current` Control carrier，same-attempt不 reconnect；
9. Supervisor只报告 physical facts，`stopped`只来自 actual termination；
10. public Frame/Activation/InputTarget/DataAuthority authority仍在 Main；
11. local Frame/Input Context不拥有 Render/Data lifecycle；
12. Runtime ready不要求 Data current；
13. Data provisioning/loss不等于 Runtime failure/Frame unwind；
14. Hostra/PWA hosting/artifact可不同，但 Subsystem ABI与 observable application semantics一致。
