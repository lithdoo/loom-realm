# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem Runtime Container、PlatformLaunchPlan、Runner、Control/Frame承载粒度，以及 RuntimeHosting / Supervisor 边界  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)  
> 最近复核：2026-08-20

---

## 1. Hosting Granularity

```text
one Game subsystem key
    → at most one active Runtime Container

one Runtime Container
    → one Host-owned Subsystem Runner
    → one platform-planned Definition Module instance
    → 0..N local Frame/Input Contexts
    → 0..N Render Domains
    → 0..1 current Main Control carrier
```

Runtime identity来自 logical key，不来自 executable binding。

---

## 2. Launch Plan Before Hosting

RuntimeHosting不解析 Game/Platform manifest。

在其可启动前，Platform Composition必须已经持有：

```text
immutable PlatformLaunchPlan
    Map<subsystemKey, ResolvedPlatformImplementation>
```

Plan形成阶段完成：Game validation、Platform manifest validation、exact key join、全部 required implementation resolution和 capability preflight。

任何该阶段 failure → zero Runtime Container。

---

## 3. RuntimeHosting Interface Meaning

Main-facing logical request概念上是：

```text
launch(subsystemKey, LaunchAttemptMaterial)
terminate(subsystemKey/handle)
observe supervision facts
```

Main不传：

```text
module
filesystem path / URL
Node flags
Worker options
Runner entry
```

RuntimeHosting在自己的 immutable plan中lookup key。

---

## 4. Runtime Container vs Business Module

```text
Runtime Container
    physical isolation + trusted Runner + business instance

Definition Module
    platform-selected business implementation satisfying shared ABI
```

Hostra：Node child process → Node Runner → import Hostra plan module。  
PWA：Dedicated Worker → Worker Runner → import PWA plan module。

两个平台 MAY选择不同 artifact。

---

## 5. Runner Responsibility

```text
Platform bootstrap/provisioning
        ↓
Host-owned Runner
        ↓
Subsystem-facing Platform Ports
        ↓
@loomrealm/subsystem/host
        ↓
Business Definition
```

Runner负责 exact planned module load/ABI validation、bindings construction、`runSubsystem`、platform-local diagnostics/cleanup。

Runner不拥有 Main Frame/Data authority。

---

## 6. Supervisor Boundary

Supervisor只报告 physical facts：container creation、alive/exited、exit reason、termination request/result。

```text
spawn/Worker creation success != connected
connected != identified
identified != ready
```

`stopped`只来自 actual physical termination observation。

---

## 7. Runtime Control Carrier

一个 Launch Attempt最多一个 successful identified Control Connection。

```text
starting → carrier → connected → hello → identified → ready
```

same-attempt Control reconnect不存在。Control carrier loss无 shutdown intent → Runtime failed。

---

## 8. Local Frame/Input / Render / Data

一个 Runtime可以承载多个 live local Frame Context，但公共 Stack/Activation authority仍在 Main。

Render Domain lifetime与 Frame/Data carrier独立。

Data provisioning相邻但不归 RuntimeHosting authority：Runtime ready后 Broker仍可向 Runner提供新的 Data carrier；Data provisioning failure不等于 Runtime hosting failure。

---

## 9. Termination

正常：Main shutdown intent → subsystem.shutdown → bounded Runner cleanup → Platform terminate if needed → Supervisor actual termination → stopped。

异常：unexpected exit、Control loss、Runtime self-reported failed → Main Runtime failure path。

无 automatic restart；新 Runtime = fresh Launch Attempt。

---

## 10. Cross-platform Realization

```text
Hostra
    LaunchPlan          resolved filesystem .mjs
    Runtime Container  Node Runner Process
    Supervisor         child process lifecycle
    Control            WebSocket
    provisioning       child IPC/equivalent

PWA
    LaunchPlan          resolved installation module URL
    Runtime Container  Worker Runner
    Supervisor         Worker lifecycle
    Control            MessagePort
    provisioning       Worker Port/message transfer
```

建立后的 application semantics等价。

---

## 11. Final Invariants

1. one logical subsystem key最多一个 active Runtime Container；
2. executable binding来自 frozen PlatformLaunchPlan，不来自 Main；
3. plan在 first Runtime side effect前闭合；
4. Runtime Container承载 Host-owned Runner + one business Definition instance；
5. Main-facing RuntimeHosting只暴露 logical launch/physical supervision facts；
6. stopped只来自 actual termination；
7. public Frame/Activation authority仍在 Main；
8. Runtime ready不要求 Data current；
9. Data provisioning failure不等于 Runtime failure；
10. Hostra/PWA implementation artifact/hosting机制可不同，但 role semantics一致。
