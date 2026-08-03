# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：控制面、System 数据面、内容面、协议职责域、恢复和安全边界  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[运行承载系统](./runtime-hosting-system.md)  
> 最近复核：2026-08-03

## 1. 设计目标

通信系统使 Main、Subsystem 和 Renderer 在独立进程或不同平台 Transport 中保持一致语义，同时避免 Main 成为高频 User Input 和 Render Update 的转发瓶颈。

核心原则：

> 物理 System Data Connection 按 Runtime Container / Subsystem 建立；Connection、Render Update、User Input 是三个职责独立的协议域。Frame 只属于 User Input / Main Control 语义，Render 使用独立身份。

部分旧 v1 数据协议仍使用 `systemId`。Descriptor `key` 与旧 `systemId` 的最终 wire 映射由对应协议迁移冻结，本文不通过术语替换静默改变旧字段含义。

## 2. 三类通信平面

```text
Control Plane
    Subsystem ⇄ Main
    Renderer ⇄ Main

System Data Plane
    Subsystem ⇄ Renderer
    每 Subsystem 一条物理连接
    ├── Connection Layer
    ├── Render Update Protocol
    └── User Input Protocol

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

三个平面的职责、顺序、恢复和背压语义不同。

## 3. Main ⇄ Subsystem Control Plane

Desktop 中，Main 先开放 Control WebSocket Endpoint，再启动 Subsystem Runtime。连接方向固定为：

```text
Subsystem Process
    ── connect ──▶ Main Control WebSocket Server
```

已冻结的 [Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md) 管理 Runtime Container 级 Bootstrap、身份和生命周期：

```text
Transport connected
→ subsystem.hello(key, bootstrapToken, protocolVersions)
→ Main 验证 Launch Attempt / identity / version
→ Connection 永久绑定 descriptor.key
→ identified
→ subsystem.status(initializing?)
→ subsystem.status(ready + rendererDataEndpoint)

正常结束：
Main 建立 shutdown intent
→ subsystem.shutdown(reason)
→ subsystem.status(stopping) [optional]
→ Supervisor confirms exit
→ stopped
```

因此：

```text
spawn success ≠ connected ≠ identified ≠ ready
```

以及：

```text
shutdown Response ≠ stopped
status(stopping) ≠ stopped
```

`ready` 是 Runtime Status，不重新携带或声明 Subsystem identity；`stopped` 只来自 Supervisor 对 Runtime 实际退出的观察。

Subsystem Control v1 不定义 application-level heartbeat、same-attempt reconnect、resume 或 automatic restart。Desktop Host 可以使用 WebSocket ping/pong、Transport 状态和 Process Supervisor 进行底层健康检测。

Frame / Call 是独立协议域，可以复用已经认证的 Control Connection，但不得重新定义 Runtime Bootstrap、Subsystem identity、ready、shutdown 或 restart 语义。

## 4. Main ⇄ Renderer Control Plane

Renderer 与 Main 之间有一条会话级长期控制连接，负责：

- Session 状态；
- 当前 declared / starting / connected / identified / ready / stopping / stopped / failed Subsystem 状态；
- Frame Stack Snapshot 与增量通知；
- Activation；
- Input Target；
- System Data Connection Grant / replace / revoke；
- 会话错误和诊断；
- Renderer 重连。

Main Control Plane 不负责：

- 普通 User Input Payload；
- Render State / Render Event；
- 资源主体；
- Render visibility / ordering。

Renderer 不能通过 DOM、Frame Stack 或已有 WebSocket 自行决定某个 Subsystem 是否允许连接。

## 5. System Data Plane

每个有效 Runtime Container 与 Renderer 之间最多一条长期双向 System Data Connection。

连接绑定 System/Subsystem 级身份。现有 v1 例子常使用：

```text
sessionId
systemId
connectionId
```

其正式身份 Schema 由未来 Connection Protocol 冻结。

System Data Connection 可以同时承载：

```text
0..N Render Context
0..N Frame Input Context
```

即使没有 Frame，Subsystem 也可以通过同一连接维护 Render。

## 6. Renderer–Subsystem 三个协议域

```text
Renderer ⇄ Runtime Container

