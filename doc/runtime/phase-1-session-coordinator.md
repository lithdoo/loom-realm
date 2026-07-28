# 第一阶段地图子系统 Session Coordinator

> 状态：**Active Design**  
> 适用范围：内置 `loom.map` 模块子系统  
> 最近复核：2026-07-28  
> 主要定义：地图子系统初始化、异步内容准备、地图切换和内部会话状态

相关文档：

- [`../architecture/main-system-and-subsystems.md`](../architecture/main-system-and-subsystems.md)：程序主系统 Frame 生命周期；
- [`phase-1-runtime-execution-loop.md`](./phase-1-runtime-execution-loop.md)：地图 Core 唯一写入口；
- [`phase-1-runtime-core.md`](./phase-1-runtime-core.md)：地图权威状态；
- [`../game-package/phase-1-game-loading.md`](../game-package/phase-1-game-loading.md)：Catalog 和 Repository；
- [`../architecture/client-state-projector.md`](../architecture/client-state-projector.md)：地图 Frame Scope 投影。

核心原则：

> 本 Coordinator 只协调 `loom.map` 子系统内部的异步内容准备。它不是程序主系统，也不管理模块子系统调用栈。

## 1. 职责

Coordinator 负责：

- 接收地图子系统初始化参数；
- 异步加载入口地图和玩家人物；
- 校验出生位置和场景内容；
- 通过 Execution Loop 初始化 Runtime Core；
- 维护地图子系统内部 Session State；
- 接收 MapTransitionEffect；
- 在异步等待前进入 loading；
- 准备目标地图、人物和出生点；
- 通过 Loop 原子提交地图切换；
- 请求 loading/world/hud Scope 投影；
- 处理内容加载失败、子系统关闭和取消。

不负责：

- 程序主系统 `system.call`、`system.return` 或 Frame 栈；
- 启动菜单、对话或其他子系统；
- 固定 Tick 和命令队列；
- 直接修改 Runtime Core；
- 生成 DOM；
- Repository 缓存策略；
- Renderer 连接和输入路由。

## 2. 地图 Session State

```ts
type MapSessionLifecycle =
  | "starting"
  | "running"
  | "loading"
  | "failed"
  | "closed";

interface MapSessionSnapshot {
  readonly lifecycle: MapSessionLifecycle;
  readonly revision: number;
  readonly error: MapSessionError | null;
  readonly pendingEffectId: string | null;
}
```

这是地图子系统内部会话状态，与程序主系统 Frame State 分离：

```text
SystemFrame.state
    starting / active / suspended / closing

MapSessionSnapshot.lifecycle
    starting / running / loading / failed / closed
```

两者不得混用。

## 3. 初始化

程序主系统调用：

```text
system.initialize(frameId, input)
```

地图子系统适配器验证：

```ts
interface MapEntryParams {
  readonly mapId: string;
  readonly playerActorId: string;
}
```

Coordinator 执行：

```text
Session starting
→ 并行加载入口地图和人物
→ 校验地图、人物、资源 Key 和出生位置
→ 构造 PreparedMapInitialization
→ executionLoop.start(initialization)
→ 获取 Runtime Snapshot
→ 首次地图 Client State 投影
→ Session running
→ system.ready
```

任何准备失败：

- Core 不初始化；
- Session 进入 failed；
- `system.initialize` 返回错误；
- 该 Frame 不应压入正式活动栈。

## 4. Prepared Initialization

```ts
interface PreparedMapInitialization {
  readonly map: MapSnapshot;
  readonly player: ActorDefinition;
  readonly actors: readonly ActorDefinition[];
  readonly spawn: SpawnPoint;
}
```

Prepared 内容必须：

- 已解析；
- 已完成当前场景深度校验；
- 不包含 Promise、Repository 或文件句柄；
- 可以同步交给 Runtime Core。

## 5. 运行中

Session running 时：

- Renderer 输入由地图子系统直接接收；
- 输入适配器提交 MapCommand 到 Execution Loop；
- Loop 驱动 Tick；
- Runtime Transaction 触发地图 Frame Scope 投影；
- Coordinator 只在出现 Effect 或生命周期控制时介入。

Coordinator 不在每个普通移动命令路径上。

## 6. 地图切换

```text
Core 完成移动
→ 产生 MapTransitionEffect
→ Loop 建立 Effect Barrier
→ Coordinator 接收 Effect
→ Session loading
→ 请求 loading Scope
→ 异步加载目标地图和人物
→ 校验目标 Portal 和出生点
→ 构造 PreparedMapTransition
→ loop.commitMapTransition(prepared)
→ Core 原子替换 Scene
→ 强制地图 Frame 完整 Client State Snapshot
→ loop.completeEffect(effectId)
→ Session running
→ 删除 loading Scope
```

