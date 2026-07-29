# `loom.map` 地图子系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：第一阶段地图子系统的内部模块和依赖方向  
> 依赖：[模块子系统模型](../../10-architecture/subsystem-model.md)  
> 最近复核：2026-07-29

`loom.map` 是第一阶段纵向切片。这里的内部模块不是 LoomRealm 对所有子系统的公共要求。

## 1. 模块结构

```text
loom.map
├── System Adapter
├── Input Adapter
├── Game Catalog / Repositories
├── Session Coordinator
├── Runtime Execution Loop
├── Runtime Core
├── Client State Projector
└── Pokémon Essentials Compatibility Compiler
```

## 2. System Adapter

将平台生命周期映射到地图子系统内部：

- initialize → 准备入口内容并启动 Core；
- activate → 接收输入；
- suspend → 停止输入并暂停 Loop；
- resume → 更新 Activation、处理返回结果并恢复；
- close → 停止输入、关闭 Loop 和 Repository。

## 3. Input Adapter

将归一化客户端输入转换为地图命令。持续移动使用方向意图，而不是依赖浏览器键盘重复频率。

## 4. Repositories

按需加载地图、人物和资源描述，负责解析、局部校验、并发去重和进程内缓存。返回结果必须不可变。

## 5. Session Coordinator

协调异步内容准备：

- 入口地图和人物加载；
- 出生位置校验；
- 地图切换目标准备；
- Loading/Error Session State；
- 迟到异步结果和关闭取消。

Coordinator 不在普通移动热路径，也不直接修改 Core。

## 6. Runtime Execution Loop

Core 的唯一写入口：

- 串行 Command、Tick 和 Control Operation；
- 使用单调时钟和固定 Tick；
- 有界命令队列和有限追赶；
- 控制操作优先；
- 建立地图切换 Effect Barrier；
- 在事务边界产生不可变 Snapshot。

当前默认参数属于实现选择，不属于平台契约。

## 7. Runtime Core

同步、确定性、无 I/O，负责：

- 当前地图和人物状态；
- 单格移动和方向；
- 碰撞；
- Portal 检测；
- 地图切换 Effect；
- 已准备场景的原子提交。

Core 不包含 Frame、JSON-RPC、Repository、Scope、DOM 或图片字节。

## 8. Client State Projector

读取已提交的 Runtime Snapshot 与 Session Snapshot，生成 `world`、`hud`、`loading`、`error` 或 `debug` Scope。

多 Scope 同时变化时发布完整 Frame Snapshot；投影失败不能发布部分树。

## 9. Pokémon Essentials 兼容层

兼容层负责把 RPG Maker XP / Pokémon Essentials v21.1 来源格式转换为 LoomRealm 标准运行内容：

- 三个 Tile 数据层；
- 原始 Tile ID；
- Autotile 预编译；
- 四方向通行和 Priority；
- 四列四行人物行走图；
- 手工 LoomRealm Portal。

前端和 Runtime Core 不直接解释 Ruby Marshal、`.rxdata` 或来源类。

## 10. 依赖方向

```text
System Adapter
→ Coordinator / Loop

Coordinator
→ Repositories
→ Loop Control API

Execution Loop
→ Runtime Core
→ Projection Scheduler

Projector
→ Client State Types

Compatibility Compiler
→ Repository Content Types
```

禁止 Core 反向依赖 Coordinator、Repository 或 Renderer。

## 11. 测试入口

- 相同输入产生相同 Snapshot、Event 和 Effect；
- Core 不并发和不重入；
- 固定 Tick 与有限追赶；
- 命令队列背压；
- Portal Effect Barrier；
- 地图切换失败保留旧 Scene；
- 成功切换原子提交；
- suspend/resume 不污染调用栈状态；
- 两张地图双向往返；
- DOM 呈现 Priority 和人物遮挡。

## 12. 现有详细资料

- [地图 Runtime Core](../../runtime/phase-1-runtime-core.md)；
- [Runtime Execution Loop](../../runtime/phase-1-runtime-execution-loop.md)；
- [Session Coordinator](../../runtime/phase-1-session-coordinator.md)；
- [Pokémon Essentials 地图运行时](../../runtime/phase-1-pokemon-essentials-map-runtime.md)；
- [游戏启动与内容加载](../../game-package/phase-1-game-loading.md)。
