# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：第一阶段地图 Subsystem 的内部模块和依赖方向  
> 依赖：[模块子系统模型](../../10-architecture/subsystem-model.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Frame / Call v1 Conformance Profile](../../15-contracts/frame-call-conformance-v1.md)、[渲染系统](../../10-architecture/rendering-system.md)  
> 最近复核：2026-08-05

`loom.map` 是第一阶段纵向切片。内部模块不是所有 Subsystem 的公共要求。

## 1. 模块结构

```text
loom.map
├── Subsystem Control Adapter
├── Frame / Call Adapter
│   ├── Protocol Validator
│   ├── Request ID Allocator
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

Frame / Call Protocol v1 已 Active / Normative / Frozen。

```ts
interface MapFrameContext {
  readonly frameId: string;
  state: "starting" | "active" | "suspended" | "closing" | "closed";
  currentActivationId: string | null;
}
```

不保存公共 caller/Stack/recovery authority。Frame/Activation不由地图生成/复用。

RPC exactly seven：initialize/activate/suspend/resume/close/call/return。无 `frame.cancel/frame.abort/frame.unwind/frame.version/frame.capabilities`、Caller wire、close reason、`system.call/system.return/frame.result`。

## 3. Protocol Validator / Completion Profile

Map Adapter必须通过 SDK复用 Frozen Frame v1 validator：

```text
plain JSON values only
finite binary64 / safe integer
valid Unicode scalar strings
closed schema
message <=1 MiB
JSON depth <=64
business JsonValue <=512 KiB
frameId / activationId <=128 UTF-8 bytes
targetSubsystemKey <=256 UTF-8 bytes
FrameFailure field limits
```

PWA map Worker不得利用 Structured Clone传输 BigInt/ArrayBuffer/MessagePort/Blob作为 Frame value。

## 4. Request ID / Deadline

Outbound `frame.call/frame.return` Request ID：positive safe integer `1..2^53-1`，Control Connection生命周期内不复用。

Map Runtime为 call/return使用 sender-local monotonic deadline profile，每项 `1000..300000ms`，Connection生命周期内稳定，不由地图数据/事件 per-call改变。

## 5. Mutation Gate

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

## 6. Incoming Control

`frame.initialize` 可用 `FRAME_INITIALIZE_REJECTED + FrameFailure` 做业务拒绝，Context未 commit且 Runtime healthy。

合法 activate/suspend/resume/close 的 identity/lifecycle/Activation mismatch是 divergence，不私有 resync。

`resume`=Child outcome+replacement Activation；`close`只清该 Frame/Input Context，不停止 Runtime、不删除共享 world/cache/Render。

## 7. Runtime Failure Boundary

地图 Runtime自身一旦 terminal failed：

```text
MUST NOT 自行选择 suspended map Frame恢复
MUST NOT 恢复旧 Activation
MUST NOT 根据本地 Context决定 Stack unwind
```

Main按 lowest failed-runtime occurrence计算 whole suffix。同一个 map Runtime在 Stack多次出现时 root取最低 occurrence。

## 8. Healthy Map Runtime 被卷入 Suffix

map Runtime健康但某 map Frame因 ancestor failure成为 doomed descendant时，Main撤销该 Frame公共 authority并发送一次 `frame.close(frameId)`；Map Adapter删除对应 Frame/Input Context。

Recovery不要求额外 suspend-before-close。共享 world/Render是否保留由 map业务设计决定。

## 9. Cleanup Failure / Outcome

Recovery close timeout/diverge/protocol-fail使整个 map Runtime terminal failed；Main把 map key加入 failed set并可能下移 root。Map Adapter不得 retry close或请求局部 resync。

已成功 `frame.return` 的 outcome在 Return Acceptance后不可被 Runtime crash覆盖。

Final root无 accepted outcome时 Main可能向 Caller生成 `failed(SUBSYSTEM_RUNTIME_FAILED)`；Map Runtime不自行构造该 platform outcome。

## 10. Frame Input Adapter

```text
frameId + activationId
→ locate Context
→ require active/current Activation
→ require no mutation gate
→ normalize action
→ runtime command
```

revoked Activation永久拒绝。Runtime failure后不重新开启旧 Frame输入。

## 11. FrameOutcome / Cancellation

```text
completed(value)
cancelled
failed(FrameFailure)
```

v1无 caller-driven cancel；`cancelled`只由当前 active map Frame自行 return。

## 12. Version / Transport Boundary

Map Runtime不实现 `frame.hello/version/capabilities`。`subsystem.hello.protocolVersions`只协商 Subsystem Control；Frame v1由 deployment profile静态绑定。

Desktop Node map Runtime使用 WebSocket JSON文本；PWA map Worker使用已建立 Control MessagePort上的 plain JSON-compatible object；应用层必须保持同一 Frame v1行为。

## 13. Frame / Render / Runtime Independence

Frame operation/unwind不自动启停 Runtime Loop、创建/隐藏/销毁 Render、删除共享 world或关闭 Data Connection。Render world/hud/loading/debug由 Render Manager独立控制。

## 14. Tests

除已有 transaction/failure tests外，必须接入 Frame v1 Subsystem conformance：

```text
exact-seven-rpc-methods
call-pending-gate
initialize-business-reject
frame-rpc-timeout-no-retry
same-subsystem-recursive-no-reentrant-handler
runtime-failed-does-not-local-resume-lower-map-frame
healthy-doomed-map-frame-close-only
close-timeout-expands-root
accepted-map-outcome-survives-crash
stale-activation-rejected
oversize-message-rejected
unsafe-json-number-rejected
request-id-reuse-rejected
pwa-non-json-value-rejected
zero-frame-render
```

## 15. Legacy Notes

per-Frame mandatory Core/Render、Frame status=failed、Frame ready、Activation reuse、`system.call`、Caller-as-Subsystem-authority、call→reverse-suspend、timeout→retry、caller remote cancel、partial same-runtime unwind、Frame close=Render destroy、Frame partial-v1 support 都不得恢复。
