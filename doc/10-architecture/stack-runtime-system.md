# 栈式运行系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：调用栈、Frame 生命周期、Activation 和普通输入目标的系统级设计  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)  
> 下层契约：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. 设计目标

栈式运行系统为模块 Subsystem 提供简单、可推理的调用与 ordinary User Input 路由关系：当前 active Frame 可以调用另一个 Subsystem 的新 Frame，被调用 Frame 终止后，调用者恢复并获得 outcome。

Frame 只属于 Main 控制的调用 / 输入模型，不属于 Render 模型，也不承担 Runtime Container lifecycle。

## 2. 职责

- 根据入口建立初始 Frame；
- 维护 Main-owned 单一 LIFO 调用栈；
- 执行 Frame initialize / activate / suspend / resume / close；
- 接受 active Frame 的 call / return；
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

Activation 表示 Frame 的一次 ordinary User Input 有效周期：Main-generated、Session-scoped unique、never reused / resumed / rolled back。

Frame 首次 active 以及从子调用恢复时获得新的 Activation。旧 Activation 一旦失效，永远不能重新合法。

Activation 不用于 Render identity、Render Revision、Runtime generation 或 Connection identity。

### Stack

调用栈只记录调用 / ordinary input 关系：

```text
[map-frame]
[map-frame, menu-frame]
[map-frame, menu-frame, dialog-frame]
```

稳定状态：Stack Top = active；所有其他 live Frame = suspended。

## 5. Frame 生命周期

Frame / Call v1 Batch A 已冻结：

```text
starting → active ↔ suspended → closing → closed
```

额外允许 `starting → closing`、`suspended → closing`，用于 call-abort、Runtime failure unwind、Session termination。

- `starting`：Frame identity 已分配，正在建立 Frame/Input Context 或等待首次 Activation commit；
- `active`：Stack Top，拥有唯一有效 current Activation；
- `suspended`：仍 live，无有效 Activation；
- `closing`：终止流程已由 Main 接受/启动；
- `closed`：terminal，`frameId` 不复用。

v1 没有 Frame `ready / initialized / failed lifecycle state`。`completed / cancelled / failed` 是 termination outcome。

## 6. Main 权威

Main 是 Frame identity、Frame→Subsystem、caller relationship、lifecycle、Stack、Activation、ordinary Input eligibility 与 Input Target 的唯一权威。

Subsystem 维护内部 Frame/Input Context，但不能自行改变公共 Stack、Caller、Activation 或 Input Target；Renderer 只持有 Main 发布的只读镜像。

## 7. Frozen RPC Surface

Frame / Call v1 Batch B 已冻结完整方法集合：

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

全部七个方法都是 JSON-RPC Request。

系统级约束：

- `callerFrameId` 留在 Main Registry，不下发给 `frame.initialize` / `frame.return`；
- source Subsystem identity 来自认证后的 Control Connection；
- `frame.call` 只显式指定 `targetSubsystemKey`；
- `frame.close` 不携带 reason；
- `frame.resume` 同时交付 Child Outcome 与 replacement Activation；
- `frame.call` 只建立 Child call，不等待最终业务结果；
- Child 最终 outcome 通过 `frame.return → Main → frame.resume` 交付；
- v1 不存在 `system.call / system.return / frame.result`。

Batch C 只继续冻结这些 RPC 之间的事务顺序、commit barrier 与 rollback，不再改变字段。

## 8. 调用原则

- Frame 只能在目标 Runtime `ready` 且没有 shutdown intent 时建立；
- 只有当前 Stack Top active Frame 可以 `frame.call / frame.return`；
- `frame.initialize` 成功只建立 Frame/Input Context，不代表 active；
- `frame.activate` 安装首次 Activation；
- Caller suspended 后旧 Activation 永久失效；
- Child 结束后 Caller 通过 `frame.resume` 同时收到 outcome 与新 Activation；
- 调用建立与最终业务 outcome 是两个阶段；
- same-Subsystem call 也必须建立新的 `childFrameId`，但复用现有 Runtime Container；
- Frame lifecycle 不承担 Runtime spawn / shutdown / restart。

