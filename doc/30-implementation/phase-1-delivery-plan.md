# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实施顺序、里程碑和关闭条件  
> 依赖：[仓库与分包方案](./repository-layout.md)、[测试策略](./testing-strategy.md)  
> 最近复核：2026-07-29

本计划按依赖顺序组织实施，不按文档篇幅或业务可见度排序。

## 里程碑 0：文档与契约基线

目标：让两个独立实现可以理解相同边界。

- 冻结 `systemId` 命名和 Registry 最小结构；
- 冻结 Frame 字段和状态转换；
- 解决 `system.returned` 与 `system.resume(result)`；
- 定义协议版本握手；
- 定义 JSON-RPC 错误 Envelope；
- 定义消息大小、速率和超时；
- 生成 TypeScript 类型与 JSON Schema。

关闭条件：生命周期协议不再依赖含糊示例，存在完整状态转换表和 Fixture。

## 里程碑 1：最小主系统与测试子系统

目标：不依赖地图业务验证调用栈。

- 实现 Main System 基础模块；
- 实现 `echo`、`nested-call`、`cancel` 和 `failure` 子系统；
- 实现三层调用、返回和崩溃恢复；
- 实现 Stack Snapshot 和 Input Target；
- 验证旧 Activation 拒绝。

关闭条件：不同测试进程可以完成嵌套调用、取消和失败返回。

## 里程碑 2：Client State 与 Web Renderer

目标：建立通用状态和呈现闭环。

- 实现 Frame/Scope Store；
- 实现 Snapshot、Scope Replace、删除和 Resync；
- 实现 Node Registry 和 DOM Reconciler；
- 实现 Input Router；
- 实现 Frame 出栈整体清理；
- 实现 Renderer 重载恢复。

关闭条件：`state-demo` 子系统可独立驱动多 Frame、多 Scope UI。

## 里程碑 3：游戏包与资源

目标：安全打开只读内容并按需读取。

- 实现 Safe Package Root；
- 实现清单和入口；
- 实现 System/Feature Requirement；
- 实现轻量 Catalog；
- 实现 Repository Toolkit；
- 冻结并实现最小资源接口；
- 实现 `validate` 聚合错误。

关闭条件：启动路径不全量加载资源，路径逃逸和非法入口可被稳定拒绝。

## 里程碑 4：`loom.map` 最小运行时

目标：完成原创测试内容的地图纵向闭环。

- 实现地图 System Adapter；
- 实现 Session Coordinator；
- 实现 Execution Loop；
- 实现同步确定性 Runtime Core；
- 实现方向意图、单格移动和碰撞；
- 实现 Portal Effect Barrier；
- 实现地图 Client State Projector。

关闭条件：两张原创测试地图可以往返，失败切换保留旧 Scene。

## 里程碑 5：Pokémon Essentials 兼容工具链

目标：用真实来源格式验证兼容层，不污染平台核心。

- 定义导出中间 JSON Schema；
- 导入三个 Tile 层和原始 Tile ID；
- 实现 Autotile 48 种组合预编译；
- 导入 Passage、Priority 和人物行走图；
- 建立 Golden Fixture；
- 确保受限素材不进入公共仓库。

关闭条件：两张验收地图可转换为标准 FSDB，并通过相同 `loom.map` Runtime 运行。

## 里程碑 6：Hostra 桌面闭环

目标：桌面模式与浏览器模式共享协议语义。

- 在 Hostra Main 承载程序主系统；
- 建立受限 Preload API；
- 为每个 Frame 建立 MessagePort；
- 实现子系统进程监督；
- 实现 Renderer 重载恢复；
- 实现有限关闭和强制终止。

关闭条件：Main 不转发地图输入和 Scope，浏览器与桌面使用同一协议测试。

## 第一阶段最终验收

- `loom-realm start ./game` 启动入口子系统；
- 三层嵌套调用完成、取消和失败行为确定；
- 输入只到活动 Frame；
- 暂停 Frame Scope 保留；
- 旧 Activation 消息被拒绝；
- Renderer 重载恢复；
- 两张地图移动、碰撞和双向 Portal 正常；
- 地图切换异步准备、同步原子提交；
- 游戏包只读且路径安全；
- Hostra 与浏览器模式协议一致；
- 公共仓库不包含无再分发权素材。

## 暂缓

- Save System；
- 游戏包可执行插件；
- 在线系统商店和签名；
- 多主栈和后台 Frame Graph；
- 完整菜单、对话、战斗和任务；
- 多人同步和客户端预测；
- Canvas/WebGL；
- ZIP、ASAR 和远程游戏包。

现有详细待办继续保留于：[第一阶段设计待办](../roadmap/phase-1-design-todos.md)。