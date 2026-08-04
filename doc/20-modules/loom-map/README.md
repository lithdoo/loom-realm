# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：第一阶段地图 Subsystem 的内部模块和依赖方向  
> 依赖：[模块子系统模型](../../10-architecture/subsystem-model.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[渲染系统](../../10-architecture/rendering-system.md)  
> 最近复核：2026-08-04

`loom.map` 是第一阶段纵向切片。内部模块不是所有 Subsystem 的公共要求。

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
├── Runtime Execution Loop / Core / World State
├── Render Manager / Projector
└── Pokémon Essentials Compatibility Compiler
```

一个 map Runtime可服务多个 Frame，并共享 world/cache/loop/render。

## 2. Frame Context / RPC

```ts
interface MapFrameContext {
  readonly frameId: string;
  state: "starting" | "active" | "suspended" | "closing" | "closed";
  currentActivationId: string | null;
}
```

不保存公共 caller/Stack/recovery authority。Frame/Activation不由地图生成/复用。

RPC exactly seven：initialize/activate/suspend/resume/close/call/return。无 `frame.cancel/frame.abort/frame.unwind`、Caller wire、close reason、`system.call/system.return/frame.result`。

## 3. Mutation Gate / Deadline

outbound call/return pending：stop new ordinary input + block second call/return。

```text
Success
    → suspended/closing local commit
Recoverable Explicit Error
    → release gate
Fatal Explicit Error / timeout/loss
    → no release to old Activation
    → Runtime failure
```

No retry/replay/idempotency journal。

## 4. Incoming Control

`frame.initialize` 可用 `FRAME_INITIALIZE_REJECTED + FrameFailure` 做业务拒绝，Context未 commit且 Runtime healthy。

合法 activate/suspend/resume/close 的 identity/lifecycle/Activation mismatch是 divergence，不私有 resync。

`resume`=Child outcome+replacement Activation；`close`只清该 Frame/Input Context，不停止 Runtime、不删除共享 world/cache/Render。

## 5. Batch E Runtime Failure Boundary

地图 Runtime自身一旦 terminal failed：

```text
MUST NOT 自行选择 suspended map Frame恢复
MUST NOT 恢复旧 Activation
MUST NOT 根据本地 Context决定 Stack unwind
```

Main会按 lowest failed-runtime occurrence计算 whole suffix。如果同一个 map Runtime在 Stack中有：

```text
F1 map suspended
F2 other suspended
F3 map active
```

map Runtime失败时 root必须是最低的 F1，不能只清 F3。

## 6. Healthy Map Runtime 被卷入 Suffix

map Runtime本身健康，但某个 map Frame可能因 ancestor Runtime failure成为 doomed descendant。

Main撤销该 Frame公共 authority并发送一次 `frame.close(frameId)`；Map Adapter删除对应 Frame/Input Context。

Recovery不要求额外 suspend-before-close。`frame.close`必须能完成 terminal cleanup；共享 world/Render是否保留由 map业务设计决定，不能被平台 Frame close强制删除。

## 7. Cleanup Failure

如果健康 map Runtime在 recovery `frame.close` 时 timeout/diverge/protocol-fail，则整个 map Runtime进入 terminal failed。Main会把 map key加入 `failedRuntimeKeys`，若更低 Stack层还有 map Frame，unwind root进一步下移。

Map Adapter不得 retry close或请求 Main“只重做这个 Frame”。

## 8. Outcome / Caller Recovery

已经成功 `frame.return` 的 map Frame outcome在 Return Acceptance后不可被随后 Runtime crash覆盖。

如果 map Runtime作为 final root在没有 accepted outcome时失败，Main给 surviving Caller的结果可能是：

```text
failed(SUBSYSTEM_RUNTIME_FAILED)
```

这不是 map业务错误 code，Map Runtime不自行构造该 platform outcome。

## 9. Frame Input Adapter

```text
frameId + activationId
→ locate Context
→ require active/current Activation
→ require no mutation gate
→ normalize action
→ runtime command
```

revoked Activation永久拒绝。Runtime failure后不重新开启旧 Frame输入。

## 10. FrameOutcome / Cancellation

```text
completed(value)
cancelled
failed(FrameFailure)
```

v1无 caller-driven cancel；`cancelled`只由当前 active map Frame自行 return。

## 11. Frame / Render / Runtime Independence

Frame operation/unwind不自动启停 Runtime Loop、创建/隐藏/销毁 Render、删除共享 world或关闭 Data Connection。Render world/hud/loading/debug由 Render Manager独立控制。

## 12. Tests

至少：

```text
exact-seven-rpc-methods
call-pending-gate
initialize-business-reject
frame-rpc-timeout-no-retry
same-subsystem-recursive-no-reentrant-handler
runtime-failed-does-not-local-resume-lower-map-frame
healthy-doomed-map-frame-close-only
healthy-doomed-close-does-not-destroy-render
close-timeout-fails-map-runtime-and-expands-root
accepted-map-outcome-survives-crash
stale-activation-rejected
zero-frame-render
```

## 13. Legacy Notes

per-Frame mandatory Core/Render、Frame status=failed、Frame ready、Activation reuse、`system.call`、Caller-as-Subsystem-authority、call→reverse-suspend、timeout→retry、caller remote cancel、partial same-runtime unwind、Frame close=Render destroy 都不得恢复。
