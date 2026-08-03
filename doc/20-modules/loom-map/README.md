# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：第一阶段地图 Subsystem 的内部模块和依赖方向  
> 依赖：[模块子系统模型](../../10-architecture/subsystem-model.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[渲染系统](../../10-architecture/rendering-system.md)  
> 最近复核：2026-08-03

`loom.map` 是第一阶段纵向切片。这里的内部模块不是 LoomRealm 对所有 Subsystem 的公共要求。

## 1. 模块结构

```text
loom.map
├── Subsystem Control Adapter
├── Frame Control Adapter
├── Frame Input Adapter
├── Game Catalog / Repositories
├── Session Coordinator
├── Runtime Execution Loop
├── Runtime Core / World State
├── Render Manager
├── Render Projector
└── Pokémon Essentials Compatibility Compiler
```

地图 Subsystem 可以选择共享 world state、Execution Loop 和 Render；平台不要求按 Frame 创建这些对象。

## 2. Subsystem Control Adapter

只处理 Runtime Container 级 Subsystem Control v1：

```text
subsystem.hello
subsystem.status(initializing / ready / failed / stopping)
subsystem.shutdown
```

它不拥有 Frame Stack / Activation，也不把 Runtime ready 当作 Frame ready。

正常 shutdown 负责有限 Runtime-level cleanup，但不通过逐 Frame Render destroy 来定义 Process 是否可以退出。

## 3. Frame Control Adapter

处理 Frame / Call Protocol。

Batch A 已冻结的本地模型必须保持：

```text
frameId
    Main-assigned / never reused

callerFrameId
    immutable

lifecycle
    starting / active / suspended / closing / closed

Activation
    only active Frame has current Activation
    revoked Activation never becomes valid again

outcome
    completed / cancelled / failed
    separate from lifecycle
```

Frame Context 记录示例：

```ts
interface MapFrameContext {
  readonly frameId: string;
  readonly callerFrameId: string | null;
  state: "starting" | "active" | "suspended" | "closing" | "closed";
  currentActivationId: string | null;
}
```

地图实现 MUST NOT：

- 创建公共 `frameId`；
- 创建公共 `activationId`；
- 恢复旧 Activation；
- 增加 Frame `ready / initialized / frame.status`；
- 把业务 failure 表示为永久 Frame `failed` lifecycle state。

最终 `frame.initialize / activate / suspend / resume / close` wire Schema 由 Batch B 冻结。

## 4. Frame Input Adapter

User Input 路由：

```text
frameId + activationId
→ locate Frame Context
→ require lifecycle == active
→ require activationId == currentActivationId
→ normalize intent/action
→ submit command to map runtime
```

revoked Activation 必须永久拒绝。

例如：

```text
F1/A1 active
→ F1 suspended
→ later F1/A3 active

任何迟到 F1/A1 input
→ reject
```

持续移动使用方向意图，不依赖浏览器 key-repeat frequency。

Input Adapter 不负责 Render 路由。

## 5. Frame Lifecycle 与地图业务状态

Frame operation **不自动**：

- 启停整个地图 Runtime Loop；
- 创建/隐藏/销毁 Render；
- 删除共享 world state；
- 清空 Repository Cache；
- 创建新的 Process / Data Connection。

如果地图业务希望某个 Frame lifecycle 影响内部 Session 或 Render，由 `loom.map` 显式实现。

`completed / cancelled / failed` outcome 表示一次调用结果；Frame Context cleanup 仍使用 `closing → closed`。

## 6. Repositories

按需加载地图、人物和资源描述，负责解析、局部校验、并发去重和 Container 级不可变缓存。

Repository 不依赖 Frame Stack，也不按 Frame 强制复制同一份只读内容。

## 7. Session Coordinator

协调：

- 入口地图 / 人物加载；
- 出生位置校验；
- 地图切换目标准备；
- Loading/Error business state；
- 迟到异步结果；
- Frame-local cancellation / cleanup；
- Runtime shutdown cleanup。

地图内部 Session 与公共 Frame 的映射属于 `loom.map` 内部实现。

## 8. Runtime Execution Loop

Core 串行写入口：

- Command / Tick / Control Operation；
- monotonic clock + fixed Tick；
- bounded command queue / catch-up；
- control operation priority；
- map transition Effect Barrier；
- immutable snapshot at transaction boundaries。

是否一个共享 Loop 或多个内部 Session Loop 是地图实现问题，不是平台 Frame 语义。

## 9. Runtime Core / World State

同步、确定性、无 I/O，负责地图和人物状态、移动、碰撞、Portal、地图切换 Effect 与已准备场景原子提交。

Core 不包含 Main Frame Stack、JSON-RPC、DOM、Hostra 或 physical Transport。

## 10. Render Manager

`loom.map` 自己拥有 Render Registry / lifecycle，例如：

```text
world
hud
loading
debug
```

Render 可以 zero Frame 存在，也可以跨 Frame suspended / closed 保持。

Render Manager 不读取 Frame lifecycle 作为隐式 destroy/show/hide 指令。

## 11. Render Projector

读取已提交 Runtime / Session Snapshot，生成声明式 Render State。

Projector：

- 不要求每 Frame 一份；
- 不输出“Frame Snapshot”作为平台语义；
- 使用 Render Update Protocol；
- 不因 Activation replacement 做 Render resync；
- 投影失败不能发布部分错误状态。

## 12. Pokémon Essentials Compatibility

负责将来源格式转换为 LoomRealm 标准运行内容：Tile layers、Autotile、Passage/Priority、Character sprite、Portal 等。

Renderer / Runtime Core 不直接解释 Ruby Marshal / `.rxdata`。

## 13. 依赖方向

```text
Subsystem Control Adapter
→ Runtime lifecycle / shutdown coordinator

Frame Control Adapter
→ Frame Context Registry / Coordinator

Frame Input Adapter
→ Runtime Command API

Coordinator
→ Repositories / Runtime Control API

Execution Loop
→ Runtime Core
→ Render Projection Scheduler

Render Manager / Projector
→ Render Contract
```

Core 不反向依赖 Main、Repository、Renderer 或 Hostra。

## 14. Tests

至少验证：

- deterministic Core；
- fixed Tick / bounded catch-up；
- map transition atomicity；
- one `loom.map` Process serves multiple Frames；
- frameId no local generation/reuse；
- only active Frame accepts ordinary input；
- current Activation accepts input；
- old/revoked Activation rejects forever；
- resume does not restore old Activation；
- no Frame ready/status；
- failed outcome still performs closing/closed cleanup；
- Frame suspend/close does not hide/destroy world/hud Render；
- zero-frame loading/debug Render；
- Renderer reload restores current Activation from Main, not cached old Activation；
- normal Subsystem shutdown independent from Frame Render cleanup。

## 15. Legacy Implementation Notes

旧 `runtime/`、`game-package/` 等目录只作为实现参考。如果存在：

```text
per-Frame mandatory Core / Projector / Render
Frame status = failed
Frame ready state
Activation reuse
Frame close = Render destroy
```

必须按当前权威 Contract 修正或降级为 Legacy。
