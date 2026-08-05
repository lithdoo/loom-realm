# ADR 0015：冻结 Frame / Call Protocol v1 Batch F

> 状态：Accepted  
> 日期：2026-08-05  
> 决策范围：Frame / Call Protocol v1 limits、deadline profile、transport mapping、version binding 与 conformance completion

## 背景

Batch A-E 已冻结 Frame identity/lifecycle/Activation、七方法 wire、正常 transaction/commit barrier、error/timeout/no-retry 与 Runtime failure fixed-point unwind。

剩余风险不再来自业务语义，而来自不同实现对“同一个 v1”的边界理解不一致，例如：

- Desktop WebSocket 与 PWA MessagePort 接受不同的数据类型或消息大小；
- timeout deadline 没有统一约束，甚至可能被配置为无限；
- JSON-RPC Request ID 重用导致 timeout 后迟到 Response 与新 Request 冲突；
- PWA Structured Clone 扩大 Frame / Call 的数据类型；
- Runtime 声称支持 v1，但只实现部分 RPC / failure behavior；
- `subsystem.hello.protocolVersions` 被错误扩展成 Frame version negotiation；
- “Batch A-E compatible” 被当成正式 v1 兼容声明。

Batch F 必须在不改变 A-E 语义的前提下完成协议封口。

## 决策

### 1. 整体协议状态

Batch F 冻结后：

```text
Frame / Call Protocol v1
    Status: Active / Normative
    Stability: Frozen
    Protocol version: 1
```

Batch A-F 只保留为设计溯源，不是独立兼容等级。

### 2. Protocol identity 与 exact surface

正式协议 identity：

```text
loomrealm.frame-call / 1
```

v1 仍 exactly seven JSON-RPC 2.0 Requests：

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

不新增 `frame.hello / frame.version / frame.capabilities / frame.cancel / frame.abort / frame.unwind / frame.sync`。

### 3. JSON / Request ID profile

Frame / Call v1：

- 不使用 JSON-RPC Batch；
- Request ID 必须是 `1..2^53-1` 的正安全整数；
- 同一发送方在同一 Control Connection 生命周期内不得复用任何 outbound JSON-RPC Request ID；
- 两个方向的 ID namespace 相互独立；
- Frame / Call 与 Subsystem Control 共享一条 Connection 时，同一发送方不得产生 pending ID collision，推荐 connection-wide monotonic allocator。

Request ID 只做 correlation，不是 operationId / idempotency key。

### 4. JSON model 与 wire limits

Frame / Call 仍只接受 plain JSON value。PWA Structured Clone 不得引入 BigInt、ArrayBuffer、MessagePort、Blob 或其他 Host object。

统一限制：

```text
max application message                 1 MiB UTF-8 compact JSON equivalent
max JSON container nesting depth        64
max standalone business JsonValue       512 KiB compact JSON equivalent
max JsonValue string                    256 KiB UTF-8
max JSON object key                     256 UTF-8 bytes
max array elements                      16,384
max object members                      16,384
frameId                                 1..128 UTF-8 bytes
activationId                            1..128 UTF-8 bytes
targetSubsystemKey                      1..256 UTF-8 bytes
FrameFailure.code                       1..128 ASCII chars
FrameFailure.message                    0..4096 UTF-8 bytes
```

JSON number 必须 finite IEEE-754 binary64；整数值必须在 JavaScript safe-integer 范围。Decoded string 必须是合法 Unicode scalar sequence；比较不做 Unicode normalization / locale folding。

### 5. Reference Compact JSON Encoding

为了让 WebSocket 与 MessagePort 使用相同 size limit，v1 定义 reference compact JSON encoding：plain validated JSON value → 无 BOM、无多余空白的 compact JSON → UTF-8。

PWA 即使不实际 stringify，也必须按同一 reference encoding 判断 message/payload size。

### 6. Deadline profile

七个 Frame Request 都必须使用 sender-local finite monotonic deadline。

每个 endpoint 在一条 Control Connection 上选择一组：

```ts
interface FrameCallDeadlineProfileV1 {
  readonly initializeMs: number;
  readonly activateMs: number;
  readonly suspendMs: number;
  readonly resumeMs: number;
  readonly closeMs: number;
  readonly callMs: number;
  readonly returnMs: number;
}
```

每项是 `1,000..300,000` ms 整数。值在 Connection 生命周期内稳定，不进入 RPC params、不由 Game Package / business input覆盖、不进行 per-request negotiation。

具体值可以因 Host/Profile 不同而不同；Batch D 的 `timeout → ambiguous → Runtime failure / no retry` 语义不可改变。

### 7. Transport mapping

Desktop：one complete WebSocket text message = one JSON-RPC application message。

PWA：在 Control MessagePort 已由独立 PWA Bootstrap/Control Profile 建立后，one `postMessage` plain JSON-compatible object = one JSON-RPC application message；Frame / Call message不得依赖 Transferable。

两个 adapter 必须保持相同 Schema、limits、ordering、deadline/failure semantics 和 A-E golden trace；Transport 不得 batch/coalesce/retry/replay Frame operation。

### 8. Version binding

`subsystem.hello.protocolVersions` 继续只协商 Subsystem Control Protocol，不改变 ADR 0009 / Subsystem Control v1。

Frame / Call v1 不增加独立 runtime handshake。Frame version 由部署/Host Runtime Control Profile 静态绑定；在声明使用 Frame / Call v1 的 Profile 中，Runtime `ready` 表示它完整支持自己角色所需的 v1，而不是“部分方法兼容”。

v1 不支持 Frame version runtime downgrade。未来动态多协议协商必须通过新的 enclosing Profile 或新的 Subsystem Control 版本显式引入。

### 9. Conformance

发布独立 [Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)，冻结：

- fixture format / protocol identity；
- normalized authority state；
- fault injection vocabulary；
- A-F required fixture catalog；
- Desktop/PWA transport equivalence；
- conformance claim规则。

只有通过全部适用 v1 fixture 的实现才能声明：

```text
Frame / Call v1 Main Conformant
Frame / Call v1 Subsystem Conformant
Frame / Call v1 Transport Adapter Conformant
```

不允许“v1 except recovery”“Batch C compatible”等正式部分兼容声明。

Fixture coverage revision 可以增长而不改变 protocol version，只要新增 fixture 只验证已经冻结的 v1 语义。

## 结果

- Frame / Call v1 从 Draft 转为 Active / Normative / Frozen；
- A-F 不再作为独立兼容等级；
- Desktop/PWA 的差异只剩 carrier/bootstrap，不再允许应用层差异；
- Message/JSON/ID/deadline边界可被统一实现和测试；
- Frame version 不污染 Subsystem Control v1 hello；
- 协议兼容性可以通过统一 fixture/golden trace 判定。

## 明确未改变

ADR 0015 不改变：

- A 的 identity/lifecycle/Activation；
- B 的七方法、字段与 FrameOutcome；
- C 的 acceptance/commit/publication barrier；
- D 的 Success/Error/Ambiguous、no-retry 与 cancellation scope；
- E 的 failed-set/lowest-root/fixed-point unwind；
- Render/Data/Runtime lifecycle independence。

## 未来变更规则

以下变化属于 Frame / Call v2 或新的明确兼容版本：

- 增删/重命名 Frame method 或字段；
- 改变字段语义/identity ownership；
- 改变 commit point / causal ordering；
- 改变 timeout/no-retry 或 error classification；
- 改变 failure unwind root/outcome preservation；
- 让当前 invalid v1 wire变成有不同语义的扩展 wire。

纯文档澄清、实现修复、或新增验证既有语义的 fixture 不要求提升协议版本。
