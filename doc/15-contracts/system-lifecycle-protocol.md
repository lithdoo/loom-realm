# Main ⇄ Subsystem Frame 生命周期与调用协议草案

> 层级：正式契约  
> 状态：Draft  
> 稳定程度：Experimental  
> 主要定义：已 ready Subsystem 中 Frame/Input Context 的创建、Activation、调用、返回与关闭边界  
> 依赖：[栈式运行系统](../10-architecture/stack-runtime-system.md)、[模块子系统模型](../10-architecture/subsystem-model.md)、[Main ⇄ Subsystem 控制与运行时生命周期协议 v1](./subsystem-control-lifecycle-protocol.md)  
> 最近复核：2026-08-02

本文只定义 **Frame / Call Control** 的待冻结边界。

Runtime Container Bootstrap、Subsystem identity 和 ready 状态已经由独立 [Control / Runtime Lifecycle Protocol v1](./subsystem-control-lifecycle-protocol.md) 接管，不再由本文定义。

Frame 只代表调用 / User Input Context。本文不定义 Render 创建、可见性、销毁、Render Snapshot、Render Revision 或 Renderer Store 生命周期。

## 1. 前置条件

建立任何 Frame 前：

```text
Game Entry 已声明目标 Subsystem
→ 目标 Runtime Container 已由 Bootstrap 启动
→ Control Connection 已 identified
→ Subsystem 已进入 ready
```

Frame 调用不得承担“首次启动 Subsystem”的职责。Desktop MVP 中所有声明 Subsystem 已在 Game Bootstrap 阶段 eager 启动。

## 2. 参与方

- LoomRealm Main；
- 已 ready 的 Subsystem Runtime Container；
- Runtime Container 内由 Subsystem 自己实现的 Frame/Input Context；
- Renderer 只通过 Main Control Plane 获得 Stack / Activation / Input Target，并通过 User Input Protocol 发送普通输入。

Renderer Data Connection 的认证、Render Update 和 User Input wire schema 不由本文定义。

## 3. Frame 核心身份

概念身份：

```text
frameId
    一次调用 / 输入上下文

activationId
    Frame 的一次普通输入有效周期

callerFrameId
    调用者 Frame；初始 Frame 为 null

Subsystem reference
    Frame 所属 Subsystem/System
```

现有旧协议可能使用 `systemId`。Descriptor `key` 与该字段的最终统一方式由后续协议版本冻结。

进程 ID、Worker 名称、Connection ID 或 Render identity 不能代替 `frameId`。

## 4. Frame 不拥有的公共状态

平台不要求每个 Frame 拥有：

```text
独立业务 World State
Runtime Core
Execution Loop
Client/Render State Projector
Render Context
Render Revision / Scope
Renderer Store
System Data Connection
```

Subsystem 可以内部为某个 Frame 创建这些对象，但它们不是 Frame Protocol 的公共所有权语义。

## 5. Frame 概念状态

当前架构状态：

```text
starting
→ active
↔ suspended
→ closing
→ closed

starting / active / suspended / closing
→ failed
```

如果最终 wire protocol 需要额外 `ready` 状态，必须只表达“Frame/Input Context 已完成必要初始化，可被 Main 激活”，不能隐含“首次 Render Snapshot 已生成”。

## 6. Frame 初始化

概念操作：

```text
frame.initialize(frameId, callerFrameId, input, contentContext?)
```

Subsystem 必须：

- 验证公共和业务调用参数；
- 建立能够接收该 Frame 输入的内部上下文；
- 能够在后续 Activation 下校验输入资格；
- 初始化失败时释放本次调用建立的局部资源。

Subsystem **不需要**为了 Frame initialize：

- 创建 Render；
- 发布 Render Snapshot；
- 建立新的 System Data Connection；
- 为 Frame 创建独立业务世界或 Projector。

目标 Frame 初始化失败时不进入正式活动栈，所属 Runtime Container 可以继续服务其他 Frame/Input Context。

## 7. Activation

Main 为 Frame 首次激活或从子调用恢复时签发新的 `activationId`。

概念操作：

```text
frame.activate(frameId, activationId)
frame.suspend(frameId, activationId)
frame.resume(frameId, newActivationId, returnedFrameId, result)
```

Activation 只隔离 Frame 的普通输入 / 控制周期：

- 旧 Activation 的普通输入必须拒绝；
- suspend 后该 Frame 不再是普通 Input Target；
- resume 使用新的 Activation；
- Activation 改变不产生 Render epoch；
- Activation 改变不要求 Render resync；
- suspend 不要求 Subsystem 停止业务 Tick 或隐藏 Render。

## 8. 调用建立

只有当前栈顶 active Frame 可以发起普通调用。

概念请求：

```text
system.call(targetSubsystem, input)
```

Main 处理：

```text
验证调用者是当前有效 Input/Call Context
→ 确认目标 Subsystem 已在 Game Entry 声明且 Runtime ready
→ 分配 newFrameId
→ 在现有目标 Runtime Container 内 frame.initialize
→ Frame/Input Context 初始化成功
→ 暂停调用者输入资格
→ 新 Frame 入栈
→ 为新 Frame 签发 Activation
→ 发布新的 Stack / Input Target
```

调用建立不：

- 启动新的 Subsystem Process / Worker；
- 为目标 Frame创建独立物理 Renderer Transport；
- 等待首次 Render Snapshot；
- 隐式创建或显示 Render。

