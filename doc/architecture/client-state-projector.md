# 第一阶段 Client State Projector

## 1. 文档目的

本文档定义 LoomRealm 第一阶段 `Client State Projector` 的职责边界、投影输入、Scope Projector、版本分配、结构比较、Projection Scheduler、发布结果和错误行为。

相关文档：

- [`client-state-tree-protocol.md`](./client-state-tree-protocol.md)：定义 Client State、Scope、Roots 和 Client Node 的通用协议结构；
- [`runtime-rpc-and-state-sync.md`](./runtime-rpc-and-state-sync.md)：定义 `state.snapshot`、`scope.replace` 和 Runtime Event 的通信语义；
- [`../runtime/phase-1-runtime-core.md`](../runtime/phase-1-runtime-core.md)：定义权威游戏状态和 Runtime Snapshot；
- [`../runtime/phase-1-runtime-execution-loop.md`](../runtime/phase-1-runtime-execution-loop.md)：定义 Runtime Transaction、固定 Tick 和 Core 的唯一写入口；
- [`../runtime/phase-1-session-coordinator.md`](../runtime/phase-1-session-coordinator.md)：定义 Session 状态和地图切换协调。

核心原则：

> Runtime Core 决定游戏现在是什么状态；Client State Projector 决定该状态应如何表示为客户端目标树；Web Client 决定如何呈现该目标树。

第一阶段必须满足：

- Projector 不属于 Runtime Core；
- Projector 不参与 Runtime Core 的权威状态事务；
- Projector 只读取不可变 Runtime 和 Session 快照；
- Scope Projector 同步、确定性且无 I/O；
- Client State Revision 和 Scope Revision 由投影层统一分配；
- 一次投影提交必须原子完成；
- 单个 Scope 变化可以发布 `scope.replace`；
- 多个 Scope 变化必须发布完整 `state.snapshot`；
- 地图切换提交必须强制发布完整 `state.snapshot`；
- 投影失败不能回滚已经提交的 Runtime 状态，也不能发布部分 Client State。

## 2. 模块位置

```text
Runtime Execution Loop
    └── RuntimeTransaction + RuntimeSnapshot
                    ↓

Session Coordinator
    └── SessionSnapshot
                    ↓

Projection Scheduler
    ├── 合并连续状态请求
    ├── 保留最新 Projection Frame
    └── 在 Core 事务外调度投影
                    ↓

Client State Projector
    ├── Scope Projector Registry
    ├── Tree Validation
    ├── Structural Equality
    ├── State Revision
    └── Scope Revision
                    ↓

Projection Commit
    ├── unchanged
    ├── snapshot
    └── scope-replace
                    ↓

Runtime Service
    ├── state.snapshot
    └── scope.replace
```

职责边界：

```text
Runtime Core
    权威状态和游戏规则

Runtime Execution Loop
    串行执行命令、Tick 和控制操作

Session Coordinator
    异步内容准备和 Session 状态

Client State Projector
    将只读游戏/会话状态转换为 Client State

Runtime Service
    将 Projection Commit 转换为通信消息

Web Client
    维护 Client Store 并协调 DOM
```

## 3. Client State Projector 职责

Client State Projector 负责：

- 接收完整的 `ProjectionFrame`；
- 调用已经注册的 Scope Projector；
- 生成 Scope 的有序 `roots[]`；
- 验证 Client Node Tree；
- 比较新旧 Scope 内容；
- 判断 Scope 是新增、变化、未变化还是删除；
- 分配 `ClientState.revision`；
- 分配 `ClientScope.revision`；
- 原子建立下一个完整 Client State；
- 返回传输无关的 Projection Commit；
- 保存最近一次成功提交的 Client State。

Client State Projector 不负责：

- 修改 Runtime Core；
- 调用 Runtime Core 写操作；
- 调用 Repository；
- 异步加载地图、人物或资源；
- 读取图片、音频等资源主体；
- 处理 Runtime Effect；
- 执行 DOM 操作；
- 处理 JSON-RPC、WebSocket 或 HTTP；
- 分配 Runtime RPC Message Sequence；
- 保存权威游戏状态；
- 存档。

## 4. 投影输入

