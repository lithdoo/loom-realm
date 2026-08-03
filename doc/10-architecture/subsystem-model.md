# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：模块 Subsystem 的职责、状态所有权、Frame/Input 适配和 Render 所有权边界  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)  
> 下层契约：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-03

## 1. 设计目标

模块 Subsystem 是 LoomRealm 的业务扩展单元。地图、菜单、对话、战斗或第三方功能都可以作为 Subsystem 实现，而不要求进入 Main 核心。

平台只规定 Subsystem 与 Main、Renderer、Content Service 的外部边界，不要求所有 Subsystem 采用相同的业务状态拆分、Tick、Frame Runtime、Projector 或 Render 内部结构。

## 2. Subsystem 职责

每个 Subsystem 负责：

- 按自己的业务规则维护权威状态；
- 验证和处理发送到自身 Frame/Input Context 的用户输入；
- 根据 Main 的 Frame lifecycle control 维护对应内部 Context；
- 按 Main 签发的 `activationId` 校验 ordinary User Input；
- 完全管理自己的 Render Context，包括创建、更新、排序、可见性、事件和销毁；
- 通过 Render Update Protocol 向 Renderer 发布声明式目标状态和表现事件；
- 在共享 System Data Connection 上处理 Render Update 与 User Input；
- 根据业务需要通过 Frame / Call Protocol 请求调用另一个 Subsystem；
- 完成、取消或失败时向 Main 返回统一调用 outcome；
- 在 Runtime Container 关闭时释放系统级业务和资源状态。

## 3. Subsystem 非职责

- 不直接修改 Main 调用栈；
- 不自行创建公共 `frameId`；
- 不自行签发 `activationId`；
- 不伪造其他 Subsystem 的 Frame、Activation 或 Render Namespace；
- 不通过共享 Transport 越过自身 connection-bound `descriptor.key` 访问其他 Subsystem 业务状态；
- 不直接发送任意 DOM 操作、HTML 或脚本给 Renderer；
- 不把内部对象、文件句柄或物理路径序列化给客户端；
- 不依赖其他 Subsystem 的内部可变状态；
- 不以 PID、Worker identity 或 Connection ID 代替协议身份。

## 4. Subsystem、Container、Frame 与 Render

```text
Subsystem
    Descriptor identity = key

Runtime Container
    Subsystem 的承载单元
    Desktop = 独立 OS Process
    PWA = Dedicated Worker

System Data Connection
    Runtime Container 与 Renderer 的共享物理数据 Transport

Frame
    Main 管理的一次调用 / ordinary User Input Context
    frameId 创建时永久绑定 descriptor.key

Render Context
    Subsystem 管理的呈现上下文
```

每个 `descriptor.key` 同时最多对应一个有效 Runtime Container。一个 Container 可以同时承载多个 Frame/Input Context 和多个 Render Context。

平台不定义 Frame 与 Render 的一一、一对多或多对一关系。

旧协议字段 `systemId` 只在 Legacy 数据协议兼容上下文中保留；新 Frame / Call v1 使用当前 Descriptor identity，不从旧 `systemId` 创建第二套 Frame ownership identity。

## 5. Subsystem 内部状态自由度

平台不要求“每个 Frame 都拥有独立权威业务状态”。Subsystem 可以选择适合自己的内部模型，例如：

```text
shared world state
├── Frame F1 input handler
├── Frame F2 input handler
├── Render world
└── Render hud
```

或者：

```text
Session A
├── Frame F1
└── Render R1

Session B
├── Frame F2
└── Render R2
```

也可以：

```text
Render loading
    zero Frame
```

只要外部协议身份、调用语义和输入权限保持正确，平台不限制内部映射。

## 6. 状态所有权

```text
Main
    Subsystem Registry
    Runtime Container Registry
    Frame identity / lifecycle
    Frame Stack
    Activation
    Input Target
    Connection authorization

Subsystem Runtime Container
    本 Subsystem 的全部权威业务状态和规则
    Frame Input Handler / internal Frame association
    Render Registry / Render State
    System 级共享资源与缓存

Renderer
    Main Frame/Input Control State 的只读镜像
    System Data Connection Registry
    Render Store
    DOM / Canvas / WebGL 与非权威表现状态
    原始输入设备状态
```

