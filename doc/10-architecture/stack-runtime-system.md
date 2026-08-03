# 栈式运行系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：调用栈、Frame 生命周期、Activation 和普通输入目标的系统级设计  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)  
> 下层契约：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-03

## 1. 设计目标

栈式运行系统为模块 Subsystem 提供简单、可推理的调用与 ordinary User Input 路由关系：当前 active Frame 可以调用另一个 Subsystem 的新 Frame，被调用 Frame 终止后，调用者恢复并获得 outcome。

Frame 只属于 Main 控制的调用 / 输入模型，不属于 Render 模型，也不承担 Runtime Container lifecycle。

## 2. 职责

- 根据入口建立初始 Frame；
- 维护 Main-owned 单一 LIFO 调用栈；
- 执行 Frame 初始化、暂停、激活、恢复、返回和关闭；
- 决定当前 ordinary Input Target；
- 为 Frame 签发 Activation；
- 拒绝旧 Activation 对应的迟到普通输入；
- 处理 Frame 初始化失败和所属 Runtime 异常退出；
- 向 Renderer 发布调用栈和 Input Target 控制状态。

## 3. 非职责

- 不保存地图、菜单、对话或战斗权威业务状态；
- 不要求业务状态按 Frame 隔离；
- 不执行 Subsystem 内部 Tick；
- 不创建、隐藏、排序或销毁 Render；
- 不生成 Render State、Scope 或 Client Node；
- 不解释调用参数和返回值中的业务字段；
- 不启动、关闭或重启 Runtime Container；
- 不从 DOM / Canvas / WebGL 推断当前 active Frame。

## 4. 核心概念

### Frame

Frame 表示一次由 Main 管理的调用 / ordinary User Input Context，而不是 Process、Worker、业务世界实例或 Render。

当前 Frame 身份关系：

```text
frameId
    Main-generated Session-scoped identity

descriptor.key / subsystemKey
    Frame 创建时永久绑定的 Subsystem identity

callerFrameId
    immutable direct caller；初始 Frame 为 null

lifecycle state
    starting / active / suspended / closing / closed

current activationId
    仅 active Frame 非 null
```

旧数据协议仍可能存在 `systemId` 字段，但新 Frame / Call v1 不使用它建立第二套身份来源。

### Activation

Activation 表示 Frame 的一次 ordinary User Input 有效周期。

冻结语义：

```text
Main-generated
Session-scoped unique
never reused
never resumed
never rolled back
```

Frame 首次 active 以及从子调用恢复时获得新的 Activation。旧 Activation 一旦失效，永远不能重新合法。

Activation 不用于 Render identity、Render Revision、Runtime generation 或 Connection identity。

### Stack

调用栈只记录调用 / ordinary input 关系：

```text
[map-frame]
[map-frame, menu-frame]
[map-frame, menu-frame, dialog-frame]
```

正常稳定状态：

```text
Stack Top
    active

all other live Frames
    suspended
```

Subsystem 业务状态和 Render Registry 始终留在 Subsystem 内部。

## 5. Frame 生命周期

Frame / Call v1 Batch A 已冻结：

```text
starting
→ active
↔ suspended
→ closing
→ closed
```

额外允许：

```text
starting → closing
suspended → closing
```

用于 call-abort、Runtime failure unwind、Session termination 等终止路径。

状态含义：

- `starting`：Frame identity 已分配，正在建立 Frame/Input Context 或等待首次 Activation commit；
- `active`：Stack Top，拥有唯一有效 current Activation，可成为 ordinary Input Target；
- `suspended`：仍 live，但没有有效 Activation，不接收 ordinary input；
- `closing`：终止流程已经由 Main 接受/启动，不再获得普通输入资格；
- `closed`：terminal，`frameId` 不复用。

v1 不存在公共：

```text
Frame ready
Frame initialized
Frame failed lifecycle state
```

`completed / cancelled / failed` 是调用 termination outcome，而不是 lifecycle state。

## 6. Main 权威

Main 是以下状态的唯一权威：

```text
Frame identity
Frame → Subsystem assignment
caller relationship
Frame lifecycle
Stack position
Activation
ordinary Input eligibility
Input Target
```

Subsystem 维护对应内部 Frame/Input Context，但不能自行改变公共 Stack、Activation 或 Input Target。

Renderer 只持有 Main 发布的只读镜像。

## 7. 调用原则

- Frame 只能在目标 Runtime 已 `ready` 且没有 shutdown intent 时建立；
- 只有当前 Stack Top active Frame 可以发起普通调用或返回；
- 被调用 Frame 完成必要 Frame/Input Context 初始化后，才进入后续 Activation/Stack 事务；
- 新 Frame 真正拥有普通输入权时必须有新的 Activation；
- 调用者进入 suspended 后旧 Activation 永久失效；
- 子调用结束后 Caller 恢复必须签发新的 Activation，不能恢复旧 Activation；
- 调用建立成功与最终业务 outcome 是两个阶段；
- 同一 Subsystem 的多个 Frame 可以共用一个 Runtime Container 和 System Data Connection；
- Frame lifecycle 不承担 Runtime spawn / shutdown / restart。

