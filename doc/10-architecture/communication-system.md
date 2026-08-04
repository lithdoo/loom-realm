# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：控制面、System 数据面、内容面、协议职责域、恢复和安全边界  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[运行承载系统](./runtime-hosting-system.md)  
> 最近复核：2026-08-04

## 1. 设计目标

Main、Subsystem、Renderer 在 Process/Worker 和不同 Transport 中保持一致应用语义，同时避免 Main 转发高频 User Input / Render Update。

核心原则：Runtime Control、Frame/Call、Renderer Control、System Data Connection、User Input、Render Update、Content 是不同协议域；共享 Transport 不代表共享 identity/lifecycle/error model。

## 2. 三类通信平面

```text
Control Plane
    Subsystem ⇄ Main
        Subsystem Control Protocol v1
        Frame / Call Protocol v1

    Renderer ⇄ Main
        Session / Runtime / Stack / Activation / Input Target / Grants

System Data Plane
    Subsystem ⇄ Renderer
        Connection Layer
        Render Update Protocol
        User Input Protocol

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

## 3. Main ⇄ Subsystem Control Plane

Desktop：Subsystem 主动连接 Main Control WebSocket。

### Subsystem Control v1

```text
connected
→ subsystem.hello
→ connection-bound descriptor.key
→ identified
→ optional initializing
→ ready
```

正常 shutdown：

```text
Main shutdown intent
→ subsystem.shutdown
→ optional status(stopping)
→ Supervisor confirms exit
→ stopped
```

`spawn success ≠ connected ≠ identified ≠ ready`；`shutdown Response / stopping ≠ stopped`。v1 无 app heartbeat/reconnect/resume/restart。

### Frame / Call v1

当前状态：

```text
Batch A  Identity / Authority / Lifecycle / Activation       Frozen
Batch B  RPC Wire Schema / Direction / Local Semantics        Frozen
Batch C-F                                                     Draft
```

Batch B exact methods：

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

全部是 JSON-RPC Request。

通信层必须保持：

- source Subsystem identity 来自认证 Control Connection；
- `callerFrameId` 不进入 Subsystem Frame wire；
- `frame.close` 无 reason；
- `frame.resume` 同时交付 Child Outcome + replacement Activation；
- `frame.call` 不作为等待最终 Child outcome 的 long-running RPC；
- no `system.call / system.return / frame.result`；
- closed schema；结构 invalid params → `-32602`。

## 4. Main ⇄ Renderer Control Plane

Renderer 与 Main 一条 session-level Control Connection，负责 Runtime State、Frame Stack/lifecycle mirror/current Activation/Input Target、Data Grant/revoke/replace、session errors/reconnect。

Renderer 不拥有 Frame authority。

必须遵守：

```text
stable state:
    Stack Top active + current Activation
    lower live Frames suspended

no two ordinary Input Targets
revoked Activation never republished as valid
```

Batch C 将冻结 `frame.activate / frame.resume` success 与 Renderer Input Target publish 的精确 causal barrier。

Renderer Control 不承载 ordinary User Input Payload 或 Render Update。

## 5. System Data Plane

每有效 Runtime Container 与 Renderer 最多一条长期双向 Data Connection，可同时承载 0..N Render Context + 0..N Frame Input Context。zero-Frame Subsystem 也可以维护 Render/Data Connection。

## 6. Renderer–Subsystem Protocol Domains

```text
Connection Layer
    auth / identity / version / liveness / replace / close

Render Update
    independent Render identity / state / event / recovery

User Input
    current Frame + Activation input routing
```

三个域共享 WebSocket/MessagePort，但 Sequence、backpressure、recovery、failure isolation 独立。

Connection heartbeat 只属于 Data Connection Layer，不是 Subsystem Control heartbeat。

## 7. User Input Identity

概念 Input Target：

```text
subsystem reference
frameId
activationId
```

普通输入合法至少要求：

```text
Frame exists
AND lifecycle == active
AND activationId == currentActivationId
AND Frame == Main-authorized Input Target
```

revoked/old Activation MUST reject。

Batch B 影响 User Input 的一点是：Caller result + replacement Activation 通过一个 `frame.resume` 安装；Batch C 再定义何时把该新 Activation 对 Renderer 公开。

## 8. Render Update Identity

Render Update 使用独立 Render identity，不使用 `frameId + activationId` 作为 Render lifecycle identity。

Activation replacement 不启动 Render epoch，也不要求 Render resync。

## 9. Frame / Render / Data Independence

以下都不是公共协议规则：

```text
Frame active      → Render visible
Frame suspended   → Render hidden
Frame closed      → Render destroyed
Frame create      → Data Connection create
Frame closed      → Data Connection close
```

因此 zero-Frame Subsystem 可继续 Render/Data，Render recovery 不修改 Frame Activation。

## 10. Content Plane

Readonly Content API 提供 manifest/record/group/resource，不承载 User Input、Render State、Runtime Tick、Frame Stack、Activation 或 Runtime Bootstrap 控制。

## 11. Transport Profiles

Desktop：Control/Data = localhost WebSocket，Content = HTTP。

PWA：Control/Data = MessagePort，Content = same-origin Fetch/Service Worker。

PWA Control Transport 尚未冻结，但 MUST 映射相同 Subsystem Control v1 与 Frame Batch A/B 应用层方法/字段，不得因 Transport 添加 caller/close reason/旧 system method 等变体。

## 12. Renderer Reconnect

```text
reconnect Main Control
→ restore Session / Runtime / Stack
→ restore current Activation / Input Target
→ rebuild authorized Data Connections
→ User Input only current Activation
→ Render independently restores
```

不得恢复 revoked Activation，不得从 Frame 集合推导全部 Render/Data lifecycle。

## 13. Backpressure / Retry Boundaries

```text
Subsystem Control v1
    no silent drop / state-changing app retry

Frame / Call
    Batch B fixes request surface
    Batch D freezes timeout/retry/idempotency

User Input
    continuous may coalesce / discrete bounded ordered

Render
    recoverable state may coalesce per Render/Scope

Content
    HTTP/Fetch streaming
```

Batch B Schema fixture 不得提前把某个 transaction ordering 或 retry 实现偶然行为变成协议。

## 14. Security Principles

- 所有 wire message 视为不可信；
- Control hello 绑定 Launch Attempt / key / credential；
- Frame operation 必须来自 frame 所属 connection-bound Subsystem；
- Subsystem 不能创建公共 frameId / activationId；
- Caller receiver 由 Main 决定；
- User Input 校验 active/current Activation；
- Data Connection 绑定合法 Grant；
- Render Update 限制 Subsystem Render namespace；
- Content API 只接受逻辑资源 identity。

## 15. 当前契约状态

已冻结：

- Game Package v2 Desktop subset；
- Desktop Node.js Launcher v1；
- Subsystem Control Protocol v1；
- Frame / Call Batch A；
- Frame / Call Batch B。

下一冻结目标：

```text
Frame / Call Batch C
    transaction / commit barrier / rollback
```

之后 Batch D error/timeout/retry、Batch E Runtime unwind、Batch F limits/fixtures/profile，然后 Main⇄Renderer Control、Data Connection、User Input、Render Update、Render State。

Legacy `frame-data-channel-v1.md` / `client-state-tree-v1.md` 不得继续作为 Frame/Render ownership 真相。
