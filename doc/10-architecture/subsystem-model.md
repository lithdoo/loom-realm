# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：模块子系统的职责、状态所有权、Frame/Input 适配和 Render 所有权边界  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)  
> 最近复核：2026-08-02

## 1. 设计目标

模块子系统是 LoomRealm 的业务扩展单元。地图、菜单、对话、战斗或第三方功能都可以作为子系统实现，而不要求进入程序主系统核心。

平台只规定子系统与 Main、Renderer、Content Service 的外部边界，不要求所有子系统采用相同的业务状态拆分、Tick、Frame Runtime、Projector 或 Render 内部结构。

## 2. 子系统职责

每个子系统负责：

- 按自己的业务规则维护权威状态；
- 验证和处理发送到自身 Frame/Input Context 的用户输入；
- 根据需要响应 Main 的 Frame 生命周期控制；
- 完全管理自己的 Render Context，包括创建、更新、排序、可见性、事件和销毁；
- 通过 Render Update Protocol 向 Renderer 发布声明式目标状态和表现事件；
- 在共享 System Data Connection 上处理 Render Update 与 User Input；
- 根据业务需要调用另一个子系统；
- 完成、取消或失败时向 Main 返回统一调用结果；
- 在 Runtime Container 关闭时释放系统级业务和资源状态。

## 3. 子系统非职责

- 不直接修改程序主系统调用栈；
- 不伪造其他 System 的 Frame、Activation 或 Render Namespace；
- 不通过共享 Transport 越过自身 `systemId` 访问其他子系统业务状态；
- 不直接发送任意 DOM 操作、HTML 或脚本给 Renderer；
- 不把内部对象、文件句柄或物理路径序列化给客户端；
- 不依赖其他子系统的内部可变状态；
- 不以 PID、Worker 身份或 Connection ID 代替协议身份。

## 4. System、Container、Frame 与 Render

```text
System
    由 systemId 标识的业务扩展单元

Runtime Container
    System 的承载单元
    桌面为独立 OS 进程
    PWA 为 Dedicated Worker

System Data Connection
    Runtime Container 与 Renderer 的共享物理数据 Transport

Frame
    Main 管理的一次调用 / User Input Context

Render Context
    Subsystem 管理的呈现上下文
```

每个 `systemId` 对应一个可复用 Runtime Container。一个 Container 可以同时承载多个 Frame/Input Context 和多个 Render Context。

平台不定义 Frame 与 Render 的一一、一对多或多对一关系。

## 5. Subsystem 内部状态自由度

平台不再要求“每个 Frame 都拥有独立权威业务状态”。子系统可以选择适合自己的内部模型，例如：

```text
共享 world state
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
    没有 Frame
```

只要外部协议身份、调用语义和输入权限保持正确，平台不限制内部映射。

## 6. 状态所有权

```text
程序主系统
    Subsystem Registry、Container Registry、Frame Stack、Activation、Input Target、连接授权

模块子系统 Container
    本 System 的全部权威业务状态和规则
    Frame Input Handler / Frame 关联
    Render Registry / Render State
    System 级共享资源与缓存

Renderer
    System Data Connection Registry
    Render Store
    DOM / Canvas / WebGL 与非权威表现状态
    原始输入设备状态
```

Main 不拥有业务 Render。Renderer 不拥有权威业务状态。

## 7. Frame/Input Context

当 Main 为某次调用建立 Frame 时，Subsystem 必须能够识别：

```text
frameId
activationId
input eligibility
caller / return context（按控制协议需要）
```

Frame 的平台级作用是让 Main 和 Renderer 可以把普通 User Input 准确送到 Subsystem 中当前允许处理该输入的上下文。

Subsystem 可以为 Frame 创建专用 Handler，也可以将多个 Frame 映射到共享业务对象。Frame suspend / resume / close 只改变平台调用 / 输入资格，不要求业务状态、Tick 或 Render 自动变化。

## 8. Render 所有权

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

任何以下关系都只能是 Subsystem 内部规则：

```text
Frame F1 created → create Render R1
Frame F1 suspended → keep R1 visible
Frame F1 close → destroy R1
```

平台既不要求也不自动执行这些动作。

## 9. 输入与 System Data Connection

每个 Runtime Container 与 Main 之间有一条长期控制连接；每个 Runtime Container 与 Renderer 之间最多一条长期 System Data Connection：

```text
Subsystem ⇄ Main
    Container / Frame lifecycle、call / return、diagnostic

Renderer ⇄ Subsystem
    Connection Layer
    Render Update Protocol
    User Input Protocol
```

