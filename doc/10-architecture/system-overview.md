# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层系统划分、状态所有权、运行承载、启动拓扑和系统关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)  
> 最近复核：2026-08-09

本文描述系统职责与协作关系；精确 wire、transaction、error、failure-unwind、limit 与 conformance semantics由 `15-contracts`定义。

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
    │ Control Plane
    ▼
Subsystem Runtime Container
├── authoritative business state
├── 0..N Frame/Input Context
├── 0..N Render Domains
└── one Main Control carrier
    │
    ├── Control v2 + Frame v1
    │
    └──────────────┐
                   │ Host/Platform establishes Data carrier
                   ▼
             Web Renderer
```

另有独立 Readonly Content Service。

Subsystem Runtime不通过 `ready`发布 Renderer Data Endpoint。Main只发布逻辑 DataAuthority；具体 WebSocket/MessagePort由 Host/Platform Binding建立。

## 2. 核心对象

Subsystem identity=`descriptor.key`。每 Subsystem同时最多一个 active Runtime Container：Desktop Process / PWA Dedicated Worker。

Frame是 Main-owned call/ordinary-input Context：frameId Session unique/never reused，永久绑定 key，caller Main-owned immutable；lifecycle=`starting/active/suspended/closing/closed`；outcome=`completed/cancelled/failed`。

Activation one-shot、never reused/resumed/rolled back。

Render由 Subsystem拥有：一个 Runtime可拥有 `0..N Render Domains`，Domain有独立 lifecycle/zIndex/tree state，不从 Frame Stack推导 ownership/lifecycle。

## 3. Runtime Bootstrap / Shutdown

当前 Control主线：

```text
Subsystem Control v2
Runtime Control Application Profile v2
    = Control v2 + Frame / Call v1
```

启动：

```text
validate descriptors
→ Launch Attempt / bootstrapToken
→ spawn + Supervisor
→ Control carrier connect
→ subsystem.hello(protocolVersions includes 2)
→ identified
→ optional initializing
→ subsystem.status({state:"ready"})
```

```text
spawn success ≠ connected ≠ identified ≠ ready
ready ≠ Data Connection exists
```

`ready`不携 Data endpoint。

正常结束：Main shutdown intent→`subsystem.shutdown`→Supervisor confirms exit→stopped。无 shutdown intent的 exit/Control loss或 Runtime-reported failed进入 terminal failure。

Subsystem Control v1及 Runtime Control Profile v1均为 `Abandoned Before Implementation`，只保留历史路径。

## 4. Frame / Call v1

Frame / Call Protocol v1 已整体冻结：

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

Control version 2不改变 Frame version 1；当前 Runtime Control Profile v2静态绑定二者。

## 5. Normal Frame Transaction

Call：

```text
Caller active
→ Call Acceptance Commit
   Caller suspended / old Activation revoked
   Child starting+push / InputTarget=null
→ call Success
→ Child initialize/activate
→ activate ACK
→ publish Child InputTarget
```

Return：

```text
Return Acceptance Commit
   outcome terminal / old Activation revoked
   Child closing / InputTarget=null
→ return Success
→ close ACK/pop
→ Caller resume(fresh Activation) ACK
→ publish Caller InputTarget
```

ordinary call无 reverse suspend；call/return Response先于 dependent reverse RPC；activate/resume ACK先于 publication。

## 6. Error / Timeout Model

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Frame v1 no automatic retry/replay。Recoverable只有 call target not-found/unavailable 与 `FRAME_INITIALIZE_REJECTED`；Frame control divergence/protocol error Runtime-fatal。`cancelled`只表示 active Frame自行 return；无 caller remote cancel。

## 7. Runtime Failure Unwind

```text
failedRuntimeKeys
→ lowest live failed-runtime Frame = root
→ root..top whole suffix doomed
→ cleanup Top→Bottom
→ failed Runtime Frames logical retire without Frame RPC
→ healthy descendants best-effort frame.close
→ cleanup failure may expand failed set/root
→ repeat to fixed point
→ preserve accepted root outcome or failed(SUBSYSTEM_RUNTIME_FAILED)
→ fresh-resume direct healthy Caller or Stack empty
```

同一 Runtime在 Stack出现多次时取最低 occurrence。

## 8. Frame v1 Interop Boundary

Frame / Call v1冻结：

```text
one JSON-RPC application message per transport unit
no JSON-RPC Batch
Request ID = positive safe integer
sender-side Connection lifetime no Request ID reuse
max message = 1 MiB
max JSON depth = 64
max business JsonValue = 512 KiB
frameId/activationId <= 128 UTF-8 bytes
targetSubsystemKey <= 256 UTF-8 bytes
all seven method deadlines = 1s..5min sender-local monotonic profile
```

PWA Structured Clone不能扩大 Frame JSON type model。Desktop WebSocket与PWA MessagePort必须保持同一 application semantics和 conformance trace。

`subsystem.hello.protocolVersions`只协商 Subsystem Control v2；Frame version由 Runtime Control Profile v2静态绑定。

## 9. Failure Recovery Safety

Failure barrier建立后 affected InputTarget清空；Renderer不得恢复旧 Activation。

accepted terminal outcome不可被 Runtime crash覆盖。surviving Caller只获得 fresh Activation，resume ACK后才可发布。Resume失败会让 Caller Runtime也进入 failed set并重新计算 root。

failed Runtime Frame可无 `frame.close ACK` logical retire；healthy Runtime Frame仍 best-effort close。Recovery不新增 `frame.abort/frame.unwind/replay/resync`。

## 10. Runtime / Frame / Render / Connection 承载

```text
one Subsystem → one Runtime Container
one Runtime   → 0..N Frame/Input Context
              → 0..N Render Domains
              → one Main Control carrier