## 9. Frame 与 Render 的严格边界

以下推导全部禁止：

```text
frame.initialize → create render
frame.activate   → show render
frame.suspend    → hide / freeze render
frame.resume     → restore / resync render
frame.close      → destroy render
```

因此 suspended Frame 可以继续显示内容，active Frame 可以没有 Render，零 Frame Subsystem 可以拥有 Render，Frame close 不等于 Render Store deleted。

## 10. 输入路由

Main 发布唯一 current ordinary Input Target，概念上包含：

```text
subsystemKey / descriptor.key reference
frameId
activationId
```

合法 ordinary User Input 至少要求：Frame exists、lifecycle == active、`activationId == currentActivationId`、Frame == Main-authorized Input Target。

Renderer 根据该目标选择对应 System Data Connection；旧 Activation 必须拒绝。Main 不转发普通输入 Payload，Renderer 不能根据 Render 层级或焦点自行改变 Input Target。

## 11. Frame Outcome

Batch B wire outcome：

```text
completed(value required; no value => null)
cancelled
failed(error)
```

Outcome 与 lifecycle 是两个维度。即使 outcome = failed，Frame Context 仍需通过 `closing → closed` cleanup。

`FrameOutcome.failed` 不等于 JSON-RPC Error。

## 12. 故障原则

- initialize 失败的目标 Frame 不应进入 active；
- Runtime failure 使其承载 Frame 的有效 Activation 立即失效；
- 多 Frame Runtime failure 的 deterministic stack unwind 由 Batch E 冻结；
- 初始 Frame 无法恢复时 Session 通常失败；
- Frame cleanup 不能通过删除 Renderer Render State 判断完成；
- Render 是否继续存在不参与 Stack 一致性判定。

## 13. 与其他系统的关系

- Runtime Bootstrap 系统负责 Process / Worker 与连接 Bootstrap；
- Subsystem Control v1 负责 Runtime identity、ready、shutdown、failure；
- 通信系统负责 Control Plane 与 User Input Protocol 分层；
- 渲染系统独立维护 Subsystem-owned Render；
- 运行承载系统负责每 Subsystem 一个 Runtime Container；
- Content 系统不定义 Frame 业务内容。

## 14. 扩展方向

未来可评估后台输入上下文、多主栈/Frame Graph、不同焦点策略、Frame migration、内部 Context 复用。这些扩展不得通过复用 `frameId / activationId` 或重新绑定 Render 生命周期偷偷实现。

## 15. 架构不变量

1. Frame 是调用与 ordinary User Input Context；
2. Main 是 Frame、Stack、Activation、Input Target 唯一权威；
3. `frameId` Session 内唯一且不复用；
4. Frame 永久绑定 `descriptor.key` 与 Main-owned `callerFrameId`；
5. lifecycle = `starting / active / suspended / closing / closed`；
6. outcome = `completed / cancelled / failed`；
7. v1 无 Frame `ready / initialized / frame.status`；
8. 只有 active Frame 拥有有效 Activation；Activation revoke 后永久失效；
9. Batch B wire surface exactly seven JSON-RPC Requests；
10. Caller relationship 不进入 Subsystem Frame wire；
11. `frame.resume` = outcome delivery + replacement Activation；
12. `frame.call` 不是 long-running result RPC；
13. stable Stack 只有 Top active；
14. Frame lifecycle 不控制 Runtime、Render 或 Data Connection。

## 16. 相关下层文档

- [Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)；
- [程序主系统模块设计](../20-modules/main-system/README.md)；
- [旧 Frame 生命周期草案路径（Legacy）](../15-contracts/system-lifecycle-protocol.md)。
