# Frame / Call v1 — Runtime Control Profile v2 Binding Clarification

> 层级：正式契约澄清  
> 状态：Frozen Clarification  
> 适用协议：`loomrealm.frame-call / 1`  
> 不修改 Frame wire/version  
> 当前组合：[Runtime Control Application Profile v2](./runtime-control-profile-v2.md)  
> 决策记录：[ADR 0017](../decisions/0017-abandon-subsystem-control-v1.md)  
> 最近复核：2026-08-09

## 1. 目的

[Frame / Call Protocol v1](./frame-call-protocol-v1.md) 在冻结时引用了当时的：

```text
Subsystem Control v1
Runtime Control Application Profile v1
```

作为 enclosing Runtime Control composition。

随后确认 Control v1/Profile v1在任何 conformant implementation前即被废弃。当前唯一 Runtime Control组合已经变为：

```text
Subsystem Control v2
+
Frame / Call v1
=
Runtime Control Application Profile v2
```

本澄清只更新 **enclosing Profile binding**，不修改 Frame / Call v1任何 application semantics。

## 2. Current Binding

当前 conformant Runtime实现：

```text
Control protocol          loomrealm.subsystem-control / 2
Frame protocol            loomrealm.frame-call / 1
Runtime Control Profile   2
```

`subsystem.hello.protocolVersions`只协商 Subsystem Control，并且当前必须支持/选择 version 2。

Frame / Call仍然没有：

```text
frame.hello
frame.version
frame.capabilities
```

Frame version 1由 Runtime Control Profile v2静态绑定。

## 3. Superseded References

Frame / Call v1主文档中出现的以下 enclosing-profile文字：

```text
Subsystem Control Protocol v1
Runtime Control Application Profile v1
```

在解释当前部署/组合时 MUST读取为已被本澄清和 ADR0017替代。

它们只反映 Frame v1冻结时的文档历史，不产生：

```text
Control v1 compatibility requirement
Profile v1 implementation requirement
Control downgrade/fallback
Frame protocol version change
```

## 4. Unchanged Frame v1 Contract

本澄清 **不改变**：

```text
exact seven Frame Requests
Frame identity / lifecycle / outcome
Activation one-shot semantics
call/return transaction barriers
Response-before-dependent-RPC
activate/resume ACK-before-publication
Success / Explicit Error / Ambiguous classification
no retry/replay
Runtime failure lowest-root fixed-point unwind
accepted outcome preservation
fresh surviving Caller resume
Frame JSON model / Request ID rules
message/business payload/identity limits
Frame method deadline profile
Desktop WebSocket / PWA MessagePort application semantics
Frame v1 Conformance fixtures
```

因此：

```text
Frame protocolVersion remains 1
```

## 5. Shared Control Carrier

在 Runtime Control Profile v2下，同一 authenticated Control carrier可以承载：

```text
Subsystem Control v2
    subsystem.hello
    subsystem.status
    subsystem.shutdown

Frame / Call v1
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close
    frame.call
    frame.return
```

同 sender跨两个 protocol domains共享 Connection-lifetime one-shot Request ID namespace；JSON-RPC Batch禁止。

其中 `subsystem.status`仍是 Control Notification，不改变“Frame七方法全部为 Request”的 Frame v1规则。

## 6. Ready Meaning

Frame v1要求目标 Runtime在普通 Frame operation前处于可用 `ready`状态。

当前该 `ready`由 Subsystem Control v2定义：

```json
{"state":"ready"}
```

含义是在 Runtime Control Profile v2下能够完整承担 Frame / Call v1角色。

它不携/暗示：

```text
Renderer Data endpoint
Data Connection existence
DataAuthority
Render Domain
InputTarget
```

## 7. Conformance

现有 [Frame / Call v1 Conformance Profile](./frame-call-conformance-v1.md) 继续有效。

Runtime integration新增/保持：

```text
subsystem-hello-versions-remain-control-only
control-version-2-selected
no-control-v1-fallback
Frame-version-remains-1
hello-before-frame-operation
shared-control-frame-request-id-namespace
no-jsonrpc-batch
```

这些 integration fixtures验证 enclosing Profile，不改变 Frame protocolVersion或 Frame fixture既有语义。

## 8. Final Rule

> **Control协议升级到 v2并不要求 Frame协议升级。当前组合是 Control v2 + Frame v1；旧 Control/Profile v1引用只属于设计历史。**
