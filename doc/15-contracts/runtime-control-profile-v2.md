# Main ⇄ Subsystem Runtime Control Application Profile v2

> 层级：正式契约 / Application Profile  
> 状态：Active / Normative  
> Profile 版本：2  
> 稳定程度：Stabilizing  
> 主要定义：同一 Main ⇄ Subsystem Control Connection 上 Subsystem Control v2 与 Frame / Call v1 的组合、版本绑定和共享 JSON-RPC dispatcher 约束  
> 依赖：[Subsystem Control Protocol v2](./subsystem-control-protocol-v2.md)、[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 决策记录：[ADR 0017：实现前废弃 Control v1](../decisions/0017-abandon-subsystem-control-v1.md)  
> 最近复核：2026-08-09

本文不新增 Runtime/Frame method。它只定义当前 Main ⇄ Subsystem Control application profile 如何组合 Subsystem Control v2 与已经 Frozen 的 Frame / Call v1。

核心原则：

> **Runtime lifecycle 使用 Subsystem Control v2；Frame transaction 使用 Frame / Call v1。共享同一物理 Control Connection 不意味着共享协议版本、状态机或错误语义。Data/Render/User Input 不进入本 Profile。**

## 1. Profile Composition

```text
Runtime Control Application Profile v2
├── Subsystem Control Protocol v2
└── Frame / Call Protocol v1
```

组合版本固定为：

```text
Subsystem Control Protocol = 2
Frame / Call Protocol       = 1
```

Profile 自身不是新的 wire handshake，也不改变任何已有 method schema。

## 2. 与 Profile v1 的关系

Runtime Control Application Profile v1 绑定从未实现的 Subsystem Control v1，因此按 ADR 0017：

```text
Profile v1 = Abandoned Before Implementation
```

当前实现 MUST 使用 Profile v2。

不存在：

```text
Profile v1 fallback
Control v1 compatibility mode
runtime profile downgrade
```

Frame / Call v1 保持原版本；Control major version变化不要求 Frame 同步升级。

## 3. Profile Selection

Profile 由 Host/runtime deployment 在 Launch Attempt / Runtime implementation configuration 中静态选择，不由 Game Package business input、Frame RPC 或 Renderer 动态协商。

v2 没有：

```text
runtime.profile.hello
frame.hello
frame.version
frame.capabilities
```

`subsystem.hello.protocolVersions` 只协商 **Subsystem Control Protocol**。

当前 Profile 下 conformant Runtime MUST advertise/support Control version 2；Main 选择 `2` 后，Frame / Call v1 由 Profile 静态绑定。

## 4. Bootstrap / Ready Meaning

Connection 严格按 Subsystem Control v2 bootstrap：

```text
connect / obtain Control carrier
→ subsystem.hello
→ identified
→ optional initializing
→ ready
```

hello 成功前不得执行 Frame / Call。

在本 Profile 下，Runtime 报告：

```json
{"state":"ready"}
```

表示：

> Runtime required initialization 已完成，并声明能够承担本 Profile 允许的后续 Frame / Call v1 Subsystem 角色。

`ready` 不新增字段，也 MUST NOT 表示：

```text
Renderer Data Connection exists
Data endpoint / MessagePort known
DataAuthority granted
Renderer connected
Frame exists
Render exists
InputTarget exists
Content capability distributed
```

Main implementation 同样必须完整承担 Frame / Call v1 Main 角色。

## 5. Shared Physical Connection

Subsystem Control 与 Frame / Call MAY 复用同一条 authenticated Main ⇄ Subsystem Control Connection：

```text
one Control Connection
├── Subsystem Control v2
│   ├── subsystem.hello
│   ├── subsystem.status
│   └── subsystem.shutdown
└── Frame / Call v1
    ├── frame.initialize
    ├── frame.activate
    ├── frame.suspend
    ├── frame.resume
    ├── frame.close
    ├── frame.call
    └── frame.return
```

Frame method 只在 hello 成功、Connection 已绑定 `descriptor.key` 后合法。

## 6. Application Unit / Batch

本 Profile 固定：

```text
one transport application unit
= exactly one JSON-RPC message object
```

JSON-RPC Batch Array 禁止。

Desktop WebSocket 与 PWA MessagePort binding 都必须保持该 application-message mapping。

## 7. Shared Sender-side Request ID Namespace

由于 JSON-RPC Response 只携带 `id`，同一发送方在同一物理 Control Connection 上的所有 outbound Request MUST 共享一个不会碰撞/复用的 sender-local namespace。

```text
ID type = positive safe integer 1..2^53-1
sender-side Control Connection lifetime never reused
```

适用：

```text
Subsystem → Main
    subsystem.hello
    frame.call
    frame.return

Main → Subsystem
    subsystem.shutdown
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close
```

`subsystem.status` 是 Notification，没有 Request ID。

Main 与 Subsystem 是独立 sender，因此两个方向 MAY 使用相同数值 ID。

实现 SHOULD 使用 connection-wide monotonic allocator；耗尽不得 wrap/reuse。

## 8. Message / JSON Limits

共享 carrier 入口必须满足组成协议中更严格的限制。

基础上界：

```text
max application message <= 1 MiB
max JSON nesting depth  <= 64
plain JSON-compatible values only
closed schema validation
```

Frame message继续满足 Frame / Call v1 的 business JsonValue、identity、deadline 与字段 limits；Control message满足 v2 token/version/error limits。

PWA Structured Clone 不得扩大 Frame 或 Control 的 JSON value model。

## 9. Deadlines Remain Domain-specific

共享 Connection 不意味着共享 timeout policy。

Subsystem Control v2 的 connect/hello/ready/shutdown/termination deadline由 Control/Host policy定义。

Frame / Call v1 七方法继续使用其 Frozen `1,000..300,000ms` sender-local monotonic deadline profile。

不得用 Frame deadline替代 shutdown deadline，也不得把 shutdown escalation套到普通 Frame request。

## 10. Failure Boundary

Subsystem Control failure 与 Frame Control failure都可能让同一 Runtime进入 terminal `failed`，但触发规则由各自协议定义。

Frame / Call v1 的：

```text
FRAME_CONTROL_TIMEOUT
FRAME_CONTROL_DIVERGENCE
FRAME_CONTROL_PROTOCOL_ERROR
```

汇入 Runtime failure后，Stack recovery继续按 Frame v1 Frozen fixed-point unwind语义执行。

Profile 不增加：

```text
retry
replay
resync
same-attempt reconnect
checkpoint
```

## 11. Data Plane Independence

本 Profile MUST NOT 增加或承载：

```text
Renderer Data endpoint discovery
Data bearer ticket
DataAuthority publication
Data Connection handshake
User Input payload
Render Update payload
Content Grant
```

Data authority由 Main ⇄ Renderer Control发布；实际 carrier由 Host/Platform Binding建立；建立后的 identity/lifecycle由 Renderer ⇄ Subsystem Data Connection Contract定义。

因此：

```text
Runtime ready != Data Connection ready
Frame active   != Data Connection required
```

## 12. Transport Bindings

Desktop：

```text
Subsystem Control carrier → localhost WebSocket Host binding
```

PWA：

```text
Subsystem Control carrier → authenticated MessagePort Host binding
```

Host/Platform Profile负责安全建立 carrier，并提供一次 Launch Attempt bootstrap credential；建立后必须遵守相同 Control v2 + Frame v1 application semantics。

## 13. Version Compatibility

Profile v2 固定组合：

```text
Control 2 + Frame 1
```

未来如果需要：

```text
Control 3 + Frame 1
Control 2 + Frame 2
```

或动态 capability/version negotiation，必须发布新的明确 Profile/version；不得静默改变本 Profile。

Control v1 / Profile v1 已实现前废弃，不属于 compatibility matrix。

## 14. Conformance

Main/Subsystem 对 Frame角色的兼容性继续由 [Frame / Call v1 Conformance Profile](./frame-call-conformance-v1.md)验证。

Profile v2 integration至少覆盖：

```text
hello-first-message
control-version-selection-2
hello-before-frame-operation
hello-versions-control-only
ready-has-no-data-endpoint
ready-under-profile-requires-complete-frame-role
shared-sender-id-namespace-across-control-and-frame
no-jsonrpc-batch-on-control-connection
frame-failure-enters-runtime-failed-path
subsystem-shutdown-deadline-remains-distinct-from-frame-deadline
no-control-v1-fallback
no-data-method-in-runtime-control-profile
```

Desktop WebSocket与PWA MessagePort对相同 abstract Control/Frame trace必须产生相同 application-level结果。

## 15. Current Invariants

1. Current Runtime Control Profile = Subsystem Control v2 + Frame / Call v1；
2. Profile v1 已实现前废弃，不参与协商；
3. Profile不新增 wire handshake/method/field；
4. `subsystem.hello.protocolVersions`只协商 Control；
5. Frame version由 Profile静态绑定；
6. hello成功前无 Frame operation；
7. `ready` 不携 Data endpoint，并表示完整 Frame v1角色可用；
8. 同一 sender/Connection的 Control + Frame Request共享 one-shot ID namespace；
9. JSON-RPC Batch禁止；
10. 各协议继续拥有自己的 schema/error/deadline semantics；
11. Data/User Input/Render/Content不进入 Runtime Control Profile；
12. Desktop/PWA bootstrap可以不同，但建立后的 application semantics相同。
