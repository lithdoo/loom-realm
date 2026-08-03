# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：控制面、System 数据面、内容面、协议职责域、恢复和安全边界  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[运行承载系统](./runtime-hosting-system.md)  
> 最近复核：2026-08-03

## 1. 设计目标

通信系统使 Main、Subsystem 和 Renderer 在独立 Process / Worker 或不同 Transport 中保持一致语义，同时避免 Main 成为高频 User Input 和 Render Update 的转发瓶颈。

核心原则：

> Runtime Control、Frame/Call、System Data Connection、User Input、Render Update、Content 是职责不同的协议域；共享物理 Transport 不代表共享身份、状态机或生命周期。

Legacy 数据协议仍可能使用 `systemId`。新 Frame / Call v1 已冻结 Frame 永久绑定 `descriptor.key`；旧 `systemId` 的数据面 wire 迁移继续由对应 Connection/User Input/Render 协议显式处理。

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
        per-Subsystem physical connection
        ├── Connection Layer
        ├── Render Update Protocol
        └── User Input Protocol

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

## 3. Main ⇄ Subsystem Control Plane

Desktop 连接方向：

```text
Subsystem Process
    ── connect ──▶ Main Control WebSocket Server
```

### 3.1 Subsystem Control Protocol v1 — Frozen

```text
Transport connected
→ subsystem.hello
→ connection-bound descriptor.key
→ identified
→ optional initializing
→ ready

normal shutdown:
Main shutdown intent
→ subsystem.shutdown
→ optional status(stopping)
→ Supervisor confirms exit
→ stopped
```

核心边界：

```text
spawn success ≠ connected ≠ identified ≠ ready
shutdown Response ≠ stopped
status(stopping) ≠ stopped
```

v1 无 application heartbeat / same-attempt reconnect / resume / automatic restart。

### 3.2 Frame / Call Protocol v1

Frame / Call 复用已认证 Control Connection，但属于独立协议域。

当前状态：

```text
Batch A  Identity / Authority / Lifecycle / Activation    Frozen
Batch B-F                                                Draft
```

Batch A 冻结：

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
    Main-generated / Session unique / never reused
    only active Frame owns current Activation
    revoked Activation never valid again
```

Frame v1 没有 `ready / initialized / frame.status`。

Batch B-F 将继续冻结 7 个 RPC、Call/Return transaction、error/timeout、Runtime failure unwind 和完整 profile。

## 4. Main ⇄ Renderer Control Plane

Renderer 与 Main 之间有一条会话级长期 Control Connection，负责：

- Session 状态；
- Subsystem Runtime 状态；
- Frame Stack Snapshot / 增量；
- Frame lifecycle 的只读镜像；
- current Activation；
- Input Target；
- System Data Connection Grant / replace / revoke；
- 会话错误和诊断；
- Renderer reconnect。

Renderer 不拥有 Frame authority。

必须遵守 Frame Batch A：

```text
正常稳定状态最多一个 ordinary Input Target
只有 active Frame 有有效 current Activation
revoked Activation 不得重新发布为当前有效值
```

Frame Batch C 将冻结 `activate/resume ACK` 与 Renderer Input Target publish 的精确 causal commit barrier。

Main ⇄ Renderer Control 不承载普通 User Input Payload 或 Render Update。

## 5. System Data Plane

每个有效 Runtime Container 与 Renderer 之间最多一条长期双向 System Data Connection。

连接可以同时承载：

```text
0..N Render Context
0..N Frame Input Context
```

即使没有 Frame，Subsystem 也可以通过同一连接维护 Render。

Connection identity 的最终 wire Schema 尚待 Connection Protocol 冻结。

## 6. Renderer–Subsystem 三个协议域

```text
Renderer ⇄ Runtime Container

Connection Layer
    connection auth / identity / version / liveness / replace / close

Render Update Protocol
    independent Render identity / state / event / recovery

User Input Protocol
    current Frame + Activation ordinary input routing
