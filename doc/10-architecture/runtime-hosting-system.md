# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem、Runtime Container、Frame/Input、Render、Process、Worker 与平台宿主之间的承载关系  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[栈式运行系统](./stack-runtime-system.md)  
> 正式契约：[Game Package v2](../15-contracts/game-package-v2.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. 设计目标

运行承载系统定义 Subsystem 如何映射到 Desktop Process / PWA Worker，同时保持 Runtime、Frame/Input、Render、Control/Data Transport 与 Content 边界清晰。

> 每个 Subsystem 对应一个可复用 Runtime Container；Frame 是 Main-owned call / ordinary User Input Context；Render 是 Subsystem-owned presentation Context。Frame 与 Render 都不是独立 Process / Worker / physical connection，也没有平台级 ownership 绑定。

## 2. 粒度

```text
one descriptor.key
    → at most one active Runtime Container

one Runtime Container
    → 0..N Frame/Input Context
    → 0..N Render Context
    → one Main Control Connection
    → at most one Renderer System Data Connection
```

PID、Worker identity、Connection ID、Frame ID、Activation ID、Render identity 不能互相替代。

## 3. Runtime Bootstrap / Lifecycle

```text
validate Descriptor / entry / env
→ resolve Launcher Target
→ Launch Attempt / Token registration
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

normal shutdown = Main shutdown intent → `subsystem.shutdown` → optional stopping → Supervisor confirms actual termination → stopped。

无 shutdown intent 的 Runtime exit / Control loss 是 failure，即使 exit code = 0。Subsystem Control v1 无 application heartbeat、same-attempt reconnect/resume、automatic restart。

## 4. Container Shared State

Runtime Container MAY 共享 Subsystem code/schema、Data Connection、Content Client、Repository cache、immutable content、Subsystem-defined business state、Render Manager/Registry。

平台只要求不同 Frame 的公共 identity / input authority 不混淆，不要求 business state、Runtime Core、Tick 或 Projector 按 Frame 拆分。

## 5. Frame A/B/C 承载边界

Frame / Call Batch A/B/C 已 Frozen。

```text
frameId
    Main-generated / Session unique / never reused

Frame → Subsystem
    permanent descriptor.key assignment

callerFrameId
    Main-owned / immutable

lifecycle
    starting / active / suspended / closing / closed

outcome
    completed / cancelled / failed

Activation
    active only / one-shot / never reused / never rolls back
```

Subsystem Frame/Input Context 不要求保存公共 caller relationship 副本。Caller/Stack authority 留在 Main。

Frozen control surface：

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

## 6. Transaction Hosting Requirements

ordinary `frame.call` transaction 不使用 reverse `frame.suspend` 建立 Caller suspension。

承载层必须支持：

```text
frame.call Request
→ Main acceptance commit
→ frame.call Response
→ dependent child initialize / activate
```

以及：

```text
frame.return Request
→ Main acceptance commit
→ frame.return Response
→ dependent close / resume
```

因此 Desktop/PWA Transport adapter MUST NOT 要求“入站 Request handler pending 时同时处理并等待反向 Frame Request”才能保证正确性。

same-Subsystem recursive call 可以复用同一个 Runtime Container / Control Connection，但仍必须建立新的 childFrameId / Activation，并按 Main-owned Stack transaction push/pop。

## 7. Activation / InputTarget Barrier

承载差异不得改变：

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller replacement InputTarget publication
```

事务 gap 中 `InputTarget=null` 合法。old Activation commit revoked 后永久不能重新合法。

Pre-commit failure 可 abort；Post-commit failure只能 forward recovery，不得恢复旧 Activation或撤销 accepted terminal outcome。

## 8. `frame.suspend` Role

`frame.suspend` 保留为 Main 主动 quiesce / terminal preparation 原语，不是 ordinary call establishment step。

ACK 后才允许 commit active→suspended / old Activation revoke / InputTarget clear。后续若重新 active 必须使用 fresh Activation。

## 9. Render 承载边界

Render Context 完全由 Runtime Container 创建、更新、销毁。Container 可以 zero Frame 时拥有 Render、Frame suspended 时继续更新 Render、Frame closed 后保留 Render。

Main 不维护 Render Registry；Renderer 不从 Stack 推导 Render 集合。

## 10. Main Ownership

Main 拥有：Runtime Registry/Supervisor/shutdown intent、Frame Registry/Stack/caller/lifecycle/outcome、Frame transaction commit、Activation/InputTarget、Connection authority。

Main 不拥有 Subsystem business state / Render Registry，也不转发 ordinary User Input / Render Update payload。

## 11. Desktop / PWA Profile

Desktop：Main Process + per-Subsystem Process；Control/Data = localhost WebSocket。

PWA：Main Dedicated Worker + per-Subsystem Dedicated Worker；Control/Data = MessagePort。

PWA Descriptor→Worker Script、Bootstrap Credential、Control Transport 尚未冻结，但 future Profile MUST 保持 Subsystem Control v1 与 Frame Batch A/B/C 应用语义，包括 Response-before-dependent-RPC、ACK-before-publish 和 post-commit no rollback。

Desktop `nodejs` executable code 当前属于 trusted code；safe launcher entry 不等于 OS sandbox。

## 12. System Data Connection Lifecycle

Data Connection 可以同时服务 0..N Frame Input Context + 0..N Render Context。Frame create/close 或 Render create/destroy 不隐式创建/关闭 Data Connection；Runtime termination 才使对应 Connection authority 失效。

## 13. Container Failure

Runtime terminal failure：

```text
Main marks Runtime failed
→ revoke Data Connection authority
→ revoke affected current Activation
→ stop ordinary input
→ Batch E deterministic Frame unwind
→ Render recovery remains Render Protocol concern
```

Runtime failure 不意味着 Frame lifecycle=`failed`；failed 是 outcome，cleanup 仍通过 `closing→closed`。

## 14. 核心不变量

1. Process/Worker isolation granularity = Subsystem；
2. one Subsystem → at most one active Runtime Container；
3. one Runtime → 0..N Frame + 0..N Render；
4. Caller/Stack/transaction authority = Main；
5. Frame lifecycle/outcome 分离；
6. Batch B exactly seven Requests；
7. ordinary call 不依赖 reverse `frame.suspend`；
8. call/return Response precedes dependent reverse RPC；
9. activate/resume ACK precedes InputTarget publication；
10. post-commit failure只 forward recover；
11. Render lifecycle 完全属于 Subsystem；
12. Desktop/PWA Transport 差异不得改变 Frozen application semantics。
