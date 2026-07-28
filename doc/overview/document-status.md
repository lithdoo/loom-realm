# LoomRealm 文档状态与权威来源

> 状态：**Active / Normative**  
> 最近复核：2026-07-28

本文档记录 LoomRealm 当前文档的生命周期状态和主题权威来源。

## 1. 状态定义

| 状态 | 含义 |
|---|---|
| **Normative** | 对外或跨进程必须遵守的契约、范围或协议。 |
| **Active Design** | 当前有效的内部设计，允许随实现演进。 |
| **Reference** | 背景资料和基础规范，不单独决定 LoomRealm 行为。 |
| **Tracking** | 路线图、待办和开放问题，不替代正式设计。 |

## 2. 单一真相源

| 主题 | 主要定义位置 |
|---|---|
| 产品定位和第一阶段范围 | [`product-scope.md`](./product-scope.md) |
| 总体架构 | [`../architecture/system-overview.md`](../architecture/system-overview.md) |
| 程序主系统、调用栈和模块子系统 | [`../architecture/main-system-and-subsystems.md`](../architecture/main-system-and-subsystems.md) |
| 游戏包目录、入口文件和安全边界 | [`../contracts/game-package-v1.md`](../contracts/game-package-v1.md) |
| JSON-RPC、Frame 消息和状态同步 | [`../architecture/runtime-rpc-and-state-sync.md`](../architecture/runtime-rpc-and-state-sync.md) |
| Client State、Scope 和 Node 数据结构 | [`../architecture/client-state-tree-protocol.md`](../architecture/client-state-tree-protocol.md) |
| 子系统 Client State 投影 | [`../architecture/client-state-projector.md`](../architecture/client-state-projector.md) |
| Web 渲染端 Store、输入路由和 DOM 呈现 | [`../design/web-client-reconciliation.md`](../design/web-client-reconciliation.md) |
| Hostra 桌面进程与通道 | [`../architecture/hostra-desktop-client-host.md`](../architecture/hostra-desktop-client-host.md) |
| 游戏包打开、Catalog 和 Repository | [`../game-package/phase-1-game-loading.md`](../game-package/phase-1-game-loading.md) |
| 地图子系统 Core 权威状态与规则 | [`../runtime/phase-1-runtime-core.md`](../runtime/phase-1-runtime-core.md) |
| 地图子系统 Tick、队列和 Effect Barrier | [`../runtime/phase-1-runtime-execution-loop.md`](../runtime/phase-1-runtime-execution-loop.md) |
| 地图子系统异步内容协调 | [`../runtime/phase-1-session-coordinator.md`](../runtime/phase-1-session-coordinator.md) |
| Pokémon Essentials 地图兼容和 FSDB Profile | [`../runtime/phase-1-pokemon-essentials-map-runtime.md`](../runtime/phase-1-pokemon-essentials-map-runtime.md) |
| 当前开放事项 | [`../roadmap/phase-1-design-todos.md`](../roadmap/phase-1-design-todos.md) |

## 3. 当前文档清单

### 3.1 入口与范围

| 文档 | 状态 | 说明 |
|---|---|---|
| [`../README.md`](../README.md) | Active Design | 文档入口和角色化阅读路径。 |
| [`product-scope.md`](./product-scope.md) | Normative | 第一阶段总体范围。 |
| [`document-status.md`](./document-status.md) | Normative | 文档状态和权威来源。 |
| [`../architecture/system-overview.md`](../architecture/system-overview.md) | Active Design | 总体架构入口。 |
| [`../architecture/main-system-and-subsystems.md`](../architecture/main-system-and-subsystems.md) | Active Design | 程序主系统、调用栈和模块子系统核心模型。 |

### 3.2 公开契约

| 文档 | 状态 | 说明 |
|---|---|---|
| [`../contracts/game-package-v1.md`](../contracts/game-package-v1.md) | Normative | 游戏包、`realm.entry.json` 和路径安全。 |
| [`../architecture/client-state-tree-protocol.md`](../architecture/client-state-tree-protocol.md) | Normative | Frame Client State、Scope 和 Node。 |

### 3.3 通信、客户端与宿主