```

三个域共享物理 WebSocket / MessagePort，但状态所有权、Sequence、backpressure 和恢复语义独立。

## 7. Connection Layer

Connection Layer 只管理 System Data Connection：

- 根据 Main Grant 建立连接；
- 确认 Session / Subsystem / Connection identity；
- 协商版本；
- heartbeat / failure detection；
- replace / close。

这里的 heartbeat 只属于 **System Data Connection Layer**，不得解释成 Subsystem Control heartbeat。

Connection Layer 不拥有：

```text
Frame lifecycle
Frame Stack
Activation authority
Input Target authority
Render Registry
business state
```

## 8. User Input Protocol Identity

User Input 必须继承 Frame Batch A 的资格模型。

概念 Input Target：

```text
subsystem reference
frameId
activationId
```

普通 User Input 合法至少要求：

```text
Frame exists
AND Frame lifecycle == active
AND provided activationId == currentActivationId
AND Frame == current Main-authorized Input Target
```

路由：

```text
Browser input
→ Renderer Input Router
→ Main-declared Input Target
→ target Subsystem Data Connection
→ User Input Protocol
→ frameId + activationId validation
→ Subsystem Input Handler
```

旧/revoked Activation MUST be rejected。

User Input Sequence、continuous intent、discrete ordering、UI Interaction、reset 由独立协议冻结。

## 9. Render Update Identity

Render Update 不使用 `frameId + activationId` 作为 Render identity。

```text
Subsystem Render Manager
→ independent Render identity
→ Render Update Protocol
→ Renderer Render Store
```

Activation replacement 不启动新的 Render epoch，也不要求 Render resync。

## 10. Frame / Render / Data Connection Independence

以下映射不进入公共协议：

```text
Frame active      → Render visible
Frame suspended   → Render hidden
Frame closed      → Render destroyed
Frame create      → Data Connection create
Frame closed      → Data Connection close
```

因此：

- suspended Frame 对应内容 MAY 继续显示；
- closed Frame 不自动删除 Render Store；
- zero-frame Subsystem MAY 保持 Render/Data Connection；
- Render recovery 不改变 Frame Activation。

## 11. Content Plane

Content Plane 提供逻辑只读 API：

```text
manifest
record(namespace, key)
group(namespace, key)
resource(namespace, key)
```

不承载 User Input、Render State、Runtime Tick、Frame Stack、Activation 或 Runtime Bootstrap 控制。

## 12. Transport Profile

Desktop：

```text
Subsystem ⇄ Main
    per-Subsystem localhost Control WebSocket

Renderer ⇄ Main
    per-Session localhost Control WebSocket

Renderer ⇄ Subsystem
    per-Subsystem localhost Data WebSocket

Content
    localhost HTTP
```

PWA：

```text
Subsystem Worker ⇄ Main Runtime Worker
    per-Subsystem Control MessagePort

Window ⇄ Main Runtime Worker
    session Control MessagePort

Window ⇄ Subsystem Worker
    per-Subsystem Data MessagePort

Content
    same-origin Fetch / Service Worker
```

PWA Control Transport Profile 尚未冻结，但不得改变 Subsystem Control v1 或 Frame Batch A 语义。

## 13. Renderer Reconnect

Renderer reload 后：

```text
reconnect Main Control
→ restore Session / Runtime / Stack
→ restore current Activation / Input Target
→ rebuild authorized Data Connections
→ User Input resumes only for current Activation
→ Render independently restores from Render Protocol
```

不得：

- 恢复 revoked Activation；
- 从 Frame 集合推导所有 Render；
- 把 Render Store 恢复等同于 Frame 恢复。

## 14. Backpressure Principles

```text
Subsystem Control v1
    no silent drop
    no application retry for state-changing request

Frame / Call
    Batch D freezes timeout/retry
    Batch A identity/lifecycle must remain deterministic

User Input
    continuous intent may coalesce
    discrete input bounded/ordered

Render State
    recoverable target state may coalesce per Render/Scope

Render Event
    bounded event semantics

Content
    separate HTTP / Fetch streaming
```

## 15. Security Principles

- 所有 wire message 视为不可信输入；
- hello 绑定 Launch Attempt / descriptor.key / Bootstrap Credential；
- Frame operation 必须与 connection-bound Subsystem identity 一致；
- Subsystem 不能创建公共 frameId / activationId；
- User Input 必须校验 active/current Activation；
- revoked Activation 永久无效；
- System Data Connection 必须绑定合法 Grant；
- Render Update 限制当前 Subsystem Render namespace；
- Renderer 不能获得通用任意 IPC；
- Content API 只接受逻辑资源身份。

## 16. 当前契约状态

已冻结：

- Game Package v2 Desktop Bootstrap subset；
- Desktop Node.js Launcher Profile v1；
- Subsystem Control Protocol v1；
- Frame / Call v1 Batch A：identity / authority / lifecycle / Activation。

下一冻结目标：

```text
Frame / Call Batch B
    7 RPC final Schema / pre-postcondition
```

之后：

```text
Batch C transaction / commit barrier
Batch D error / timeout / retry
Batch E Runtime failure unwind
Batch F limits / fixture / profile completion
Main ⇄ Renderer Control
Renderer ⇄ Subsystem Connection
User Input
Render Update
Render State
```

Legacy `frame-data-channel-v1.md` / `client-state-tree-v1.md` 不得继续作为 Frame/Render ownership 真相。
