# LoomRealm 开发文档

本目录保存 LoomRealm 的总体架构、游戏包规范、内容加载、运行时、客户端、桌面宿主、开发计划和技术决策。

## 从这里开始

- [LoomRealm 总体架构](./architecture/system-overview.md)
- [第一阶段游戏包规范](./game-package/phase-1-game-package-specification.md)
- [第一阶段游戏启动与异步内容加载](./game-package/phase-1-game-loading.md)
- [第一阶段 Session Coordinator](./runtime/phase-1-session-coordinator.md)

总体架构定义系统模块、职责边界和主要运行流程。游戏包规范定义 `loom-realm start <game-directory>` 接受的只读目录契约。异步内容加载文档定义 Loader 与 Repository。Session Coordinator 文档定义异步内容准备、统一暂停和 Runtime 原子提交之间的协调边界。

## 文档层级

```text
总体架构
├── 游戏包与 CLI 公开契约
├── 内容加载与 Session 协调
├── 系统架构与通信边界
├── 运行时专题设计
├── 客户端渲染专题设计
└── 路线图与设计待办
```

阅读专题文档前，应先以总体架构中的模块职责和边界为准。

## 文档原则

1. 讨论结论应沉淀为结构化开发文档，而不是仅保留在聊天记录中。
2. 总体架构只说明模块和边界，专题文档负责目录格式、数据结构、异步加载、算法和实现约束。
3. 同一设计只保留一个主要定义位置，其他文档通过引用建立关系。
4. 重大变更需要同步更新总体架构、相关专题文档和设计待办。
5. 游戏包在运行期间只读。
6. 启动时只读取游戏身份、轻量索引和入口场景，不把整个游戏读入内存。
7. 地图和人物由异步 Repository 按需加载，Repository 负责缓存。
8. Session Coordinator 只负责协调，不实现游戏规则、缓存或资源传输。
9. Runtime Core 不执行文件 I/O，并以同步事务维护权威状态。
10. 手动暂停、过场暂停和加载暂停共享统一暂停语义。
11. 图片资源由 Web Client 通过 Runtime Service 按资源 Key 请求。
12. LoomRealm 不提供游戏内容编辑器或项目创作接口。
13. 存档系统暂缓，不进入第一阶段闭环。

## 当前文档

### 核心架构

- [LoomRealm 总体架构](./architecture/system-overview.md)
- [第一阶段游戏包规范](./game-package/phase-1-game-package-specification.md)
- [第一阶段游戏启动与异步内容加载](./game-package/phase-1-game-loading.md)
- [第一阶段 Session Coordinator](./runtime/phase-1-session-coordinator.md)

### 系统架构

- [运行时通信与状态同步](./architecture/runtime-rpc-and-state-sync.md)
- [Hostra 桌面客户端宿主架构](./architecture/hostra-desktop-client-host.md)

### 运行时

- [第一阶段 Session Coordinator](./runtime/phase-1-session-coordinator.md)
- [第一阶段 Pokémon Essentials v21.1 地图与行走运行时](./runtime/phase-1-pokemon-essentials-map-runtime.md)
- [第一阶段人物行走与碰撞运行时](./runtime/phase-1-walking-and-collision.md)

### 客户端渲染

- [第一阶段 DOM 渲染与渲染状态](./renderer/phase-1-dom-rendering.md)

### 游戏静态数据与 FSDB

- [第一阶段项目 FSDB 数据模型](./fsdb/phase-1-project-fsdb-design.md)
- [FSDB 文件存储系统目录结构详解](./fsdb/FSDB目录结构详解.md)

### 开发计划

- [第一阶段：FSDB 驱动的地图运行时原型](./roadmap/phase-1-fsdb-map-runtime.md)
- [第一阶段设计待办](./roadmap/phase-1-design-todos.md)

## 建议目录结构

```text
doc/
├── README.md
├── architecture/
├── game-package/
├── cli/
├── fsdb/
├── import-build/
├── runtime/
├── renderer/
├── testing/
├── roadmap/
├── save/
└── decisions/
```

后续专题文档应优先归入职责明确的目录。游戏包生产工具、运行时、客户端和桌面宿主设计不得混写为编辑器能力。