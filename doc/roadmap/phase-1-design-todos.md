# 第一阶段设计待办

> 状态：**Tracking**  
> 适用范围：第一阶段尚未关闭的设计和实施准备事项  
> 最近复核：2026-07-28

本文件只追踪未关闭事项，不替代正式契约或设计。

当前范围和架构：

- [产品定位与第一阶段范围](../overview/product-scope.md)
- [程序主系统与模块子系统架构](../architecture/main-system-and-subsystems.md)
- [JSON-RPC 通信与客户端状态同步](../architecture/runtime-rpc-and-state-sync.md)
- [文档状态与权威来源](../overview/document-status.md)

## 1. 已冻结、不再作为待办

- 顶层结构分为程序主系统和模块子系统；
- 程序主系统核心是单一子系统调用栈；
- `realm.entry.json` 定义初始子系统和参数；
- 子系统通过 `system.call` 入栈，通过 `system.return` 出栈；
- 子系统返回统一的 completed、cancelled 或 failed 结果；
- 子系统作为独立进程，通过 JSON-RPC 通信；
- 普通用户输入直接发送给当前活动子系统；
- 子系统直接发布自己 Frame 的 Scope；
- Scope 身份是 `frameId + scopeId`；
- `activationId` 隔离暂停、恢复和迟到消息；
- Runtime Core、Execution Loop 和 Session Coordinator 只属于第一阶段地图子系统；
- 游戏包只读；
- Client State 使用 Scope、Roots 和 `key/tag/data/children`；
- DOM 不是权威状态；
- Save System 不进入第一阶段。

## 2. P0：程序主系统与子系统协议

### 2.1 系统注册与解析

- [ ] 定义本地 System Registry 数据结构；
- [ ] 定义 `systemId` 命名规则；
- [ ] 定义内置 `loom.map` 的注册方式；
- [ ] 定义找不到系统、版本不兼容和启动失败错误；
- [ ] 明确第一阶段游戏包不携带可执行子系统；
- [ ] 准备测试子系统：echo、nested-call、failure。

关闭条件：程序主系统可根据入口和 `system.call` 稳定解析并启动子系统。

### 2.2 调用栈状态机

- [ ] 冻结 SystemFrame 字段；
- [ ] 冻结 starting、active、suspended、closing 和 failed 转换；
- [ ] 定义只有栈顶可 call/return 的验证；
- [ ] 定义初始化失败不入栈；
- [ ] 定义栈顶进程崩溃的 failed result；
- [ ] 定义初始子系统崩溃后的会话失败；
- [ ] 定义正常关闭时从栈顶向下清理。

关闭条件：嵌套三层调用、正常返回、取消和异常退出均有确定栈结果。

### 2.3 JSON-RPC 精确 Schema

- [ ] 为 `system.initialize`、`activate`、`suspend`、`resume`、`close` 定义 Schema；
- [ ] 为 `system.call`、`return` 和 `returned` 定义 Schema；
- [ ] 冻结 `frameId`、`activationId` 和错误 Envelope；
- [ ] 定义请求超时和进程退出语义；
- [ ] 定义协议版本握手；
- [ ] 定义最大消息大小和速率限制；
- [ ] 生成 TypeScript 类型和 JSON Schema。

关闭条件：不同语言测试进程可以完成嵌套调用和返回。

### 2.4 Renderer 通道管理

- [ ] 定义 Main 如何创建并转交 MessagePort；
- [ ] 定义浏览器模式的 WebSocket 对应关系；
- [ ] 定义 Frame 入栈、暂停、恢复和出栈通知；
- [ ] 定义 `stack.snapshot` 和 `stackRevision`；
- [ ] 定义 Renderer 重载后重建各 Frame 连接；
- [ ] 确认普通输入和 Scope 消息不由 Main 转发。

关闭条件：Main 只处理控制面，Renderer 可直接连接活动子系统。

## 3. P0：游戏包入口

- [ ] 实现 `realm.entry.json` 读取；
- [ ] 实现公共格式和版本校验；
- [ ] 实现 `system` 解析；
- [ ] 将 `params` 原样交给目标子系统；
- [ ] 由 `loom.map` 验证 `mapId` 和 `playerActorId`；
- [ ] 更新 `validate` 覆盖入口系统和参数；
- [ ] 准备入口缺失、系统缺失和参数错误夹具。

关闭条件：`loom-realm start` 可通过入口文件启动地图子系统。

## 4. P0：Frame Client State

### 4.1 Scope / Tag / Data Registry

- [ ] 定义地图子系统实际使用的 Scope；
- [ ] 定义地图、Tile、人物、Loading、错误和调试 Tag；
- [ ] 为每个 Tag 定义 Data Schema；
- [ ] 定义节点 Event Schema；
- [ ] 定义稳定 Key；
- [ ] 确认 Scope 完整身份为 `frameId + scopeId`；
- [ ] 准备地图 Snapshot 到 Frame Client State 的 Golden Fixture。

### 4.2 子系统数据 RPC

- [ ] 冻结 `input.dispatch` 和 `node.event`；
- [ ] 冻结 `state.snapshot`、`scope.replace` 和 `state.resync`；
- [ ] 冻结 `event.emit`；
- [ ] 定义每个 Frame 独立 Sequence；
- [ ] 定义 Activation 变化和迟到消息处理；
- [ ] 定义 Frame 出栈后整体 Scope 清理。

