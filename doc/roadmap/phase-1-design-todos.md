# 第一阶段设计待办

> 状态：**Tracking**  
> 适用范围：第一阶段尚未关闭的设计和实施准备事项  
> 最近复核：2026-07-25

本文档只追踪当前未关闭事项，不替代正式契约或设计。已经冻结的结论应进入对应权威文档，不应继续作为未完成问题保留。

当前范围和文档状态：

- [产品定位与第一阶段范围](../overview/product-scope.md)
- [文档状态与权威来源](../overview/document-status.md)
- [LoomRealm 总体架构](../architecture/system-overview.md)

## 1. 已冻结、不再作为待办

以下方向已经形成正式设计：

- 第一阶段不接入 Save System；
- 游戏包使用只读目录和 `realm.game.json`；
- 启动建立轻量 Game Catalog，地图和人物按需异步加载；
- Runtime Core 同步、确定性、无文件和网络 I/O；
- Runtime Execution Loop 是 Core 的唯一写入口；
- 默认固定 Tick 为 `20ms / 50Hz`，使用单调时钟和有限追赶；
- Session Coordinator 负责异步地图准备；
- 地图切换使用 Effect Barrier、异步准备和原子提交；
- Client State 使用 Scope、Roots 和 `key/tag/data/children`；
- Client State Projector 独立于 Core 事务；
- `state.snapshot` 和 `scope.replace` 是第一阶段状态消息；
- Runtime Event 与可恢复状态分离；
- Web Client 不读取 FSDB，不把 DOM 作为权威状态；
- Pokémon Essentials v21.1 三层地图、原始 Tile ID、静态 Autotile、方向通行和 Priority 进入第一阶段兼容范围。

对应实现应直接阅读权威文档，而不是从本文件重建规则。

## 2. P0：阻塞第一阶段实现的事项

### 2.1 Pokémon Essentials 导出器

- [ ] 确定导出器运行环境：原项目 Ruby 环境或独立 Ruby 工具；
- [ ] 定义地图、Tileset、Autotile、passages、priorities 和 terrain tags 的中间 JSON Schema；
- [ ] 定义两张验收地图的选择方式；
- [ ] 定义原始 Map ID、Tileset ID、文件名和来源追踪字段；
- [ ] 定义重复导入、覆盖和 LoomRealm 手工修改的处理规则；
- [ ] 定义稳定、可重复的 FSDB Key 生成规则；
- [ ] 准备不包含受限素材的公开导出夹具。

关闭条件：导出器对固定输入产生确定的中间数据，并有 Schema 和 Golden Fixture。

### 2.2 Autotile 编译器

- [ ] 验证 RPG Maker XP 48 种 Autotile 组合规则；
- [ ] 冻结 `tile.compiled` Atlas 排列；
- [ ] 冻结编译产物资源 Key 和内容版本；
- [ ] 决定只编译实际使用组合还是完整槽位；
- [ ] 校验不同尺寸、多帧输入和静态第一帧选择；
- [ ] 准备原创 Autotile 自动测试夹具。

关闭条件：固定输入可以确定性生成 Atlas，并通过像素或结构 Golden Test。

### 2.3 Passage Flags 与 Priority 编译

- [ ] 精确确认 RPG Maker XP passage flags 的方向位语义；
- [ ] 定义原始 flags 到标准四方向 `passable` 的转换；
- [ ] 冻结三个 Tile 层的有效通行合并算法；
- [ ] 冻结当前格离开和目标格进入的判定顺序；
- [ ] 定义 Priority 到标准渲染平面和排序值的转换；
- [ ] 建立墙体、门口、树冠和高 Priority Tile 测试地图；
- [ ] 明确 Terrain Tag、Bush 和 Counter 等保留但不执行的字段。

关闭条件：兼容编译器输出稳定的 Passability Grid 和 Render Items，移动与前端不解释原始 flags。

### 2.4 第一阶段 Scope / Tag / Data Registry

- [ ] 定义第一阶段实际使用的 Scope；
- [ ] 定义地图、Tile、人物、Loading、错误和调试节点 Tag；
- [ ] 为每个 Tag 定义 Data Schema；
- [ ] 定义节点允许发送的 Event Schema；
- [ ] 定义稳定 Key 规则；
- [ ] 准备 Runtime Snapshot 到 Client State 的 Golden Fixture；
- [ ] 确认业务 Registry 不进入基础 Client State 协议。

关闭条件：两张验收地图可以通过固定 Registry 完整投影和渲染。

### 2.5 Runtime Service 精确契约

- [ ] 冻结 JSON-RPC 方法和通知名称；
- [ ] 定义请求、响应、通知 Envelope；
- [ ] 定义客户端连接、首次 Snapshot 和重新连接流程；
- [ ] 定义命令、节点事件和全局输入的 Schema；
- [ ] 定义 Resync 请求和错误响应；
- [ ] 定义 Runtime Event Envelope；
- [ ] 定义健康检查和 ready 条件；
- [ ] 确认 Runtime Service 不直接调用 Core、不生成 Client State。

关闭条件：浏览器、Hostra 和测试 Client 可以基于同一契约完成连接和恢复。