(Session, current Renderer, subsystemKey)
              → 0..1 current Data Connection
```

Frame transaction/unwind不隐式 create/destroy Runtime/Data Connection/Render Domain。

## 11. 通信平面

```text
Subsystem ⇄ Main Control
    Subsystem Control v2          Current
    Frame / Call v1               Frozen
    Runtime Control Profile v2    Current composition

Renderer ⇄ Main Control
    Renderer Control v1
    committed authority snapshots

Subsystem ⇄ Renderer Data
    Data Connection v1
    User Input v1
    Render Update v1
```

Renderer不是 Frame RPC participant。

DataAuthority只包含逻辑：

```text
subsystemKey
generation
connectionProfile
```

不包含 endpoint/ticket/MessagePort。

## 12. 状态所有权

```text
Main
    Runtime Registry / Supervisor / shutdown intent
    Frame identity / caller / lifecycle / outcome / Stack
    transaction / error classification / failure unwind
    Activation / InputTarget
    DataAuthority

Subsystem
    business state
    Runtime-reported lifecycle status
    Frame/Input Context + mutation gate
    Render Domain Registry / State

Renderer
    read-only committed Main control mirror
    current Data carriers
    User Input producer/gating state
    Render replica / presentation state
```

## 13. Data Connection Authority

Renderer Control发布：

```text
DataAuthority(S, generation=G, connectionProfile=P)
```

Host/Platform Binding负责建立carrier并绑定到：

```text
Session
current Renderer participant
S
G
```

Data Connection Core定义：

```text
current → retired
retired terminal
```

同 generation仍授权时允许在旧 carrier retired后重新建立 fresh carrier。

```text
Data loss != Runtime failure
Data loss != Frame unwind
Data retire != Render destroy
```

## 14. Render / User Input

User Input ordinary authority：

```text
Main InputTarget/Activation
∩ current Data Connection
∩ Subsystem Input Interest
∩ Producer availability
```

Render Update方向：

```text
Subsystem → Renderer only
```

当前增量设计使用 Domain Registry + Snapshot + atomic Patch + transient Event；Render revision与 Renderer Control revision独立。

## 15. Desktop / PWA

Desktop：

```text
Subsystem Control v2      localhost WebSocket Host binding
Frame / Call v1           same Control carrier
Renderer Control v1       localhost WebSocket
Renderer⇄Subsystem Data   Host-established carrier
Content                    localhost HTTP
```

PWA：

```text
Subsystem Control v2      authenticated MessagePort
Frame / Call v1           same application semantics
Renderer Control v1       authenticated Control Port
Renderer⇄Subsystem Data   Host-established MessagePort
Content                    same-origin Fetch / Service Worker
```

Transport/bootstrap机制可不同，但建立后的 application identity/lifecycle/ordering/recovery不能不同。

## 16. 核心不变量

1. Process/Worker isolation granularity=Subsystem；
2. 当前 Subsystem Control只有 v2；v1已实现前废弃；
3. Runtime Control Profile v2 = Control v2 + Frame v1；
4. Runtime `ready`不携/暗示 Data endpoint；
5. Frame=Main-owned call/input Context；
6. identity/Activation不复用；
7. Caller/Stack/transaction/recovery authority=Main；
8. Frame v1 exactly seven Requests；
9. Response-before-dependent-RPC；ACK-before-publication；
10. ambiguous/divergence/protocol error Runtime-fatal/no retry；
11. Runtime failure取 lowest occurrence并 unwind whole suffix；
12. accepted outcome不覆盖；surviving Caller fresh resume；
13. Renderer Control只发布逻辑 DataAuthority；
14. Host/Platform Binding负责 endpoint/ticket/Port；
15. Data loss不等于 Runtime failure/Frame unwind；
16. Render lifecycle完全由 Subsystem控制；
17. stopped只来自 actual Runtime termination observation。