Main 不拥有业务 Render。Renderer 不拥有权威业务状态或 Frame authority。

## 7. Frame/Input Context

当 Main 为某次调用建立 Frame 时，Subsystem 必须能够识别：

```text
frameId
current activationId（仅 active 时存在）
input eligibility
caller / return context（按 Frame / Call Protocol 需要）
```

Frame / Call v1 Batch A 已冻结：

```text
frameId
    Main-generated / Session-scoped unique / never reused

Frame → Subsystem
    permanently bound to descriptor.key

callerFrameId
    immutable

lifecycle
    starting / active / suspended / closing / closed

Activation
    Main-generated / unique / one-shot / never rolls back
```

只有 `active` Frame 才拥有合法 current Activation。

Frame 的平台级作用是让 Main 和 Renderer 可以把 ordinary User Input 准确送到 Subsystem 中当前允许处理该输入的上下文。

Subsystem 可以为 Frame 创建专用 Handler，也可以将多个 Frame 映射到共享业务对象。Frame suspend / resume / close 只改变平台调用 / ordinary input 资格，不要求业务状态、Tick 或 Render 自动变化。

## 8. Frame Outcome 与 Cleanup

调用 termination outcome：

```text
completed
cancelled
failed
```

不是 Frame lifecycle state。

即使某次调用以 `failed` outcome 结束，Frame Context 仍按：

```text
closing
→ closed
```

完成公共 cleanup 生命周期。

Subsystem 不应把“业务失败”实现为一个永久 `failed Frame state` 来绕过 `frame.close` / Context cleanup。

最终 outcome wire Schema 在 Frame / Call Protocol 后续 Batch B 冻结。

## 9. Render 所有权

Render 完全由 Subsystem 控制。

Subsystem 决定：

```text
create render
publish full / incremental render state
publish presentation event
change visibility / order
replace render content
destroy render
```

Main 不知道 Render Registry。Renderer 只能根据 Subsystem 的 Render Update Protocol 更新本地 Render Store。

以下关系只能是 Subsystem 内部规则：

```text
Frame F1 created   → create Render R1
Frame F1 suspended → keep R1 visible
Frame F1 closed    → destroy or keep R1
```

平台既不要求也不自动执行这些动作。

## 10. 输入与 System Data Connection

每个 Runtime Container 与 Main 之间有一条长期 Control Connection；每个 Runtime Container 与 Renderer 之间最多一条长期 System Data Connection：

```text
Subsystem ⇄ Main
    Subsystem Control Protocol v1
    Frame / Call Protocol v1

Renderer ⇄ Subsystem
    Connection Layer
    Render Update Protocol
    User Input Protocol
```

User Input Protocol 使用 Main 发布的当前：

```text
subsystem reference
frameId
activationId
```

路由输入。

Render Update Protocol 使用独立 Render identity，不依赖 Frame / Activation。

普通 User Input 和 Render Update 不经过 Main 业务转发。

## 11. Frame Input Router

Runtime Container 需要能够把 User Input Protocol 消息路由到具体 Frame/Input Context：

```text
收到 User Input Payload
→ 确认属于当前 Subsystem Data Connection
→ frameId 查找 Input Context
→ 校验 Frame 当前仍 active
→ 校验 activationId == current Activation
→ 校验输入权限 / 顺序
→ 分派给 Subsystem Input Handler
```

规则：

- Frame A 的输入不能进入 Frame B；
- revoked / old Activation 输入必须拒绝；
- Frame 恢复时必须接受新的 Activation，不得恢复旧 Activation；
- 一个 Frame 的输入错误不能直接污染其他 Frame；
- Frame 路由只属于 User Input 域，不用于 Render Update 路由。

## 12. Render Router / Manager

Subsystem 自己维护 Render Registry：

```text
render identity → Render Context
```

Render Revision、Scope、Event、Snapshot 和恢复模型由 Render Update Protocol 冻结。

Renderer 不需要知道某个 Render 与哪个 `frameId` 有关。

## 13. 调用与返回

只有当前 Stack Top active Frame 可以发起普通调用。

