# LoomRealm 设计文档

LoomRealm 文档按照从粗到细的依赖顺序组织：

```text
产品目标与范围
→ 系统架构
→ 正式契约
→ 模块设计
→ 实施计划
```

上层文档说明为什么以及必须保持什么；下层文档说明当前准备怎样实现。

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md)
2. [文档分层与变更规则](./00-overview/document-governance.md)
3. [系统架构总览](./10-architecture/system-overview.md)
4. [运行承载系统](./10-architecture/runtime-hosting-system.md)
5. [通信系统](./10-architecture/communication-system.md)
6. [Renderer–Subsystem 数据协议 v1](./15-contracts/frame-data-channel-v1.md)
7. [渲染系统](./10-architecture/rendering-system.md)
8. [只读 Content API v1](./15-contracts/content-api-v1.md)
9. [模块设计目录](./20-modules/README.md)
10. [实施计划目录](./30-implementation/README.md)

## 当前核心结论

```text
每个 systemId
    一个 Runtime Container
    一条 Main Control Connection
    一条 Renderer Data Connection

桌面 Runtime Container
    独立 OS Process
    Renderer Data Connection = localhost WebSocket

PWA Runtime Container
    Dedicated Worker
    Renderer Data Connection = MessagePort

每个 Frame
    Container 内独立业务实例
    独立 Activation、Projector、Revision 和 Logical Stream
    不拥有独立物理 WebSocket / MessagePort
```

通信分为：

```text
控制面
    Main ⇄ Runtime Container
    Main ⇄ Renderer

System 数据面
    Runtime Container ⇄ Renderer
    每 System 一条物理 Transport
    连接内多路复用 Frame Logical Stream

内容面
    Runtime Container / Renderer ⇄ Readonly Content Service
```

桌面使用 localhost WebSocket 和 HTTP；PWA 使用 MessagePort、Service Worker 和 OPFS。不同平台必须保持相同协议语义。

## 00 · 产品总览

只定义产品目标、适用范围、第一阶段边界、长期原则和发展方向。

- [产品设计总览](./00-overview/product-vision.md)
- [文档分层与变更规则](./00-overview/document-governance.md)

产品层不记录具体包名、类名、RPC 字段、Tick 参数或 Tile 格式。

## 10 · 系统架构

围绕产品中的各个系统说明设计目标、职责、非职责、状态所有权和系统关系。

- [系统架构总览](./10-architecture/system-overview.md)
- [栈式运行系统](./10-architecture/stack-runtime-system.md)
- [运行承载系统](./10-architecture/runtime-hosting-system.md)
- [通信系统](./10-architecture/communication-system.md)
- [渲染系统](./10-architecture/rendering-system.md)
- [存储与内容系统](./10-architecture/storage-system.md)
- [模块子系统模型](./10-architecture/subsystem-model.md)

## 15 · 正式契约

定义不同实现必须共同遵守的协议、数据和版本语义。

- [正式契约目录](./15-contracts/README.md)
- [模块子系统生命周期与调用协议草案](./15-contracts/system-lifecycle-protocol.md)
- [Renderer–Subsystem 数据协议 v1](./15-contracts/frame-data-channel-v1.md)
- [Client Scoped State Tree v1](./15-contracts/client-state-tree-v1.md)
- [游戏包契约 v1](./15-contracts/game-package-v1.md)
- [只读 Content API v1](./15-contracts/content-api-v1.md)
- [资源交付协议草案](./15-contracts/resource-protocol.md)

## 20 · 模块设计

将系统拆解为内部模块，并明确依赖方向、不变量和测试边界。

- [模块设计目录](./20-modules/README.md)
- [程序主系统模块](./20-modules/main-system/README.md)
- [Web 渲染端模块](./20-modules/web-renderer/README.md)
- [游戏包与内容模块](./20-modules/game-package/README.md)
- [FSDB Content Service](./20-modules/fsdb-content-service/README.md)
- [`loom.map` 地图子系统](./20-modules/loom-map/README.md)
- [Hostra 桌面宿主模块](./20-modules/desktop-host/README.md)
- [PWA 宿主模块](./20-modules/pwa-host/README.md)

地图 Runtime Core、Execution Loop、Session Coordinator 和 Pokémon Essentials 兼容层只属于 `loom.map`，不是所有模块子系统必须实现的平台接口。

## 30 · 实施计划

描述当前准备如何分包、测试和按阶段落地。

- [实施计划目录](./30-implementation/README.md)
- [仓库与分包方案](./30-implementation/repository-layout.md)
- [测试策略](./30-implementation/testing-strategy.md)
- [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)

实施层可以随代码调整，但不能反向改变产品架构或正式契约。

## 设计决策记录

重大决策的背景、候选方案和代价记录在：

- [ADR 0001：每个 System 一个 Runtime Container](./decisions/0001-system-container-per-system-id.md)
- [ADR 0002：平台传输 Profile](./decisions/0002-platform-transport-profiles.md)
- [ADR 0003：逻辑只读 Content API](./decisions/0003-readonly-content-api.md)
- [ADR 0004：Client State 渲染流水线](./decisions/0004-client-state-rendering-pipeline.md)

## 按角色阅读

### 实现程序主系统

```text
栈式运行系统
→ 运行承载系统
→ 通信系统
→ 生命周期协议
→ 程序主系统模块
→ 分包和测试计划
```

### 实现模块子系统

```text
模块子系统模型
→ 生命周期协议
→ Renderer–Subsystem 数据协议
→ Client State Tree
→ 具体模块设计
```

### 实现 Web 渲染端

```text
渲染系统
→ Renderer–Subsystem 数据协议
→ Client State Tree
→ Content API
→ Web Renderer 模块
```

### 实现桌面宿主

```text
运行承载系统
→ 通信系统
→ Renderer–Subsystem 数据协议
→ Content API
→ Hostra 桌面宿主模块
```

### 实现 PWA

```text
运行承载系统
→ PWA 宿主模块
→ Renderer–Subsystem 数据协议
→ Content API
→ Web Renderer 模块
```

### 实现游戏包或内容工具

```text
存储与内容系统
→ 游戏包契约
→ Content API
→ Game Package / FSDB Content Service 模块
```

## 迁移状态

当前权威结论：

- 每个 System 一个 Runtime Container；
- 每个 Frame 是 Container 内独立实例；
- Renderer 与每个 Runtime Container 之间最多一条有效数据 Transport；
- Frame 通过共享 Transport 内的 `frameId + activationId + sequence` Logical Stream 隔离；
- 桌面使用独立 LR Main、System Process、WebSocket 和 HTTP；
- PWA 使用 Main/System Worker、每 System 数据 MessagePort、Service Worker 和 OPFS；
- Renderer–Subsystem 数据协议同时承载输入上行和视图状态下行；
- FSDB 通过逻辑只读 Content API 访问。

原有目录中的详细文档暂时保留为过渡资料。与上述结论冲突的旧内容不应继续作为实现依据。

后续迁移规则见 [文档分层与变更规则](./00-overview/document-governance.md)。

## 维护原则

1. 同一设计只有一个主要定义位置；
2. 下层文档只能细化，不能隐式修改上层结论；
3. 协议变更必须说明版本和兼容性；
4. 模块设计不得扩大系统职责；
5. 实施方案不是产品架构；
6. 路线图不替代正式设计；
7. 重大变更同步更新依赖文档和测试；
8. 删除或标记被替代内容，历史通过 Git 追溯。
