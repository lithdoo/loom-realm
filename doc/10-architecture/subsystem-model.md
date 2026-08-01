# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：模块子系统的职责、状态所有权和扩展边界  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)  
> 最近复核：2026-08-01

## 1. 设计目标

模块子系统是 LoomRealm 的业务扩展单元。地图、菜单、对话、战斗或第三方功能都可以作为子系统实现，而不要求进入程序主系统核心。

## 2. 子系统职责

每个子系统负责：

- 定义并验证自己的调用输入；
- 为每个 Frame 维护独立权威业务状态；
- 接收自身活动 Frame 的普通输入；
- 处理节点事件；
- 生成和发布自己 Frame 的 Client State；
- 产生一次性客户端事件；
- 在共享 System Data Connection 内按 Frame 路由消息；
- 根据业务需要调用另一个子系统；
- 完成、取消或失败时返回统一结果；
- 在 Frame 关闭时释放该实例资源；
- 在 Runtime Container 关闭时释放系统级共享资源。

## 3. 子系统非职责

- 不直接修改程序主系统调用栈；
- 不伪造其他 Frame 或 Activation；
- 不生成其他 Frame 的 Scope；
- 不通过共享 Transport 跨 Frame 访问业务状态；
- 不直接操作渲染端 DOM、Canvas 或 WebGL；
- 不把内部对象、文件句柄或物理路径序列化给客户端；
- 不依赖其他子系统的内部可变状态；
- 不以进程 ID、Worker 身份或 Connection ID 代替 Frame ID。

## 4. System、Container 与 Frame

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
    一次调用实例
    运行在对应 System 的 Runtime Container 内
    在 System Data Connection 内拥有独立 Logical Stream
```

每个 `systemId` 对应一个可复用的 Runtime Container。一个 Container 可以同时承载该 System 的多个 Frame Runtime。

Frame 是调用身份和状态隔离单元，不是进程、Worker 或物理 Transport 身份。

## 5. Container 级共享与 Frame 级隔离

Container 可以共享：

- 系统代码、Schema 和协议适配器；
- Renderer System Data Connection；
- 只读 Content Client；
- Repository、请求去重和不可变内容缓存；
- 已编译 WASM Module；
- 其他不含会话可变状态的系统级资源。

必须按 Frame 隔离：

- 权威业务状态；
- Runtime Core 或状态机实例；
- 输入和离散事件队列；
- Execution Loop 或调度状态；
- `activationId`；
- Client State Projector；
- State Revision、Scope Revision；
- Frame Logical Stream 的双向 Sequence。

关闭一个 Frame 不得终止整个 Container，不得关闭共享 System Data Connection，也不得清理其他 Frame 的状态。

## 6. 状态所有权

```text
程序主系统
    System Registry、Runtime Container Registry、Frame、调用关系、Activation、输入目标、连接授权

模块子系统 Container
    本 System 的共享只读资源、Renderer Data Transport 和 Frame 实例路由

Frame Runtime
    本次调用的权威业务状态和规则

Frame Client State Projector
    本 Frame 的 Client State

渲染端
    System Data Connection Registry、Frame Stream Registry、Store、DOM / Canvas / WebGL 和本地表现状态
```

跨子系统状态通过调用参数和返回结果显式传递。第一阶段不提供共享可变全局状态服务。

## 7. 调用与返回

调用者发送目标 `systemId` 和 JSON 输入。程序主系统解析或创建目标 Container，再在该 Container 中初始化新 Frame：

```text
caller Frame 发起 call
→ Main 解析 systemId
→ 取得或启动 Runtime Container
→ 确保 Renderer ⇄ Container 的 System Data Connection 可用
→ frame.initialize(newFrameId, input)
→ 新 Frame ready
→ 调用者暂停
→ 新 Frame 入栈并激活
→ 新 Frame 使用共享 Transport 内的 Logical Stream
```

目标 Frame 完成后返回：

```text
completed(value)
cancelled
failed(error)
```

Frame 返回只关闭该 Frame Runtime 和 Logical Stream。Container 及其 Renderer Data Connection 是否继续常驻由宿主资源策略决定。

## 8. Client State Projector

每个需要呈现的 Frame 拥有独立 Projector：

```text
已提交的 Frame 权威状态
→ Frame Client State Projector
→ Frame Scopes
→ 所属 System Data Connection
→ Frame Logical Stream
→ 渲染端
```

Projector 应同步、确定性、无 I/O，并原子生成有效 Client State。程序主系统不合并或解释业务 Scope。

同一个 Container 中不同 Frame 的 Projector State、Revision 和 Logical Stream Sequence 必须完全独立。

## 9. 输入与数据连接

每个 Runtime Container 与程序主系统之间有一条长期控制连接；每个 Runtime Container 与 Renderer 之间有一条长期 System Data Connection：

```text
Main ⇄ Runtime Container
    生命周期、调用和诊断