Connection Layer
    System Connection 建立、认证、版本、存活、替换和关闭

Render Update Protocol
    Subsystem → Renderer 为主
    独立 Render identity / state / event / recovery

User Input Protocol
    Renderer → Subsystem 为主
    Frame + Activation 输入路由
```

三个协议域共享同一物理 WebSocket / MessagePort，但状态所有权、Sequence、背压和恢复语义独立。

详见：[Renderer–Subsystem 协议分层](./renderer-subsystem-protocol-layers.md)。

## 7. Connection Layer

Connection Layer 只管理 System Data Connection：

- 根据 Main Grant 建立连接；
- 确认 Session / Subsystem / Connection 身份；
- 协商协议版本和必要能力；
- heartbeat 与故障检测；
- 连接替换和关闭。

这里的 heartbeat 属于 **Renderer ⇄ Subsystem System Data Connection Layer**，不得与 Subsystem Control Protocol v1 混为一谈；后者明确没有 application heartbeat。

Connection Layer 不拥有：

```text
Frame Stack
Activation
Input Target
Render Registry
Render State
业务状态
```

## 8. User Input Protocol 身份

普通 User Input 使用 Main 发布的 Frame/Input Target。现有概念字段：

```text
systemId / subsystem reference
frameId
activationId
```

路由：

```text
Browser input
→ Renderer Input Router
→ Main-declared Input Target
→ 对应 System Data Connection
→ User Input Protocol
→ frameId + activationId
→ Subsystem Input Handler
```

Frame / Activation 只约束输入上下文，不约束 Render。

User Input Sequence、连续输入合并、离散事件顺序和 UI Interaction 定位由独立契约冻结。

## 9. Render Update Protocol 身份

Render Update 不使用 `frameId + activationId` 作为平台级身份。

概念路由：

```text
Subsystem Render Manager
→ Render identity
→ Render Update Protocol
→ Renderer Render Store
```

本文和其他架构文档可能使用 `renderId` 作为概念占位名，仅为了描述“连接内独立 Render identity”。`renderId` 不是已经冻结的 wire 字段名。

Render Revision、Scope、Event、Sequence / Ordering 和 Resync 由 Render Update Protocol 独立冻结，不继承 Frame Activation epoch。

## 10. Frame 与 Render 不存在协议级绑定

以下映射不进入公共协议：

```text
frameId → render identity
render identity → frameId
```

因此：

- Frame suspend 不使 Render 消息失效；
- Frame Activation 改变不启动新的 Render epoch；
- Frame close 不删除 Render Store；
- Render destroy 不关闭 Frame；
- Render recovery 不要求 Frame resync。

## 11. Content Plane

内容面提供逻辑只读 Content API：

```text
manifest
record(namespace, key)
group(namespace, key)
resource(namespace, key)
```

内容面不承载 User Input、Render State、Runtime Tick、Frame Stack、Activation 或 Runtime Bootstrap 控制。

大型资源主体通过独立 HTTP / Fetch 获取。

## 12. Transport Profile

Desktop：

```text
Subsystem → Main
    每 Subsystem 一条 localhost WebSocket

Renderer ⇄ Main
    每会话一条 localhost WebSocket

Renderer ⇄ Subsystem
    每 Subsystem 一条 localhost WebSocket

Content API
    localhost HTTP
```

PWA：

```text
Subsystem Worker ⇄ Main Runtime Worker
    每 Subsystem 一条控制 MessagePort

Window ⇄ Main Runtime Worker
    一条控制 MessagePort

Window ⇄ Subsystem Worker
    每 Subsystem 一条数据 MessagePort

Content API
    same-origin Fetch，由 Service Worker 响应
