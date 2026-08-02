# `loom.map` 地图子系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：第一阶段地图子系统的内部模块和依赖方向  
> 依赖：[模块子系统模型](../../10-architecture/subsystem-model.md)、[渲染系统](../../10-architecture/rendering-system.md)  
> 最近复核：2026-08-02

`loom.map` 是第一阶段纵向切片。这里的内部模块不是 LoomRealm 对所有 Subsystem 的公共要求。

## 1. 模块结构

```text
loom.map
├── System Control Adapter
├── Frame Input Adapter
├── Game Catalog / Repositories
├── Session Coordinator
├── Runtime Execution Loop
├── Runtime Core / World State
├── Render Manager
├── Render Projector
└── Pokémon Essentials Compatibility Compiler
```

地图子系统可以选择共享 world state、共享 Execution Loop 和共享 Render；平台不要求按 Frame 创建上述对象。

## 2. System Control Adapter

处理 Main Control Plane：

- Runtime Bootstrap 完成后进入 ready；
- `frame.initialize` 建立地图调用 / 输入上下文；
- `frame.activate` 允许对应 Activation 的普通输入；
- `frame.suspend` 停止该 Frame 普通输入；
- `frame.resume` 更新 Activation 并交付子调用结果；
- `frame.close` 删除对应 Frame/Input Context。

这些 Frame 操作**不自动**：

- 启停整个地图 Runtime Loop；
- 创建/隐藏/销毁 Render；
- 删除共享 world state；
- 清空 Repository Cache。

如果地图业务希望某个 Frame 生命周期影响某个地图 Session 或 Render，由 `loom.map` 自己显式实现。

## 3. Frame Input Adapter

将 User Input Protocol 的归一化输入转换为地图命令：

```text
frameId + activationId
→ locate input context
→ validate current activation
→ normalize intent/action
→ submit command to map runtime
```

持续移动使用方向意图，不依赖浏览器键盘重复频率。

Input Adapter 不负责 Render 路由。

## 4. Repositories

按需加载地图、人物和资源描述，负责解析、局部校验、并发去重和 Container 级不可变缓存。

Repository 不依赖 Frame Stack，也不按 Frame 强制复制同一份只读内容。

## 5. Session Coordinator

协调异步内容准备：

- 入口地图和人物加载；
- 出生位置校验；
- 地图切换目标准备；
- Loading/Error business state；
- 迟到异步结果和关闭取消。

地图内部可以拥有一个或多个 Session；其与公共 Frame 的映射是 `loom.map` 内部实现，不属于 LoomRealm Frame Contract。

## 6. Runtime Execution Loop

Core 的串行写入口：

- Command / Tick / Control Operation；
- 单调时钟和固定 Tick；
- 有界命令队列和有限追赶；
- 控制操作优先；
- 地图切换 Effect Barrier；
- 在事务边界产生不可变 Snapshot。

是否只有一个共享 Loop 或多个内部 Session Loop 是地图 Subsystem 设计问题，不是平台 Frame 语义。

## 7. Runtime Core / World State

同步、确定性、无 I/O，负责：

- 当前地图和人物状态；
- 单格移动和方向；
- 碰撞；
- Portal 检测；
- 地图切换 Effect；
- 已准备场景的原子提交。

Core 不包含 Main Frame Stack、JSON-RPC、DOM、Hostra 或物理 Transport。

## 8. Render Manager

`loom.map` 自己拥有 Render Registry 和 Render 生命周期。

例如可以维护：

```text
world render
hud render
loading render
debug render
```

Render Manager 决定：

- create / destroy；
- visibility / ordering；
- 哪些 Runtime Snapshot 影响哪些 Render；
- Render recovery；
- Presentation Event。

Render 可以在零 Frame 时存在，也可以跨 Frame suspend / close 保持。

## 9. Render Projector

Render Projector 读取已提交 Runtime / Session Snapshot，生成声明式 Render State，例如：

```text
world
hud
loading
error
debug
```

这里的名称是地图内部 Render/Scope 设计，不表示公共 Frame Store。

Projector：

- 不要求每 Frame 一份；
- 不输出 “Frame Snapshot” 作为平台语义；
- 使用 Render Update Protocol 发布状态；
- 多 Scope 同时变化时按未来 Render Contract 的事务边界原子发布；
- 投影失败不能发布部分错误状态。

## 10. Pokémon Essentials 兼容层

负责把 RPG Maker XP / Pokémon Essentials v21.1 来源格式转换为 LoomRealm 标准运行内容：

- 三个 Tile 数据层；
- 原始 Tile ID；
- Autotile 预编译；
- 四方向通行和 Priority；
- 四列四行人物行走图；
- 手工 LoomRealm Portal。

Renderer 和 Runtime Core 不直接解释 Ruby Marshal、`.rxdata` 或来源类。

## 11. 依赖方向

```text
System Control Adapter
→ Frame Input Adapter / Coordinator / Runtime

Frame Input Adapter
→ Runtime Command API

Coordinator
→ Repositories
→ Runtime Control API

Execution Loop
→ Runtime Core
→ Render Projection Scheduler

Render Manager / Projector
→ Render State Types

Compatibility Compiler
→ Repository Content Types
```

禁止 Core 反向依赖 Main、Repository、Renderer 或 Hostra。

## 12. 测试入口

- 相同输入产生相同 Runtime Snapshot / Effect；
- Core 不并发和不重入；
- 固定 Tick 与有限追赶；
- 命令队列背压；
- Portal Effect Barrier；
- 地图切换失败保留旧 Scene；
- 成功切换原子提交；
- 同一 `loom.map` Process 可以服务多个 Frame/Input Context；
- Frame A/B 输入 Activation 相互隔离；
- Frame suspend / close 不隐式隐藏或销毁 world/hud Render；
- 没有 Frame 时 loading/debug Render 仍可存在；
- Renderer reload 后按 Render Protocol 恢复地图 Render；
- 两张地图双向往返；
- DOM/Canvas/WebGL 呈现 Priority 和人物遮挡。

## 13. 现有详细资料

旧 `runtime/`、`game-package/` 目录中的地图详细设计继续作为实现参考；如果其中存在“每 Frame 固定拥有 Core / Projector / Render State”之类假设，应按本模块和上层架构修正或降级为 Legacy。