# 第一阶段地图子系统 Runtime Core

> 状态：**Active Design**  
> 适用范围：内置 `loom.map` 模块子系统  
> 最近复核：2026-07-28  
> 主要定义：地图子系统权威状态、同步规则、移动、碰撞和地图提交

相关文档：

- [`../architecture/main-system-and-subsystems.md`](../architecture/main-system-and-subsystems.md)：程序主系统和子系统调用栈；
- [`phase-1-runtime-execution-loop.md`](./phase-1-runtime-execution-loop.md)：地图子系统内部调度；
- [`phase-1-session-coordinator.md`](./phase-1-session-coordinator.md)：地图内容异步准备；
- [`../architecture/client-state-projector.md`](../architecture/client-state-projector.md)：子系统本地投影。

核心原则：

> 本文档中的 Runtime Core 只属于 `loom.map` 子系统。它不是程序主系统，也不是其他模块子系统必须实现的公共接口。

## 1. 职责

Runtime Core 负责：

- 维护当前地图、玩家人物和场景人物状态；
- 维护玩家位置、朝向和移动阶段；
- 维护地图子系统逻辑时间和 Revision；
- 处理方向意图、单格移动和碰撞；
- 检测 Portal；
- 产生地图切换 Effect；
- 原子提交已准备的地图切换；
- 统一暂停和恢复；
- 提供不可变 Runtime Snapshot。

Runtime Core 不负责：

- 程序主系统调用栈；
- 启动或关闭其他子系统；
- JSON-RPC 和 Renderer 连接；
- 文件、网络和 Repository I/O；
- Client Scope、DOM 或资源主体；
- 菜单、对话和其他子系统规则。

## 2. 约束

Runtime Core 必须：

- 同步；
- 确定性；
- 无文件或网络 I/O；
- 不返回 Promise；
- 不被并发或重入调用；
- 只通过地图子系统 Execution Loop 修改；
- 使用已加载、已校验的结构化内容。

## 3. 状态模型

```ts
interface MapRuntimeState {
  readonly lifecycle: "created" | "running" | "failed" | "closed";
  readonly revision: number;
  readonly simulationTimeMs: number;
  readonly pauseDepth: number;
  readonly scene: MapSceneState | null;
  readonly failure: MapRuntimeFailure | null;
}

interface MapSceneState {
  readonly map: MapSnapshot;
  readonly actors: Readonly<Record<string, RuntimeActorState>>;
  readonly playerActorId: string;
}

interface RuntimeActorState {
  readonly actorId: string;
  readonly tile: { readonly x: number; readonly y: number };
  readonly facing: Direction;
  readonly movement: MovementState;
}
```

Runtime State 不包含：

- `frameId` 或调用栈；
- Scope、Tag 和 Client Node；
- Repository、Promise 和文件句柄；
- DOM、动画和图片字节。

## 4. 初始化

地图子系统接收 `system.initialize` 后，由内部 Coordinator 准备入口地图和玩家人物，再通过 Execution Loop 调用：

```ts
initialize(input: PreparedMapInitialization): RuntimeResult;
```

初始化必须一次性提交：

- 当前地图；
- 玩家人物；
- 出生位置和方向；
- 场景人物；
- Runtime Lifecycle；
- 初始 Revision。

失败时不产生部分可运行 Scene。

## 5. 命令

第一阶段地图命令：

```ts
type MapCommand =
  | {
      readonly type: "direction-intent.set";
      readonly direction: Direction;
    }
  | {
      readonly type: "direction-intent.clear";
    }
  | {
      readonly type: "interact";
    };
```

持续移动语义冻结为方向意图：

- 按下方向发送 `direction-intent.set`；
- 松开或失焦发送 `direction-intent.clear`；
- Core 在一步结束后，如果意图仍有效，可以开始下一步；
- 同一人物同一时间最多存在一个移动事务；
- 暂停时不开始或推进移动。

这取代“一次输入只移动一步”和“服务端持续方向意图”之间的旧歧义。

## 6. Tick

```ts
tick(deltaMs: number): RuntimeResult;
```

Tick 负责：

- 增加逻辑时间；
- 推进当前移动；
- 完成单格移动；
- 在一步结束后检查持续方向意图；
- 检测 Portal；
- 产生 Runtime Event 或 Effect。