Projector 不应分别读取多个持续变化的对象。每次投影必须接收一次性组合好的不可变输入：

```ts
interface ProjectionFrame {
  readonly runtime: RuntimeSnapshot;

  readonly session: SessionSnapshot;

  /**
   * 产生当前 Runtime Snapshot 的最近 Runtime Transaction ID。
   *
   * 仅发生 Session 状态变化时，可以沿用最近一次 Transaction ID。
   */
  readonly runtimeTransactionId: number;

  readonly cause: ProjectionCause;
}
```

投影原因：

```ts
type ProjectionCause =
  | {
      readonly type: "initial";
    }
  | {
      readonly type: "runtime-transaction";
      readonly kind: RuntimeOperationKind;
    }
  | {
      readonly type: "session-change";
    }
  | {
      readonly type: "resync";
    };
```

`ProjectionFrame` 是一个一致的观察点：

```text
RuntimeSnapshot
+ SessionSnapshot
+ 最近 Runtime Transaction
+ Projection Cause
= 一个完整投影输入
```

Projector 不允许在投影执行过程中重新读取 Runtime Core 或 Session Coordinator 的可变字段。

## 5. Session Snapshot

Session Coordinator 应暴露只读 Session Snapshot：

```ts
interface SessionSnapshot {
  readonly revision: number;

  readonly state:
    | "starting"
    | "running"
    | "loading"
    | "failed"
    | "closed";

  readonly error?: SessionError;
}
```

Session Revision 在客户端可观察的 Session 状态变化时递增：

```text
starting → running
running → loading
loading → running
running/loading → failed
任意非 closed 状态 → closed
```

以下变化不增加 Runtime Revision：

- Session 进入 `loading`；
- Session 加载失败后恢复为 `running`；
- Session 记录加载错误；
- Session 关闭流程状态变化。

Runtime Revision 和 Session Revision 必须独立。

## 6. Scope Projector

基础投影系统不固定 `world`、`menu`、`loading` 或其他业务 Scope。

业务通过注册 Scope Projector 扩展：

```ts
interface ScopeProjector {
  /**
   * 当前 Projector 唯一拥有的 Scope 名称。
   */
  readonly scope: string;

  /**
   * 判断当前输入是否可能影响该 Scope。
   *
   * 首次投影和强制完整投影时必须调用 project()。
   */
  shouldProject(
    previous: ProjectionFrame | null,
    next: ProjectionFrame,
  ): boolean;

  /**
   * 返回该 Scope 的目标内容。
   *
   * null 表示当前状态下该 Scope 不应存在。
   */
  project(
    frame: ProjectionFrame,
  ): ClientScopeContent | null;
}
```

Scope Projector 返回的业务内容不包含 Revision：

```ts
interface ClientScopeContent {
  readonly roots: readonly ClientNode[];
}
```

禁止由业务 Scope Projector 自行分配 `ClientScope.revision`：

```ts
// 禁止
interface InvalidScopeProjector {
  project(frame: ProjectionFrame): ClientScope;
}
```

Revision 只能由顶层 Client State Projector 统一分配。

## 7. Scope 所有权

第一阶段冻结：

> 一个 Scope 只能由一个 Scope Projector 拥有。

注册时必须检测重复：

```ts
register(projector: ScopeProjector): void {
  if (this.projectors.has(projector.scope)) {
    throw new ClientProjectionConfigurationError(
      `Duplicate scope projector: ${projector.scope}`,
    );
  }

  this.projectors.set(projector.scope, projector);
}
```

多个业务模块需要共同影响一个 Scope 时，应由一个组合 Projector 统一组织：

```text
WorldScopeProjector
├── Map subtree
├── Actor subtree
└── World effect subtree
```

不允许多个模块分别写入同一个 Scope 的 Roots。

## 8. Scope Projector 纯函数约束

每个 Scope Projector 必须满足：

```text
相同 ProjectionFrame
→ 相同 ClientScopeContent
```

禁止在 Scope Projector 中使用：

```ts
Date.now();
Math.random();
fetch(...);
repository.load(...);
document.createElement(...);
```

Scope Projector 允许读取：

