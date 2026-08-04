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
│   ├── Outbound Mutation Gate
│   └── Frame RPC Deadline / Failure Handler
├── Frame Input Adapter
├── Game Catalog / Repositories
├── Session Coordinator
├── Runtime Execution Loop
├── Runtime Core / World State
├── Render Manager / Projector
└── Pokémon Essentials Compatibility Compiler
```

地图可以共享 world state、Execution Loop 和 Render；平台不要求按 Frame 创建这些对象。

## 2. Frame Context / RPC

```ts
interface MapFrameContext {
  readonly frameId: string;
  state: "starting" | "active" | "suspended" | "closing" | "closed";
  currentActivationId: string | null;
}
```

不保存公共 caller authority。Frame/Activation 不由地图生成或复用；v1 无 Frame ready/status。

Frozen RPC exactly seven：initialize/activate/suspend/resume/close/call/return。不得增加 Caller wire、close reason、`system.call/system.return/frame.result/frame.cancel`。

## 3. Outbound Mutation Gate

outbound `frame.call / frame.return` pending 时：stop new ordinary input dispatch + block second call/return。

```text
Success
    call   → local Caller suspended / old Activation revoked
    return → local Frame closing / old Activation revoked

Recoverable Explicit Error
    → release gate
    → current active Frame/Activation remains

Fatal Explicit Error
    → operation known not committed
    → but Runtime is no longer trusted
    → MUST NOT release gate back to normal processing

Timeout / Response loss
    → commit state unknown
    → MUST NOT release gate back to old Activation
    → stop normal Frame processing
    → Runtime failure path
```

因此 `Explicit Error` 不能统一实现成“catch 后解除 gate”。必须先检查 stable semantic error classification。

ordinary call不等待 reverse `frame.suspend`。Main保证 call/return Response先于 dependent reverse RPC，因此 same-Subsystem recursion不要求 reentrant handler。

## 4. Incoming Control Operations

`frame.initialize` 建立 Context；允许业务上通过 `FRAME_INITIALIZE_REJECTED + FrameFailure` 拒绝，表示 Context未 commit、Runtime healthy。

`frame.activate/suspend/resume/close` 对合法 Main state必须成功；identity/lifecycle/Activation mismatch表示 control divergence，不做私有 resync。

`frame.resume` 一次完成 Child Outcome delivery + replacement Activation；`frame.close` 不停止 Runtime、不销毁 Render、不清共享 world/cache。

## 5. FrameOutcome / Cancellation

```ts
type FrameOutcome =
  | { type: "completed"; value: JsonValue }
  | { type: "cancelled" }
  | { type: "failed"; error: FrameFailure };
```

无返回值使用 `{type:"completed", value:null}`。

v1 无 caller-driven cancel；`cancelled` 只表示当前 active Frame 自己 `frame.return({type:"cancelled"})`。

## 6. Batch D Error / Timeout

Map adapter复用 Frame semantic envelope `-32000 + error.data.code`。

Recoverable：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

Control divergence：

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
```

全部 Frame Request有 finite deadline，但具体值来自 SDK/Profile。v1 不 retry/replay，不定义 operationId/idempotency journal。

地图自身发现 outbound call/return timeout、Control Frame divergence 或 protocol error时，停止正常 Frame处理，并通过 Subsystem Control failure path报告：`FRAME_CONTROL_TIMEOUT / FRAME_CONTROL_DIVERGENCE / FRAME_CONTROL_PROTOCOL_ERROR`。

## 7. Frame Input Adapter

```text
frameId + activationId
→ locate Context
→ require active/current Activation
→ require no mutation gate
→ normalize intent/action
→ submit runtime command
```

revoked Activation永久拒绝。timeout或 fatal Error 后不能解除 gate继续旧 input。

## 8. Post-commit Failure

Call Acceptance 已完成后，Caller old Activation永远不能恢复，但后续如何收敛必须区分失败类别：

```text
Child frame.initialize → FRAME_INITIALIZE_REJECTED
    target Runtime healthy
    → Child failed outcome
    → 如果 Caller Runtime仍 healthy，则 Main可用 fresh Activation resume Caller

Child Runtime timeout/divergence/protocol failure
    → target Runtime failed
    → loom.map 不自行猜测 Caller 是否能恢复
    → Batch E 决定受影响 Stack suffix 与 surviving Caller
```

特别是 same-Subsystem recursive call：Caller 与 Child 可能属于同一个已经 failed 的 `loom.map` Runtime，这时 lower Caller **不是** surviving healthy Caller，地图进程不能在本地自行 resume 它。

Return Acceptance 成功后 close/resume链路若发生 Runtime-fatal failure，也不能恢复 returned Frame或撤回 outcome；具体 Stack处理同样由 Batch E定义。

## 9. Runtime Failure Local Behavior

一旦 `loom.map` Runtime 进入 Frame Control terminal failure：

```text
stop ordinary Frame input dispatch
stop new frame.call / frame.return
keep revoked Activation revoked
keep accepted outcome immutable
best-effort local diagnostics / finite cleanup
SHOULD report subsystem.status(failed) if Control still usable
```

地图内部不得：

```text
reinitialize same frameId
retry timed-out Frame RPC
reactivate old Activation
choose a lower local Frame and resume it
infer Stack unwind from its own local Context list
```

Main 是 Stack authority；Batch E 才决定 deterministic unwind。

## 10. Frame / Render / Runtime Independence

Frame operation不自动启停 Runtime Loop、创建/隐藏/销毁 Render、删除共享 world、清 Cache 或创建/关闭 Data Connection。Render world/hud/loading/debug由地图 Render Manager独立控制。

Runtime Frame Control failure也不意味着 Renderer 可以通过 Render/Data reconnect恢复 Frame authority。

## 11. Runtime / Repository / Core

Repositories负责内容加载/缓存；Session Coordinator负责业务 session/loading/error；Execution Loop/Core负责地图状态、移动、碰撞、Portal。Core不包含 Main Stack、JSON-RPC、DOM、Hostra或物理 Transport。

## 12. Tests

至少：

```text
exact-seven-rpc-methods
call-pending-gate
call-success-local-suspended-revoked
return-success-local-closing-revoked
same-subsystem-recursive-no-reentrant-handler
initialize-business-reject
initialize-reject-runtime-healthy
frame-rpc-timeout-no-retry
call-timeout-gate-not-released
return-timeout-gate-not-released
fatal-explicit-error-gate-not-released-to-normal-processing
late-response-does-not-recover
frame-state-divergence-runtime-failure
activation-divergence-runtime-failure
same-subsystem-runtime-failure-does-not-local-resume-lower-frame
callee-return-cancelled
stale-activation-rejected
frame-close-does-not-destroy-render
zero-frame-render
```

## 13. Legacy Notes

旧实现中的 per-Frame mandatory Core/Render、Frame status=failed、Frame ready、Activation reuse、`system.call`、Caller-as-Subsystem-authority、call→reverse-suspend、timeout→retry、Explicit Error统一解除 gate、failed Runtime本地恢复 lower Frame、caller remote cancel、Frame close=Render destroy 都必须按当前 Contract 修正或降为 Legacy。
