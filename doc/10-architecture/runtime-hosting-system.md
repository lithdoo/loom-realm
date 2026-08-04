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

## 2. 核心术语与粒度

```text
Subsystem Descriptor
    identity = key

Runtime Container
    Desktop = OS Process
    PWA = Dedicated Worker

Main Control Connection
    one long-lived control transport per Runtime

System Data Connection
    at most one Renderer data transport per Runtime

Frame
    Main-owned call / ordinary input Context

Activation
    one-shot ordinary input epoch for active Frame

Render Context
    Subsystem-owned presentation Context
```

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
→ optional initializing
→ ready
```

因此：

```text
spawn success ≠ connected ≠ identified ≠ ready
```

正常 shutdown：

```text
Main shutdown intent
→ subsystem.shutdown
→ optional status(stopping)
→ Supervisor confirms actual termination
→ stopped
```

无 shutdown intent 的 Runtime exit / Control loss 是 failure，即使 exit code = 0。Subsystem Control v1 无 application heartbeat、same-attempt reconnect / resume、automatic restart。

## 4. Container Shared State

Runtime Container MAY 共享 Subsystem code/schema、Data Connection、Content Client、Repository cache、immutable content、WASM/texture metadata、Subsystem-defined business state、Render Manager/Registry。

平台只要求不同 Frame 的公共 identity / input authority 不混淆，不要求 business state、Runtime Core、Tick 或 Projector 按 Frame 拆分。

## 5. Frame Batch A 承载边界

Batch A 已冻结：

```text
frameId
    Main-generated / Session unique / never reused

Frame → Subsystem
    permanent descriptor.key assignment

callerFrameId
    Main-owned / immutable relationship

lifecycle
    starting / active / suspended / closing / closed

outcome
    completed / cancelled / failed
    separate from lifecycle

Activation
    only active Frame owns current Activation
    Main-generated / Session unique / never reused
    revoked Activation never becomes valid again
```

Container 内 Subsystem Frame/Input Context **不要求保存公共 caller relationship 副本**。Caller/Stack authority 留在 Main；业务若需要调用来源，应通过业务 `input` 显式传递。

Subsystem Context 至少需要能够按 `frameId` 执行 lifecycle control，并在 active 时维护当前 Activation 以校验 ordinary input。

Frame v1 没有独立 `ready / initialized / frame.status`。

## 6. Frame Batch B Control Surface

Frame / Call Batch B 已冻结七个 JSON-RPC Request，并运行于已经认证的 Main Control Connection：

```text
Main → Subsystem
    frame.initialize({ frameId, input })
    frame.activate({ frameId, activationId })
    frame.suspend({ frameId, activationId })
    frame.resume({ frameId, activationId, returnedFrameId, result })
    frame.close({ frameId })

Subsystem → Main
    frame.call({ frameId, activationId, targetSubsystemKey, input })
        → { childFrameId }
    frame.return({ frameId, activationId, result })
        → {}
```

承载层不得：

- 重复携带 source `systemId / subsystemKey`；source identity 来自 Control Connection；
- 把 `callerFrameId` 加到 initialize/return wire；
- 给 `frame.close` 增加 reason；
- 增加 `frame.result`；
- 使用 `system.call / system.return`；
- 把 `frame.resume` 拆成 resume + activate；
- 让 `frame.call` 长时间等待 Child 最终业务结果。

Child outcome 固定沿 `frame.return → Main → frame.resume` 交付。

## 7. Stack / Activation Stable State

Main-owned 单一 LIFO Stack 稳定状态：

```text
Stack Top
    active + current Activation

all lower live Frames
    suspended + no current Activation
```

事务切换中 MAY 短暂无 active Frame，但不得同时存在两个 ordinary Input Target。

Frame 只在目标 Runtime：

```text
observed state == ready
AND shutdownIntent == null
```

时建立。

Batch C 将冻结这些 Batch B RPC 之间的精确事务顺序、Input Target publish barrier 与 rollback。

## 8. Render 承载边界

Render Context 由 Runtime Container 创建、更新和销毁。

Container 可以 zero Frame 时拥有 Render、Frame suspended 时继续更新 Render、Frame closed 后保留 Render、同时维护多个 Render，也可以内部显式关联 Frame 与 Render。

Main 不维护 Render Registry；Renderer 不从 Stack 推导 Render 集合。

## 9. Main Ownership

Main 拥有：

```text
Session
Subsystem Descriptor / Runtime Registry
Launch Attempt / Runtime Supervisor
Runtime shutdown intent
Frame Registry / Stack
caller relationship / lifecycle / outcome
Activation / Input Target
Control Connection Authority
System Data Connection Authority
```

Main 不拥有 Subsystem business state / Render Registry，也不转发 ordinary User Input / Render Update payload。

## 10. Desktop / PWA Profile

Desktop：Main Process、FSDB Content Service、Hostra、per-Subsystem Process；Control/Data = localhost WebSocket，Content = HTTP。

PWA：Window、Main Dedicated Worker、per-Subsystem Dedicated Worker、Service Worker、OPFS/Cache；Control/Data = MessagePort。

PWA Descriptor→Worker Script、Bootstrap Credential、Control Transport 尚未冻结，但未来 Profile MUST 保持 Subsystem Control v1 与 Frame Batch A/B **应用层方法与字段语义**，不得因 Transport 改名或扩字段。

Desktop `nodejs` executable code 当前属于 trusted code；safe launcher entry 不等于 OS sandbox。

## 11. System Data Connection Lifecycle

System Data Connection 可以同时服务：

```text
0..N Frame Input Context
0..N Render Context
```

因此 Frame create/close 不创建/关闭 Data Connection，Render create/destroy 也不创建/关闭 Data Connection；zero Frame 时 Connection 可继续存在；Runtime termination 才使对应 Connection authority 失效。

## 12. Container Failure

Runtime terminal failure：

```text
Main marks Runtime failed
→ revoke Data Connection authority
→ revoke affected current Activation
→ stop affected ordinary input
→ Frame / Call Batch E performs deterministic unwind
→ Render cleanup/recovery remains Render Protocol concern
```

Runtime failure 不意味着 Frame lifecycle = `failed`。`failed` 是 outcome；Frame Context cleanup 仍通过 `closing → closed`。

## 13. 核心不变量

1. Process / Worker isolation granularity = Subsystem；
2. one Subsystem → at most one active Runtime Container；
3. one Runtime → 0..N Frame + 0..N Render；
4. Frame 是 Main-owned call/input Context；
5. Caller relationship Main-owned，不要求 Subsystem 保存公共副本；
6. Frame lifecycle = `starting / active / suspended / closing / closed`；
7. Frame outcome 与 lifecycle 分离；
8. only active Frame owns current Activation；revoked Activation never reuses；
9. Batch B exactly seven JSON-RPC Request methods；
10. `frame.call` 非 long-running result RPC；`frame.resume` 同时 outcome + replacement Activation；
11. Render lifecycle 完全属于 Subsystem；
12. Frame/Data Connection/Render lifecycle 无隐式联动；
13. `spawn success ≠ connected ≠ identified ≠ ready`；
14. `stopped` 只来自 actual Runtime termination observation；
15. Desktop/PWA Transport 差异不得改变 Frozen application semantics。
