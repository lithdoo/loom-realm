# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：模块 Subsystem 的职责、状态所有权、Frame/Input 适配和 Render 所有权边界  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)  
> 下层契约：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. 设计目标

模块 Subsystem 是 LoomRealm 的业务扩展单元。平台只规定 Subsystem 与 Main、Renderer、Content Service 的外部边界，不要求所有 Subsystem 采用相同业务状态拆分、Tick、Frame Runtime、Projector 或 Render 内部结构。

## 2. Subsystem 职责

每个 Subsystem 负责：

- 按自己的业务规则维护权威状态；
- 验证和处理自身 Frame/Input Context 的用户输入；
- 根据 Main 的 Frame lifecycle control 维护内部 Context；
- 按 Main 签发的 `activationId` 校验 ordinary User Input；
- 管理自己的 Render Context；
- 通过 Render Update Protocol 发布声明式状态与表现事件；
- 在共享 System Data Connection 上处理 Render Update 与 User Input；
- 通过 `frame.call` 请求调用另一个 Subsystem；
- 通过 `frame.return` 提交当前 active Frame 的 terminal outcome；
- 响应 Main 的 `frame.initialize / activate / suspend / resume / close`；
- 在 Runtime Container 关闭时释放系统级业务与资源状态。

## 3. Subsystem 非职责

- 不直接修改 Main 调用栈；
- 不自行创建公共 `frameId`；
- 不自行签发 `activationId`；
- 不维护第二份公共 `callerFrameId` / Call Stack authority；
- 不伪造其他 Subsystem 的 Frame、Activation 或 Render Namespace；
- 不通过共享 Transport 越过 connection-bound `descriptor.key` 访问其他 Subsystem 业务状态；
- 不直接发送任意 DOM 操作、HTML 或脚本给 Renderer；
- 不把文件句柄、Process Handle 或物理路径序列化给客户端；
- 不以 PID、Worker identity 或 Connection ID 代替协议身份。

## 4. Subsystem、Container、Frame 与 Render

```text
Subsystem
    Descriptor identity = key

Runtime Container
    Desktop = OS Process
    PWA = Dedicated Worker

System Data Connection
    Runtime Container ⇄ Renderer shared transport

Frame
    Main-owned call / ordinary User Input Context
    permanently assigned descriptor.key

Render Context
    Subsystem-owned presentation context
```

每个 `descriptor.key` 同时最多一个有效 Runtime Container；一个 Container 可以承载多个 Frame/Input Context 和多个 Render Context。

旧 `systemId` 只在 Legacy 数据协议兼容上下文保留；新 Frame / Call v1 不从它建立第二套 identity。

## 5. 内部状态自由度

平台不要求“每个 Frame 都拥有独立权威业务状态”。Subsystem 可以共享 world/state/loop/render，也可以把不同 Frame 映射到独立内部 session。

例如：

```text
shared world state
├── Frame F1 input handler
├── Frame F2 input handler
├── Render world
└── Render hud
```

或：

```text
Session A → Frame F1 / Render R1
Session B → Frame F2 / Render R2
Render loading → zero Frame
```

只要外部协议身份、调用语义和输入权限正确，平台不限制内部映射。

## 6. 状态所有权

```text
Main
    Subsystem / Runtime Registry
    Frame identity / lifecycle / caller relationship
    Frame Stack / Activation / Input Target
    Connection authorization

Subsystem Runtime Container
    authoritative business state / rules
    Frame Input Contexts
    Render Registry / Render State
    shared resources / caches

Renderer
    Main control state read-only mirror
    System Data Connection Registry
    Render Store
    presentation state / raw input state
```

Main 不拥有业务 Render。Renderer 不拥有业务权威状态或 Frame authority。

## 7. Frame/Input Context

Subsystem 通过 Batch B wire 只获得执行本地 Frame Context 所需的信息：

```text
frame.initialize
    frameId + business input

frame.activate
    frameId + first activationId

frame.suspend
    frameId + current activationId

frame.resume
    frameId + replacement activationId + returnedFrameId + FrameOutcome

frame.close
    frameId
```

`callerFrameId` 是 Main-owned relationship，**不下发给 `frame.initialize` 或 `frame.return`**。Subsystem 不需要维护公共 Caller relationship 才能 return；Main 根据 Frame Registry 决定 receiver。

Batch A/B 同时冻结：

```text
frameId
    Main-generated / Session unique / never reused

Frame → Subsystem
    permanent descriptor.key assignment

lifecycle
    starting / active / suspended / closing / closed

Activation
    Main-generated / one-shot / never rolls back
```

只有 active Frame 才拥有合法 current Activation。

## 8. Frame Outcome 与 Cleanup

Batch B wire outcome：

```ts
type FrameOutcome =
  | { type: "completed"; value: JsonValue }
  | { type: "cancelled" }
  | { type: "failed"; error: FrameFailure };
```

`completed.value` 必填；无业务返回值使用 `null`。

Outcome 不是 Frame lifecycle state。即使 outcome = `failed`，Frame Context 仍需通过 `closing → closed` 收敛。

`FrameOutcome.failed` 也不是 JSON-RPC Error：前者描述调用如何结束，后者描述当前 RPC 无法合法完成。

## 9. Render 所有权

Render 完全由 Subsystem 控制：create/update/event/visibility/order/replace/destroy/recovery 都属于 Render Protocol 与 Subsystem 业务实现。