User Input Protocol 使用 Main 发布的 `systemId + frameId + activationId` 路由输入。

Render Update Protocol 使用独立 Render 身份，不依赖 Frame / Activation。

普通 User Input 和 Render Update 不经过 Main 业务转发。

## 10. Frame Input Router

Runtime Container 需要能够把 User Input Protocol 消息路由到具体 Frame/Input Context：

```text
收到 User Input Payload
→ 确认属于本 System Data Connection
→ frameId 查找 Input Context
→ 校验 activationId
→ 校验输入权限 / 顺序
→ 分派给 Subsystem Input Handler
```

规则：

- Frame A 的输入不能进入 Frame B；
- 旧 Activation 输入必须拒绝；
- 一个 Frame 的输入错误不能直接污染其他 Frame；
- Frame 路由只属于 User Input 域，不用于 Render Update 路由。

## 11. Render Router / Manager

Subsystem 自己维护 Render Registry：

```text
renderId → Render Context
```

一个 `renderId` 只需要在当前 `systemId` 的 Render Namespace 内稳定唯一。Render 的 Revision、Scope、Event、Snapshot 和恢复模型由 Render Update Protocol 冻结。

Renderer 不需要知道某个 `renderId` 与哪个 `frameId` 有关。

## 12. 调用与返回

调用者 Frame 发起目标 `systemId` 和 JSON 输入。Main 验证目标 System 已声明且 Runtime Container ready，然后建立目标 Frame/Input Context：

```text
caller Frame 发起 call
→ Main 解析 systemId
→ 确认 Runtime Container ready
→ frame.initialize(newFrameId, input)
→ 目标 Frame 输入上下文 ready
→ 调用者暂停输入
→ 新 Frame 入栈并激活
```

目标 Frame 完成后返回：

```text
completed(value)
cancelled
failed(error)
```

Frame 返回只终止该调用 / 输入上下文。它不自动关闭 Runtime Container、System Data Connection、业务状态或 Render。

## 13. 内部架构开放

平台不要求所有子系统实现：

- per-Frame Runtime Core；
- 固定 Tick；
- ECS；
- Session Coordinator；
- Repository；
- Client State Projector；
- 特定 Render Tree；
- 状态机或对话图。

菜单子系统可以是低频事件状态机，地图子系统可以使用固定 Tick 和共享 world state，其他子系统也可以采用完全不同结构。

## 14. 生命周期适配

Subsystem 需要处理两套相互独立的生命周期：

### Frame/Input

- `frame.initialize`：建立调用 / 输入上下文；
- `frame.activate`：接受当前 Activation 的普通输入；
- `frame.suspend`：停止该 Frame 普通输入；
- `frame.resume`：使用新 Activation 恢复输入并接收子调用结果；
- `frame.close`：删除该 Frame/Input Context。

这些操作不隐式改变 Render。

### Render

由 Subsystem 自己通过 Render Update Protocol 控制，不由 Main Frame Lifecycle 调用直接定义。

## 15. Container 故障

Container Process / Worker 退出时，其业务权威状态和 Render 权威来源同时消失。Main 必须：

- 标记 System failed；
- 撤销该 System Data Connection；
- 停止向该 System 的 Frame 路由输入；
- 按调用栈规则处理受影响 Frame；
- 不从 Renderer DOM / Render Store 反向恢复业务状态。

Render Store 的清理与重建策略由 Render Update Protocol 规定。

## 16. 第一阶段地图子系统

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

地图子系统可以自己把某个 Frame 与某个地图 Session / Render 关联，但这些对象不是 LoomRealm 公共 Frame 模型的一部分。

## 17. 架构不变量

1. 每个 `systemId` 同时最多一个有效 Runtime Container；
2. Subsystem 完全拥有自身业务状态和 Render 生命周期；
3. Frame 是调用 / User Input Context，不是强制的业务状态实例；
4. 平台不定义 Frame 与 Render 的所有权关系；
5. Frame suspend / resume / close 不自动修改 Render；
6. 一个 Container 可以在没有 Frame 时拥有 Render；
7. User Input 按 Frame / Activation 路由；
8. Render Update 按独立 Render 身份路由；
9. 普通 User Input 与 Render Update 不经过 Main 转发；
10. 平台承载差异不能改变上述所有权语义。

## 18. 相关下层文档

- [生命周期协议草案](../15-contracts/system-lifecycle-protocol.md)；
- [Renderer–Subsystem 协议分层](./renderer-subsystem-protocol-layers.md)；
- [模块设计目录](../20-modules/README.md)；
- [地图子系统模块设计](../20-modules/loom-map/README.md)。