## 3. P1：完成客户端和资源闭环的事项

### 3.1 Client Store 与 Scope Tree Reconciler

- [ ] 实现完整 Snapshot 原子替换；
- [ ] 实现单 Scope Replace 和 Scope 删除；
- [ ] 实现 Sequence、State Revision 和 Scope Revision 验证；
- [ ] 实现按 `scope + key` 的 Element 复用；
- [ ] 实现节点移动、删除和 Tag 变化；
- [ ] 实现节点生命周期清理；
- [ ] 实现结构错误后的完整 Resync；
- [ ] 确认普通人物移动不会重建整张地图。

设计依据：[Web Client 状态协调与 DOM 呈现](../design/web-client-reconciliation.md)。

### 3.2 Custom Node Runtime 与输入控制

- [ ] 实现 Tag / Renderer / Data Schema Registry；
- [ ] 实现地图、Tile、人物、Loading 和错误节点；
- [ ] 实现方向输入归一化；
- [ ] 处理页面失焦、断开和持续输入释放；
- [ ] 实现节点事件的 Scope、Key 和 Schema 校验；
- [ ] 确认 DOM Event 不直接进入 Runtime Core。

### 3.3 资源接口

- [ ] 定义资源请求路径或 RPC/HTTP 方法；
- [ ] 定义资源 Key、内容版本和 MIME；
- [ ] 定义缓存头和重新验证语义；
- [ ] 定义资源不存在、读取失败和类型不匹配错误；
- [ ] 定义最大资源大小和超时；
- [ ] 实现 Web Client 请求去重、解码和缓存；
- [ ] 确认图片下载不阻塞 Runtime 恢复。

关闭条件：Tile、编译 Autotile 和人物 Sprite 可以完全通过稳定资源 Key 显示。

### 3.4 CLI 与 Hostra Bootstrap

- [ ] 冻结 `start` 和 `validate` 参数；
- [ ] 定义 CLI 退出码、日志和诊断输出；
- [ ] 定义 Runtime 端口分配和 ready 信号；
- [ ] 定义 Hostra 如何传入游戏包目录；
- [ ] 实现 Hostra 等待 Runtime 就绪后打开窗口；
- [ ] 实现本机 Token、Origin 白名单和导航限制；
- [ ] 实现退出时 Runtime 子进程清理。

## 4. P1：统一错误与安全模型

- [ ] 定义稳定错误代码命名规则；
- [ ] 定义严重级别；
- [ ] 定义文件、内容 ID、字段路径和来源 ID 定位字段；
- [ ] 区分内容校验、业务拒绝、Runtime、Session、Projection、Protocol 和 Resource Error；
- [ ] 定义可恢复与致命错误；
- [ ] 定义错误如何进入 CLI、日志、Runtime RPC 和 Client State；
- [ ] 定义路径、消息、节点树和资源大小限制；
- [ ] 定义敏感本机路径的日志脱敏规则。

关闭条件：所有第一阶段失败路径都能稳定分类、定位并测试。

## 5. P1：测试与公开夹具

- [ ] 建立两张原创或可公开分发的测试地图；
- [ ] 建立普通 Tile、静态 Autotile、方向通行和 Priority 场景；
- [ ] 建立四行四列原创人物 Sprite；
- [ ] 建立双向 Portal；
- [ ] 建立无效地图、引用、出生点和资源夹具；
- [ ] 为 Game Package、Repository、Core、Loop、Coordinator、Projector、RPC 和 Web Client 建立分层测试；
- [ ] 建立端到端 `loom-realm start ./game` 验收；
- [ ] 建立 `loom-realm validate ./game` 全包验证测试；
- [ ] 确认公共仓库不包含无权再分发的 Pokémon 素材。

## 6. P2：实现过程中观察

以下事项可以根据原型数据决定，但不得突破第一阶段范围：

- [ ] Projection 深比较是否需要确定性 Fingerprint；
- [ ] Repository 是否需要 LRU 或仅保留进程内缓存；
- [ ] Web Client 是否需要有限地图节点池；
- [ ] Resource Cache 的释放策略；
- [ ] 是否增加开发期诊断 Scope；
- [ ] 是否需要 `validate` 的并行度限制；
- [ ] 是否需要记录仅用于调试的输入和 Transaction 日志。

## 7. 明确暂缓

除非更新 [产品定位与第一阶段范围](../overview/product-scope.md)，以下内容不得进入第一阶段完成条件：

- Save System 和 `.lrsav`；
- NPC 和完整地图事件；
- Pokémon 业务和战斗；
- Autotile 动画；
- 多会话和多人；
- 客户端预测；
- 插件和用户脚本；
- 大地图流式加载；
- Canvas / WebGL；
- ZIP、ASAR 和远程游戏包；
- 编辑器和项目创作 API。

## 8. 待办关闭规则

每个待办关闭时必须：

1. 将最终结论写入对应权威契约或设计；
2. 删除或标记冲突的旧内容；
3. 更新本文件；
4. 更新 [文档状态与权威来源](../overview/document-status.md)；
5. 重要取舍新增 ADR；
6. 增加自动测试或公开夹具；
7. 验证没有隐式扩大第一阶段范围。