平台不自动执行：

```text
Frame created   → Render create
Frame suspended → Render hide
Frame closed    → Render destroy
```

Main 不维护 Render Registry；Renderer 只维护非权威 Render Store。

## 10. Control 与 System Data Connection

```text
Subsystem ⇄ Main
    Subsystem Control Protocol v1
    Frame / Call Protocol v1

Renderer ⇄ Subsystem
    Connection Layer
    Render Update Protocol
    User Input Protocol
```

Batch B 的 Frame / Call wire 全部运行于已经认证的 Control Connection，source Subsystem identity 来自 connection-bound `descriptor.key`，不重复携带 `sourceSubsystemKey / systemId`。

System Data Connection 与 Frame 数量无关，可以服务 0..N Frame Input Context 和 0..N Render Context。

## 11. Frame Input Router

```text
User Input Payload
→ verify current Subsystem Data Connection
→ find frameId
→ require Frame active
→ require activationId == current Activation
→ validate input-domain ordering
→ dispatch to Frame Input Handler
```

旧/revoked Activation 必须拒绝；Frame resume 后只接受 replacement Activation。

Frame routing 只属于 User Input 域，不用于 Render Update 路由。

## 12. Call / Return Adapter

Subsystem 发起调用：

```text
frame.call({
  frameId,
  activationId,
  targetSubsystemKey,
  input
})
→ { childFrameId }
```

只有当前 active Frame 可以发起。`targetSubsystemKey` 可以等于自身 Subsystem；same-Subsystem call 仍建立新的 `childFrameId`，但复用现有 Runtime Container。

`frame.call` success 只表示一个确定的 Child call 已/将按 Batch C 的 commit 规则建立，不等待 Child 最终业务结果。

Subsystem 结束当前 Frame：

```text
frame.return({
  frameId,
  activationId,
  result
})
→ {}
```

`frame.return` 不携带 `callerFrameId` 或 target receiver。Subsystem 只能提交 outcome，Main 决定 receiver。

Child outcome 最终通过：

```text
Child frame.return
→ Main
→ Caller frame.resume(returnedFrameId + result + new activationId)
```

交付，不存在独立 `frame.result`。

## 13. `frame.resume` 的局部原子语义

Subsystem 必须把 `frame.resume` 视为一个控制操作，同时完成：

```text
deliver Child FrameOutcome
+
install replacement activationId
```

不得暴露“结果已交付但 Activation 未切换”或“Activation 已切换但结果未交付”的成功中间状态。

Main/Renderer 的跨系统 publish barrier 由 Batch C 冻结。

## 14. `frame.close`

Batch B 的 `frame.close` 只有：

```text
{ frameId }
```

没有 `reason / outcome / callerFrameId / activationId`。

Subsystem 的公共义务只有删除 Frame/Input Context、拒绝该 frameId 后续普通输入并释放 Frame-owned control resources。

`frame.close` 不自动关闭 Runtime/Data Connection，不删除共享 business state / cache，也不 destroy Render。

## 15. 生命周期适配

Subsystem 同时处理两套独立 lifecycle：

```text
Runtime Container
    Subsystem Control v1
    hello / ready / shutdown / failed

Frame/Input
    Frame / Call v1
    starting / active / suspended / closing / closed
```

Frame operation 不能替代 `subsystem.shutdown`；Frame v1 没有独立 ready/status。

## 16. Container 故障

Runtime failure 时 Main revoke 受影响 Activation、停止普通输入并根据 Batch E unwind Stack。Subsystem/Renderer 不从 Render Store 反推 Frame/业务恢复。

多 Frame suffix-unwind 尚未冻结，但 Batch A/B identity、wire fields 与 Outcome Schema不得因此改变。

## 17. 内部架构开放

平台不要求 per-Frame Runtime Core、固定 Tick、ECS、Session Coordinator、Repository、Projector、特定 Render Tree 或统一状态机。

业务 Subsystem 只需实现已冻结外部 contract。

## 18. 第一阶段 `loom.map`

可采用：

```text
Map Business Runtime
├── Frame Control Adapter
├── Frame Input Adapter(s)
├── Runtime Execution Loop / Core
├── Render Manager / Projector
└── Repository Cache
```

这些内部对象与公共 Frame 的映射属于 `loom.map` 自己的实现。

## 19. 架构不变量

1. 每个 `descriptor.key` 同时最多一个有效 Runtime Container；
2. Frame 是 Main-owned call / ordinary User Input Context；
3. Frame/Activation identity 不复用；
4. Caller relationship 由 Main 独占，不进入 Subsystem Frame wire；
5. lifecycle = `starting / active / suspended / closing / closed`；
6. outcome = `completed / cancelled / failed`；
7. Batch B wire exactly seven JSON-RPC Requests；
8. `frame.call` 只建立 call，不等待最终业务结果；
9. `frame.resume` 同时交付 outcome + replacement Activation；
10. `frame.close` 不携带 reason；
11. v1 无 `system.call / system.return / frame.result / frame.ready / frame.status`；
12. Frame lifecycle 不控制 Render/Data Connection；
13. User Input 与 Render Update 不经 Main 业务转发。

## 20. 相关文档

- [Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)；
- [Renderer–Subsystem 协议分层](./renderer-subsystem-protocol-layers.md)；
- [程序主系统](../20-modules/main-system/README.md)；
- [地图 Subsystem](../20-modules/loom-map/README.md)。
