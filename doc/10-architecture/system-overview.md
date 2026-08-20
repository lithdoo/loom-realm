# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层逻辑角色、状态所有权、Game/Platform launch boundary、运行承载、Platform Composition 与主要 authority/lifecycle 关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)  
> 被以下文档细化：[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[通信系统](./communication-system.md)、[渲染系统](./rendering-system.md)、[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 最近复核：2026-08-20

本文只描述系统关系；精确 wire/transaction/error/limit/conformance由 `15-contracts` 定义。

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

这些都是 platform-neutral logical roles。

---

## 2. Platform Composition

Platform负责把上述角色实现成真实物理 Session：

```text
current-platform Launch Manifest / preflight LaunchPlan
Runtime Hosting / Supervision
Main ⇄ Subsystem Control binding
Renderer Hosting
Main ⇄ Renderer Control binding
Renderer ⇄ Subsystem Data Connection Broker
Content Binding
Runner bootstrap/provisioning
physical startup / shutdown
```

典型：

```text
Hostra Desktop
    launch.hostra.json
    Node Runner Process / WebSocket / BrowserWindow / HTTP / IPC

PWA
    launch.pwa.json
    Dedicated Worker Runner / MessagePort / Window / Service Worker
```

Platform不拥有 Frame/Activation/InputTarget/DataAuthority/Render Domain等 application authority。

---

## 3. Game Package / Platform Executable Binding

Game Package v1声明 platform-neutral logical topology：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

并声明：

```text
formatVersion
initial.subsystem
initial.input
complete required key set
```

Game Package不声明 executable module。

当前 Platform分别声明：

```text
Hostra Launch Manifest
    key → Hostra Definition Module

PWA Launch Manifest
    key → PWA Definition Module
```

Phase 1：

```text
keys(GameEntry.subsystems)
=
keys(CurrentPlatformLaunchManifest.subsystems)
```

因此：

```text
subsystemKey = application identity
module/path/URL = platform executable binding/material
```

业务 module不是 Node process entry，也不是 Worker constructor policy。

---

## 4. Preflight LaunchPlan

任何 business Runtime side effect前，Platform必须闭合：

```text
Game Entry validation
→ current Platform Launch Manifest validation
→ exact key-set join
→ resolve every required executable binding
→ installation/security containment
→ hosting capability preflight
→ immutable PlatformLaunchPlan
```

任何 config/join/resolution/capability failure：

```text
Process/Worker creation = 0
business Definition import = 0
Runtime Control establishment = 0
```

Main之后只发：

```text
launch(subsystemKey, LaunchAttemptMaterial)
```

Main不持有 module/path/URL/Node/Worker options；RuntimeHosting内部 lookup frozen plan。

---

## 5. Runtime / Runner

每个 `subsystemKey` 同时最多一个 active Runtime Container。

```text
Hostra → Host-owned Node Subsystem Runner Process
PWA    → Host-owned Worker Subsystem Runner
```

Runner负责：

```text
verify planned key/binding
load exact plan-selected Definition Module ABI
construct Subsystem-facing Platform Ports
enter @loomrealm/subsystem/host
```

Definition Module只表达业务，不自己建立 WebSocket/MessagePort或读取 Platform manifest。

Hostra/PWA MAY加载不同 build artifact；相同 SubsystemDefinitionFactory ABI、formal protocol semantics 与 business-observable result是跨平台要求。

---

## 6. Runtime Control

当前 Runtime Control：

```text
Subsystem Control v1
+ Frame / Call v1
= Runtime Control Application Profile v1
```

逻辑启动：

```text
Launch Attempt / bootstrapToken
→ Platform RuntimeHosting plan lookup
→ Host-owned Runner Runtime
→ Control carrier established
→ subsystem.hello
→ identified
→ optional initializing
→ ready
```

```text
launch != connected != identified != ready
ready != Data Connection exists
```

Control carrier loss在无 shutdown intent时进入 Runtime failure；无 same-attempt reconnect。

---

## 7. Frame / Activation

Main唯一拥有：

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

Frame lifecycle：

```text
starting / active / suspended / closing / closed
```

Activation one-shot、Session unique、revoked never valid again。

Frame lifecycle不拥有 Runtime/Data/Render lifecycle。

---

## 8. Frame Call / Return

Normal Call：

```text
Caller active/A1
→ accept call: revoke A1, suspend Caller, push Child starting, InputTarget=null
→ call Response
→ Child initialize/activate
→ activate ACK
→ publish Child InputTarget
```

Normal Return：

```text
accept return: store outcome, revoke Child A, closing, InputTarget=null
→ return Response
→ close Child/pop
→ resume Caller with fresh Activation
→ resume ACK
→ publish Caller InputTarget
```

必须保持：

```text
Response-before-dependent-RPC
ACK-before-publication
post-commit no rollback
accepted outcome preserved
fresh surviving Caller Activation
```

Platform/Runner/SDK ergonomics不得改变这些事实。

---

## 9. Runtime Failure

Frame state-changing Request：

```text
Success        → known committed
Explicit Error → protocol-defined known no-commit/fatal
Timeout/loss   → ambiguous
```

ambiguous/divergence/protocol error → Runtime failure；no retry/replay。

Main failure unwind：

```text
failedRuntimeKeys
→ lowest live occurrence
→ whole suffix doomed
→ cleanup Top→Bottom
→ fixed-point expansion
→ preserve accepted root outcome when one exists
→ fresh resume direct healthy Caller or empty Stack
```

Renderer/Subsystem/Platform/Supervisor不得自行计算 unwind root。

---

## 10. Renderer Control

Main向 Renderer发布完整 committed authority snapshot：

```text
Runtime projection
live Frame Stack / Activation
InputTarget
DataAuthority {
    subsystemKey,
    generation,
    dataProfile
}
```

当前 `dataProfile`：

```text
loomrealm.renderer-data/1
```

Snapshot不携：

```text
Data endpoint/ticket/MessagePort
Platform LaunchPlan/module material
Interest Registry
Render state
Content credential
```

Renderer只复制 authority，不自行 mint/recover它。

---

## 11. Renderer Data Application Stack

当前：

```text
Renderer Data Application Profile v1
├── Data Connection v1
├── User Input v1
└── Render Update v1
```

Data Connection identity：

```text
Session + current Renderer + subsystemKey + generation
```

并要求 current carrier匹配该 generation 的 immutable `dataProfile`。

```text
Data loss != Runtime failure
Data loss != Frame unwind
same generation/profile MAY sequential reconnect
profile change MUST fresh generation
```

Connection Core本身不拥有 User Input/Render child state。

---

## 12. Data Connection Broker / Provisioning

Main只拥有 logical DataAuthority；Platform Broker负责 physical carrier：

```text
Main DataAuthority(S,G,P)
        ↓
Platform DataConnectionBroker
      /               \
 Renderer endpoint   Subsystem endpoint
```

Hostra 对已经运行的 Node Runner通过独立 Platform Provisioning Channel交付 fresh Data physical material；PWA通过 Worker provisioning/Port transfer实现同一 role-local `SubsystemDataBinding` semantics。

Broker不 mint `generation/profile`，也不能从 endpoint/ticket/Port推导 authority。

Provisioning不是 Runtime Control、Renderer Control、Platform launch manifest或 business API。

```text
provisioning failure
    != Runtime failure
    != Frame unwind
    != DataAuthority mutation
```

---

## 13. User Input

```text
Effective(F,A,C)
=
current matching Data Connection
∧ Main InputTarget == (S,F,A)
∧ mirrored/local F active/current A
∧ C ∈ Interest[F]
∧ Producer(C) available
```

```text
InputTarget = Main authority
Interest[F] = Subsystem Frame-scoped config
Producer    = Renderer-local fact
```

Interest不创建 authority。

fresh Activation：Interest可复用，old Input State/Event不可复用。

fresh Data carrier：remote Interest Registry/retained State empty，Subsystem重新发布 current full registry。

Control/Data无跨连接 total order；Interest-first/Authority-first都安全。

---

## 14. Render

Render Domain由 Subsystem拥有：

```text
0..N Domains per Runtime
Domain Registry
Snapshot
Patch
Event
```

```text
Frame close != Render destroy
Frame suspend != Render hide
Data retire != authoritative Domain destroy
```

fresh Data carrier通过 current Registry + fresh Snapshots重建 replica baseline。

Renderer只拥有 replica/presentation，不成为 authoritative render state owner。

---

## 15. Content

Content API提供跨平台 logical readonly access：

```text
Desktop → filesystem-backed HTTP
PWA     → Fetch + Service Worker / OPFS
```

业务/Renderer只使用 logical identity，不获得 arbitrary physical path/执行能力。

必须区分：

```text
Platform executable resolver/Runner capability
Readonly Content capability
```

Content bearer、Runtime bootstrap token、Data ticket与 executable capability相互独立。

---

## 16. Messaging Model

当前 LoomRealm message-oriented Control/Data Profiles统一：

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

共享同一 application value model；Structured Clone只用于 Platform bootstrap/Port transfer。

Transport Adapter不得自行 retry/duplicate application mutation。

---

## 17. State Ownership

```text
Game Package
    logical topology / initial business input

Main
    Session/Runtime public authority
    Frame/Stack/Activation/Outcome
    transaction/unwind
    InputTarget
    DataAuthority generation/profile

Subsystem
    business state
    Runtime status reporting
    local Frame/Input Context + gate
    Interest[F]
    Render Domain Registry/State

Renderer
    read-only Main mirror
    current Data carrier endpoints
    Input producer/gating state
    Render replica/presentation

Platform Launcher
    current-platform executable binding/preflight LaunchPlan
    RuntimeHosting/Runner launch integration

Platform Composition
    process/worker/window/socket/port/content topology
    Runner bootstrap/provisioning
    physical supervision/cleanup
```

Physical ownership不提升为 application authority。

---

## 18. Business Portability

```text
@loomrealm/map
    → @loomrealm/subsystem
```

业务 source不得：

```text
read launch.hostra.json / launch.pwa.json
import game-launcher-hostra/pwa
if desktop → WebSocket
if pwa → MessagePort
branch on process/Worker/module URL
```

Hostra/PWA可使用由同一 platform-neutral business source生成的不同 Definition artifact；artifact identity不是 application identity。

---

## 19. Package Boundary

```text
Protocol boundary
!= npm package boundary
!= Runtime process boundary
!= Platform boundary
```

当前窄 Runtime launch packages：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

它们不等价完整 Platform package。

完整 Platform Composition仍由：

```text
apps/desktop
apps/pwa
```

作为 composition roots；重复 glue是否抽 package按真实消费者决定。

---

## 20. Core Invariants

1. Main/Renderer/Subsystem/Content是 platform-neutral logical roles；
2. Platform负责完整 physical Session，不拥有 application authority；
3. Game Package v1 Descriptor精确只有 `{key}`；
4. executable binding由 current Platform Launch Manifest/Profile拥有；
5. Phase 1 Game/Platform key set严格相等；
6. immutable PlatformLaunchPlan在任何 business Runtime side effect前闭合；
7. Main launch intent只携 logical key/Launch Attempt material，不携 executable target；
8. Host-owned Runner是 physical Runtime entry；
9. Definition Module ABI/formal semantics统一，artifact/path不要求跨平台相同；
10. one Subsystem key → at most one active Runtime；
11. Runtime Control Profile v1 = Control 1 + Frame 1；
12. ready不携/暗示 Data material；
13. Frame/Stack/Activation/recovery authority = Main；
14. Response-before-dependent-RPC / ACK-before-publication；
15. ambiguous Frame mutation Runtime-fatal/no retry；
16. DataAuthority = subsystemKey + generation + dataProfile；
17. current Data Profile v1 = Connection 1 + Input 1 + Render 1；
18. Data Broker负责 physical carrier，generation/profile仍由 Main authority拥有；
19. dynamic Data provisioning走独立 Platform channel，不污染 Control/Launch manifest；
20. Data loss/provision failure不等于 Runtime/Frame failure；
21. Interest是 Frame-scoped config，只能缩小 Main input authority；
22. Render lifecycle独立于 Frame/Data carrier；
23. message-oriented profiles统一 UTF-8 JSON text；
24. Hostra/PWA对同一 logical scenario必须得到等价 application semantics，而不是相同 physical/executable trace。
