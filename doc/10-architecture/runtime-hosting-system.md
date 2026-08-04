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

> 每个 Subsystem 对应一个可复用 Runtime Container；Frame 是 Main-owned call / ordinary User Input Context；Render 是 Subsystem-owned presentation Context。Frame 与 Render 都不是独立 Process / Worker / physical connection。

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

`spawn success ≠ connected ≠ identified ≠ ready`。

normal shutdown = Main shutdown intent → `subsystem.shutdown` → optional stopping → Supervisor confirms actual termination → stopped。

无 shutdown intent 的 Runtime exit / Control loss 是 failure，即使 exit code = 0。Subsystem Control v1 无 application heartbeat、same-attempt reconnect/resume、automatic restart。

## 4. Container Shared State

Runtime Container MAY 共享 Subsystem code/schema、Data Connection、Content Client、Repository cache、immutable content、Subsystem-defined business state、Render Manager/Registry。

平台只要求不同 Frame 的公共 identity / input authority 不混淆，不要求 business state、Runtime Core、Tick 或 Projector 按 Frame 拆分。

## 5. Frame A/B/C/D 承载边界

Frame / Call Batch A/B/C/D 已 Frozen。

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

Frozen control surface exactly seven JSON-RPC Requests：

```text
Main → Subsystem
    frame.initialize / activate / suspend / resume / close
Subsystem → Main
    frame.call / return
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

因此 Desktop/PWA Transport adapter MUST NOT 要求入站 Request pending 时处理并等待反向 Frame Request。

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

Batch C 的“Pre-commit 可 abort / Post-commit 只能 forward recovery”描述的是不可逆性边界，不代表所有 failure 都能在当前 Runtime 上继续做局部 compensation。Batch D 进一步决定：只有 recoverable Error 保持 Runtime healthy；timeout/loss/divergence/protocol error 直接使 Runtime 不可信，后续 recovery ownership 转交 Batch E。

## 8. Error / Timeout Hosting Requirements

所有 Frame Request MUST 有 finite deadline；实际毫秒数由 Host/Profile policy 选择。

承载层必须保留三分法：

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

`Explicit Error=known no-commit` 只是远端 operation 的 commit evidence，不自动意味着 Runtime healthy；还必须经过 Batch D 的 recoverable/fatal classification。

Transport 自身的 packet retry / WebSocket/TCP reliable delivery 不等于 application-level Frame RPC replay。v1 不允许 Host adapter 在 timeout 后重新发送同一 Frame operation，也不要求 operationId/dedup journal。

Main→Subsystem Frame RPC ambiguous 时，Main 停止向该 Runtime 发新的正常 Frame Control 并进入 Runtime failure path。

Subsystem→Main `frame.call / frame.return` ambiguous 时，Subsystem 保持 mutation gate、停止正常 Frame processing，不得继续旧 Activation，并进入 Runtime failure path。

迟到 Response 不恢复已失败 Runtime。

## 9. Error Classification 与 Runtime Failure

Recoverable business/control rejection 仅包括：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

`FRAME_INITIALIZE_REJECTED` 表示 target Runtime healthy 且 target Frame Context 未 commit；如果 Child 已 acceptance-commit，Main 可在 healthy Runtime 模型下把它收敛为 Child failed outcome + fresh Caller Activation。

Runtime-fatal 情况包括：

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
Frozen JSON-RPC method/schema/protocol error
Frame RPC timeout / Response ambiguity
```

这些分支 MUST NOT 被 Host/Main adapter实现成：

```text
retry same Frame RPC
reinitialize same frameId
activate old Activation
best-effort local close then continue normal Stack flow
Renderer/Data reconnect then resume Frame authority
```

承载层应保留 Runtime diagnostic category：

```text
FRAME_CONTROL_TIMEOUT
FRAME_CONTROL_DIVERGENCE
FRAME_CONTROL_PROTOCOL_ERROR
```

