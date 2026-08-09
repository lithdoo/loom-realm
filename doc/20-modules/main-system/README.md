# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：LoomRealm Main 内部模块边界、Runtime Control、Frame transaction/error/recovery/conformance coordinator 与 Runtime supervision  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Subsystem Control v1](../../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Frame / Call v1 Conformance](../../15-contracts/frame-call-conformance-v1.md)  
> 最近复核：2026-08-09

## 1. 建议模块

```text
Main System
├── Game Package Bootstrap
├── Subsystem Descriptor Registry
├── Launcher Target Resolver / Dispatcher
├── Launch Attempt Registry
├── Runtime Container Registry
├── Runtime Supervisor
├── Control Connection Registry
├── Control Request ID Allocator
├── Frame Registry / Activation Registry
├── Frame Stack / Mutation Coordinator
├── Frame Protocol Validator
├── Frame RPC Deadline / Failure Classifier
├── Runtime Failure Unwind Coordinator
├── Renderer Control Publisher
├── DataAuthority Registry
└── Content Access Authority / Bootstrap integration
```

## 2. Runtime Bootstrap / Control

Game Package Bootstrap在任何 Runtime side effect前完成 Descriptor/Entry/env校验。Desktop Launcher使用 Host-selected Node、`shell=false`、固定 cwd、显式 child environment。

当前 Runtime Control：

```text
Subsystem Control v1
+
Frame / Call v1
=
Runtime Control Application Profile v1
```

Control职责：

```text
subsystem.hello
subsystem.status
subsystem.shutdown
connection-bound descriptor.key
Main shutdown intent
terminal Runtime failure
```

```text
spawn success != connected != identified != ready
ready != Data Connection exists
```

`ready`不携 Renderer Data endpoint。

## 3. Frame / Activation Registry

Frame Registry保证：frameId never reused、subsystemKey permanent、caller immutable、只有 active Frame有 current Activation、outcome/lifecycle分离。

Main是 Activation唯一签发方。每次 activate/resume使用 fresh Activation；离开 active即 revoke；revoked never valid again。

Failure barrier后到达的 late activate/resume Success对应 Activation视为已消耗，但不得 publish/reuse。

## 4. Frame RPC Adapter

Frozen wire：

```text
Main → Subsystem
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close

Subsystem → Main
    frame.call
    frame.return
```

不得增加 `frame.cancel/frame.abort/frame.unwind/frame.version/frame.capabilities` 等私有方法。

## 5. Shared Control Dispatcher

Runtime Control Profile v1允许同一 authenticated carrier承载：

```text
Subsystem Control v1
Frame / Call v1
```

要求：

```text
one transport unit = one JSON-RPC message
no JSON-RPC Batch
hello success before Frame operation
shared sender-side Request ID namespace
```

`subsystem.hello.protocolVersions`选择 Control version 1；Frame v1静态绑定。

## 6. Request ID / Validation

同一发送方/Control Connection上所有 Control+Frame outbound Request共享：

```text
positive safe integer 1..2^53-1
Connection lifetime never reused
```

Frame message进入 transaction logic前验证：

```text
plain JSON model
closed schema
valid Unicode scalar strings
finite number / safe integer
message <= 1 MiB
JSON depth <= 64
business JsonValue <= 512 KiB
identity/failure limits
```

PWA Structured Clone与Desktop parsed JSON进入同一 semantic validator。

## 7. Stack Mutation Coordinator

normal transaction与 Runtime failure recovery共用单一 serial coordinator。

```text
Initial:
initialize ACK → activate(fresh A0) ACK → publish

Call:
Call Acceptance Commit
→ call Success
→ Child initialize/activate
→ activate ACK → publish

Return:
Return Acceptance Commit
→ return Success
→ close ACK/pop
→ resume Caller(fresh Activation) ACK → publish
```

Response-before-dependent-RPC；ACK-before-publication。

## 8. Deadline / Failure Classifier

