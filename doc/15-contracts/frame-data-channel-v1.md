# Renderer–Subsystem 数据协议 v1（Legacy）

> 层级：正式契约  
> 状态：Legacy / Superseded  
> 稳定程度：Frozen Historical  
> 主要定义：旧 Frame-scoped Renderer–Subsystem 数据协议的退役入口  
> 被替代原因：Render 已从 Frame 生命周期中解耦，数据面拆分为 Connection / Render Update / User Input 三个独立协议域  
> 最近复核：2026-08-04

本路径只用于旧链接和 Git 历史追溯。**不得使用本文继续设计或实现新的 Renderer–Subsystem 数据协议。**

旧 v1 曾采用：

```text
每 System 一条物理 Transport
└── 多个 frameId + activationId Logical Stream
    ├── User Input
    ├── Client State / Scope
    └── Event / Resync
```

“每 Subsystem一个物理 Data Transport”仍是当前方向；但把 Render State/Event/Recovery放进 Frame Logical Stream的模型已经失效。

## 当前有效模型

```text
Renderer ⇄ Subsystem Runtime Container

Connection Layer
    Subsystem-level connection / auth / version / lifetime

Render Update Protocol
    Subsystem-owned Render identity
    Render State / Event / Recovery

User Input Protocol
    Main-authorized frameId + activationId
```

三者共享物理 Data Connection，但 identity、Sequence、backpressure与 recovery语义独立。

当前概念定义见：

- [通信系统](../10-architecture/communication-system.md)；
- [Renderer–Subsystem 协议分层](../10-architecture/renderer-subsystem-protocol-layers.md)；
- [渲染系统](../10-architecture/rendering-system.md)；
- [Frame / Call Protocol v1](./frame-call-protocol-v1.md)。

## 不再有效的旧假设

不得恢复：

- Render State必须属于 Frame；
- Render Sequence必须属于 `frameId + activationId`；
- Frame close自动清理 Render Store；
- Activation变化开启 Render epoch；
- Renderer reload必须逐 Frame state.resync恢复 Render；
- UI/Node identity必须以 Frame为所有权前缀；
- Frame Control timeout/divergence可通过 Data reconnect/resync修复；
- Batch E whole-suffix Frame unwind自动删除对应健康 Runtime的 Render；
- Data Plane参与 `failedRuntimeKeys`、unwind root、logical Frame retirement或 surviving Caller resume；
- failed Runtime的 Data reconnect可以取消 Main已经开始的 Frame unwind。

## 仍保留的架构结论

- 物理数据连接粒度是 Subsystem，不是 Frame；
- 一个 Runtime Container可以承载多个 Frame/Input Context和多个 Render Context；
- Frame suspend/resume/close/unwind不关闭健康 Runtime的共享物理 Transport；
- ordinary User Input和 Render Update不通过 Main转发；
- Frame Stack recovery authority只在 Main，Render/Data recovery属于独立协议域。

旧 v1 精确历史字段请通过 Git 历史查阅；当前分支不再重复发布已被上层架构否定的 Normative Schema。
