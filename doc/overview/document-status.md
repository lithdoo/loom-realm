# LoomRealm 文档状态与权威来源

> 状态：**Active / Normative**  
> 最近复核：2026-07-25

本文档记录 LoomRealm 当前文档的生命周期状态和主题权威来源。已经失效或被替代的文档不保留在当前文档树中，历史内容通过 Git 提交记录追溯。

## 1. 状态定义

| 状态 | 含义 |
|---|---|
| **Normative** | 对外或跨模块必须遵守的契约、范围或协议。 |
| **Active Design** | 当前有效的内部设计，允许随实现演进。 |
| **Reference** | 背景资料、基础规范或快速查询内容，不单独决定 LoomRealm 行为。 |
| **Tracking** | 路线图、待办和开放问题，不替代正式设计。 |

文档状态不代表内容质量，而表示它在当前设计体系中的用途。

## 2. 单一真相源

| 主题 | 主要定义位置 |
|---|---|
| 产品定位和第一阶段范围 | [`product-scope.md`](./product-scope.md) |
| 总体系统模块与数据流 | [`../architecture/system-overview.md`](../architecture/system-overview.md) |
| 游戏包目录、清单和安全边界 | [`../contracts/game-package-v1.md`](../contracts/game-package-v1.md) |
| 游戏启动、Catalog 和 Repository | [`../game-package/phase-1-game-loading.md`](../game-package/phase-1-game-loading.md) |
| Pokémon Essentials v21.1 兼容和 LoomRealm FSDB Profile | [`../runtime/phase-1-pokemon-essentials-map-runtime.md`](../runtime/phase-1-pokemon-essentials-map-runtime.md) |
| Runtime Core 权威状态与规则 | [`../runtime/phase-1-runtime-core.md`](../runtime/phase-1-runtime-core.md) |
| Core 调度、Tick、队列和 Effect Barrier | [`../runtime/phase-1-runtime-execution-loop.md`](../runtime/phase-1-runtime-execution-loop.md) |
| Session 状态和异步地图准备 | [`../runtime/phase-1-session-coordinator.md`](../runtime/phase-1-session-coordinator.md) |
| Client State 数据结构 | [`../architecture/client-state-tree-protocol.md`](../architecture/client-state-tree-protocol.md) |
| Client State 投影、Revision 和发布选择 | [`../architecture/client-state-projector.md`](../architecture/client-state-projector.md) |
| Runtime RPC、Sequence、事件和恢复 | [`../architecture/runtime-rpc-and-state-sync.md`](../architecture/runtime-rpc-and-state-sync.md) |
| Web Client Store、节点协调和 DOM 呈现 | [`../design/web-client-reconciliation.md`](../design/web-client-reconciliation.md) |
| Hostra 桌面集成 | [`../architecture/hostra-desktop-client-host.md`](../architecture/hostra-desktop-client-host.md) |
| 当前第一阶段开放事项 | [`../roadmap/phase-1-design-todos.md`](../roadmap/phase-1-design-todos.md) |

## 3. 当前文档清单

### 3.1 入口与范围

| 文档 | 状态 | 说明 |
|---|---|---|
| [`../README.md`](../README.md) | Active Design | 文档入口和角色化阅读路径。 |
| [`product-scope.md`](./product-scope.md) | Normative | 第一阶段总体范围的唯一主要定义位置。 |
| [`document-status.md`](./document-status.md) | Normative | 文档状态和权威来源注册表。 |
| [`../architecture/system-overview.md`](../architecture/system-overview.md) | Active Design | 系统总体架构和模块边界。 |

### 3.2 游戏包、内容和兼容

| 文档 | 状态 | 说明 |
|---|---|---|
| [`../contracts/game-package-v1.md`](../contracts/game-package-v1.md) | Normative | 第一阶段游戏包公开契约。 |
| [`../game-package/phase-1-game-loading.md`](../game-package/phase-1-game-loading.md) | Active Design | Loader、Catalog、Repository 和分层校验。 |
| [`../runtime/phase-1-pokemon-essentials-map-runtime.md`](../runtime/phase-1-pokemon-essentials-map-runtime.md) | Active Design | 当前 Pokémon Essentials 兼容与 FSDB Profile 基准。 |
| [`../fsdb/FSDB目录结构详解.md`](../fsdb/FSDB目录结构详解.md) | Reference | 通用 FSDB 基础格式；LoomRealm Profile 由兼容文档和游戏包契约约束。 |

### 3.3 Runtime

| 文档 | 状态 | 说明 |
|---|---|---|
| [`../runtime/phase-1-runtime-core.md`](../runtime/phase-1-runtime-core.md) | Active Design | 权威状态、命令、Tick、Event 和 Effect。 |
| [`../runtime/phase-1-runtime-execution-loop.md`](../runtime/phase-1-runtime-execution-loop.md) | Active Design | Core 唯一写入口、固定 Tick、队列和屏障。 |
| [`../runtime/phase-1-session-coordinator.md`](../runtime/phase-1-session-coordinator.md) | Active Design | 会话状态和异步内容准备。 |

### 3.4 Client State、通信和呈现

| 文档 | 状态 | 说明 |
|---|---|---|
| [`../architecture/client-state-tree-protocol.md`](../architecture/client-state-tree-protocol.md) | Normative | Client State、Scope 和 Node 数据结构。 |
| [`../architecture/client-state-projector.md`](../architecture/client-state-projector.md) | Active Design | 投影、Revision、原子提交和 Projection Scheduler。 |
| [`../architecture/runtime-rpc-and-state-sync.md`](../architecture/runtime-rpc-and-state-sync.md) | Active Design | 消息顺序、状态/事件边界和恢复语义。 |
| [`../design/web-client-reconciliation.md`](../design/web-client-reconciliation.md) | Active Design | Client Store、Scope Tree 协调、资源和本地表现状态。 |
| [`../architecture/hostra-desktop-client-host.md`](../architecture/hostra-desktop-client-host.md) | Active Design | 桌面宿主、进程和安全边界。 |

### 3.5 路线图

| 文档 | 状态 | 说明 |
|---|---|---|
| [`../roadmap/phase-1-design-todos.md`](../roadmap/phase-1-design-todos.md) | Tracking | 只用于追踪未关闭问题，不替代正式设计。 |

## 4. 冲突解决顺序

当多个当前文档出现冲突时，按以下顺序判断：

1. `Normative` 文档；
2. 主题对应的单一真相源；
3. `Active Design` 文档；
4. `Reference`；
5. `Tracking`。

相同等级的当前文档发生冲突时，不应依靠提交时间长期维持隐式优先级。必须更新权威文档并在本注册表中记录关系。

## 5. 文档头部要求

新增或大幅修改的规范与设计文档应在标题后包含：

```text
状态
适用范围
最近复核日期
主要定义主题
相关文档
```

## 6. 文档退役规则

文档被新的规范或设计替代时：

1. 先把仍然有效的结论迁移到新的权威文档；
2. 更新所有入口、状态表和交叉引用；
3. 从当前文档树删除旧文件；
4. 在提交信息或 PR 描述中说明删除原因和替代文档；
5. 使用 Git 历史追溯旧方案，不保留可能被误读为当前规范的跳转页。

## 7. 维护规则

重大设计变更必须：

1. 更新主要定义文档；
2. 更新直接依赖该定义的专题文档；
3. 更新本注册表；
4. 更新路线图或开放问题；
5. 删除已经失效或被替代的旧文档；
6. 验证所有内部链接和示例。