精确 RPC Schema、事务顺序和 rollback 由 Frame / Call Protocol 后续 Batch B/C 冻结。

## 8. Frame 与 Render 的严格边界

Frame 生命周期不定义任何 Render 行为。

以下推导全部禁止作为平台规则：

```text
frame.initialize → create render
frame.activate   → show render
frame.suspend    → hide / freeze render
frame.resume     → restore / resync render
frame.close      → destroy render
```

因此：

- suspended Frame 相关内容可以继续显示；
- active Frame 可以没有任何 Render；
- 没有 Frame 的 Subsystem 也可以拥有 Render；
- Frame close 后 Render 是否保留由 Subsystem 决定；
- `closed` 不等于 Renderer Render Store deleted。

## 9. 输入路由

Main 发布唯一当前 ordinary Input Target，概念上包含：

```text
subsystemKey / descriptor.key reference
frameId
activationId
```

合法 ordinary User Input 至少要求：

```text
Frame exists
AND Frame lifecycle == active
AND activationId == currentActivationId
AND Frame == current Main-authorized Input Target
```

Renderer 使用该信息选择对应 System Data Connection，并通过 User Input Protocol 向 Subsystem 发送普通输入。

旧 Activation 输入必须拒绝。

Main 不转发普通输入 Payload，Renderer 也不能根据 Render 层级、焦点或 z-index 自行改变 Input Target。

具体连续输入、离散输入、UI Interaction、Sequence 和 reset 语义由 User Input Protocol 冻结。

## 10. Frame Outcome

调用结束原因与 Frame Context lifecycle 是两个维度：

```text
Lifecycle
    starting / active / suspended / closing / closed

Outcome
    completed / cancelled / failed
```

即使调用以 `failed` 结果结束，也仍需要通过 `closing → closed` 表达 Frame Context cleanup。

Main 实现不得以 `status = failed` 替代 Frame cleanup lifecycle。

## 11. 故障原则

- 初始化失败的目标 Frame 不应进入正式 active Stack 状态；
- Runtime failure 会使其承载 Frame 的有效 Activation 立即失效；
- 某 Subsystem 同时承载多个 Frame 时，Runtime failure 会同时影响这些 Frame 的权威输入处理能力；
- 多 Frame Runtime failure 的 deterministic stack unwind 算法由 Frame / Call Protocol Batch E 冻结；
- 初始 Frame 无法恢复时 Session 通常失败；
- Frame cleanup 不能通过删除 Renderer Render State 来判断完成；
- Render 是否继续存在不参与 Stack 一致性判定。

## 12. 与其他系统的关系

- [运行时启动与连接建立系统](./runtime-bootstrap-system.md)负责 Runtime Process / Worker 与连接 Bootstrap；
- [Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)负责 Runtime identity、ready、shutdown 与 failure；
- [通信系统](./communication-system.md)负责 Control Plane 与 User Input Protocol 分层；
- [渲染系统](./rendering-system.md)独立维护 Subsystem 发布的 Render；
- [运行承载系统](./runtime-hosting-system.md)负责每 Subsystem 一个 Runtime Container 的平台映射；
- 存储系统提供公共游戏包上下文，但不定义 Frame 业务内容。

## 13. 扩展方向

未来可以评估：

- 可选后台输入上下文；
- 多主栈或更一般的 Frame Graph；
- 不同输入焦点策略；
- Frame migration；
- Frame 池或内部 Context 复用。

这些扩展不得在 v1 中通过复用 `frameId` / `activationId` 或重新绑定 Render 生命周期偷偷实现。

## 14. 架构不变量

1. Frame 是调用与 ordinary User Input 路由上下文；
2. Frame 不是 Process、Worker、业务状态所有权单元或 Render identity；
3. Main 是 Frame、Stack、Activation 和 Input Target 的唯一权威；
4. `frameId` 在 Session 内唯一且永不复用；
5. Frame 创建时永久绑定 `descriptor.key` 与 `callerFrameId`；
6. Frame lifecycle = `starting / active / suspended / closing / closed`；
7. `completed / cancelled / failed` 是 outcome，不是 lifecycle state；
8. v1 没有 Frame `ready / initialized / frame.status`；
9. 只有 active Frame 拥有有效 Activation；
10. Activation 只使用一次，失效后永远不可恢复；
11. 正常稳定状态只有 Stack Top active，其他 live Frame suspended；
12. Frame suspend / resume / close 不产生隐式 Render 操作；
13. Renderer 不根据 Render 层级自行改变 Frame Stack 或 Input Target；
14. Frame 只在 ready 且无 shutdown intent 的 Runtime 上建立。

## 15. 相关下层文档

- [Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)；
- [程序主系统模块设计](../20-modules/main-system/README.md)；
- [旧 Frame 生命周期草案路径（Legacy）](../15-contracts/system-lifecycle-protocol.md)。
