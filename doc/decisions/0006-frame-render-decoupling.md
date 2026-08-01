# ADR 0006：Frame 与 Render 生命周期解耦

> 状态：Accepted  
> 日期：2026-08-02  
> 影响范围：Frame Stack、Renderer–Subsystem 协议、Render State、Web Renderer、Subsystem 模型  
> 部分替代：[ADR 0004：Client State 渲染流水线](./0004-client-state-rendering-pipeline.md) 中的 Frame-scoped Render 归属假设

## 背景

旧设计把 Frame 同时视为：

- 一次子系统调用实例；
- User Input 路由身份；
- 权威业务状态隔离单元；
- Client State / Scope 所有权单元；
- Renderer Store 和 Event 队列的生命周期单元。

这导致 Render 生命周期被隐式绑定到调用栈。例如 Frame suspend 时“保留画面”，Frame close 时“删除全部 Scope”，Activation 变化时重新建立 State Stream。

但实际业务并不满足这个一一对应关系：

- 非栈顶 Frame 相关内容可以继续显示；
- Subsystem 可以在 Frame 入栈前显示 Loading / Background；
- Frame close 后某些 Render 可以继续存在；
- 一个 Frame 可能影响多个 Render；
- 多个 Frame 可能操作同一个共享业务世界；
- Subsystem 可以在没有任何 Frame 时仍有 Render。

因此 Frame 不能继续作为公共 Render identity。

## 考虑过的方案

### 保持 Frame-owned Render

优点：身份和恢复模型简单；Frame close 可以自动清理 UI。

代价：把 Input / Call 生命周期强行变成 Render 生命周期；无法表达独立 Overlay、Background、共享世界和 Frame 外 Render。

### Frame 与 Render 仍关联，但增加 visible / detached 标志

优点：对旧协议改动较小。

代价：仍然保留错误的所有权模型；复杂情况会不断增加例外状态。

### Frame 与 Render 完全解耦

优点：Main、Subsystem、Renderer 职责清晰；Render 可以独立演进；User Input 和 Render 可以拥有不同顺序、恢复和故障语义。

代价：Renderer–Subsystem 数据协议和 Client State Tree 需要不兼容迁移；Subsystem 如需要 Frame→Render 关系必须自己维护。

## 决定

采用完全解耦模型。

### Frame

Frame 是 Main 管理的调用 / User Input Context：

```text
frameId
systemId
caller relationship
stack status
activationId
input eligibility
```

Frame 不再是平台强制的业务状态、Projector、Render Store 或 Render Event 所有权单元。

### Render

Render 是 Subsystem 管理的独立呈现上下文：

```text
systemId + renderId
```

Subsystem 完全控制：

```text
create
update
order
visibility
event
destroy
recovery
```

Main 不维护 Render Registry。Renderer 不从 Frame Stack 推导 Render。

## 禁止的隐式规则

公共平台不再定义：

```text
frame.initialize → create render
frame.activate   → show render
frame.suspend    → hide / freeze render
frame.resume     → restore render
frame.close      → destroy render
```

Subsystem 可以内部根据 Frame 生命周期手动执行 Render 操作，但必须显式通过自身业务逻辑和 Render Update Protocol 完成。

## 协议影响

Renderer–Subsystem System Data Connection 继续按 `systemId` 建立，但连接内部业务域拆为：

```text
Render Update Protocol
    renderId-oriented

User Input Protocol
    frameId + activationId-oriented
```

两者共享 Transport，但不共享 identity、Sequence、Revision、Resync 或生命周期。

旧 `frame-data-channel-v1` 中把 State / Event 放进 `FrameMessageBase` 的设计需要迁移。

旧 Client State Tree 中：

```text
frameId + scopeId
frameId + scopeId + key
```

需要迁移为 Render-oriented identity。

## ADR 0004 保留的部分

ADR 0004 的核心渲染流水线仍然有效：

```text
Subsystem declarative target state
→ Renderer Store
→ Render Scheduler
→ DOM / Canvas / WebGL
```

继续保留：

- Renderer Store 是恢复目标；
- DOM / Scene 是派生结果；
- State 先提交 Store 再呈现；
- 声明式 Node 使用可信 Renderer Registry；
- State 与一次性 Event 分离；
- Renderer 可以做非权威视觉插值。

本 ADR 只替代“这些 State / Store 必须属于 Frame”的结论。

## 结果

- Frame Stack 只控制调用和普通 Input Target；
- Frame suspend / close 不再影响 Render；
- Subsystem 可以拥有无 Frame Render；
- Main 不需要知道 `renderId`；
- Renderer 需要独立的 Render Registry / Store 和 Frame Input Registry；
- Render 恢复不能通过 Frame Resync 推导；
- 跨 System Render Composition 需要独立设计，而不能复用 Frame Stack z-order。

## 重新评估条件

- Render identity 被证明没有独立生命周期需求；
- 引入完全不同的远程像素流 Profile；
- Renderer Composition 需要新的全局 Scene Graph；
- User Input 不再使用 Main Frame Stack 模型。
