# LoomRealm 开发文档

LoomRealm 文档按“范围与入口、程序主系统与子系统、公开契约、子系统内部设计、客户端呈现、兼容与路线图”组织。

阅读前先查看：

- [产品定位与第一阶段范围](./overview/product-scope.md)
- [文档状态与权威来源](./overview/document-status.md)
- [LoomRealm 总体架构](./architecture/system-overview.md)
- [程序主系统与模块子系统架构](./architecture/main-system-and-subsystems.md)

## 按角色阅读

### 第一次了解 LoomRealm

```text
产品定位与第一阶段范围
→ 总体架构
→ 程序主系统与模块子系统
→ 游戏包契约 v1
```

- [产品定位与第一阶段范围](./overview/product-scope.md)
- [LoomRealm 总体架构](./architecture/system-overview.md)
- [程序主系统与模块子系统架构](./architecture/main-system-and-subsystems.md)
- [游戏包契约 v1](./contracts/game-package-v1.md)

### 实现程序主系统

```text
程序主系统与模块子系统
→ JSON-RPC 通信与状态同步
→ 游戏包入口
→ Hostra 桌面宿主
```

- [程序主系统与模块子系统架构](./architecture/main-system-and-subsystems.md)
- [JSON-RPC 通信与客户端状态同步](./architecture/runtime-rpc-and-state-sync.md)
- [游戏包契约 v1](./contracts/game-package-v1.md)
- [Hostra 桌面程序主系统与渲染宿主](./architecture/hostra-desktop-client-host.md)

### 实现模块子系统

```text
子系统调用协议
→ 子系统 Client State Projector
→ Client Scoped State Tree
→ JSON-RPC 数据面
```

- [程序主系统与模块子系统架构](./architecture/main-system-and-subsystems.md)
- [模块子系统 Client State Projector](./architecture/client-state-projector.md)
- [Client Scoped State Tree 协议](./architecture/client-state-tree-protocol.md)
- [JSON-RPC 通信与客户端状态同步](./architecture/runtime-rpc-and-state-sync.md)

### 实现第一阶段地图子系统

```text
游戏启动与内容加载
→ 地图子系统 Session Coordinator
→ 地图子系统 Execution Loop
→ 地图子系统 Runtime Core
→ Pokémon Essentials 地图兼容
```

- [第一阶段游戏启动与异步内容加载](./game-package/phase-1-game-loading.md)
- [第一阶段地图子系统 Session Coordinator](./runtime/phase-1-session-coordinator.md)
- [第一阶段地图子系统 Runtime Execution Loop](./runtime/phase-1-runtime-execution-loop.md)
- [第一阶段地图子系统 Runtime Core](./runtime/phase-1-runtime-core.md)
- [Pokémon Essentials v21.1 地图与行走运行时](./runtime/phase-1-pokemon-essentials-map-runtime.md)

这些 Runtime 文档只定义内置 `loom.map` 子系统的内部实现，不是所有模块子系统必须遵守的平台接口。

### 实现 Web 渲染端

```text
调用栈镜像和输入目标
→ Frame/Scope Store
→ Scope Tree 协调
→ DOM 呈现
```

- [JSON-RPC 通信与客户端状态同步](./architecture/runtime-rpc-and-state-sync.md)
- [Client Scoped State Tree 协议](./architecture/client-state-tree-protocol.md)
- [Web 渲染端 Frame/Scope 状态协调与 DOM 呈现](./design/web-client-reconciliation.md)

### 实现游戏包、FSDB 或转换工具

- [游戏包契约 v1](./contracts/game-package-v1.md)
- [第一阶段游戏启动与异步内容加载](./game-package/phase-1-game-loading.md)
- [FSDB 文件存储系统目录结构详解](./fsdb/FSDB目录结构详解.md)
- [Pokémon Essentials v21.1 地图与行走运行时](./runtime/phase-1-pokemon-essentials-map-runtime.md)

### 查看当前计划

- [第一阶段设计待办](./roadmap/phase-1-design-todos.md)
- [文档状态与权威来源](./overview/document-status.md)

路线图只用于追踪未关闭事项，不替代正式契约或设计。

## 文档分层

```text
overview/
    产品范围、系统入口和文档治理

contracts/
    游戏包和其他公开规范

architecture/
    程序主系统、子系统协议、Client State、RPC 和宿主边界

design/
    渲染端等组件实现设计

game-package/
    游戏包打开、索引和内容加载设计

runtime/
    第一阶段地图子系统内部 Runtime 设计

fsdb/
    FSDB 基础格式与参考资料

roadmap/
    当前待办和开放事项
```

## 当前权威文档

| 主题 | 文档 |
|---|---|
| 第一阶段范围 | [产品定位与第一阶段范围](./overview/product-scope.md) |
| 总体架构 | [LoomRealm 总体架构](./architecture/system-overview.md) |
| 程序主系统、调用栈和子系统 | [程序主系统与模块子系统架构](./architecture/main-system-and-subsystems.md) |
| 游戏包和入口文件 | [游戏包契约 v1](./contracts/game-package-v1.md) |
| JSON-RPC 与状态同步 | [JSON-RPC 通信与客户端状态同步](./architecture/runtime-rpc-and-state-sync.md) |
| Client State 数据结构 | [Client Scoped State Tree 协议](./architecture/client-state-tree-protocol.md) |
| 子系统状态投影 | [模块子系统 Client State Projector](./architecture/client-state-projector.md) |
| Web 渲染端 | [Web 渲染端 Frame/Scope 状态协调与 DOM 呈现](./design/web-client-reconciliation.md) |
| 桌面宿主 | [Hostra 桌面程序主系统与渲染宿主](./architecture/hostra-desktop-client-host.md) |
| 地图子系统内部 Runtime | [地图子系统 Runtime Core](./runtime/phase-1-runtime-core.md) |
| 地图兼容和 FSDB Profile | [Pokémon Essentials 地图运行时](./runtime/phase-1-pokemon-essentials-map-runtime.md) |

完整状态见 [文档状态与权威来源](./overview/document-status.md)。

## 文档维护原则

1. 同一设计只有一个主要定义位置，其他文档通过链接引用。
2. 程序主系统的固定职责仅限调用栈、进程生命周期和通信通道。
3. 模块子系统内部实现不得被误写为平台固定模块。
4. 子系统控制面统一使用 JSON-RPC，普通输入和 Scope 数据面直接连接渲染端。
5. Scope 属于具体 Frame，完整身份为 `frameId + scopeId`。
6. 游戏包第一阶段只读，Save System 暂缓。
7. 子系统不得把内部状态或物理文件路径直接序列化给客户端。
8. Web 渲染端不把 DOM 作为权威状态来源。
9. 被替代文档从当前文档树删除，历史通过 Git 追溯。
10. 重大变更必须同步更新权威文档、状态表和路线图。