Renderer ⇄ Runtime Container
    每 System 一个共享 Data Transport
    ├── Frame A Logical Stream
    ├── Frame B Logical Stream
    └── Frame C Logical Stream
```

Frame 业务方法包括：

```text
Renderer → Subsystem
    input.dispatch
    node.event
    state.resync

Subsystem → Renderer
    state.snapshot
    scope.replace
    event.emit
```

普通输入和 Client State 不经过 Main 业务转发。

## 10. Frame Router

Runtime Container 必须提供 Frame Router，将共享 Transport 上的消息映射到具体 Frame Runtime：

```text
收到 JSON-RPC Payload
→ 确认消息属于本 System Data Connection
→ frameId 查找 Frame Runtime
→ 校验 activationId
→ 校验该 Frame Logical Stream Sequence
→ 分派业务方法
```

规则：

- Frame A 的消息不能进入 Frame B；
- Frame A 的 Sequence Gap 不重置 Frame B；
- Frame A Resync 不阻塞 Frame B；
- 未知 Frame、旧 Activation 和关闭 Frame 的消息必须拒绝；
- System Data Connection 的认证失败属于连接级故障，Frame 路由错误默认属于流级故障。

## 11. 内部架构开放

平台不要求所有子系统实现：

- Runtime Core；
- 固定 Tick；
- ECS；
- Session Coordinator；
- Repository；
- 状态机或对话图。

例如菜单子系统可以是低频事件状态机，而地图子系统可以使用固定 Tick 和同步 Core。

Container 内部可以使用一个统一 Scheduler 管理多个 Frame，也可以为每个活跃 Frame 维护独立调度器，但暂停 Frame 不应继续处理普通输入。

## 12. 生命周期适配

子系统 Container 需要将平台生命周期适配到 Frame 实例：

- `frame.initialize`：创建 Frame Runtime、验证输入并完成必要准备；
- `frame.activate`：签收 Activation，并在共享 Data Transport 上启用新的 Frame Logical Stream epoch；
- `frame.suspend`：停止普通输入，可以暂停内部调度，但保持 System Data Connection；
- `frame.resume`：使用新 Activation 恢复、处理子调用结果并建立新的 Logical Stream epoch；
- `frame.close`：停止新工作并释放该 Frame 的资源和 Stream 状态，不关闭共享 Transport。

Container 还需要处理自身启动、ready、失败和关闭，不得把 Container ready 与任何单个 Frame ready 混为一谈。

## 13. Container 故障

Container 进程退出或 Worker 发生不可恢复错误时，其承载的全部 Frame 都失去权威运行环境。程序主系统必须：

- 撤销该 System Data Connection；
- 停止向这些 Frame 路由输入；
- 按调用栈规则产生失败结果或会话故障；
- 决定是否重启 Container；
- 不从 Renderer DOM 反向恢复业务状态。

## 14. 第一阶段地图子系统

`loom.map` 是第一个完整实现，用于验证：

- 一个 Container 内承载多个独立地图 Frame；
- 一个 Renderer Data WebSocket / MessagePort 承载多个地图 Frame Logical Stream；
- 业务内容按需加载和共享不可变 Repository Cache；
- 每个 Frame 独立固定 Tick、命令队列和 Runtime Core；
- 地图切换 Effect Barrier；
- 多 Scope Client State 投影；
- Frame 独立输入、Activation、Revision、Sequence 和 Resync。

这些组件属于 `loom.map`，不构成所有子系统的公共接口。

## 15. 架构不变量

1. 每个 `systemId` 同时最多有一个有效 Runtime Container；
2. 一个 Container 可以承载多个 Frame；
3. 一个 Container 与 Renderer 同时最多有一个有效 System Data Connection；
4. Frame 是业务状态和逻辑通信隔离单元，不是物理连接单元；
5. 一个 Frame 的关闭和 Resync 不影响其他 Frame或共享 Transport；
6. 子系统只能发布自身 Frame 的 Client State；
7. 普通输入与视图状态不经过 Main 转发；
8. 平台承载差异不能改变 System、Frame 和 Activation 语义。

## 16. 相关下层文档

- [生命周期协议草案](../15-contracts/system-lifecycle-protocol.md)；
- [Renderer–Subsystem 数据协议 v1](../15-contracts/frame-data-channel-v1.md)；
- [模块设计目录](../20-modules/README.md)；
- [地图子系统模块设计](../20-modules/loom-map/README.md)；
- [现有详细设计：Client State Projector](../architecture/client-state-projector.md)。
