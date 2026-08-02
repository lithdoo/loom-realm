# Renderer–Subsystem 数据协议 v1（Legacy）

> 层级：正式契约  
> 状态：Legacy / Superseded  
> 稳定程度：Frozen Historical  
> 主要定义：旧 Frame-scoped Renderer–Subsystem 数据协议的退役入口  
> 被替代原因：Render 已从 Frame 生命周期中解耦，数据面拆分为 Connection / Render Update / User Input 三个独立协议域  
> 最近复核：2026-08-02

本路径保留用于旧链接和 Git 历史追溯。**不得使用本文路径继续设计或实现新的 Renderer–Subsystem 数据协议。**

旧 v1 曾采用：

```text
每 System 一条物理 Transport
└── 多个 frameId + activationId Logical Stream
    ├── User Input
    ├── Client State / Scope
    └── Event / Resync
```

其中“每 System 一个物理 Transport”仍是当前架构方向；但把 Render State、Event、Revision、Scope 和恢复都放进 Frame Logical Stream 的模型已经被 [Frame 与 Render 生命周期解耦](../decisions/0006-frame-render-decoupling.md) 替代。

## 当前有效模型

```text
Renderer ⇄ Subsystem Runtime Container

Connection Layer
    System-level connection / auth / version / lifetime

Render Update Protocol
    Subsystem-owned Render identity
    Render State / Event / Recovery

User Input Protocol
    frameId + activationId
    User Input / UI Interaction
```

三者共享每 Subsystem 一条物理 System Data Connection，但业务身份、Sequence、背压和恢复语义相互独立。

当前概念定义见：

- [通信系统](../10-architecture/communication-system.md)；
- [Renderer–Subsystem 协议分层](../10-architecture/renderer-subsystem-protocol-layers.md)；
- [渲染系统](../10-architecture/rendering-system.md)；
- [正式契约目录](./README.md)。

## 不再有效的 v1 假设

以下旧语义不得作为新增设计依据：

- Render State 必须属于 Frame；
- Render Sequence 必须属于 `frameId + activationId`；
- Frame close 自动清理 Renderer Render Store；
- Frame Activation 变化开启 Render epoch；
- Renderer 重载必须逐 Frame `state.resync` 才能恢复 Render；
- UI / Node identity 必须以 Frame 为所有权前缀。

## 仍然保留的架构结论

- 物理数据连接粒度是 Subsystem/System，不是 Frame；
- 一个 Runtime Container 可以承载多个 Frame/Input Context；
- Frame suspend / resume / close 不关闭共享物理 Transport；
- 普通 User Input 和 Render Update 不通过 Main 转发。

旧 v1 的精确历史字段请通过本文件的 Git 历史查阅；当前分支不再重复发布已被上层架构否定的 Normative Schema。