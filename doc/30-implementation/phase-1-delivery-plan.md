# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实施顺序、里程碑和关闭条件  
> 依赖：[仓库与分包方案](./repository-layout.md)、[测试策略](./testing-strategy.md)  
> 最近复核：2026-08-01

本计划按依赖顺序组织实施，不按文档篇幅或业务可见度排序。

## 里程碑 0：文档与契约基线

目标：让两个独立实现可以理解相同边界。

- 冻结 `systemId` 命名和 Registry 最小结构；
- 冻结 Frame 字段和状态转换；
- 冻结每 System 一个 Renderer Data Transport、Frame Logical Stream 多路复用模型；
- 冻结 System Data Connection Identity 与 Frame Stream Identity；
- 解决 `system.returned` 与 `system.resume(result)`；
- 定义协议版本握手；
- 定义 JSON-RPC 错误 Envelope；
- 定义消息大小、速率和超时；
- 生成 TypeScript 类型与 JSON Schema。

关闭条件：生命周期与 Renderer–Subsystem 数据协议不再依赖含糊示例，存在完整状态转换、身份作用域和 Fixture。

## 里程碑 1：最小主系统与测试子系统

目标：不依赖地图业务验证调用栈和 Container 复用。

- 实现 Main System 基础模块；
- 实现 `echo`、`nested-call`、`cancel`、`failure` 和 `multi-frame` 子系统；
- 实现每 `systemId` 一个 Runtime Container；
- 实现三层调用、返回和崩溃恢复；
- 实现 Stack Snapshot 和 Input Target；
- 验证同一 System 多个 Frame 复用同一 Container；
- 验证旧 Activation 拒绝。

关闭条件：不同测试进程可以完成嵌套调用、取消和失败返回；同一 System 多 Frame 不创建重复进程。

## 里程碑 2：Renderer–Subsystem 数据协议与 Web Renderer

目标：建立共享 System Transport 上的输入、状态和呈现闭环。

- 实现 System Data Connection Registry；
- 实现 Frame Stream Registry；
- 实现桌面 InMemory/WebSocket System Transport Adapter；
- 实现同一 Transport 的多 Frame 路由；
- 实现 Frame/Scope Store；
- 实现 Snapshot、Scope Replace、删除和 Resync；
- 实现 Node Registry 和 DOM Reconciler；
- 实现 Input Router；
- 实现 Frame 出栈整体清理但保留共享 Transport；
- 实现 Renderer 重载后按 System 重建 Transport、逐 Frame Resync。

关闭条件：`state-demo` 与 `multi-frame` 子系统可在一条 System Data Transport 上独立驱动多个 Frame/Scope UI，单 Frame 故障不污染其他 Frame。

## 里程碑 3：游戏包与 Content API

目标：安全打开只读内容并按需读取。

- 实现 Safe Package Root；
- 实现清单和入口；
- 实现 System/Feature Requirement；
- 实现轻量 Catalog；
- 实现 Repository Toolkit；
- 实现 FSDB localhost Readonly HTTP Content Service；
- 冻结并实现最小资源接口；
- 实现 `validate` 聚合错误。

关闭条件：启动路径不全量加载资源，路径逃逸和非法入口可被稳定拒绝；业务 Runtime 通过逻辑 Content API 而不是物理路径访问 FSDB。

## 里程碑 4：`loom.map` 最小运行时

目标：完成原创测试内容的地图纵向闭环。

- 实现地图 System Adapter；
- 实现 Session Coordinator；
- 实现 Execution Loop；
- 实现同步确定性 Runtime Core；
- 实现方向意图、单格移动和碰撞；
- 实现 Portal Effect Barrier；
- 实现地图 Client State Projector；
- 验证 `loom.map` 一个进程可承载多个地图 Frame 并共享 Renderer Data Transport。

关闭条件：两张原创测试地图可以往返，失败切换保留旧 Scene；多个地图 Frame 的状态和 Logical Stream 相互隔离。

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

目标：在独立 Hostra Shell 中完成真实桌面进程拓扑。

- LoomRealm Main 作为独立进程运行，不承载于 Hostra Main；
- Hostra 只负责打开和管理 Renderer BrowserWindow；
- Renderer ⇄ LoomRealm Main 建立会话控制 WebSocket；
- LoomRealm Main ⇄ 每个 Subsystem Process 建立每 System 一条控制 WebSocket；
- Renderer ⇄ 每个 Subsystem Process 建立每 System 一条数据 WebSocket；
- 在 System Data WebSocket 内多路复用该 System 的 Frame Logical Stream；
- 实现 System Data Channel Grant、一次性 token、Origin 和 loopback 校验；
- 实现子系统进程监督；
- 实现 Renderer 重载后每 System 重建连接、逐 Frame Resync；
- 实现有限关闭和强制终止。

关闭条件：Main 和 Hostra 不转发地图输入或 Client State；同一 System 多 Frame 只使用一条 Renderer Data WebSocket；桌面 Transport 通过 Renderer–Subsystem Data Conformance Suite。

## 里程碑 7：PWA Transport Profile

目标：以浏览器原生能力复现相同逻辑拓扑。

- Main Runtime 使用 Dedicated Worker；
- 每个 System 一个 Dedicated Worker；
- Main ⇄ System 每 System 一条控制 MessagePort；
- Window ⇄ System 每 System 一条数据 MessagePort；
- 同一数据 Port 内多路复用该 System 的 Frame Logical Stream；
- Service Worker 提供只读 Content API；
- OPFS 保存已安装游戏包；
- 实现页面隐藏、恢复、Worker/Port 重建和逐 Frame Resync。

关闭条件：PWA 与桌面使用相同 Renderer–Subsystem Data Fixture；一个 System Worker 多 Frame 只使用一条 Renderer Data Port。

## 第一阶段最终验收

- `loom-realm start ./game` 启动入口子系统；
- 三层嵌套调用完成、取消和失败行为确定；
- 每个 `systemId` 最多一个 Runtime Container；
- Renderer 与每个 Runtime Container 最多一个有效数据 Transport；
- 同 System 多 Frame 正确多路复用且相互隔离；
- 输入只到活动 Frame；
- 暂停 Frame Scope 保留；
- Frame suspend/resume/close 不关闭共享 System Data Transport；
- 旧 Activation 消息被拒绝；
- Renderer 重载按 System 重建 Transport 并逐 Frame 恢复；
- 两张地图移动、碰撞和双向 Portal 正常；
- 地图切换异步准备、同步原子提交；
- 游戏包只读且路径安全；
- Hostra 桌面与 PWA Profile 协议语义一致；
- 公共仓库不包含无再分发权素材。

## 暂缓

- Save System；
- 游戏包可执行插件；
- 在线系统商店和签名；
- 多主栈和后台 Frame Graph；
- 完整菜单、对话、战斗和任务；
- 多人同步和客户端预测；
- 高级 Canvas/WebGL 优化；
- ZIP、ASAR 和远程游戏包。

现有详细待办继续保留于：[第一阶段设计待办](../roadmap/phase-1-design-todos.md)。
