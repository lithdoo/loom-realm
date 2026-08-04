# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：第一阶段地图 Subsystem 的内部模块和依赖方向  
> 依赖：[模块子系统模型](../../10-architecture/subsystem-model.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[渲染系统](../../10-architecture/rendering-system.md)  
> 最近复核：2026-08-04

`loom.map` 是第一阶段纵向切片。内部模块不是 LoomRealm 对所有 Subsystem 的公共要求。

## 1. 模块结构

```text
loom.map
├── Subsystem Control Adapter
├── Frame / Call Adapter
│   └── Outbound Mutation Gate
├── Frame Input Adapter
├── Game Catalog / Repositories
├── Session Coordinator
├── Runtime Execution Loop
├── Runtime Core / World State
├── Render Manager
├── Render Projector
└── Pokémon Essentials Compatibility Compiler
```

地图可以共享 world state、Execution Loop 和 Render；平台不要求按 Frame 创建这些对象。

## 2. Frame Context

```ts
interface MapFrameContext {
  readonly frameId: string;
  state: "starting" | "active" | "suspended" | "closing" | "closed";
  currentActivationId: string | null;
}
```

不保存公共 `callerFrameId` authority。Caller relationship 属于 Main；业务如果需要调用来源，显式放在 `frame.initialize.input`。

Frame/Activation identity 不由地图生成或复用。v1 无 Frame ready/status，outcome 与 lifecycle 分离。

## 3. Frozen RPC Adapter

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

不得增加 Caller wire、close reason、`system.call/system.return/frame.result` 或 optional completed.value。

## 4. Outbound Mutation Gate

Batch C 要求 outbound `frame.call / frame.return` pending 时：

```text
stop new ordinary input dispatch for that Frame
block second call
block second return
```

该 gate 是 adapter 内部状态，不是公共 Frame lifecycle。

### call Error

解除 gate；Frame 仍 active；old Activation 仍 current。

### call Success

地图 MUST 立即本地 commit：

```text
Caller Context → suspended
old Activation → permanently revoked
```

不等待 Main 再发送 `frame.suspend`。ordinary call 不使用 reverse suspend。

call success 只表示 logical Child call accepted，不表示 Child 已 active。

### return Error

解除 gate；Frame 仍 active；outcome 尚未接受。

### return Success

地图 MUST 本地 commit：

```text
Frame → closing
old Activation → permanently revoked
terminal outcome accepted
```

但 Frame Context 仍存在，直到收到 Main `frame.close(frameId)`。

## 5. No Reentrant-handler Requirement

Main 保证：

```text
frame.call Response
    before dependent child initialize / activate

frame.return Response
    before dependent close / resume
```

因此地图 Adapter MUST 正确支持 same-Subsystem recursive call，但不需要在当前入站 `frame.call/frame.return` handler 尚 pending 时处理并等待反向 Frame Request。

同一 `loom.map` Process 可以出现：

```text
F1 suspended
F2 suspended
F3 active
```

但每层都必须使用新的 frameId / Activation，并经过 Main Stack transaction。

## 6. Incoming Control Operations

### initialize

建立地图 Frame/Input Context，只接收 `frameId + input`，不代表 active。

### activate

安装 first Activation；收到后 Context 才能处理相应 ordinary input。Main 只有 ACK 后才可向 Renderer 发布该 Activation。

### suspend

只作为 Main 主动 quiesce / terminal preparation 原语；不是 ordinary call establishment step。成功后旧 Activation 永久失效。

### resume

一个不可分割操作：

```text
deliver returned Child FrameOutcome
+
install replacement activationId
```

ACK 后 Main 才可发布 Caller new InputTarget。地图不得把它拆成 resume 后再 activate。

### close

删除 Frame/Input Context，只携带 frameId；不停止 Runtime、不销毁 Render、不清共享 world/cache。

## 7. FrameOutcome

```ts
type FrameOutcome =
  | { type: "completed"; value: JsonValue }
  | { type: "cancelled" }
  | { type: "failed"; error: FrameFailure };
```

无返回值显式：

```json
{ "type": "completed", "value": null }
```

`failed` 是调用 outcome，不是 lifecycle 或 JSON-RPC Error。

## 8. Frame Input Adapter

```text
frameId + activationId
→ locate Context
→ require state == active
→ require activationId == currentActivationId
→ require no outbound mutation gate
→ normalize intent/action
→ submit runtime command
```

revoked Activation 永久拒绝。Batch C transaction gap / pending gate 时不得继续把 ordinary input 派发给业务 Handler；具体 drop/buffer/reset 由 User Input Protocol 冻结。

## 9. Post-commit Failure

如果 call success 后 Child initialize/activate 失败，Caller old Activation 不会恢复。地图最终会通过 `frame.resume` 收到平台 failed outcome + fresh Activation。

如果 return success 后 close/resume 链路失败，地图也不能恢复 returned Frame old Activation 或撤回已经提交的 outcome。

具体 timeout/error code 由 Batch D/E 冻结。

## 10. Frame Lifecycle 与业务状态 / Render

Frame operation 不自动启停 Runtime Loop、创建/隐藏/销毁 Render、删除共享 world state、清 Repository Cache 或创建/关闭 Data Connection。

Render world/hud/loading/debug 完全由地图 Render Manager 控制，可 zero Frame 存在，也可跨 Frame suspend/close 保留。

## 11. Runtime / Repository / Core

Repositories 负责内容加载/解析/缓存；Session Coordinator 负责业务 session、loading/error 和异步 effect；Execution Loop/Core 负责确定性地图状态、移动、碰撞、Portal 与场景切换。

Core 不包含 Main Stack、JSON-RPC、DOM、Hostra 或 physical Transport。

## 12. Tests

至少验证：

```text
exact-seven-rpc-methods
no-caller-wire
completed-null
call-pending-gate
call-error-restores-active-gate-only
call-success-local-suspended-revoked
ordinary-call-no-frame-suspend
same-subsystem-recursive-no-reentrant-handler
return-pending-gate
return-success-local-closing-revoked
close-after-return-response
resume-result-plus-new-activation
resume-ack-before-renderer-publish (integration)
postcommit-call-failure-fresh-resume
postcommit-never-restores-old-activation
stale-activation-rejected
one-process-multi-frame
frame-close-does-not-destroy-render
zero-frame-render
```

## 13. Legacy Notes

旧实现中的 per-Frame mandatory Core/Render、Frame status=failed、Frame ready、Activation reuse、`system.call`、Caller-as-Subsystem-authority、call→reverse-suspend dependency、Frame close=Render destroy 都必须按当前 Contract 修正或降为 Legacy。
