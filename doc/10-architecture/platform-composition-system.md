# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：LoomRealm 跨平台 composition boundary、平台职责、role-facing platform ports，以及 Hostra Desktop / PWA 对同一逻辑 Session 的物理实现关系  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[运行承载系统](./runtime-hosting-system.md)、[通信系统](./communication-system.md)、[ADR 0002](../decisions/0002-platform-transport-profiles.md)、[ADR 0017](../decisions/0017-system-level-platform-composition.md)  
> 被以下文档实现：[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 最近复核：2026-08-19

本文回答：**同一套 LoomRealm application semantics 如何在不同物理平台上组成一个完整 Session。**

它不定义新的 wire protocol，也不规定必须存在某个 `platform-*` npm package。

---

## 1. 核心结论

LoomRealm 的 Main、Renderer、Subsystem、Content 是平台无关的逻辑角色；Desktop/PWA 是这些角色的不同物理承载与 composition。

```text
                  Platform-neutral LoomRealm
┌──────────────────────────────────────────────────────┐
│                                                      │
│   Main          Renderer          Subsystem           │
│    │               │                 │                │
│    └──── formal contracts / role capabilities ──────┤
│                                                      │
│                    Content                           │
└──────────────────────────────────────────────────────┘
                         │
                    Platform Ports
                         │
          ┌──────────────┴──────────────┐
          │                             │
          ▼                             ▼
   Hostra Desktop Platform          PWA Platform
```

必须保持：

```text
Platform != Main
Platform != Renderer
Platform != Subsystem
Platform != Transport
Platform != Protocol
Platform composition != npm package boundary
```

平台负责**建立物理拓扑并向逻辑角色提供所需能力**；平台不得获得 Main/Subsystem/Renderer/Content 已有的 application authority。

---

## 2. 为什么 Platform 是系统级边界

如果只从某一个角色看跨平台问题，会得到局部接口：

```text
Subsystem 需要 Control carrier / Data carrier
Renderer 需要 Control carrier / Data carrier
Main 需要 Runtime launcher / Supervisor
```

但一个完整 Session 同时需要协调：

```text
Runtime hosting
Runtime supervision
Main ⇄ Subsystem Control
Renderer hosting
Main ⇄ Renderer Control
Renderer ⇄ Subsystem Data
Content
bootstrap material delivery
physical resource shutdown
```

因此跨平台不能归属于 `@loomrealm/subsystem`、`@loomrealm/main`、`@loomrealm/renderer` 或某个 Transport Adapter。

正确方向是：

> **Platform Composition 建立完整物理 Session；各逻辑角色只消费与自身职责相关的 role-facing platform ports。**

---

## 3. Platform Capabilities / Ports

以下是架构概念能力，不要求一项能力对应一个 npm package 或一个 TypeScript interface。

### 3.1 Runtime Hosting

负责把 validated Subsystem Descriptor / Launcher Target 实现为具体 Runtime Container，并提供可监督的物理生命周期。

```text
Desktop → Node child process
PWA     → Dedicated Worker
```

Runtime Hosting 不拥有 Runtime public lifecycle、Frame authority 或 failure unwind。

### 3.2 Runtime Control Binding

负责建立一条已经绑定到预期 Launch Attempt / Runtime bootstrap context 的 Main ⇄ Subsystem Control carrier。

建立后 application semantics 完全由：

```text
Subsystem Control v1
+
Frame / Call v1
=
Runtime Control Application Profile v1
```

定义。

### 3.3 Renderer Hosting

负责承载当前 Renderer participant 的物理环境。

```text
Hostra Desktop → Electron BrowserWindow / Web application
PWA            → browser Window / Web application
```

Renderer Hosting 不创建 Frame/InputTarget/DataAuthority，也不拥有 Render Domain state。

### 3.4 Renderer Control Binding

负责建立 Main ⇄ current Renderer Control carrier。

建立后 Renderer Control 的 authority snapshot、revision、loss/replacement 语义只由 Renderer Control v1 决定。

### 3.5 Data Connection Broker

这是 Renderer ⇄ Subsystem Data 的系统级物理协调能力。

```text
                 Main
                  │
          DataAuthority(S,G)
                  │
                  ▼
        Data Connection Broker
             /             \
            ▼               ▼
       Renderer          Subsystem
```

Broker 依据 current Main authority 为 Renderer 与目标 Subsystem 建立一对安全绑定的 carrier endpoints，并在安装前确保身份对应：

```text
current Session
current Renderer participant
subsystemKey
current DataAuthority generation
```

Broker 不拥有 `generation`，不从 endpoint/Port 推导 DataAuthority，也不决定 User Input / Render Update semantics。

### 3.6 Content Binding

负责在当前平台上提供 Content API 的实际访问实现。

```text
Desktop → filesystem-backed service + localhost HTTP
PWA     → same-origin Fetch + Service Worker / OPFS
```

平台机制不得改变 Content API logical identity、cache/version/integrity/error semantics。

### 3.7 Platform Lifecycle

Composition root 负责把上述能力组成一个产品运行实例，并处理物理资源的 startup/shutdown：

```text
process / Worker
socket / MessagePort
BrowserWindow / Window integration
HTTP / Service Worker
platform-local credentials/bootstrap material
```

这些资源的物理 cleanup 不得伪装成 Frame/Render/Data application lifecycle。

---

## 4. Role-facing Platform Ports

Platform 拥有完整物理拓扑，但每个逻辑角色只看到自己的投影。

```text
System Platform
├── Main-facing ports
├── Renderer-facing ports
├── Subsystem-facing ports
└── Content-facing ports
```

例如 Subsystem role 可以消费：

```text
Runtime Control connection source
Renderer Data connection source
Content client/binding
```

Renderer role 可以消费：

```text
Renderer Control connection source
per-Subsystem Data connection source
Content client/binding
browser/device presentation/input environment
```

Main role 可以消费：

```text
Runtime Hosting / Supervisor
Control endpoint/binding facilities
Renderer Hosting integration
Data Connection Broker
Content Service integration
```

这些 role-local interfaces 是 Platform Composition 的**投影**，不是整个跨平台架构本身。

---

## 5. Connection 与 Capability Lifetime

实际 carrier 是易失的物理资源；role capability 的生命周期不应默认等于 carrier lifetime。

```text
physical carrier lifetime
    < may be shorter than >
logical capability / role lifetime
```

典型：

```text
Subsystem Runtime Control carrier loss
    → Runtime failure according to Control/Profile

Renderer Data carrier loss
    → Data Connection retired
    → Runtime/Frame do not automatically fail
    → same generation may obtain fresh carrier

Render Domain
    → may survive Data carrier replacement

InputListener / desired Frame Interest
    → may survive Data carrier replacement locally
    → fresh Data carrier starts empty and republishes current registry
```

因此 Transport Adapter 只应提供已建立 carrier 的消息语义；连接建立、replacement、supervision 由更高的 Platform/role binding 协调。

---

## 6. Hostra Desktop Realization

Hostra Desktop 是一个 Platform Composition realization，而不是 Main/Subsystem 的特殊版本。

```text
Hostra Desktop
├── Runtime Hosting
│   ├── Host-selected Node.js
│   ├── child process
│   └── process Supervisor
│
├── Runtime Control
│   └── localhost WebSocket
│
├── Renderer Hosting
│   └── Hostra / Electron BrowserWindow
│
├── Renderer Control
│   └── localhost WebSocket
│
├── Data Connection Broker
│   └── authenticated localhost carrier / WebSocket binding
│
└── Content Binding
    └── filesystem + localhost HTTP
```

Hostra 自身的 Shell RPC（例如 window/platform 操作）是底层宿主能力，不与 LoomRealm Runtime Control / Renderer Control application protocol 合并。

---

## 7. PWA Realization

PWA 使用浏览器原生隔离和 Port transfer 实现同一逻辑拓扑：

```text
PWA
├── Runtime Hosting
│   └── per-Subsystem Dedicated Worker
│
├── Runtime Control
│   └── authenticated/transferred MessagePort
│
├── Renderer Hosting
│   └── browser Window
│
├── Renderer Control
│   └── Window/Main controlled MessagePort
│
├── Data Connection Broker
│   └── MessageChannel + endpoint transfer
│
└── Content Binding
    └── same-origin Fetch + Service Worker / OPFS
```

Structured Clone、Port transfer、Worker startup object 只是平台机制；建立后的 LoomRealm application value model 与 protocol semantics 不得因此变化。

---

## 8. Cross-platform Mapping

| Platform capability | Hostra Desktop | PWA |
|---|---|---|
| Main hosting | local Node/product process | Main Worker / browser-controlled runtime |
| Subsystem hosting | Node child process | Dedicated Worker |
| Runtime supervision | child exit/process lifecycle | Worker error/termination |
| Main ⇄ Subsystem Control | localhost WebSocket | MessagePort |
| Renderer hosting | Hostra/Electron BrowserWindow | browser Window |
| Main ⇄ Renderer Control | localhost WebSocket | MessagePort |
| Renderer ⇄ Subsystem Data | authenticated localhost carrier | MessageChannel + transferred ports |
| Content | filesystem + localhost HTTP | Fetch + Service Worker / OPFS |
| bootstrap delivery | env/context/token/endpoint | Worker startup message + transferred ports |
| physical cleanup | process/socket/window | Worker/Port/browser lifecycle |

允许这些物理事实不同；不允许因此改变 application semantics。

---

## 9. Business Core 与 Platform Entry

业务 Subsystem 必须能够只依赖 platform-neutral author SDK：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

平台 composition 再选择如何运行它：

```text
business core
    │
    ├── Hostra/Desktop composition
    └── PWA composition
```

原则：

> **业务定义描述“做什么”；Platform Composition 描述“这些角色在当前平台上怎么跑”。**

业务代码不得因平台差异出现：

```text
if desktop → WebSocket
if pwa     → MessagePort
```

平台应把所需 role-facing ports 注入 Core/Role implementation。

---

## 10. Transport Adapter != Platform

Transport 只是 Platform realization 使用的技术能力之一。

```text
transport-websocket
transport-messageport
```

只负责类似：

```text
preserve application-message boundary
ordered delivery per direction
observable close/loss
bounded buffering
no adapter-created application retry/duplicate
```

它们不负责：

```text
launch Runtime
select Renderer participant
own DataAuthority
create InputTarget
serve Content semantics
own Session shutdown policy
```

同理 `launcher-node`、`content-http`、`content-service-worker` 都只是可组合的技术能力。

---

## 11. Platform Architecture != Platform Package

本架构定义一个系统职责边界，不要求立即创建：

```text
@loomrealm/platform-hostra
@loomrealm/platform-pwa
```

当前推荐：

```text
packages/*
    reusable capability / role / technical adapter

apps/desktop
apps/pwa
    product composition roots
```

只有当某段 Platform Composition glue 出现多个独立消费者、稳定 public API 与独立发布价值时，才按 package architecture 规则抽为公共包。

因此：

```text
Platform Composition = architecture concept
apps/desktop|pwa     = current product composition roots
platform-* package   = optional future reusable artifact
```

---

## 12. Cross-platform Semantic Equivalence

Hostra Desktop 与 PWA 对同一个 abstract application trace 必须得到等价的逻辑结果：

```text
Runtime lifecycle
Frame/Stack/Activation outcome
failure unwind
Renderer Control authority
Data Connection current/retired semantics
User Input authority/state/event semantics
Render authoritative state/recovery
Content logical results
```

不要求以下物理 trace 相同：

```text
PID / Worker identity
WebSocket URL / MessagePort
HTTP / Service Worker
Hostra Window / browser Window
bootstrap token/Port delivery sequence
```

跨平台 E2E 应验证前者，而不是把后者升级为新的 application protocol。

---

## 13. Authority / Security Boundary

Platform MUST NOT：

```text
创建或修改 Frame/Activation/InputTarget
选择 failure-unwind root
把 physical endpoint 当作 DataAuthority
从 Runtime ready 推导 Data carrier
把 Data reconnect 当作 Frame recovery
从 Render Domain 推导 input authority
通过 Transport retry state-changing Frame operation
通过平台专用 value 扩大正式 protocol JSON model
```

Platform 可以生成/传递 bootstrap credential、endpoint、ticket、Port，但这些只是建立正确 carrier 所需的 implementation material。

---

## 14. 核心不变量

1. Main、Renderer、Subsystem、Content 是 platform-neutral logical roles；
2. Platform Composition 负责完整物理 Session realization，而不只是 Transport；
3. Platform 通过 role-facing ports 向逻辑角色提供基础设施；
4. role-local binding 只是系统 Platform 的投影，不是整个跨平台架构；
5. Transport/Launcher/Content adapters 是技术能力，不是 Platform authority；
6. Data Connection Broker 只实现 current Main DataAuthority 的物理 carrier 建立，不拥有 generation；
7. Desktop/PWA 可以使用不同 Process/Worker、WebSocket/MessagePort、HTTP/Service Worker；
8. 建立后的 application contracts、authority、identity、ordering、recovery 必须跨平台等价；
9. business core 只依赖 platform-neutral role SDK/capability；
10. Platform Composition 不自动意味着存在一个 platform npm package；
11. physical resource lifecycle 不得改写 Runtime/Frame/Data/Render lifecycle；
12. 平台 bootstrap material 默认不进入正式 application wire contract。
