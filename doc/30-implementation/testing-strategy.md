# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：协议、模块、跨平台 Transport、内容兼容和端到端测试分层  
> 依赖：[仓库与分包方案](./repository-layout.md)、[Frame 数据通道 v1](../15-contracts/frame-data-channel-v1.md)、[Content API v1](../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-01

## 1. 测试目标

测试不仅验证实现正确，还用于冻结跨系统语义和防止下层实现破坏上层边界。

本阶段特别验证：

- 每个 System 一个 Runtime Container；
- 一个 Container 承载多个 Frame；
- 每个 Frame 独立控制状态、数据连接和 Client State；
- 输入上行与视图状态下行；
- 桌面 WebSocket/HTTP 与 PWA MessagePort/Service Worker 的语义一致性。

## 2. 测试层次

```text
Schema 与契约测试
→ 纯状态机和 Store Fixture
→ 模块单元测试
→ Transport Conformance Test
→ Container / Worker 互操作测试
→ 组件集成测试
→ 内容兼容 Golden Test
→ 端到端纵向测试
→ 性能和延迟测试
```

## 3. Schema 与契约测试

- 所有公开消息通过 JSON Schema 校验；
- 生成类型与 Schema 一致；
- 正常、边界和非法 Fixture 可在不同实现间共享；
- 协议版本和不兼容变更可检测；
- 错误 Envelope 和大小限制有固定 Fixture；
- Frame Data、Client State 和 Content API 身份字段不混用；
- 物理路径、token 和任意 HTML 不得出现在 Client State Fixture。

## 4. 生命周期互操作测试

使用最小测试 System，而不是先依赖地图实现：

- `echo`：Container 启动、Frame 初始化、输入和返回；
- `multi-frame`：同一个 System Container 同时承载多个 Frame；
- `nested-call`：A 调 B、B 调 C；
- `recursive-call`：同一 System 递归产生多个 Frame；
- `cancel`：正常取消；
- `failure`：Frame 初始化失败、Frame 业务失败和 Container 崩溃；
- `state-demo`：Snapshot、Scope Replace、Event 和 Resync。

至少验证：

- 栈顶限定；
- 新旧 Activation；
- completed、cancelled、failed；
- 调用建立与业务结果分离；
- 关闭一个 Frame 不影响同 Container 其他 Frame；
- Container 崩溃影响其承载的全部 Frame；
- Renderer 重连；
- Frame 出栈整体清理。

## 5. Frame 数据通道 Conformance

同一组 Fixture 同时运行在：

```text
DesktopWebSocketFrameTransport
PwaMessagePortFrameTransport
InMemoryFrameTransport
```

输入相同消息序列，预期获得相同：

- Receiver Sequence 状态；
- Frame/Scope Store；
- Resync 请求；
- 错误码；
- Event 顺序；
- Frame 关闭结果。

测试用例：

- 首次认证 / hello 和 Snapshot；
- 双向 Sequence 正常、重复、迟到和缺口；
- 旧 Activation 输入、State 和 Event；
- 单 Scope 创建、替换和删除；
- 多 Scope Snapshot 原子提交；
- State 合并不产生 Sequence 缺口；
- Event 队列上限和溢出；
- 消息过大、树过深和非法 Tag；
- 重连后新 Sequence 和保留 State Revision；
- 同一 System 中两个 Frame 的通道完全隔离。

## 6. Renderer 测试

### Store

- Snapshot 原子替换；
- Scope Replace 和删除；
- State/Scope Revision；
- 下行 Sequence 缺口；
- Resync 时保留旧 Store；
- Frame 出栈整体删除。

### Reconciler

- Key 复用、移动和删除；
- Tag 变化重建；
- 未变化节点不更新；
- 单 Scope Replace 不触碰其他 Scope；
- DOM 不是恢复源。

### Render Scheduler

- 每个 rAF 最多提交一次；
- 同一 Scope 多次 State 只呈现最新 Store；
- Event 不被 State Coalescer 丢弃；
- Frame Snapshot 正确重置 dirty 集合；
- 页面隐藏时停止呈现和输入。

### 混合呈现

- DOM HUD 与 Canvas Scene 同时存在；
- Scene 插值不修改 Store；
- Resource 失败显示占位且不破坏 Store；
- Frame 出栈释放 Canvas、GPU、音频和事件资源。

## 7. Main System 测试

- System Registry 和 Container Registry；
- 同一 `systemId` 只创建一个有效 Container；
- 多 Frame 映射和生命周期；
- Stack 和 Input Target 原子一致；
- Frame Channel Grant 签发、过期和撤销；
- Container 空闲和关闭策略；
- Container 崩溃的调用链展开；
- Renderer 重连和 Grant 重建；
- Content Grant 权限。

## 8. Content API Conformance

同一组请求 Fixture 同时运行在：

```text
DesktopHttpContentService
ServiceWorkerContentService
InMemoryContentService
```

预期获得相同：

- HTTP 状态码；
- Content-Type；
- ETag 和 Content Version；
- 错误 code；
- GET/HEAD 行为；
- Record、Group 和 Resource 字节。

测试用例：

- Manifest、Record、Group 和 Resource；
- installationId、Namespace 和 Key 不存在；
- URL 编码、路径穿越和超长参数；
- ETag/304；
- 未完成和损坏安装；
- 桌面 token、权限和 Origin；
- PWA Service Worker 冷启动；
- MIME、大小和并发限制；
- Index 与主体哈希不一致；
- 可选 Range 206/416；
- Service Worker 重启后结果不变。

## 9. 模块单元测试

### Game Package

路径安全、安装登记、Catalog 轻量性、Package Index 生成、Repository 去重和 Validator 聚合错误。

### FSDB Content Service

Route Parser、Index Resolver、Storage Adapter、MIME、ETag、授权、Response Builder 和错误去敏。

### Map Subsystem

- Container 级共享 Repository；
- Frame 级 Core、Loop、Projector 和输入队列隔离；
- Core 确定性；
- Loop 串行化和固定 Tick；
- Effect Barrier；
- 地图原子提交；
- 多 Frame 同时存在时只推进 active Frame。

## 10. Golden Test

适合使用 Golden Fixture 的内容：

- JSON-RPC 消息；
- Frame Data Channel 消息流；
- Frame Client State；
- Scope Tree；
- Content API Response 和 Problem JSON；
- `fsdb.index.json`；
- Pokémon Essentials 中间 JSON；
- Autotile 48 种组合产物；
- Passage、Priority 和渲染排序；
- 两张验收地图的标准 Runtime Snapshot。

Golden 更新必须说明是预期设计变化还是回归修复。

## 11. 端到端测试

### 桌面 Profile

```text
启动 LoomRealm Main
→ 启动 FSDB HTTP Service
→ 通过 Hostra 打开 Renderer
→ 启动 loom.map System Process
→ 创建初始 Frame 和 WebSocket
→ Renderer 获得首次 Snapshot
→ 玩家连续移动并接收 Scope 更新
→ 调用同一或其他 System 创建新 Frame
→ Renderer 重载并恢复
→ 正常关闭
```

### PWA Profile

```text
安装游戏包到 OPFS
→ Service Worker 接管
→ 启动 Main Runtime Worker
→ 启动 loom.map System Worker
→ 创建初始 Frame MessagePort
→ Renderer 获得首次 Snapshot
→ 页面隐藏暂停
→ 页面恢复、重建连接并 Resync
→ 正常关闭
```

两种 Profile 必须复用同一协议和内容 Fixture。

## 12. 性能和延迟测试

采集至少以下时间点：

```text
Renderer 捕获输入
Frame Runtime 收到输入
权威状态提交
Projector 提交
Renderer Store 提交
画面 rAF 提交
```

记录 P50、P95、P99 和最大值，不能只看平均值。

Profile 目标按游戏类型配置，例如 RPG、Action、Platformer 和 Fighting。Transport 延迟、Tick 等待和画面等待分别统计。

背压测试：

- 高频方向意图；
- 连续 Scope State 合并；
- Event 洪峰；
- 大型资源并发；
- Renderer 长帧；
- 子系统 GC 或 CPU 饱和。

## 13. 故障与恢复测试

- Container 启动和 Frame 初始化超时；
- Frame 数据通道认证失败；
- Stack 顶和非栈顶 Frame 所在 Container 崩溃；
- 同 Container 多 Frame 故障；
- 旧 Activation 迟到消息；
- 双向 Sequence 缺口；
- 无效 Scope Tree；
- Event Queue Overflow；
- Content Service / Service Worker 重启；
- 资源加载失败；
- 地图切换加载失败；
- 关闭期间异步结果返回；
- PWA 页面冻结和 Worker 回收。

## 14. 安全测试

- 路径穿越和链接逃逸；
- 伪造 Session、System、Frame、Activation 和 Connection；
- 未注册 Tag；
- 重复 Key；
- 过深树和过大消息；
- 任意 HTML、脚本和物理路径注入；
- Renderer 任意 IPC 和外部导航；
- WebSocket Origin 和 token；
- Content 请求越权；
- Service Worker 非法 installationId；
- 错误响应泄露路径或 token。

## 15. 跨平台测试矩阵

| 场景 | Desktop | PWA |
|---|---:|---:|
| 一个 System 创建多个 Frame | 必测 | 必测 |
| Frame 独立输入路由 | 必测 | 必测 |
| Snapshot 下行 | 必测 | 必测 |
| Scope Replace 合并 | 必测 | 必测 |
| Event 保序 | 必测 | 必测 |
| Sequence 缺口 Resync | 必测 | 必测 |
| 旧 Activation 拒绝 | 必测 | 必测 |
| Frame 出栈整体清理 | 必测 | 必测 |
| Container 故障影响多个 Frame | 必测 | 必测 |
| Renderer / Window 恢复 | 必测 | 必测 |
| Content API 一致性 | 必测 | 必测 |
| 页面后台暂停 | 不适用 | 必测 |

## 16. 完成标准

一个待办只有在以下条件满足后才能关闭：

1. 结论写入对应权威文档；
2. Schema 或类型更新；
3. 正常和失败测试存在；
4. 公开 Fixture 可复现；
5. 桌面和 PWA Profile 通过相关 Conformance Suite；
6. 不扩大第一阶段范围；
7. 不混合 Main、Frame Runtime、Renderer 和 Content Service 职责。
