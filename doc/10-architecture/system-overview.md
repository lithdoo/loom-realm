# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层逻辑角色、状态所有权、运行承载、Platform Composition 与主要 authority/lifecycle 关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)  
> 被以下文档细化：[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[通信系统](./communication-system.md)、[渲染系统](./rendering-system.md)、[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 最近复核：2026-08-19

本文只描述系统关系；精确 wire/transaction/error/limit/conformance由 `15-contracts` 定义。

---

## 1. 顶层逻辑角色

```text
Game Package
    ↓
LoomRealm Main
├── Session / Descriptor / Runtime authority
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
Runtime Hosting / Supervision
Main ⇄ Subsystem Control binding
Renderer Hosting
Main ⇄ Renderer Control binding
Renderer ⇄ Subsystem Data Connection Broker
Content Binding
physical startup / shutdown
Runner bootstrap/provisioning
```

典型：

```text
Hostra Desktop
    Node Runner Process / WebSocket / BrowserWindow / HTTP / IPC

PWA
    DedicatedWorker / MessagePort / Window / Service Worker
```

Platform不拥有 Frame/Activation/InputTarget/DataAuthority/Render Domain等 application authority。

---

## 3. Game Package / Business Module

Game Package v1声明 platform-neutral topology：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

`module` 指向 `.mjs` Subsystem Definition Module。

```text
Game Package declares business module
Platform chooses Runtime Runner
Runner loads same Definition Module
```

业务 module不是 Node process entry，也不是 Worker constructor policy。

---

## 4. Runtime / Runner

每个 `descriptor.key` 同时最多一个 active Runtime Container。

```text
Hostra → Host-owned Node Subsystem Runner Process
PWA    → Host-owned Worker Subsystem Runner
```

Runner负责：

```text
load Definition Module ABI
construct Subsystem-facing Platform Ports
enter @loomrealm/subsystem host runtime
```

Definition Module只表达业务，不自己建立 WebSocket/MessagePort。

---

## 5. Runtime Control

当前 Runtime Control：

```text
Subsystem Control v1
+ Frame / Call v1
= Runtime Control Application Profile v1
```

逻辑启动：

```text
Launch Attempt / bootstrapToken
→ Platform launches Runner Runtime
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

## 6. Frame / Activation

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

## 7. Frame Call / Return

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

Response-before-dependent-RPC；ACK-before-publication；post-commit no rollback。

---

## 8. Runtime Failure

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
→ preserve accepted root outcome
→ fresh resume direct healthy Caller or empty Stack
```

---

## 9. Renderer Control

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

Snapshot不携 endpoint/ticket/MessagePort/Interest/Render state。

---

## 10. Renderer Data Application Stack

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
```

---

## 11. Data Connection Broker / Provisioning

Main只拥有逻辑 DataAuthority；Platform Broker负责物理 carrier：

```text
Main DataAuthority(S,G,P)
        ↓
Platform DataConnectionBroker
      /               \
 Renderer endpoint   Subsystem endpoint
```

Hostra 对已经运行的 Node Runner通过独立 Platform Provisioning Channel交付 fresh Data physical material；PWA通过 Worker/Port transfer实现同一 role-local `SubsystemDataBinding` semantics。

Provisioning不是 Runtime Control，也不进入 business API。

---

## 12. User Input

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

## 13. Render

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

---

## 14. Content

Content API提供跨平台 logical readonly access：

```text
Desktop → filesystem-backed HTTP
PWA     → Fetch + Service Worker / OPFS
```

业务/Renderer只使用 logical identity，不获得任意 physical path/执行能力。

---

## 15. Messaging Model

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

---

## 16. State Ownership

```text
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

Platform
    process/worker/window/socket/port/content topology
    Runner bootstrap/provisioning
    physical supervision/cleanup
```

Physical ownership不提升为 application authority。

---

## 17. Business Portability

```text
@loomrealm/map
    → @loomrealm/subsystem
```

同一个 Definition Module由 Hostra Node Runner/PWA Worker Runner加载。

业务不得：

```text
if desktop → WebSocket
if pwa → MessagePort
```

---

## 18. Package Boundary

```text
Protocol boundary
!= npm package boundary
!= Runtime process boundary
!= Platform boundary
```

Platform Composition当前由：

```text
apps/desktop
apps/pwa
```

作为 composition roots；重复 glue是否抽 package按真实消费者决定。

---

## 19. Core Invariants

1. Main/Renderer/Subsystem/Content是 platform-neutral logical roles；
2. Platform负责完整 physical Session，不拥有 application authority；
3. Game Package v1只声明 `{key,module}`；
4. Platform Runner加载同一 Definition Module；
5. one Subsystem key → at most one active Runtime；
6. Runtime Control Profile v1 = Control 1 + Frame 1；
7. ready不携/暗示 Data material；
8. Frame/Stack/Activation/recovery authority = Main；
9. Response-before-dependent-RPC / ACK-before-publication；
10. ambiguous Frame mutation Runtime-fatal/no retry；
11. DataAuthority = subsystemKey + generation + dataProfile；
12. current Data Profile v1 = Connection 1 + Input 1 + Render 1；
13. Data Broker负责 physical carrier，generation/profile仍由 Main authority拥有；
14. Desktop dynamic Data provisioning走独立 Platform channel，不污染 Control；
15. Data loss不等于 Runtime/Frame failure；
16. Interest是 Frame-scoped config，只能缩小 Main input authority；
17. Render lifecycle独立于 Frame/Data carrier；
18. message-oriented profiles统一 UTF-8 JSON text；
19. Hostra/PWA对同一 abstract application trace必须语义等价。