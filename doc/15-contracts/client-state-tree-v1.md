# Client Scoped State Tree v1（Legacy）

> 层级：正式契约  
> 状态：Legacy / Superseded  
> 稳定程度：Frozen Historical  
> 主要定义：旧 Frame-scoped Client State Tree 的退役入口  
> 被替代原因：Render State 已改为 Subsystem-owned Render identity，不再属于 Frame  
> 最近复核：2026-08-02

本路径保留用于旧链接和 Git 历史追溯。**本文不再是新增 Renderer / Render State 实现的 Normative Contract。**

旧 v1 曾冻结：

```text
Frame Client State
└── Scopes
    └── ordered roots
        └── Client Node
```

并使用 `frameId + scopeId`、`frameId + scopeId + key` 作为 Scope / Node identity。该所有权模型已经被当前架构替代。

## 当前有效方向

```text
Subsystem-owned Render Context
└── Render State
    └── Scope / Node
```

Frame 只属于调用 / User Input Context。Render State 的身份、Revision、Scope、Node、Snapshot、Event 与恢复语义将由新的 Render Update Protocol 与 Render State Tree / equivalent contract 冻结。

架构文档可能使用 `renderId` 作为概念占位名，但该名称尚不是冻结 wire 字段。

## 不再有效的 v1 假设

- Scope identity 必须以 `frameId` 开头；
- Node identity 必须以 `frameId` 开头；
- Frame 出栈自动删除全部 Render/Scope Store；
- Frame Activation 控制 Render Revision / Sequence；
- Renderer 逐 Frame Resync 是 Render 恢复的唯一模型；
- 每个 Frame 必须拥有独立 Projector 或 Client State。

## 仍然有效的设计原则

- 声明式目标状态与 DOM / Canvas / WebGL 分离；
- Node 使用稳定 Key 和可信 Tag Registry；
- Data 是受 Schema 约束的 JSON，不是任意 DOM 命令；
- DOM / Scene 不是权威恢复源；
- 资源使用逻辑 Key，通过只读 Content API 获取；
- 状态提交需要校验、Revision 和原子边界。

当前定义见：

- [渲染系统](../10-architecture/rendering-system.md)；
- [通信系统](../10-architecture/communication-system.md)；
- [Renderer–Subsystem 协议分层](../10-architecture/renderer-subsystem-protocol-layers.md)；
- [正式契约目录](./README.md)。

旧 v1 的精确历史 Schema 请通过本文件 Git 历史查阅。