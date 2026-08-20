# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨平台 composition boundary、Platform Launch Manifest/Plan、Runtime Runner、role-facing ports、DataConnectionBroker/provisioning，以及 Hostra/PWA realization  
> 依赖：[系统架构总览](./system-overview.md)、[ADR 0002](../decisions/0002-platform-transport-profiles.md)、[ADR 0017](../decisions/0017-system-level-platform-composition.md)、[ADR 0019](../decisions/0019-platform-launch-manifest-boundary.md)  
> 被以下文档细化：[运行承载系统](./runtime-hosting-system.md)、[通信系统](./communication-system.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 最近复核：2026-08-20

本文回答：**同一套 LoomRealm logical application semantics 如何在不同物理平台上被完整规划并运行。**

---

## 1. Core Boundary

```text
                 Platform-neutral LoomRealm
┌─────────────────────────────────────────────────────┐
│ Game topology   Main   Renderer   Subsystem Content │
└─────────────────────────────────────────────────────┘
                         │
                    Platform Ports
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
     Hostra Desktop                    PWA
```

必须保持：

```text
Platform != Main
Platform != Renderer
Platform != Subsystem
Platform != Transport
Platform != Protocol
```

---

## 2. Platform Launch Binding

Game Package只给出：

```text
logical keys + initial target/input
```

当前 Platform独立给出 executable binding：

```text
Hostra: launch.hostra.json
PWA:    launch.pwa.json
```

两个 manifest MAY当前拥有相似字段，但不是一个共享 extensible launcher schema。各平台可以独立演化自己的 executable binding，只要保持 Main/Subsystem contract与 observable semantics。

---

## 3. Parse → Plan → Commit

Platform Composition必须先形成完整 plan：

```text
Validated Game Entry
        +
Validated current Platform Launch Manifest
        ↓ exact key-set join
resolve all executable bindings
validate hosting capability/security boundary
        ↓
immutable PlatformLaunchPlan
─────────────────────────────────────────
RuntimeHosting may create first Runtime Container
```

Phase 1任何 missing/extra binding、invalid module、resolution/containment/security/capability preflight error都必须零 business Runtime side effect。

---

## 4. Runtime Hosting

```text
Main logical launch(subsystemKey)
        ↓
Platform RuntimeHosting
        ↓ frozen plan lookup
        ↓
create physical Runner Runtime
provide supervision facts
```

```text
Hostra → Node child process
PWA     → Dedicated Worker
```

Main不传 module/path/URL/Worker options。

---

## 5. Business Module vs Runner

Platform Launch Manifest选择 installation 内的业务 implementation artifact。

```text
Hostra binding → Hostra-selected Definition Module
PWA binding    → PWA-selected Definition Module
```

Host-owned Runner才是 physical entry：

```text
Node Runner / Worker Runner
→ import planned Definition Module
→ validate SubsystemDefinitionFactory
→ construct role-local ports
```

相同 artifact不再是跨平台硬要求；相同 author ABI与 observable semantics才是要求。

---

## 6. Host Policy Boundary

Launch Manifest不能覆盖 Host-owned：

```text
Node executable / Worker Runner entry
shell/argv/env security policy
Worker constructor/security policy
bootstrap credential
Control endpoint/Port
Data ticket/Port
Supervisor/resource/timeouts
```

Game-provided platform binding选择 business implementation，不取得 Host infrastructure authority。

---

## 7. Role-facing Ports

```text
System Platform
├── Main-facing
│   ├── RuntimeHosting / Supervisor
│   ├── RuntimeControlHost
│   ├── RendererHosting
│   ├── RendererControlHost
│   └── DataConnectionBroker
├── Renderer-facing
│   ├── RendererControlBinding
│   ├── RendererDataBinding
│   └── ContentClient
└── Subsystem-facing
    ├── RuntimeControlBinding
    ├── SubsystemDataBinding
    └── ContentClient
```

Launcher package可以实现 RuntimeHosting/Runner integration，但不能因此拥有其他 role的 application authority。

---

## 8. Already-connected Carrier

Foundation `MessageCarrier<string>` 只表示已建立 message pipe。

当前 Control/Data application profiles统一：

```text
one carrier unit = one UTF-8 JSON text string
```

Transport不负责 connection authority/reconnect policy/Platform topology。

---

## 9. Data Connection Broker / Provisioning

```text
Main DataAuthority(S,G,P)
          ↓
DataConnectionBroker
      /              \
 Renderer side      Subsystem side
```

Hostra：Broker → Runner provisioning IPC → Data WS。  
PWA：Broker → Worker provisioning path → transferred MessagePort。

Provisioning wire不要求跨平台相同；建立后的 Data identity/profile/lifecycle必须等价。

Data provisioning failure本身不失败 Runtime、不 unwind Frame。

---

## 10. Content Binding

```text
Desktop → fs-backed localhost HTTP
PWA     → same-origin Fetch + Service Worker / OPFS
```

Content API logical semantics保持一致。Executable module resolver与 ordinary Content capability继续隔离。

---

## 11. Hostra Realization

```text
Hostra Desktop
├── Hostra Launch Manifest / LaunchPlan
├── Node Subsystem Runner Process
├── Process Supervisor
├── Runtime Control WebSocket
├── Runner Provisioning IPC
├── BrowserWindow Renderer
├── Renderer Control WebSocket
├── Data Broker / Data WebSocket
└── fs + localhost HTTP Content
```

---

## 12. PWA Realization

```text
PWA
├── PWA Launch Manifest / LaunchPlan
├── Worker Subsystem Runner
├── Worker supervision
├── Runtime Control MessagePort
├── Worker provisioning Port/path
├── browser Window Renderer
├── Renderer Control MessagePort
├── Data Broker / MessageChannel transfer
└── Fetch + Service Worker / OPFS Content
```

---

## 13. Cross-platform Mapping

| Capability | Hostra Desktop | PWA |
|---|---|---|
| Launch config | `launch.hostra.json` | `launch.pwa.json` |
| Launch plan | HostraLaunchPlan | PwaLaunchPlan |
| Subsystem Runtime | Node Runner Process | Worker Runner |
| Runtime supervision | process exit | Worker termination/error |
| Runtime Control | WebSocket text | MessagePort string |
| Data provisioning | Runner IPC + ticket | Worker Port + transferred Port |
| Data carrier | authenticated WebSocket | MessagePort string |
| Content | fs + HTTP | Fetch + SW / OPFS |

Application authority/identity/order/recovery必须等价。

---

## 14. Business Portability

业务 package依赖：

```text
@loomrealm/map → @loomrealm/subsystem
```

Business source不得读取 Platform Launch Manifest或创建 physical connection。Platform-specific build artifact MAY不同，但必须保留同一 author-level semantics。

---

## 15. Package Boundary

Platform architecture不自动产生大而全 platform package。

当前明确允许抽出的窄能力：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

它们只拥有 Subsystem Runtime launch planning/hosting/Runner integration；Renderer/DataBroker/Content等仍由独立 capability/adapters与 `apps/*` composition root组合。

---

## 16. Cross-platform Equivalence

相同：

```text
Game Entry logical topology
Subsystem keys
formal protocol/profile semantics
logical scenario/business inputs
```

比较：Runtime lifecycle、Frame/Outcome/unwind、Renderer authority、Data S/G/P、Input delivery、Render replica、Content response、business observable state。

不比较：module path/bytes、PID/Worker、WS URL/Port、IPC payload/transfer object、HTTP/SW internals。

---

## 17. Security / Authority Boundary

Platform/Launcher MUST NOT：

```text
mint/restore Activation
mutate Stack/InputTarget
choose failure unwind root
mint Data generation/profile
turn endpoint/Port into DataAuthority
retry ambiguous Frame operation
let game config replace trusted Runner or credential policy
```

---

## 18. Final Invariants

1. Platform是完整 physical Session composition boundary；
2. Game Package只拥有 logical topology，Platform Launcher拥有 executable binding；
3. Game/Platform exact key join在 Phase 1严格闭合；
4. PlatformLaunchPlan在 first Runtime side effect前冻结；
5. Main launch只依赖 subsystemKey；
6. Host-owned Runner与 business Definition Module分离；
7. Hostra/PWA launcher config独立演化，不建立万能 launcher schema；
8. role-local ports是 Platform projection，不是完整 Platform；
9. DataConnectionBroker实现 current Main S/G/P authority但不拥有它；
10. provisioning不是 application protocol；
11. Data provisioning failure不等于 Runtime/Frame failure；
12. Control/Data application units统一 UTF-8 JSON text；
13. Hostra/PWA physical机制与 implementation artifact可以不同，但 logical trace必须等价。
