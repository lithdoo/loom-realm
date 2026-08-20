# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层逻辑角色、状态所有权、Game/Platform launch boundary、运行承载与主要 authority/lifecycle 关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)  
> 被以下文档细化：[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[通信系统](./communication-system.md)、[渲染系统](./rendering-system.md)、[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 最近复核：2026-08-20

---

## 1. 顶层逻辑角色

```text
Game Package
    logical topology / initial input
        ↓
LoomRealm Main
├── Session / Subsystem-key / Runtime authority
├── Frame Registry / Stack / Activation
├── Transaction + failure unwind
├── InputTarget
└── DataAuthority

Subsystem Runtime
├── business state
├── local Frame/Input Context
├── Frame-scoped Input Interest
└── Render Domain authoritative state

Web Renderer
├── read-only Main authority mirror
├── per-Subsystem Data connections
├── Input producers/gating
└── Render replica/presentation

Readonly Content Service
```

这些 logical roles保持 platform-neutral。

---

## 2. Platform Composition

Platform负责完整物理 Session：

```text
Platform Launch Manifest / Planner
Runtime Hosting / Supervision
Main ⇄ Subsystem Control binding
Renderer Hosting
Main ⇄ Renderer Control binding
Renderer ⇄ Subsystem Data Broker
Content Binding
Runner bootstrap/provisioning
physical startup/shutdown
```

典型：

```text
Hostra Desktop
    launch.hostra.json / Node Runner / WS / BrowserWindow / HTTP / IPC

PWA
    launch.pwa.json / Worker Runner / MessagePort / Window / SW
```

Platform不拥有 Frame/Activation/InputTarget/DataAuthority/Render Domain等 application authority。

---

## 3. Game Package / Platform Binding

Game Package v1声明：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

并声明 initial target/input。它不包含 executable module。

当前平台独立声明：

```text
key → platform-specific Definition Module
```

Phase 1 exact join：

```text
keys(Game Entry) = keys(Platform Launch Manifest)
```

因此 logical identity 与 executable binding明确分离。

---

## 4. Preflight Launch Plan

任何 Runtime side effect前：

```text
Game Entry validate
→ Platform Launch Manifest validate
→ exact key-set join
→ resolve all required executable artifacts
→ validate current hosting capabilities
→ immutable PlatformLaunchPlan
```

只有 plan完整闭合后，Main的 logical `launch(subsystemKey)` 才能由 RuntimeHosting实现。

Main不持有 module/path/URL/Node/Worker options。

---

## 5. Runtime / Runner

每个 Subsystem key 同时最多一个 active Runtime Container。

```text
Hostra → Host-owned Node Runner Process
PWA    → Host-owned Worker Runner
```

Runner负责：

```text
load platform-planned Definition Module ABI
construct Subsystem-facing Platform Ports
enter @loomrealm/subsystem/host
```

Definition Module只表达业务，不自己建立 WebSocket/MessagePort或读取 Platform launch manifest。

---

## 6. Runtime Control

```text
Subsystem Control v1
+ Frame / Call v1
= Runtime Control Application Profile v1
```

逻辑启动：

```text
Main Launch Attempt
→ Platform RuntimeHosting plan lookup
→ Runner Runtime
→ Control carrier
→ subsystem.hello
→ identified
→ initialize
→ ready
```

`launch != connected != identified != ready`，且 `ready != Data Connection exists`。

---

## 7. Frame / Activation / Failure

Main唯一拥有 Frame identity/caller/lifecycle/outcome/Stack、Activation、InputTarget和 transaction/recovery。

Frame state-changing Request：

```text
Success        → known committed
Explicit Error → protocol-defined known no-commit/fatal
Timeout/loss   → ambiguous
```

ambiguous/divergence/protocol error → Runtime failure；no retry/replay。Failure unwind仍由 Main fixed-point收敛。

---

## 8. Renderer Control / Data

Renderer Control复制 committed authority：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

Renderer Data Profile v1：

```text
Connection v1 + User Input v1 + Render Update v1
```

Data loss != Runtime failure；same S/G/P MAY sequential reconnect。

---

## 9. Data Broker / Provisioning

```text
Main DataAuthority(S,G,P)
        ↓
Platform DataConnectionBroker
      /               \
 Renderer endpoint   Subsystem endpoint
```

Hostra通过 Runner provisioning IPC提供 Data WS material；PWA通过 Worker provisioning/Port transfer。Broker不 mint G/P。

---

## 10. Input / Render / Content

Input effective gate：

```text
current Data × Main InputTarget × current Activation × Interest[F] × Producer
```

Render Domain由 Subsystem拥有，Frame/Data carrier不拥有 Domain lifecycle。

Content API只提供 logical readonly access；Platform executable module resolution是独立 capability。

---

## 11. Messaging Model

当前 Control/Data message-oriented Profiles统一：

```text
one carrier application unit = one UTF-8 JSON text string
```

WebSocket text、MessagePort `postMessage(string)` 与 MemoryCarrier共享 application value model。

---

## 12. State Ownership

```text
Main
    Session/Runtime public authority
    Frame/Stack/Activation/Outcome
    InputTarget/DataAuthority

Subsystem
    business state
    local Frame/Input Context
    Interest[F]
    Render Domain Registry/State

Renderer
    read-only Main mirror
    Input producers
    Render replica/presentation

Platform
    Platform launch binding/plan
    process/worker/window/socket/port/content topology
    Runner bootstrap/provisioning
    physical supervision/cleanup
```

Physical ownership不提升为 application authority。

---

## 13. Cross-platform Portability

Business author contract保持：

```text
business source → @loomrealm/subsystem
```

Hostra/PWA MAY加载不同 build artifact，但这些 artifact必须实现同一 Subsystem Definition ABI，并在同一 logical scenario下产生等价 observable result。

业务不得：

```text
read launch.hostra.json / launch.pwa.json
if desktop → WebSocket
if pwa → MessagePort
```

---

## 14. Core Invariants

1. Main/Renderer/Subsystem/Content是 platform-neutral logical roles；
2. Platform负责完整 physical Session，不拥有 application authority；
3. Game Package Descriptor v1只有 `{key}`；
4. executable binding由 current Platform Launch Manifest拥有；
5. Game/Platform key set Phase 1严格相等；
6. immutable LaunchPlan在任何 Runtime side effect前闭合；
7. Main launch intent不携 module/physical target；
8. Host-owned Runner是 physical Runtime entry；
9. Definition Module ABI统一，artifact/path不要求跨平台相同；
10. one Subsystem key → at most one active Runtime；
11. Runtime Control Profile v1 = Control1 + Frame1；
12. ready不携/暗示 Data material；
13. Frame/Stack/Activation/recovery authority = Main；
14. ambiguous Frame mutation Runtime-fatal/no retry；
15. Data Broker负责 physical carrier，generation/profile仍归 Main；
16. Data loss/provision failure不等于 Runtime/Frame failure；
17. Render lifecycle独立于 Frame/Data carrier；
18. message-oriented profiles统一 UTF-8 JSON text；
19. Hostra/PWA比较 abstract application semantics，不比较 executable/physical trace。
