# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem 的职责、Frame/Input 适配、mutation gate、协议校验、错误收敛与 Runtime failure unwind 边界  
> 依赖：[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)  
> 下层契约：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-05

## 1. Subsystem 职责

Subsystem 负责自身业务状态、Frame/Input Context、ordinary User Input 校验、Render Context、Content Client 与 Frame / Call adapter。平台不要求 per-Frame Core/Render/Tick。

Frame / Call Protocol v1 已 Active / Normative / Frozen。

## 2. Authority Boundary

```text
Main
    Runtime Registry
    Frame identity / caller / lifecycle / outcome
    Stack / transaction / Runtime-failure unwind
    Activation / InputTarget
    Frame error classification

Subsystem Runtime
    business state
    Frame/Input Context
    Frame Protocol Validator
    outbound Request ID allocator
    outbound call/return mutation gate
    local deadline/failure handling
    Render Registry / Render State

Renderer
    Main committed control-state mirror
    Data Connection / Frame Input / Render presentation
```

Subsystem不得创建公共 frameId/activationId、修改 Main Stack/Caller、维护第二份公共 recovery authority或从本地决定 lower Frame resume。

## 3. Frozen Frame Model / RPC

```text
lifecycle = starting / active / suspended / closing / closed
outcome   = completed / cancelled / failed
Activation = one-shot / never reused / never rolled back
```

RPC exactly seven：

```text
Main → Subsystem
    initialize / activate / suspend / resume / close
Subsystem → Main
    call / return
```

无 `frame.cancel/frame.abort/frame.unwind/frame.version/frame.capabilities`、Caller wire、close reason、`system.call/system.return/frame.result`。

## 4. Outbound Protocol Validation

Subsystem SDK在发送 `frame.call / frame.return` 前 MUST执行与 Main相同的 v1 validator：

```text
plain JSON values only
finite binary64 / safe integer
valid Unicode scalar strings
closed schema
message <=1 MiB
JSON depth <=64
business JsonValue <=512 KiB
identity/failure field limits
```

PWA Runtime不得借 Structured Clone传 BigInt/ArrayBuffer/MessagePort/Blob等非 Frame JSON value。

## 5. Request ID / Deadline

Subsystem outbound JSON-RPC Request ID：positive safe integer `1..2^53-1`，同一 Control Connection生命周期内不得复用。与 Main outbound namespace独立。

Subsystem为 `frame.call/frame.return`选择 connection-stable sender-local deadline，整数 `1000..300000ms`，使用 monotonic clock；不得由 Game Package/business input per-call覆盖。

## 6. Mutation Gate

Subsystem outbound `frame.call / frame.return` pending 时停止新的 ordinary input dispatch并阻止第二个 call/return。

```text
Success
    → commit corresponding suspended/closing local state

Recoverable Explicit Error
    → release gate / current active Activation remains

Fatal Explicit Error or timeout/loss
    → MUST NOT release back to old Activation
    → Runtime failure path
```

`Explicit Error=no-commit` 不等于 recoverable。

## 7. Incoming Frame Control

`frame.initialize` 可用 `FRAME_INITIALIZE_REJECTED + FrameFailure` 做合法业务拒绝，表示 Context未 commit且 Runtime healthy。

合法 `activate/suspend/resume/close` 的 identity/lifecycle/Activation mismatch 是 control divergence，不做私有 resync。

`resume` 同时交付 Child Outcome + replacement Activation；`close` 不停止 Runtime、不清共享业务状态、不销毁 Render。

## 8. Runtime Failure Trigger

Subsystem自身 `frame.call/return` timeout、Control divergence 或 protocol error时：

```text
stop normal Frame processing
keep ambiguous mutation gate closed
report subsystem.status(failed) when Control is usable
```

诊断至少：`FRAME_CONTROL_TIMEOUT / FRAME_CONTROL_DIVERGENCE / FRAME_CONTROL_PROTOCOL_ERROR`。No retry/replay/idempotency journal。

## 9. Subsystem 不拥有 Unwind

Runtime failure后 Stack如何收敛完全由 Main决定。

Subsystem MUST NOT：

```text
自行选择 lower Frame active
自行恢复旧 Activation
自行逐层 resume suspended Frame
根据本地 Context猜测 unwind root
```

same-Subsystem recursion下 Runtime一旦 terminal failed，所有该 Runtime Frame都由 Main lowest-root/fixed-point authority处理。

## 10. Healthy Runtime 被卷入 Suffix

Runtime健康但其 Frame因为 ancestor failure成为 doomed descendant时，Main会撤销公共 authority并发送 `frame.close`。Subsystem按普通 close删除对应 Frame/Input Context；Render/shared business state不由 Frame close隐式删除。

Recovery不要求额外 `frame.suspend`。

## 11. Failed Runtime / Late Response

Runtime terminal failed后 MUST NOT发起新的正常 Frame operation。Main也不依赖新的 normal Frame RPC清理该 Runtime上的 Frame。

Runtime failed后迟到 Frame Response不恢复状态。Runtime仍 healthy但 Frame已 doomed时，既有 Request成功也不意味着 Activation会被 Main发布；Subsystem必须以 Main后续 control为准。

## 12. Outcome / Ordinary Input

已成功 `frame.return` 的 terminal outcome不会因为 Runtime随后 crash而被覆盖。

root Frame无 accepted outcome时，Main可能生成 `FrameOutcome.failed.error.code=SUBSYSTEM_RUNTIME_FAILED` 给 surviving Caller。

ordinary input router：

```text
input
→ locate frameId
→ require local Context active/current Activation
→ require no mutation gate
→ dispatch business Handler
```

revoked/old Activation永久拒绝。

## 13. Transport / Version Boundary

Desktop Runtime使用 WebSocket JSON文本；PWA Runtime在 Control Port建立后使用 plain JSON-compatible `postMessage` object。两者必须共享 Frame validator、limits、Request ID与deadline semantics。

Frame v1无独立 `frame.hello/version/capabilities`；`subsystem.hello.protocolVersions`只协商 Subsystem Control。Runtime在声明 Frame v1的 deployment profile下 ready意味着完整支持其 v1角色。

## 14. Conformance

Subsystem SDK实现必须通过 [Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md) 中 subsystem角色适用 fixtures，才能声明 `Frame / Call v1 Subsystem Conformant`。

## 15. Cancellation / Render Boundary

v1无 caller-driven `frame.cancel`；`cancelled`只由 active Frame自行 return。

Frame close/unwind不隐式 create/hide/destroy Render，也不决定 Data Connection lifecycle。

## 16. 架构不变量

1. Frame/Stack/Activation/recovery authority=Main；
2. Subsystem无第二份 Caller/Stack/unwind authority；
3. exactly seven RPC；
4. call/return pending有 mutation gate；
5. timeout/ambiguous不释放旧 Activation、不 retry；
6. initialize business rejection可恢复；divergence/protocol fatal；
7. terminal failed Runtime不尝试本地 Frame recovery；
8. shared JSON/ID/limits/deadline profile；
9. no Frame handshake/downgrade/partial support claim；
10. healthy doomed Frame接受 Main `frame.close` cleanup；
11. accepted outcome不因 Runtime crash改变；
12. no caller cancel / no abort-unwind wire；
13. Frame lifecycle不控制 Render/Data/Runtime lifecycle。
