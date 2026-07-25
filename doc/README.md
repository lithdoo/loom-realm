# LoomRealm 开发文档

LoomRealm 文档按“范围与架构、公开契约、内部设计、兼容资料、路线图和历史方案”组织。

阅读前先查看：

- [产品定位与第一阶段范围](./overview/product-scope.md)
- [文档状态与权威来源](./overview/document-status.md)
- [LoomRealm 总体架构](./architecture/system-overview.md)

## 按角色阅读

### 第一次了解 LoomRealm

```text
产品定位与第一阶段范围
→ 总体架构
→ 游戏包契约 v1
```

- [产品定位与第一阶段范围](./overview/product-scope.md)
- [LoomRealm 总体架构](./architecture/system-overview.md)
- [游戏包契约 v1](./contracts/game-package-v1.md)

### 实现 Runtime

```text
总体架构
→ 游戏启动与内容加载
→ Session Coordinator
→ Runtime Execution Loop
→ Runtime Core
→ Pokémon Essentials 地图兼容
```

- [游戏启动与异步内容加载](./game-package/phase-1-game-loading.md)
- [第一阶段 Session Coordinator](./runtime/phase-1-session-coordinator.md)
- [第一阶段 Runtime Execution Loop](./runtime/phase-1-runtime-execution-loop.md)
- [第一阶段 Runtime Core](./runtime/phase-1-runtime-core.md)
- [Pokémon Essentials v21.1 地图与行走运行时](./runtime/phase-1-pokemon-essentials-map-runtime.md)

### 实现 Web Client 或通信层

```text
Client State 协议
→ Client State Projector
→ Runtime RPC
→ Web Client 状态协调与 DOM 呈现
```

- [Client Scoped State Tree 协议](./architecture/client-state-tree-protocol.md)
- [第一阶段 Client State Projector](./architecture/client-state-projector.md)
- [运行时通信与状态同步](./architecture/runtime-rpc-and-state-sync.md)
- [Web Client 状态协调与 DOM 呈现](./design/web-client-reconciliation.md)

### 实现游戏包、FSDB 或转换工具

```text
游戏包契约 v1
→ FSDB 基础格式
→ Pokémon Essentials 兼容
→ 游戏启动与内容加载
```

- [游戏包契约 v1](./contracts/game-package-v1.md)
- [FSDB 文件存储系统目录结构详解](./fsdb/FSDB目录结构详解.md)
- [Pokémon Essentials v21.1 地图与行走运行时](./runtime/phase-1-pokemon-essentials-map-runtime.md)
- [游戏启动与异步内容加载](./game-package/phase-1-game-loading.md)

### 实现桌面运行方式

- [Hostra 桌面客户端宿主架构](./architecture/hostra-desktop-client-host.md)
- [运行时通信与状态同步](./architecture/runtime-rpc-and-state-sync.md)
- [Web Client 状态协调与 DOM 呈现](./design/web-client-reconciliation.md)

### 查看当前计划

- [第一阶段设计待办](./roadmap/phase-1-design-todos.md)
- [文档状态与权威来源](./overview/document-status.md)

路线图和待办只用于追踪未关闭事项，不替代正式契约或设计。

## 文档分层

```text
overview/
    产品范围、系统入口和文档治理

contracts/
    跨模块和对外必须遵守的规范

architecture/
    系统级设计、Client State、RPC 和宿主边界

design/
    组件实现设计

game-package/
    内容打开、索引和加载设计

runtime/
    Runtime Core、Execution Loop、Session 和兼容运行时

fsdb/
    FSDB 基础资料和历史设计

roadmap/
    当前待办和开放事项

renderer/
    被新 Web Client 协调设计替代的历史入口
```

## 当前权威文档

| 主题 | 文档 |
|---|---|
| 第一阶段范围 | [产品定位与第一阶段范围](./overview/product-scope.md) |
| 总体模块和数据流 | [LoomRealm 总体架构](./architecture/system-overview.md) |
| 游戏包公开契约 | [游戏包契约 v1](./contracts/game-package-v1.md) |
| 游戏加载和 Repository | [游戏启动与异步内容加载](./game-package/phase-1-game-loading.md) |
| Runtime 调度 | [Runtime Execution Loop](./runtime/phase-1-runtime-execution-loop.md) |
| Runtime 权威规则 | [Runtime Core](./runtime/phase-1-runtime-core.md) |
| Session 协调 | [Session Coordinator](./runtime/phase-1-session-coordinator.md) |
| Client State 数据结构 | [Client Scoped State Tree 协议](./architecture/client-state-tree-protocol.md) |
| Client State 生成 | [Client State Projector](./architecture/client-state-projector.md) |
| Runtime 通信 | [运行时通信与状态同步](./architecture/runtime-rpc-and-state-sync.md) |
| Web Client 呈现 | [Web Client 状态协调与 DOM 呈现](./design/web-client-reconciliation.md) |
| 地图兼容和 FSDB Profile | [Pokémon Essentials v21.1 地图与行走运行时](./runtime/phase-1-pokemon-essentials-map-runtime.md) |
| 桌面宿主 | [Hostra 桌面客户端宿主架构](./architecture/hostra-desktop-client-host.md) |

完整状态和替代关系见 [文档状态与权威来源](./overview/document-status.md)。

## 文档维护原则

1. 同一设计只有一个主要定义位置；其他文档通过链接引用。
2. 产品范围、契约、内部设计、路线图和历史方案必须分层。
3. `Superseded` 文档不得作为当前实现依据。
4. 重大变更需要同步更新权威文档、文档状态和路线图。
5. 代码、Schema 和配置示例应尽可能由自动检查验证。
6. 专题文档不得重新定义第一阶段总体范围。
7. 游戏包第一阶段只读，Save System 暂缓。
8. Runtime Core 不执行文件或网络 I/O。
9. Runtime Execution Loop 是 Core 的唯一写入口。
10. Runtime 内部状态不直接序列化给客户端。
11. Client State 使用 Scope 和通用节点树。
12. Web Client 不读取原始 FSDB，也不把 DOM 作为权威状态来源。