- Runtime Snapshot；
- Session Snapshot；
- Runtime Scene 中已经加载的只读静态定义；
- 逻辑资源 Key；
- 确定性的投影配置；
- 已注册的 Tag/Data Schema 元数据。

节点 Data 只能引用逻辑资源 Key：

```json
{
  "sprite": "actor.sprite/player"
}
```

不能暴露游戏包物理路径：

```json
{
  "path": "/home/user/game/images/player.png"
}
```

## 9. Client State Projector 接口

```ts
interface ClientStateProjector {
  /**
   * 所有 Scope Projector 必须在首次 project() 前注册完成。
   */
  register(projector: ScopeProjector): void;

  project(
    frame: ProjectionFrame,
    options?: ProjectionOptions,
  ): ProjectionCommit;

  getCurrentState(): ClientState | null;
}
```

投影选项：

```ts
interface ProjectionOptions {
  /**
   * 强制返回完整状态。
   *
   * 用于初始投影、地图提交和显式恢复。
   */
  readonly forceSnapshot?: boolean;
}
```

首次 `project()` 后不得再注册或移除 Scope Projector。第一阶段不支持运行时动态修改投影器 Registry。

## 10. Projection Commit

Projector 不直接创建 JSON-RPC 消息，而是返回传输无关的提交结果：

```ts
type ProjectionCommit =
  | ProjectionUnchanged
  | ProjectionSnapshot
  | ProjectionScopeReplace;
```

没有客户端可见变化：

```ts
interface ProjectionUnchanged {
  readonly type: "unchanged";
  readonly state: ClientState;
}
```

完整 Client State：

```ts
interface ProjectionSnapshot {
  readonly type: "snapshot";

  readonly state: ClientState;

  readonly changedScopes: readonly string[];
}
```

单 Scope 替换：

```ts
interface ProjectionScopeReplace {
  readonly type: "scope-replace";

  readonly state: ClientState;

  readonly stateRevision: number;

  readonly scope: string;

  readonly value: ClientScope | null;
}
```

Runtime Service 转换规则：

```text
ProjectionSnapshot
→ state.snapshot

ProjectionScopeReplace
→ scope.replace

ProjectionUnchanged
→ 不发送状态消息
```

## 11. Revision 规则

Projector 内部保存最近一次成功提交的 Client State：

```ts
private currentState: ClientState | null;
```

首次成功投影：

```text
ClientState.revision = 1
每个存在的 ClientScope.revision = 1
```

后续投影：

```text
Scope 内容未变化
→ 保留旧 ClientScope
→ Scope Revision 不变

Scope 内容变化
→ Scope Revision + 1

Scope 新增
→ Scope Revision = 1

Scope 删除
→ 输出 value: null

至少一个 Scope 变化
→ ClientState.revision + 1

没有 Scope 变化
→ ClientState.revision 不变
```

示例：

```text
投影前：
Client State Revision = 10
world Revision = 6
overlay Revision = 2

仅 world 改变：
Client State Revision = 11
world Revision = 7
overlay Revision = 2
```

必须区分：

```text
RuntimeTransaction.id
    Core 操作顺序

RuntimeState.revision
    权威游戏状态版本

SessionSnapshot.revision
    会话控制状态版本

ClientState.revision
    整个客户端目标状态版本

ClientScope.revision
    单个 Scope 目标树版本

Runtime RPC sequence
    Server 消息顺序
```

这些编号不能互相复制或混用。

## 12. Scope 内容比较

第一阶段使用结构比较判断 Scope 内容是否变化：

```ts
function equalScopeContent(
  left: ClientScopeContent,
  right: ClientScopeContent,
): boolean;
```

比较范围：

- Roots 数量和顺序；
- Node Key；
- Node Tag；
- Node Data；
- Children 数量、顺序和递归结构。

不比较 Revision，因为 Scope Projector 返回的 `ClientScopeContent` 不包含 Revision。

第一阶段使用递归深比较，原因是：

- Scope 数量较少；
- Client State 不包含图片或二进制资源主体；
- 大型地图内容应通过逻辑资源 Key 引用；
- 深比较行为容易测试和审查。

后续性能不足时，可以增加确定性 Fingerprint，但 Fingerprint 不进入客户端协议。

