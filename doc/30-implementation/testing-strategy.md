# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：协议、模块、兼容和端到端测试分层  
> 依赖：[仓库与分包方案](./repository-layout.md)  
> 最近复核：2026-07-29

## 1. 测试目标

测试不仅验证实现正确，还用于冻结跨系统语义和防止下层实现破坏上层边界。

## 2. 测试层次

```text
Schema 与契约测试
→ 模块单元测试
→ 进程互操作测试
→ 组件集成测试
→ 内容兼容 Golden Test
→ 端到端纵向测试
```

## 3. Schema 与契约测试

- 所有公开消息通过 JSON Schema 校验；
- 生成类型与 Schema 一致；
- 正常、边界和非法 Fixture 可在不同实现间共享；
- 协议版本和不兼容变更可检测；
- 错误 Envelope 和大小限制有固定 Fixture。

## 4. 生命周期互操作测试

使用最小测试子系统，而不是先依赖地图实现：

- `echo`：初始化、输入和返回；
- `nested-call`：A 调 B、B 调 C；
- `cancel`：正常取消；
- `failure`：初始化失败和运行崩溃；
- `state-demo`：Snapshot、Scope Replace 和 Resync。

至少验证：

- 栈顶限定；
- 新旧 Activation；
- completed、cancelled、failed；
- 调用建立与业务结果分离；
- Renderer 重连；
- Frame 出栈整体清理。

## 5. 模块单元测试

### Main System

状态转换、事务回滚、进程退出和输入目标一致性。

### Web Renderer

Store 原子提交、Sequence 缺口、Key 协调、Tag 变化和资源清理。

### Game Package

路径安全、Catalog 轻量性、Repository 去重和 Validator 聚合错误。

### Map Subsystem

Core 确定性、Loop 串行化、固定 Tick、Effect Barrier 和地图原子提交。

## 6. Golden Test

适合使用 Golden Fixture 的内容：

- JSON-RPC 消息；
- Frame Client State；
- Scope Tree；
- Pokémon Essentials 中间 JSON；
- Autotile 48 种组合产物；
- Passage、Priority 和渲染排序；
- 两张验收地图的标准 Runtime Snapshot。

Golden 更新必须说明是预期设计变化还是回归修复。

## 7. 端到端测试

第一阶段最小闭环：

```text
打开只读游戏包
→ 启动 loom.map
→ Renderer 获得首次 Snapshot
→ 玩家连续移动
→ 碰撞阻止非法移动
→ Portal 切换地图
→ 调用测试子系统并返回
→ Renderer 重载并恢复
→ 正常关闭
```

桌面模式与浏览器开发模式必须复用同一协议 Fixture。

## 8. 故障与恢复测试

- 初始化超时；
- 数据通道建立失败；
- 栈顶进程崩溃；
- 非栈顶进程崩溃；
- 旧 Activation 迟到消息；
- Sequence 缺口；
- 无效 Scope Tree；
- 资源加载失败；
- 地图切换加载失败；
- 关闭期间异步结果返回。

## 9. 安全测试

- 路径穿越和链接逃逸；
- 伪造 Frame、Activation 和 Scope；
- 未注册 Tag；
- 重复 Key；
- 过深树和过大消息；
- 任意 HTML、脚本和物理路径注入；
- Renderer 任意 IPC 和外部导航；
- 资源请求越权。

## 10. 完成标准

一个待办只有在以下条件满足后才能关闭：

1. 结论写入对应权威文档；
2. Schema 或类型更新；
3. 正常和失败测试存在；
4. 公开 Fixture 可复现；
5. 不扩大第一阶段范围；
6. 不混合主系统与子系统职责。