调用请求的成功只表示子调用已建立，不包含最终业务结果。

同一 Runtime Container 可以同时承载多个 Frame/Input Context。

## 9. 返回

Frame 返回统一结果：

```text
completed(value)
cancelled
failed(error)
```

只有当前栈顶 active Frame 可以执行普通返回。

概念事务：

```text
停止当前 Frame 普通输入资格
→ 标记 closing
→ 从调用栈移除
→ 通知 Subsystem frame.close
→ 为调用者签发新 Activation
→ frame.resume(callerFrameId, returnedFrameId, result)
→ 更新 Stack / Input Target
```

Frame 返回或关闭不自动：

- 关闭 Runtime Container；
- 关闭 System Data Connection；
- 删除任何 Render；
- 清理 Renderer Render Store；
- 停止 Subsystem 的共享业务状态。

## 10. Frame 关闭

`frame.close` 只终止该 Frame/Input Context 的公共生命周期。

Subsystem 应：

- 停止接受该 Frame 的新普通输入；
- 取消、隔离或完成该 Frame 自己拥有的未完成异步控制工作；
- 删除 Frame Input Handler / routing state；
- 释放该 Frame 明确拥有的局部资源；
- 不影响同 Runtime Container 内其他 Frame；
- 不根据平台规则删除 Render。

如果 Subsystem 内部选择让某个 Frame 拥有某个 Render，它可以在业务实现中显式销毁该 Render，但这种关系不进入公共 Frame Protocol。

关闭后的 `frameId` 不应在同一会话重新使用。

## 11. User Input 关系

Main Control Plane 发布当前 Input Target，概念上包含：

```text
Subsystem/System reference
frameId
activationId
```

普通 User Input 不通过 Main Payload 转发，而由 Renderer 经目标 Subsystem 的 System Data Connection 和 User Input Protocol 发送。

Frame Protocol 只负责决定哪个 Frame/Activation 有输入资格；连续意图、离散输入、Sequence、UI Interaction 和 reset 语义由 User Input Protocol 单独冻结。

## 12. Render 关系

Frame Protocol 不定义：

```text
frame.initialize → render.create
frame.activate   → render.show
frame.suspend    → render.hide
frame.resume     → render.resync
frame.close      → render.destroy
```

Render Update Protocol 使用独立 Render identity 和独立恢复语义。

因此：

```text
not input target ≠ not rendered
not in Frame Stack ≠ not rendered
Frame closed ≠ Render deleted
```

## 13. Runtime Container 故障

Runtime Container 退出或 Control Protocol 报告 terminal failure 时：

```text
Main 标记 Subsystem failed / stopped
→ 该 Subsystem 的 System Data Connection 失效
→ 停止相关 Frame 普通输入
→ 找出该 Runtime Container 承载的受影响 Frame
→ 按调用栈规则生成 failed result 或使 Session failed
```

如果同一 Container 同时承载多个 Frame，故障会使这些 Frame 的输入上下文同时失去权威处理方；具体多 Frame 调用链展开算法仍需冻结。

Renderer Render Store 不是业务状态恢复源。

## 14. Renderer 重连

Renderer 重载不关闭 Main、Runtime Container 或 Frame/Input Context。

恢复拆成两条独立链：

```text
Main Control
→ 恢复 Frame Stack / Activation / Input Target

System Data / User Input
→ 根据 Main Grant 恢复目标 Subsystem Connection
→ 恢复 Frame 输入路由

Render Update
→ 各 Subsystem 独立恢复 Render State
```

禁止：

```text
从有效 Frame 集合推导所有需要存在的 Subsystem Data Connection
逐 Frame state.resync 作为 Render 恢复模型
Frame Store 重建 = Render 恢复
```

## 15. 待冻结问题

本文仍需冻结：

- Frame initialize / activate / suspend / resume / close 的最终 JSON Schema；
- `system.call` / return 的最终方法与结果 Envelope；
- 是否保留独立 Frame `ready` wire state；
- 幂等性、重复请求和错误码；
- Frame 初始化、关闭和调用超时；
- 调用取消与会话取消；
- 多 Frame Runtime failure 的调用链展开；
- Frame Control Protocol 与 Main ⇄ Renderer Control 更新的原子关系；
- PWA Transport Profile 下相同语义的映射。

以下问题不再属于本文开放范围：

- Runtime Container Bootstrap / identity / ready；
- Renderer Data Connection 与 Frame Snapshot 的顺序；
- Frame Client State / Scope；
- Render Revision / Resync；
- Render visibility / lifecycle。

## 16. 冻结条件

转为 Normative 前至少需要：

- Frame / Call JSON Schema；
- 状态转换表；
- Activation 语义；
- 幂等、超时、取消与错误码；
- 三层嵌套调用测试；
- 同一 Subsystem 多 Frame 测试；
- 旧 Activation 输入拒绝测试；
- Frame close 不改变 Render / System Data Connection 的测试；
- Runtime Container failure 的调用链测试；
- Desktop / PWA Transport-independent fixture。

## 17. 相关文档

- [Main ⇄ Subsystem Control & Runtime Lifecycle Protocol v1](./subsystem-control-lifecycle-protocol.md)；
- [栈式运行系统](../10-architecture/stack-runtime-system.md)；
- [模块子系统模型](../10-architecture/subsystem-model.md)；
- [通信系统](../10-architecture/communication-system.md)；
- [Renderer–Subsystem 协议分层](../10-architecture/renderer-subsystem-protocol-layers.md)。