## 13. 原子投影事务

一次 `project()` 必须按照以下顺序执行：

```text
读取旧 Client State
→ 选择需要重新计算的 Scope
→ 计算全部候选 Scope Content
→ 验证全部候选 Tree
→ 比较新旧 Scope Content
→ 构建完整 Next Client State
→ 一次性替换 currentState
→ 返回 Projection Commit
```

禁止边计算边修改 `currentState`：

```ts
// 禁止
this.currentState.scopes.world = nextWorld;

// 后续 overlay 投影失败
```

任意 Scope Projector 抛错或 Tree 验证失败时：

- `currentState` 保持不变；
- 不增加 Client State Revision；
- 不增加任何 Scope Revision；
- 不发送任何部分更新；
- 抛出 `ClientProjectionError`；
- 不回滚 Runtime Core 已经提交的事务。

## 14. Tree 验证

每个候选 Scope 在提交前必须验证：

- `roots` 是数组；
- 整个 Scope 内 Key 唯一；
- Key 非空且长度合法；
- Tag 非空且长度合法；
- Tag 已在业务 Node Schema Registry 注册；
- Data 是合法 JSON 值；
- Data 满足对应 Tag 的 Schema；
- Children 是数组；
- Tree 没有循环引用；
- Tree 深度不超过限制；
- Scope 节点总数不超过限制；
- 单节点 Data 大小不超过限制；
- 整个 Scope 序列化大小不超过限制。

限制接口：

```ts
interface ClientTreeLimits {
  readonly maxDepth: number;
  readonly maxNodesPerScope: number;
  readonly maxDataBytesPerNode: number;
  readonly maxScopeBytes: number;
}
```

第一阶段建议默认值：

```ts
const phase1ClientTreeLimits = {
  maxDepth: 32,
  maxNodesPerScope: 10_000,
  maxDataBytesPerNode: 64 * 1024,
  maxScopeBytes: 4 * 1024 * 1024,
} satisfies ClientTreeLimits;
```

这些值是安全上限，不是建议业务使用到上限。

## 15. 发布选择

第一阶段通信协议只有：

```text
state.snapshot
scope.replace
```

没有多 Scope 原子 Patch。

因此 Projection Commit 选择规则冻结为：

```text
0 个 Scope 变化
→ unchanged

1 个 Scope 变化
→ scope-replace

2 个或更多 Scope 变化
→ snapshot

首次成功投影
→ snapshot

forceSnapshot = true
→ snapshot
```

这样可以避免多个 `scope.replace` 使客户端短暂处于跨 Scope 不一致状态。

例如地图切换同时影响：

```text
world
hud
overlay
```

必须发布一个完整 Snapshot，而不是连续发布三个 Scope Replace。

第一阶段不新增 `scopes.replace-batch` 消息。

## 16. Scope 新增、删除和空 Scope

Scope Projector 返回 `ClientScopeContent`：

```text
旧 Scope 不存在
→ 新增 Scope
→ Scope Revision = 1
```

Scope Projector 返回 `null`：

```text
旧 Scope 存在
→ 删除 Scope
→ value: null

旧 Scope 不存在
→ 无变化
```

空 Scope 使用：

```ts
{
  roots: [],
}
```

空 Scope 和删除 Scope 含义不同：

```text
roots: []
    Scope 存在，但没有节点

null
    Scope 不存在
```

## 17. Projection Scheduler

Runtime Execution Loop 的 Sink 是同步通知，不应在 Core Transaction 回调栈中执行完整投影。

第一阶段增加独立 Projection Scheduler：

```ts
interface ProjectionScheduler {
  request(
    frame: ProjectionFrame,
    options?: ProjectionOptions,
  ): void;

  flush(): Promise<void>;

  stop(): void;
}
```

链路：

```text
Execution Loop Transaction Sink
→ 收集最新 Runtime Snapshot
→ 组合 Session Snapshot
→ projectionScheduler.request(frame)
→ 立即返回 Execution Loop

Projection Scheduler
→ 后续 Microtask 或 Scheduler Turn
→ clientStateProjector.project(frame)
→ Projection Commit Sink
```