具体 Runtime failure 后如何 unwind Frame Stack 由 Batch E 冻结。

## 10. `frame.suspend` / Cancellation Boundary

`frame.suspend` 保留为 Main 主动 quiesce / terminal preparation 原语，不是 ordinary call establishment step。ACK 后才允许 commit active→suspended / old Activation revoke / InputTarget clear。

如果 suspend Error 被分类为 divergence/protocol-fatal，或产生 ambiguous timeout，不能把 no-commit evidence 当作“可以继续旧 active Frame”的充分条件；Runtime failure classification优先。

v1 无 caller-driven `frame.cancel`。`FrameOutcome.cancelled` 是 active Frame 自行 return 的 outcome；Session termination 走更高层 shutdown。

## 11. Render 承载边界

Render Context 完全由 Runtime Container 创建、更新、销毁。Container 可以 zero Frame 时拥有 Render、Frame suspended 时继续更新 Render、Frame closed 后保留 Render。

Main 不维护 Render Registry；Renderer 不从 Stack 推导 Render 集合。

## 12. Main Ownership

Main 拥有：Runtime Registry/Supervisor/shutdown intent、Frame Registry/Stack/caller/lifecycle/outcome、Frame transaction commit/error classification、Activation/InputTarget、Connection authority。

Main 不拥有 Subsystem business state / Render Registry，也不转发 ordinary User Input / Render Update payload。

## 13. Desktop / PWA Profile

Desktop：Main Process + per-Subsystem Process；Control/Data = localhost WebSocket。

PWA：Main Dedicated Worker + per-Subsystem Dedicated Worker；Control/Data = MessagePort。

PWA Descriptor→Worker Script、Bootstrap Credential、Control Transport 尚未冻结，但 future Profile MUST 保持 Subsystem Control v1 与 Frame Batch A/B/C/D 应用语义，包括 Response-before-dependent-RPC、ACK-before-publish、post-commit no rollback、finite deadline、ambiguous-no-retry 与 Runtime-fatal no-local-resync。

## 14. System Data Connection Lifecycle

Data Connection 可以同时服务 0..N Frame Input Context + 0..N Render Context。Frame create/close 或 Render create/destroy 不隐式创建/关闭 Data Connection；Runtime termination 才使对应 Connection authority 失效。

## 15. Container Failure

Runtime terminal failure：

```text
Main marks Runtime failed
→ revoke Data Connection authority
→ stop/revoke affected ordinary input authority
→ stop normal Frame Control for that Runtime
→ Batch E deterministic Frame unwind
→ Render recovery remains Render Protocol concern
```

Runtime failure 不意味着 Frame lifecycle=`failed`；failed 是 outcome，cleanup 仍需收敛到合法 Frame lifecycle。具体受影响 Frame 如何进入 `closing/closed` 由 Batch E 冻结，不在承载层提前规定 suffix 范围或 cleanup RPC 顺序。

## 16. 核心不变量

1. Process/Worker isolation granularity = Subsystem；
2. one Subsystem → at most one active Runtime Container；
3. one Runtime → 0..N Frame + 0..N Render；
4. Caller/Stack/transaction authority = Main；
5. Frame lifecycle/outcome 分离；
6. Batch B exactly seven Requests；
7. ordinary call 不依赖 reverse `frame.suspend`；
8. call/return Response precedes dependent reverse RPC；
9. activate/resume ACK precedes InputTarget publication；
10. post-commit failure不恢复 revoked/accepted state，但 recovery owner 由 Batch D classification 决定；
11. Explicit Error=no-commit evidence，不自动等于 recoverable；
12. Frame RPC timeout/loss 不 retry，ambiguous→Runtime failure；
13. control divergence/protocol mismatch Runtime-fatal；
14. Runtime-fatal 分支不做 Frame-specific local resync/repair；
15. no caller-driven Frame cancellation；
16. Render lifecycle 完全属于 Subsystem；
17. Desktop/PWA Transport 差异不得改变 Frozen application semantics。
