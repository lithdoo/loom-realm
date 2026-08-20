# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层 logical roles、Game/Launcher/Main bootstrap boundary、状态所有权、运行承载、Platform Composition 与主要 authority/lifecycle 关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)  
> 被以下文档细化：[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[运行时启动系统](./runtime-bootstrap-system.md)、[栈式运行系统](./stack-runtime-system.md)、[通信系统](./communication-system.md)、[渲染系统](./rendering-system.md)、[Subsystem 模型](./subsystem-model.md)  
> 最近复核：2026-08-20

本文只描述 system-level responsibility / authority / topology。精确 wire、transaction、error、limit、conformance 由 `15-contracts` 定义。

---

## 1. Bootstrap Boundary vs Runtime Roles

Game Package 不是 Runtime role。

Bootstrap boundary：

```text
Game installation / source
        ↓
matching Platform Launcher PREPARE
    ├── @loomrealm/game-package
    ├── current Platform Launch Manifest
    ├── exact join
    ├── executable/security/capability preflight
    └── immutable PlatformLaunchPlan
        ↓
Prepared current-platform game
    ├── LogicalGameBootstrap
    └── plan-bound RuntimeHosting
        ↓
apps/* composition
```

Platform-neutral Runtime/application roles：

```text
LoomRealm Main
├── Session / Runtime authority
├── Frame / Stack / Activation
├── InputTarget
├── transaction/failure unwind
└── DataAuthority

Subsystem Runtime
├── business state
├── local Frame/Input Context
├── Interest[F]
└── Render Domain authoritative state

Web Renderer
├── read-only Main authority mirror
├── Data connections
├── Input producers/gating
└── Render replica/presentation

Readonly Content Service
```

因此：

```text
Game Package capability != Runtime role
GameEntryV1 != Main state model
```

---

## 2. Main-facing Logical Bootstrap

Main 不解析 `game.json`，不 import `@loomrealm/game-package`。

Main 只接收 full PREPARE 后的 logical projection：

```ts
interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}
```

它只表达：

```text
complete logical key set
initial logical target
initial business JsonValue
```

它不表达：

```text
formatVersion
ValidatedGameEntry brand
module/path/URL
Platform manifest
Node/Worker/Runner
PlatformLaunchPlan
```

Main 通过独立 Main-facing Platform port 使用 plan-bound `RuntimeHosting`。

---

## 3. Platform Composition

Platform 负责真实 physical Session realization：

```text
matching Game Launcher / executable PREPARE
Runtime Hosting / Supervision
Main ⇄ Subsystem Control binding
Renderer Hosting
Main ⇄ Renderer Control binding
Renderer ⇄ Subsystem DataConnectionBroker
late Data provisioning
Content Binding
physical startup/shutdown
```

Hostra：

```text
launch.hostra.json
Node Runner Process
WebSocket
BrowserWindow
Runner provisioning IPC
HTTP/fs
```

PWA：

```text
launch.pwa.json
Dedicated Worker Runner
MessagePort/MessageChannel
Window
Worker provisioning
Service Worker/Fetch/OPFS
```

Platform physical ownership不会提升成 Main/Subsystem/Renderer application authority。

---

## 4. Game Entry / Platform Executable Binding

Game Entry v1：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

还包含：

```text
formatVersion
initial.subsystem
initial.input
complete required key set
```

Current Platform独立声明：

```text
Hostra Launch Manifest
    key → Hostra Definition Module

PWA Launch Manifest
    key → PWA Definition Module
```

Phase 1：

```text
keys(Game Entry) = keys(Current Platform Launch Manifest)
```

```text
subsystemKey = application identity
module/path/URL = Platform executable material
```

业务 module不是 Node process entry，也不是 Worker constructor policy。

---

## 5. Parse → Plan → Commit

Matching Launcher 的 PREPARE 是完整 transaction：

```text
obtain/read Game Entry
→ validate via @loomrealm/game-package
→ validate current Platform Launch Manifest
→ exact key-set join
→ resolve every required executable binding
→ installation/security containment
→ hosting capability preflight
→ freeze immutable PlatformLaunchPlan
→ project immutable LogicalGameBootstrap
────────────────────────────────────────────
first business Runtime side effect may begin
```

任何 PREPARE failure：

```text
Process/Worker creation = 0
business Definition import = 0
Runtime Control establishment = 0
```

Prepared result 释放后，普通 Runtime launch 不再解释 raw Game/Platform config。

---

## 6. Runtime / Runner

每个 `subsystemKey` 同时最多一个 active Runtime Container。

Physical entry：

```text
Hostra → Host-owned Node Runner Process
PWA    → Host-owned Worker Runner
```

Runner：

```text
verify planned key/binding
→ import exact selected Definition Module
→ validate SubsystemDefinitionFactory
→ construct role-local Platform Ports
→ enter @loomrealm/subsystem/host
```

Hostra/PWA MAY 加载不同 artifact；相同 logical key、author ABI、formal semantics 与 business-observable result 才是跨平台不变量。

---

## 7. Main Runtime Authority

Main 创建 Launch Attempt 后只发：

```text
RuntimeHosting.launch(subsystemKey, LaunchAttemptMaterial)
```

Main 不持有：

```text
module/path/URL
Node executable/argv/env
Worker target/options
Runner entry
Control endpoint/MessagePort
```

Runtime lifecycle：

```text
launch
!= physical container created
!= connected
!= identified
!= ready
```

`stopped` 只来自 actual physical termination observation。

No automatic restart；新的 Runtime = fresh Launch Attempt + fresh physical/control lifetime。

---

## 8. Runtime Control

当前：

```text
Subsystem Control v1
+ Frame / Call v1
= Runtime Control Application Profile v1
```

```text
ready != Data current
ready != Renderer exists
```

Control carrier loss在无 shutdown intent时进入 Runtime failure；same-attempt Control reconnect不存在。

---

## 9. Frame / Activation

Main 唯一拥有：

```text
frameId
Frame→subsystemKey
caller
lifecycle/outcome
Stack
activationId
InputTarget
transaction/recovery
```

核心 transaction barrier：

```text
Response-before-dependent-RPC
ACK-before-publication
post-commit no rollback
```

Frame mutation outcome：

```text
Success        → known commit
Explicit Error → protocol-defined known no-commit/fatal
Timeout/loss   → ambiguous → Runtime failure
```

No retry/replay ambiguous mutation。

Failure unwind root/order由 Main 计算，Platform/Runner/SDK不得自行替代。

---

## 10. Renderer Control

Main 向 Renderer 发布 committed authority snapshot：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority {
    subsystemKey,
    generation,
    dataProfile
}
```

Snapshot 不携：

```text
Data endpoint/ticket/MessagePort
PlatformLaunchPlan/module
Interest Registry
Render state
Content credential
```

Renderer 只复制 authority，不 mint/recover authority。

---

## 11. Renderer Data

Current profile：

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

Data Connection identity：

```text
Session + current Renderer + subsystemKey + generation
```

```text
Data loss != Runtime failure
Data loss != Frame unwind
same generation/profile MAY sequential reconnect
profile change MUST fresh generation
```

Platform DataConnectionBroker 只实现 physical carrier；generation/profile 仍属于 Main authority。

---

## 12. User Input

```text
Effective(F,A,C)
=
current matching Data
∧ Main InputTarget(S,F,A)
∧ current active Activation
∧ C ∈ Interest[F]
∧ Producer(C)
```

Authority：Main InputTarget。  
Configuration：Subsystem `Interest[F]`。  
Physical producer：Renderer。

fresh Activation 可以复用 Interest config，但不能复用 old Input State/Event。

---

## 13. Render

Subsystem 拥有 `0..N` Render Domains authoritative state。

```text
Frame close != Render Domain destroy
Frame suspend != Render hide
Data carrier loss != authoritative Render destroy
```

fresh Data carrier 通过 current Registry + fresh Snapshot 重建 Renderer replica baseline。

---

## 14. Content / Execution Boundary

必须区分：

```text
Platform executable resolver/Runner capability
Readonly Content capability
```

业务/Renderer 只使用 logical Content identity；不得获得 arbitrary physical path 或 executable capability。

---

## 15. Messaging Model

当前 message-oriented Control/Data profiles统一：

```text
one carrier application unit
= one UTF-8 JSON text string
```

因此：

```text
WebSocket text message
MessagePort postMessage(string)
MemoryCarrier string
```

Structured Clone 只用于 Platform bootstrap/Port transfer。

---

## 16. State Ownership

```text
Game Package capability
    validates Game Entry document

Platform Launcher
    consumes Game Entry for current-platform PREPARE
    owns executable binding/preflight LaunchPlan
    projects LogicalGameBootstrap
    implements plan-bound RuntimeHosting

Main
    Session/Runtime/Frame/Activation/InputTarget/DataAuthority

Subsystem
    business state / Interest[F] / Render Domains

Renderer
    read-only Main mirror / Producers / Render replica

Platform Composition
    complete physical topology/bootstrap/provisioning
```

Physical ownership不改变 application authority owner。

---

## 17. Dependency Boundary

禁止：

```text
main → game-package
main → concrete game-launcher-*
business → game-package
business → game-launcher-*
game-package → launcher/Main
```

允许：

```text
launcher → game-package
apps/* → matching launcher + roles + adapters
```

---

## 18. Core Invariants

1. Game Package 不是 Runtime role；
2. Game Entry document model 与 Main bootstrap model 分离；
3. matching Launcher 是 Runtime-product Game Entry consumer；
4. Main 不依赖 Game Package 或 concrete Launcher；
5. Descriptor v1 精确 `{key}`；
6. executable binding由 current Platform Launch Manifest拥有；
7. Phase 1 Game/Platform key set严格相等；
8. immutable PlatformLaunchPlan + LogicalGameBootstrap 在任何 business Runtime side effect前闭合；
9. Main launch intent只携 logical key/Launch Attempt material；
10. Host-owned Runner是 physical Runtime entry；
11. Definition artifact可按平台不同；
12. Frame/Stack/Activation/recovery authority = Main；
13. ambiguous Frame mutation Runtime-fatal/no retry；
14. DataAuthority = subsystemKey + generation + dataProfile；
15. Broker只实现 physical carrier；
16. Data provisioning/loss不等于 Runtime/Frame failure；
17. Render lifecycle独立于 Frame/Data carrier；
18. message-oriented profiles统一 UTF-8 JSON text；
19. Hostra/PWA比较 logical application trace，不比较 physical/executable trace。