Frame Request deadline使用 Frozen v1 `1,000..300,000ms` sender-local monotonic profile。

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous
```

Recoverable与 Runtime-fatal错误按 Frame v1分类。No retry/replay/idempotency journal；Late Response不恢复 terminal failure。

## 9. Runtime Failure Unwind Coordinator

```text
failedRuntimeKeys: Set<descriptor.key>
```

算法：

```text
root = lowest live Frame owned by failedRuntimeKeys
→ Failure Unwind Barrier
→ affected = root..top
→ cleanup Top→Bottom
→ cleanup new failure? add key / recompute root
→ final healthy Caller fresh resume or Stack empty
```

不得只删除 failed Runtime自己的最近 Frame。

Failed Runtime Frame直接 revoke authority→closing→closed→remove，不依赖 normal Frame RPC ACK。

Healthy doomed Frame：remote Context存在则发送一次 `frame.close`；已有 close pending不 duplicate；cleanup failure扩大 failed set/root。

Accepted outcome永远保留；final root无 outcome时生成 `SUBSYSTEM_RUNTIME_FAILED`。

## 10. Renderer Control Publisher

Publisher只发布 Main已 commit state：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority
```

Failure recovery期间可长期 `InputTarget=null`；只有 recovery resume ACK后才发布新 target。

Renderer Control Snapshot不携：

```text
Data endpoint / ticket / MessagePort
Render State
Content Grant
```

## 11. DataAuthority Registry

```text
DataAuthority {
    subsystemKey,
    generation,
    connectionProfile
}
```

DataAuthority不是 credential，也不证明 Data carrier已经建立。

Main负责 generation replacement/revocation；Desktop/PWA carrier establishment属于 Host/Platform Binding。

```text
Runtime ready != DataAuthority necessarily present
DataAuthority present != carrier established
Data loss != Runtime failure / Frame unwind
```

## 12. Desktop / PWA Boundary

Desktop Runtime Control：localhost WebSocket。

PWA Runtime Control：authenticated MessagePort。

建立后都使用 Control v1 + Frame v1相同 application semantics。

Transport adapter不得：

```text
JSON-RPC Batch
Frame retry/replay
改变 ID/limit/deadline validation
选择 unwind root
通过 Data reconnect修复 Frame authority
```

## 13. Version / Profile Binding

```text
Subsystem Control version = 1
Frame / Call version       = 1
Runtime Control Profile    = 1
```

三个版本空间独立，只是当前恰好均为 1。

Main不期待 `frame.hello/version/capabilities`。

## 14. Conformance

Main实现至少需要：

- Subsystem Control v1 fixtures；
- Runtime Control Profile v1 integration fixtures；
- [Frame / Call v1 Conformance](../../15-contracts/frame-call-conformance-v1.md) Main角色 fixtures；
- Renderer Control / Data Connection适用 conformance。

协议文档完成不等于实现 conformant；必须由 executable fixtures证明。

## 15. Render / User Input Boundary

Main不拥有 Render Domain State，也不代理 ordinary User Input / Render Update业务消息。

Main只拥有：

```text
InputTarget / Activation
DataAuthority
```

User Input由 Renderer Core执行 sender-side target gate；Render Domain lifecycle完全由 Subsystem控制。

## 16. 核心不变量

- Runtime Control=Control v1 + Frame v1；
- ready不携Data endpoint；
- Frame / Call v1整体 Frozen；
- exact seven Frame Requests；
- Stack mutation serial；
- Response-before-dependent-RPC；ACK-before-publication；
- revoked Activation永久失效；accepted outcome不可撤销；
- ambiguous/divergence/protocol error Runtime-fatal/no retry；
- Runtime failure lowest-root whole-suffix fixed-point unwind；
- shared Control+Frame sender-side Request ID namespace；
- DataAuthority与Data carrier/bootstrap分离；
- Data loss不等于 Runtime/Frame failure；
- Main不拥有 Render Domain lifecycle/state。
