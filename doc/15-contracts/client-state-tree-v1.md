# Client Scoped State Tree v1（Legacy）

> 层级：正式契约  
> 状态：Legacy / Superseded  
> 稳定程度：Frozen Historical  
> 主要定义：旧 Frame-scoped Client State Tree 的退役入口  
> 被替代原因：Render State 已改为 Subsystem-owned Render Domain，不再属于 Frame  
> 最近复核：2026-08-08

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
Subsystem Runtime
└── 0..N Render Domains
    ├── domainId
    ├── zIndex
    └── 0..N ordered roots
        └── Render Node
            ├── key
            ├── tag
            ├── attrs
            ├── data
            └── ordered children[]
```

当前 Domain identity：

```text
subsystemKey + domainId
```

Frame 只属于调用 / User Input Context；Render Domain 的身份、lifecycle、snapshot/recovery与 Node Tree精确 wire将由新的 Render Update Protocol v1 与 Render Tree Contract v1 冻结。

Domain Host不是 Render Node，因此 Domain可以拥有多个 roots，不需要为协议强制创建无业务语义的 container root。

## 不再有效的旧 v1 假设

- Scope identity 必须以 `frameId` 开头；
- Node identity 必须以 `frameId` 开头；
- Frame 出栈自动删除全部 Render/Scope Store；
- Frame Activation 控制 Render Revision / Sequence；
- Renderer 逐 Frame Resync 是 Render 恢复的唯一模型；
- 每个 Frame 必须拥有独立 Projector 或 Client State；
- 旧 Scope/Revision 字段必须被新协议保留。

## 仍然有效并已演进的设计原则

- 声明式目标状态与 DOM / Canvas / WebGL 分离；
- Render ownership属于 Subsystem，不属于 Frame；
- Node 使用稳定 Key 和可信 Tag/Component Registry；
- Node key当前设计为 Domain Tree-wide unique reconciliation identity；
- Tag是逻辑 Renderer Component type，不是任意 DOM tag；
- Data 是受约束的 JSON，不是任意 DOM 命令或 executable callback；
- roots/children 是 ordered relation；
- DOM / Scene / Component实例不是权威恢复源；
- 资源使用逻辑 Key，通过只读 Content API 获取；
- Domain State需要校验和原子提交边界；
- Renderer MAY按 stable key本地 diff/reconciliation，但这不表示 wire Tree Patch已冻结；
- 是否需要 Revision必须由新 Render Update closure证明，不从 Legacy v1自动继承。

当前定义见：

- [渲染系统](../10-architecture/rendering-system.md)；
- [通信系统](../10-architecture/communication-system.md)；
- [Renderer–Subsystem 协议分层](../10-architecture/renderer-subsystem-protocol-layers.md)；
- [正式契约目录](./README.md)。

旧 v1 的精确历史 Schema 请通过本文件 Git 历史查阅。
