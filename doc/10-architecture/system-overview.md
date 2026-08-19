# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层系统划分、状态所有权、运行承载、平台组合和系统关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)  
> 被以下文档细化：[平台组合系统](./platform-composition-system.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[通信系统](./communication-system.md)  
> 最近复核：2026-08-19

本文描述系统职责与协作关系；精确 wire、transaction、error、failure-unwind、limit 与 conformance semantics 由 `15-contracts` 定义。

## 1. 顶层结构

```text
Game Package
    ↓
LoomRealm Main
├── Runtime Registry / Supervisor
├── Frame Registry / Stack / Activation
├── Frame Transaction + Failure Unwind Coordinator
├── InputTarget / Renderer Control Authority
└── DataAuthority
    │
    ├──── Main ⇄ Subsystem Runtime Control
    │
    └──── Main ⇄ Renderer Control

Subsystem Runtime Container
├── authoritative business state
├── 0..N Frame/Input Context
├── 0..N Render Domains
└── one Main Control carrier

Web Renderer
├── read-only Main authority mirror
├── User Input producer/gate
└── Render replica / presentation

Readonly Content Service
```

Renderer ⇄ Subsystem 另有独立 Data Connection，承载 User Input 与 Render Update。

这些是 **platform-neutral logical roles**。真实 Process/Worker、WebSocket/MessagePort、BrowserWindow/Window、HTTP/Service Worker 由 Platform Composition 实现。

---

## 2. Platform Composition

LoomRealm 不把 Desktop/PWA 差异塞进 Main、Renderer 或 Subsystem。

```text
                  Platform-neutral LoomRealm
        Main / Renderer / Subsystem / Content
                         │
                    Platform Ports
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
   Hostra Desktop Platform          PWA Platform
```

Platform 负责完整物理 Session realization：

```text
Runtime Hosting / Supervision
Main ⇄ Subsystem Control binding
Renderer Hosting
Main ⇄ Renderer Control binding
Renderer ⇄ Subsystem Data Connection Broker
Content Binding
physical startup / shutdown
```

Platform 不拥有 Frame/Activation/InputTarget/DataAuthority/Render Domain 等 application authority。

详细边界见 [平台组合系统](./platform-composition-system.md)。

---

## 3. 核心对象

Subsystem identity = `descriptor.key`。每 Subsystem 同时最多一个 active Runtime Container：Desktop Process / PWA Dedicated Worker。

Frame 是 Main-owned call / ordinary-input Context：

```text
frameId Session-unique / never reused
permanently bound subsystemKey
caller Main-owned immutable
lifecycle starting/active/suspended/closing/closed
outcome completed/cancelled/failed
```

Activation one-shot、never reused/resumed/rolled back。

Render 由 Subsystem 拥有：一个 Runtime 可拥有 `0..N Render Domains`，Domain 有独立 lifecycle/zIndex/tree state，不从 Frame Stack 推导 ownership/lifecycle。

---

## 4. Runtime Bootstrap / Shutdown

当前 Runtime Control 主线：

```text
Subsystem Control v1
Runtime Control Application Profile v1
    = Control v1 + Frame / Call v1
```

逻辑启动：

```text
validate descriptors
→ Launch Attempt / bootstrapToken
→ Platform Runtime Hosting launches container
→ Control carrier established
→ subsystem.hello
→ identified
→ optional initializing
→ subsystem.status({state:"ready"})
```

```text
launch success != connected != identified != ready
ready != Data Connection exists
```

`ready` 不携 Data endpoint。

正常结束：Main shutdown intent → `subsystem.shutdown` → Platform/Supervisor confirms actual Runtime termination → stopped。

无 shutdown intent 的 Runtime exit / Control loss，或 Runtime-reported failed，进入 terminal Runtime failure。

---

## 5. Frame / Call v1

Frame / Call Protocol v1：

```text
Protocol   loomrealm.frame-call / 1
Status     Active / Normative
Stability  Frozen
```

Wire exactly seven Requests：

```text
Main → Subsystem
    initialize / activate / suspend / resume / close

Subsystem → Main
    call / return
```

Subsystem Control v1 与 Frame / Call v1 是独立协议版本空间；Runtime Control Profile v1 静态绑定二者。

Normal Call：

```text
Caller active
→ Call Acceptance Commit
   revoke old Activation
   Caller suspended
   Child starting + push
   InputTarget=null
→ call Success
→ Child initialize/activate
→ activate ACK
→ publish Child InputTarget
```

Normal Return：

```text
Return Acceptance Commit
   store outcome
   revoke old Activation
   Child closing
   InputTarget=null
→ return Success
→ close ACK / pop
→ Caller resume(fresh Activation) ACK
→ publish Caller InputTarget
```

Response-before-dependent-RPC；ACK-before-publication。

---

## 6. Error / Runtime Failure

Frame Request：

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Frame v1 no automatic retry/replay。

Runtime failure unwind：

```text
failedRuntimeKeys
→ lowest live failed-runtime Frame = root
→ root..top whole suffix doomed
→ cleanup Top→Bottom
→ failed Runtime Frames logical retire
→ healthy descendants best-effort frame.close
→ cleanup failure may expand failed set/root
→ repeat to fixed point
→ preserve accepted root outcome or SUBSYSTEM_RUNTIME_FAILED
→ fresh-resume direct healthy Caller or Stack empty
```

同一 Runtime 在 Stack 出现多次时取最低 occurrence。

---

## 7. Runtime / Frame / Render / Connection 承载

```text
one Subsystem → one active Runtime Container
one Runtime   → 0..N Frame/Input Context
              → 0..N Render Domains
              → one Main Control carrier

(Session, current Renderer, subsystemKey)
              → 0..1 current Data Connection
```

Frame transaction/unwind 不隐式 create/destroy Runtime、Data Connection 或 Render Domain。

Capability lifetime 也不等于 physical carrier lifetime：Data carrier 可重建，而 Render Domain / business state 可继续存在。

---

## 8. 三类通信平面

```text
Control Plane
    Subsystem ⇄ Main
        Subsystem Control v1
        Frame / Call v1
        Runtime Control Profile v1

    Renderer ⇄ Main
        Renderer Control v1

System Data Plane
    Renderer ⇄ Subsystem
        Data Connection v1
        User Input v1
        Render Update v1

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

Renderer 不是 Frame RPC participant。

DataAuthority 只包含逻辑 authority：

```text
subsystemKey
generation
connectionProfile
```

不包含 endpoint/ticket/MessagePort。

---

## 9. Data Connection Authority

Renderer Control 发布：

```text
DataAuthority(S, generation=G, connectionProfile=P)
```

Platform Data Connection Broker 依据该 authority 建立实际 carrier，并在安装前绑定：

```text
current Session
current Renderer participant
S
G
```

Data Connection Core：

```text
current → retired
retired terminal
```

同 generation 仍授权时，旧 carrier retired 后允许建立 fresh carrier。

```text
Data loss != Runtime failure
Data loss != Frame unwind
Data retire != Render destroy
```

---

## 10. User Input

User Input ordinary authority：

```text
Effective(F,A,C)
=
current matching Data Connection
∧ Main current InputTarget == (S,F,A)
∧ mirrored Frame F active/current Activation A
∧ C ∈ Interest[F]
∧ Producer(C) available
```

Interest 是 Subsystem-owned、Frame-scoped configuration，不是 authority。

```text
Frame suspension / fresh Activation
    may retain Interest[F]

fresh Data Connection
    Interest Registry starts empty
    Subsystem republishes current full registry

fresh Activation
    never reuses old Activation input state/event
```

Renderer 不通过 `push/pop/call/return/unwind` 推导 input；只组合当前 committed authority、Interest Registry 与 Producer availability。

---

## 11. Render

Render Update 方向固定：

```text
Subsystem → Renderer
```

Render Domain 生命周期由 Subsystem 控制；Frame Stack 不决定 Render ownership/z-order/lifecycle。

当前模型使用：

```text
Domain Registry
Snapshot
Patch
Event
```

fresh Data Connection 通过 current Registry + fresh Snapshots 重建 authoritative baseline。

---

## 12. 状态所有权

```text
Main
    Runtime Registry / shutdown intent
    Frame identity / caller / lifecycle / outcome / Stack
    transaction / failure unwind
    Activation / InputTarget
    DataAuthority

Subsystem
    business state
    Runtime-reported lifecycle status
    local Frame/Input Context + mutation gate
    Input Interest configuration
    Render Domain Registry / State

Renderer
    read-only committed Main control mirror
    current Data carriers
    User Input producer/gating state
    Render replica / presentation state

Platform
    physical process/worker/window/port/socket/content topology
    bootstrap material delivery
    physical resource supervision/cleanup
```

Platform 的物理 ownership 不提升为 application authority。

---

## 13. Hostra Desktop / PWA

Hostra Desktop realization：

```text
Subsystem Runtime        Node child process
Runtime Control          localhost WebSocket
Renderer Hosting         Hostra/Electron BrowserWindow
Renderer Control         localhost WebSocket
Renderer⇄Subsystem Data authenticated localhost carrier
Content                  filesystem + localhost HTTP
```

PWA realization：

```text
Subsystem Runtime        Dedicated Worker
Runtime Control          MessagePort
Renderer Hosting         browser Window
Renderer Control         MessagePort
Renderer⇄Subsystem Data MessageChannel / transferred Port
Content                  Fetch + Service Worker / OPFS
```

Transport/bootstrap 机制可不同，但建立后的 application identity/lifecycle/ordering/recovery 必须等价。

---

## 14. Business Portability

业务 Subsystem 依赖 platform-neutral author SDK：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

Desktop/PWA composition 选择不同基础设施运行同一业务 definition。

```text
business semantics = shared
platform entry/bootstrap = platform-specific
```

业务代码不得自己判断 Desktop/PWA 并创建 WebSocket/MessagePort。

---

## 15. Package Boundary

```text
Protocol boundary
!= npm package boundary
!= runtime process boundary
!= platform boundary
```

Platform Composition 是架构概念。当前实现默认由：

```text
apps/desktop
apps/pwa
```

组合 role packages 与 technical adapters；是否将重复 glue 抽成 `platform-*` package 由真实消费者和发布价值决定。

---

## 16. 核心不变量

1. Main / Renderer / Subsystem / Content 是 platform-neutral logical roles；
2. Platform Composition 负责完整物理 Session，而不是只负责 Transport；
3. Process/Worker isolation granularity = Subsystem；
4. Subsystem Control v1 只管理 Runtime identity/lifecycle；
5. Runtime Control Profile v1 = Control v1 + Frame v1；
6. Runtime `ready` 不携/暗示 Data endpoint；
7. Frame identity/Activation 不复用；
8. Caller/Stack/transaction/recovery authority = Main；
9. Frame v1 exactly seven Requests；
10. Response-before-dependent-RPC；ACK-before-publication；
11. ambiguous/divergence/protocol error Runtime-fatal/no retry；
12. Runtime failure按 lowest occurrence unwind whole suffix；
13. accepted outcome不可覆盖；surviving Caller fresh resume；
14. Renderer Control只发布逻辑 DataAuthority；
15. Platform Data Connection Broker负责 actual carrier establishment，但不拥有 generation；
16. Data loss不等于 Runtime failure/Frame unwind；
17. Input Interest 是 Frame-scoped configuration，只能缩小、不能创建 Main authority；
18. Render lifecycle完全由 Subsystem控制；
19. stopped只来自 actual Runtime termination observation；
20. Desktop/PWA 对相同 abstract application trace 必须保持语义等价。