```

PWA Control Transport / Bootstrap Credential Profile 尚未冻结；未来映射必须保持 Subsystem Control v1 的身份与生命周期语义，除非显式提升协议版本。

Transport Profile 不改变 Subsystem、Frame/Input 和 Render 的所有权语义。

## 13. Desktop 启动连接顺序

```text
Main Control Endpoint ready
→ Main 启动全部声明 Subsystem
→ Subsystem 主动连接 Main
→ subsystem.hello 成功，Connection identified
→ subsystem.status(state="ready")
→ Main 发布 Subsystem 状态 / Data Grant
→ Renderer 主动建立 System Data Connection
→ Connection Layer ready
→ User Input / Render Update 开始直接通信
```

## 14. Renderer 重连恢复

Renderer 重载后的恢复不按 Frame 推导 Render 或 Subsystem Connection：

```text
Renderer → Main Control reconnect
→ 恢复 Session / ready Subsystem / Data Grant / Frame Stack / Input Target
→ 按 Main Grant 重建需要的 System Data Connection

User Input domain
→ 恢复 Frame / Activation 输入上下文

Render domain
→ 各 Subsystem 独立恢复自己的 Render State
```

一个域的恢复失败不能自动重置另一域的业务状态。

## 15. 背压原则

```text
Subsystem Control v1
    不静默丢弃
    状态改变 Request 不做 application retry
    shutdown timeout 进入 Supervisor termination escalation
    单消息上限 1 MiB

其他 Control RPC
    不静默丢弃；具体 timeout / retry 由对应协议冻结

User Input
    连续意图可合并
    离散输入有界且保持协议要求的顺序

Render State
    可恢复目标状态可按 Render / Scope 合并

Render Event
    一次性行为必须有界并定义溢出策略

System Data Transport
    公平调度协议域和多个 Render / Frame Input Context

Content Body
    使用独立 HTTP / Fetch 流和缓存
```

Sequence / Revision 必须在各自协议域内定义，不能使用一套 Frame Sequence 统管全部 System Data 消息。

## 16. 安全原则

- 所有消息视为不可信输入；
- `subsystem.hello` 必须绑定合法 Launch Attempt、Descriptor `key` 与 Bootstrap Credential；
- hello 成功后 connection-bound `descriptor.key` 是该 Control Connection 唯一 Subsystem identity；
- Bootstrap authentication wire error 不区分 unknown key 与 invalid / consumed token；
- `subsystem.status(stopping)` 只有 Main 已建立 shutdown intent 后合法；
- System Data Connection 必须绑定合法 Session / Subsystem / Connection；
- User Input 必须校验 Frame / Activation / 输入权限；
- Render Update 必须限制在当前 Subsystem 的 Render Namespace；
- Renderer 不能获得任意 IPC Channel；
- Render State 不允许可执行代码、任意 HTML 或物理路径；
- Content API 只接受逻辑资源身份。

## 17. 当前契约迁移状态

已冻结：

- Game Package v2 Desktop Bootstrap subset；
- Desktop Node.js Launcher Profile v1；
- Subsystem Control Protocol v1：`hello / status / shutdown`、Runtime 状态机、错误 Envelope、wire limits、connection failure 与 shutdown semantics；
- Subsystem Control v1 明确没有 application heartbeat / reconnect / automatic restart。

仍待冻结：

- Main ⇄ Subsystem Frame / Call Protocol；
- Main ⇄ Renderer Control Protocol；
- Renderer ⇄ Subsystem Connection Protocol；
- Render Update Protocol；
- User Input Protocol；
- Render State Tree / equivalent；
- 跨 Subsystem Render Composition / z-order；
- 上述未冻结协议各自的最大消息、树深、发送速率与背压 Profile。

旧 `frame-data-channel-v1.md` 与 `client-state-tree-v1.md` 只保留迁移历史和旧实现字段，不得继续作为 Frame/Render 所有权真相。