Projector 不增加 Runtime Core 操作的同步执行时间，也不能阻塞下一个 Core Transaction。

## 18. 投影请求合并

Runtime Execution Loop 可能在一次调度周期内产生多个 Tick Transaction：

```text
tick revision 21
tick revision 22
tick revision 23
```

Client State 表示目标状态，不要求发布所有中间状态。

Projection Scheduler 可以只投影最新 Frame：

```text
revision 21
revision 22
revision 23
→ project revision 23
```

合并规则：

- 始终保留最新 Projection Frame；
- 连续普通 Tick 请求可以合并；
- `forceSnapshot` 使用逻辑 OR 合并；
- 地图提交的 `forceSnapshot` 不能被后续普通请求降级；
- 新 Session Revision 不能被旧 Session Frame 覆盖；
- 新 Runtime Revision 不能被旧 Runtime Frame 覆盖；
- `failed` 和 `closed` 状态不能被旧 Frame 覆盖；
- Runtime Event 不通过 Projection Scheduler 合并。

示意：

```ts
request(
  frame: ProjectionFrame,
  options: ProjectionOptions = {},
): void {
  this.pending = {
    frame: selectNewestFrame(
      this.pending?.frame,
      frame,
    ),

    forceSnapshot:
      this.pending?.forceSnapshot === true ||
      options.forceSnapshot === true,
  };

  this.scheduleFlush();
}
```

## 19. Runtime Event 与 Client State 分离

Projection Scheduler 可以合并中间状态 Frame，但不能丢弃 Runtime Event。

```text
RuntimeTransaction
├── RuntimeSnapshot → Projection Scheduler
├── RuntimeEvent    → Runtime Event Publisher
└── RuntimeEffect   → Session Coordinator
```

Projector 只负责：

```text
客户端现在应该呈现什么
```

Projector 不负责保存或重放：

```text
刚才发生了什么
```

一次性声音、提示、日志和表现事件由 Runtime Service 的独立 Event 通道发布。

## 20. Session 状态投影

Session Coordinator 发生客户端可见状态变化时，必须请求一次投影：

```ts
projectionScheduler.request({
  runtime: latestRuntimeSnapshot,
  session: coordinator.getSnapshot(),
  runtimeTransactionId:
    latestRuntimeTransactionId,
  cause: {
    type: "session-change",
  },
});
```

例如：

```text
running → loading
→ loading 相关 Scope 可以新增或改变

loading → running
→ loading 相关 Scope 可以删除

running/loading → failed
→ error 相关 Scope 可以新增
```

Session-only 变化不要求 Runtime Core 增加 Revision。

## 21. 地图切换投影

地图切换投影流程：

```text
Portal Effect
→ Session = loading
→ 请求 Session Change Projection

Execution Loop pause
→ Runtime paused
→ 根据业务需要投影暂停状态

Repository 异步准备目标内容

Execution Loop commitMapTransition
→ 新 Runtime Scene 已原子提交
→ 请求 forceSnapshot Projection

Execution Loop completeEffect
→ 清除 Effect Barrier

Session = running
→ 请求 Session Change Projection

Execution Loop resume
→ Runtime 恢复 Tick
```

地图提交必须调用：

```ts
projectionScheduler.request(frame, {
  forceSnapshot: true,
});
```

地图提交 Snapshot 可以同时包含：

- 新地图 World Scope；
- 新人物状态；
- 新 HUD 状态；
- 仍然存在的 Loading Scope。

随后 Session 返回 `running` 时，可以通过单个 Scope Replace 删除 Loading Scope。

客户端资源仍通过独立资源接口异步获取，不阻塞 Runtime 恢复。

## 22. Resync

客户端请求完整恢复时，不需要增加 Client State Revision。

若 Projector 已经建立 Client State：

```ts
const state =
  clientStateProjector.getCurrentState();
```

Runtime Service 重新发送当前状态：

```text
现有 ClientState
→ state.snapshot
```

重新发送不是新的投影提交，因此：

- Client State Revision 不变；
- Scope Revision 不变；
- Runtime RPC Sequence 正常递增。

若 Client State 尚未建立，则使用最新 Runtime Snapshot 和 Session Snapshot 执行首次投影。

