# Client Scoped State Tree v1

> 层级：正式契约  
> 状态：Active / Normative  
> 稳定程度：Evolving  
> 主要定义：Client State Tree v1 的权威入口与稳定边界  
> 依赖：[渲染系统](../10-architecture/rendering-system.md)、[模块子系统模型](../10-architecture/subsystem-model.md)、[Frame 数据通道 v1](./frame-data-channel-v1.md)  
> 最近复核：2026-08-01

本页是 Client State Tree v1 的契约入口。完整字段、校验和事件定位当前仍由现有协议文档定义：

- [Client Scoped State Tree 协议](../architecture/client-state-tree-protocol.md)

Frame 数据连接的方法、Sequence、Activation、背压和 Resync 由 [Frame 数据通道 v1](./frame-data-channel-v1.md) 定义。

## 1. 已冻结边界

```text
Frame Client State
└── Scopes
    └── ordered roots
        └── Client Node
            ├── key
            ├── tag
            ├── data
            └── children
```

第一阶段冻结：

- Scope 完整身份是 `frameId + scopeId`；
- Node 完整身份是 `frameId + scopeId + key`；
- Key 在整个 Scope 内唯一并保持业务身份稳定；
- Tag 必须来自渲染端可信 Registry；
- Data 是 JSON 目标状态，不是 DOM、Canvas 或 WebGL 操作指令；
- Children 表达直接子节点和顺序；
- 一个 Client Node 对应一个可信视图组件实例；
- 组件实例可以使用 DOM、Canvas 或 WebGL 作为呈现后端；
- Client Node 不要求每个 Tile、角色或粒子成为 DOM Element；
- Frame 出栈时删除其全部 Scope；
- 暂停 Frame 的 Scope 可以继续显示；
- 协议不允许任意 HTML、脚本、CSS 代码或物理文件路径。

## 2. 状态消息

第一阶段支持：

- 完整 Frame `state.snapshot`；
- 单 Scope `scope.replace`；
- `value: null` 删除 Scope；
- `state.resync` 请求完整状态；
- `event.emit` 表示一次性客户端事件。

一个投影事务同时改变多个 Scope 时，应发送完整 Frame Snapshot。第一阶段不定义节点级 Patch 或多 Scope Batch Patch。

## 3. 版本维度

必须区分：

- Frame Client State Revision；
- Scope Revision；
- Frame 数据连接方向 Sequence；
- Frame Activation；
- 物理连接 Connection ID。

较旧 Revision 不能覆盖较新状态；无法确认 Sequence 连续性时请求完整 Snapshot。新连接可以重置 Sequence，但 State Revision 可以保持。

## 4. 状态与事件

- Scope State 表示当前应该呈现什么，可通过 Snapshot 恢复；
- Event 表示一次性发生的表现行为，不能替代可恢复界面状态；
- State 可以在未发送或未呈现前合并为最新目标；
- Event 通常需要有序、有界处理；
- Frame 出栈后，其迟到 State 和 Event 不得影响其他 Frame。

## 5. 资源引用

Client Node Data 可以包含逻辑资源引用：

```text
resourceKey + contentVersion
```

资源主体通过 [只读 Content API v1](./content-api-v1.md) 获取，不进入 Client State Tree 或 Frame 数据通道。

Client State 不携带 Content token、绝对 URL、本机路径或资源字节。

## 6. Renderer 应用原则

Renderer 必须：

```text
校验完整消息和 Scope Tree
→ 原子提交 Frame/Scope Store
→ 标记需要呈现的 Scope
→ 在 Render Scheduler 中协调 DOM / Canvas / WebGL
```

验证失败时保留旧 Store，并请求 Resync。DOM 或 Scene 不能作为恢复源。

## 7. 后续迁移

后续将现有完整协议逐节迁入本目录，并保留旧路径作为 Legacy 链接。迁移完成前，如本页与现有 Normative 协议的精确字段定义冲突，以现有 Normative 协议的字段 Schema 为准；如涉及通道方法、Sequence、Activation、背压或 Resync，则以 Frame 数据通道 v1 为准，并同步修正冲突文档。
