# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨平台 composition boundary、Runtime Runner、role-facing ports、DataConnectionBroker/provisioning，以及 Hostra/PWA 对同一 logical Session 的 realization  
> 依赖：[系统架构总览](./system-overview.md)、[ADR 0002](../decisions/0002-platform-transport-profiles.md)、[ADR 0017](../decisions/0017-system-level-platform-composition.md)  
> 被以下文档细化：[运行承载系统](./runtime-hosting-system.md)、[通信系统](./communication-system.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 被以下文档实现：[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 最近复核：2026-08-19

本文回答：**同一套 LoomRealm application semantics 如何在不同物理平台上组成完整 Session。**

它不新增 application protocol，也不要求存在一个 `platform-*` npm package。

---

## 1. Core Boundary

```text
                  Platform-neutral LoomRealm
┌──────────────────────────────────────────────────────┐
│ Main          Renderer          Subsystem    Content │
│   └──────── formal contracts / role APIs ─────────┘ │
└──────────────────────────────────────────────────────┘
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
Platform architecture != npm package boundary
```

Platform建立物理拓扑并注入 capability；application authority仍属于对应 logical role。

---

## 2. Why System-level Composition

一个完整 Session同时需要：

```text
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

这些职责无法优雅归属某一个 role package或 Transport Adapter。

因此：

> **Platform Composition owns physical topology; roles consume projections of that topology.**

---

## 3. Business Module vs Runtime Runner

Game Package v1声明：

```text
SubsystemDescriptor { key, module }
```

`module` 是 platform-neutral Subsystem Definition Module。

Platform负责把它放进当前 Runtime Container：

```text
Hostra Desktop
    Host-owned Node Subsystem Runner
        → import same Definition Module

PWA
    Host-owned Worker Subsystem Runner
        → import same Definition Module
```

业务 module不是 process/Worker entry policy；Runner是 Platform infrastructure。

---

## 4. Platform Capabilities

### 4.1 Runtime Hosting

```text
validated Descriptor/module
→ create physical Runner Runtime
→ provide supervision facts
```

```text
Desktop → Node child process
PWA     → Dedicated Worker
```

RuntimeHosting不拥有 public Runtime lifecycle/Frame authority。

### 4.2 Runtime Control Binding

为 Main/Subsystem提供同一 Launch Attempt 的 current Control carrier。

建立后只遵守：

```text
Subsystem Control v1
+ Frame / Call v1
= Runtime Control Application Profile v1
```

### 4.3 Renderer Hosting

```text
Hostra → BrowserWindow/Web application
PWA    → browser Window/Web application
```

不拥有 Main authority或 Render Domain state。

### 4.4 Renderer Control Binding

建立 Main ⇄ current Renderer carrier；Snapshot/Revision/authority由 Renderer Control v1定义。

### 4.5 Data Connection Broker

```text
Main DataAuthority(S,G,P)
          │
          ▼
DataConnectionBroker
      /              \
 Renderer side      Subsystem side
```

Broker在安装前绑定：

```text
current Session
current Renderer
subsystemKey S
generation G
dataProfile P
```

Broker不 mint generation/profile，也不从 endpoint/Port/ticket推导 authority。

### 4.6 Content Binding

```text
Desktop → fs-backed localhost HTTP
PWA     → same-origin Fetch + Service Worker / OPFS
```

不得改变 Content API logical semantics。

### 4.7 Platform Lifecycle

负责 process/Worker/window/socket/Port/HTTP/SW 等 physical resource 的 bounded startup/shutdown。

Physical cleanup不自动变成 Frame/Data/Render application lifecycle。

---

## 5. Role-facing Ports

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

特别：

```text
RendererDataBinding != SubsystemDataBinding
```

两者是同一 Broker建立的两端，不应使用同名接口造成 owner混淆。

---

## 6. Already-connected Carrier

Foundation的：

```text
MessageCarrier<string>
```

只表示已经建立的 message pipe。

当前 Control/Data application profiles统一：

```text
one carrier unit = one UTF-8 JSON text string
```

Transport Adapter只负责：

```text
message boundary
per-direction order
observable close/loss
bounded buffering
no application retry/duplicate
```

Transport不负责 connection authority、reconnect policy或 Platform topology。

---

## 7. Capability Lifetime vs Carrier Lifetime

```text
Runtime Control carrier loss
    → Runtime failure (Control semantics)

Renderer Data carrier loss
    → current carrier retired
    → Runtime/Frame do not fail
    → same S/G/P may receive fresh carrier

InputListener/Interest desired state
    → may survive carrier locally

RenderDomain/desired state
    → may survive carrier
```

因此 Input/Render capability不得直接持有某一条 physical carrier作为 lifetime owner。

---

## 8. Dynamic Provisioning

DataAuthority通常在 Runtime启动后才建立、替换或 reconnect，因此 Platform必须能够向已运行的 Runner动态交付新的 physical Data material。

这属于：

```text
Platform provisioning
```

不是：

```text
Runtime Control
Renderer Control
Renderer Data application payload
business API
```

### Hostra Desktop

```text
Main DataAuthority(S,G,P)
→ Desktop Broker
→ Host-owned Runner provisioning channel (e.g. child IPC)
→ Runner obtains one-time endpoint/ticket
→ WebSocket adapter establishes carrier
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

## 9. Provisioning Failure Domain

以下不自动失败 Runtime：

```text
Data offer/ticket失效
Data WebSocket connect失败
MessagePort transfer/installation失败
provisioning source暂时不可用
same-generation reconnect失败
```

结果只是 current Data unavailable，直到仍授权的 authority成功获得 fresh carrier。

Control loss/Runtime exit才由 Runtime Control/Supervisor解释为 Runtime failure。

---

## 10. Hostra Desktop Realization

```text
Hostra Desktop
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

## 11. PWA Realization

```text
PWA
├── Worker Subsystem Runner
├── Worker lifecycle supervision
├── Runtime Control MessagePort
├── Worker provisioning Port/message path
├── browser Window Renderer
├── Renderer Control MessagePort
├── Data Broker MessageChannel/Port transfer
└── Fetch + Service Worker / OPFS Content
```

Structured Clone只用于 Platform bootstrap/Port transfer；进入 Control/Data carrier后 application unit仍为 JSON text string。

---

## 12. Cross-platform Mapping

| Capability | Hostra Desktop | PWA |
|---|---|---|
| Subsystem Runtime | Node Runner Process | Worker Runner |
| Runtime supervision | process exit | Worker termination/error |
| Runtime Control | WebSocket text | MessagePort string |
| Renderer Hosting | Hostra BrowserWindow | browser Window |
| Renderer Control | WebSocket text | MessagePort string |
| Data provisioning | Runner IPC + endpoint/ticket | Worker Port + transferred Port |
| Data carrier | authenticated WebSocket | MessagePort string |
| Content | fs + HTTP | Fetch + SW / OPFS |

Application authority/identity/order/recovery必须等价。

---

## 13. Business Portability

```text
@loomrealm/map
    → @loomrealm/subsystem
```

同一 Definition Module由不同 Runner加载。

```text
business semantics = shared
Platform Runner/bootstrap/provisioning = platform-specific
```

业务代码不得自己判断 Desktop/PWA或创建 physical connection。

---

## 14. Platform Architecture != Platform Package

当前：

```text
apps/desktop
apps/pwa
```

是最终 composition roots。

只有 platform glue出现多个独立消费者、稳定 API、独立 replacement/release价值时，才抽 `platform-*` helper。

---

## 15. Cross-platform Equivalence

相同 abstract application trace必须比较：

```text
Runtime lifecycle
Frame/Activation/outcome/unwind
Renderer authority
Data S/G/Profile current/retired state
User Input delivered semantics
Render authoritative replica
Content logical response
```

不比较：

```text
PID vs Worker
WS URL vs MessagePort
IPC payload vs transfer object
HTTP port vs Service Worker internal
```

---

## 16. Security / Authority Boundary

Platform MUST NOT：

```text
mint/restore Activation
mutate Stack/InputTarget
choose failure unwind root
mint Data generation/profile independently
turn endpoint/ticket into DataAuthority
put Data physical material in Runtime ready/Frame/Render payload
retry ambiguous Frame operation
widen application values with Structured Clone
```

Platform MAY生成 bootstrap/token/ticket/Port，但这些只用于建立正确 physical capability。

---

## 17. Final Invariants

1. Platform是完整 physical Session composition boundary；
2. Main/Renderer/Subsystem/Content保持 platform-neutral；
3. Definition Module与 Runtime Runner分离；
4. role-local ports是 Platform projection，不是完整 Platform；
5. RuntimeControlBinding / RendererDataBinding / SubsystemDataBinding职责明确；
6. DataConnectionBroker实现 current Main S/G/Profile authority但不拥有它；
7. late Data provisioning必须通过独立 Platform path到达已运行 Runner；
8. Platform provisioning不是 application protocol；
9. Data provisioning failure不等于 Runtime/Frame failure；
10. capability lifetime与 carrier lifetime分离；
11. Control/Data application units统一 UTF-8 JSON text string；
12. Hostra/PWA physical机制不同但 logical trace等价；
13. Platform Architecture不自动产生 platform npm package。