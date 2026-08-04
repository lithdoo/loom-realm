# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层系统划分、状态所有权、运行承载、启动拓扑和系统关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)  
> 最近复核：2026-08-04

本文描述系统职责与协作关系；精确 wire、transaction、error 与 failure-unwind semantics 由 `15-contracts` 定义。

## 1. 顶层结构

```text
Game Package
    ↓
LoomRealm Main
├── Runtime Registry / Supervisor
├── Frame Registry / Stack / Activation
├── Frame Transaction + Failure Unwind Coordinator
├── Frame Deadline / Error Classifier
├── InputTarget / Renderer Control Authority
└── Data Connection Authority
    │
    │ Control Plane
    ▼
Subsystem Runtime Container
├── authoritative business state
├── 0..N Frame/Input Context
├── 0..N Render Context
└── Renderer Data Endpoint
    │
    ▼
Web Renderer
```

另有独立 Readonly Content Service。

## 2. 核心对象

Subsystem identity=`descriptor.key`。每 Subsystem 同时最多一个 active Runtime Container：Desktop Process / PWA Dedicated Worker。

Frame 是 Main-owned call/ordinary-input Context：frameId Session unique/never reused，永久绑定 key，caller Main-owned immutable；lifecycle=`starting/active/suspended/closing/closed`；outcome=`completed/cancelled/failed`。

Activation one-shot、never reused/resumed/rolled back。Render 是 Subsystem-owned presentation Context，不从 Frame Stack推导 ownership/lifecycle。

## 3. Runtime Bootstrap / Shutdown

```text
validate descriptors
→ Launch Attempt / token
→ spawn + Supervisor
→ Control connect
→ subsystem.hello
→ identified
→ ready
```

`spawn success ≠ connected ≠ identified ≠ ready`。

正常结束属于 Subsystem Control：Main shutdown intent→shutdown→Supervisor confirms exit→stopped。无 shutdown intent的 exit/Control loss或 Runtime-reported failed进入 terminal failure。

## 4. Frame / Call 状态

```text
Batch A  Identity / Authority / Lifecycle / Activation       Frozen
Batch B  RPC Wire Schema / Direction / Local Semantics        Frozen
Batch C  Transaction / Commit Barrier / Rollback              Frozen
Batch D  Error / timeout / retry / cancellation               Frozen
Batch E  Runtime failure unwind                                Frozen
Batch F  Limits / fixtures / profile/version completion       Next
```

Wire exactly seven Requests：

```text
Main → Subsystem
    initialize / activate / suspend / resume / close
Subsystem → Main
    call / return
```

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

v1 no automatic retry/replay。Recoverable只有 call target not-found/unavailable 与 `FRAME_INITIALIZE_REJECTED`；Frame control divergence/protocol error Runtime-fatal。`cancelled`只表示 active Frame自行 return；无 caller remote cancel。

## 7. Runtime Failure Unwind

Batch E 将 Runtime failure统一成 Main-owned fixed-point Stack recovery：

```text
failedRuntimeKeys
→ lowest live failed-runtime Frame = root
→ root..top whole suffix doomed
→ cleanup Top→Bottom
→ failed Runtime Frames logical retire without Frame RPC
→ healthy descendants best-effort frame.close
→ cleanup failure may expand failed set/root
→ repeat to fixed point
→ preserve accepted root outcome
   or failed(SUBSYSTEM_RUNTIME_FAILED)
→ fresh-resume direct healthy Caller
   or Stack empty
```

同一个 Runtime在 Stack出现多次时取最低 occurrence，不能只删除当前/最近 Frame。

## 8. Failure Recovery Safety

Failure barrier建立后 affected InputTarget清空；Renderer不得恢复旧 Activation。

accepted terminal outcome不可被 Runtime crash覆盖。surviving Caller只获得 fresh Activation，resume ACK后才可发布。Resume失败会让 Caller Runtime也进入 failed set并重新计算 root。

failed Runtime Frame可以无 `frame.close ACK` logical retire；healthy Runtime Frame仍使用 best-effort close。Recovery不新增 `frame.abort/frame.unwind/replay/resync`。

## 9. Runtime / Frame / Render 承载

```text
one Subsystem → one Runtime Container
one Runtime   → 0..N Frame/Input Context
              → 0..N Render Context
              → one Main Control Connection
              → at most one Renderer Data Connection
```

Frame transaction/unwind不隐式 create/destroy Runtime/Data Connection/Render。

## 10. 通信平面

```text
Subsystem ⇄ Main Control
    Subsystem Control v1          Frozen
    Frame / Call A-E              Frozen

Renderer ⇄ Main Control
    Draft target; must obey Frame publication/recovery barriers

Subsystem ⇄ Renderer Data
    Connection / Render Update / User Input
```

Renderer不是 Frame RPC participant。User Input依赖 current Frame/Activation；Render Update使用独立 Render identity。

## 11. 状态所有权

```text
Main
    Runtime Registry / Supervisor / shutdown intent
    Frame identity / caller / lifecycle / outcome / Stack
    transaction / error classification / failure unwind
    Activation / InputTarget

Subsystem
    business state
    Frame/Input Context + mutation gate
    Render Registry / Render State

Renderer
    read-only committed Main control mirror
    Data/Input/Render presentation state
```

## 12. Desktop / PWA

Desktop Control/Data=localhost WebSocket；PWA=MessagePort。PWA Profile尚未最终冻结，但必须保持 Frame A-E应用语义，包括 normal ordering、ACK-before-publish、finite deadline/no retry、lowest-root whole-suffix unwind、fixed-point expansion与 outcome preservation。

## 13. 核心不变量

1. Process/Worker isolation granularity=Subsystem；
2. Frame=Main-owned call/input Context；
3. identity/Activation不复用；
4. Caller/Stack/transaction/recovery authority=Main；
5. exactly seven Requests；
6. ordinary call无 reverse suspend；
7. Response-before-dependent-RPC；ACK-before-publication；
8. ambiguous/divergence/protocol error Runtime-fatal/no retry；
9. Runtime failure取 lowest occurrence并 unwind whole suffix；
10. failed Runtime Frame logical retire，healthy descendant best-effort close；
11. cleanup failure fixed-point扩大 root；
12. accepted outcome不覆盖；surviving Caller fresh resume；
13. no caller cancel / no recovery abort-unwind wire；
14. Render lifecycle完全由 Subsystem控制；
15. stopped只来自 actual Runtime termination observation。