## 23. Projector 错误

```ts
interface ClientProjectionError {
  readonly code:
    | "SCOPE_PROJECTOR_FAILED"
    | "DUPLICATE_SCOPE"
    | "DUPLICATE_NODE_KEY"
    | "UNKNOWN_NODE_TAG"
    | "INVALID_NODE_DATA"
    | "TREE_LIMIT_EXCEEDED"
    | "NON_DETERMINISTIC_PROJECTION";

  readonly scope?: string;
  readonly key?: string;
  readonly message: string;
  readonly cause?: unknown;
}
```

错误规则：

- 投影失败不改变 `currentState`；
- 投影失败不增加任何 Client Revision；
- 投影失败不修改 Runtime；
- 投影失败不回滚 Runtime Transaction；
- 投影失败不发送部分 Client State；
- 初始投影失败属于启动致命错误；
- 运行期间投影失败必须保留最后一个完整 Client State；
- 运行期间投影失败不能让 Runtime 无限制继续推进而客户端永久停留在旧状态。

第一阶段宿主处理策略：

```text
初始 Projection 失败
→ Session failed
→ Execution Loop fail 或 close
→ Runtime Service 不进入 ready

运行期间 Projection 失败
→ 保留最后 Client State
→ Execution Loop pause/fail
→ Session failed
→ Runtime Service 发布明确服务错误
```

Projection Error 属于投影或宿主故障，不属于游戏业务拒绝。

## 24. 参考实现结构

```text
src/client-state/
├── client-state.ts
├── client-node.ts
├── client-scope.ts
├── client-state-projector.ts
├── scope-projector.ts
├── projection-frame.ts
├── projection-commit.ts
├── projection-error.ts
├── projection-scheduler.ts
├── tree-validator.ts
└── structural-equality.ts
```

具体业务 Projector：

```text
src/game-client-projection/
├── world-scope-projector.ts
├── session-scope-projector.ts
└── debug-scope-projector.ts
```

`world`、`session` 和 `debug` 只是实现示例，不属于基础协议固定 Scope。

## 25. 投影事务伪代码

```ts
class DefaultClientStateProjector
  implements ClientStateProjector {
  private currentState:
    ClientState | null = null;

  private previousFrame:
    ProjectionFrame | null = null;

  private readonly projectors =
    new Map<string, ScopeProjector>();

  project(
    frame: ProjectionFrame,
    options: ProjectionOptions = {},
  ): ProjectionCommit {
    const previousState = this.currentState;

    const candidateScopes = new Map(
      Object.entries(
        previousState?.scopes ?? {},
      ),
    );

    const changes: ScopeChange[] = [];

    for (
      const projector of
      this.projectors.values()
    ) {
      const mustProject =
        previousState === null ||
        options.forceSnapshot === true ||
        projector.shouldProject(
          this.previousFrame,
          frame,
        );

      if (!mustProject) {
        continue;
      }

      const content =
        projector.project(frame);

      const previousScope =
        candidateScopes.get(
          projector.scope,
        );

      if (content === null) {
        if (previousScope !== undefined) {
          candidateScopes.delete(
            projector.scope,
          );

          changes.push({
            scope: projector.scope,
            value: null,
          });
        }

        continue;
      }

      validator.validate(
        projector.scope,
        content.roots,
      );

      if (
        previousScope !== undefined &&
        equalRoots(
          previousScope.roots,
          content.roots,
        )
      ) {
        continue;
      }

      const nextScope: ClientScope = {
        revision:
          previousScope === undefined
            ? 1
            : previousScope.revision + 1,

        roots: content.roots,
      };

      candidateScopes.set(
        projector.scope,
        nextScope,
      );

      changes.push({
        scope: projector.scope,
        value: nextScope,
      });
    }

    if (
      previousState !== null &&
      changes.length === 0
    ) {
      this.previousFrame = frame;

      return {
        type: "unchanged",
        state: previousState,
      };
    }

    const nextState: ClientState = {
      version: 1,

      revision:
        previousState === null
          ? 1
          : previousState.revision + 1,

      scopes: Object.fromEntries(
        candidateScopes,
      ),
    };

    // 实际实现必须先完成全部计算和验证，
    // 最后才更新实例字段。
    this.currentState = nextState;
    this.previousFrame = frame;

    if (
      previousState === null ||
      options.forceSnapshot === true ||
      changes.length !== 1
    ) {
      return {
        type: "snapshot",
        state: nextState,
        changedScopes:
          changes.map(
            (change) => change.scope,
          ),
      };
    }

    const change = changes[0];

    return {
      type: "scope-replace",
      state: nextState,
      stateRevision: nextState.revision,
      scope: change.scope,
      value: change.value,
    };
  }
}
```

