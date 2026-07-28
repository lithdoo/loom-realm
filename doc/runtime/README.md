# 第一阶段地图子系统内部设计

> 状态：**Active Design**  
> 适用范围：内置 `loom.map` 模块子系统  
> 最近复核：2026-07-28

本目录中的 Runtime 文档只描述第一阶段内置地图子系统的内部实现。

```text
loom.map 子系统
├── Session Coordinator
├── Runtime Execution Loop
├── Runtime Core
├── Pokémon Essentials 地图兼容层
└── 地图 Client State Projector
```

这些组件不是 LoomRealm 程序主系统的固定模块，也不是其他模块子系统必须实现的公共接口。

平台级核心设计见：

- [程序主系统与模块子系统架构](../architecture/main-system-and-subsystems.md)
- [JSON-RPC 通信与客户端状态同步](../architecture/runtime-rpc-and-state-sync.md)
- [Client Scoped State Tree 协议](../architecture/client-state-tree-protocol.md)

## 文档

- [第一阶段地图子系统 Runtime Core](./phase-1-runtime-core.md)
- [第一阶段地图子系统 Runtime Execution Loop](./phase-1-runtime-execution-loop.md)
- [第一阶段地图子系统 Session Coordinator](./phase-1-session-coordinator.md)
- [Pokémon Essentials v21.1 地图与行走运行时](./phase-1-pokemon-essentials-map-runtime.md)

## 作用域规则

1. 程序主系统通过 `system.initialize/suspend/resume/close` 管理 `loom.map` Frame。
2. Renderer 直接把地图输入发送给地图子系统。
3. 地图子系统内部通过 Execution Loop 驱动 Runtime Core。
4. 地图子系统自行生成和发布 `world`、`hud`、`loading` 等 Scope。
5. 地图子系统可以通过程序主系统调用其他模块子系统，但其他系统不进入地图 Core。
6. 调用栈、`frameId` 和 `activationId` 由程序主系统维护，不属于地图 Runtime State。