关闭条件：测试子系统和地图子系统可通过相同公共数据协议更新各自 Scope。

## 5. P0：地图兼容工具链

### 5.1 Pokémon Essentials 导出器

- [ ] 定义地图、Tileset、Autotile、passages 和 priorities 中间 JSON Schema；
- [ ] 定义稳定 FSDB Key；
- [ ] 准备两张公开验收地图；
- [ ] 准备不包含受限素材的导出夹具。

### 5.2 Autotile 编译器

- [ ] 验证 RPG Maker XP 48 种组合；
- [ ] 冻结 `tile.compiled` Atlas；
- [ ] 定义编译产物资源 Key 和版本；
- [ ] 建立像素或结构 Golden Test。

### 5.3 Passage 与 Priority 编译

- [ ] 冻结方向通行位语义；
- [ ] 冻结三个 Tile 层的通行合并；
- [ ] 冻结离开格和进入格判定顺序；
- [ ] 定义 Priority 到渲染排序值的转换；
- [ ] 建立墙、门、树冠和高 Priority 测试图。

## 6. P1：Web 渲染端

### 6.1 Stack / Frame / Scope Store

- [ ] 实现 `stack.snapshot` 和增量 Frame 通知；
- [ ] 实现每个 Frame 独立 State Snapshot；
- [ ] 实现单 Scope Replace 和删除；
- [ ] 实现 Frame 出栈整体清理；
- [ ] 实现 Stack Revision、Sequence、State Revision 和 Scope Revision 校验；
- [ ] 实现 Renderer 重载恢复。

### 6.2 Scope Tree Reconciler

- [ ] 实现 `frameId + scopeId + key` 身份；
- [ ] 实现 Element 复用、移动、删除和 Tag 变化；
- [ ] 实现节点生命周期清理；
- [ ] 确认普通地图移动不会重建整张地图；
- [ ] 实现结构错误后的 Frame Resync。

### 6.3 Input Router

- [ ] 根据 Main 的 inputTarget 发送输入；
- [ ] 输入目标变化后立即停止旧 Frame 输入；
- [ ] 页面失焦时释放持续方向意图；
- [ ] 实现节点事件完整来源；
- [ ] 拒绝旧 Activation；
- [ ] 验证高频输入背压策略。

## 7. P1：地图子系统内部实现

- [ ] 实现 Game Catalog 和 Repository；
- [ ] 实现地图子系统 Session Coordinator；
- [ ] 实现 Runtime Execution Loop；
- [ ] 实现同步确定性 Runtime Core；
- [ ] 统一持续方向意图语义；
- [ ] 实现地图异步准备和原子提交；
- [ ] 实现地图子系统 Client State Projector；
- [ ] 将地图子系统控制生命周期适配到 `system.initialize/suspend/resume/close`。

## 8. P1：资源、错误和安全

- [ ] 定义资源 Key、MIME、版本和缓存；
- [ ] 定义资源接口由平台服务还是子系统授权提供；
- [ ] 定义稳定错误代码；
- [ ] 区分 Main、Subsystem、Protocol、Projection、Content 和 Resource Error；
- [ ] 定义路径、消息、树深和资源大小限制；
- [ ] 定义本机路径日志脱敏；
- [ ] 限制 Renderer 导航和任意 IPC；
- [ ] 限制子系统伪造其他 Frame。

## 9. P1：端到端测试

- [ ] `loom-realm start ./game` 启动初始地图子系统；
- [ ] 测试子系统 A 调用 B，B 调用 C，再按顺序返回；
- [ ] 验证输入只到栈顶；
- [ ] 验证下层 Scope 保留；
- [ ] 验证 Frame 出栈清理；
- [ ] 验证旧 Activation 消息被拒绝；
- [ ] 验证栈顶子系统崩溃返回 failed；
- [ ] 验证 Renderer 重载恢复；
- [ ] 验证两张地图往返和 Portal；
- [ ] 验证浏览器与 Hostra 使用相同协议语义。

## 10. P2：后续观察

- [ ] 是否需要子系统进程池；
- [ ] 是否允许一个进程承载多个 Frame；
- [ ] 是否引入能力发现而非精确 systemId；
- [ ] 是否需要后台或 Sidecar 子系统；
- [ ] 是否需要跨子系统共享状态服务；
- [ ] Projection 深比较是否需要 Fingerprint；
- [ ] 是否增加开发期诊断 Scope；
- [ ] 是否需要输入和 RPC Trace。

## 11. 明确暂缓

- Save System；
- 子系统商店、在线安装和签名；
- 游戏包内可执行插件；
- 多主栈、后台 Frame Graph 和并行交互；
- 完整菜单、对话、战斗、任务和 Pokémon 业务；
- 多会话和多人；
- 客户端预测；
- Canvas / WebGL；
- ZIP、ASAR 和远程游戏包；
- 编辑器和项目创作 API。

## 12. 待办关闭规则

每个待办关闭时必须：

1. 将结论写入对应权威文档；
2. 删除或修正冲突内容；
3. 更新本文件；
4. 更新文档状态表；
5. 增加自动测试或公开夹具；
6. 验证程序主系统和子系统职责没有混合；
7. 验证未隐式扩大第一阶段范围。