# ADR 0015：冻结 Frame / Call Protocol v1 Batch F

> 状态：Accepted；**原 §5/§7 的 PWA structured-object transport mapping 已由 [ADR 0018](./0018-preimplementation-v1-closure.md) 在首次实现前直接修正**  
> 日期：2026-08-05  
> 决策范围：Frame / Call Protocol v1 limits、deadline、transport/version binding、conformance completion  
> 当前规范：[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)、[Conformance v1](../15-contracts/frame-call-conformance-v1.md)

## 背景

Batch A-E 已冻结 Frame identity/lifecycle/Activation、七方法、transaction/commit barrier、error/timeout/no-retry 与 Runtime failure fixed-point unwind。Batch F补齐 wire limits、deadline、transport/version binding 与 executable conformance。

这些核心冻结结论继续有效。

---

## 1. Protocol Identity / Exact Surface

```text
loomrealm.frame-call / 1
```

Exactly seven JSON-RPC Requests：

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

不新增 frame hello/version/capability/cancel/abort/unwind/sync。

---

## 2. Request ID

```text
positive safe integer 1..2^53-1
sender-local
same Control Connection lifetime never reused
Control+Frame same sender avoids collision
no wrap/reuse
```

Request ID只做 correlation，不是 operation/idempotency identity。

---

## 3. JSON / Limits

Frame只接受 plain JSON-compatible values；禁止 Structured Clone扩展类型。

当前主协议冻结：

```text
max application message              1 MiB UTF-8 JSON text
max JSON container depth             64
max standalone business JsonValue    512 KiB compact JSON
max JsonValue string                 256 KiB UTF-8
max object key                       256 UTF-8 bytes
max array elements                   16,384
max object members                   16,384
frameId / activationId               1..128 UTF-8 bytes
targetSubsystemKey                   1..256 UTF-8 bytes
FrameFailure.code                    1..128 ASCII
FrameFailure.message                 0..4096 UTF-8 bytes
```

Number finite；integer safe；strings有效 Unicode scalar sequence。

---

## 4. Deadline

七个 Request由发送角色使用 finite sender-local monotonic deadline：

```text
1000..300000 ms
integer
stable for one Control Connection
not in RPC params
not business/Game Package controlled
```

Timeout仍是：

```text
ambiguous → Runtime failure → no retry
```

---

## 5. Current Transport Mapping

ADR 0015最初为了“Desktop/PWA application model一致”禁止 Structured Clone扩大 Frame值域，这个目标仍有效；但最初选择的 PWA `postMessage(plain object)` 仍留下“双 carrier representation / reference compact size”的不必要复杂度。

首次实现前，经 ADR 0018直接把当前 v1收敛为：

```text
one carrier application unit
= one UTF-8 JSON text string
= one JSON-RPC message object
```

因此：

```text
Desktop WebSocket
    one text message = one JSON text application unit

PWA MessagePort
    postMessage(string) = one JSON text application unit
```

所有平台直接对实际 UTF-8 JSON text执行相同 hard cap；不再存在 PWA object/reference-equivalent独立计量模型。

Structured Clone仍只用于 Platform bootstrap/Port transfer。

这是 ADR 0018记录的**一次性 preimplementation v1 correction**，不是允许未来任意修改 Frozen v1。

---

## 6. Version Binding

`subsystem.hello.protocolVersions`只协商 Subsystem Control。

Frame版本由 Runtime Control Application Profile静态绑定；v1无 Frame hello/downgrade/partial capability negotiation。

Runtime `ready` 表示完整支持其角色所需 Frame v1。

---

## 7. Conformance

正式兼容声明：

```text
Frame / Call v1 Main Conformant
Frame / Call v1 Subsystem Conformant
Frame / Call v1 Transport Adapter Conformant
```

必须通过当前 applicable fixtureSetRevision，并记录 revision。

2026-08-19 transport reset要求新的 fixture revision验证：

```text
WebSocket text
MessagePort postMessage(string)
same actual UTF-8 byte limits
same Frame authority/outcome/failure trace
```

旧 object-carrier fixture revision不能代表 current v1 transport conformance。

---

## 8. 明确未改变

ADR 0018 transport reset **不改变**：

```text
Frame identity/lifecycle/Activation
seven methods/fields/FrameOutcome
acceptance/commit/publication barriers
Success/Error/Ambiguous classification
no retry
administrative vs child-call suspension
failed-set/lowest-root/fixed-point unwind
outcome preservation
Render/Data/Runtime lifecycle independence
finite deadlines
```

这些继续 Frozen。

---

## 9. Future Change Rule

ADR 0018的特例只因为当前没有 conformant deployed v1兼容义务。

从当前 first implementation baseline起，以下变化重新需要正式版本/冻结治理：

```text
method/field/schema
identity ownership
commit/causal ordering
error/timeout/no-retry
failure unwind
Outcome semantics
limits
current JSON-text application mapping
```

纯澄清、bug fix、或新增验证当前语义的 fixture可只提升 fixtureSetRevision。

---

## 10. Result

Frame / Call v1仍是 Active / Normative / Frozen；A-F只做设计溯源。当前唯一可实现/可测试的 v1 transport baseline是 Runtime Control Profile规定的 UTF-8 JSON text carrier model。