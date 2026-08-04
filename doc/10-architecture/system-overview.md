# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层系统划分、状态所有权、运行承载、启动拓扑和系统关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)  
> 最近复核：2026-08-04

本文描述系统划分与协作关系；精确 wire field 与 transaction semantics 由 `15-contracts` 定义。

## 1. 顶层结构

```text
Game Package
├── Manifest / Entry
├── Subsystem Descriptors
├── Launcher Entries
└── Content / Resources
        │
        ├──────────────▶ LoomRealm Main
        │                  ├── Runtime Registry / Supervisor
        │                  ├── Frame Registry / Stack / Activation
        │                  ├── Frame Transaction Coordinator
        │                  ├── Input Target
        │                  └── Connection Authority
        │                           │
        │                           │ Control Plane
        │                           ▼
        │                  Subsystem Runtime Container
        │                  ├── authoritative business state
        │                  ├── 0..N Frame/Input Context
        │                  ├── 0..N Render Context
        │                  └── Renderer Data Endpoint
        │                           │
        │                           ▼
        │                       Web Renderer
        │                       ├── Connection Registry
        │                       ├── Frame Input Registry
        │                       ├── Render Store / Scheduler
        │                       └── DOM / Canvas / WebGL
        │
        └──────────────▶ Readonly Content Service
```

## 2. 核心对象

Subsystem Descriptor identity = stable `key`。每 Subsystem 同时最多一个有效 Runtime Container：Desktop Process / PWA Dedicated Worker。

Frame 是 Main-owned call / ordinary User Input Context：`frameId` Session unique/never reused，永久绑定 descriptor.key，caller Main-owned immutable；lifecycle=`starting/active/suspended/closing/closed`；outcome=`completed/cancelled/failed`；只有 active Frame 有 current Activation。

Activation one-shot、never reused/resumed/rolled back。v1 无 Frame ready/status。

Render 是 Subsystem-owned presentation Context，公共架构不定义 Frame→Render ownership。

## 3. Runtime Bootstrap / Shutdown

```text
validate descriptors
→ resolve launcher targets
→ Launch Attempt / token registration
→ spawn + Supervisor
→ Control connect
→ subsystem.hello
→ identified
→ optional initializing
→ ready
```

```text
spawn success ≠ connected ≠ identified ≠ ready
```

正常结束：

```text
Main shutdown intent
→ subsystem.shutdown
→ optional stopping
→ Supervisor confirms Runtime exit
→ stopped
```

## 4. Frame / Call 当前状态

```text
Batch A  Identity / Authority / Lifecycle / Activation       Frozen
Batch B  RPC Wire Schema / Direction / Local Semantics        Frozen
Batch C  Transaction / Commit Barrier / Rollback              Frozen
Batch D-F                                                     Draft
```

Frozen wire exactly seven Requests：

```text
Main → Subsystem
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close

Subsystem → Main
    frame.call
    frame.return
```

## 5. Frame Transaction Model

ordinary call：

```text
Caller active/current Activation
→ frame.call Request
→ Main Call Acceptance Commit:
     Caller suspended
     old Activation revoked
     Child starting / pushed
     InputTarget=null
→ frame.call Success
→ Child initialize / activate
→ activate ACK
→ Child active + InputTarget publication
```

ordinary call 不额外发送 reverse `frame.suspend`。Main 必须完成 call Response 后才依赖 Child RPC，因此 same-Subsystem recursion 不要求 nested bidirectional Request handler reentrancy。

return：

```text
frame.return Request
→ Main Return Acceptance Commit:
     outcome terminal
     Child old Activation revoked
     Child closing
     InputTarget=null
→ frame.return Success
→ close ACK / closed / pop
→ Caller resume(new Activation) ACK
→ Caller active + InputTarget publication
```

冻结：

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller InputTarget publication
```

Pre-commit failure 可 abort；Post-commit failure只能 forward recovery。revoked Activation 和 accepted terminal outcome 不可 rollback。

## 6. Stack / Input Target

稳定状态：Stack Top active + current Activation；所有 lower live Frames suspended + no Activation。

事务期间允许 Top starting/closing、zero active Frame、`InputTarget=null`。Main 不得发布两个 ordinary InputTargets，也不得发布尚未被目标 Subsystem ACK 的 Activation。

## 7. Runtime / Frame / Render 承载

```text
one Subsystem → one Runtime Container
one Runtime   → 0..N Frame/Input Context
              → 0..N Render Context
              → one Main Control Connection
              → at most one Renderer Data Connection
```

Frame create/suspend/resume/close 不隐式创建、销毁或重启 Runtime/Data Connection/Render。

## 8. 通信系统

```text
Control Plane
    Subsystem ⇄ Main
        Subsystem Control v1      Frozen
        Frame / Call A/B/C        Frozen
        Frame / Call D-F          Draft

    Renderer ⇄ Main
        Draft target, but must obey Batch C causal barriers

System Data Plane
    Subsystem ⇄ Renderer
        Connection Layer
        Render Update
        User Input

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

Renderer 不是 Frame RPC participant，只镜像 Main 已 commit 状态。User Input 使用 current Frame/Activation；Render Update 使用独立 Render identity。

## 9. 状态所有权

```text
Main
    Session / Runtime Registry / Supervisor
    Runtime shutdown intent
    Frame identity / caller / lifecycle / Stack
    Frame transaction commit
    Activation / InputTarget
    Connection Authority

Subsystem
    authoritative business state
    Frame/Input Context + outbound mutation gate
    Render Registry / Render State

Renderer
    read-only committed Main Control mirror
    Data Connection Registry
    Frame Input Registry
    Render Store / presentation state
```

## 10. Desktop / PWA Mapping

Desktop Control/Data 使用 localhost WebSocket；PWA Control/Data 使用 MessagePort。

PWA Profile 尚未冻结，但必须保持 Subsystem Control v1 与 Frame Batch A/B/C 应用层语义，包括 Response-before-dependent-RPC、activate/resume ACK publication barrier、post-commit no rollback；Transport 不得要求 nested reverse-request handler reentrancy。

## 11. 核心不变量

1. Process/Worker isolation granularity = Subsystem；
2. Frame = Main-owned call/input Context；
3. Frame/Activation identity 不复用；
4. Caller Main-owned，不进入 Subsystem wire；
5. lifecycle 与 outcome 分离；
6. Batch B exactly seven JSON-RPC Requests；
7. Batch C Stack mutation serial；
8. ordinary call 不依赖 reverse `frame.suspend`；
9. call/return Response precedes dependent reverse RPC；
10. activate/resume ACK precedes corresponding InputTarget publication；
11. post-commit failure只 forward recover；
12. Render lifecycle 完全由 Subsystem 控制；
13. `spawn success ≠ connected ≠ identified ≠ ready`；
14. `stopped` 只来自 actual Runtime termination observation；
15. Content API 与 Launcher 是不同 capability boundary。
