# 栈式运行系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：调用栈、Frame 生命周期、激活周期和输入目标的设计思路  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)  
> 最近复核：2026-08-02

## 1. 设计目标

栈式运行系统为模块子系统提供简单、可推理的调用与用户输入路由关系：当前 Frame 可以调用另一个 System 的新 Frame，被调用 Frame 结束后，调用者恢复并获得结果。

Frame 只属于 Main 控制的调用 / 输入模型，不属于 Render 模型。

## 2. 职责

- 根据入口建立初始 Frame；
- 维护唯一的后进先出调用栈；
- 执行调用、暂停、激活、返回和关闭；
- 决定当前普通输入目标；
- 为 Frame 签发激活周期标识；
- 处理 Frame 初始化失败和所属 Subsystem 异常退出；
- 向 Renderer 发布调用栈和 Input Target 控制状态。

## 3. 非职责

- 不保存地图、菜单、对话或战斗业务状态；
- 不要求业务状态按 Frame 隔离；
- 不执行子系统内部 Tick；
- 不创建、隐藏、排序或销毁 Render；
- 不生成 Render State、Scope 或 Client Node；
- 不解释调用参数和返回值中的业务字段；
- 不从 DOM / Canvas / WebGL 推断当前活动 Frame。

## 4. 核心概念

### Frame

Frame 表示一次由 Main 管理的调用 / 用户输入上下文，而不是进程、业务世界实例或 Render。

Frame 至少提供：

```text
frameId
systemId
callerFrameId
stack status
activationId
input eligibility
return relationship
```

平台只要求 Subsystem 能将发送到某个 Frame 的合法 User Input 路由到对应处理上下文。Subsystem 是否为 Frame 创建独立业务对象、状态机、Session 或其他内部对象完全由自身决定。

### Activation

Activation 表示 Frame 的一次可接收普通输入的活动周期。Frame 首次激活以及从子调用恢复时获得新的 Activation，用于隔离旧周期的迟到输入和控制消息。

Activation 不用于 Render 身份，也不要求 Render 在 Activation 变化时重建或 Resync。

### Stack

调用栈只记录调用 / 输入关系：

```text
[map-frame]
[map-frame, menu-frame]
[map-frame, menu-frame, dialog-frame]
```

子系统业务状态和 Render Registry 始终留在子系统内部。

## 5. 生命周期

概念状态：

```text
starting
→ active
↔ suspended
→ closing
```

状态含义只约束调用和用户输入：

- `active`：可以作为当前 Input Target；
- `suspended`：不接收普通输入，但不要求 Subsystem 停止业务计算或改变 Render；
- `closing`：不再接受新的普通输入或调用操作。

失败可以发生在初始化、活动或关闭阶段。精确状态转换、错误和幂等规则由正式生命周期契约定义。

## 6. 调用原则

- 只有当前栈顶 active Frame 可以发起普通调用或返回；
- 被调用 Frame 完成必要的输入处理准备后，调用者才进入 suspended；
- 新 Frame 入栈后获得新的 Activation 和普通输入权；
- 返回时先终止当前 Frame 的输入资格，再恢复调用者；
- 调用建立成功与业务结果返回是两个不同阶段；
- 同一 `systemId` 的多个 Frame 可以共用一个 Runtime Container 和 System Data Connection。

## 7. Frame 与 Render 的严格边界

Frame 生命周期不定义任何 Render 行为。

以下推导全部禁止作为平台规则：

```text
frame.initialize → create render
frame.activate   → show render
frame.suspend    → hide / freeze render
frame.resume     → restore render
frame.close      → destroy render
```

Subsystem 可以在内部监听或响应 Frame 生命周期，并主动执行自己的 Render 操作，但这是 Subsystem 实现，不是 Main、Renderer 或公共协议的隐式行为。

因此：

- suspended Frame 对应的内容可以继续显示；
- active Frame 可以没有任何 Render；
- 没有 Frame 的 Subsystem 也可以拥有 Render；
- Frame close 后某个 Render 是否保留由 Subsystem 决定。

## 8. 输入路由

Main 发布唯一当前 Input Target：

```text
systemId
frameId
activationId
```

Renderer 使用该信息选择对应 System Data Connection，并通过 User Input Protocol 向 Subsystem 发送普通输入。

Main 不转发普通输入 Payload，Renderer 也不能根据 Render 层级、焦点或 z-index 自行改变 Input Target。

具体连续输入、离散输入、UI Interaction 和 Sequence 语义由 User Input Protocol 冻结。

## 9. 故障原则

- 初始化失败的目标 Frame 不应进入正式活动栈；
- 栈顶 Frame 所属 Subsystem 异常退出时，可以生成失败结果并尝试恢复调用者；
- 初始 Frame 所属 Subsystem 异常退出时，会话通常失败；
- 某 Subsystem 同时承载多个 Frame 时，Container 失败会使这些 Frame 的输入上下文同时失效；
- Frame 关闭必须有有限期限，但不能通过删除 Renderer Render State 来判断关闭完成；
- Render 是否继续存在不参与 Stack 一致性判定。

## 10. 与其他系统的关系

- [运行时启动与连接建立系统](./runtime-bootstrap-system.md)负责 Subsystem Process / Worker 和连接 Bootstrap；
- [通信系统](./communication-system.md)负责 Main Control 与 User Input Protocol；
- [渲染系统](./rendering-system.md)完全独立维护 Subsystem 发布的 Render；
- [运行承载系统](./runtime-hosting-system.md)负责每 `systemId` 一个 Runtime Container 的平台映射；
- 存储系统提供公共游戏包上下文，但不定义 Frame 业务内容。

## 11. 扩展方向

未来可以评估：

- 可选后台输入上下文；
- 多主栈或更一般的 Frame Graph；
- 不同输入焦点策略；
- Frame 池或输入上下文复用。

这些扩展不能重新把 Render 生命周期隐式绑定到 Frame。

## 12. 架构不变量

1. Frame 是调用与普通 User Input 路由上下文；
2. Frame 不是进程、Worker、业务状态所有权单元或 Render 身份；
3. Main 是 Stack、Activation 和 Input Target 的唯一权威；
4. 默认只有栈顶 active Frame 是普通 Input Target；
5. Activation 只隔离 Frame 输入 / 控制周期，不定义 Render epoch；
6. Frame suspend / resume / close 不产生隐式 Render 操作；
7. Renderer 不根据 Render 层级自行改变 Frame Stack 或 Input Target。

## 13. 相关下层文档

- [生命周期协议草案](../15-contracts/system-lifecycle-protocol.md)；
- [程序主系统模块设计](../20-modules/main-system/README.md)；
- [现有详细设计：程序主系统与模块子系统](../architecture/main-system-and-subsystems.md)。
