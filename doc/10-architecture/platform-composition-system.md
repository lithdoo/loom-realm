# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨平台 composition boundary、Platform Launch Manifest/Plan、Runtime Runner、role-facing ports、DataConnectionBroker/provisioning，以及 Hostra/PWA 对同一 logical Session 的 realization  
> 依赖：[系统架构总览](./system-overview.md)、[ADR 0002](../decisions/0002-platform-transport-profiles.md)、[ADR 0017](../decisions/0017-system-level-platform-composition.md)、[ADR 0019](../decisions/0019-platform-launch-manifest-boundary.md)  
> 被以下文档细化：[运行承载系统](./runtime-hosting-system.md)、[通信系统](./communication-system.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 被以下文档实现：[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 最近复核：2026-08-20

本文回答：**同一套 LoomRealm application semantics 如何在不同物理平台上被完整规划、组合并运行。**

它不新增 application protocol，也不要求存在一个大而全 `platform-*` npm package。

---

## 1. Core Boundary

```text
                  Platform-neutral LoomRealm
┌────────────────────────────────────────────────────────────┐
│ Game logical topology   Main   Renderer   Subsystem Content│
│             └──── formal contracts / role APIs ──────────┘ │
└────────────────────────────────────────────────────────────┘
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
Platform architecture != one mega package
```

Platform建立物理 topology并注入 capability；application authority仍属于对应 logical role。

---

## 2. Why System-level Composition

一个完整 Session同时需要：

```text
Game logical topology validation
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

> **Platform Composition owns physical topology; roles consume projections of that topology.**

ADR 0019进一步明确：executable binding本身也是 Platform realization，而不是 Game logical identity。

---

## 3. Game Logical Topology vs Platform Launch Binding

Game Package v1只声明：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

以及 `initial {subsystem,input}`。

Platform独立声明 executable binding：

```text
Hostra
    launch.hostra.json
    key → Hostra Definition Module

PWA
    launch.pwa.json
    key → PWA Definition Module
```

两个 manifest当前可以都有 `{key,module}`，但它们不是同一个 schema/profile。未来字段、resolution/security policy可独立演化。

禁止把平台差异重新塞回：

```text
game.json launcher.type
platformOptions:any
module in common Descriptor
```

---

## 4. Parse → Plan → Commit

完整 Session在任何 business Runtime side effect前先完成：

```text
read/validate Game Entry
→ read/validate current Platform Launch Manifest
→ exact key-set join
→ resolve every required executable binding
→ validate current Platform hosting/security capabilities
→ freeze immutable PlatformLaunchPlan
────────────────────────────────────────────
first business Runtime side effect may begin
```

Phase 1：

```text
keys(GameEntry.subsystems)
=
keys(CurrentPlatformLaunchManifest.subsystems)
```

任何 missing/extra binding、invalid module、resolution/containment/security/capability preflight failure：

```text
process/Worker create count = 0
business module import count = 0
Runtime Control establish count = 0
```

普通 Runtime launch path只 lookup frozen plan，不重新解释 raw config。

---

## 5. Business Module vs Runtime Runner

PlatformLaunchPlan为每个 logical key选择 current-platform Definition Module。

```text
Hostra binding
    → Hostra-selected .mjs

PWA binding
    → PWA-selected .mjs
```

Host-owned Runner才是 Runtime physical entry：

```text
Hostra Desktop
    Host-owned Node Runner
        → import planned Definition Module

PWA
    Host-owned Worker Runner
        → import planned Definition Module
```

业务 Definition Module不是 process/Worker entry policy。

跨平台 requirement变为：

```text
same logical subsystem key
same SubsystemDefinitionFactory ABI
same formal role/protocol semantics
same business-observable result for same logical scenario
```

不要求 same module path/bytes/build artifact。

---

## 6. Host Policy Boundary

Platform Launch Manifest只可选择 installation 内业务 implementation artifact；不能控制 Host-owned infrastructure/security policy：

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

Game-supplied config不能把 executable binding升级成任意 Host code execution authority。

---

## 7. Platform Capabilities

### 7.1 Runtime Hosting

```text
Main logical launch(subsystemKey)
→ RuntimeHosting lookup frozen PlatformLaunchPlan
→ create physical Runner Runtime
→ provide supervision facts
```

```text
Hostra → Node child process
PWA     → Dedicated Worker
```

RuntimeHosting不拥有 public Runtime lifecycle/Frame authority。

### 7.2 Runtime Control Binding

为 Main/Subsystem提供同一 Launch Attempt 的 current Control carrier。

建立后只遵守：

```text
Subsystem Control v1
+ Frame / Call v1
= Runtime Control Application Profile v1
```

### 7.3 Renderer Hosting

```text
Hostra → BrowserWindow/Web application
PWA    → browser Window/Web application
```

不拥有 Main authority或 Render Domain state。

### 7.4 Renderer Control Binding

建立 Main ⇄ current Renderer carrier；Snapshot/Revision/authority由 Renderer Control v1定义。

### 7.5 Data Connection Broker

```text
Main DataAuthority(S,G,P)
          │
          ▼
DataConnectionBroker
      /              \
 Renderer side      Subsystem side
```

Broker在安装前绑定 current Session/current Renderer/S/G/P，但不 mint generation/profile，也不从 endpoint/Port/ticket推导 authority。

### 7.6 Content Binding

```text
Desktop → fs-backed localhost HTTP
PWA     → same-origin Fetch + Service Worker / OPFS
```

不得改变 Content API logical semantics。

### 7.7 Platform Lifecycle

负责 process/Worker/window/socket/Port/HTTP/SW 等 physical resource 的 bounded startup/shutdown。

Physical cleanup不自动等价 Frame/Data/Render application lifecycle。

---

## 8. Role-facing Ports

```text
System Platform
├── Main-facing
│   ├── RuntimeHosting / Supervisor
│   ├── RuntimeControlHost
│   ├── RendererHosting
│   ├── RendererControlHost
│   └── DataConnectionBroker
│
├── Renderer-facing
│   ├── RendererControlBinding
│   ├── RendererDataBinding
│   ├── ContentClient
│   └── presentation/input environment
│
└── Subsystem-facing
    ├── RuntimeControlBinding
    ├── SubsystemDataBinding
    └── ContentClient
```

这些只是 Platform在每个 role 的 local projection。

`RendererDataBinding != SubsystemDataBinding`；两者是同一 Broker建立的两端。

Launcher package可实现 Main-facing RuntimeHosting和 Runner integration，但不能因此吞并其他 ports/application authority。

---

## 9. Already-connected Carrier

Foundation：

```text
MessageCarrier
```

只表示已经建立的 message pipe。

当前 Control/Data Profiles统一：

```text
one carrier application unit
= one UTF-8 JSON text string
```

Transport Adapter只负责 message boundary、per-direction order、observable close/loss、避免无界物理 buffering、no application retry/duplicate；具体 threshold/config 不属于 Foundation contract。

Transport不负责 connection authority、reconnect policy或 Platform topology。

---

## 10. Capability Lifetime vs Carrier Lifetime

```text
Runtime Control carrier loss
    → Runtime failure

Renderer Data carrier loss
    → current carrier retired
    → Runtime/Frame do not fail
    → same S/G/P may receive fresh carrier

InputListener/Interest desired state
    → may survive Data carrier locally

RenderDomain/desired state
    → may survive Data carrier
```

因此 Input/Render capability不得直接持有某条 physical carrier作为 lifetime owner。

---

## 11. Dynamic Data Provisioning

DataAuthority通常在 Runtime启动后才建立、替换或 reconnect，因此 Platform必须向已运行 Runner动态交付 fresh physical Data material。

这属于：

```text
Platform provisioning
```

不是 Runtime Control、Renderer Control、Renderer Data application payload或 business API。

### Hostra Desktop

```text
Main DataAuthority(S,G,P)
→ Desktop Broker
→ Host-owned Runner provisioning IPC
→ one-time endpoint/ticket
→ Runner establishes authenticated Data WebSocket
→ MessageCarrier
→ SubsystemDataBinding yields {G,P,carrier}
```

### PWA

```text
Main DataAuthority(S,G,P)
→ PWA Broker creates MessageChannel
→ transfer Renderer endpoint
→ transfer Subsystem endpoint through Worker provisioning path
→ role-local bindings install {G,P,carrier}
```

两平台 provisioning wire无需相同；建立后的 Data identity/profile/lifecycle必须相同。

---

## 12. Provisioning Failure Domain

以下不自动失败 Runtime：

```text
Data offer/ticket expired
Data WebSocket connect failure
MessagePort transfer/install failure
provisioning source temporarily unavailable
same-generation reconnect failure
```

结果只是 current Data unavailable，直到仍授权的 authority获得 fresh carrier。

Control loss/Runtime exit才由 Runtime Control/Supervisor解释为 Runtime failure。

---

## 13. Hostra Desktop Realization

```text
Hostra Desktop
├── launch.hostra.json
├── @loomrealm/game-launcher-hostra / HostraLaunchPlan
├── Node Subsystem Runner Process
├── Process Supervisor
├── Runtime Control WebSocket
├── Runner Platform Provisioning IPC
├── Hostra BrowserWindow
├── Renderer Control WebSocket
├── Data Broker / authenticated Data WebSocket
└── fs + localhost HTTP Content
```

Hostra Shell RPC与 LoomRealm application protocols保持独立。

---

## 14. PWA Realization

```text
PWA
├── launch.pwa.json
├── @loomrealm/game-launcher-pwa / PwaLaunchPlan
├── Worker Subsystem Runner
├── Worker lifecycle supervision
├── Runtime Control MessagePort
├── Worker provisioning Port/path
├── browser Window Renderer
├── Renderer Control MessagePort
├── Data Broker MessageChannel/Port transfer
└── Fetch + Service Worker / OPFS Content
```

Structured Clone只用于 Platform bootstrap/Port transfer；进入 Control/Data carrier后 application unit仍为 JSON text string。

---

## 15. Cross-platform Mapping

| Capability | Hostra Desktop | PWA |
|---|---|---|
| Launch config | `launch.hostra.json` | `launch.pwa.json` |
| Launch planner | HostraLaunchPlan | PwaLaunchPlan |
| Subsystem Runtime | Node Runner Process | Worker Runner |
| Runtime supervision | process exit | Worker termination/error |
| Runtime Control | WebSocket text | MessagePort string |
| Renderer Hosting | BrowserWindow | browser Window |
| Renderer Control | WebSocket text | MessagePort string |
| Data provisioning | Runner IPC + endpoint/ticket | Worker Port + transferred Port |
| Data carrier | authenticated WebSocket | MessagePort string |
| Content | fs + HTTP | Fetch + SW / OPFS |

Application authority/identity/order/recovery必须等价。

---

## 16. Business Portability

```text
@loomrealm/map
    → @loomrealm/subsystem
```

业务 source不依赖 `/host`、launcher、transport或 Platform composition。

```text
business semantics / Subsystem ABI = shared
Platform Launch Manifest / Runner / bootstrap / provisioning = platform-specific
```

Platform-specific build artifact MAY不同；业务不得通过 runtime platform detection改变 business semantics。

---

## 17. Platform Architecture != Platform Mega-package

完整 Platform Composition仍是 architecture responsibility，当前 final composition roots：

```text
apps/desktop
apps/pwa
```

ADR 0019明确允许窄能力：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

它们只处理 Subsystem Runtime manifest/planning/hosting/Runner integration；Renderer/DataBroker/Content/Shell仍由其他 capability/adapters/composition组装。

---

## 18. Cross-platform Equivalence

相同 abstract application trace必须比较：

```text
Runtime lifecycle
Frame/Activation/outcome/unwind
Renderer authority
Data S/G/Profile current/retired state
User Input delivered semantics
Render authoritative replica
Content logical response
business observable state
```

共享输入：

```text
same Game Entry logical topology
same subsystem keys
same logical scenario/business input
same formal contracts
```

不比较：

```text
Hostra/PWA module path/bytes
PID vs Worker
WS URL vs MessagePort
IPC payload vs transfer object
HTTP port vs Service Worker internal
```

---

## 19. Security / Authority Boundary

Platform/Launcher MUST NOT：

```text
mint/restore Activation
mutate Stack/InputTarget
choose failure unwind root
mint Data generation/profile independently
turn endpoint/ticket/Port into DataAuthority
put Data physical material in Runtime ready/Frame/Render payload
retry ambiguous Frame operation
widen application values with Structured Clone
let game config replace Host-owned Runner/security credential policy
```

Platform MAY生成 bootstrap token/ticket/Port，只用于建立正确 physical capability。

---

## 20. Final Invariants

1. Platform是完整 physical Session composition boundary；
2. Game Package声明 logical topology，Platform Launcher声明 executable binding；
3. Game/current-platform key set Phase 1严格相等；
4. complete immutable PlatformLaunchPlan在 first Runtime side effect前冻结；
5. Main只发 logical `launch(subsystemKey)`，不持有 module/path/URL；
6. Host-owned Runner与 business Definition Module分离；
7. Hostra/PWA Launch Manifest各自演化，不建立万能 launcher schema；
8. role-local ports是 Platform projection，不是完整 Platform；
9. RuntimeControlBinding / RendererDataBinding / SubsystemDataBinding职责明确；
10. DataConnectionBroker实现 current Main S/G/Profile authority但不拥有它；
11. late Data provisioning通过独立 Platform path到达已运行 Runner；
12. provisioning不是 application protocol；
13. Data provisioning failure不等于 Runtime/Frame failure；
14. capability lifetime与 carrier lifetime分离；
15. Control/Data application units统一 UTF-8 JSON text；
16. Hostra/PWA physical机制和 Definition artifact可不同，但 logical application trace必须等价。
