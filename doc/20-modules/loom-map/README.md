# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：第一阶段地图 Subsystem 的内部模块和依赖方向  
> 依赖：[模块子系统模型](../../10-architecture/subsystem-model.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[渲染系统](../../10-architecture/rendering-system.md)  
> 最近复核：2026-08-04

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

它不拥有 Frame Stack / Activation，也不把 Runtime ready 当 Frame ready。

## 3. Frame Control Adapter

Batch A/B 已冻结本地模型和 RPC surface。

地图内部 Frame Context 只需要 Subsystem 本地执行所需信息，例如：

```ts
interface MapFrameContext {
  readonly frameId: string;
  state: "starting" | "active" | "suspended" | "closing" | "closed";
  currentActivationId: string | null;
}
```

**不建议保存公共 `callerFrameId` 副本**。Caller relationship 是 Main-owned；地图业务若需要“调用来源”信息，应通过 `frame.initialize.input` 显式传入业务字段。

Batch B exact adapter：

```text
Main → loom.map
    frame.initialize({ frameId, input })
    frame.activate({ frameId, activationId })
    frame.suspend({ frameId, activationId })
    frame.resume({ frameId, activationId, returnedFrameId, result })
    frame.close({ frameId })

loom.map → Main
    frame.call({ frameId, activationId, targetSubsystemKey, input })
        → { childFrameId }
    frame.return({ frameId, activationId, result })
        → {}
```

地图实现 MUST NOT：

- 创建公共 `frameId / activationId`；
- 恢复 revoked Activation；
- 增加 Frame `ready / initialized / frame.status`；
- 使用 `system.call / system.return`；
- 增加独立 `frame.result`；
- 给 `frame.close` 增加 reason；
- 要求 `frame.initialize` 或 `frame.return` 携带 callerFrameId；
- 把业务 failure 表示为永久 Frame `failed` lifecycle state。

## 4. Frame Outcome

地图调用结果使用 Batch B：

```ts
type FrameOutcome =
  | { type: "completed"; value: JsonValue }
  | { type: "cancelled" }
  | { type: "failed"; error: FrameFailure };
```

无业务返回值必须显式：

```json
{ "type": "completed", "value": null }
```

`FrameOutcome.failed` 是调用结果，不是 JSON-RPC Error。

## 5. Frame Input Adapter

```text
frameId + activationId
→ locate Frame Context
→ require lifecycle == active
→ require activationId == currentActivationId
→ normalize intent/action
→ submit command to map runtime
```

revoked Activation 必须永久拒绝。

```text
F1/A1 active
→ F1 suspended
→ later frame.resume(F1, A3, ...)
→ F1/A3 active

late F1/A1 input
→ reject
```

持续移动使用方向意图，不依赖浏览器 key-repeat frequency。Input Adapter 不负责 Render 路由。

## 6. Resume Handling

`frame.resume` 必须作为一个本地控制操作，同时：

```text
deliver returned child FrameOutcome
+
install replacement activationId
```

地图实现不得公开拆成：

```text
resume result
→ later activate
```

否则会产生“业务已经恢复但输入 epoch 尚未切换”的可观察中间状态。

Batch C 以后再决定 Main/Renderer 的跨系统 commit barrier。

## 7. Call / Return

地图发起 Child call：

```text
frame.call({
  frameId,
  activationId,
  targetSubsystemKey,
  input
})
→ { childFrameId }
```

same-Subsystem call 合法，也必须产生新的 `childFrameId`，但仍在同一 `loom.map` Process 内维护多个 Frame Context。

`frame.call` 只建立调用，不等待 Child 最终结果。

地图结束当前 Frame：

```text
frame.return({ frameId, activationId, result })
```

地图不选择 Caller/receiver；Main 根据 Registry 决定接收方，并最终通过 `frame.resume` 把 result 交给 Caller。

## 8. Frame Lifecycle 与地图业务状态

Frame operation **不自动**：

- 启停整个地图 Runtime Loop；
- 创建/隐藏/销毁 Render；
- 删除共享 world state；
- 清空 Repository Cache；
- 创建新的 Process / Data Connection。

如果地图业务希望某个 Frame lifecycle 影响内部 Session 或 Render，由 `loom.map` 显式实现。

Outcome 与 lifecycle 分离：即使 result = failed，Context cleanup 仍走 `closing → closed`。

## 9. Repositories / Session Coordinator

Repositories 按需加载地图、人物和资源描述，负责解析、校验、并发去重和 Container 级不可变缓存，不依赖 Main Frame Stack。

Session Coordinator 负责入口地图、人物加载、地图切换准备、Loading/Error business state、迟到异步结果、Frame-local cleanup 与 Runtime shutdown cleanup。

内部 Session 与公共 Frame 的映射属于 `loom.map` 自身实现。

## 10. Runtime Execution Loop / Core

Execution Loop 负责串行 Command/Tick/Control Operation、固定 Tick、有界追赶、Effect Barrier 与事务 Snapshot。

Runtime Core 同步、确定性、无 I/O，负责地图/人物状态、移动、碰撞、Portal 与场景切换。

Core 不包含 Main Stack、JSON-RPC、DOM、Hostra 或 physical Transport。

## 11. Render Manager / Projector

`loom.map` 自己拥有 Render Registry / lifecycle，例如 world/hud/loading/debug。

Render 可以 zero Frame 存在，也可以跨 Frame suspended / closed 保持。

Render Manager 不读取 Frame lifecycle 作为隐式 show/hide/destroy 指令；Projector 不因 Activation replacement 做 Render resync。

## 12. 依赖方向

```text
Subsystem Control Adapter
→ Runtime lifecycle coordinator

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

## 13. Tests

至少验证：

- exact seven Batch B methods；
- initialize params = `frameId + input` only；
- no callerFrameId wire dependency；
- active/current Activation only；
- old Activation rejects forever；
- resume delivers result + new Activation together；
- same-Subsystem call returns new childFrameId；
- call 不挂起等待最终 result；
- return 不携带 caller/receiver；
- completed no-value uses `value:null`；
- close params = `frameId` only；
- no `system.call / frame.result / frame.ready`；
- failed outcome still performs closing/closed cleanup；
- Frame suspend/close 不 hide/destroy world/hud Render；
- zero-frame loading/debug Render；
- one Process serves multiple Frames；
- Renderer reload 从 Main 恢复 current Activation，不恢复 cached old Activation。

## 14. Legacy Implementation Notes

旧 `runtime/`、`game-package/` 等目录只作为参考。如果存在 per-Frame mandatory Core/Render、Frame status=failed、Frame ready、Activation reuse、`system.call`、callerFrameId-as-Subsystem-authority、Frame close=Render destroy，必须按当前 Contract 修正或降级为 Legacy。