异步准备期间当前 Scene 保持有效，但 Tick 和普通命令由 Effect Barrier 冻结。

## 7. Prepared Map Transition

```ts
interface PreparedMapTransition {
  readonly effectId: string;
  readonly targetMap: MapSnapshot;
  readonly actors: readonly ActorDefinition[];
  readonly playerSpawn: SpawnPoint;
}
```

Coordinator 必须验证：

- Effect 仍是当前 Pending Effect；
- 目标地图 ID 匹配；
- 目标 Portal 存在；
- Spawn 在地图范围内并允许站立；
- 人物和资源逻辑 Key 有效；
- 所有内容属于当前游戏包。

## 8. 失败语义

### 8.1 初始化失败

```text
Session starting → failed
→ system.initialize 失败
→ Frame 不激活
```

### 8.2 地图切换准备失败

如果 Core 尚未提交：

- 当前 Scene 保留；
- 完成或取消 Effect Barrier；
- Session 可以恢复 running 并发布错误 Event；
- 或根据错误严重性进入 failed。

第一阶段应为每种错误明确选择可恢复或致命策略。

### 8.3 Core 提交失败

属于不变量错误：

- Session failed；
- Loop failed；
- 地图子系统向程序主系统发送 `system.failed`。

### 8.4 子系统进程退出

由程序主系统处理，不属于 Coordinator 的恢复职责。

## 9. 程序主系统暂停和恢复

收到 `system.suspend`：

```text
停止地图输入
→ loop.pause()
→ 保留当前 Scene 和 Scope
→ 等待后续 resume 或 close
```

收到 `system.resume`：

```text
更新 activationId
→ 接收子系统返回结果
→ 地图业务适配器处理结果（如有）
→ loop.resume()
→ 必要时请求投影
```

Coordinator 不决定为什么被暂停，也不理解调用栈上方是什么系统。

## 10. 子系统返回结果

地图子系统通常作为初始系统长期运行，但它仍遵循通用返回协议。

正常退出可以返回：

```ts
interface MapSystemResult {
  readonly reason: "completed" | "quit";
}
```

退出前：

- 停止输入；
- 关闭 Loop；
- 取消未完成 Repository 请求；
- 释放资源和缓存；
- 向程序主系统发送 `system.return`。

初始地图系统返回后没有调用者，程序主系统结束会话。

## 11. Snapshot 与投影

地图 Frame Projector 读取：

```text
MapRuntimeSnapshot
+ MapSessionSnapshot
+ Projection Cause
```

Session 状态可以影响：

```text
loading
error
debug
```

Scope。

Coordinator 不直接构造 Client Node，只更新 Session Snapshot 并请求投影。

## 12. Revision

Map Session Revision 在以下变化时递增：

- lifecycle 变化；
- pendingEffectId 变化；
- error 变化。

它与以下编号分离：

```text
System Frame activationId
Map Runtime Revision
Map Session Revision
Frame Client State Revision
Scope Revision
JSON-RPC Sequence
```

## 13. Repository 边界

Coordinator 使用只读 Repository：

```text
MapRepository
ActorRepository
ResourceRepository（只读取描述或由资源服务使用）
```

Repository 负责：

- 异步读取；
- 解析；
- 局部校验；
- 同 ID 并发去重；
- 进程内缓存。

Coordinator 不实现缓存和物理路径解析。

## 14. 并发和取消

第一阶段每个地图子系统最多一个 Pending Map Effect。

- 新 Effect 在旧 Effect 未结束时是错误；
- `system.close` 可以取消未完成加载；
- 暂停 Frame 不自动取消地图加载；
- 关闭后返回的异步结果必须丢弃；
- 所有结果在提交前检查 effectId 和 Session 生命周期。

## 15. 测试

至少覆盖：

- 入口地图和人物并行加载；
- 初始化失败不激活 Frame；
- loading 在第一次 await 前可见；
- Effect Barrier 冻结 Tick 和命令；
- 目标内容准备失败时旧 Scene 保留；
- 成功切换一次性提交；
- 关闭期间迟到异步结果被丢弃；
- suspend/resume 不改变调用栈；
- Map Session Revision 独立；
- Coordinator 不在普通移动热路径。

## 16. 当前结论

```text
程序主系统
→ 调用并激活 loom.map Frame

loom.map Coordinator
→ 异步准备地图内容
→ 通过 Execution Loop 初始化或提交 Core
→ 提供 Map Session Snapshot
→ 请求本 Frame Client State 投影
```

Session Coordinator 是地图子系统内部 I/O 与同步 Core 之间的协调层，不是 LoomRealm 顶层会话或调用栈管理器。