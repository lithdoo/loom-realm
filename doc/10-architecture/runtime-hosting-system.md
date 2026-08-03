# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem、Runtime Container、Frame/Input、Render、Process、Worker 与平台宿主之间的承载关系  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[栈式运行系统](./stack-runtime-system.md)  
> 正式契约：[Game Package v2](../15-contracts/game-package-v2.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-03

## 1. 设计目标

运行承载系统定义 LoomRealm 的逻辑 Subsystem 如何映射到 Desktop Process 和 PWA Worker，同时保持 Runtime、Frame/Input、Render、通信和 Content 边界清晰。

核心结论：

> 每个 Subsystem 对应一个可复用 Runtime Container；Frame 是 Main-owned call / ordinary User Input Context；Render 是 Subsystem-owned presentation Context。Frame 与 Render 都不是独立 Process / Worker / physical connection，且二者没有平台级 ownership 绑定。

## 2. 核心术语

```text
Subsystem Descriptor
    Game Entry 声明
    identity = key

Runtime Container
    one Subsystem execution container
    Desktop = OS Process
    PWA = Dedicated Worker

Main Control Connection
    Runtime Container ⇄ Main long-lived control transport

System Data Connection
    Runtime Container ⇄ Renderer long-lived data transport

Frame
    Main-owned call / ordinary input Context

Activation
    one-shot ordinary input epoch for an active Frame

Render Context
    Subsystem-owned presentation Context
```

PID、Worker identity、Connection ID、Frame ID、Activation ID 和 Render identity 不能互相替代。

## 3. 承载粒度

```text
one descriptor.key
    → at most one active Runtime Container

one Runtime Container
    → 0..N Frame/Input Context
    → 0..N Render Context
    → one Main Control Connection
    → at most one Renderer System Data Connection
```

平台不规定：

```text
one Frame = one Process
one Frame = one business state
one Frame = one Render
Frame close = Render destroy
Frame close = Data Connection close
```

## 4. Runtime Bootstrap

Desktop：

```text
validate Descriptor / entry / env
→ resolve Launcher Target
→ Launch Attempt / Token
→ token registration
→ spawn + Supervisor
→ public state starting
→ Control connect
→ subsystem.hello
→ identified
→ ready
```

因此：

```text
spawn success ≠ connected ≠ identified ≠ ready
```

Runtime identity / lifecycle 由 Subsystem Control Protocol v1 定义；PID、Process Handle、launchId 只是 Host-private supervision state。

## 5. Runtime Container Shared State

Container MAY 共享：

- Subsystem code / schemas；
- System Data Connection；
- Content Client；
- Repository cache；
- immutable parsed content；
- WASM / texture metadata cache；
- Subsystem-defined shared business state；
- Render Manager / Registry。

平台只要求多个 Frame 的公共 identity / input authority 不混淆，不要求 business state、Runtime Core、Tick 或 Projector 按 Frame 拆分。

## 6. Frame 承载边界

Frame / Call v1 Batch A 已冻结：

```text
frameId
    Main-generated / Session unique / never reused

Frame → Subsystem
    permanent descriptor.key assignment

callerFrameId
    immutable

lifecycle
    starting / active / suspended / closing / closed

outcome
    completed / cancelled / failed
    separate from lifecycle

Activation
    only active Frame has current Activation
    Main-generated / Session unique / never reused
    revoked Activation never becomes valid again
```

因此 Container 内每个 Frame/Input Context 至少要能够对应：

```text
frameId
caller relation
lifecycle
current activation (active only)
ordinary input eligibility
```

Frame v1 没有独立 `ready / initialized / frame.status`。

以下不是平台要求的 Frame-owned state：

```text
world state
Runtime Core
Execution Loop
Render Context
Render Revision / Scope
Renderer Store
System Data Connection
```

## 7. Stack Stable State

Main-owned 单一 LIFO Stack 在稳定状态满足：

```text
Stack Top
    active + current Activation

all other live Frames
    suspended + no current Activation
```

事务切换中 MAY 短暂没有 active Frame，但不得存在两个 ordinary Input Target。

Frame 只允许在目标 Runtime：

```text
observed state == ready
AND shutdownIntent == null
```

时建立。

## 8. Render 承载边界

Render Context 由 Runtime Container 创建、更新、销毁。

Container 可以：

- zero Frame 时拥有 Render；
- Frame suspended 时继续更新 Render；
- Frame closed 后保留 Render；
- 同时维护多个 Render；
- 内部显式关联 Frame 与 Render。

Main 不维护 Render Registry。Renderer 也不能从 Stack 推导 Render 集合。

## 9. Main 位置

Main 拥有：

```text
Session
Subsystem Descriptor Registry
Launch Attempt / Runtime Registry
Runtime Supervisor / shutdown intent
Frame Registry / Stack
Frame lifecycle / outcome bookkeeping
Activation / Input Target
Control Connection Authority
System Data Connection Authority
```

Main 不拥有 Subsystem business state 或 Render Registry，也不转发普通 User Input / Render Update payload。

## 10. Desktop Profile

```text
LoomRealm Main Process
FSDB Content Service Process
Hostra Electron Main Process
Hostra Renderer Process
per-Subsystem Process
```

Desktop Control / Data 使用 localhost WebSocket；Content 使用 localhost HTTP。

Desktop `nodejs` executable Subsystem code 是 trusted code；safe `launcher.entry` 不等于 OS sandbox。

## 11. PWA Profile

```text
Window
Main Runtime Dedicated Worker
per-Subsystem Dedicated Worker
Service Worker
OPFS / Cache Storage
```

PWA Descriptor→Worker Script、Bootstrap Credential、Control Transport Profile 尚未冻结，但必须保持已 Frozen 的 Subsystem Control v1 与 Frame Batch A 语义，除非显式升级协议版本。

## 12. Runtime Lifecycle

Main-observed Runtime state：

```text
declared
→ starting
→ connected
→ identified
→ ready
→ stopping
→ stopped

non-terminal phase
→ failed
```

正常 shutdown：

```text
Main shutdown intent
→ subsystem.shutdown
→ optional stopping status
→ actual termination observation
→ stopped
```

没有 shutdown intent 的 Runtime exit / Control loss 是 failure，即使 exit code = 0。

Subsystem Control v1 无 same-attempt reconnect / resume / automatic restart / application heartbeat。

## 13. System Data Connection Lifecycle

System Data Connection 可以同时服务：

```text
0..N Frame Input Context
0..N Render Context
```

因此：

- Frame create/close 不创建/关闭 Data Connection；
- Render create/destroy 不创建/关闭 Data Connection；
- zero Frame 时 Connection 可继续存在；
- Runtime termination 使 Connection 失效。

## 14. Container Failure

Runtime terminal failure：

```text
Main marks Runtime failed
→ revoke Data Connection authority
→ revoke affected current Activation
→ stop affected ordinary input
→ Frame / Call Batch E performs deterministic unwind
→ Render cleanup/recovery remains Render Protocol concern
```

重要：Runtime failure 不意味着把 Frame lifecycle 改成 `failed`。Frame failure 是 outcome，Context cleanup 仍通过 `closing → closed`。

## 15. 核心不变量

1. Process / Worker isolation granularity = Subsystem；
2. one Subsystem → one active Runtime Container；
3. one Runtime → 0..N Frame + 0..N Render；
4. Frame 是 Main-owned call/input Context；
5. Frame lifecycle = `starting / active / suspended / closing / closed`；
6. Frame outcome 与 lifecycle 分离；
7. Frame v1 无 ready/status；
8. Activation only belongs to active Frame and never reuses；
9. stable Stack Top active / lower Frames suspended；
10. Render lifecycle 完全属于 Subsystem；
11. Frame/Data Connection/Render lifecycle 相互无隐式联动；
12. `spawn success ≠ connected ≠ identified ≠ ready`；
13. `stopped` 只来自 actual Runtime termination observation；
14. PWA Transport 差异不得改变 Frozen protocol semantics。