Tick 不执行异步等待，也不读取内容。

## 7. 移动和碰撞

开始移动前检查：

```text
当前 Lifecycle 允许
→ 未暂停
→ 人物未处于移动中
→ 方向有效
→ 当前格允许向该方向离开
→ 目标格允许从相反方向进入
→ 目标格在地图范围内
→ 目标格没有静态或动态占用
→ 创建 Movement State
```

移动期间权威目标格和表现插值必须分离。Client 可以根据 Scope 在像素间插值，但不能自行决定移动是否成功。

## 8. Portal 和 Effect

人物完成一步后检测 Portal。命中时产生：

```ts
interface MapTransitionEffect {
  readonly type: "map.transition";
  readonly effectId: string;
  readonly sourceMapId: string;
  readonly targetMapId: string;
  readonly targetPortalId: string;
}
```

Core 只产生 Effect，不加载目标地图。

Execution Loop 建立 Effect Barrier，Coordinator 异步准备目标场景。

## 9. 地图切换提交

Coordinator 返回：

```ts
interface PreparedMapTransition {
  readonly effectId: string;
  readonly targetMap: MapSnapshot;
  readonly actors: readonly ActorDefinition[];
  readonly playerSpawn: SpawnPoint;
}
```

Core 执行同步提交：

```text
验证 effectId
→ 验证目标场景
→ 构造完整新 Scene
→ 一次性替换旧 Scene
→ Runtime Revision + 1
```

提交失败时旧 Scene 保持完整有效。

## 10. 暂停

```ts
pause(): RuntimeResult;
resume(): RuntimeResult;
```

使用 `pauseDepth` 支持嵌套暂停。

程序主系统执行 `system.suspend` 时，地图子系统应暂停输入，并可以通过 Execution Loop 增加暂停深度或停止 Tick 调度。

程序主系统执行 `system.resume` 时，地图子系统使用新 `activationId` 恢复输入。调用栈本身不进入 Runtime Core。

## 11. Runtime Result

```ts
interface RuntimeResult {
  readonly changed: boolean;
  readonly snapshot: MapRuntimeSnapshot;
  readonly events: readonly MapRuntimeEvent[];
  readonly effects: readonly MapRuntimeEffect[];
}
```

Runtime Event 与 Effect 分离：

- Event 是已经发生的一次性结果；
- Effect 请求外部异步准备；
- Snapshot 是可恢复状态；
- Client Scope 由地图子系统 Projector 生成。

## 12. Revision

Runtime Revision 在权威地图状态发生变化时递增。

必须与以下编号区分：

```text
Frame activationId
Execution Transaction ID
Map Runtime Revision
Frame Client State Revision
Scope Revision
JSON-RPC Sequence
```

## 13. Snapshot

```ts
interface MapRuntimeSnapshot {
  readonly lifecycle: string;
  readonly revision: number;
  readonly simulationTimeMs: number;
  readonly paused: boolean;
  readonly scene: ReadonlyMapSceneSnapshot | null;
  readonly failure: MapRuntimeFailure | null;
}
```

Snapshot 必须不可变，供地图子系统 Projector 在 Core 事务外读取。

## 14. 故障和关闭

- 内容准备失败但未提交：Coordinator 处理，旧 Scene 保留；
- Core 规则不变量被破坏：Runtime 进入 failed；
- 子系统进程异常退出：程序主系统生成 failed SystemResult；
- `system.close`：地图子系统停止输入、关闭 Loop 并释放 Repository；
- Core 关闭后拒绝命令和 Tick。

## 15. 测试

至少覆盖：

- 初始化成功和失败；
- 方向意图设置、替换和清除；
- 连续移动；
- 地图边界和方向通行；
- 静态和动态占用；
- 暂停期间不推进；
- Portal Effect；
- 地图切换原子提交；
- 相同输入产生相同 Snapshot、Event 和 Effect；
- `system.suspend/resume` 不污染调用栈状态。

## 16. 当前结论

```text
Renderer 输入
→ 地图子系统
→ Execution Loop
→ Runtime Core
→ Map Runtime Snapshot
→ 地图子系统 Projector
→ Frame Scopes
→ Renderer
```

Runtime Core 是地图子系统内部的权威规则核心，而程序主系统只管理该子系统 Frame 的调用和生命周期。