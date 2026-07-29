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
4. 按主题阅读各系统架构
5. [正式契约目录](./15-contracts/README.md)
6. [模块设计目录](./20-modules/README.md)
7. [实施计划目录](./30-implementation/README.md)

## 00 · 产品总览

只定义产品目标、适用范围、第一阶段边界、长期原则和发展方向。

- [产品设计总览](./00-overview/product-vision.md)
- [文档分层与变更规则](./00-overview/document-governance.md)

产品层不记录具体包名、类名、RPC 字段、Tick 参数或 Tile 格式。

## 10 · 系统架构

围绕产品中的各个系统说明设计目标、职责、非职责、状态所有权和系统关系。

- [系统架构总览](./10-architecture/system-overview.md)
- [栈式运行系统](./10-architecture/stack-runtime-system.md)
- [通信系统](./10-architecture/communication-system.md)
- [渲染系统](./10-architecture/rendering-system.md)
- [存储与内容系统](./10-architecture/storage-system.md)
- [模块子系统模型](./10-architecture/subsystem-model.md)

## 15 · 正式契约

定义不同实现必须共同遵守的协议、数据和版本语义。

- [正式契约目录](./15-contracts/README.md)
- [模块子系统生命周期与调用协议草案](./15-contracts/system-lifecycle-protocol.md)
- [Client Scoped State Tree v1](./15-contracts/client-state-tree-v1.md)
- [游戏包契约 v1](./15-contracts/game-package-v1.md)
- [资源交付协议草案](./15-contracts/resource-protocol.md)

## 20 · 模块设计

将系统拆解为内部模块，并明确依赖方向、不变量和测试边界。

- [模块设计目录](./20-modules/README.md)
- [程序主系统模块](./20-modules/main-system/README.md)
- [Web 渲染端模块](./20-modules/web-renderer/README.md)
- [游戏包与内容模块](./20-modules/game-package/README.md)
- [`loom.map` 地图子系统](./20-modules/loom-map/README.md)
- [Hostra 桌面宿主模块](./20-modules/desktop-host/README.md)

地图 Runtime Core、Execution Loop、Session Coordinator 和 Pokémon Essentials 兼容层只属于 `loom.map`，不是所有模块子系统必须实现的平台接口。

## 30 · 实施计划

描述当前准备如何分包、测试和按阶段落地。

- [实施计划目录](./30-implementation/README.md)
- [仓库与分包方案](./30-implementation/repository-layout.md)
- [测试策略](./30-implementation/testing-strategy.md)
- [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)

实施层可以随代码调整，但不能反向改变产品架构或正式契约。

## 按角色阅读

### 第一次了解 LoomRealm

```text
产品设计总览
→ 系统架构总览
→ 栈式运行系统
→ 模块子系统模型
```

### 实现程序主系统

```text
栈式运行系统
→ 通信系统
→ 生命周期协议
→ 程序主系统模块
→ 分包和测试计划
```

### 实现模块子系统

```text
模块子系统模型
→ 生命周期协议
→ Client State Tree
→ subsystem SDK / 具体模块设计
```

### 实现 Web 渲染端

```text
渲染系统
→ 通信系统
→ Client State Tree
→ Web Renderer 模块
```

### 实现游戏包或内容工具

```text
存储与内容系统
→ 游戏包契约
→ 资源协议
→ Game Package 模块
```

### 实现第一阶段地图子系统

```text
模块子系统模型
→ loom.map 模块
→ 地图 Runtime 详细资料
→ Pokémon Essentials 兼容资料
```

## 迁移状态

本次重构先建立新的权威阅读结构。原有目录中的详细文档暂时保留为过渡资料，以避免一次性移动导致内容和交叉链接丢失。

后续迁移规则见 [文档分层与变更规则](./00-overview/document-governance.md)。旧文件不应继续新增与新层级重复的主要定义。

## 维护原则

1. 同一设计只有一个主要定义位置；
2. 下层文档只能细化，不能隐式修改上层结论；
3. 协议变更必须说明版本和兼容性；
4. 模块设计不得扩大系统职责；
5. 实施方案不是产品架构；
6. 路线图不替代正式设计；
7. 重大变更同步更新依赖文档和测试；
8. 删除或标记被替代内容，历史通过 Git 追溯。