Main 确认目标 `descriptor.key` 已声明、Runtime `ready` 且没有 shutdown intent，然后在现有 Runtime Container 中建立新 Frame/Input Context。

当前方向：

```text
caller active
→ Main allocates new frameId
→ target Frame Context initialize
→ caller old Activation revoked when suspended
→ child receives fresh Activation
→ child becomes active
```

目标 Frame 结束后产生：

```text
completed(value)
cancelled
failed(error)
```

Caller 恢复必须获得新的 Activation，不能恢复 suspend 前的旧 Activation。

Frame 返回只终止该调用 / 输入 Context。它不自动关闭 Runtime Container、System Data Connection、业务状态或 Render。

精确 RPC Schema 与 commit/rollback 顺序由 Frame / Call Protocol Batch B/C 冻结。

## 14. 生命周期适配

Subsystem 需要处理两套相互独立的生命周期：

### Runtime Container

由 Subsystem Control Protocol v1 管理：

```text
hello / ready / shutdown / failed
```

### Frame/Input

由 Frame / Call Protocol 管理：

```text
starting
active
suspended
closing
closed
```

Frame v1 没有独立 `ready / frame.status`。

这些 Frame lifecycle operation 不隐式改变 Render，也不能替代 `subsystem.shutdown`。

## 15. Container 故障

Container Process / Worker 退出时，其业务权威状态和 Frame Input Handler 权威来源同时消失。Main 必须：

- 标记 Subsystem Runtime failed；
- 撤销该 System Data Connection；
- revoke 该 Runtime 所承载 Frame 的有效 Activation；
- 停止向这些 Frame 路由普通输入；
- 按 Frame / Call 协议的调用栈规则处理受影响 Frame；
- 不从 Renderer DOM / Render Store 反向恢复业务状态。

多 Frame Runtime failure 的具体 suffix-unwind 算法由 Frame / Call Protocol Batch E 冻结。

Render Store 的清理与重建策略由 Render Update Protocol 规定。

## 16. 内部架构开放

平台不要求所有 Subsystem 实现：

- per-Frame Runtime Core；
- 固定 Tick；
- ECS；
- Session Coordinator；
- Repository；
- Client State Projector；
- 特定 Render Tree；
- 状态机或对话图。

菜单 Subsystem 可以是低频事件状态机，地图 Subsystem 可以使用固定 Tick 和共享 world state，其他 Subsystem 也可以采用完全不同结构。

## 17. 第一阶段地图 Subsystem

`loom.map` 可以为了自身实现便利采用：

```text
Map Business Runtime
├── Frame Input Adapter(s)
├── Runtime Execution Loop
├── Runtime Core / world state
├── Render Manager
├── Render Projector
└── Repository Cache
```

地图 Subsystem 可以自己把某个 Frame 与某个地图 Session / Render 关联，但这些对象不是 LoomRealm 公共 Frame 模型的一部分。

## 18. 架构不变量

1. 每个 `descriptor.key` 同时最多一个有效 Runtime Container；
2. Subsystem 完全拥有自身业务状态和 Render 生命周期；
3. Frame 是 Main-owned call / ordinary User Input Context；
4. `frameId` 与 `activationId` 在 Session 内不复用；
5. Frame lifecycle = `starting / active / suspended / closing / closed`；
6. `completed / cancelled / failed` 是 outcome，不是 lifecycle state；
7. v1 没有 Frame `ready / initialized / frame.status`；
8. Activation 失效后永久不能恢复；
9. 平台不定义 Frame 与 Render 的所有权关系；
10. Frame suspend / resume / close 不自动修改 Render；
11. 一个 Container 可以在没有 Frame 时拥有 Render；
12. User Input 按 Frame / Activation 路由；
13. Render Update 按独立 Render 身份路由；
14. 普通 User Input 与 Render Update 不经过 Main 转发；
15. 平台承载差异不能改变上述所有权语义。

## 19. 相关下层文档

- [Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)；
- [Renderer–Subsystem 协议分层](./renderer-subsystem-protocol-layers.md)；
- [模块设计目录](../20-modules/README.md)；
- [地图 Subsystem 模块设计](../20-modules/loom-map/README.md)。
