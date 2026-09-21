# Game Package：当前实现边界

> 源码：`packages/game-package`；形式契约：[Game Package v1](../../15-contracts/game-package-v1.md)。本页描述已实现的逻辑模型，不恢复历史提案里的 Installation Registry、Catalog Builder 或 Repository Toolkit。

## 只负责游戏的逻辑拓扑

`@loomrealm/game-package` 解析与验证 Game Entry：版本、Subsystem `{key}` 集合、初始目标和 JSON input，产生脱离原输入、不可变的合法快照。它既不是运行时角色，也不包含模块加载或物理资源定位。Game Entry 的 key-set 必须与被选平台启动清单精确对应。

```text
game.json → Game Entry validator（logical topology）
                       + matching launch.hostra.json / launch.pwa.json
                       → 平台 PREPARE（解析可信 Definition material）
                       → LogicalGameBootstrap → Main
```

Definition Module 的解析和 Node/Worker Runner 由匹配的 Launcher/Profile 与 RuntimeHosting 实现，不得塞回通用 Game Package。FSDB 记录、Content HTTP 与资源授权归 [Content 模块](../fsdb-content-service/README.md)，具体游戏的内容和 initial input 归 `examples/`。

## 接口与验收

逻辑字段、失败分类及规范边界以 [Game Package v1](../../15-contracts/game-package-v1.md)、[Hostra Launcher](../../15-contracts/nodejs-launcher-profile-v1.md)、[PWA Launcher](../../15-contracts/pwa-launcher-profile-v1.md) 为准；源码的 public exports 决定具体 API。原设计决策保留在[ADR 0020](../../decisions/0020-game-entry-consumer-boundary.md)。

用 Game Package workspace 测试、Platform PREPARE 和 M6/M9 集成验证已存在的逻辑边界。PWA M16/M17 产品组合尚待落地，仅在[路线图](../../30-implementation/roadmap.md)安排；PWA Launcher 包存在不意味着整套 PWA 产品已完成。