| 文档 | 状态 | 说明 |
|---|---|---|
| [`../architecture/runtime-rpc-and-state-sync.md`](../architecture/runtime-rpc-and-state-sync.md) | Active Design | JSON-RPC 控制面、数据面、Sequence 和恢复。 |
| [`../architecture/client-state-projector.md`](../architecture/client-state-projector.md) | Active Design | 子系统本地投影、Revision 和发布选择。 |
| [`../design/web-client-reconciliation.md`](../design/web-client-reconciliation.md) | Active Design | Stack/Frame/Scope Store、输入路由和 DOM。 |
| [`../architecture/hostra-desktop-client-host.md`](../architecture/hostra-desktop-client-host.md) | Active Design | Hostra 程序主系统、子系统进程和 MessagePort。 |

### 3.4 游戏包、地图子系统和兼容

| 文档 | 状态 | 说明 |
|---|---|---|
| [`../game-package/phase-1-game-loading.md`](../game-package/phase-1-game-loading.md) | Active Design | 游戏包公共加载和地图子系统内容加载。 |
| [`../runtime/phase-1-runtime-core.md`](../runtime/phase-1-runtime-core.md) | Active Design | 内置 `loom.map` 子系统内部 Core。 |
| [`../runtime/phase-1-runtime-execution-loop.md`](../runtime/phase-1-runtime-execution-loop.md) | Active Design | 内置 `loom.map` 子系统内部调度。 |
| [`../runtime/phase-1-session-coordinator.md`](../runtime/phase-1-session-coordinator.md) | Active Design | 内置 `loom.map` 子系统内部异步协调。 |
| [`../runtime/phase-1-pokemon-essentials-map-runtime.md`](../runtime/phase-1-pokemon-essentials-map-runtime.md) | Active Design | 地图兼容和 FSDB Profile。 |
| [`../fsdb/FSDB目录结构详解.md`](../fsdb/FSDB目录结构详解.md) | Reference | 通用 FSDB 基础格式。 |

### 3.5 路线图

| 文档 | 状态 | 说明 |
|---|---|---|
| [`../roadmap/phase-1-design-todos.md`](../roadmap/phase-1-design-todos.md) | Tracking | 未关闭事项，不替代正式设计。 |

## 4. 重要作用域规则

以下结论用于解决旧术语可能造成的误解：

1. `Runtime Core`、`Runtime Execution Loop` 和 `Session Coordinator` 当前只属于第一阶段内置地图子系统；
2. 它们不是程序主系统的固定模块，也不是其他模块子系统必须实现的接口；
3. 程序主系统的固定核心只有游戏入口、子系统调用栈、进程生命周期和通信通道；
4. 各模块子系统自行维护内部权威状态和 Client State Projector；
5. 普通输入和 Scope 状态由子系统直接与渲染端通信；
6. 程序主系统只通过控制面管理 Frame 和输入目标。

任何文档使用“Runtime”一词时，应说明它是平台主系统还是具体子系统内部 Runtime。未说明时不得将地图子系统内部设计推广为平台固定结构。

## 5. 冲突解决顺序

1. `Normative` 文档；
2. 主题对应的单一真相源；
3. `Active Design`；
4. `Reference`；
5. `Tracking`。

相同等级文档冲突时，必须更新主要定义文档并消除冲突，不能长期依赖提交时间形成隐式优先级。

## 6. 文档头部要求

新增或大幅修改的规范与设计文档应在标题后包含：

```text
状态
适用范围
最近复核日期
主要定义主题
相关文档
```

## 7. 退役和迁移规则

文档被新设计替代时：

1. 将仍有效结论迁移到新权威文档；
2. 更新入口、状态表和交叉引用；
3. 删除旧文件或将其明确重构为局部实现文档；
4. 在提交或 PR 中说明替代关系；
5. 通过 Git 历史追溯旧方案。

## 8. 维护规则

重大设计变更必须：

1. 更新主要定义文档；
2. 更新直接依赖的专题文档；
3. 更新本注册表；
4. 更新路线图；
5. 删除或修正失效内容；
6. 验证内部链接和 JSON 示例；
7. 确保程序主系统和模块子系统的职责没有再次混合。