实际实现必须使用临时候选状态；上方伪代码中的实例字段只能在所有 Scope 投影和验证成功后更新。

## 26. 测试要求

Client State Projector 必须覆盖：

1. 首次投影生成 Client State Revision 1；
2. 首次存在的 Scope Revision 为 1；
3. 相同输入不增加 Revision；
4. 单 Scope 内容变化输出 `scope-replace`；
5. 多 Scope 内容变化输出完整 Snapshot；
6. `forceSnapshot` 强制输出完整 Snapshot；
7. Scope 新增；
8. Scope 删除；
9. 空 Scope `roots: []` 与删除不同；
10. Scope 内重复 Key 导致整个投影失败；
11. Projector 抛错时保留旧 Client State；
12. 未注册 Tag 导致投影失败；
13. Tag Data Schema 不匹配导致投影失败；
14. Runtime、Session、Client State 和 Scope Revision 相互独立；
15. 连续 Tick Frame 可以合并到最新状态；
16. Runtime Event 不因 Frame 合并而丢失；
17. 地图提交强制完整 Snapshot；
18. Resync 不增加 Client State Revision；
19. Projector 不读取资源主体；
20. Projector 不修改 Runtime Snapshot；
21. 多个 Projector 不能拥有同一个 Scope；
22. 相同 Frame 产生结构一致的 Client State；
23. Tree 深度、节点数和 Data 大小限制有效；
24. 初始投影失败不会留下半初始化 Client State；
25. 运行期间投影失败不会发布部分状态。

测试应使用固定 Runtime Snapshot、Session Snapshot 和 Golden Client State，不依赖真实时钟、网络、Repository 或 DOM。

## 27. 第一阶段冻结决策

| 问题 | 第一阶段结论 |
|---|---|
| 权威状态 | Runtime Core |
| 投影输入 | Runtime Snapshot + Session Snapshot |
| 投影调度 | 独立 Projection Scheduler |
| 投影单位 | Scope |
| Scope 所有权 | 一个 Scope 对应一个 Scope Projector |
| Projector 执行 | 同步、确定性、无 I/O |
| Revision 分配 | Client State Projector |
| Scope 比较 | 结构深比较 |
| 无变化 | 不发布状态消息 |
| 单 Scope 变化 | `scope.replace` |
| 多 Scope 变化 | `state.snapshot` |
| 地图切换 | 强制 `state.snapshot` |
| Scope 新增 | Revision 从 1 开始 |
| Scope 删除 | Projector 返回 `null` |
| 空 Scope | `roots: []` |
| Tick 投影 | 可以合并到最新 Frame |
| Runtime Event | 独立发布，不参与投影合并 |
| Resync | 重发当前 Snapshot，不增加 Revision |
| 投影失败 | 保留旧 Client State，不发布部分状态 |
| Core 回滚 | 禁止 |
| Resource Body | 不进入投影 |
| DOM | 不进入投影 |
| 动态注册 Projector | 第一阶段不支持 |

## 28. 当前结论

```text
RuntimeSnapshot + SessionSnapshot
              ↓
       Projection Scheduler
              ↓
    Client State Projector
              ↓
      Scope Projectors
              ↓
 Projection Commit
 ├── unchanged
 ├── snapshot
 └── scope-replace
              ↓
       Runtime Service
```

Client State Projector 是权威游戏状态与客户端目标状态之间的唯一转换层。Runtime Core 不生成 Scope Tree；Runtime Service 不自行拼接 Client State；Web Client 不解释 Runtime 内部状态。业务通过 Scope Projector、Tag 和 Data Schema 扩展客户端状态，而不修改基础同步协议。