# 第一阶段 DOM 渲染与渲染状态（已替代）

> 状态：**Superseded**  
> 替代文档：[`../design/web-client-reconciliation.md`](../design/web-client-reconciliation.md)  
> 替代日期：2026-07-25

本文档形成于 Client Scoped State Tree 和 Client State Projector 冻结之前，其中使用固定地图、玩家和运行状态 DTO 描述客户端状态。

当前 Web Client 实现必须以以下文档为准：

- [Client Scoped State Tree 协议](../architecture/client-state-tree-protocol.md)
- [第一阶段 Client State Projector](../architecture/client-state-projector.md)
- [运行时通信与状态同步](../architecture/runtime-rpc-and-state-sync.md)
- [Web Client 状态协调与 DOM 呈现](../design/web-client-reconciliation.md)
- [Pokémon Essentials v21.1 地图与行走运行时](../runtime/phase-1-pokemon-essentials-map-runtime.md)

当前边界为：

```text
Runtime / Session Snapshot
→ Client State Projector
→ Scoped Client State Tree
→ Runtime RPC
→ Client Store
→ Scope Tree Reconciler
→ DOM / CSS
```

Web Client 不读取原始 FSDB，不解释原始 Tile ID，也不把 DOM 或动画状态作为权威游戏状态来源。

历史内容已由 Git 版本记录保留。本页不再保存可能与当前通用 Client State 协议冲突的旧方案全文。